import re
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.chat import router as chat_router
from app.api.routes.health import router as health_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging

settings = get_settings()
configure_logging(settings)

app = FastAPI(
    title="B7-1 Context Chat API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    candidate = request.headers.get("x-request-id", "")
    request_id = (
        candidate
        if re.fullmatch(r"[A-Za-z0-9._:-]{1,100}", candidate)
        else str(uuid4())
    )
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


register_exception_handlers(app)
app.include_router(health_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
