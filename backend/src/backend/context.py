from backend.llm.prompt import get_system_prompt


class ConversationHistory:
    """Manages the conversation message list with system prompt preservation and trimming."""

    MAX_MESSAGES = 20

    def __init__(self, language: str, custom_prompt: str | None = None) -> None:
        self._language = language
        system_prompt = (
            custom_prompt.strip()
            if custom_prompt and custom_prompt.strip()
            else get_system_prompt(language)
        )
        self._messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]

    @property
    def messages(self) -> list[dict[str, str]]:
        return self._messages

    def add_user_message(self, text: str) -> None:
        self._messages.append({"role": "user", "content": text})
        self._trim()

    def add_assistant_message(self, text: str) -> None:
        self._messages.append({"role": "assistant", "content": text})
        self._trim()

    def set_system_prompt(self, prompt: str) -> None:
        self._messages[0]["content"] = prompt

    def reset(self, language: str | None = None) -> None:
        lang = language if language is not None else self._language
        self._language = lang
        self._messages = [
            {"role": "system", "content": get_system_prompt(lang)}
        ]

    def _trim(self) -> None:
        if len(self._messages) > self.MAX_MESSAGES:
            excess = len(self._messages) - self.MAX_MESSAGES
            self._messages = [
                self._messages[0],
                *self._messages[1 + excess :],
            ]
