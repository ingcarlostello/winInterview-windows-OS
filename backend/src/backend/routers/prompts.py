from fastapi import APIRouter
from pydantic import BaseModel

from backend.llm.prompt import delete_custom_prompt, get_active_prompt_info, save_custom_prompt

router = APIRouter()


class PromptRequest(BaseModel):
    language: str
    prompt: str


@router.get("/prompt")
async def get_prompt(language: str = "es"):
    if language not in ("es", "en"):
        language = "es"
    return get_active_prompt_info(language)


@router.post("/prompt")
async def set_prompt(req: PromptRequest):
    if req.language not in ("es", "en"):
        return {"success": False, "error": "Invalid language"}
    if not req.prompt.strip():
        return {"success": False, "error": "Prompt cannot be empty"}
    success = save_custom_prompt(req.language, req.prompt)
    return {"success": success}


@router.delete("/prompt")
async def clear_prompt(language: str = "es"):
    if language not in ("es", "en"):
        language = "es"
    delete_custom_prompt(language)
    return {"success": True}
