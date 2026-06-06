import json
from pathlib import Path

DEFAULT_PROMPT_ES = """Eres un asistente en tiempo real que proporciona información al usuario durante reuniones y otros flujos de trabajo. Tu objetivo es responder directamente a las consultas del usuario."""

DEFAULT_PROMPT_EN = """You are a real-time assistant providing information to the user during meetings and other workflows. Your goal is to directly answer user queries."""

PROMPTS_FILE = Path(__file__).parent.parent / "data" / "prompts.json"


def _load_custom_prompts() -> dict[str, str]:
    if PROMPTS_FILE.exists():
        try:
            with open(PROMPTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def _save_custom_prompts(prompts: dict[str, str]) -> None:
    PROMPTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROMPTS_FILE, "w", encoding="utf-8") as f:
        json.dump(prompts, f, indent=2, ensure_ascii=False)


def get_system_prompt(language: str = "es") -> str:
    custom = _load_custom_prompts()
    if language in custom and custom[language].strip():
        return custom[language]
    return DEFAULT_PROMPT_ES if language == "es" else DEFAULT_PROMPT_EN


def save_custom_prompt(language: str, prompt: str) -> bool:
    if not prompt.strip():
        return False
    custom = _load_custom_prompts()
    custom[language] = prompt.strip()
    _save_custom_prompts(custom)
    return True


def delete_custom_prompt(language: str) -> bool:
    custom = _load_custom_prompts()
    if language in custom:
        del custom[language]
        _save_custom_prompts(custom)
    return True


def get_active_prompt_info(language: str) -> dict:
    custom = _load_custom_prompts()
    has_custom = language in custom and custom[language].strip()
    return {
        "language": language,
        "has_custom": has_custom,
        "custom_prompt": custom.get(language, ""),
        "default_prompt": DEFAULT_PROMPT_ES if language == "es" else DEFAULT_PROMPT_EN,
    }


class PromptBuilder:
    def __init__(self):
        pass

    def build_messages(
        self, context: list[dict[str, str]], current_question: str
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": get_system_prompt()},
        ]

        for msg in context:
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append(
            {"role": "user", "content": f"Pregunta del entrevistador: {current_question}"}
        )

        return messages