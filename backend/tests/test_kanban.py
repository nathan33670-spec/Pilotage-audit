"""Le kanban doit être entièrement configurable depuis l'administration."""


def test_default_columns_are_seeded(client, admin_headers):
    columns = client.get("/api/kanban/columns", headers=admin_headers).json()
    assert [c["key"] for c in columns][:3] == ["brouillon", "planifie", "en_cours"]


def test_create_rename_reorder_and_delete_column(client, admin_headers):
    created = client.post(
        "/api/kanban/columns",
        headers=admin_headers,
        json={"key": "revue_qualite", "label": "Revue qualité", "color": "#8e24aa", "wip_limit": 3},
    )
    assert created.status_code == 201, created.text
    column_id = created.json()["id"]

    renamed = client.patch(
        f"/api/kanban/columns/{column_id}", headers=admin_headers, json={"label": "Revue QA", "wip_limit": 5}
    )
    assert renamed.json()["label"] == "Revue QA"
    assert renamed.json()["wip_limit"] == 5

    columns = client.get("/api/kanban/columns", headers=admin_headers).json()
    reversed_ids = [c["id"] for c in columns][::-1]
    reordered = client.post("/api/kanban/columns/reorder", headers=admin_headers, json={"column_ids": reversed_ids})
    assert [c["id"] for c in reordered.json()] == reversed_ids

    # un audit placé dans la colonne est déplacé, pas supprimé, avec la colonne
    audit = client.post(
        "/api/audits", headers=admin_headers, json={"name": "Audit colonne temporaire"}
    ).json()
    client.post(f"/api/audits/{audit['id']}/kanban-column", headers=admin_headers, json={"column_id": column_id})
    fallback = next(c for c in columns if c["key"] == "planifie")

    deleted = client.delete(
        f"/api/kanban/columns/{column_id}?move_audits_to={fallback['id']}", headers=admin_headers
    )
    assert deleted.status_code == 204
    moved = client.get(f"/api/audits/{audit['id']}", headers=admin_headers).json()
    assert moved["kanban_column_id"] == fallback["id"]
    assert moved["status"] == "planifie"


def test_kanban_display_settings_are_editable(client, admin_headers):
    response = client.put(
        "/api/settings/kanban", headers=admin_headers, json={"value": {"color_by": "category"}}
    )
    assert response.status_code == 200
    assert response.json()["value"]["color_by"] == "category"
    # les autres clés sont préservées
    assert "card_fields" in response.json()["value"]
