from functools import lru_cache
import json
import logging
import os
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("gatheriq.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite:///./gatheriq.db"
    jwt_secret: str = Field(default="gatheriq-secure-production-jwt-secret-key-32chars", min_length=8)
    jwt_access_minutes: int = 15
    inactivity_timeout_minutes: int = 15
    refresh_remember_days: int = 30
    refresh_session_hours: int = 12
    cors_origins: str = "http://localhost:3000"
    allow_demo_counts: bool = True
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    auth_rate_limit: int = 10
    auth_rate_window_seconds: int = 60
    max_body_bytes: int = 1_048_576

    # Super Admin provisioning settings (optional env vars)
    super_admin_email: str = "superadmin@gatheriq.dev"
    super_admin_password: Optional[str] = None
    super_admin_name: str = "Platform Super Admin"

    @property
    def is_production(self) -> bool:
        return (
            self.environment.strip().lower() in {"production", "prod"}
            or os.environ.get("RENDER", "").lower() == "true"
        )

    @property
    def sync_database_url(self) -> str:
        raw_url = self.database_url.strip()

        # Reject SQLite fallback when running in production
        if self.is_production and (not raw_url or raw_url.startswith("sqlite")):
            raise RuntimeError(
                "FATAL CONFIGURATION ERROR: Production environment detected (RENDER=true or ENVIRONMENT=production), "
                "but DATABASE_URL is not set or points to a local SQLite database. "
                "GatherIQ does not allow silent fallback to SQLite in production to prevent data loss. "
                "Please configure the DATABASE_URL environment variable with your PostgreSQL connection string."
            )

        # Normalize PostgreSQL URL scheme for psycopg 3 / SQLAlchemy
        if raw_url.startswith("postgres://"):
            return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
        if raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
            return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
        if raw_url.startswith("postgresql+asyncpg://"):
            return raw_url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)

        return raw_url

    @property
    def effective_cookie_samesite(self) -> str:
        # Cross-site cookie support between different origins (e.g. Vercel frontend and Render backend)
        if "COOKIE_SAMESITE" in os.environ:
            val = self.cookie_samesite.strip().lower()
            return val if val in {"lax", "strict", "none"} else "lax"
        return "none" if self.is_production else self.cookie_samesite.strip().lower()

    @property
    def effective_cookie_secure(self) -> bool:
        # If SameSite=none is configured, browsers strictly require Secure=true
        if self.effective_cookie_samesite == "none":
            return True
        if "COOKIE_SECURE" in os.environ:
            return self.cookie_secure
        return True if self.is_production else self.cookie_secure

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        origins = []
        if raw.startswith("[") and raw.endswith("]"):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(o).strip().rstrip("/") for o in parsed if str(o).strip()]
            except Exception:
                pass

        for origin in raw.split(","):
            cleaned = origin.strip().rstrip("/")
            if cleaned:
                origins.append(cleaned)
        return origins or ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
