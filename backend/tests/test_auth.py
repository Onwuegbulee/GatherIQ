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
