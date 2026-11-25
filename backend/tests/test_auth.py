def test_setup_church_and_admin(client):
    payload = {
        "church_name": "Hope Tabernacle",
        "church_location": "Enugu",
        "full_name": "Pastor David",
        "email": "david@hope.org",
        "password": "securepassword123",
    }
    response = client.post("/api/auth/setup", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "david@hope.org"
    assert data["user"]["role"] == "admin"
    assert "cc_refresh" in response.cookies


def test_login_success(client, church_a):
    response = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123", "remember": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "admin.a@church.org"
    assert "access_token" in data
    assert "cc_refresh" in response.cookies


def test_login_invalid_credentials(client, church_a):
    response = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


def test_get_current_user_profile(client, auth_headers_a):
    response = client.get("/api/auth/me", headers=auth_headers_a)
    assert response.status_code == 200
    assert response.json()["email"] == "admin.a@church.org"


def test_refresh_token_rotation(client, church_a):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123"},
    )
    assert login_res.status_code == 200
    old_cookie = login_res.cookies["cc_refresh"]

    # Rotate token
    client.cookies.set("cc_refresh", old_cookie)
    refresh_res = client.post("/api/auth/refresh")
    assert refresh_res.status_code == 200
    new_data = refresh_res.json()
    assert "access_token" in new_data
    new_cookie = refresh_res.cookies["cc_refresh"]
    assert new_cookie != old_cookie

    # Old token should now be rejected (reuse detection)
    client.cookies.set("cc_refresh", old_cookie)
    reuse_res = client.post("/api/auth/refresh")
    assert reuse_res.status_code == 401


def test_logout(client, church_a):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123"},
    )
    assert login_res.status_code == 200
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json()["message"] == "Logged out successfully."


def test_token_response_includes_refresh_token(client, church_a):
    """Verify TokenResponse includes refresh_token in response body for cross-site environments."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123"},
    )
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["refresh_token"] is not None
    assert len(data["refresh_token"]) > 20


def test_refresh_token_via_header_without_cookies(client, church_a):
    """Simulate browser blocking cross-site cookies; verify rotation via X-Refresh-Token header."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123"},
    )
    assert login_res.status_code == 200
    refresh_token = login_res.json()["refresh_token"]

    # Clear client cookies so request simulates third-party cookie blockage
    client.cookies.clear()

    # Post refresh with header only
    refresh_res = client.post(
        "/api/auth/refresh",
        headers={"X-Refresh-Token": refresh_token},
    )
    assert refresh_res.status_code == 200
    new_data = refresh_res.json()
    assert "access_token" in new_data
    assert "refresh_token" in new_data
    assert new_data["refresh_token"] != refresh_token

    # Verify new access token works against /api/auth/me
    me_res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {new_data['access_token']}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "admin.a@church.org"


def test_super_admin_vs_church_admin_authentication(client, db_session, church_a):
    """Verify Super Admin and Church Admin return distinct profiles, roles, and tenant associations."""
    from app.setup import ensure_initial_super_admin
    ensure_initial_super_admin(db_session)

    # Super Admin login
    sa_res = client.post(
        "/api/auth/login",
        json={"email": "superadmin@gatheriq.dev", "password": "GatherIQ@Admin2026!"},
    )
    assert sa_res.status_code == 200
    sa_data = sa_res.json()
    assert sa_data["user"]["role"] == "super_admin"
    assert sa_data["user"]["church_id"] is None

    # Super Admin /api/auth/me
    sa_me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {sa_data['access_token']}"},
    )
    assert sa_me.status_code == 200
    assert sa_me.json()["role"] == "super_admin"
    assert sa_me.json()["church_id"] is None

    # Church Admin login
    ca_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123"},
    )
    assert ca_res.status_code == 200
    ca_data = ca_res.json()
    assert ca_data["user"]["role"] == "admin"
    assert ca_data["user"]["church_id"] == str(church_a.church_id)

    # Church Admin /api/auth/me
    ca_me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {ca_data['access_token']}"},
    )
    assert ca_me.status_code == 200
    assert ca_me.json()["role"] == "admin"
    assert ca_me.json()["church_id"] == str(church_a.church_id)


def test_deactivated_user_login_fails(client, db_session, church_a):
    from sqlalchemy import select
    from app.models import User
    user = db_session.scalar(select(User).where(User.email == "admin.a@church.org"))
    user.is_active = False
    db_session.commit()

    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123"},
    )
    assert login_res.status_code == 403
    assert "deactivated" in login_res.json()["detail"].lower()

