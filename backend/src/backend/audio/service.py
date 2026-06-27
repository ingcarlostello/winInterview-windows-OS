import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

from backend.agent.deepgram import DeepgramAgent
from backend.audio.capture import AudioCapture, MixedAudioCapture, SystemAudioCapture

logger = logging.getLogger(__name__)


def _make_capture(audio_source: str):
    """Construye la captura según la fuente: micrófono (default), audio del
    sistema (loopback WASAPI) o ambos mezclados."""
    if audio_source == "system":
        return SystemAudioCapture()
    if audio_source == "both":
        return MixedAudioCapture()
    return AudioCapture()


class AudioStreamingService:
    """Owns the PyAudio capture + Deepgram Agent lifecycle.

    Provides a clean async interface for audio streaming and ASR,
    delegating transcription events to coordinator callbacks.
    """

    def __init__(
        self,
        language: str,
        loop: asyncio.AbstractEventLoop,
        audio_source: str = "mic",
    ) -> None:
        self._language = language
        self._loop = loop
        self._audio_source = audio_source

        self.agent = DeepgramAgent(language=language)
        self.agent.on_closed = self._on_agent_closed
        self._capture = _make_capture(audio_source)
        self._is_paused = False
        self._speech_start_time: float | None = None
        self._accumulated_speech_duration: float = 0.0

        self.on_transcription: Callable[[str, float], Awaitable[None]] | None = None
        self.on_user_started_speaking: Callable[[], Awaitable[None]] | None = None
        self.on_agent_error: Callable[[str], Awaitable[None]] | None = None

    @property
    def is_paused(self) -> bool:
        return self._is_paused

    async def start(self) -> bool:
        agent_started = self.agent.start(self._on_agent_message)
        if not agent_started:
            return False

        if not self.agent.wait_until_ready(timeout=15):
            self.agent.last_error = (
                self.agent.last_error
                or "Tiempo de espera agotado conectando con el servicio de transcripción."
            )
            return False

        self._capture.set_handlers(on_audio_frame=self._on_audio_frame)
        await self._capture.start()
        return True

    async def stop(self) -> None:
        await self._capture.stop()
        self._capture.close()
        self.agent.stop()

    async def pause(self) -> None:
        self._is_paused = True
        await self._capture.stop()
        self.agent.stop()

    async def resume(self) -> bool:
        agent_started = self.agent.start(self._on_agent_message)
        if not agent_started or not self.agent.wait_until_ready(timeout=15):
            return False

        self._is_paused = False
        await self._capture.start()
        return True

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
        if not self._is_paused and not self.agent.is_closed:
            self.agent.send_media(frame)

    def _on_agent_closed(self) -> None:
        asyncio.run_coroutine_threadsafe(self._handle_connection_lost(), self._loop)

    async def _handle_connection_lost(self) -> None:
        logger.warning("Deepgram connection lost, stopping audio capture")
        await self._capture.stop()
        if self.on_agent_error:
            await self.on_agent_error("Deepgram connection closed unexpectedly")

    def _on_agent_message(self, result: Any) -> None:
        msg_type = getattr(result, "type", None)

        if msg_type == "SettingsApplied":
            self.agent.on_settings_applied()
        elif msg_type == "UserStartedSpeaking":
            self._speech_start_time = time.time()
            if self.on_user_started_speaking:
                asyncio.run_coroutine_threadsafe(
                    self.on_user_started_speaking(), self._loop
                )
        elif msg_type == "UserStoppedSpeaking":
            if self._speech_start_time is not None:
                self._accumulated_speech_duration += time.time() - self._speech_start_time
                self._speech_start_time = None
        elif msg_type == "ConversationText":
            role = getattr(result, "role", None)
            content = getattr(result, "content", "")
            if not content:
                return
            if role == "user" and self.on_transcription:
                duration = self._accumulated_speech_duration
                if self._speech_start_time is not None:
                    duration += time.time() - self._speech_start_time
                    self._speech_start_time = None
                self._accumulated_speech_duration = 0.0
                asyncio.run_coroutine_threadsafe(
                    self.on_transcription(content, duration), self._loop
                )
        elif msg_type == "Error":
            desc = getattr(result, "description", str(result))
            if self.on_agent_error:
                asyncio.run_coroutine_threadsafe(
                    self.on_agent_error(desc), self._loop
                )
        elif msg_type == "Warning":
            pass
