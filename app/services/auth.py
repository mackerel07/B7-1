from uuid import UUID

import httpx

from app.core.config import Settings
from app.core.errors import AppError
from app.models.user import AuthenticatedUser


class SupabaseAuthService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def verify_access_token(self, access_token: str) -> AuthenticatedUser:
        if not self._settings.supabase_url or not self._settings.supabase_publishable_key:
            raise AppError(
                code="AUTH_NOT_CONFIGURED",
                message="인증 서비스 설정이 완료되지 않았습니다.",
                status_code=503,
            )

        try:
            async with httpx.AsyncClient(timeout=self._settings.supabase_timeout_seconds) as client:
                response = await client.get(
                    f"{self._settings.supabase_url.rstrip('/')}/auth/v1/user",
                    headers={
                        "apikey": self._settings.supabase_publishable_key,
                        "Authorization": f"Bearer {access_token}",
                    },
                )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise AppError(
                code="AUTH_SERVICE_UNAVAILABLE",
                message="인증 서비스를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                status_code=503,
            ) from exc

        if response.status_code != 200:
            raise AppError(
                code="AUTH_INVALID_TOKEN",
                message="로그인이 필요하거나 세션이 만료되었습니다.",
                status_code=401,
            )

        try:
            user_id = UUID(response.json()["id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AppError(
                code="AUTH_INVALID_RESPONSE",
                message="인증 응답을 확인할 수 없습니다.",
                status_code=503,
            ) from exc

        return AuthenticatedUser(id=user_id, access_token=access_token)

