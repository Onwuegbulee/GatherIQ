def test_session_lifecycle(client, auth_headers_a):
    # 1. Create session draft
    create_payload = {
        "service_name": "Sunday Service",
        "service_type": "Sunday Service",
        "attendance_date": "2026-11-15",
        "description": "Morning worship session",
    }
    create_res = client.post("/api/sessions", json=create_payload, headers=auth_headers_a)
    assert create_res.status_code == 201
    session_data = create_res.json()
    assert session_data["status"] == "ready"
    session_id = session_data["id"]

    # 2. Start session
    start_res = client.post(f"/api/sessions/{session_id}/start", headers=auth_headers_a)
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "recording"

    # 3. Pause session
    pause_res = client.post(f"/api/sessions/{session_id}/pause", headers=auth_headers_a)
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "paused"

    # 4. Resume session
    resume_res = client.post(f"/api/sessions/{session_id}/resume", headers=auth_headers_a)
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "recording"

    # 5. Update count (demo / manual)
    count_res = client.post(
        f"/api/sessions/{session_id}/count",
        json={"total_count": 850, "count_source": "demo"},
        headers=auth_headers_a,
    )
    assert count_res.status_code == 200
    assert count_res.json()["total_count"] == 850
    assert count_res.json()["count_source"] == "demo"

    # 6. End session
    end_res = client.post(f"/api/sessions/{session_id}/end", headers=auth_headers_a)
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "Pending"  # completed sessions present as Pending until confirmed

    # 7. Confirm session
    confirm_res = client.post(f"/api/sessions/{session_id}/confirm", headers=auth_headers_a)
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "Confirmed"


def test_invalid_session_transition(client, auth_headers_a):
    create_res = client.post(
        "/api/sessions",
        json={
            "service_name": "Workers' Meeting",
            "service_type": "Workers' Meeting",
            "attendance_date": "2026-11-14",
        },
        headers=auth_headers_a,
    )
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    # Attempting to pause a 'ready' session must fail
    pause_res = client.post(f"/api/sessions/{session_id}/pause", headers=auth_headers_a)
    assert pause_res.status_code == 400
    assert "Only a recording session can be paused" in pause_res.json()["detail"]
