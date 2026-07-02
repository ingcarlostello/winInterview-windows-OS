import json

from fastapi import WebSocket

from backend.ws.message_types import WsMessageType, WsStatus


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[session_id] = websocket

    def disconnect(self, session_id: str) -> None:
        if session_id in self._connections:
            del self._connections[session_id]

    async def send(self, session_id: str, msg_type: str, data: dict) -> None:
        ws = self._connections.get(session_id)
        if ws:
            try:
                await ws.send_text(
                    json.dumps({"type": msg_type, "data": data}, ensure_ascii=False)
                )
            except Exception:
                pass

    async def send_status(self, session_id: str, status: WsStatus) -> None:
        await self.send(session_id, WsMessageType.STATUS, {"status": status})

    async def send_transcription(self, session_id: str, text: str) -> None:
        await self.send(session_id, WsMessageType.TRANSCRIPTION, {"text": text})

    async def send_response_chunk(self, session_id: str, chunk: str) -> None:
        await self.send(session_id, WsMessageType.CHUNK, {"content": chunk})

    async def send_error(self, session_id: str, error: str) -> None:
        await self.send(session_id, WsMessageType.ERROR, {"message": error})

    @property
    def active_count(self) -> int:
        return len(self._connections)
