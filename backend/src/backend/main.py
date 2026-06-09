import asyncio
import logging
import os
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from websockets.exceptions import ConnectionClosed

from deepgram import DeepgramClient
from deepgram.core.events import EventType
from deepgram.agent.v1.types import (
    AgentV1Settings,
    AgentV1SettingsAgent,
    AgentV1SettingsAgentListen,
    AgentV1SettingsAgentListenProvider_V1,
    AgentV1SettingsAudio,
    AgentV1SettingsAudioInput,
)

from backend.audio.capture import AudioCapture
from backend.llm.prompt import get_system_prompt, save_custom_prompt, delete_custom_prompt, get_active_prompt_info
from backend.ws_manager import ConnectionManager

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Interview Responder Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ws_manager = ConnectionManager()


def build_agent_settings(language: str = "es") -> AgentV1Settings:
    return AgentV1Settings(
        audio=AgentV1SettingsAudio(
            input=AgentV1SettingsAudioInput(encoding="linear16", sample_rate=16000),
        ),
        agent=AgentV1SettingsAgent(
            listen=AgentV1SettingsAgentListen(
                provider=AgentV1SettingsAgentListenProvider_V1(
                    type="deepgram",
                    model="nova-3",
                    language=language,
                    smart_format=True,
                    endpointing=1500,
                )
            ),
        ),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "connections": ws_manager.active_count}


class PromptRequest(BaseModel):
    language: str
    prompt: str


@app.get("/prompt")
async def get_prompt(language: str = "es"):
    if language not in ("es", "en"):
        language = "es"
    return get_active_prompt_info(language)


@app.post("/prompt")
async def set_prompt(req: PromptRequest):
    if req.language not in ("es", "en"):
        return {"success": False, "error": "Invalid language"}
    if not req.prompt.strip():
        return {"success": False, "error": "Prompt cannot be empty"}
    success = save_custom_prompt(req.language, req.prompt)
    return {"success": success}


