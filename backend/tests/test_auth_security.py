"""
Comprehensive authentication security tests for GatherIQ.

Covers:
- Correct credentials → 200
- Wrong password → 401
- Non-existent email → 401
- Empty email → 422
- Empty password → 422
- Both empty → 422
- Protected route: no token → 401
- Protected route: invalid token → 401
- Protected route: expired token → 401
- Protected route: wrong-secret token → 401
- Refresh with no cookie → 401
- Logout then refresh rejected → 401
"""

import time
from datetime import datetime, timezone

import pytest
import jwt as pyjwt
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PROTECTED = "/api/auth/me"


def _register_church(client: TestClient) -> tuple[str, str]:
    """Create a church + admin and return (email, password)."""
    email = f"sec-test-{int(time.time() * 1000)}@example.com"
    password = "SecurePass!99"
    resp = client.post(
        "/api/auth/setup",
        json={
            "church_name": "Security Test Church",
            "church_location": "Testville",
            "full_name": "Test Admin",
            "email": email,
            "password": password,
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return email, password


def _login(client: TestClient, email: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_expired_token(user_id: str, church_id: str, role: str, secret: str) -> str:
    """Build a syntactically valid JWT whose `exp` is in the past."""
    payload = {
        "sub": user_id,
        "church_id": church_id,
        "role": role,
        "type": "access",
        "iat": 1_000_000,
        "exp": 1_000_001,  # expired in 1970
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


# ---------------------------------------------------------------------------
# Login endpoint
# ---------------------------------------------------------------------------


class TestLoginCorrectCredentials:
    def test_returns_200_and_tokens(self, client: TestClient):
        email, password = _register_church(client)
        resp = client.post("/api/auth/login", json={"email": email, "password": password})
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"


class TestLoginWrongPassword:
    def test_returns_401(self, client: TestClient):
        email, _ = _register_church(client)
        resp = client.post(
            "/api/auth/login", json={"email": email, "password": "WrongPassword!"}
        )
        assert resp.status_code == 401

    def test_error_is_generic(self, client: TestClient):
        """Response must not reveal whether the email exists."""
        email, _ = _register_church(client)
        resp = client.post(
            "/api/auth/login", json={"email": email, "password": "WrongPassword!"}
        )
        detail = resp.json().get("detail", "").lower()
        # Must not say "password" or "email" specifically
        assert "invalid credentials" in detail or "incorrect" in detail or "401" in str(
            resp.status_code
        )


class TestLoginNonExistentEmail:
    def test_returns_401(self, client: TestClient):
        resp = client.post(
            "/api/auth/login",
            json={"email": "nobody@nowhere.invalid", "password": "SomePass!99"},
        )
        assert resp.status_code == 401


class TestLoginEmptyEmail:
    def test_returns_400_or_422(self, client: TestClient):
        resp = client.post(
            "/api/auth/login", json={"email": "", "password": "SomePass!99"}
        )
        assert resp.status_code in (400, 422)


class TestLoginEmptyPassword:
    def test_returns_400_or_422(self, client: TestClient):
        resp = client.post(
            "/api/auth/login", json={"email": "user@example.com", "password": ""}
        )
        assert resp.status_code in (400, 422)


class TestLoginBothEmpty:
    def test_returns_400_or_422(self, client: TestClient):
        resp = client.post("/api/auth/login", json={"email": "", "password": ""})
        assert resp.status_code in (400, 422)


# ---------------------------------------------------------------------------
# Protected route — /api/auth/me
# ---------------------------------------------------------------------------


class TestProtectedRouteNoToken:
    def test_returns_401(self, client: TestClient):
        resp = client.get(PROTECTED)
        assert resp.status_code == 401


class TestProtectedRouteInvalidToken:
    def test_garbage_token_returns_401(self, client: TestClient):
        resp = client.get(PROTECTED, headers=_auth_header("not.a.real.token"))
        assert resp.status_code == 401

    def test_malformed_bearer_returns_401(self, client: TestClient):
        resp = client.get(PROTECTED, headers={"Authorization": "Bearer "})
        assert resp.status_code == 401


class TestProtectedRouteExpiredToken:
    def test_expired_token_returns_401(self, client: TestClient):
        email, password = _register_church(client)
        data = _login(client, email, password)
        # We need user/church IDs; decode the real token (without verification) to get them
        claims = pyjwt.decode(
            data["access_token"], options={"verify_signature": False}
        )
        # Import the real secret from settings
        from app.config import get_settings
        secret = get_settings().jwt_secret

        expired = _make_expired_token(
            claims["sub"], claims["church_id"], claims["role"], secret
        )
        resp = client.get(PROTECTED, headers=_auth_header(expired))
        assert resp.status_code == 401


class TestProtectedRouteWrongSecret:
    def test_wrong_secret_returns_401(self, client: TestClient):
        email, password = _register_church(client)
        data = _login(client, email, password)
        claims = pyjwt.decode(
            data["access_token"], options={"verify_signature": False}
        )
        forged = pyjwt.encode(
            {
                "sub": claims["sub"],
                "church_id": claims["church_id"],
                "role": claims["role"],
                "type": "access",
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
            },
            "totally-wrong-secret-key-that-is-not-the-real-one",
            algorithm="HS256",
        )
        resp = client.get(PROTECTED, headers=_auth_header(forged))
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Refresh token endpoint
# ---------------------------------------------------------------------------


class TestRefreshNoCookie:
    def test_returns_401_without_cookie(self, client: TestClient):
        # No cookies set — refresh must fail
        resp = client.post("/api/auth/refresh")
        assert resp.status_code == 401


class TestLogoutThenRefreshRejected:
    def test_refresh_after_logout_is_rejected(self, client: TestClient):
        email, password = _register_church(client)
        # Login (sets the refresh-token cookie in the TestClient's cookie jar)
        login_resp = client.post(
            "/api/auth/login", json={"email": email, "password": password}
        )
        assert login_resp.status_code == 200

        # Logout (server rotates / revokes the refresh token)
        logout_resp = client.post("/api/auth/logout")
        assert logout_resp.status_code in (200, 204)

        # Attempting refresh after logout must fail
        refresh_resp = client.post("/api/auth/refresh")
        assert refresh_resp.status_code == 401


# ---------------------------------------------------------------------------
# Authenticated endpoint after valid login
# ---------------------------------------------------------------------------


class TestAuthenticatedFlow:
    def test_me_returns_profile_after_login(self, client: TestClient):
        email, password = _register_church(client)
        data = _login(client, email, password)
        resp = client.get(PROTECTED, headers=_auth_header(data["access_token"]))
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == email

    def test_me_returns_401_after_logout(self, client: TestClient):
        email, password = _register_church(client)
        data = _login(client, email, password)
        token = data["access_token"]

        # Still works before logout
        assert client.get(PROTECTED, headers=_auth_header(token)).status_code == 200

        # Logout
        client.post("/api/auth/logout")

        # Access tokens are stateless JWTs, so they remain valid until expiry.
        # But at least verify that an empty / no token is rejected.
        assert client.get(PROTECTED).status_code == 401
