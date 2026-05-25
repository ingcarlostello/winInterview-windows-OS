import os
from collections.abc import AsyncGenerator

from dashscope.aigc.generation import AioGeneration


class LLMClient:
    def __init__(self):
        self.model = "qwen2.5-coder-32b-instruct"
        self._api_key: str | None = None

    @property
    def api_key(self) -> str | None:
        if self._api_key is None:
            self._api_key = os.getenv("DASHSCOPE_API_KEY")
        return self._api_key

    async def stream_response(
        self, messages: list[dict[str, str]]
    ) -> AsyncGenerator[str, None]:
        responses = await AioGeneration.call(
            model=self.model,
            messages=messages,
            stream=True,
            incremental_output=True,
            result_format="message",
            api_key=self.api_key,
        )

        async for response in responses:
            if (
                response.status_code == 200
                and response.output
                and response.output.choices
            ):
                content = response.output.choices[0].message.content
                if content:
                    yield content

    async def validate_api_key(self) -> bool:
        try:
            responses = await AioGeneration.call(
                model=self.model,
                messages=[{"role": "user", "content": "test"}],
                stream=True,
                incremental_output=False,
                result_format="message",
                api_key=self.api_key,
            )
            async for _ in responses:
                pass
            return True
        except Exception:
            return False
