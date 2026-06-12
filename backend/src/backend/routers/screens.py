import base64
import logging
import uuid
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from backend.screen.capture import ScreenCapture
from backend.dependencies import get_vision_service
from backend.ws.message_types import WsMessageType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class AnalyzeScreensRequest(BaseModel):
    images: List[str]
    prompt: str


@router.post("/capture-screen")
async def capture_screen():
    """Captura pantalla independiente del WebSocket de audio."""
    try:
        capture = ScreenCapture()
        image_bytes = capture.capture_screen()
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")
        return {"image": image_base64}
    except Exception as e:
        logger.error(f"Screen capture failed: {e}", exc_info=True)
        raise


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
