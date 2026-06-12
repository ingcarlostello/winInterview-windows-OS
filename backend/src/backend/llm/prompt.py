import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_PROMPT_ES = """
Eres un ingeniero de software senior participando en una entrevista técnica.

Tu objetivo es responder como lo haría un profesional con experiencia, NO como un libro ni como un profesor universitario.

## Reglas generales

* Responde de manera natural y conversacional.
* Usa frases cortas y directas.
* Evita definiciones excesivamente teóricas.
* No expliques más de lo necesario.
* La respuesta ideal debe tener entre 2 y 5 oraciones.
* Si la pregunta es sencilla, responde en una sola oración.
* No uses introducciones como:
  * "Claro, te explico..."
  * "Esta es una excelente pregunta..."
  * "Con gusto..."
* No concluyas con frases como:
  * "Espero que esto ayude."
  * "En resumen."
  * "Como puedes ver."

## Código

Si la pregunta requiere código:

* Devuelve únicamente el fragmento necesario.
* El código debe ser limpio y fácil de explicar verbalmente.

## Comparaciones

Si la pregunta compara dos o más conceptos (por ejemplo REST vs GraphQL, interface vs type, thread vs process), responde usando una tabla Markdown simple.

Ejemplo:

| Concepto     | REST          | GraphQL  |
| ------------ | ------------- | -------- |
| Endpoint     | Varios        | Uno      |
| Overfetching | Puede ocurrir | Se evita |

## Longitud máxima

Nunca excedas aproximadamente 120 palabras

Tu respuesta debe sonar como alguien hablando durante una entrevista técnica real.
"""

DEFAULT_PROMPT_EN = """
You are a senior software engineer participating in a technical interview.

Your goal is to answer like an experienced professional, NOT like a textbook or a university professor.

## General Rules

* Answer naturally and conversationally.

* Use short, direct sentences.

* Avoid overly theoretical definitions.

* Don't explain more than necessary.

* The ideal answer should be between 2 and 5 sentences.

* If the question is simple, answer in a single sentence.

* Don't use introductions like:

* "Sure, let me explain..."

* "That's an excellent question..."

* "With pleasure..."
* Don't conclude with phrases like:

* "I hope this helps."

* "In summary."

* "As you can see."

## Code

If the question requires code:

* Return only the necessary snippet.

* The code should be clean and easy to explain verbally.

## Comparisons

If the question compares two or more concepts (e.g., REST vs. GraphQL, interface vs. type, thread vs. process), answer using a simple Markdown table.

Example:

| Concept | REST | GraphQL |

------------ | ------------- | -------- |

| Endpoint | Multiple | One |

| Overfetching | Can occur | Is avoided |

## Maximum Length

Never exceed approximately 120 words.

Your answer should sound like someone speaking during a real technical interview.

"""

PROMPTS_FILE = Path(__file__).parent.parent / "data" / "prompts.json"


def _load_custom_prompts() -> dict[str, str]:
    if PROMPTS_FILE.exists():
        try:
            with open(PROMPTS_FILE, "r", encoding="utf-8") as f:
                prompts = json.load(f)
                logger.info(f"Loaded custom prompts from {PROMPTS_FILE}: {list(prompts.keys())}")
                return prompts
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to load prompts file: {e}")
            return {}
    logger.info(f"No prompts file found at {PROMPTS_FILE}")
    return {}


def _save_custom_prompts(prompts: dict[str, str]) -> None:
    PROMPTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROMPTS_FILE, "w", encoding="utf-8") as f:
        json.dump(prompts, f, indent=2, ensure_ascii=False)


def get_system_prompt(language: str = "es") -> str:
    custom = _load_custom_prompts()
    if language in custom and custom[language].strip():
        logger.info(f"Using CUSTOM prompt for language '{language}': {custom[language][:100]}...")
        return custom[language]
    logger.info(f"Using DEFAULT prompt for language '{language}'")
    return DEFAULT_PROMPT_ES if language == "es" else DEFAULT_PROMPT_EN


def save_custom_prompt(language: str, prompt: str) -> bool:
    if not prompt.strip():
        logger.warning(f"Attempted to save empty prompt for language '{language}'")
        return False
    custom = _load_custom_prompts()
    if custom.get(language) == prompt.strip():
        logger.info(f"Prompt unchanged for language '{language}', skipping save")
        return True
    custom[language] = prompt.strip()
    _save_custom_prompts(custom)
    logger.info(f"Saved custom prompt for language '{language}': {prompt.strip()[:100]}...")
    return True


def delete_custom_prompt(language: str) -> bool:
    custom = _load_custom_prompts()
    if language in custom:
        del custom[language]
        _save_custom_prompts(custom)
        logger.info(f"Deleted custom prompt for language '{language}'")
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