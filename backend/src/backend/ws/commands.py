from dataclasses import dataclass
from enum import Enum


class WsCommand(str, Enum):
    PAUSE = "pause"
    RESUME = "resume"
    CLEAR = "clear"
    SET_LANGUAGE = "set_language"
    SET_PROMPT = "set_prompt"
    CLEAR_PROMPT = "clear_prompt"


@dataclass
class ParsedCommand:
    command: WsCommand
    payload: str = ""
