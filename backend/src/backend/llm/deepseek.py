import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

from backend.llm.protocol import LLMService

logger = logging.getLogger(__name__)


class DeepSeekLLMService(LLMService):
    def __init__(self, api_key: str) -> None:
        self.client = AsyncOpenAI(
            base_url="https://api.deepseek.com",
            api_key=api_key,
        )

    async def stream_response(
        self,
        messages: list[dict[str, str]],
        session_id: str,
    ) -> AsyncIterator[str]:
        logger.info(f"Sending to DeepSeek model. System prompt: {messages[0]['content'][:150]}...")
        if len(messages) > 1:
            logger.info(f"User message: {messages[-1]['content'][:100]}...")

        try:
            completion = await self.client.chat.completions.create(
                model="deepseek-v4-flash",
                messages=messages,
                # temperature=0.20,
                # max_tokens=512,
                stream=True,
            )
            async for chunk in completion:
                if not getattr(chunk, "choices", None):
                    continue
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            logger.error(f"DeepSeek LLM streaming error for session {session_id}: {e}", exc_info=True)
            raise
