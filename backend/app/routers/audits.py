from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, require_pilote_or_admin
from app.models import (
    Audit,
    AuditPhase,
    AuditPrerequisite,
    AuditPriority,
    AuditStatus,
    PhaseTemplate,
    PrerequisiteTemplate,
    User,
)
from app.schemas import (
    AuditCreate,
    AuditDetailOut,
    AuditOut,
    AuditPhaseCreate,
    AuditPhaseOut,
    AuditPhaseUpdate,
    AuditPrerequisiteCreate,
    AuditPrerequisiteOut,
    AuditPrerequisiteUpdate,
    AuditUpdate,
)

router = APIRouter(prefix="/api/audits", tags=["audits"])


def _get_audit_or_404(db: Session, audit_id: str) -> Audit:
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit introuvable")
    return audit


def _apply_phase_template(audit: Audit, template: PhaseTemplate, position_offset: int = 0) -> None:
    """Cree les phases a partir du template. Les dates sont calculees en cascade
    depuis la date de debut prevue de l'audit si elle est connue, sinon laissees vides."""
    cursor: date | None = audit.planned_start
    for item in template.items:
        start = cursor
        end = cursor + timedelta(days=max(item.duration_days, 1) - 1) if cursor else None
        audit.phases.append(
            AuditPhase(
                name=item.name,
                position=item.position + position_offset,
                start_date=start,
                end_date=end,
            )
        )
        if cursor and end:
            cursor = end + timedelta(days=1)


@router.get("", response_model=list[AuditOut])
def list_audits(
    status: AuditStatus | None = None,
    priority: AuditPriority | None = None,
    pilot_id: str | None = None,
    category_id: str | None = None,
    prestation_company_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Audit)
    if status:
        query = query.filter(Audit.status == status)
    if priority:
        query = query.filter(Audit.priority == priority)
    if pilot_id:
        query = query.filter(Audit.pilot_id == pilot_id)
    if category_id:
        query = query.filter(Audit.category_id == category_id)
    if prestation_company_id:
        query = query.filter(Audit.prestation_company_id == prestation_company_id)
    return query.order_by(Audit.planned_start.is_(None), Audit.planned_start).all()


@router.post("", response_model=AuditDetailOut, status_code=201)
def create_audit(payload: AuditCreate, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)):
    data = payload.model_dump(exclude={"apply_template_id", "apply_phase_template_id"})
    audit = Audit(**data)
    db.add(audit)
    db.flush()

    if payload.apply_template_id:
        template = db.get(PrerequisiteTemplate, payload.apply_template_id)
        if template is None:
            raise HTTPException(status_code=404, detail="Template de pré-requis introuvable")
        for item in template.items:
            audit.prerequisites.append(
                AuditPrerequisite(
                    template_item_id=item.id,
                    label=item.label,
                    is_mandatory=item.is_mandatory,
                )
            )

    if payload.apply_phase_template_id:
        phase_template = db.get(PhaseTemplate, payload.apply_phase_template_id)
        if phase_template is None:
            raise HTTPException(status_code=404, detail="Template de phases introuvable")
        _apply_phase_template(audit, phase_template)

    db.commit()
    db.refresh(audit)
    return audit


@router.post("/{audit_id}/apply-phase-template/{template_id}", response_model=AuditDetailOut)
def apply_phase_template(
    audit_id: str, template_id: str, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)
):
    """Ajoute les phases d'un template a un audit existant (en plus des phases deja presentes)."""
    audit = _get_audit_or_404(db, audit_id)
    phase_template = db.get(PhaseTemplate, template_id)
    if phase_template is None:
        raise HTTPException(status_code=404, detail="Template de phases introuvable")

    base_position = max((p.position for p in audit.phases), default=-1) + 1
    _apply_phase_template(audit, phase_template, position_offset=base_position)

    db.commit()
    db.refresh(audit)
    return audit


