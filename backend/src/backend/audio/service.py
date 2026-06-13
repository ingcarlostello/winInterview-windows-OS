import asyncio
import logging
from typing import Any, Awaitable, Callable

from backend.agent.deepgram import DeepgramAgent
from backend.audio.capture import AudioCapture

logger = logging.getLogger(__name__)


class AudioStreamingService:
    """Owns the PyAudio capture + Deepgram Agent lifecycle.

    Provides a clean async interface for audio streaming and ASR,
    delegating transcription events to coordinator callbacks.
    """

    def __init__(self, language: str, loop: asyncio.AbstractEventLoop) -> None:
        self._language = language
        self._loop = loop

        self.agent = DeepgramAgent(language=language)
        self._capture = AudioCapture()
        self._keepalive_task: asyncio.Task[None] | None = None
        self._is_paused = False

        self.on_transcription: Callable[[str], Awaitable[None]] | None = None
        self.on_user_started_speaking: Callable[[], Awaitable[None]] | None = None
        self.on_agent_error: Callable[[str], Awaitable[None]] | None = None

    @property
    def is_paused(self) -> bool:
        return self._is_paused

    async def start(self) -> bool:
        agent_started = self.agent.start(self._on_agent_message)

        if not agent_started or not self.agent.wait_until_ready(timeout=15):
            return False

        self._capture.set_handlers(on_audio_frame=self._on_audio_frame)
        await self._capture.start()
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        return True

    async def stop(self) -> None:
        if self._keepalive_task:
            self._keepalive_task.cancel()
            self._keepalive_task = None

        await self._capture.stop()
        self._capture.close()
        self.agent.stop()

    async def pause(self) -> None:
        self._is_paused = True
        await self._capture.stop()

    async def resume(self) -> None:
        self._is_paused = False
        await self._capture.start()

    async def restart(self, new_language: str) -> bool:
        await self._capture.stop()
        self.agent.stop()

        self._language = new_language
        agent_started = self.agent.start(self._on_agent_message)

        if not agent_started or not self.agent.wait_until_ready(timeout=15):
            return False

        self._capture.set_handlers(on_audio_frame=self._on_audio_frame)
        self._is_paused = False
        await self._capture.start()
        return True

    def _on_audio_frame(self, frame: bytes) -> None:
        if not self._is_paused:
            self.agent.send_media(frame)

    def _on_agent_message(self, result: Any) -> None:
        msg_type = getattr(result, "type", None)

        if msg_type == "SettingsApplied":
            self.agent.on_settings_applied()
        elif msg_type == "UserStartedSpeaking":
            if self.on_user_started_speaking:
                asyncio.run_coroutine_threadsafe(
                    self.on_user_started_speaking(), self._loop
                )
        elif msg_type == "ConversationText":
            role = getattr(result, "role", None)
            content = getattr(result, "content", "")
            if not content:
                return
            if role == "user" and self.on_transcription:
                asyncio.run_coroutine_threadsafe(
                    self.on_transcription(content), self._loop
                )
        elif msg_type == "Error":
            desc = getattr(result, "description", str(result))
            if self.on_agent_error:
                asyncio.run_coroutine_threadsafe(
                    self.on_agent_error(desc), self._loop
                )
        elif msg_type == "Warning":
            pass

    async def _keepalive_loop(self) -> None:
        while True:
            if self._is_paused:
                try:
                    await self._loop.run_in_executor(None, self.agent.keep_alive)
                except Exception as e:
                    logger.warning("Keepalive execution error: %s", e)
            await asyncio.sleep(3)
