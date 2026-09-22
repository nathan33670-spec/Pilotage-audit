"""Tableaux de bord statistiques : volumétrie des audits et temps réels.

Les durées « réelles » s'appuient sur les dates de réalisation saisies au
niveau de l'audit (`actual_start` / `actual_end`) ou, à défaut, déduites des
phases effectivement réalisées. Les durées « planifiées » utilisent les dates
prévues de l'audit ou l'enveloppe de ses phases.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from statistics import median

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Integer, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Audit,
    AuditPhase,
    AuditPrerequisite,
    AuditPriority,
    AuditStatus,
    Category,
    PrestationCompany,
    Tag,
    User,
    audit_tags,
)
from app.schemas import (
    AuditDurationOut,
    DurationStat,
    StatCount,
    StatsDurationsOut,
    StatsOverviewOut,
    StatsTimeseriesOut,
    TimeseriesPoint,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])

PRIORITY_COLORS = {"basse": "#4caf50", "moyenne": "#2196f3", "haute": "#ff9800", "critique": "#e53935"}
STATUS_COLORS = {
    "brouillon": "#9e9e9e",
    "planifie": "#42a5f5",
    "en_cours": "#7e57c2",
    "en_attente": "#ffb300",
    "bloque": "#e53935",
    "termine": "#43a047",
    "annule": "#616161",
}
CLOSED_STATUSES = {AuditStatus.TERMINE, AuditStatus.ANNULE}

STATUS_LABELS = {
    "brouillon": "Brouillon",
    "planifie": "Planifié",
    "en_cours": "En cours",
    "en_attente": "En attente",
    "bloque": "Bloqué",
    "termine": "Terminé",
    "annule": "Annulé",
}
PRIORITY_LABELS = {"basse": "Basse", "moyenne": "Moyenne", "haute": "Haute", "critique": "Critique"}


# ---------------------------------------------------------------------------
# Helpers de calcul
# ---------------------------------------------------------------------------
@dataclass
class AuditRow:
    """Projection légère d'un audit pour les calculs statistiques.

    Les statistiques n'ont pas besoin des objets ORM complets : charger les
    phases et les pré-requis ligne à ligne coûterait des dizaines de milliers
    d'objets. Les bornes de dates et l'avancement des pré-requis sont agrégés
    directement en SQL.
    """

    id: str
    name: str
    reference: str | None
    category_id: str | None
    priority: AuditPriority
    status: AuditStatus
    pilot_id: str | None
    prestation_company_id: str | None
    planned_start: date | None
    planned_end: date | None
    actual_start: date | None
    actual_end: date | None
    created_at: datetime | None
    phase_plan_start: date | None
    phase_plan_end: date | None
    phase_actual_start: date | None
    phase_actual_end: date | None
    prerequisites_total: int = 0
    prerequisites_checked: int = 0
    tags: list[tuple[str, str]] = field(default_factory=list)


def _span_days(start: date | None, end: date | None) -> float | None:
    if start is None or end is None or end < start:
        return None
    return float((end - start).days + 1)


def planned_range(audit: AuditRow) -> tuple[date | None, date | None]:
    return (
        audit.planned_start or audit.phase_plan_start,
        audit.planned_end or audit.phase_plan_end,
    )


def actual_range(audit: AuditRow) -> tuple[date | None, date | None]:
    return (
        audit.actual_start or audit.phase_actual_start,
        audit.actual_end or audit.phase_actual_end,
    )


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _filtered_audits(
    db: Session,
    start: date | None,
    end: date | None,
    category_id: str | None,
    pilot_id: str | None,
    prestation_company_id: str | None,
    tag_id: str | None,
    status: AuditStatus | None,
    audit_ids: list[str] | None,
    with_tags: bool = True,
) -> list[AuditRow]:
    phases = (
        select(
            AuditPhase.audit_id.label("audit_id"),
            func.min(AuditPhase.start_date).label("plan_start"),
            func.max(AuditPhase.end_date).label("plan_end"),
            func.min(AuditPhase.actual_start_date).label("actual_start"),
            func.max(AuditPhase.actual_end_date).label("actual_end"),
        )
        .group_by(AuditPhase.audit_id)
        .subquery()
    )
    prerequisites = (
        select(
            AuditPrerequisite.audit_id.label("audit_id"),
            func.count(AuditPrerequisite.id).label("total"),
            func.sum(func.cast(AuditPrerequisite.is_checked, Integer)).label("checked"),
        )
        .group_by(AuditPrerequisite.audit_id)
        .subquery()
    )

    query = (
        select(
            Audit.id, Audit.name, Audit.reference, Audit.category_id, Audit.priority, Audit.status,
            Audit.pilot_id, Audit.prestation_company_id, Audit.planned_start, Audit.planned_end,
            Audit.actual_start, Audit.actual_end, Audit.created_at,
            phases.c.plan_start, phases.c.plan_end, phases.c.actual_start, phases.c.actual_end,
            prerequisites.c.total, prerequisites.c.checked,
        )
        .outerjoin(phases, phases.c.audit_id == Audit.id)
        .outerjoin(prerequisites, prerequisites.c.audit_id == Audit.id)
    )
    if category_id:
        query = query.where(Audit.category_id == category_id)
    if pilot_id:
        query = query.where(Audit.pilot_id == pilot_id)
    if prestation_company_id:
        query = query.where(Audit.prestation_company_id == prestation_company_id)
    if status:
        query = query.where(Audit.status == status)
    if audit_ids:
        query = query.where(Audit.id.in_(audit_ids))
    if tag_id:
        query = query.where(
            Audit.id.in_(select(audit_tags.c.audit_id).where(audit_tags.c.tag_id == tag_id))
        )

    rows = [
        AuditRow(
            id=r[0], name=r[1], reference=r[2], category_id=r[3], priority=r[4], status=r[5],
            pilot_id=r[6], prestation_company_id=r[7], planned_start=r[8], planned_end=r[9],
            actual_start=r[10], actual_end=r[11], created_at=r[12],
            phase_plan_start=r[13], phase_plan_end=r[14], phase_actual_start=r[15], phase_actual_end=r[16],
            prerequisites_total=int(r[17] or 0), prerequisites_checked=int(r[18] or 0),
        )
        for r in db.execute(query).all()
    ]
    if start or end:
        rows = [row for row in rows if _overlaps(row, start, end)]

    if with_tags and rows:
        by_id = {row.id: row for row in rows}
        tag_rows = db.execute(
            select(audit_tags.c.audit_id, Tag.id, Tag.name).join(Tag, Tag.id == audit_tags.c.tag_id)
        ).all()
        for audit_id, tag_identifier, tag_name in tag_rows:
            target = by_id.get(audit_id)
            if target is not None:
                target.tags.append((tag_identifier, tag_name))
    return rows


def _overlaps(audit: AuditRow, start: date | None, end: date | None) -> bool:
    """Un audit est retenu s'il chevauche la période, sur ses dates réelles si
    elles existent, sinon sur ses dates planifiées."""
    a_start, a_end = actual_range(audit)
    if a_start is None and a_end is None:
        a_start, a_end = planned_range(audit)
    if a_start is None and a_end is None:
        return False
    a_start = a_start or a_end
    a_end = a_end or a_start
    if start and a_end < start:
        return False
    if end and a_start > end:
        return False
    return True


def _grouped_durations(
    audits: list[AuditRow], key_fn, label_map: dict[str, str] | None = None
) -> list[DurationStat]:
    groups: dict[str, list[Audit]] = {}
    labels: dict[str, str] = {}
    for audit in audits:
        key, label = key_fn(audit)
        groups.setdefault(key, []).append(audit)
        labels[key] = label
    stats: list[DurationStat] = []
    for key, items in groups.items():
        actual = [d for d in (_span_days(*actual_range(a)) for a in items) if d is not None]
        planned = [d for d in (_span_days(*planned_range(a)) for a in items) if d is not None]
        drifts = []
        on_time = 0
        comparable = 0
        for audit in items:
            real = _span_days(*actual_range(audit))
            plan = _span_days(*planned_range(audit))
            if real is not None and plan is not None:
                drifts.append(real - plan)
                comparable += 1
                if real <= plan:
                    on_time += 1
        stats.append(
            DurationStat(
                key=key,
                label=(label_map or labels).get(key, labels[key]),
                audits_count=len(items),
                avg_planned_days=_avg(planned),
                avg_actual_days=_avg(actual),
                median_actual_days=round(median(actual), 2) if actual else None,
                min_actual_days=min(actual) if actual else None,
                max_actual_days=max(actual) if actual else None,
                avg_drift_days=_avg(drifts),
                on_time_ratio=round(on_time / comparable, 4) if comparable else None,
            )
        )
    return sorted(stats, key=lambda s: (-s.audits_count, s.label))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/overview", response_model=StatsOverviewOut)
def overview(
    start: date | None = None,
    end: date | None = None,
    category_id: str | None = None,
    pilot_id: str | None = None,
    prestation_company_id: str | None = None,
    tag_id: str | None = None,
    status: AuditStatus | None = None,
    audit_ids: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    all_audits_count = db.query(Audit).count()
    audits = _filtered_audits(db, start, end, category_id, pilot_id, prestation_company_id, tag_id, status, audit_ids)

    categories = {c.id: c for c in db.query(Category).all()}
    companies = {c.id: c.name for c in db.query(PrestationCompany).all()}
    users = {u.id: u.full_name for u in db.query(User).all()}

    def _count(getter, colors: dict[str, str] | None = None) -> list[StatCount]:
        counter: dict[tuple[str, str], int] = {}
        for audit in audits:
            key, label = getter(audit)
            counter[(key, label)] = counter.get((key, label), 0) + 1
        return sorted(
            [
                StatCount(key=k, label=lbl, count=v, color=(colors or {}).get(k))
                for (k, lbl), v in counter.items()
            ],
            key=lambda s: -s.count,
        )

    by_tag: dict[tuple[str, str], int] = {}
    for audit in audits:
        for tag_id_value, tag_name in audit.tags:
            by_tag[(tag_id_value, tag_name)] = by_tag.get((tag_id_value, tag_name), 0) + 1

    actual_durations = [d for d in (_span_days(*actual_range(a)) for a in audits) if d is not None]
    planned_durations = [d for d in (_span_days(*planned_range(a)) for a in audits) if d is not None]
    drifts, on_time, comparable = [], 0, 0
    for audit in audits:
        real = _span_days(*actual_range(audit))
        plan = _span_days(*planned_range(audit))
        if real is not None and plan is not None:
            drifts.append(real - plan)
            comparable += 1
            if real <= plan:
                on_time += 1

    today = date.today()
    late = 0
    unscheduled = 0
    for audit in audits:
        p_start, p_end = planned_range(audit)
        if p_start is None and p_end is None:
            unscheduled += 1
        elif p_end is not None and p_end < today and audit.status not in CLOSED_STATUSES:
            late += 1

    prerequisites_total = sum(a.prerequisites_total for a in audits)
    prerequisites_done = sum(a.prerequisites_checked for a in audits)

    return StatsOverviewOut(
        generated_at=datetime.now(timezone.utc),
        period_start=start,
        period_end=end,
        total_audits=all_audits_count,
        audits_in_period=len(audits),
        by_status=_count(lambda a: (a.status.value, STATUS_LABELS.get(a.status.value, a.status.value)), STATUS_COLORS),
        by_priority=_count(lambda a: (a.priority.value, PRIORITY_LABELS.get(a.priority.value, a.priority.value)), PRIORITY_COLORS),
        by_category=_count(
            lambda a: (a.category_id or "none", categories[a.category_id].name if a.category_id in categories else "Sans catégorie")
        ),
        by_company=_count(
            lambda a: (a.prestation_company_id or "none", companies.get(a.prestation_company_id, "Interne"))
        ),
        by_pilot=_count(lambda a: (a.pilot_id or "none", users.get(a.pilot_id, "Non assigné"))),
        by_tag=sorted(
            [StatCount(key=k, label=lbl, count=v) for (k, lbl), v in by_tag.items()], key=lambda s: -s.count
        ),
        completed_audits=sum(1 for a in audits if a.status == AuditStatus.TERMINE),
        in_progress_audits=sum(1 for a in audits if a.status == AuditStatus.EN_COURS),
        late_audits=late,
        unscheduled_audits=unscheduled,
        avg_actual_days=_avg(actual_durations),
        median_actual_days=round(median(actual_durations), 2) if actual_durations else None,
        avg_planned_days=_avg(planned_durations),
        avg_drift_days=_avg(drifts),
        on_time_ratio=round(on_time / comparable, 4) if comparable else None,
        total_actual_days=round(sum(actual_durations), 2),
        total_planned_days=round(sum(planned_durations), 2),
        prerequisites_completion=round(prerequisites_done / prerequisites_total, 4) if prerequisites_total else None,
    )


@router.get("/durations", response_model=StatsDurationsOut)
def durations(
    start: date | None = None,
    end: date | None = None,
    category_id: str | None = None,
    pilot_id: str | None = None,
    prestation_company_id: str | None = None,
    tag_id: str | None = None,
    status: AuditStatus | None = None,
    audit_ids: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    audits = _filtered_audits(
        db, start, end, category_id, pilot_id, prestation_company_id, tag_id, status, audit_ids, with_tags=False
    )
    categories = {c.id: c.name for c in db.query(Category).all()}
    companies = {c.id: c.name for c in db.query(PrestationCompany).all()}
    users = {u.id: u.full_name for u in db.query(User).all()}

    # Durées moyennes par type de phase (ex. « Cadrage », « Exécution »).
    # Seules les colonnes utiles des phases des audits retenus sont lues.
    phase_groups: dict[str, list[float]] = {}
    phase_planned: dict[str, list[float]] = {}
    audit_ids_in_scope = [a.id for a in audits]
    if audit_ids_in_scope:
        phase_rows = db.execute(
            select(
                AuditPhase.name, AuditPhase.start_date, AuditPhase.end_date,
                AuditPhase.actual_start_date, AuditPhase.actual_end_date,
            ).where(AuditPhase.audit_id.in_(audit_ids_in_scope))
        ).all()
        for name, plan_start, plan_end, real_start, real_end in phase_rows:
            real = _span_days(real_start, real_end)
            plan = _span_days(plan_start, plan_end)
            if real is not None:
                phase_groups.setdefault(name, []).append(real)
            if plan is not None:
                phase_planned.setdefault(name, []).append(plan)
    by_phase = [
        DurationStat(
            key=name,
            label=name,
            audits_count=len(values),
            avg_actual_days=_avg(values),
            median_actual_days=round(median(values), 2) if values else None,
            min_actual_days=min(values) if values else None,
            max_actual_days=max(values) if values else None,
            avg_planned_days=_avg(phase_planned.get(name, [])),
        )
        for name, values in sorted(phase_groups.items())
    ]
    for name, plan_values in phase_planned.items():
        if name not in phase_groups:
            by_phase.append(
                DurationStat(key=name, label=name, audits_count=len(plan_values), avg_planned_days=_avg(plan_values))
            )

    # Distribution des durées réelles par tranche
    buckets = [(0, 2, "≤ 2 j"), (3, 5, "3–5 j"), (6, 10, "6–10 j"), (11, 20, "11–20 j"), (21, 10**6, "> 20 j")]
    distribution: list[StatCount] = []
    real_values = [d for d in (_span_days(*actual_range(a)) for a in audits) if d is not None]
    for low, high, label in buckets:
        distribution.append(
            StatCount(key=label, label=label, count=sum(1 for v in real_values if low <= v <= high))
        )

    return StatsDurationsOut(
        by_category=_grouped_durations(
            audits, lambda a: (a.category_id or "none", categories.get(a.category_id, "Sans catégorie"))
        ),
        by_priority=_grouped_durations(
            audits, lambda a: (a.priority.value, PRIORITY_LABELS.get(a.priority.value, a.priority.value))
        ),
        by_company=_grouped_durations(
            audits, lambda a: (a.prestation_company_id or "none", companies.get(a.prestation_company_id, "Interne"))
        ),
        by_pilot=_grouped_durations(audits, lambda a: (a.pilot_id or "none", users.get(a.pilot_id, "Non assigné"))),
        by_phase=by_phase,
        distribution=distribution,
    )


def _period_key(value: date, granularity: str) -> tuple[str, str]:
    if granularity == "jour":
        return value.isoformat(), value.strftime("%d/%m/%Y")
    if granularity == "semaine":
        iso = value.isocalendar()
        return f"{iso.year}-S{iso.week:02d}", f"S{iso.week:02d} {iso.year}"
    if granularity == "trimestre":
        quarter = (value.month - 1) // 3 + 1
        return f"{value.year}-T{quarter}", f"T{quarter} {value.year}"
    if granularity == "annee":
        return str(value.year), str(value.year)
    return f"{value.year}-{value.month:02d}", value.strftime("%m/%Y")


def _iter_periods(start: date, end: date, granularity: str) -> list[tuple[str, str]]:
    periods: list[tuple[str, str]] = []
    seen: set[str] = set()
    cursor = start
    while cursor <= end:
        key, label = _period_key(cursor, granularity)
        if key not in seen:
            seen.add(key)
            periods.append((key, label))
        if granularity == "jour":
            cursor = date.fromordinal(cursor.toordinal() + 1)
        elif granularity == "semaine":
            cursor = date.fromordinal(cursor.toordinal() + 7)
        elif granularity == "annee":
            cursor = date(cursor.year + 1, 1, 1)
        elif granularity == "trimestre":
            month = cursor.month + 3
            cursor = date(cursor.year + (month - 1) // 12, (month - 1) % 12 + 1, 1)
        else:
            month = cursor.month + 1
            cursor = date(cursor.year + (month - 1) // 12, (month - 1) % 12 + 1, 1)
    return periods


@router.get("/timeseries", response_model=StatsTimeseriesOut)
def timeseries(
    start: date,
    end: date,
    granularity: str = "mois",
    category_id: str | None = None,
    pilot_id: str | None = None,
    prestation_company_id: str | None = None,
    tag_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Nombre d'audits démarrés / terminés / créés par période, et nombre
    d'audits encore ouverts à la fin de chaque période."""
    granularity = granularity if granularity in {"jour", "semaine", "mois", "trimestre", "annee"} else "mois"
    audits = _filtered_audits(
        db, None, None, category_id, pilot_id, prestation_company_id, tag_id, None, None, with_tags=False
    )

    periods = _iter_periods(start, end, granularity)
    index = {key: i for i, (key, _label) in enumerate(periods)}
    started = [0] * len(periods)
    finished = [0] * len(periods)
    created = [0] * len(periods)

    starts: list[tuple[int, date]] = []
    ends: list[tuple[int, date]] = []
    for audit in audits:
        a_start, a_end = actual_range(audit)
        p_start, p_end = planned_range(audit)
        eff_start = a_start or p_start
        eff_end = a_end or p_end
        if eff_start and start <= eff_start <= end:
            started[index[_period_key(eff_start, granularity)[0]]] += 1
        if eff_end and start <= eff_end <= end:
            finished[index[_period_key(eff_end, granularity)[0]]] += 1
        created_on = audit.created_at.date() if audit.created_at else None
        if created_on and start <= created_on <= end:
            created[index[_period_key(created_on, granularity)[0]]] += 1
        if eff_start:
            starts.append((0, eff_start))
            ends.append((0, eff_end or date.max))

    # Encours : audits démarrés et non terminés à la fin de chaque période
    period_bounds: list[date] = []
    for i, (key, _label) in enumerate(periods):
        next_start = None
        if i + 1 < len(periods):
            next_start = _period_first_day(periods[i + 1][0], granularity)
        period_bounds.append(date.fromordinal(next_start.toordinal() - 1) if next_start else end)

    open_at_end = []
    for bound in period_bounds:
        open_at_end.append(
            sum(1 for (_i, s), (_j, e) in zip(starts, ends) if s <= bound and (e is None or e > bound))
        )

    return StatsTimeseriesOut(
        granularity=granularity,
        points=[
            TimeseriesPoint(
                period=key,
                label=label,
                started=started[i],
                finished=finished[i],
                created=created[i],
                open_at_end=open_at_end[i],
            )
            for i, (key, label) in enumerate(periods)
        ],
    )


