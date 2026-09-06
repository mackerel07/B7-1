import logging
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import log_event

logger = logging.getLogger(__name__)


@dataclass
class AppError(Exception):
    code: str
    message: str
    status_code: int


def error_payload(code: str, message: str, request_id: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "request_id": request_id}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.code, exc.message, request_id),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder({
                **error_payload(
                    "VALIDATION_ERROR",
                    "요청 형식이 올바르지 않습니다.",
                    request_id,
                ),
                "details": exc.errors(),
            }),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        log_event(
            logger,
            logging.ERROR,
            "unexpected_error",
            request_id=request_id,
            exception_type=type(exc).__name__,
        )
        return JSONResponse(
            status_code=500,
            content=error_payload(
                "INTERNAL_ERROR",
                "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
                request_id,
            ),
        )
