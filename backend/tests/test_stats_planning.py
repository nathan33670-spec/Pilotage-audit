"""Tableaux de bord (volumétrie, temps réels) et échelles de planning."""

from datetime import date


def _create_audit(client, headers, **kwargs):
    payload = {"name": "Audit statistiques", "status": "termine"}
    payload.update(kwargs)
    response = client.post("/api/audits", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_overview_and_durations_use_real_dates(client, admin_headers):
    _create_audit(
        client,
        admin_headers,
        name="TI durée A",
        planned_start="2026-01-05",
        planned_end="2026-01-09",   # 5 jours planifiés
        actual_start="2026-01-05",
        actual_end="2026-01-14",    # 10 jours réels => dérive +5
    )
    _create_audit(
        client,
        admin_headers,
        name="TI durée B",
        planned_start="2026-02-02",
        planned_end="2026-02-06",
        actual_start="2026-02-02",
        actual_end="2026-02-05",    # 4 jours réels => dérive -1
    )

    overview = client.get("/api/stats/overview?start=2026-01-01&end=2026-12-31", headers=admin_headers).json()
    assert overview["audits_in_period"] >= 2
    assert overview["avg_actual_days"] is not None
    assert overview["avg_drift_days"] is not None

    durations = client.get("/api/stats/durations?start=2026-01-01&end=2026-12-31", headers=admin_headers).json()
    assert durations["by_priority"]
    assert sum(bucket["count"] for bucket in durations["distribution"]) >= 2

    rows = client.get("/api/stats/audits?start=2026-01-01&end=2026-12-31", headers=admin_headers).json()
    row = next(r for r in rows if r["name"] == "TI durée A")
    assert row["planned_days"] == 5
    assert row["actual_days"] == 10
    assert row["drift_days"] == 5


def test_timeseries_counts_started_and_finished(client, admin_headers):
    series = client.get(
        "/api/stats/timeseries?start=2026-01-01&end=2026-12-31&granularity=mois", headers=admin_headers
    ).json()
    assert series["granularity"] == "mois"
    assert len(series["points"]) == 12
    january = series["points"][0]
    assert january["started"] >= 1


def test_planning_scales(client, admin_headers):
    day = client.get("/api/planning/range?scale=jour&anchor=2026-03-02&span=7", headers=admin_headers).json()
    assert day["start"] == "2026-03-02" and day["end"] == "2026-03-08"
    assert len(day["columns"]) == 7

    month = client.get("/api/planning/range?scale=mois&anchor=2026-03-17&span=3", headers=admin_headers).json()
    assert month["start"] == "2026-03-01" and month["end"] == "2026-05-31"

    rolling = client.get(
        "/api/planning/range?scale=mois&anchor=2026-03-17&span=3&rolling=true", headers=admin_headers
    ).json()
    assert rolling["start"] == "2026-03-17"

    cycle = client.get("/api/planning/range?scale=cycle&anchor=2026-06-01&cycle_years=3", headers=admin_headers).json()
    assert cycle["start"] == "2025-01-01" and cycle["end"] == "2027-12-31"
    assert len(cycle["columns"]) == 36

    year = client.get("/api/planning/range?scale=annee&anchor=2026-06-01&span=2", headers=admin_headers).json()
    assert year["start"] == "2026-01-01" and year["end"] == "2027-12-31"


def test_planning_audits_selection(client, admin_headers):
    audit = _create_audit(
        client, admin_headers, name="TI planning sélection", planned_start="2026-07-01", planned_end="2026-07-10"
    )
    rows = client.get(
        f"/api/planning/audits?scale=mois&anchor=2026-07-01&span=1&audit_ids={audit['id']}", headers=admin_headers
    ).json()
    assert [r["audit_id"] for r in rows] == [audit["id"]]

    empty = client.get(
        "/api/planning/audits?start=2030-01-01&end=2030-01-31", headers=admin_headers
    ).json()
    assert empty == []
