from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Audit, AuditPhase, AuditStatus, Category, Tag, User
from app.schemas import AuditorWorkloadOut, PlanningAuditOut, PlanningPhaseOut, PlanningRangeOut

router = APIRouter(prefix="/api/planning", tags=["planning"])


@router.get("/phases", response_model=list[PlanningPhaseOut])
def list_planning_phases(
    start: date | None = None,
    end: date | None = None,
    auditor_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Retourne les phases d'audit pour affichage kanban/gantt, avec code couleur (priorite/statut/confirmation).
    Sans start/end, retourne toutes les phases (y compris non datees) pour la vue kanban."""
    query = db.query(AuditPhase).options(
        joinedload(AuditPhase.audit).joinedload(Audit.pilot),
        joinedload(AuditPhase.audit).joinedload(Audit.prestation_company),
        joinedload(AuditPhase.auditor),
    )
    if start:
        query = query.filter(AuditPhase.end_date >= start)
    if end:
        query = query.filter(AuditPhase.start_date <= end)
    if auditor_id:
        query = query.filter(AuditPhase.auditor_id == auditor_id)

    phases = query.order_by(AuditPhase.position).all()
    return [
        PlanningPhaseOut(
            phase_id=phase.id,
            audit_id=phase.audit_id,
            audit_name=phase.audit.name,
            phase_name=phase.name,
            priority=phase.audit.priority,
            status=phase.status,
            confirmed=phase.confirmed,
            start_date=phase.start_date,
            end_date=phase.end_date,
            auditor_id=phase.auditor_id,
            auditor_name=phase.auditor.full_name if phase.auditor else phase.auditor_external_name,
            pilot_id=phase.audit.pilot_id,
            pilot_name=phase.audit.pilot.full_name if phase.audit.pilot else None,
            prestation_company_id=phase.audit.prestation_company_id,
            prestation_company_name=phase.audit.prestation_company.name if phase.audit.prestation_company else None,
        )
        for phase in phases
    ]


@router.get("/workload", response_model=list[AuditorWorkloadOut])
def get_workload(
    start: date,
    end: date,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Calcule le plan de charge par auditeur interne sur une période donnée (somme des jours de phases assignées)."""
    query = (
        db.query(AuditPhase)
        .options(joinedload(AuditPhase.auditor))
        .filter(AuditPhase.auditor_id.isnot(None))
        .filter(AuditPhase.start_date.isnot(None))
        .filter(AuditPhase.end_date.isnot(None))
        .filter(AuditPhase.end_date >= start)
        .filter(AuditPhase.start_date <= end)
    )

    period_days = (end - start).days + 1
    workload: dict[str, dict] = {}
    for phase in query.all():
        overlap_start = max(phase.start_date, start)
        overlap_end = min(phase.end_date, end)
        days = (overlap_end - overlap_start).days + 1
        if days <= 0:
            continue

        entry = workload.setdefault(
            phase.auditor_id,
            {"auditor_name": phase.auditor.full_name, "assigned_days": 0.0, "phases_count": 0},
        )
        entry["assigned_days"] += days
        entry["phases_count"] += 1

    return [
        AuditorWorkloadOut(
            auditor_id=auditor_id,
            auditor_name=data["auditor_name"],
            period_days=period_days,
            assigned_days=data["assigned_days"],
            phases_count=data["phases_count"],
        )
        for auditor_id, data in workload.items()
    ]


# ---------------------------------------------------------------------------
# Échelles de planning (jour, semaine, mois, trimestre, année, cycle 3 ans)
# ---------------------------------------------------------------------------
SCALES = {
    "jour": {"label": "Jour", "unit": "day", "default_span": 14},
    "semaine": {"label": "Semaine", "unit": "week", "default_span": 12},
    "mois": {"label": "Mois", "unit": "month", "default_span": 12},
    "trimestre": {"label": "Trimestre", "unit": "quarter", "default_span": 8},
    "annee": {"label": "Année", "unit": "year", "default_span": 3},
    "cycle": {"label": "Cycle pluriannuel", "unit": "quarter", "default_span": 12},
}


def _add_months(value: date, months: int) -> date:
    total = value.year * 12 + (value.month - 1) + months
    year, month = divmod(total, 12)
    day = min(value.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                         31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month])
    return date(year, month + 1, day)


