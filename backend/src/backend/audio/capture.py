import asyncio
import logging
from collections.abc import Callable

import pyaudio

logger = logging.getLogger(__name__)


class AudioCapture:
    SAMPLE_RATE = 16000
    FRAME_DURATION_MS = 20
    FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)
    CHANNELS = 1
    FORMAT = pyaudio.paInt16

    def __init__(self):
        self._audio = pyaudio.PyAudio()
        self._stream: pyaudio.Stream | None = None
        self._running = False
        self._loop_task: asyncio.Task[None] | None = None

        self._on_audio_frame: Callable[[bytes], None] | None = None

    def set_handlers(
        self,
        on_audio_frame: Callable[[bytes], None] | None = None,
        on_speech_start: Callable[[], None] | None = None,
        on_speech_end: Callable[[bytes], None] | None = None,
    ):
        self._on_audio_frame = on_audio_frame

    async def start(self) -> None:
        try:
            self._stream = self._audio.open(
                format=self.FORMAT,
                channels=self.CHANNELS,
                rate=self.SAMPLE_RATE,
                input=True,
                frames_per_buffer=self.FRAME_SIZE,
            )
        except OSError as e:
            logger.error("Failed to open audio device: %s", e)
            return

        self._running = True
        self._loop_task = asyncio.create_task(self._capture_loop())
        logger.info("Audio capture started")

    async def stop(self) -> None:
        self._running = False
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
            self._loop_task = None
        if self._stream:
            try:
                self._stream.stop_stream()
                self._stream.close()
            except OSError:
                pass
            self._stream = None
        logger.info("Audio capture stopped")

    async def _capture_loop(self) -> None:
        loop = asyncio.get_running_loop()

        while self._running and self._stream:
            try:
                frame = await loop.run_in_executor(
                    None, self._stream.read, self.FRAME_SIZE, False
                )
            except OSError:
                break

            try:
                if self._on_audio_frame:
                    self._on_audio_frame(frame)
            except Exception as e:
                logger.debug("Audio frame callback error: %s", e)

            await asyncio.sleep(0.001)

    def close(self) -> None:
        if self._stream:
            try:
                self._stream.stop_stream()
                self._stream.close()
            except OSError:
                pass
        try:
            self._audio.terminate()
        except OSError:
            pass
