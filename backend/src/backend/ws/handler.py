import logging
import uuid

from fastapi import Depends, WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from backend.convex_client import ConvexClient
from backend.dependencies import get_connection_manager, get_llm_service, get_vision_service
from backend.llm.protocol import LLMService
from backend.llm.vision import VisionLLMService
from backend.plan_gate import PlanGate
from backend.tiers import PlanId
from backend.ws.command_parser import create_default_parser
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
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return

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

    session_id = str(uuid.uuid4())[:8]
    initial_language = websocket.query_params.get("lang", "es")
    if initial_language not in ("es", "en"):
        initial_language = "es"

    convex_client = ConvexClient()
    plan_id = PlanId.LITE
    remaining = None
    custom_prompt: str | None = None
    try:
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

    session = AgentSession(
        session_id=session_id,
        websocket=websocket,
        llm_service=llm_service,
        manager=manager,
        vision_service=vision_service,
        plan_gate=plan_gate,
        initial_language=initial_language,
        custom_prompt=custom_prompt,
    )
    
    if not await session.start():
        return
        
    parser = create_default_parser()
        
    try:
        while True:
            msg = await websocket.receive_text()
            cmd = parser.parse(msg)
            if cmd:
                await session.handle_command(cmd)
            else:
                logger.warning(f"Unknown command received in session {session_id}: {msg}")
    except (WebSocketDisconnect, ConnectionClosed, RuntimeError):
        logger.info(f"Session {session_id} disconnected normally")
    except Exception as e:
        logger.error(f"Unexpected error in session {session_id}: {e}", exc_info=True)
    finally:
        await session.stop()
