from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import get_settings
from app.models import RefreshToken
from app.security import hash_refresh_token


def test_refresh_rejected_and_revoked_after_inactivity(client, church_a, db_session):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123", "remember": True},
    )
    assert login_res.status_code == 200
    raw_refresh = login_res.json()["refresh_token"]

    # Simulate 16 minutes of inactivity on the refresh token
    token_row = db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    assert token_row is not None
    token_row.last_activity_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    db_session.commit()

    refresh_res = client.post("/api/auth/refresh", headers={"X-Refresh-Token": raw_refresh})
    assert refresh_res.status_code == 401
    assert "inactivity" in refresh_res.json()["detail"].lower()

    db_session.refresh(token_row)
    assert token_row.revoked_at is not None

    # Subsequent attempt with same token also fails
    retry_res = client.post("/api/auth/refresh", headers={"X-Refresh-Token": raw_refresh})
    assert retry_res.status_code == 401


def test_activity_endpoint_updates_last_activity_and_keeps_session_alive(client, church_a, db_session):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123", "remember": True},
    )
    assert login_res.status_code == 200
    access_token = login_res.json()["access_token"]
    raw_refresh = login_res.json()["refresh_token"]

    # Backdate last_activity_at to 10 minutes ago (still within 15m limit)
    token_row = db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    assert token_row is not None
    ten_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
    token_row.last_activity_at = ten_mins_ago
    db_session.commit()

    act_res = client.post(
        "/api/auth/activity",
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Refresh-Token": raw_refresh,
        },
    )
    assert act_res.status_code == 200
    assert act_res.json()["inactivity_timeout_minutes"] == get_settings().inactivity_timeout_minutes

    db_session.refresh(token_row)
    last_active = token_row.last_activity_at
    if last_active.tzinfo is None:
        last_active = last_active.replace(tzinfo=timezone.utc)
    assert last_active > ten_mins_ago

    # Refresh succeeds after activity reset
    refresh_res = client.post("/api/auth/refresh", headers={"X-Refresh-Token": raw_refresh})
    assert refresh_res.status_code == 200


def test_activity_endpoint_rejects_expired_inactivity_session(client, church_a, db_session):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123", "remember": True},
    )
    assert login_res.status_code == 200
    access_token = login_res.json()["access_token"]
    raw_refresh = login_res.json()["refresh_token"]

    token_row = db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    token_row.last_activity_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    db_session.commit()

    act_res = client.post(
        "/api/auth/activity",
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Refresh-Token": raw_refresh,
        },
    )
    assert act_res.status_code == 401


def test_logout_revokes_refresh_token_via_header(client, church_a):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123", "remember": True},
    )
    assert login_res.status_code == 200
    raw_refresh = login_res.json()["refresh_token"]

    # Clear cookies so we specifically test X-Refresh-Token header revocation
    client.cookies.clear()
    logout_res = client.post("/api/auth/logout", headers={"X-Refresh-Token": raw_refresh})
    assert logout_res.status_code == 200

    refresh_res = client.post("/api/auth/refresh", headers={"X-Refresh-Token": raw_refresh})
    assert refresh_res.status_code == 401


def test_interrupted_recording_session_preserved_on_inactivity_logout(client, church_a):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123", "remember": True},
    )
    token = login_res.json()["access_token"]
    raw_refresh = login_res.json()["refresh_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create, start, and record AI count on a session
    create_res = client.post(
        "/api/sessions",
        json={
            "service_name": "Sunday Service",
            "service_type": "Sunday Service",
            "attendance_date": "2026-11-25",
            "description": "Inactivity interruption test",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    assert client.post(f"/api/sessions/{session_id}/start", headers=headers).status_code == 200
    assert (
        client.post(
            f"/api/sessions/{session_id}/count",
            json={"total_count": 42, "count_source": "ai"},
            headers=headers,
        ).status_code
        == 200
    )

    # Simulate client inactivity logout sequence: pause session then logout
    pause_res = client.post(f"/api/sessions/{session_id}/pause", headers=headers)
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "paused"
    assert pause_res.json()["total_count"] == 42

    client.cookies.clear()
    assert client.post("/api/auth/logout", headers={"X-Refresh-Token": raw_refresh}).status_code == 200

    # Re-login and verify session + preserved count can be recovered and completed
    relogin_res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123", "remember": True},
    )
    new_headers = {"Authorization": f"Bearer {relogin_res.json()['access_token']}"}
    get_res = client.get(f"/api/sessions/{session_id}", headers=new_headers)
    assert get_res.status_code == 200
    assert get_res.json()["status"] == "paused"
    assert get_res.json()["total_count"] == 42
    assert get_res.json()["count_source"] == "ai"

    # Authorized admin can end and confirm the recovered session
    assert client.post(f"/api/sessions/{session_id}/end", headers=new_headers).status_code == 200
    confirm_res = client.post(f"/api/sessions/{session_id}/confirm", headers=new_headers)
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "Confirmed"
    assert confirm_res.json()["total_count"] == 42