@router.get("/{audit_id}", response_model=AuditDetailOut)
def get_audit(audit_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    audit = (
        db.query(Audit)
        .options(
            selectinload(Audit.phases),
            selectinload(Audit.prerequisites),
            selectinload(Audit.documents),
        )
        .filter(Audit.id == audit_id)
        .first()
    )
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit introuvable")
    return audit


@router.patch("/{audit_id}", response_model=AuditDetailOut)
def update_audit(
    audit_id: str, payload: AuditUpdate, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)
):
    audit = _get_audit_or_404(db, audit_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(audit, field, value)
    db.commit()
    db.refresh(audit)
    return audit


@router.delete("/{audit_id}", status_code=204)
def delete_audit(audit_id: str, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)):
    audit = _get_audit_or_404(db, audit_id)
    db.delete(audit)
    db.commit()


# ---------- Phases ----------
@router.post("/{audit_id}/phases", response_model=AuditPhaseOut, status_code=201)
def add_phase(
    audit_id: str, payload: AuditPhaseCreate, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)
):
    _get_audit_or_404(db, audit_id)
    phase = AuditPhase(audit_id=audit_id, **payload.model_dump())
    db.add(phase)
    db.commit()
    db.refresh(phase)
    return phase


@router.patch("/{audit_id}/phases/{phase_id}", response_model=AuditPhaseOut)
def update_phase(
    audit_id: str,
    phase_id: str,
    payload: AuditPhaseUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_pilote_or_admin),
):
    phase = db.get(AuditPhase, phase_id)
    if phase is None or phase.audit_id != audit_id:
        raise HTTPException(status_code=404, detail="Phase introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(phase, field, value)
    db.commit()
    db.refresh(phase)
    return phase


@router.delete("/{audit_id}/phases/{phase_id}", status_code=204)
def delete_phase(
    audit_id: str, phase_id: str, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)
):
    phase = db.get(AuditPhase, phase_id)
    if phase is None or phase.audit_id != audit_id:
        raise HTTPException(status_code=404, detail="Phase introuvable")
    db.delete(phase)
    db.commit()


# ---------- Prerequisites ----------
@router.post("/{audit_id}/prerequisites", response_model=AuditPrerequisiteOut, status_code=201)
def add_prerequisite(
    audit_id: str,
    payload: AuditPrerequisiteCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_pilote_or_admin),
):
    _get_audit_or_404(db, audit_id)
    prerequisite = AuditPrerequisite(audit_id=audit_id, **payload.model_dump())
    db.add(prerequisite)
    db.commit()
    db.refresh(prerequisite)
    return prerequisite


@router.patch("/{audit_id}/prerequisites/{prerequisite_id}", response_model=AuditPrerequisiteOut)
def update_prerequisite(
    audit_id: str,
    prerequisite_id: str,
    payload: AuditPrerequisiteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prerequisite = db.get(AuditPrerequisite, prerequisite_id)
    if prerequisite is None or prerequisite.audit_id != audit_id:
        raise HTTPException(status_code=404, detail="Pré-requis introuvable")

    data = payload.model_dump(exclude_unset=True)
    if "is_checked" in data:
        prerequisite.is_checked = data["is_checked"]
        prerequisite.checked_by_id = current_user.id if data["is_checked"] else None
        prerequisite.checked_at = datetime.now(timezone.utc) if data["is_checked"] else None
    if "notes" in data:
        prerequisite.notes = data["notes"]

    db.commit()
    db.refresh(prerequisite)
    return prerequisite


@router.delete("/{audit_id}/prerequisites/{prerequisite_id}", status_code=204)
def delete_prerequisite(
    audit_id: str, prerequisite_id: str, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)
):
    prerequisite = db.get(AuditPrerequisite, prerequisite_id)
    if prerequisite is None or prerequisite.audit_id != audit_id:
        raise HTTPException(status_code=404, detail="Pré-requis introuvable")
    db.delete(prerequisite)
    db.commit()
