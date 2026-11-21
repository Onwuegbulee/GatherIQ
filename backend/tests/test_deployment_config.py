import os
import pytest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.setup import ensure_initial_super_admin
from app.models import User
from sqlalchemy import select


def test_cors_origin_parsing():
    # Comma-separated with trailing slashes
    s = Settings(cors_origins="https://gatheriq.onrender.com/, https://gatheriq.vercel.app/")
    assert s.cors_origin_list == ["https://gatheriq.onrender.com", "https://gatheriq.vercel.app"]

    # JSON formatted list
    s_json = Settings(cors_origins='["https://app.gatheriq.dev/", "http://localhost:3000"]')
    assert s_json.cors_origin_list == ["https://app.gatheriq.dev", "http://localhost:3000"]


def test_postgres_url_normalization():
    # Render postgres:// prefix
    s1 = Settings(database_url="postgres://user:pass@render-db.host:5432/gatheriq")
    assert s1.sync_database_url == "postgresql+psycopg://user:pass@render-db.host:5432/gatheriq"

    # Standard postgresql:// prefix
    s2 = Settings(database_url="postgresql://user:pass@render-db.host:5432/gatheriq")
    assert s2.sync_database_url == "postgresql+psycopg://user:pass@render-db.host:5432/gatheriq"

    # Asyncpg prefix normalization
    s3 = Settings(database_url="postgresql+asyncpg://user:pass@render-db.host:5432/gatheriq")
    assert s3.sync_database_url == "postgresql+psycopg://user:pass@render-db.host:5432/gatheriq"


def test_sqlite_rejection_in_production():
    # ENVIRONMENT=production
    s_prod = Settings(environment="production", database_url="sqlite:///./gatheriq.db")
    with pytest.raises(RuntimeError) as exc_info:
        _ = s_prod.sync_database_url
    assert "FATAL CONFIGURATION ERROR" in str(exc_info.value)
    assert "SQLite in production" in str(exc_info.value)

    # RENDER=true
    with patch.dict(os.environ, {"RENDER": "true"}):
        s_render = Settings(database_url="sqlite:///./gatheriq.db")
        with pytest.raises(RuntimeError) as exc_info2:
            _ = s_render.sync_database_url
        assert "FATAL CONFIGURATION ERROR" in str(exc_info2.value)


def test_cross_site_cookie_settings():
    # Local development defaults: lax + insecure for plain HTTP localhost
    s_dev = Settings(environment="development", cookie_secure=False, cookie_samesite="lax")
    assert s_dev.effective_cookie_samesite == "lax"
    assert s_dev.effective_cookie_secure is False

    # Production cross-site configuration (Vercel + Render)
    s_prod = Settings(environment="production", cookie_secure=True, cookie_samesite="none")
    assert s_prod.effective_cookie_samesite == "none"
    assert s_prod.effective_cookie_secure is True

    # SameSite=none strictly requires Secure=true in modern browsers
    with patch.dict(os.environ, {"COOKIE_SAMESITE": "none"}):
        s_samesite_none = Settings(cookie_secure=False)
        assert s_samesite_none.effective_cookie_samesite == "none"
        assert s_samesite_none.effective_cookie_secure is True


def test_cors_allow_credentials_and_explicit_origin():
    # Test CORS with explicit origin matching Vercel domain and credentials
    custom_settings = Settings(cors_origins="https://gatheriq.vercel.app")
    test_app = FastAPI()
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=custom_settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @test_app.get("/test-endpoint")
    def test_ep():
        return {"ok": True}

    client = TestClient(test_app)
    resp = client.options(
        "/test-endpoint",
        headers={
            "Origin": "https://gatheriq.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://gatheriq.vercel.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"


from app.security import COOKIE_NAME


def test_cookie_attributes_on_auth_endpoints(client, db_session):
    # Ensure super admin exists in the test session
    ensure_initial_super_admin(db_session, password="GatherIQ@Admin2026!")

    with patch.dict(os.environ, {"COOKIE_SAMESITE": "none", "COOKIE_SECURE": "true"}):
        get_settings.cache_clear()

        # Login
        login_resp = client.post(
            "/api/auth/login",
            json={"email": "superadmin@gatheriq.dev", "password": "GatherIQ@Admin2026!"},
        )
        assert login_resp.status_code == 200
        set_cookie_header = login_resp.headers.get("set-cookie", "")
        assert f"{COOKIE_NAME}=" in set_cookie_header
        assert "HttpOnly" in set_cookie_header
        assert "samesite=none" in set_cookie_header.lower()
        assert "secure" in set_cookie_header.lower()

        # Logout - ensures clear cookie matches SameSite and Secure
        logout_resp = client.post("/api/auth/logout", cookies=login_resp.cookies)
        assert logout_resp.status_code == 200
        logout_cookie = logout_resp.headers.get("set-cookie", "")
        assert f"{COOKIE_NAME}=" in logout_cookie
        assert "Max-Age=0" in logout_cookie or "expires=" in logout_cookie
        assert "samesite=none" in logout_cookie.lower()
        assert "secure" in logout_cookie.lower()

        get_settings.cache_clear()


def test_superadmin_production_safety(db_session):
    # In production with no SUPER_ADMIN_PASSWORD, ensure_initial_super_admin returns None and does not create user
    with patch.dict(os.environ, {"ENVIRONMENT": "production", "RENDER": "true"}):
        get_settings.cache_clear()
        
        # Test non-existing user with no password configured
        res = ensure_initial_super_admin(db_session, email="unconfigured_admin@gatheriq.dev")
        assert res is None
        
        user = db_session.scalar(select(User).where(User.email == "unconfigured_admin@gatheriq.dev"))
        assert user is None

        get_settings.cache_clear()


def test_health_check_endpoint():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["app"] == "GatherIQ"
    assert "version" in data