def _period_first_day(key: str, granularity: str) -> date:
    if granularity == "jour":
        return date.fromisoformat(key)
    if granularity == "semaine":
        year, week = key.split("-S")
        return date.fromisocalendar(int(year), int(week), 1)
    if granularity == "trimestre":
        year, quarter = key.split("-T")
        return date(int(year), (int(quarter) - 1) * 3 + 1, 1)
    if granularity == "annee":
        return date(int(key), 1, 1)
    year, month = key.split("-")
    return date(int(year), int(month), 1)


@router.get("/audits", response_model=list[AuditDurationOut])
def audits_durations(
    start: date | None = None,
    end: date | None = None,
    category_id: str | None = None,
    pilot_id: str | None = None,
    prestation_company_id: str | None = None,
    tag_id: str | None = None,
    status: AuditStatus | None = None,
    audit_ids: list[str] | None = Query(default=None),
    limit: int = 500,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Détail audit par audit : durée planifiée, durée réelle et écart."""
    audits = _filtered_audits(
        db, start, end, category_id, pilot_id, prestation_company_id, tag_id, status, audit_ids, with_tags=False
    )
    categories = {c.id: c.name for c in db.query(Category).all()}
    rows: list[AuditDurationOut] = []
    for audit in audits[: max(limit, 1)]:
        p_start, p_end = planned_range(audit)
        a_start, a_end = actual_range(audit)
        planned_days = _span_days(p_start, p_end)
        actual_days = _span_days(a_start, a_end)
        rows.append(
            AuditDurationOut(
                audit_id=audit.id,
                name=audit.name,
                reference=audit.reference,
                category_name=categories.get(audit.category_id),
                status=audit.status,
                planned_days=planned_days,
                actual_days=actual_days,
                drift_days=round(actual_days - planned_days, 2) if (planned_days and actual_days) else None,
                planned_start=p_start,
                planned_end=p_end,
                actual_start=a_start,
                actual_end=a_end,
            )
        )
    return sorted(rows, key=lambda r: (r.actual_start is None, r.actual_start or date.min), reverse=False)
