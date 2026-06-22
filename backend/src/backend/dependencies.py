from functools import lru_cache

from backend.config import settings
from backend.llm.deepseek import DeepSeekLLMService
from backend.llm.protocol import LLMService
from backend.llm.vision import VisionLLMService
from backend.ws_manager import ConnectionManager


@lru_cache()
def get_connection_manager() -> ConnectionManager:
    return ConnectionManager()


@lru_cache()
def get_llm_service() -> LLMService:
    return DeepSeekLLMService(api_key=settings.deepseek_api_key)


@lru_cache()
def get_vision_service() -> VisionLLMService:
    return VisionLLMService(api_key=settings.minimax_api_key)
