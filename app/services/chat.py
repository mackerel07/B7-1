import logging
from time import perf_counter
from typing import Protocol
from uuid import UUID, uuid4

from app.core.config import Settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.models.user import AuthenticatedUser
from app.schemas.chat import (
    ChatHistoryItem,
    ChatRequest,
    ChatResponse,
    ContextMessage,
)

logger = logging.getLogger(__name__)


class ChatRepository(Protocol):
    async def list_recent_context(
        self,
        user: AuthenticatedUser,
        conversation_id: UUID,
        limit: int,
    ) -> list[ContextMessage]: ...

    async def list_history(
        self,
        user: AuthenticatedUser,
        limit: int,
    ) -> list[ChatHistoryItem]: ...

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
    ) -> tuple[UUID, object]: ...


class AiGateway(Protocol):
    async def generate(self, question: str, history: list[ContextMessage]) -> str: ...


class ChatService:
    def __init__(
        self,
        repository: ChatRepository,
        ai_gateway: AiGateway,
        settings: Settings,
    ) -> None:
        self._repository = repository
        self._ai_gateway = ai_gateway
        self._settings = settings

    async def create_chat(
        self,
        *,
        payload: ChatRequest,
        user: AuthenticatedUser,
        request_id: str,
    ) -> ChatResponse:
        conversation_id = payload.conversation_id or uuid4()
        try:
            history = await self._repository.list_recent_context(
                user,
                conversation_id,
                self._settings.chat_context_limit,
            )
        except AppError:
            log_event(
                logger,
                logging.ERROR,
                "db_read_failure",
                request_id=request_id,
                user_id=str(user.id),
            )
            raise

        log_event(
            logger,
            logging.INFO,
            "ai_call_start",
            request_id=request_id,
            user_id=str(user.id),
            context_count=len(history),
            model=self._settings.gemini_model,
        )
        started_at = perf_counter()
        try:
            answer = await self._ai_gateway.generate(payload.question, history)
        except TimeoutError as exc:
            log_event(
                logger,
                logging.WARNING,
                "ai_call_failure",
                request_id=request_id,
                user_id=str(user.id),
                reason="timeout",
            )
            raise AppError(
                code="AI_TIMEOUT",
                message="AI 응답 시간이 초과되었습니다. 다시 시도해 주세요.",
                status_code=504,
            ) from exc
        except AppError as exc:
            log_event(
                logger,
                logging.ERROR,
                "ai_call_failure",
                request_id=request_id,
                user_id=str(user.id),
                reason=exc.code,
            )
            raise
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "ai_call_failure",
                request_id=request_id,
                user_id=str(user.id),
                reason=type(exc).__name__,
            )
            raise AppError(
                code="AI_SERVICE_ERROR",
                message="AI 답변을 생성하지 못했습니다. 다시 시도해 주세요.",
                status_code=502,
            ) from exc

        latency_ms = round((perf_counter() - started_at) * 1000)
        log_event(
            logger,
            logging.INFO,
            "ai_call_success",
            request_id=request_id,
            user_id=str(user.id),
            latency_ms=latency_ms,
            model=self._settings.gemini_model,
        )

        try:
            chat_id, created_at = await self._repository.insert_success(
                user=user,
                conversation_id=conversation_id,
                question=payload.question,
                answer=answer,
                request_id=request_id,
                model=self._settings.gemini_model,
                latency_ms=latency_ms,
            )
        except AppError:
            log_event(
                logger,
                logging.ERROR,
                "db_save_failure",
                request_id=request_id,
                user_id=str(user.id),
            )
            raise

        log_event(
            logger,
            logging.INFO,
            "db_save_success",
            request_id=request_id,
            user_id=str(user.id),
            chat_id=str(chat_id),
        )
        return ChatResponse(
            id=chat_id,
            conversation_id=conversation_id,
            answer=answer,
            model=self._settings.gemini_model,
            created_at=created_at,
        )

    async def get_history(
        self,
        *,
        user: AuthenticatedUser,
        limit: int,
    ) -> list[ChatHistoryItem]:
        return await self._repository.list_history(user, limit)
