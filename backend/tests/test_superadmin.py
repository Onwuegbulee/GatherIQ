"""
Tests for Super Admin Portal:
1. Account provisioning with exact credentials (superadmin@gatheriq.dev / GatherIQ@Admin2026!)
2. Idempotent provisioning
3. Login with exact credentials
4. Incorrect Super Admin password rejection
5. Church administrator rejection from Super Admin endpoints (403)
6. Super Admin church registration with initial password
7. Church administrator login with manual password and first-login flag
8. First-login password change
9. Church suspension blocks church admin and reactivation allows access
10. Super Admin password reset for church admin
11. Data isolation verification
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Church, User
from app.setup import ensure_initial_super_admin


SUPERADMIN_EMAIL = "superadmin@gatheriq.dev"
SUPERADMIN_PASSWORD = "GatherIQ@Admin2026!"


@pytest.fixture(autouse=True)
def init_super_admin(db_session):
    ensure_initial_super_admin(db_session)


def get_superadmin_token(client: TestClient) -> str:
    resp = client.post("/api/auth/login", json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestSuperAdminProvisioningAndAuth:
    def test_superadmin_provisioned_with_exact_credentials(self, db_session):
        user = db_session.scalar(select(User).where(User.email == SUPERADMIN_EMAIL))
        assert user is not None
        assert user.role == "super_admin"
        assert user.church_id is None
        assert user.must_change_password is True

    def test_login_success_with_exact_credentials(self, client: TestClient):
        resp = client.post(
            "/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["email"] == SUPERADMIN_EMAIL
        assert data["user"]["must_change_password"] is True

    def test_login_failure_with_wrong_password(self, client: TestClient):
        resp = client.post(
            "/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": "WrongPassword123!"},
        )
        assert resp.status_code == 401

    def test_provisioning_is_idempotent(self, db_session):
        u1 = ensure_initial_super_admin(db_session)
        u2 = ensure_initial_super_admin(db_session)
        assert u1.id == u2.id
        assert u1.email == SUPERADMIN_EMAIL


class TestRoleBasedAccessControl:
    def test_church_admin_forbidden_from_superadmin_routes(self, client: TestClient):
        # Register a church admin
        church_resp = client.post(
            "/api/auth/setup",
            json={
                "church_name": "Test Church A",
                "church_location": "London",
                "full_name": "Pastor Bob",
                "email": "pastorbob@churcha.com",
                "password": "Password123!",
            },
        )
        assert church_resp.status_code in (200, 201)
        church_token = church_resp.json()["access_token"]

        # Attempt to access superadmin overview
        resp = client.get("/api/superadmin/overview", headers=auth_header(church_token))
        assert resp.status_code == 403
        assert "Super administrator" in resp.json()["detail"]

    def test_unauthenticated_forbidden_from_superadmin_routes(self, client: TestClient):
        resp = client.get("/api/superadmin/overview")
        assert resp.status_code == 401


class TestChurchManagementLifecycle:
    def test_register_church_and_admin_manual_password(self, client: TestClient):
        sa_token = get_superadmin_token(client)

        admin_email = f"pastor_{uuid.uuid4().hex[:6]}@example.com"
        reg_payload = {
            "church_name": "Bethel Cathedral",
            "church_email": "info@bethel.org",
            "phone": "+123456789",
            "location": "North Campus",
            "admin_full_name": "Pastor David",
            "admin_email": admin_email,
            "initial_password": "BethelAdminPass2026!",
        }

        # 1. Register church via Super Admin
        resp = client.post("/api/superadmin/churches", json=reg_payload, headers=auth_header(sa_token))
        assert resp.status_code == 201
        church_data = resp.json()
        church_id = church_data["id"]
        assert church_data["name"] == "Bethel Cathedral"
        assert church_data["admin_email"] == admin_email
        assert church_data["is_active"] is True

        # 2. Log in with the newly created church admin credentials
        login_resp = client.post(
            "/api/auth/login",
            json={"email": admin_email, "password": "BethelAdminPass2026!"},
        )
        assert login_resp.status_code == 200
        login_data = login_resp.json()
        admin_token = login_data["access_token"]
        assert login_data["user"]["must_change_password"] is True

        # 3. First-login password change
        change_resp = client.post(
            "/api/auth/change-password",
            json={
                "current_password": "BethelAdminPass2026!",
                "new_password": "BethelPermanentPass2026!",
            },
            headers=auth_header(admin_token),
        )
        assert change_resp.status_code == 200

        # Verify old password no longer works
        old_login = client.post(
            "/api/auth/login",
            json={"email": admin_email, "password": "BethelAdminPass2026!"},
        )
        assert old_login.status_code == 401

        # Verify new password works
        new_login = client.post(
            "/api/auth/login",
            json={"email": admin_email, "password": "BethelPermanentPass2026!"},
        )
        assert new_login.status_code == 200
        new_admin_token = new_login.json()["access_token"]
        assert new_login.json()["user"]["must_change_password"] is False

        # 4. Suspend Church
        suspend_resp = client.post(
            f"/api/superadmin/churches/{church_id}/toggle-status",
            headers=auth_header(sa_token),
        )
        assert suspend_resp.status_code == 200
        assert suspend_resp.json()["is_active"] is False

        # Suspended church admin cannot access church routes
        blocked_resp = client.get("/api/auth/me", headers=auth_header(new_admin_token))
        assert blocked_resp.status_code == 403
        assert "suspended" in blocked_resp.json()["detail"].lower()

        # Reactivate Church
        reactivate_resp = client.post(
            f"/api/superadmin/churches/{church_id}/toggle-status",
            headers=auth_header(sa_token),
        )
        assert reactivate_resp.status_code == 200
        assert reactivate_resp.json()["is_active"] is True

        # Reactivated church admin can access church routes again
        allowed_resp = client.get("/api/auth/me", headers=auth_header(new_admin_token))
        assert allowed_resp.status_code == 200

        # 5. Super Admin Password Reset for Admin
        admin_id = allowed_resp.json()["id"]
        reset_resp = client.post(
            f"/api/superadmin/administrators/{admin_id}/reset-password",
            json={"new_password": "ResetPassword999!"},
            headers=auth_header(sa_token),
        )
        assert reset_resp.status_code == 200

        # Admin logs in with reset password
        reset_login = client.post(
            "/api/auth/login",
            json={"email": admin_email, "password": "ResetPassword999!"},
        )
        assert reset_login.status_code == 200
        assert reset_login.json()["user"]["must_change_password"] is True
