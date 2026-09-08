import asyncio

from google import genai
from google.genai import types

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.chat import ContextMessage


class GeminiService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate(self, question: str, history: list[ContextMessage]) -> str:
        if not self._settings.gemini_api_key:
            raise AppError(
                code="AI_NOT_CONFIGURED",
                message="AI 서비스 설정이 완료되지 않았습니다.",
                status_code=503,
            )

        contents: list[types.Content] = []
        for message in history:
            contents.extend(
                [
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=message.question)],
                    ),
                    types.Content(
                        role="model",
                        parts=[types.Part.from_text(text=message.answer)],
                    ),
                ]
            )
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=question)],
            )
        )

        client = genai.Client(
            api_key=self._settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=int(self._settings.gemini_timeout_seconds * 1000),
                retry_options=types.HttpRetryOptions(
                    attempts=3,
                    initial_delay=0.5,
                    max_delay=2.0,
                    exp_base=2,
                    jitter=0.5,
                    http_status_codes=[500, 502, 503, 504],
                ),
            ),
        )
        async_client = client.aio
        try:
            async with asyncio.timeout(self._settings.gemini_timeout_seconds):
                response = await async_client.models.generate_content(
                    model=self._settings.gemini_model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=(
                            "You are a helpful assistant. Answer in the language used by the user. "
                            "Use prior messages only as conversational context."
                        ),
                    ),
                )
        finally:
            await async_client.aclose()

        answer = (response.text or "").strip()
        if not answer:
            raise RuntimeError("Gemini returned an empty response")
        return answer
