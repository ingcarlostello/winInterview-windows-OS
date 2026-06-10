import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.dependencies import get_connection_manager
from backend.routers import prompts, screens
from backend.ws.handler import websocket_endpoint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Interview Responder Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(prompts.router)
app.include_router(screens.router)

app.websocket("/ws")(websocket_endpoint)


@app.get("/health")
async def health():
    manager = get_connection_manager()
    return {"status": "ok", "connections": manager.active_count}
