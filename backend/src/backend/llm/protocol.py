from typing import AsyncIterator, Protocol


class LLMService(Protocol):
    async def stream_response(
        self,
        messages: list[dict[str, str]],
        session_id: str,
    ) -> AsyncIterator[str]:
        """Streams LLM response chunks given a conversation history."""
        ...
