import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.core.logging import log_event
from app.models.user import AuthenticatedUser
from app.repositories.chat_logs import SupabaseChatLogRepository
from app.schemas.chat import ChatHistoryResponse, ChatRequest, ChatResponse
from app.services.chat import ChatService
from app.services.gemini import GeminiService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])


def get_chat_service(settings: Annotated[Settings, Depends(get_settings)]) -> ChatService:
    return ChatService(
        repository=SupabaseChatLogRepository(settings),
        ai_gateway=GeminiService(settings),
        settings=settings,
    )


@router.post("/chat", response_model=ChatResponse, status_code=201)
async def create_chat(
    payload: ChatRequest,
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> ChatResponse:
    request_id = request.state.request_id
    log_event(
        logger,
        logging.INFO,
        "request_received",
        request_id=request_id,
        user_id=str(user.id),
        route="POST /api/chat",
    )
    return await service.create_chat(
        payload=payload,
        user=user,
        request_id=request_id,
    )


@router.get("/me/chats", response_model=ChatHistoryResponse)
async def get_my_chats(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ChatHistoryResponse:
    items = await service.get_history(user=user, limit=limit)
    return ChatHistoryResponse(items=items)

