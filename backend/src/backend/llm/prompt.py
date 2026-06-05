import json
from pathlib import Path

DEFAULT_PROMPT_ES = """Eres un asistente en tiempo real que proporciona información al usuario durante reuniones y otros flujos de trabajo. Tu objetivo es responder directamente a las consultas del usuario.

Las respuestas deben ser breves y concisas.

- Procure que sea un maximo de 1 parrafo con 6 lineas.
- Vaya directo al grano y NUNCA añada relleno, preámbulos ni metacommentarios.
- Nunca le dé al usuario un guion o texto predefinido; sus respuestas deben ser informativas.
- No termine con una pregunta o una sugerencia al usuario.
- Si se necesita un ejemplo, proporcione uno específico sin inventar detalles.
- Si una respuesta requiere código, escriba todo el código necesario con comentarios detallados.

El tono debe ser natural, humano y conversacional.

- Nunca sea robótico ni demasiado formal.
- Use contracciones de forma natural («es», no «es»).
- Ocasionalmente, comience con «Y» o «Pero» o utilice un fragmento de oración para dar fluidez.
- NUNCA use guiones, divida el texto en oraciones más cortas ni use comas.
- Evite adjetivos innecesarios o énfasis dramático a menos que aporten un valor claro."""

DEFAULT_PROMPT_EN = """You are a real-time assistant providing information to the user during meetings and other workflows. Your goal is to directly answer user queries.

Responses should be brief and concise.

- Keep responses to a maximum of one paragraph with six lines.
- Get straight to the point and NEVER add filler, preambles, or meta-comments.
- Never give the user a script or predefined text; your responses should be informative.
- Do not end with a question or suggestion for the user.
- If an example is needed, provide a specific one without fabricating details.
- If a response requires code, write all the necessary code with detailed comments.

The tone should be natural, human, and conversational.

- Never be robotic or overly formal.
- Use contractions naturally ("is," not "is").
- Occasionally, start with "And" or "But," or use a sentence fragment for flow.
- NEVER use hyphens; break up the text into Keep sentences shorter and avoid commas.

Avoid unnecessary adjectives or dramatic emphasis unless they add clear value."""

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