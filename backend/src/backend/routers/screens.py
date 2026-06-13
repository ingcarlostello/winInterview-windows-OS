import logging
import uuid
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from backend.dependencies import get_vision_service
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
