from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    gemini_timeout_seconds: float = 25.0
    supabase_timeout_seconds: float = 8.0
    chat_context_limit: int = 5
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173"

    @computed_field
    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def missing_runtime_variables(self) -> list[str]:
        values = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_PUBLISHABLE_KEY": self.supabase_publishable_key,
            "GEMINI_API_KEY": self.gemini_api_key,
        }
        return [name for name, value in values.items() if not value.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

