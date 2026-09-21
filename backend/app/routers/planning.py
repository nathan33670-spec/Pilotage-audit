from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import Audit, AuditPhase, User
from app.schemas import AuditorWorkloadOut, PlanningPhaseOut

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
