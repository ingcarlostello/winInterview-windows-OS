from collections import deque


class ConversationContext:
    def __init__(self, max_messages: int = 10):
        self.messages = deque(maxlen=max_messages)

    def add(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    def get_context(self) -> list[dict]:
        return list(self.messages)

    def clear(self):
        self.messages.clear()
