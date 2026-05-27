import asyncio
import logging
import os
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
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
from deepgram.types.think_settings_v1 import ThinkSettingsV1
from deepgram.types.think_settings_v1provider import ThinkSettingsV1Provider_OpenAi

from backend.audio.capture import AudioCapture
from backend.llm.prompt import SYSTEM_PROMPT
from backend.ws_manager import ConnectionManager

load_dotenv()

logging.basicConfig(level=logging.INFO)
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


def build_agent_settings() -> AgentV1Settings:
    return AgentV1Settings(
        audio=AgentV1SettingsAudio(
            input=AgentV1SettingsAudioInput(encoding="linear16", sample_rate=16000),
        ),
        agent=AgentV1SettingsAgent(
            listen=AgentV1SettingsAgentListen(
                provider=AgentV1SettingsAgentListenProvider_V1(
                    type="deepgram",
                    model="nova-3",
                    language="en",
                    smart_format=True,
                )
            ),
            think=ThinkSettingsV1(
                provider=ThinkSettingsV1Provider_OpenAi(
                    type="open_ai",
                    model="gpt-4o-mini",
                ),
                prompt=SYSTEM_PROMPT,
            ),
        ),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "connections": ws_manager.active_count}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    session_id = str(uuid.uuid4())[:8]
    await ws_manager.connect(session_id, websocket)
    await ws_manager.send_status(session_id, "connected")

    loop = asyncio.get_running_loop()
    agent_ready = threading.Event()
    agent_conn: object = None
    agent_ctx: object = None
    response_text: str = ""

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
            elif role == "assistant":
                asyncio.run_coroutine_threadsafe(
                    _on_assistant_text(session_id, content), loop
                )
        elif msg_type == "AgentThinking":
            pass
        elif msg_type == "Error":
            desc = getattr(result, "description", str(result))
            logger.error("Agent error: %s", desc)
            asyncio.run_coroutine_threadsafe(
                ws_manager.send_error(session_id, desc), loop
            )
        elif msg_type == "Warning":
            desc = getattr(result, "description", "")
            logger.warning("Agent warning: %s", desc)

    async def _on_user_text(sid: str, text: str) -> None:
        nonlocal response_text
        response_text = ""
        await ws_manager.send_status(sid, "thinking")
        await ws_manager.send_transcription(sid, text)

    async def _on_assistant_text(sid: str, text: str) -> None:
        nonlocal response_text
        response_text = text
        await ws_manager.send_status(sid, "responding")
        lines = text.split("\n")
        for i, line in enumerate(lines):
            chunk = line
            if i < len(lines) - 1:
                chunk += "\n"
            await ws_manager.send_response_chunk(sid, chunk)
            await asyncio.sleep(0.04)
        await ws_manager.send_status(sid, "listening")

    def _agent_thread() -> None:
        nonlocal agent_conn, agent_ctx
        api_key = os.getenv("DEEPGRAM_API_KEY")
        if not api_key:
            logger.error("No DEEPGRAM_API_KEY")
            return

        client = DeepgramClient(api_key=api_key)
        agent_ctx = client.agent.v1.connect()
        agent_conn = agent_ctx.__enter__()

        agent_conn.on(EventType.OPEN, lambda _: logger.info("Agent connection opened"))
        agent_conn.on(EventType.MESSAGE, on_agent_message)
        agent_conn.on(EventType.CLOSE, lambda _: logger.info("Agent connection closed"))
        agent_conn.on(EventType.ERROR, lambda e: logger.error("Agent WS error: %s", e))

        try:
            agent_conn.send_settings(build_agent_settings())
            agent_conn.start_listening()
        except Exception as e:
            logger.error("Agent listen error: %s", e)
        finally:
            agent_conn = None
            try:
                agent_ctx.__exit__(None, None, None)
            except Exception:
                pass

    agent_thread = threading.Thread(target=_agent_thread, daemon=True)
    agent_thread.start()

    if not agent_ready.wait(timeout=15):
        logger.error("Agent settings not applied within timeout")
        await ws_manager.send_error(session_id, "Agent connection timeout")
        return

    audio_capture = AudioCapture()

    def on_audio(frame: bytes) -> None:
        conn = agent_conn
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
            if is_paused and agent_conn:
                try:
                    def _send_ka():
                        if not agent_conn:
                            return
                        try:
                            if hasattr(agent_conn, "keep_alive"):
                                agent_conn.keep_alive()
                            elif hasattr(agent_conn, "send_keep_alive"):
                                agent_conn.send_keep_alive()
                        except Exception:
                            pass
                        try:
                            agent_conn.send_media(silent_frame)
                        except Exception:
                            pass

                    await loop.run_in_executor(None, _send_ka)
                except Exception as e:
                    logger.debug("Keepalive error: %s", e)
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
                response_text = ""
                await ws_manager.send_status(session_id, "cleared")
    except (WebSocketDisconnect, ConnectionClosed, RuntimeError):
        logger.info("Client disconnected: %s", session_id)
    finally:
        if ka_task:
            ka_task.cancel()
        await audio_capture.stop()
        audio_capture.close()
        ctx = agent_ctx
        if ctx:
            try:
                ctx.__exit__(None, None, None)
            except Exception:
                pass
        ws_manager.disconnect(session_id)
