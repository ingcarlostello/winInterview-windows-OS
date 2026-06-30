"""WebSocket Origin allowlisting (defense-in-depth).

Starlette's CORSMiddleware only guards HTTP requests, NOT WebSocket handshakes.
The primary authentication for the WS endpoints is the opaque ``key`` (resolved
server-side via Convex), but we additionally check the handshake ``Origin``
header against the configured allowlist to reject obviously-foreign browser
origins.

Native clients (e.g. a Rust-owned socket) may not send an ``Origin`` header at
all; those are allowed through (auth still happens via the key). Enforcement is
opt-in via ``settings.enforce_ws_origin`` so the real Tauri WebView origin can
be confirmed from logs first.
"""

import logging

from fastapi import WebSocket

from backend.config import settings

logger = logging.getLogger(__name__)


def is_ws_origin_allowed(websocket: WebSocket, session_id: str) -> bool:
    """Return False only when enforcement is on, an Origin is present, and it is
    not in the allowlist. Always logs the observed Origin for diagnostics."""
    origin = websocket.headers.get("origin")
    logger.info(f"Session {session_id} WS Origin header: {origin!r}")

    if origin is None:
        return True
    if origin in settings.allowed_origins_list:
        return True

    if settings.enforce_ws_origin:
        logger.warning(
            f"Session {session_id} rejected: Origin {origin!r} not in allowlist "
            f"{settings.allowed_origins_list}"
        )
        return False

    logger.warning(
        f"Session {session_id} Origin {origin!r} not in allowlist "
        f"{settings.allowed_origins_list} (enforce_ws_origin=False; allowing)"
    )
    return True
