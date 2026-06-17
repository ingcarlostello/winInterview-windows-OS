import asyncio
import logging
import time

from fastapi import WebSocket

from backend.audio.service import AudioStreamingService
from backend.context import ConversationHistory
from backend.llm.prompt import delete_custom_prompt, get_system_prompt, save_custom_prompt
from backend.llm.protocol import LLMService
from backend.llm.vision import VisionLLMService
from backend.plan_gate import FeatureBlockedError, PlanGate, QuotaExceededError
from backend.tiers import Feature, Quota
from backend.ws.commands import ParsedCommand, WsCommand
from backend.ws.message_types import WsMessageType, WsStatus
from backend.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)

class DialogCoordinator:
    """Orquesta la lógica de negocio puramente: Audio, LLM, Historial. Sin estado de red."""
    
    def __init__(self, session_id: str, language: str, audio_service: AudioStreamingService, llm_service: LLMService, history: ConversationHistory, plan_gate: PlanGate):
        self.session_id = session_id
        self.language = language
        self.audio = audio_service
        self.llm = llm_service
        self.history = history
        self.plan_gate = plan_gate
        
        self.on_state_change = None
        self.on_chunk_received = None
        self.on_error = None
        self.on_transcription_received = None
        self.on_quota_exceeded = None
        self.on_flushed = None
        self.on_quota_consumed = None

    async def handle_transcription(self, text: str, speech_duration: float = 0.0):
        if self.on_transcription_received:
            await self.on_transcription_received(text)

        if self.on_state_change:
            await self.on_state_change(WsStatus.THINKING)
            
        self.history.add_user_message(text)

        response_chunks = []
        first_chunk = True

        try:
            async for chunk in self.llm.stream_response(self.history.messages, self.session_id):
                if first_chunk:
                    if self.on_state_change:
                        await self.on_state_change(WsStatus.RESPONDING)
                    first_chunk = False
                response_chunks.append(chunk)
                if self.on_chunk_received:
                    await self.on_chunk_received(chunk)

            self.history.add_assistant_message("".join(response_chunks))
        except Exception as e:
            logger.exception("LLM streaming failed for session %s", self.session_id)
            if self.on_error:
                await self.on_error(str(e))
                
        if self.on_state_change:
            await self.on_state_change(WsStatus.LISTENING)
            
        try:
            await self.plan_gate.flush_to_convex()
            if self.on_flushed:
                await self.on_flushed()
        except Exception as e:
            logger.error(f"Failed to flush to Convex after response: {e}")


