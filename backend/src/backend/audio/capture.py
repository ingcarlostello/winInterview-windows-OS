import asyncio
import logging
from collections.abc import Callable

import pyaudio
import webrtcvad

logger = logging.getLogger(__name__)


class AudioCapture:
    SAMPLE_RATE = 16000
    FRAME_DURATION_MS = 20
    FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)
    CHANNELS = 1
    FORMAT = pyaudio.paInt16

    SILENCE_FRAMES_THRESHOLD = 30

    def __init__(self):
        self._audio = pyaudio.PyAudio()
        self._vad = webrtcvad.Vad(2)
        self._stream: pyaudio.Stream | None = None
        self._running = False
        self._loop_task: asyncio.Task[None] | None = None

        self._on_speech_start: Callable[[], None] | None = None
        self._on_speech_end: Callable[[bytes], None] | None = None
        self._on_audio_frame: Callable[[bytes], None] | None = None

    def set_handlers(
        self,
        on_speech_start: Callable[[], None] | None = None,
        on_speech_end: Callable[[bytes], None] | None = None,
        on_audio_frame: Callable[[bytes], None] | None = None,
    ):
        self._on_speech_start = on_speech_start
        self._on_speech_end = on_speech_end
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
        speech_frames: list[bytes] = []
        is_speaking = False
        silence_count = 0

        while self._running and self._stream:
            try:
                frame = await loop.run_in_executor(
                    None, self._stream.read, self.FRAME_SIZE, False
                )
            except OSError:
                break

            is_speech = self._vad.is_speech(frame, self.SAMPLE_RATE)

            try:
                if self._on_audio_frame:
                    self._on_audio_frame(frame)
            except Exception as e:
                logger.debug("Audio frame callback error: %s", e)

            if is_speech:
                if not is_speaking:
                    is_speaking = True
                    speech_frames = []
                    silence_count = 0
                    logger.debug("Speech started")
                    try:
                        if self._on_speech_start:
                            self._on_speech_start()
                    except Exception as e:
                        logger.debug("Speech start callback error: %s", e)

                silence_count = 0
                speech_frames.append(frame)
            else:
                if is_speaking:
                    silence_count += 1
                    speech_frames.append(frame)

                    if silence_count >= self.SILENCE_FRAMES_THRESHOLD:
                        is_speaking = False
                        silence_count = 0
                        logger.debug(
                            "Speech ended, %d frames captured", len(speech_frames)
                        )
                        try:
                            if self._on_speech_end and speech_frames:
                                audio_data = b"".join(speech_frames)
                                self._on_speech_end(audio_data)
                        except Exception as e:
                            logger.debug("Speech end callback error: %s", e)
                        speech_frames = []

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
