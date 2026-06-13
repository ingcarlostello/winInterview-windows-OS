from backend.ws.commands import ParsedCommand, WsCommand


class ExactMatchHandler:
    """Matches a raw message string exactly against a WsCommand value."""

    def __init__(self, command: WsCommand) -> None:
        self._command = command

    def parse(self, message: str) -> ParsedCommand | None:
        if message == self._command.value:
            return ParsedCommand(self._command)
        return None


class PrefixMatchHandler:
    """Matches a raw message starting with '<command>:' and extracts payload after the colon."""

    COMMAND_SEPARATOR = ":"

    def __init__(self, command: WsCommand) -> None:
        self._prefix = f"{command.value}{self.COMMAND_SEPARATOR}"
        self._command = command

    def parse(self, message: str) -> ParsedCommand | None:
        if message.startswith(self._prefix):
            return ParsedCommand(self._command, message[len(self._prefix):])
        return None


class CommandParser:
    """Registry-based command parser. Handlers are checked in registration order."""

    def __init__(self) -> None:
        self._handlers: list[ExactMatchHandler | PrefixMatchHandler] = []

    def register(self, handler: ExactMatchHandler | PrefixMatchHandler) -> None:
        self._handlers.append(handler)

    def parse(self, message: str) -> ParsedCommand | None:
        for handler in self._handlers:
            result = handler.parse(message)
            if result:
                return result
        return None


def create_default_parser() -> CommandParser:
    """Builds a CommandParser pre-registered with all standard WsCommand handlers."""
    parser = CommandParser()

    for cmd in (
        WsCommand.PAUSE,
        WsCommand.RESUME,
        WsCommand.CLEAR,
        WsCommand.CLEAR_PROMPT,
    ):
        parser.register(ExactMatchHandler(cmd))

    for cmd in (WsCommand.SET_LANGUAGE, WsCommand.SET_PROMPT):
        parser.register(PrefixMatchHandler(cmd))

    return parser
