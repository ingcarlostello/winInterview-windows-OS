from enum import Enum


class WsMessageType(str, Enum):
    """Message type values for the 'type' field in WebSocket JSON messages."""

    STATUS = "status"
    TRANSCRIPTION = "transcription"
    CHUNK = "chunk"
    ERROR = "error"
    SCREEN_CHUNK = "screen_chunk"
    SCREEN_IMAGE = "screen_image"


class WsStatus(str, Enum):
    """Status values sent via WebSocket messages of type 'status'."""

    CONNECTED = "connected"
    LISTENING = "listening"
    THINKING = "thinking"
    RESPONDING = "responding"
    PAUSED = "paused"
    RECONNECTING = "reconnecting"
    CLEARED = "cleared"
    CAPTURING = "capturing"

    ANALYZING = "analyzing"
    COMPLETED = "completed"

    PROMPT_SAVED = "prompt_saved"
    PROMPT_CLEARED = "prompt_cleared"
