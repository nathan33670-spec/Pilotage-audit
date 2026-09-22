"""Import en masse des TI : analyse, complétion des détails manquants, import."""

CSV_CONTENT = (
    "Code TI;Nom;Categorie;Priorite;Statut;Pilote;Prestataire;Debut prevu;Fin prevue;"
    "Debut reel;Fin reel;Etiquettes;Application impactee;Numero de lot\n"
    "TI-2026-001;TI portail paiement;Applicatif exposé;haute;planifie;Alice Martin-Dupont;SecuAudit;"
    "02/03/2026;13/03/2026;02/03/2026;17/03/2026;PCI-DSS-TI;PAYWEB;L1\n"
    "TI-2026-002;TI SI interne;Infrastructure;critique;en cours;Alice Martin-Dupont;SecuAudit;"
    "2026-04-06;2026-04-17;;;interne;COREBANK;L2\n"
    "TI-2026-003;;Infrastructure;moyenne;planifie;;;2026-05-04;2026-05-06;;;;;L3\n"
)


def _analyze(client, admin_headers, content=CSV_CONTENT, filename="ti.csv"):
    response = client.post(
        "/api/imports",
        headers=admin_headers,
        files={"file": (filename, content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_analysis_detects_mapping_missing_entities_and_new_fields(client, admin_headers):
    analysis = _analyze(client, admin_headers)

    mapping = analysis["mapping"]
    assert mapping["Nom"] == "name"
    assert mapping["Code TI"] == "reference"
    assert mapping["Debut prevu"] == "planned_start"
    assert mapping["Fin reel"] == "actual_end"
    assert mapping["Prestataire"] == "prestation_company"

    # colonnes absentes de la base => champs personnalisés candidats
    new_field_sources = {c["source"] for c in analysis["new_fields"]}
    assert {"Application impactee", "Numero de lot"} <= new_field_sources

    # valeurs référencées inconnues => à créer (avec saisie des détails)
    missing = {(m["entity"], m["value"]) for m in analysis["missing_entities"]}
    assert ("prestation_company", "SecuAudit") in missing
    assert ("user", "Alice Martin-Dupont") in missing
    assert ("tag", "PCI-DSS-TI") in missing

    # la ligne sans nom est signalée en erreur, pas importée silencieusement
    assert analysis["errors_count"] == 1
    assert any(row["errors"] for row in analysis["rows_preview"])


def test_commit_creates_missing_entities_fields_and_audits(client, admin_headers):
    analysis = _analyze(client, admin_headers)
    batch_id = analysis["id"]

    entities = {}
    for missing in analysis["missing_entities"]:
        key = f"{missing['entity']}::{missing['value']}"
        details = {}
        if missing["entity"] == "user":
            details = {"email": "alice.martin.dupont@banque.local", "role": "pilote_audit"}
        elif missing["entity"] == "prestation_company":
            details = {"contact_email": "contact@secuaudit.example", "allocated_days": 60}
        entities[key] = {"action": "create", "details": details}

    patched = client.patch(
        f"/api/imports/{batch_id}",
        headers=admin_headers,
        json={
            "entities": entities,
            "new_fields": {
                "Application impactee": {"create": True, "label": "Application impactée", "show_in_list": True},
                "Numero de lot": {"create": False},
            },
            "options": {"duplicate_strategy": "ignorer", "default_status": "planifie"},
        },
    )
    assert patched.status_code == 200, patched.text

    report = client.post(f"/api/imports/{batch_id}/commit", headers=admin_headers)
    assert report.status_code == 200, report.text
    body = report.json()
    assert body["created_audits"] == 2
    assert body["skipped_rows"] == 1  # ligne sans nom
    assert body["created_fields"] == 1
    assert body["created_entities"].get("prestation_company") == 1

    fields = client.get("/api/custom-fields", headers=admin_headers).json()
    assert any(f["label"] == "Application impactée" and f["created_from_import"] for f in fields)
    assert all(f["label"] != "Numero de lot" for f in fields)

    audits = client.get("/api/audits?q=TI portail paiement", headers=admin_headers).json()
    assert len(audits) == 1
    audit = audits[0]
    assert audit["reference"] == "TI-2026-001"
    assert audit["priority"] == "haute"
    assert audit["planned_start"] == "2026-03-02"
    assert audit["actual_end"] == "2026-03-17"
    assert audit["custom_fields"]["application_impactee"] == "PAYWEB"
    assert audit["kanban_column_id"]

    users = client.get("/api/users", headers=admin_headers).json()
    assert any(u["email"] == "alice.martin.dupont@banque.local" for u in users)

    # un ré-import du même fichier ne duplique rien
    second = _analyze(client, admin_headers)
    assert second["duplicates_count"] == 2
    second_report = client.post(f"/api/imports/{second['id']}/commit", headers=admin_headers).json()
    assert second_report["created_audits"] == 0
    assert second_report["skipped_rows"] == 3


def test_import_rejects_unusable_file(client, admin_headers):
    response = client.post(
        "/api/imports", headers=admin_headers, files={"file": ("vide.csv", b"", "text/csv")}
    )
    assert response.status_code == 400


def test_header_mapping_handles_verbose_labels():
    """Les intitulés verbeux sont reconnus via le synonyme le plus spécifique."""
    from app.importer import suggest_mapping

    mapping = suggest_mapping(
        [
            "Code TI",
            "Nom du test",
            "Type d'audit",
            "Criticite",
            "Date de debut prevue",
            "Date de fin prevue",
            "Nom du prestataire",
            "Application impactee",
        ]
    )
    assert mapping["Nom du test"] == "name"
    assert mapping["Code TI"] == "reference"
    assert mapping["Type d'audit"] == "category"
    assert mapping["Criticite"] == "priority"
    assert mapping["Date de debut prevue"] == "planned_start"
    assert mapping["Date de fin prevue"] == "planned_end"
    assert mapping["Nom du prestataire"] == "prestation_company"
    # colonne inconnue : laissée sans cible, elle deviendra un champ personnalisé
    assert "Application impactee" not in mapping


def test_value_parsing_is_conservative():
    """Un identifiant applicatif ne doit pas être pris pour un nombre."""
    from app.importer import CustomFieldType, detect_type, parse_date, parse_number

    assert parse_number("APP0") is None
    assert parse_number("12 j") == 12
    assert parse_number("1 234,5") == 1234.5
    assert parse_number("-3") == -3
    assert parse_date("05/04/2027").isoformat() == "2027-04-05"
    assert parse_date("2027-04-05").isoformat() == "2027-04-05"
    assert parse_date("pas une date") is None

    assert detect_type(["APP0", "APP1", "COREBANK"]) == CustomFieldType.TEXTE
    assert detect_type(["3", "5,5", "12"]) == CustomFieldType.NOMBRE
    assert detect_type(["05/04/2027", "2027-04-05"]) == CustomFieldType.DATE
    assert detect_type(["oui", "non", "oui"]) == CustomFieldType.BOOLEEN
