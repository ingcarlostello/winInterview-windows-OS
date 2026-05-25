SYSTEM_PROMPT = """Eres un asistente silencioso para entrevistas en tiempo real.
Tu función es actuar como "apuntador de teatro".

Reglas:
1. Responde SIEMPRE en español.
2. Máximo 3 viñetas cortas (bullet points).
3. Cada viñeta debe leerse en menos de 2 segundos.
4. Si la pregunta es técnica, incluye 1 mini-ejemplo de código (máximo 3 líneas).
5. Sé conciso. No des explicaciones largas.
6. No saludes ni des introducciones.
7. Formatea tu respuesta así:
   - Viñeta 1
   - Viñeta 2
   - Viñeta 3
   ` + "`" + "`" + "`" + `
   ejemplo de código (si aplica)
   ` + "`" + "`" + "`" + `
"""


class PromptBuilder:
    def __init__(self):
        pass

    def build_messages(
        self, context: list[dict[str, str]], current_question: str
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        for msg in context:
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append(
            {"role": "user", "content": f"Pregunta del entrevistador: {current_question}"}
        )

        return messages
