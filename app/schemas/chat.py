from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None

    @field_validator("question", mode="before")
    @classmethod
    def trim_and_validate_question(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        value = value.strip()
        if not value:
            raise ValueError("질문은 공백일 수 없습니다.")
        return value


class ChatResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    answer: str
    model: str
    created_at: datetime


class ChatHistoryItem(BaseModel):
    id: UUID
    conversation_id: UUID
    question: str
    answer: str
    model: str
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    items: list[ChatHistoryItem]


class ContextMessage(BaseModel):
    question: str
    answer: str
