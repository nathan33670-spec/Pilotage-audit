"""Catégorisation des audits : catégorie principale + étiquettes."""


def test_categories_and_tags_can_be_managed_and_assigned(client, admin_headers):
    category = client.post(
        "/api/categories",
        headers=admin_headers,
        json={"name": "Applicatif externe", "color": "#1565c0", "default_duration_days": 10},
    )
    assert category.status_code == 201, category.text
    category_id = category.json()["id"]

    updated = client.patch(
        f"/api/categories/{category_id}", headers=admin_headers, json={"description": "Exposé sur Internet"}
    )
    assert updated.json()["description"] == "Exposé sur Internet"

    tag = client.post("/api/tags", headers=admin_headers, json={"name": "PCI-DSS", "color": "#e53935"}).json()

    audit = client.post(
        "/api/audits",
        headers=admin_headers,
        json={"name": "TI portail client", "category_id": category_id, "tag_ids": [tag["id"]]},
    )
    assert audit.status_code == 201, audit.text
    assert audit.json()["tag_ids"] == [tag["id"]]

    filtered = client.get(f"/api/audits?tag_id={tag['id']}", headers=admin_headers).json()
    assert [a["id"] for a in filtered] == [audit.json()["id"]]

    # une catégorie utilisée n'est pas supprimable par erreur
    refused = client.delete(f"/api/categories/{category_id}", headers=admin_headers)
    assert refused.status_code == 400
