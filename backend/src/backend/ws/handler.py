import logging
import uuid

from fastapi import Depends, WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from backend.convex_client import ConvexClient
from backend.dependencies import get_connection_manager, get_llm_service, get_vision_service
from backend.llm.protocol import LLMService
from backend.llm.vision import VisionLLMService
from backend.plan_gate import PlanGate
from backend.tiers import Feature, PlanId
from backend.ws.command_parser import create_default_parser
from backend.ws.security import is_ws_origin_allowed
from backend.ws.session import AgentSession
from backend.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)


async def websocket_endpoint(
    websocket: WebSocket,
    llm_service: LLMService = Depends(get_llm_service),
    vision_service: VisionLLMService = Depends(get_vision_service),
    manager: ConnectionManager = Depends(get_connection_manager),
) -> None:
    token = websocket.query_params.get("token")
    key = websocket.query_params.get("key")
    if not token and not key:
        await websocket.close(code=1008, reason="Missing token or key")
        return

    session_id = str(uuid.uuid4())[:8]

    if not is_ws_origin_allowed(websocket, session_id):
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    initial_language = websocket.query_params.get("lang", "es")
    if initial_language not in ("es", "en"):
        initial_language = "es"

    convex_client = ConvexClient()
    clerk_id: str | None = None
    user_data = None

    if key:
        # Desktop key-login: resolve the key to its owner + plan/quota in one call.
        try:
            resolved = await convex_client.get_user_by_key(key)
        except Exception as e:
            logger.error(f"Key validation failed for session {session_id}: {e}")
            await websocket.close(code=1008, reason="Invalid key")
            return
        if not resolved:
            await websocket.close(code=1008, reason="Invalid key")
            return
        clerk_id, user_data = resolved
    else:
        # Clerk JWT login (browser/desktop Clerk session).
        try:
            from backend.auth.clerk import verify_clerk_token
            payload = verify_clerk_token(token)
            clerk_id = payload.get("sub")
            if not clerk_id:
                raise ValueError("Token missing subject")
        except Exception as e:
            logger.error(f"Token validation failed: {e}")
            await websocket.close(code=1008, reason="Invalid token")
            return

    plan_id = PlanId.LITE
    remaining = None
    custom_prompt: str | None = None
    try:
        if user_data is None:
            user_data = await convex_client.get_user_and_quota(clerk_id)
        if user_data:
            plan_id = user_data.plan_id
            remaining = user_data.remaining
            custom_prompt = user_data.prompts.get(initial_language)
            logger.info(f"Session {session_id} loaded plan {plan_id.value} from Convex")
        else:
            logger.warning(f"Session {session_id} could not load user data from Convex")
    except Exception as e:
        logger.error(f"Failed to load plan from Convex for session {session_id}: {e}")
        plan_id_str = websocket.query_params.get("plan", "lite")
        try:
            plan_id = PlanId(plan_id_str)
        except ValueError:
            plan_id = PlanId.LITE

    plan_gate = PlanGate(
        plan_id=plan_id,
        remaining=remaining,
        clerk_id=clerk_id,
        convex_client=convex_client,
    )

    # Audio source: mic-only is the default and is always allowed. Capturing the
    # system audio (loopback) and mixing both are Ultra-only features; if the plan
    # lacks them we silently fall back to mic (same pattern as thinking_mode).
    audio_source = websocket.query_params.get("audio_source", "mic")
    if audio_source not in ("mic", "system", "both"):
        audio_source = "mic"
    if audio_source == "system" and not plan_gate.can_use_feature(Feature.SYSTEM_AUDIO_CAPTURE):
        logger.info(f"Session {session_id} requested system audio but plan {plan_id.value} lacks it; using mic")
        audio_source = "mic"
    elif audio_source == "both" and not plan_gate.can_use_feature(Feature.SIMULTANEOUS_AUDIO):
        logger.info(f"Session {session_id} requested mixed audio but plan {plan_id.value} lacks it; using mic")
        audio_source = "mic"

    session = AgentSession(
        session_id=session_id,
        websocket=websocket,
        llm_service=llm_service,
        manager=manager,
        vision_service=vision_service,
        plan_gate=plan_gate,
        initial_language=initial_language,
        custom_prompt=custom_prompt,
        audio_source=audio_source,
    )
    
    if not await session.start():
        return
        
    parser = create_default_parser()

    try:
        # The client streams two kinds of messages on this single socket:
        #   - text  → control commands (pause/resume/set_language/...)
        #   - bytes → raw 16 kHz mono int16 PCM audio frames (640 B / 20 ms),
        #             captured client-side (Tauri/Rust) and forwarded to Deepgram.
        # We use the low-level receive() (not receive_text()) so one socket can
        # carry both; exactly one of "text"/"bytes" is set per message.
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            text = message.get("text")
            if text is not None:
                cmd = parser.parse(text)
                if cmd:
                    await session.handle_command(cmd)
                else:
                    logger.warning(f"Unknown command received in session {session_id}: {text}")
                continue

            data = message.get("bytes")
            if data:
                session.feed_audio(data)
    except (WebSocketDisconnect, ConnectionClosed, RuntimeError):
        logger.info(f"Session {session_id} disconnected normally")
    except Exception as e:
        logger.error(f"Unexpected error in session {session_id}: {e}", exc_info=True)
    finally:
        await session.stop()