class AgentSession:
    """Maneja la conexión WebSocket y rutea eventos hacia el DialogCoordinator."""

    def __init__(
        self,
        session_id: str,
        websocket: WebSocket,
        llm_service: LLMService,
        manager: ConnectionManager,
        vision_service: VisionLLMService,
        plan_gate: PlanGate,
        initial_language: str = "es",
        custom_prompt: str | None = None,
        audio_service: AudioStreamingService | None = None,
        history: ConversationHistory | None = None,
    ) -> None:
        self.session_id = session_id
        self.websocket = websocket
        self.llm_service = llm_service
        self.manager = manager
        self.vision_service = vision_service
        self.plan_gate = plan_gate
        self._session_start_time: float | None = None
        self._quota_expiry_task: asyncio.Task | None = None

        self.language = initial_language if initial_language in ("es", "en") else "es"
        self._loop = asyncio.get_running_loop()

        custom = custom_prompt and custom_prompt.strip()
        if custom:
            logger.info(f"Session {self.session_id} using custom prompt from query parameter")
        else:
            logger.info(f"Session {self.session_id} using default prompt for language '{self.language}'")

        self.history = history or ConversationHistory(self.language, custom_prompt)
        self.audio = audio_service or AudioStreamingService(language=self.language, loop=self._loop)

        self.coordinator = DialogCoordinator(
            session_id=self.session_id,
            language=self.language,
            audio_service=self.audio,
            llm_service=self.llm_service,
            history=self.history,
            plan_gate=self.plan_gate,
        )
        self.coordinator.on_state_change = self._send_status
        self.coordinator.on_chunk_received = self._send_chunk
        self.coordinator.on_error = self._send_error
        self.coordinator.on_transcription_received = self._send_transcription
        self.coordinator.on_quota_exceeded = self._on_quota_exceeded
        self.coordinator.on_flushed = self._send_plan_info
        self.coordinator.on_quota_consumed = self._send_quota_update

        self.audio.on_transcription = self.coordinator.handle_transcription
        self.audio.on_user_started_speaking = self._on_user_started_speaking
        self.audio.on_agent_error = self._send_error

    async def _send_status(self, status: WsStatus):
        await self.manager.send_status(self.session_id, status)
        
    async def _send_chunk(self, chunk: str):
        await self.manager.send_response_chunk(self.session_id, chunk)
        
    async def _send_error(self, error: str):
        await self.manager.send_error(self.session_id, error)
        
    async def _send_transcription(self, text: str):
        await self.manager.send_transcription(self.session_id, text)

    async def _send_plan_info(self) -> None:
        await self.manager.send(
            self.session_id,
            WsMessageType.PLAN_INFO,
            self.plan_gate.get_plan_info(),
        )

    async def _send_quota_update(self, speech_active: bool = False) -> None:
        data = self.plan_gate.get_plan_info()
        data["speech_active"] = speech_active
        await self.manager.send(
            self.session_id,
            WsMessageType.QUOTA_UPDATE,
            data,
        )

    async def _on_quota_exceeded(self) -> None:
        await self.audio.pause()
        await self._send_status(WsStatus.QUOTA_EXCEEDED)
        await self._send_error("Transcription quota exceeded. Upgrade your plan to continue.")

    async def _expire_session(self, seconds: int) -> None:
        try:
            await asyncio.sleep(seconds)
            logger.info(f"Session {self.session_id} quota expired after {seconds}s")
            
            remaining = self.plan_gate.get_remaining(Quota.TRANSCRIPTION_SECONDS)
            if remaining > 0:
                self.plan_gate.consume_quota(Quota.TRANSCRIPTION_SECONDS, remaining)
                logger.info(f"Session {self.session_id} consumed remaining {remaining}s on quota expiry")
            
            await self.plan_gate.flush_to_convex()
            await self._on_quota_exceeded()
        except asyncio.CancelledError:
            pass

    async def start(self) -> bool:
        await self.manager.connect(self.session_id, self.websocket)
        await self._send_status(WsStatus.CONNECTED)
        await self._send_plan_info()

        self._session_start_time = time.time()

        logger.info(f"Session {self.session_id} initialized with language '{self.language}'")
        logger.info(f"System prompt for session: {self.history.messages[0]['content'][:150]}...")

        if not await self.audio.start():
            await self._send_error("Agent connection timeout")
            await self.stop()
            return False

        remaining = self.plan_gate.get_remaining(Quota.TRANSCRIPTION_SECONDS)
        if remaining > 0:
            self._quota_expiry_task = asyncio.create_task(self._expire_session(remaining))

        await self._send_status(WsStatus.LISTENING)
        return True

    async def stop(self) -> None:
        if self._quota_expiry_task is not None:
            self._quota_expiry_task.cancel()
            try:
                await self._quota_expiry_task
            except asyncio.CancelledError:
                pass
            self._quota_expiry_task = None

        await self.audio.stop()
        try:
            if self._session_start_time is not None:
                session_duration = int(time.time() - self._session_start_time)
                if session_duration > 0:
                    remaining = self.plan_gate.get_remaining(Quota.TRANSCRIPTION_SECONDS)
                    consumable = min(session_duration, max(0, remaining))
                    if consumable > 0:
                        self.plan_gate.consume_quota(Quota.TRANSCRIPTION_SECONDS, consumable)
                        logger.info(f"Session {self.session_id} consumed {consumable}s of transcription quota (session was {session_duration}s)")
            await self.plan_gate.flush_to_convex()
            await self._send_plan_info()
        except Exception as e:
            logger.error(f"Failed to flush to Convex on stop: {e}")
        self.manager.disconnect(self.session_id)

    async def handle_command(self, cmd: ParsedCommand) -> None:
        handler = {
            WsCommand.PAUSE: self._handle_pause,
            WsCommand.RESUME: self._handle_resume,
            WsCommand.CLEAR: self._handle_clear,
            WsCommand.SET_LANGUAGE: self._handle_set_language,
            WsCommand.SET_PROMPT: self._handle_set_prompt,
            WsCommand.CLEAR_PROMPT: self._handle_clear_prompt,
        }.get(cmd.command)
        if handler:
            await handler(cmd)

    async def _handle_pause(self, cmd: ParsedCommand) -> None:
        await self.audio.pause()
        await self._send_status(WsStatus.PAUSED)

    async def _handle_resume(self, cmd: ParsedCommand) -> None:
        if not await self.audio.resume():
            await self._send_error("Agent reconnection timeout")
            return
        await self._send_status(WsStatus.LISTENING)

    async def _handle_clear(self, cmd: ParsedCommand) -> None:
        self.history.reset()
        await self._send_status(WsStatus.CLEARED)

    async def _handle_set_language(self, cmd: ParsedCommand) -> None:
        new_lang = cmd.payload
        if new_lang in ("es", "en") and new_lang != self.language:
            await self._send_status(WsStatus.RECONNECTING)

            if not await self.audio.restart(new_lang):
                await self._send_error("Agent reconnection timeout")
                return

            self.language = new_lang
            self.coordinator.language = new_lang
            self.history.reset(new_lang)
            await self._send_status(WsStatus.LISTENING)
            logger.info(f"Session {self.session_id} restarted agent with language '{new_lang}'")

    async def _handle_set_prompt(self, cmd: ParsedCommand) -> None:
        try:
            self.plan_gate.require_feature(Feature.CUSTOM_PROMPTS)
        except FeatureBlockedError:
            await self._send_error("Custom prompts not available in your plan. Upgrade to Pro.")
            await self._send_status(WsStatus.FEATURE_BLOCKED)
            return
        custom_prompt = cmd.payload.strip()
        if custom_prompt:
            logger.info(f"Received set_prompt for session {self.session_id}: {custom_prompt[:100]}...")
            save_custom_prompt(self.language, custom_prompt)
            self.history.set_system_prompt(custom_prompt)
            logger.info("Updated conversation_history[0] with custom prompt")
            await self._send_status(WsStatus.PROMPT_SAVED)

    async def _handle_clear_prompt(self, cmd: ParsedCommand) -> None:
        try:
            self.plan_gate.require_feature(Feature.CUSTOM_PROMPTS)
        except FeatureBlockedError:
            await self._send_error("Custom prompts not available in your plan. Upgrade to Pro.")
            await self._send_status(WsStatus.FEATURE_BLOCKED)
            return
        logger.info(f"Received clear_prompt for session {self.session_id}")
        delete_custom_prompt(self.language)
        self.history.set_system_prompt(get_system_prompt(self.language))
        await self._send_status(WsStatus.PROMPT_CLEARED)

    async def _on_user_started_speaking(self) -> None:
        await self._send_status(WsStatus.LISTENING)
        await self._send_quota_update(speech_active=True)
