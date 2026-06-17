import logging
import uuid
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

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

    plan_id_str = websocket.query_params.get("plan", "lite")
    try:
        plan_id = PlanId(plan_id_str)
    except ValueError:
        plan_id = PlanId.LITE
    plan_gate = PlanGate(plan_id=plan_id)

    try:
        data = await websocket.receive_json()
        images = data.get("images", [])
        prompt = data.get("prompt", "")

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

        vision_service = get_vision_service()

        await websocket.send_json({
            "type": WsMessageType.STATUS,
            "status": "analyzing"
        })

        async for chunk in vision_service.analyze_multiple_screens(
            images, prompt, session_id
        ):
            await websocket.send_json({
                "type": WsMessageType.CHUNK,
                "content": chunk
            })

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
            await websocket.close()
        except Exception:
            pass
