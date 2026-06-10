import logging
from typing import AsyncIterator, List

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class VisionLLMService:
    """Servicio de visión para análisis de capturas de pantalla usando Qwen via NVIDIA."""

    def __init__(self, api_key: str) -> None:
        self.client = AsyncOpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=api_key,
        )

    async def analyze_screen(
        self,
        image_base64: str,
        session_id: str,
    ) -> AsyncIterator[str]:
        logger.info(f"Vision analysis started for session {session_id}")

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}"
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "You are analyzing a screenshot from a technical coding interview. "
                            "The screen shows a coding problem (likely LeetCode, HackerRank, or similar).\n\n"
                            "Analyze the image and respond in Spanish with this structure:\n\n"
                            "1. Problema: Brief summary of what the problem asks\n"
                            "2. Restricciones: Input/output constraints if visible\n"
                            "3. Ejemplos: Test cases shown\n"
                            "4. Código visible: Any code already in the editor\n"
                            "5. Solución sugerida: Brief approach to solve it with code example\n\n"
                            "Be concise. Use markdown formatting. Include code blocks when relevant."
                        ),
                    },
                ],
            }
        ]

        try:
            completion = await self.client.chat.completions.create(
                model="qwen/qwen3.5-397b-a17b",
                messages=messages,
                max_tokens=16384,
                temperature=0.60,
                top_p=0.95,
                extra_body={
                    "top_k": 20,
                    "presence_penalty": 0,
                    "repetition_penalty": 1,
                    "chat_template_kwargs": {"enable_thinking": True},
                },
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
                f"Vision analysis error for session {session_id}: {e}", exc_info=True
            )
            raise

    async def analyze_multiple_screens(
        self,
        images_base64: List[str],
        custom_prompt: str,
        session_id: str,
    ) -> AsyncIterator[str]:
        """Analiza múltiples capturas de pantalla con contexto acumulativo."""
        logger.info(
            f"Multi-screen vision analysis started for session {session_id} "
            f"with {len(images_base64)} images"
        )

        default_prompt = (
            "Analiza estas capturas de pantalla en orden secuencial. "
            "Juntas forman un problema técnico completo que puede requerir scroll para ver todo el contenido. "
            "Proporciona una solución paso a paso en español.\n\n"
            "Estructura tu respuesta:\n"
            "1. **Análisis de la captura**: Descripción del problema detectado\n"
            "2. **Solución sugerida**: Código o pasos para resolverlo\n\n"
            "Sé conciso. Usa formato markdown. Incluye bloques de código cuando sea relevante."
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
                model="qwen/qwen3.5-397b-a17b",
                messages=messages,
                max_tokens=16384,
                temperature=0.60,
                top_p=0.95,
                extra_body={
                    "top_k": 20,
                    "presence_penalty": 0,
                    "repetition_penalty": 1,
                    "chat_template_kwargs": {"enable_thinking": True},
                },
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
                f"Multi-screen vision analysis error for session {session_id}: {e}",
                exc_info=True,
            )
            raise
