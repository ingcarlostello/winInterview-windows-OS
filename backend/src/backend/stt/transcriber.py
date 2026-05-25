import logging
import os
from collections.abc import Callable

from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

logger = logging.getLogger(__name__)


class TranscriberCallback(RecognitionCallback):
    def __init__(self):
        super().__init__()
        self._on_result: Callable[[str], None] | None = None
        self._on_sentence_end: Callable[[str], None] | None = None
        self._on_error: Callable[[str], None] | None = None

    def set_handlers(
        self,
        on_result: Callable[[str], None] | None = None,
        on_sentence_end: Callable[[str], None] | None = None,
        on_error: Callable[[str], None] | None = None,
    ):
        self._on_result = on_result
        self._on_sentence_end = on_sentence_end
        self._on_error = on_error

    def on_open(self) -> None:
        logger.info("ASR connection opened")

    def on_close(self) -> None:
        logger.info("ASR connection closed")

    def on_error(self, result: RecognitionResult) -> None:
        error_msg = result.get_error_message()
        logger.error("ASR error: %s", error_msg)
        if self._on_error:
            self._on_error(error_msg)

    def on_event(
        self, request_id: str, transcription_result: RecognitionResult, usage
    ) -> None:
        sentence = transcription_result.get_sentence()
        if not sentence:
            return

        text = sentence.text or ""
        is_sentence_end = (
            sentence.is_sentence_end if hasattr(sentence, "is_sentence_end") else False
        )

        if text and self._on_result:
            self._on_result(text)

        if is_sentence_end and text and self._on_sentence_end:
            self._on_sentence_end(text)


class Transcriber:
    SAMPLE_RATE = 16000
    FORMAT = "pcm"

    def __init__(self):
        self._recognition: Recognition | None = None
        self._callback = TranscriberCallback()
        self._is_running = False
        self._has_api_key = bool(os.getenv("DASHSCOPE_API_KEY"))

    @property
    def is_running(self) -> bool:
        return self._is_running

    def start(
        self,
        on_partial: Callable[[str], None] | None = None,
        on_sentence_end: Callable[[str], None] | None = None,
        on_error: Callable[[str], None] | None = None,
    ):
        if not self._has_api_key:
            logger.warning("No DASHSCOPE_API_KEY set, ASR disabled")
            return

        self._callback.set_handlers(
            on_result=on_partial,
            on_sentence_end=on_sentence_end,
            on_error=on_error,
        )

        try:
            self._recognition = Recognition(
                model="paraformer-realtime-v2",
                format=self.FORMAT,
                sample_rate=self.SAMPLE_RATE,
                callback=self._callback,
            )
            self._recognition.start()
            self._is_running = True
            logger.info("ASR transcriber started")
        except Exception as e:
            logger.error("Failed to start ASR transcriber: %s", e)
            self._is_running = False
            if on_error:
                on_error(str(e))

    def send_frame(self, audio_frame: bytes) -> None:
        if not self._is_running or not self._recognition:
            return
        try:
            self._recognition.send_audio_frame(audio_frame)
        except Exception:
            self._is_running = False
            self._recognition = None

    def stop(self) -> None:
        if self._recognition and self._is_running:
            try:
                self._recognition.stop()
            except Exception:
                pass
        self._is_running = False
        self._recognition = None
        logger.info("ASR transcriber stopped")
