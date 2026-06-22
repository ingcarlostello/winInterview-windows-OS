import logging
import uuid
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from backend.auth.clerk import verify_clerk_token
from backend.convex_client import ConvexClient
from backend.dependencies import get_vision_service
from backend.plan_gate import FeatureBlockedError, PlanGate, QuotaExceededError
from backend.tiers import Feature, PlanId, Quota
from backend.ws.message_types import WsMessageType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class AnalyzeScreensRequest(BaseModel):
    images: List[str]
    prompt: str


@router.websocket("/ws/analyze-screens")
async def analyze_screens_ws(websocket: WebSocket):
    """WebSocket para análisis de múltiples capturas de pantalla."""
    await websocket.accept()
    session_id = str(uuid.uuid4())

    token = websocket.query_params.get("token")
    clerk_id = None
    if token:
        try:
            payload = verify_clerk_token(token)
            clerk_id = payload.get("sub")
        except Exception as e:
            logger.error(f"Screen analysis token validation failed: {e}")

    if not clerk_id:
        await websocket.send_json({
            "type": WsMessageType.ERROR,
            "message": "Authentication required",
        })
        await websocket.close()
        return

    convex_client = ConvexClient()
    plan_id = PlanId.LITE
    remaining = None
    try:
        user_data = await convex_client.get_user_and_quota(clerk_id)
        if user_data:
            plan_id = user_data.plan_id
            remaining = user_data.remaining
            logger.info(f"Screen analysis {session_id} loaded plan {plan_id.value} from Convex")
    except Exception as e:
        logger.error(f"Failed to load plan from Convex for screen analysis {session_id}: {e}")

    plan_gate = PlanGate(
        plan_id=plan_id,
        remaining=remaining,
        clerk_id=clerk_id,
        convex_client=convex_client,
    )

    try:
        data = await websocket.receive_json()
        images = data.get("images", [])
        prompt = data.get("prompt", "")
        thinking_enabled = data.get("thinking_enabled", False)
        lang = websocket.query_params.get("lang", "es")

        if not images:
            await websocket.send_json({
                "type": WsMessageType.ERROR,
                "message": "No images provided"
            })
            return

        if len(images) > 1:
            try:
                plan_gate.require_feature(Feature.SIMULTANEOUS_ANALYSIS)
            except FeatureBlockedError:
                await websocket.send_json({
                    "type": WsMessageType.ERROR,
                    "message": "Simultaneous analysis not available in your plan. Upgrade to Pro."
                })
                return

        try:
            plan_gate.consume_quota(Quota.SCREEN_ANALYSES, len(images))
        except QuotaExceededError:
            await websocket.send_json({
                "type": WsMessageType.ERROR,
                "message": "Screen analysis quota exceeded. Upgrade your plan."
            })
            return

        if thinking_enabled and not plan_gate.can_use_feature(Feature.THINKING_MODE):
            thinking_enabled = False

        vision_service = get_vision_service()

        await websocket.send_json({
            "type": WsMessageType.STATUS,
            "status": "analyzing"
        })

        async for chunk in vision_service.analyze_multiple_screens(
            images, prompt, session_id, language=lang,
            thinking_enabled=thinking_enabled,
        ):
            await websocket.send_json({
                "type": WsMessageType.CHUNK,
                "content": chunk
            })

        try:
            await plan_gate.flush_to_convex()
        except Exception as e:
            logger.error(f"Failed to flush screen analysis quota to Convex: {e}")

        try:
            await websocket.send_json({
                "type": WsMessageType.PLAN_INFO,
                **plan_gate.get_plan_info(),
            })
        except Exception as e:
            logger.error(f"Failed to send plan_info for screen analysis {session_id}: {e}")

        await websocket.send_json({
            "type": WsMessageType.STATUS,
            "status": "completed"
        })

    except WebSocketDisconnect:
        logger.info(f"Screen analysis WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Screen analysis error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": WsMessageType.ERROR,
                "message": str(e)
            })
        except Exception:
            pass
    finally:
        try:
            await plan_gate.flush_to_convex()
        except Exception as e:
            logger.error(f"Failed to flush screen analysis quota to Convex: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
