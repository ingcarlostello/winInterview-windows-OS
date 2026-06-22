import logging
from typing import AsyncIterator, List

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class VisionLLMService:
    """Servicio de vision para analisis de capturas de pantalla usando MiniMax M3."""

    def __init__(self, api_key: str) -> None:
        self.client = AsyncOpenAI(
            base_url="https://api.minimax.io/v1",
            api_key=api_key,
        )

    async def analyze_multiple_screens(
        self,
        images_base64: List[str],
        custom_prompt: str,
        session_id: str,
        language: str = "es",
        thinking_enabled: bool = False,
    ) -> AsyncIterator[str]:
        """Analiza una o multiples capturas de pantalla con contexto acumulativo.

        Usa un prompt por defecto adaptado al idioma y a la cantidad de imagenes
        (singular para 1 captura, plural para multiples).
        """
        logger.info(
            f"Vision analysis started for session {session_id} "
            f"with {len(images_base64)} images, language={language}, "
            f"thinking={thinking_enabled}"
        )

        is_multi = len(images_base64) > 1

        if language == "en":
            default_prompt = (
                "Analyze these screenshots in sequential order. "
                "Together they form a complete technical problem that may require scrolling to see all content. "
                "Provide a step-by-step solution in English.\n\n"
                "Structure your answer:\n"
                "1. **Analysis**: Description of the detected problem\n"
                "2. **Suggested Solution**: Code or steps to solve it\n\n"
                "Be concise. Use markdown formatting. Include code blocks when relevant."
                if is_multi
                else (
                    "Analyze this screenshot from a technical interview. "
                    "Identify the problem and provide a step-by-step solution in English.\n\n"
                    "Structure your answer:\n"
                    "1. **Problem**: Summary of the detected problem\n"
                    "2. **Suggested Solution**: Code or steps to solve it\n\n"
                    "Be concise. Use markdown formatting. Include code blocks when relevant."
                )
            )
        else:
            default_prompt = (
                "Analiza estas capturas de pantalla en orden secuencial. "
                "Juntas forman un problema tecnico completo que puede requerir scroll para ver todo el contenido. "
                "Proporciona una solucion paso a paso en espanol.\n\n"
                "Estructura tu respuesta:\n"
                "1. **Analisis**: Descripcion del problema detectado\n"
                "2. **Solucion sugerida**: Codigo o pasos para resolverlo\n\n"
                "Se conciso. Usa formato markdown. Incluye bloques de codigo cuando sea relevante."
                if is_multi
                else (
                    "Analiza esta captura de pantalla de una entrevista tecnica. "
                    "Identifica el problema y proporciona una solucion paso a paso en espanol.\n\n"
                    "Estructura tu respuesta:\n"
                    "1. **Problema**: Resumen del problema detectado\n"
                    "2. **Solucion sugerida**: Codigo o pasos para resolverlo\n\n"
                    "Se conciso. Usa formato markdown. Incluye bloques de codigo cuando sea relevante."
                )
            )

        prompt = custom_prompt.strip() if custom_prompt.strip() else default_prompt

        content_parts = [{"type": "text", "text": prompt}]

        for image_base64 in images_base64:
            content_parts.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{image_base64}"
                },
            })

        messages = [
            {
                "role": "user",
                "content": content_parts,
            }
        ]

        try:
            completion = await self.client.chat.completions.create(
                model="MiniMax-M3",
                messages=messages,
                max_completion_tokens=16384,
                temperature=1.0,
                top_p=0.95,
                extra_body=(
                    {"thinking": {"type": "adaptive"}}
                    if thinking_enabled
                    else {"thinking": {"type": "disabled"}}
                ),
                stream=True,
            )
            async for chunk in completion:
                if not getattr(chunk, "choices", None):
                    continue
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            logger.error(
                f"Vision analysis error for session {session_id}: {e}",
                exc_info=True,
            )
            raise
