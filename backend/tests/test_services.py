def test_list_default_services(client, auth_headers_a):
    response = client.get("/api/services", headers=auth_headers_a)
    assert response.status_code == 200
    services = response.json()
    assert len(services) == 4
    names = [s["name"] for s in services]
    assert "Sunday Service" in names
    assert "Wednesday Service" in names


def test_create_custom_service(client, auth_headers_a):
    payload = {"name": "Youth Fellowship", "description": "Weekly youth service"}
    response = client.post("/api/services", json=payload, headers=auth_headers_a)
    assert response.status_code == 201
    assert response.json()["name"] == "Youth Fellowship"


def test_duplicate_service_conflict(client, auth_headers_a):
    payload = {"name": "Sunday Service", "description": "Duplicate"}
    response = client.post("/api/services", json=payload, headers=auth_headers_a)
    assert response.status_code == 409


def test_update_and_delete_service(client, auth_headers_a):
    create_res = client.post(
        "/api/services",
        json={"name": "Night Vigil", "description": "Monthly vigil"},
        headers=auth_headers_a,
    )
    assert create_res.status_code == 201
    service_id = create_res.json()["id"]

    # Update
    update_res = client.put(
        f"/api/services/{service_id}",
        json={"description": "Updated description"},
        headers=auth_headers_a,
    )
    assert update_res.status_code == 200
    assert update_res.json()["description"] == "Updated description"

    # Delete
    del_res = client.delete(f"/api/services/{service_id}", headers=auth_headers_a)
    assert del_res.status_code == 204
