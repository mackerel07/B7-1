from datetime import datetime
from typing import Any
from uuid import UUID

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.models.user import AuthenticatedUser
from app.schemas.chat import ChatHistoryItem, ContextMessage


class SupabaseChatLogRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = f"{settings.supabase_url.rstrip('/')}/rest/v1/chat_logs"

    def _headers(self, user: AuthenticatedUser) -> dict[str, str]:
        return {
            "apikey": self._settings.supabase_publishable_key,
            "Authorization": f"Bearer {user.access_token}",
            "Accept-Profile": "public",
            "Content-Profile": "public",
        }

    def _ensure_configured(self) -> None:
        if not self._settings.supabase_url or not self._settings.supabase_publishable_key:
            raise AppError(
                code="DATABASE_NOT_CONFIGURED",
                message="데이터베이스 설정이 완료되지 않았습니다.",
                status_code=503,
            )

    async def _request(
        self,
        method: str,
        *,
        user: AuthenticatedUser,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        self._ensure_configured()
        headers = self._headers(user)
        if prefer:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(timeout=self._settings.supabase_timeout_seconds) as client:
                response = await client.request(
                    method,
                    self._base_url,
                    headers=headers,
                    params=params,
                    json=json,
                )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise AppError(
                code="DATABASE_UNAVAILABLE",
                message="대화 기록 저장소에 연결할 수 없습니다.",
                status_code=503,
            ) from exc

        if response.is_error:
            raise AppError(
                code="DATABASE_ERROR",
                message="대화 기록을 처리하지 못했습니다.",
                status_code=503,
            )
        return response

    @staticmethod
    def _json_rows(response: httpx.Response) -> list[dict[str, Any]]:
        try:
            rows = response.json()
        except ValueError as exc:
            raise AppError(
                code="DATABASE_INVALID_RESPONSE",
                message="대화 기록 응답을 확인하지 못했습니다.",
                status_code=503,
            ) from exc
        if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
            raise AppError(
                code="DATABASE_INVALID_RESPONSE",
                message="대화 기록 응답을 확인하지 못했습니다.",
                status_code=503,
            )
        return rows

    async def list_recent_context(
        self,
        user: AuthenticatedUser,
        conversation_id: UUID,
        limit: int,
    ) -> list[ContextMessage]:
        response = await self._request(
            "GET",
            user=user,
            params={
                "select": "question,answer",
                "user_id": f"eq.{user.id}",
                "conversation_id": f"eq.{conversation_id}",
                "status": "eq.success",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
        try:
            messages = [
                ContextMessage.model_validate(row) for row in self._json_rows(response)
            ]
        except ValidationError as exc:
            raise AppError(
                code="DATABASE_INVALID_RESPONSE",
                message="대화 기록 응답을 확인하지 못했습니다.",
                status_code=503,
            ) from exc
        messages.reverse()
        return messages

    async def list_history(
        self,
        user: AuthenticatedUser,
        limit: int,
    ) -> list[ChatHistoryItem]:
        response = await self._request(
            "GET",
            user=user,
            params={
                "select": "id,conversation_id,question,answer,ai_model,created_at",
                "user_id": f"eq.{user.id}",
                "status": "eq.success",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
        try:
            return [
                ChatHistoryItem(
                    id=row["id"],
                    conversation_id=row["conversation_id"],
                    question=row["question"],
                    answer=row["answer"],
                    model=row["ai_model"],
                    created_at=row["created_at"],
                )
                for row in self._json_rows(response)
            ]
        except (KeyError, ValidationError, ValueError) as exc:
            raise AppError(
                code="DATABASE_INVALID_RESPONSE",
                message="대화 기록 응답을 확인하지 못했습니다.",
                status_code=503,
            ) from exc

    async def insert_success(
        self,
        *,
        user: AuthenticatedUser,
        conversation_id: UUID,
        question: str,
        answer: str,
        request_id: str,
        model: str,
        latency_ms: int,
    ) -> tuple[UUID, datetime]:
        response = await self._request(
            "POST",
            user=user,
            prefer="return=representation",
            json={
                "user_id": str(user.id),
                "conversation_id": str(conversation_id),
                "question": question,
                "answer": answer,
                "status": "success",
                "request_id": request_id,
                "ai_model": model,
                "latency_ms": latency_ms,
            },
        )
        try:
            row = self._json_rows(response)[0]
            return UUID(row["id"]), datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        except (IndexError, KeyError, TypeError, ValueError) as exc:
            raise AppError(
                code="DATABASE_INVALID_RESPONSE",
                message="저장 결과를 확인하지 못했습니다.",
                status_code=503,
            ) from exc
