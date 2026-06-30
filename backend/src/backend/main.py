import logging

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.dependencies import get_connection_manager
from backend.routers import screens
from backend.ws.handler import websocket_endpoint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Interview Responder Backend")

# Explicit origin allowlist (no wildcard). The desktop app is a Tauri WebView
# whose origin is e.g. "http://tauri.localhost" (Windows) / "tauri://localhost"
# (macOS); dev uses "http://localhost:5173". Configure via ALLOWED_ORIGINS.
# allow_credentials is False because the desktop authenticates with an opaque
# key in the WS query string, not cookies (and "*" + credentials is invalid).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(screens.router)

app.websocket("/ws")(websocket_endpoint)


@app.get("/health")
async def health():
    manager = get_connection_manager()
    return {"status": "ok", "connections": manager.active_count}
