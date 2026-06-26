import asyncio
import threading
from collections.abc import Callable

import numpy as np
import sounddevice as sd


class AudioCapture:
    SAMPLE_RATE = 16000
    FRAME_DURATION_MS = 20
    FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)
    CHANNELS = 1

    def __init__(self):
        self._stream: sd.InputStream | None = None
        self._running = False
        self._loop_task: asyncio.Task[None] | None = None
        self._stream_lock = threading.Lock()
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
            self._stream = sd.InputStream(
                samplerate=self.SAMPLE_RATE,
                channels=self.CHANNELS,
                dtype=np.int16,
                blocksize=self.FRAME_SIZE,
            )
            self._stream.start()
        except Exception:
            return

        self._running = True
        self._loop_task = asyncio.create_task(self._capture_loop())

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
                with self._stream_lock:
                    self._stream.stop()
                    self._stream.close()
            except Exception:
                pass
            self._stream = None

    async def _capture_loop(self) -> None:
        loop = asyncio.get_running_loop()

        while self._running and self._stream:
            def _read_chunk():
                with self._stream_lock:
                    if self._stream:
                        data, _ = self._stream.read(self.FRAME_SIZE)
                        return data.tobytes()
                    return None

            try:
                frame = await loop.run_in_executor(None, _read_chunk)
                if frame is None:
                    break
            except Exception:
                break

            try:
                if self._on_audio_frame:
                    self._on_audio_frame(frame)
            except Exception:
                pass

            await asyncio.sleep(0.001)

    def close(self) -> None:
        if self._stream:
            try:
                with self._stream_lock:
                    self._stream.stop()
                    self._stream.close()
            except Exception:
                pass
            self._stream = None
