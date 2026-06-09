import logging
import threading
from typing import Any, Callable

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

from backend.config import settings

logger = logging.getLogger(__name__)


class DeepgramAgent:
    def __init__(self, language: str = "es") -> None:
        self.language = language
        self._client = DeepgramClient(api_key=settings.deepgram_api_key)
        self._ctx: Any = None
        self._conn: Any = None
        self._ready_event = threading.Event()

    def start(self, message_handler: Callable[[Any], None]) -> bool:
        try:
            self._ctx = self._client.agent.v1.connect()
            self._conn = self._ctx.__enter__()
            
            self._conn.on(EventType.OPEN, lambda _: None)
            self._conn.on(EventType.MESSAGE, message_handler)
            self._conn.on(EventType.CLOSE, lambda _: None)
            self._conn.on(EventType.ERROR, lambda e: logger.error("Deepgram error: %s", e))
            
            self._conn.send_settings(self._build_settings())
            
            # start_listening() es bloqueante, debe ejecutarse en un hilo separado
            thread = threading.Thread(target=self._listening_loop, daemon=True)
            thread.start()
            
            return True
        except Exception as e:
            logger.error("Failed to start Deepgram agent: %s", e, exc_info=True)
            self._cleanup()
            return False

    def _listening_loop(self) -> None:
        try:
            self._conn.start_listening()
        except Exception as e:
            logger.error("Listening loop error: %s", e, exc_info=True)

    def wait_until_ready(self, timeout: float = 15.0) -> bool:
        return self._ready_event.wait(timeout=timeout)

    def send_media(self, frame: bytes) -> None:
        if self._conn:
            try:
                self._conn.send_media(frame)
            except Exception as e:
                logger.warning("Failed to send media frame: %s", e)

    def keep_alive(self) -> None:
        if self._conn:
            try:
                if hasattr(self._conn, "keep_alive"):
                    self._conn.keep_alive()
                elif hasattr(self._conn, "send_keep_alive"):
                    self._conn.send_keep_alive()
                self._conn.send_media(b'\x00' * 1600)
            except Exception as e:
                logger.warning("Keep-alive failed: %s", e)

    def stop(self) -> None:
        self._cleanup()

    def _cleanup(self) -> None:
        if self._ctx:
            try:
                self._ctx.__exit__(None, None, None)
            except Exception as e:
                logger.warning("Error closing Deepgram context: %s", e)
        self._ctx = None
        self._conn = None

    def _build_settings(self) -> AgentV1Settings:
        return AgentV1Settings(
            audio=AgentV1SettingsAudio(
                input=AgentV1SettingsAudioInput(encoding="linear16", sample_rate=16000),
            ),
            agent=AgentV1SettingsAgent(
                listen=AgentV1SettingsAgentListen(
                    provider=AgentV1SettingsAgentListenProvider_V1(
                        type="deepgram",
                        model="nova-3",
                        language=self.language,
                        smart_format=True,
                        endpointing=1500,
                    )
                ),
            ),
        )

    def on_settings_applied(self) -> None:
        self._ready_event.set()
