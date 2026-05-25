import json
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[session_id] = websocket
        logger.info("WebSocket connected: %s", session_id)

    def disconnect(self, session_id: str) -> None:
        if session_id in self._connections:
            del self._connections[session_id]
            logger.info("WebSocket disconnected: %s", session_id)

    async def send(self, session_id: str, msg_type: str, data: dict) -> None:
        ws = self._connections.get(session_id)
        if ws:
            try:
                await ws.send_text(
                    json.dumps({"type": msg_type, "data": data}, ensure_ascii=False)
                )
            except Exception as e:
                logger.error("Send error for %s: %s", session_id, e)

    async def send_status(self, session_id: str, status: str) -> None:
        await self.send(session_id, "status", {"status": status})

    async def send_transcription(self, session_id: str, text: str) -> None:
        await self.send(session_id, "transcription", {"text": text})

    async def send_response_chunk(self, session_id: str, chunk: str) -> None:
        await self.send(session_id, "chunk", {"content": chunk})

    async def send_error(self, session_id: str, error: str) -> None:
        await self.send(session_id, "error", {"message": error})

    @property
    def active_count(self) -> int:
        return len(self._connections)