def compute_range(scale: str, anchor: date, span: int | None, rolling: bool, cycle_years: int = 3) -> tuple[date, date]:
    """Calcule la fenêtre affichée pour une échelle donnée.

    `rolling=True` produit une vue **glissante** démarrant à la date d'ancrage ;
    sinon la fenêtre est alignée sur le début de la période (mois, année, cycle).
    """
    config = SCALES.get(scale) or SCALES["mois"]
    span = span or config["default_span"]

    if scale == "jour":
        start = anchor if rolling else anchor
        return start, date.fromordinal(start.toordinal() + span - 1)
    if scale == "semaine":
        start = anchor if rolling else date.fromordinal(anchor.toordinal() - anchor.weekday())
        return start, date.fromordinal(start.toordinal() + span * 7 - 1)
    if scale == "mois":
        start = anchor if rolling else anchor.replace(day=1)
        end = date.fromordinal(_add_months(start, span).toordinal() - 1)
        return start, end
    if scale == "trimestre":
        if rolling:
            start = anchor
        else:
            quarter_month = ((anchor.month - 1) // 3) * 3 + 1
            start = date(anchor.year, quarter_month, 1)
        end = date.fromordinal(_add_months(start, span * 3).toordinal() - 1)
        return start, end
    if scale == "annee":
        start = anchor if rolling else date(anchor.year, 1, 1)
        end = date.fromordinal(_add_months(start, span * 12).toordinal() - 1)
        return start, end
    # cycle pluriannuel (par défaut 3 ans) : aligné sur le début du cycle
    years = max(cycle_years, 1)
    if rolling:
        start = anchor
    else:
        cycle_start_year = anchor.year - (anchor.year % years)
        start = date(cycle_start_year, 1, 1)
    end = date.fromordinal(_add_months(start, years * 12).toordinal() - 1)
    return start, end


def _period_columns(scale: str, start: date, end: date) -> list[dict]:
    """En-têtes de colonnes du planning pour l'échelle demandée."""
    columns: list[dict] = []
    cursor = start
    while cursor <= end:
        if scale == "jour":
            nxt = date.fromordinal(cursor.toordinal() + 1)
            label, sub = cursor.strftime("%d"), cursor.strftime("%a")
        elif scale == "semaine":
            nxt = date.fromordinal(cursor.toordinal() + 7)
            iso = cursor.isocalendar()
            label, sub = f"S{iso.week:02d}", cursor.strftime("%m/%Y")
        elif scale in ("mois", "cycle"):
            nxt = _add_months(cursor.replace(day=1), 1)
            label, sub = cursor.strftime("%m"), cursor.strftime("%Y")
        elif scale == "trimestre":
            quarter = (cursor.month - 1) // 3 + 1
            nxt = _add_months(date(cursor.year, (quarter - 1) * 3 + 1, 1), 3)
            label, sub = f"T{quarter}", str(cursor.year)
        else:  # annee
            nxt = date(cursor.year + 1, 1, 1)
            label, sub = str(cursor.year), ""
        columns.append(
            {
                "start": cursor.isoformat(),
                "end": min(date.fromordinal(nxt.toordinal() - 1), end).isoformat(),
                "label": label,
                "sublabel": sub,
                "is_weekend": scale == "jour" and cursor.weekday() >= 5,
            }
        )
        cursor = nxt
    return columns


@router.get("/range", response_model=PlanningRangeOut)
def planning_range(
    scale: str = "mois",
    anchor: date | None = None,
    span: int | None = None,
    rolling: bool = False,
    cycle_years: int = 3,
    _: User = Depends(get_current_user),
):
    """Fenêtre temporelle et colonnes correspondant à l'échelle demandée."""
    if scale not in SCALES:
        raise HTTPException(status_code=400, detail=f"Échelle inconnue : {scale}")
    anchor = anchor or date.today()
    start, end = compute_range(scale, anchor, span, rolling, cycle_years)
    return PlanningRangeOut(scale=scale, start=start, end=end, columns=_period_columns(scale, start, end))


@router.get("/audits", response_model=list[PlanningAuditOut])
def planning_audits(
    start: date | None = None,
    end: date | None = None,
    scale: str | None = None,
    anchor: date | None = None,
    span: int | None = None,
    rolling: bool = False,
    cycle_years: int = 3,
    audit_ids: list[str] | None = Query(default=None),
    category_id: str | None = None,
    tag_id: list[str] | None = Query(default=None),
    pilot_id: str | None = None,
    prestation_company_id: str | None = None,
    auditor_id: str | None = None,
    status: AuditStatus | None = None,
    include_undated: bool = False,
    include_phases: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Audits (et leurs phases) projetés sur la fenêtre demandée.

    L'analyste choisit l'échelle (jour, semaine, mois, trimestre, année, cycle
    pluriannuel), une fenêtre glissante ou alignée, et peut restreindre la vue
    à une sélection d'audits, une catégorie ou des étiquettes.
    """
    if start is None or end is None:
        start, end = compute_range(scale or "mois", anchor or date.today(), span, rolling, cycle_years)

    query = db.query(Audit).options(
        selectinload(Audit.tags),
        joinedload(Audit.pilot),
        joinedload(Audit.prestation_company),
        joinedload(Audit.category),
    )
    if include_phases or auditor_id:
        query = query.options(selectinload(Audit.phases).joinedload(AuditPhase.auditor))
    if audit_ids:
        query = query.filter(Audit.id.in_(audit_ids))
    if category_id:
        query = query.filter(Audit.category_id == category_id)
    if pilot_id:
        query = query.filter(Audit.pilot_id == pilot_id)
    if prestation_company_id:
        query = query.filter(Audit.prestation_company_id == prestation_company_id)
    if status:
        query = query.filter(Audit.status == status)
    for tag in tag_id or []:
        query = query.filter(Audit.tags.any(Tag.id == tag))

    # La fenêtre temporelle est appliquée en base : seuls les audits qui la
    # chevauchent (par leurs dates prévues, réelles, ou celles d'une phase)
    # sont chargés.
    window = or_(
        and_(Audit.planned_start <= end, Audit.planned_end >= start),
        and_(Audit.actual_start <= end, Audit.actual_end >= start),
        Audit.phases.any(and_(AuditPhase.start_date <= end, AuditPhase.end_date >= start)),
    )
    if include_undated:
        window = or_(
            window,
            and_(
                Audit.planned_start.is_(None),
                Audit.planned_end.is_(None),
                Audit.actual_start.is_(None),
                Audit.actual_end.is_(None),
            ),
        )
    query = query.filter(window)

    results: list[PlanningAuditOut] = []
    for audit in query.all():
        phases = (
            [
                p for p in audit.phases
                if (auditor_id is None or p.auditor_id == auditor_id)
                and p.start_date and p.end_date and p.end_date >= start and p.start_date <= end
            ]
            if (include_phases or auditor_id)
            else []
        )
        audit_start = audit.actual_start or audit.planned_start
        audit_end = audit.actual_end or audit.planned_end
        in_window = bool(
            audit_start and audit_end and audit_end >= start and audit_start <= end
        )
        if auditor_id is not None and not phases:
            continue
        if not phases and not in_window and not (include_undated and audit_start is None and audit_end is None):
            continue
        if not include_phases:
            phases = []

        results.append(
            PlanningAuditOut(
                audit_id=audit.id,
                name=audit.name,
                reference=audit.reference,
                category_id=audit.category_id,
                category_name=audit.category.name if audit.category else None,
                tag_ids=[t.id for t in audit.tags],
                priority=audit.priority,
                status=audit.status,
                pilot_id=audit.pilot_id,
                pilot_name=audit.pilot.full_name if audit.pilot else None,
                prestation_company_id=audit.prestation_company_id,
                prestation_company_name=audit.prestation_company.name if audit.prestation_company else None,
                planned_start=audit.planned_start,
                planned_end=audit.planned_end,
                actual_start=audit.actual_start,
                actual_end=audit.actual_end,
                phases=[
                    PlanningPhaseOut(
                        phase_id=p.id,
                        audit_id=audit.id,
                        audit_name=audit.name,
                        phase_name=p.name,
                        priority=audit.priority,
                        status=p.status,
                        confirmed=p.confirmed,
                        start_date=p.start_date,
                        end_date=p.end_date,
                        auditor_id=p.auditor_id,
                        auditor_name=p.auditor.full_name if p.auditor else p.auditor_external_name,
                        pilot_id=audit.pilot_id,
                        pilot_name=audit.pilot.full_name if audit.pilot else None,
                        prestation_company_id=audit.prestation_company_id,
                        prestation_company_name=audit.prestation_company.name if audit.prestation_company else None,
                    )
                    for p in sorted(phases, key=lambda ph: (ph.position, ph.start_date or start))
                ],
            )
        )
    return sorted(results, key=lambda a: (a.planned_start is None, a.planned_start or date.max, a.name))
