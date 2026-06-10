from dataclasses import dataclass
from enum import Enum


class WsCommand(str, Enum):
    PAUSE = "pause"
    RESUME = "resume"
    CLEAR = "clear"
    SET_LANGUAGE = "set_language"
    SET_PROMPT = "set_prompt"
    CLEAR_PROMPT = "clear_prompt"
    CAPTURE_SCREEN = "capture_screen"


@dataclass
class ParsedCommand:
    command: WsCommand
    payload: str = ""


def parse_command(message: str) -> ParsedCommand | None:
    if message == WsCommand.PAUSE:
        return ParsedCommand(command=WsCommand.PAUSE)
    if message == WsCommand.RESUME:
        return ParsedCommand(command=WsCommand.RESUME)
    if message == WsCommand.CLEAR:
        return ParsedCommand(command=WsCommand.CLEAR)
    if message == WsCommand.CLEAR_PROMPT:
        return ParsedCommand(command=WsCommand.CLEAR_PROMPT)
    if message.startswith(f"{WsCommand.SET_LANGUAGE}:"):
        payload = message[len(f"{WsCommand.SET_LANGUAGE}:"):]
        return ParsedCommand(command=WsCommand.SET_LANGUAGE, payload=payload)
    if message.startswith(f"{WsCommand.SET_PROMPT}:"):
        payload = message[len(f"{WsCommand.SET_PROMPT}:"):]
        return ParsedCommand(command=WsCommand.SET_PROMPT, payload=payload)
    if message == WsCommand.CAPTURE_SCREEN:
        return ParsedCommand(command=WsCommand.CAPTURE_SCREEN)
    
    return None
