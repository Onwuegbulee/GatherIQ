def test_get_and_update_settings(client, auth_headers_a):
    # Fetch settings
    res = client.get("/api/settings", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()
    assert data["attendance_target"] == 1300
    assert data["church_name"] == "Grace Church A"

    # Update settings
    update_res = client.put(
        "/api/settings",
        json={
            "attendance_target": 1500,
            "church_name": "Grace Cathedral A",
            "notify_weekly": True,
        },
        headers=auth_headers_a,
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["attendance_target"] == 1500
    assert updated["church_name"] == "Grace Cathedral A"
    assert updated["notify_weekly"] is True


def test_analytics_overview(client, auth_headers_a):
    # Create two completed sessions
    s1 = client.post(
        "/api/sessions",
        json={"service_name": "Sunday Service", "service_type": "Sunday Service", "attendance_date": "2026-11-08"},
        headers=auth_headers_a,
    ).json()["id"]
    client.post(f"/api/sessions/{s1}/count", json={"total_count": 1000}, headers=auth_headers_a)
    client.post(f"/api/sessions/{s1}/start", headers=auth_headers_a)
    client.post(f"/api/sessions/{s1}/end", headers=auth_headers_a)

    s2 = client.post(
        "/api/sessions",
        json={"service_name": "Sunday Service", "service_type": "Sunday Service", "attendance_date": "2026-11-15"},
        headers=auth_headers_a,
    ).json()["id"]
    client.post(f"/api/sessions/{s2}/count", json={"total_count": 1200}, headers=auth_headers_a)
    client.post(f"/api/sessions/{s2}/start", headers=auth_headers_a)
    client.post(f"/api/sessions/{s2}/end", headers=auth_headers_a)
    client.post(f"/api/sessions/{s2}/confirm", headers=auth_headers_a)

    # Get overview
    rep_res = client.get("/api/reports/overview", headers=auth_headers_a)
    assert rep_res.status_code == 200
    rep = rep_res.json()
    assert rep["total_sessions"] == 2
    assert rep["total_attendance"] == 2200
    assert rep["confirmed_sessions"] == 1
    assert rep["pending_sessions"] == 1
    assert rep["latest_attendance"] == 1200
    assert rep["sunday_average"] == 1100
    assert rep["growth_rate"] == 20.0


def test_new_church_starts_with_clean_empty_attendance(client, auth_headers_a):
    # Sessions list must be empty (no mock records)
    sess_res = client.get("/api/sessions", headers=auth_headers_a)
    assert sess_res.status_code == 200
    assert sess_res.json() == []

    # Reports overview must return zeros (no fabricated statistics)
    rep_res = client.get("/api/reports/overview", headers=auth_headers_a)
    assert rep_res.status_code == 200
    rep = rep_res.json()
    assert rep["total_attendance"] == 0
    assert rep["total_sessions"] == 0
    assert rep["confirmed_sessions"] == 0
    assert rep["pending_sessions"] == 0
    assert rep["latest_attendance"] == 0
    assert rep["sunday_average"] == 0
    assert rep["growth_rate"] == 0.0
    assert rep["target_completion_pct"] == 0.0
