import asyncio
import base64
import logging

from fastapi import WebSocket

from backend.audio.service import AudioStreamingService
from backend.context import ConversationHistory
from backend.llm.prompt import delete_custom_prompt, get_system_prompt, save_custom_prompt
from backend.llm.protocol import LLMService
from backend.llm.vision import VisionLLMService
from backend.screen.capture import ScreenCapture
from backend.ws.commands import ParsedCommand, WsCommand
from backend.ws.message_types import WsStatus
from backend.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)


class AgentSession:
    """Coordinates audio, conversation history, LLM streaming, and WebSocket events."""

    def __init__(
        self,
        session_id: str,
        websocket: WebSocket,
        llm_service: LLMService,
        manager: ConnectionManager,
        vision_service: VisionLLMService,
        initial_language: str = "es",
        custom_prompt: str | None = None,
        audio_service: AudioStreamingService | None = None,
        history: ConversationHistory | None = None,
        screen_capture: ScreenCapture | None = None,
    ) -> None:
        self.session_id = session_id
        self.websocket = websocket
        self.llm_service = llm_service
        self.manager = manager
        self.vision_service = vision_service

        self.language = initial_language if initial_language in ("es", "en") else "es"

        self._loop = asyncio.get_running_loop()

        custom = custom_prompt and custom_prompt.strip()
        if custom:
            logger.info(f"Session {self.session_id} using custom prompt from query parameter")
        else:
            logger.info(f"Session {self.session_id} using default prompt for language '{self.language}'")

        self.history = history or ConversationHistory(self.language, custom_prompt)
        self.audio = audio_service or AudioStreamingService(language=self.language, loop=self._loop)
        self.screen_capture = screen_capture or ScreenCapture()
        self.screen_analysis: str | None = None

        self.audio.on_transcription = self._on_transcription
        self.audio.on_user_started_speaking = self._on_user_started_speaking
        self.audio.on_agent_error = self._on_agent_error

    async def start(self) -> bool:
        await self.manager.connect(self.session_id, self.websocket)
        await self.manager.send_status(self.session_id, WsStatus.CONNECTED)

        logger.info(f"Session {self.session_id} initialized with language '{self.language}'")
        logger.info(f"System prompt for session: {self.history.messages[0]['content'][:150]}...")

        if not await self.audio.start():
            await self.manager.send_error(self.session_id, "Agent connection timeout")
            await self.stop()
            return False

        await self.manager.send_status(self.session_id, WsStatus.LISTENING)
        return True

    async def stop(self) -> None:
        await self.audio.stop()
        self.manager.disconnect(self.session_id)

    async def handle_command(self, cmd: ParsedCommand) -> None:
        handler = {
            WsCommand.PAUSE: self._handle_pause,
            WsCommand.RESUME: self._handle_resume,
            WsCommand.CLEAR: self._handle_clear,
            WsCommand.SET_LANGUAGE: self._handle_set_language,
            WsCommand.SET_PROMPT: self._handle_set_prompt,
            WsCommand.CLEAR_PROMPT: self._handle_clear_prompt,
            WsCommand.CAPTURE_SCREEN: self._handle_capture_screen,
        }.get(cmd.command)
        if handler:
            await handler(cmd)

    async def _handle_pause(self, cmd: ParsedCommand) -> None:
        await self.audio.pause()
        await self.manager.send_status(self.session_id, WsStatus.PAUSED)

    async def _handle_resume(self, cmd: ParsedCommand) -> None:
        await self.audio.resume()
        await self.manager.send_status(self.session_id, WsStatus.LISTENING)

    async def _handle_clear(self, cmd: ParsedCommand) -> None:
        self.history.reset()
        await self.manager.send_status(self.session_id, WsStatus.CLEARED)

    async def _handle_set_language(self, cmd: ParsedCommand) -> None:
        new_lang = cmd.payload
        if new_lang in ("es", "en") and new_lang != self.language:
            self.language = new_lang
            await self.manager.send_status(self.session_id, WsStatus.RECONNECTING)

            if not await self.audio.restart(new_lang):
                await self.manager.send_error(self.session_id, "Agent reconnection timeout")
                return

            self.history.reset(new_lang)
            await self.manager.send_status(self.session_id, WsStatus.LISTENING)
            logger.info(f"Session {self.session_id} restarted agent with language '{new_lang}'")

    async def _handle_set_prompt(self, cmd: ParsedCommand) -> None:
        custom_prompt = cmd.payload.strip()
        if custom_prompt:
            logger.info(f"Received set_prompt for session {self.session_id}: {custom_prompt[:100]}...")
            save_custom_prompt(self.language, custom_prompt)
            self.history.set_system_prompt(custom_prompt)
            logger.info("Updated conversation_history[0] with custom prompt")
            await self.manager.send_status(self.session_id, WsStatus.PROMPT_SAVED)

    async def _handle_clear_prompt(self, cmd: ParsedCommand) -> None:
        logger.info(f"Received clear_prompt for session {self.session_id}")
        delete_custom_prompt(self.language)
        self.history.set_system_prompt(get_system_prompt(self.language))
        await self.manager.send_status(self.session_id, WsStatus.PROMPT_CLEARED)

    async def _handle_capture_screen(self, cmd: ParsedCommand) -> None:
        asyncio.create_task(self._handle_screen_capture())

    async def _on_user_started_speaking(self) -> None:
        await self.manager.send_status(self.session_id, WsStatus.LISTENING)

    async def _on_agent_error(self, message: str) -> None:
        await self.manager.send_error(self.session_id, message)

    async def _on_transcription(self, text: str) -> None:
        await self.manager.send_transcription(self.session_id, text)
        await self.manager.send_status(self.session_id, WsStatus.THINKING)

        self.history.add_user_message(text)

        response_text = ""
        first_chunk = True

        try:
            async for chunk in self.llm_service.stream_response(self.history.messages, self.session_id):
                if first_chunk:
                    await self.manager.send_status(self.session_id, WsStatus.RESPONDING)
                    first_chunk = False
                response_text += chunk
                await self.manager.send_response_chunk(self.session_id, chunk)

            self.history.add_assistant_message(response_text)
        except Exception as e:
            logger.exception("LLM streaming failed for session %s", self.session_id)
            await self.manager.send_error(self.session_id, str(e))

        await self.manager.send_status(self.session_id, WsStatus.LISTENING)

    async def _handle_screen_capture(self) -> None:
        previous_status = WsStatus.LISTENING if not self.audio.is_paused else WsStatus.PAUSED
        await self.manager.send_status(self.session_id, WsStatus.CAPTURING)

        try:
            image_bytes = await self._loop.run_in_executor(
                None, self.screen_capture.capture_screen
            )
            image_base64 = base64.b64encode(image_bytes).decode()

            await self.manager.send_screen_image(self.session_id, image_base64)

            analysis_text = ""

            async for chunk in self.vision_service.analyze_screen(
                image_base64, self.session_id
            ):
                analysis_text += chunk
                await self.manager.send_screen_chunk(self.session_id, chunk)

            self.screen_analysis = analysis_text
            logger.info(
                f"Screen analysis completed for session {self.session_id}"
            )

        except Exception:
            logger.exception("Screen capture failed for session %s", self.session_id)
            await self.manager.send_error(self.session_id, "Capture failed")

        await self.manager.send_status(self.session_id, previous_status)
