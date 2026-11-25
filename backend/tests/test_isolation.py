def test_multi_tenant_isolation(client, auth_headers_a, auth_headers_b):
    # Church A creates a session
    res_a = client.post(
        "/api/sessions",
        json={
            "service_name": "Sunday Service Church A",
            "service_type": "Sunday Service",
            "attendance_date": "2026-11-15",
        },
        headers=auth_headers_a,
    )
    assert res_a.status_code == 201
    session_id_a = res_a.json()["id"]

    # Church B should NOT see Church A's session in the list
    list_b = client.get("/api/sessions", headers=auth_headers_b)
    assert list_b.status_code == 200
    ids_b = [s["id"] for s in list_b.json()]
    assert session_id_a not in ids_b

    # Church B cannot fetch Church A's session directly
    get_b = client.get(f"/api/sessions/{session_id_a}", headers=auth_headers_b)
    assert get_b.status_code == 404

    # Church B cannot mutate Church A's session
    start_b = client.post(f"/api/sessions/{session_id_a}/start", headers=auth_headers_b)
    assert start_b.status_code == 404

    # Church B cannot delete Church A's session
    del_b = client.delete(f"/api/sessions/{session_id_a}", headers=auth_headers_b)
    assert del_b.status_code == 404


def test_websocket_requires_authentication(client, auth_headers_a):
    res_a = client.post(
        "/api/sessions",
        json={
            "service_name": "Sunday Service Church A",
            "service_type": "Sunday Service",
            "attendance_date": "2026-11-15",
        },
        headers=auth_headers_a,
    )
    assert res_a.status_code == 201
    session_id_a = res_a.json()["id"]

    with client.websocket_connect(f"/api/ws/session/{session_id_a}") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Authentication required" in msg["message"]
