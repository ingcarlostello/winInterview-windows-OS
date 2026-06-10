import asyncio
import base64
import logging
from typing import Any

from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from backend.agent.deepgram import DeepgramAgent
from backend.audio.capture import AudioCapture
from backend.llm.prompt import delete_custom_prompt, get_system_prompt, save_custom_prompt
from backend.llm.protocol import LLMService
from backend.screen.capture import ScreenCapture
from backend.llm.vision import VisionLLMService
from backend.ws.commands import ParsedCommand, WsCommand
from backend.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)


class AgentSession:
    def __init__(
        self,
        session_id: str,
        websocket: WebSocket,
        llm_service: LLMService,
        manager: ConnectionManager,
        vision_service: VisionLLMService,
        initial_language: str = "es",
        custom_prompt: str | None = None,
    ) -> None:
        self.session_id = session_id
        self.websocket = websocket
        self.llm_service = llm_service
        self.manager = manager
        self.vision_service = vision_service
        
        self.language = initial_language if initial_language in ("es", "en") else "es"
        self.is_paused = False
        
        if custom_prompt and custom_prompt.strip():
            system_prompt = custom_prompt.strip()
            logger.info(f"Session {self.session_id} using custom prompt from query parameter")
        else:
            system_prompt = get_system_prompt(self.language)
            logger.info(f"Session {self.session_id} using default prompt for language '{self.language}'")
        
        self.conversation_history: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]
        self.screen_analysis: str | None = None
        
        self.agent = DeepgramAgent(language=self.language)
        self.audio_capture = AudioCapture()
        self.screen_capture = ScreenCapture()
        self._keepalive_task: asyncio.Task | None = None
        self._loop = asyncio.get_running_loop()

    async def start(self) -> bool:
        await self.manager.connect(self.session_id, self.websocket)
        await self.manager.send_status(self.session_id, "connected")
        
        logger.info(f"Session {self.session_id} initialized with language '{self.language}'")
        logger.info(f"System prompt for session: {self.conversation_history[0]['content'][:150]}...")
        
        agent_started = self.agent.start(self._on_agent_message)
        
        if not agent_started or not self.agent.wait_until_ready(timeout=15):
            await self.manager.send_error(self.session_id, "Agent connection timeout")
            await self.stop()
            return False
            
        self.audio_capture.set_handlers(on_audio_frame=self._on_audio_frame)
        await self.audio_capture.start()
        await self.manager.send_status(self.session_id, "listening")
        
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        return True

    async def stop(self) -> None:
        if self._keepalive_task:
            self._keepalive_task.cancel()
            self._keepalive_task = None
            
        await self.audio_capture.stop()
        self.audio_capture.close()
        self.agent.stop()
        self.manager.disconnect(self.session_id)

    async def handle_command(self, cmd: ParsedCommand) -> None:
        if cmd.command == WsCommand.PAUSE:
            self.is_paused = True
            await self.audio_capture.stop()
            await self.manager.send_status(self.session_id, "paused")
            
        elif cmd.command == WsCommand.RESUME:
            self.is_paused = False
            await self.audio_capture.start()
            await self.manager.send_status(self.session_id, "listening")
            
        elif cmd.command == WsCommand.CLEAR:
            self.conversation_history.clear()
            self.conversation_history.append({"role": "system", "content": get_system_prompt(self.language)})
            await self.manager.send_status(self.session_id, "cleared")
            
        elif cmd.command == WsCommand.SET_LANGUAGE:
            new_lang = cmd.payload
            if new_lang in ("es", "en") and new_lang != self.language:
                await self._restart_agent(new_lang)
                
        elif cmd.command == WsCommand.SET_PROMPT:
            custom_prompt = cmd.payload.strip()
            if custom_prompt:
                logger.info(f"Received set_prompt for session {self.session_id}: {custom_prompt[:100]}...")
                save_custom_prompt(self.language, custom_prompt)
                self.conversation_history[0]["content"] = custom_prompt
                logger.info("Updated conversation_history[0] with custom prompt")
                await self.manager.send_status(self.session_id, "prompt_saved")
                
        elif cmd.command == WsCommand.CLEAR_PROMPT:
            logger.info(f"Received clear_prompt for session {self.session_id}")
            delete_custom_prompt(self.language)
            self.conversation_history[0]["content"] = get_system_prompt(self.language)
            await self.manager.send_status(self.session_id, "prompt_cleared")
            
        elif cmd.command == WsCommand.CAPTURE_SCREEN:
            asyncio.create_task(self._handle_screen_capture())

    async def _restart_agent(self, new_language: str) -> None:
        await self.manager.send_status(self.session_id, "reconnecting")
        await self.audio_capture.stop()
        self.agent.stop()
        
        self.language = new_language
        self.conversation_history.clear()
        self.conversation_history.append({"role": "system", "content": get_system_prompt(self.language)})
        
        agent_started = self.agent.start(self._on_agent_message)
        
        if not agent_started or not self.agent.wait_until_ready(timeout=15):
            await self.manager.send_error(self.session_id, "Agent reconnection timeout")
            return
            
        self.audio_capture.set_handlers(on_audio_frame=self._on_audio_frame)
        self.is_paused = False
        await self.audio_capture.start()
        await self.manager.send_status(self.session_id, "listening")
        logger.info(f"Session {self.session_id} restarted agent with language '{new_language}'")

    def _on_audio_frame(self, frame: bytes) -> None:
        if not self.is_paused:
            self.agent.send_media(frame)

    def _on_agent_message(self, result: Any) -> None:
        msg_type = getattr(result, "type", None)

        if msg_type == "SettingsApplied":
            self.agent.on_settings_applied()
        elif msg_type == "UserStartedSpeaking":
            asyncio.run_coroutine_threadsafe(
                self.manager.send_status(self.session_id, "listening"), self._loop
            )
        elif msg_type == "ConversationText":
            role = getattr(result, "role", None)
            content = getattr(result, "content", "")
            if not content:
                return
            if role == "user":
                asyncio.run_coroutine_threadsafe(
                    self._on_user_text(content), self._loop
                )
        elif msg_type == "Error":
            desc = getattr(result, "description", str(result))
            asyncio.run_coroutine_threadsafe(
                self.manager.send_error(self.session_id, desc), self._loop
            )
        elif msg_type == "Warning":
            pass

    async def _on_user_text(self, text: str) -> None:
        await self.manager.send_transcription(self.session_id, text)
        await self.manager.send_status(self.session_id, "thinking")
        
        self.conversation_history.append({"role": "user", "content": text})
        
        response_text = ""
        first_chunk = True
        
        try:
            async for chunk in self.llm_service.stream_response(self.conversation_history, self.session_id):
                if first_chunk:
                    await self.manager.send_status(self.session_id, "responding")
                    first_chunk = False
                response_text += chunk
                await self.manager.send_response_chunk(self.session_id, chunk)
                
            self.conversation_history.append({"role": "assistant", "content": response_text})
        except Exception as e:
            await self.manager.send_error(self.session_id, str(e))
            
        await self.manager.send_status(self.session_id, "listening")

    async def _handle_screen_capture(self) -> None:
        previous_status = "listening" if not self.is_paused else "paused"
        await self.manager.send_status(self.session_id, "capturing")

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

        except Exception as e:
            logger.error(
                f"Screen capture failed for session {self.session_id}: {e}",
                exc_info=True,
            )
            await self.manager.send_error(self.session_id, f"Capture failed: {e}")

        await self.manager.send_status(self.session_id, previous_status)

    async def _keepalive_loop(self) -> None:
        while True:
            if self.is_paused:
                try:
                    await self._loop.run_in_executor(None, self.agent.keep_alive)
                except Exception as e:
                    logger.warning("Keepalive execution error: %s", e)
            await asyncio.sleep(3)
