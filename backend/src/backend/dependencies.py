from functools import lru_cache

from backend.config import settings
from backend.llm.nvidia import NvidiaLLMService
from backend.llm.protocol import LLMService
from backend.ws_manager import ConnectionManager


@lru_cache()
def get_connection_manager() -> ConnectionManager:
    return ConnectionManager()


@lru_cache()
def get_llm_service() -> LLMService:
    return NvidiaLLMService(api_key=settings.nvidia_api_key)
