from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./gatheriq.db"
    jwt_secret: str = Field(default="gatheriq-secure-production-jwt-secret-key-32chars", min_length=8)
    jwt_access_minutes: int = 15
    refresh_remember_days: int = 30
    refresh_session_hours: int = 12
    cors_origins: str = "http://localhost:3000"
    allow_demo_counts: bool = True
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    auth_rate_limit: int = 10
    auth_rate_window_seconds: int = 60
    max_body_bytes: int = 1_048_576

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
