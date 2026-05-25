import asyncio
import logging
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from websockets.exceptions import ConnectionClosed

from backend.audio.capture import AudioCapture
from backend.context import ConversationContext
from backend.llm.client import LLMClient
from backend.llm.prompt import PromptBuilder
from backend.stt.transcriber import Transcriber
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
prompt_builder = PromptBuilder()


@app.get("/health")
async def health():
    return {"status": "ok", "connections": ws_manager.active_count}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    session_id = str(uuid.uuid4())[:8]
    await ws_manager.connect(session_id, websocket)
    await ws_manager.send_status(session_id, "connected")

    context = ConversationContext(max_messages=10)
    llm_client = LLMClient()
    transcriber = Transcriber()
    audio_capture = AudioCapture()

    loop = asyncio.get_running_loop()
    is_processing = False
    partial_transcription: str = ""

    def on_partial(text: str) -> None:
        nonlocal partial_transcription
        partial_transcription += text

    def on_sentence_end(text: str) -> None:
        nonlocal partial_transcription, is_processing
        final_text = text.strip() if text.strip() else partial_transcription.strip()
        partial_transcription = ""
        if not final_text or is_processing:
            return

        logger.info("Sentence completed: %s", final_text)
        is_processing = True

        async def handle() -> None:
            nonlocal is_processing
            try:
                await ws_manager.send_status(session_id, "thinking")
                await ws_manager.send_transcription(session_id, final_text)

                context.add("user", final_text)
                messages = prompt_builder.build_messages(
                    context.get_context(), final_text
                )

                await ws_manager.send_status(session_id, "responding")
                response_parts: list[str] = []
                async for chunk in llm_client.stream_response(messages):
                    response_parts.append(chunk)
                    await ws_manager.send_response_chunk(session_id, chunk)

                full_response = "".join(response_parts)
                if full_response:
                    context.add("assistant", full_response)

                await ws_manager.send_status(session_id, "listening")
            except Exception as e:
                logger.error("LLM error: %s", e)
                await ws_manager.send_error(session_id, str(e))
            finally:
                is_processing = False

        asyncio.run_coroutine_threadsafe(handle(), loop)

    def on_asr_error(error: str) -> None:
        logger.error("ASR error: %s", error)
        asyncio.run_coroutine_threadsafe(
            ws_manager.send_error(session_id, error), loop
        )

    transcriber.start(
        on_partial=on_partial,
        on_sentence_end=on_sentence_end,
        on_error=on_asr_error,
    )

    def on_audio_frame(frame: bytes) -> None:
        transcriber.send_frame(frame)

    def on_speech_start() -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.send_status(session_id, "listening"), loop
        )

    def on_speech_end(audio_buffer: bytes) -> None:
        pass

    audio_capture.set_handlers(
        on_audio_frame=on_audio_frame,
        on_speech_start=on_speech_start,
        on_speech_end=on_speech_end,
    )

    await ws_manager.send_status(session_id, "listening")
    await audio_capture.start()

    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "pause":
                await audio_capture.stop()
                transcriber.stop()
                await ws_manager.send_status(session_id, "paused")
            elif msg == "resume":
                transcriber.start(
                    on_partial=on_partial,
                    on_sentence_end=on_sentence_end,
                    on_error=on_asr_error,
                )
                await audio_capture.start()
                await ws_manager.send_status(session_id, "listening")
            elif msg == "clear":
                context.clear()
                await ws_manager.send_status(session_id, "cleared")
    except (WebSocketDisconnect, ConnectionClosed, RuntimeError):
        logger.info("Client disconnected: %s", session_id)
    finally:
        await audio_capture.stop()
        transcriber.stop()
        audio_capture.close()
        ws_manager.disconnect(session_id)
