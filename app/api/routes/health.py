from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings

router = APIRouter(tags=["system"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", response_model=None)
async def ready(settings: Annotated[Settings, Depends(get_settings)]) -> dict | JSONResponse:
    missing = settings.missing_runtime_variables()
    if missing:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "missing": missing},
        )
    return {"status": "ready"}

