import logging
import uuid

from fastapi import Depends, WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from backend.dependencies import get_connection_manager, get_llm_service
from backend.llm.protocol import LLMService
from backend.ws.commands import parse_command
from backend.ws.session import AgentSession
from backend.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)


async def websocket_endpoint(
    websocket: WebSocket,
    llm_service: LLMService = Depends(get_llm_service),
    manager: ConnectionManager = Depends(get_connection_manager),
) -> None:
    session_id = str(uuid.uuid4())[:8]
    initial_language = websocket.query_params.get("lang", "es")
    custom_prompt = websocket.query_params.get("prompt")
    
    session = AgentSession(
        session_id=session_id,
        websocket=websocket,
        llm_service=llm_service,
        manager=manager,
        initial_language=initial_language,
        custom_prompt=custom_prompt,
    )
    
    if not await session.start():
        return
        
    try:
        while True:
            msg = await websocket.receive_text()
            cmd = parse_command(msg)
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