@app.delete("/prompt")
async def clear_prompt(language: str = "es"):
    if language not in ("es", "en"):
        language = "es"
    delete_custom_prompt(language)
    return {"success": True}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    session_id = str(uuid.uuid4())[:8]
    await ws_manager.connect(session_id, websocket)
    await ws_manager.send_status(session_id, "connected")

    loop = asyncio.get_running_loop()
    agent_ready = threading.Event()
    agent_conn: list[object] = [None]
    agent_ctx: list[object] = [None]
    session_language: list[str] = [websocket.query_params.get("lang", "es")]
    if session_language[0] not in ("es", "en"):
        session_language[0] = "es"

    conversation_history: list[dict[str, str]] = [
        {"role": "system", "content": get_system_prompt(session_language[0])}
    ]
    logger.info(f"Session {session_id} initialized with language '{session_language[0]}'")
    logger.info(f"System prompt for session: {conversation_history[0]['content'][:150]}...")

    nvidia_client = AsyncOpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=os.getenv("NVIDIA_API_KEY"),
    )

    async def stream_nvidia_response(user_message: str, sid: str) -> None:
        conversation_history.append({"role": "user", "content": user_message})
        await ws_manager.send_status(sid, "thinking")

        logger.info(f"Sending to NVIDIA model. System prompt: {conversation_history[0]['content'][:150]}...")
        logger.info(f"User message: {user_message[:100]}...")

        response_text = ""
        first_chunk = True

        try:
            completion = await nvidia_client.chat.completions.create(
                model="google/gemma-3n-e4b-it",
                messages=conversation_history,
                temperature=0.20,
                top_p=0.70,
                max_tokens=512,
                frequency_penalty=0.00,
                presence_penalty=0.00,
                stream=True,
            )
            async for chunk in completion:
                if not getattr(chunk, "choices", None):
                    continue
                content = chunk.choices[0].delta.content
                if content:
                    if first_chunk:
                        await ws_manager.send_status(sid, "responding")
                        first_chunk = False
                    response_text += content
                    await ws_manager.send_response_chunk(sid, content)

            conversation_history.append({"role": "assistant", "content": response_text})
        except Exception as e:
            await ws_manager.send_error(sid, str(e))

        await ws_manager.send_status(sid, "listening")

    def on_agent_message(result) -> None:
        msg_type = getattr(result, "type", None)

        if msg_type == "SettingsApplied":
            agent_ready.set()
        elif msg_type == "UserStartedSpeaking":
            asyncio.run_coroutine_threadsafe(
                ws_manager.send_status(session_id, "listening"), loop
            )
        elif msg_type == "ConversationText":
            role = getattr(result, "role", None)
            content = getattr(result, "content", "")
            if not content:
                return
            if role == "user":
                asyncio.run_coroutine_threadsafe(
                    _on_user_text(session_id, content), loop
                )
        elif msg_type == "Error":
            desc = getattr(result, "description", str(result))
            asyncio.run_coroutine_threadsafe(
                ws_manager.send_error(session_id, desc), loop
            )
        elif msg_type == "Warning":
            pass

    async def _on_user_text(sid: str, text: str) -> None:
        await ws_manager.send_transcription(sid, text)
        await stream_nvidia_response(text, sid)

    def _start_agent_thread() -> None:
        api_key = os.getenv("DEEPGRAM_API_KEY")
        if not api_key:
            return

        client = DeepgramClient(api_key=api_key)
        ctx = client.agent.v1.connect()
        conn = ctx.__enter__()
        agent_ctx[0] = ctx
        agent_conn[0] = conn

        conn.on(EventType.OPEN, lambda _: None)
        conn.on(EventType.MESSAGE, on_agent_message)
        conn.on(EventType.CLOSE, lambda _: None)
        conn.on(EventType.ERROR, lambda e: None)

        try:
            conn.send_settings(build_agent_settings(session_language[0]))
            conn.start_listening()
        except Exception:
            agent_conn[0] = None
            try:
                ctx.__exit__(None, None, None)
            except Exception:
                pass

    async def _restart_agent(new_language: str) -> None:
        nonlocal is_paused

        await ws_manager.send_status(session_id, "reconnecting")

        await audio_capture.stop()

        ctx = agent_ctx[0]
        if ctx:
            try:
                ctx.__exit__(None, None, None)
            except Exception:
                pass
        agent_conn[0] = None
        agent_ctx[0] = None

        session_language[0] = new_language
        conversation_history.clear()
        conversation_history.append({"role": "system", "content": get_system_prompt(new_language)})

        agent_ready.clear()
        thread = threading.Thread(target=_start_agent_thread, daemon=True)
        thread.start()

        if not agent_ready.wait(timeout=15):
            await ws_manager.send_error(session_id, "Agent reconnection timeout")
            return

        audio_capture.set_handlers(on_audio_frame=on_audio)
        is_paused = False
        await audio_capture.start()
        await ws_manager.send_status(session_id, "listening")

        logger.info(f"Session {session_id} restarted agent with language '{new_language}'")

    agent_thread = threading.Thread(target=_start_agent_thread, daemon=True)
    agent_thread.start()

    if not agent_ready.wait(timeout=15):
        await ws_manager.send_error(session_id, "Agent connection timeout")
        return

    audio_capture = AudioCapture()

    def on_audio(frame: bytes) -> None:
        conn = agent_conn[0]
        if conn:
            try:
                conn.send_media(frame)
            except Exception:
                pass

    audio_capture.set_handlers(on_audio_frame=on_audio)

    await ws_manager.send_status(session_id, "listening")
    await audio_capture.start()

    is_paused = False

    async def keepalive_loop():
        silent_frame = b'\x00' * 1600
        while True:
            if is_paused and agent_conn[0]:
                try:
                    def _send_ka():
                        if not agent_conn[0]:
                            return
                        try:
                            if hasattr(agent_conn[0], "keep_alive"):
                                agent_conn[0].keep_alive()
                            elif hasattr(agent_conn[0], "send_keep_alive"):
                                agent_conn[0].send_keep_alive()
                        except Exception:
                            pass
                        try:
                            agent_conn[0].send_media(silent_frame)
                        except Exception:
                            pass

                    await loop.run_in_executor(None, _send_ka)
                except Exception:
                    pass
            await asyncio.sleep(3)

    ka_task = asyncio.create_task(keepalive_loop())

    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "pause":
                is_paused = True
                await audio_capture.stop()
                await ws_manager.send_status(session_id, "paused")
            elif msg == "resume":
                is_paused = False
                await audio_capture.start()
                await ws_manager.send_status(session_id, "listening")
            elif msg == "clear":
                conversation_history.clear()
                conversation_history.append({"role": "system", "content": get_system_prompt(session_language[0])})
                await ws_manager.send_status(session_id, "cleared")
            elif msg.startswith("set_prompt:"):
                custom_prompt = msg[len("set_prompt:"):]
                if custom_prompt.strip():
                    logger.info(f"Received set_prompt for session {session_id}: {custom_prompt.strip()[:100]}...")
                    save_custom_prompt(session_language[0], custom_prompt)
                    conversation_history[0]["content"] = custom_prompt.strip()
                    logger.info(f"Updated conversation_history[0] with custom prompt")
                    await ws_manager.send_status(session_id, "prompt_saved")
            elif msg == "clear_prompt":
                logger.info(f"Received clear_prompt for session {session_id}")
                delete_custom_prompt(session_language[0])
                conversation_history[0]["content"] = get_system_prompt(session_language[0])
                await ws_manager.send_status(session_id, "prompt_cleared")
            elif msg.startswith("set_language:"):
                new_lang = msg[len("set_language:"):]
                if new_lang in ("es", "en") and new_lang != session_language[0]:
                    await _restart_agent(new_lang)
    except (WebSocketDisconnect, ConnectionClosed, RuntimeError):
        pass
    finally:
        if ka_task:
            ka_task.cancel()
        await audio_capture.stop()
        audio_capture.close()
        ctx = agent_ctx[0]
        if ctx:
            try:
                ctx.__exit__(None, None, None)
            except Exception:
                pass
        ws_manager.disconnect(session_id)
