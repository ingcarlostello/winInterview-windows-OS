import asyncio
import logging
import queue
import threading
from collections.abc import Callable

import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


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
        except Exception as e:
            logger.error("Failed to open audio input device: %s", e)
            return

        self._running = True
        self._silence_warnings = 0
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
                        peak = int(np.abs(data).max())
                        return data.tobytes(), peak
                    return None, 0

            try:
                result = await loop.run_in_executor(None, _read_chunk)
                if result is None:
                    break
                frame, peak = result
            except Exception:
                break

            if peak < 200 and self._silence_warnings < 3:
                self._silence_warnings += 1
                logger.warning("Audio level very low (peak=%d). Check microphone volume and proximity.", peak)

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


def _pcm16_mono_bytes(data: np.ndarray) -> bytes:
    """Downmix float32 [frames, channels] (o [frames]) a PCM int16 mono LE."""
    if data.ndim == 2 and data.shape[1] > 1:
        mono = data.mean(axis=1)
    else:
        mono = data.reshape(-1)
    clipped = np.clip(mono, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16).tobytes()


class SystemAudioCapture:
    """Captura el audio del sistema (loopback WASAPI) vía `soundcard`.

    Expone la misma interfaz que `AudioCapture` para que `AudioStreamingService`
    no distinga la fuente. En Windows `soundcard` graba "basura" si se pide 1
    canal, así que capturamos estéreo y bajamos a mono nosotros. El loopback
    captura el stream digital enviado al dispositivo de salida, por lo que oye al
    entrevistador aunque el usuario use audífonos.
    """

    SAMPLE_RATE = 16000
    FRAME_DURATION_MS = 20
    FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)
    CHANNELS = 2

    def __init__(self):
        self._running = False
        self._thread: threading.Thread | None = None
        self._on_audio_frame: Callable[[bytes], None] | None = None
        self._silence_warnings = 0

    def set_handlers(
        self,
        on_audio_frame: Callable[[bytes], None] | None = None,
        on_speech_start: Callable[[], None] | None = None,
        on_speech_end: Callable[[bytes], None] | None = None,
    ):
        self._on_audio_frame = on_audio_frame

    async def start(self) -> None:
        self._running = True
        self._silence_warnings = 0
        self._thread = threading.Thread(target=self._capture_thread, daemon=True)
        self._thread.start()

    async def stop(self) -> None:
        self._running = False
        thread = self._thread
        self._thread = None
        if thread:
            await asyncio.get_running_loop().run_in_executor(None, thread.join, 2.0)

    def close(self) -> None:
        self._running = False

    def _capture_thread(self) -> None:
        import ctypes
        ctypes.windll.ole32.CoInitialize(None)
        try:
            try:
                import soundcard as sc
            except Exception as e:
                logger.error("soundcard no disponible para captura de audio del sistema: %s", e)
                return

            try:
                speaker = sc.default_speaker()
                loopback = sc.get_microphone(id=str(speaker.name), include_loopback=True)
            except Exception as e:
                logger.error("No se pudo resolver el dispositivo loopback del sistema: %s", e)
                return

            try:
                with loopback.recorder(
                    samplerate=self.SAMPLE_RATE,
                    channels=self.CHANNELS,
                    blocksize=self.FRAME_SIZE,
                ) as rec:
                    logger.info("Captura de audio del sistema iniciada (loopback: %s)", speaker.name)
                    while self._running:
                        data = rec.record(numframes=self.FRAME_SIZE)
                        frame = _pcm16_mono_bytes(data)
                        peak = int(np.abs(np.frombuffer(frame, dtype=np.int16)).max()) if frame else 0
                        if peak < 200 and self._silence_warnings < 3:
                            self._silence_warnings += 1
                            logger.warning(
                                "Nivel de audio del sistema muy bajo (peak=%d). "
                                "¿Hay sonido reproduciéndose en el PC?",
                                peak,
                            )
                        if self._on_audio_frame:
                            try:
                                self._on_audio_frame(frame)
                            except Exception:
                                pass
            except Exception as e:
                logger.error("Error en el bucle de captura de audio del sistema: %s", e)
        finally:
            ctypes.windll.ole32.CoUninitialize()


class MixedAudioCapture:
    """Captura micrófono + audio del sistema en paralelo y los mezcla en un único
    stream PCM mono int16 (suma con anti-clip), anclado al ritmo del micrófono.

    Nota: la mezcla descarta la separación de hablantes (no hay diarización); ambas
    voces llegan a Deepgram en el mismo canal.
    """

    def __init__(self):
        self._mic = AudioCapture()
        self._system = SystemAudioCapture()
        self._mic_q: queue.Queue[bytes] = queue.Queue(maxsize=50)
        self._sys_q: queue.Queue[bytes] = queue.Queue(maxsize=50)
        self._running = False
        self._mixer_thread: threading.Thread | None = None
        self._on_audio_frame: Callable[[bytes], None] | None = None

    def set_handlers(
        self,
        on_audio_frame: Callable[[bytes], None] | None = None,
        on_speech_start: Callable[[], None] | None = None,
        on_speech_end: Callable[[bytes], None] | None = None,
    ):
        self._on_audio_frame = on_audio_frame

    async def start(self) -> None:
        self._running = True
        self._mic.set_handlers(on_audio_frame=lambda f: self._enqueue(self._mic_q, f))
        self._system.set_handlers(on_audio_frame=lambda f: self._enqueue(self._sys_q, f))
        self._mixer_thread = threading.Thread(target=self._mix_loop, daemon=True)
        self._mixer_thread.start()
        await self._mic.start()
        await self._system.start()

    async def stop(self) -> None:
        self._running = False
        await self._mic.stop()
        await self._system.stop()
        thread = self._mixer_thread
        self._mixer_thread = None
        if thread:
            await asyncio.get_running_loop().run_in_executor(None, thread.join, 2.0)

    def close(self) -> None:
        self._running = False
        self._mic.close()
        self._system.close()

    @staticmethod
    def _enqueue(q: "queue.Queue[bytes]", frame: bytes) -> None:
        # Drop-oldest si la cola se llena: priorizar audio reciente sobre completitud.
        try:
            q.put_nowait(frame)
        except queue.Full:
            try:
                q.get_nowait()
                q.put_nowait(frame)
            except (queue.Empty, queue.Full):
                pass

    def _mix_loop(self) -> None:
        silence = b"\x00" * (AudioCapture.FRAME_SIZE * 2)
        while self._running:
            try:
                mic_frame = self._mic_q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                sys_frame = self._sys_q.get_nowait()
            except queue.Empty:
                sys_frame = silence
            mixed = self._mix(mic_frame, sys_frame)
            if self._on_audio_frame:
                try:
                    self._on_audio_frame(mixed)
                except Exception:
                    pass

    @staticmethod
    def _mix(a: bytes, b: bytes) -> bytes:
        ai = np.frombuffer(a, dtype=np.int16).astype(np.int32)
        bi = np.frombuffer(b, dtype=np.int16).astype(np.int32)
        n = min(len(ai), len(bi))
        if n == 0:
            return a
        mixed = np.clip(ai[:n] + bi[:n], -32768, 32767).astype(np.int16)
        return mixed.tobytes()
