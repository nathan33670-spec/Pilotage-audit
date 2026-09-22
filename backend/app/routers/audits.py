from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, require_pilote_or_admin
from app.models import (
    Audit,
    AuditCustomValue,
    AuditPhase,
    AuditPrerequisite,
    AuditPriority,
    AuditStatus,
    CustomFieldDefinition,
    KanbanColumn,
    PhaseTemplate,
    PrerequisiteTemplate,
    Tag,
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
    KanbanMove,
)

router = APIRouter(prefix="/api/audits", tags=["audits"])


def _get_audit_or_404(db: Session, audit_id: str) -> Audit:
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit introuvable")
    return audit


def _default_column(db: Session) -> KanbanColumn | None:
    return (
        db.query(KanbanColumn).filter(KanbanColumn.is_default.is_(True)).first()
        or db.query(KanbanColumn).order_by(KanbanColumn.position).first()
    )


def _column_for_status(db: Session, status: AuditStatus) -> KanbanColumn | None:
    return (
        db.query(KanbanColumn)
        .filter(KanbanColumn.mapped_status == status, KanbanColumn.is_active.is_(True))
        .order_by(KanbanColumn.position)
        .first()
        or _default_column(db)
    )


def _apply_tags(db: Session, audit: Audit, tag_ids: list[str]) -> None:
    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all() if tag_ids else []
    found = {t.id for t in tags}
    unknown = [t for t in tag_ids if t not in found]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Étiquette(s) inconnue(s) : {', '.join(unknown)}")
    audit.tags = tags


def _apply_custom_fields(db: Session, audit: Audit, custom_fields: dict) -> None:
    """Enregistre les valeurs des champs personnalisés (clé du champ -> valeur)."""
    if not custom_fields:
        return
    definitions = {
        f.key: f for f in db.query(CustomFieldDefinition).filter(CustomFieldDefinition.entity == "audit").all()
    }
    unknown = [key for key in custom_fields if key not in definitions]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Champ personnalisé inconnu : {', '.join(unknown)}")
    existing = {v.field_id: v for v in audit.custom_values}
    for key, value in custom_fields.items():
        field = definitions[key]
        current = existing.get(field.id)
        if value in (None, ""):
            if current is not None:
                db.delete(current)
            continue
        if current is None:
            db.add(AuditCustomValue(audit_id=audit.id, field_id=field.id, value=str(value)))
        else:
            current.value = str(value)


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
    kanban_column_id: str | None = None,
    tag_id: list[str] | None = Query(default=None),
    q: str | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=500, le=2000),
    offset: int = 0,
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
    if kanban_column_id:
        query = query.filter(Audit.kanban_column_id == kanban_column_id)
    for tag in tag_id or []:
        query = query.filter(Audit.tags.any(Tag.id == tag))
    if q:
        pattern = f"%{q.strip()}%"
        query = query.filter(or_(Audit.name.ilike(pattern), Audit.reference.ilike(pattern), Audit.description.ilike(pattern)))
    if start:
        query = query.filter(or_(Audit.planned_end.is_(None), Audit.planned_end >= start))
    if end:
        query = query.filter(or_(Audit.planned_start.is_(None), Audit.planned_start <= end))
    return (
        query.order_by(Audit.planned_start.is_(None), Audit.planned_start, Audit.name)
        .offset(max(offset, 0))
        .limit(limit)
        .all()
    )


@router.post("", response_model=AuditDetailOut, status_code=201)
def create_audit(payload: AuditCreate, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)):
    data = payload.model_dump(exclude={"apply_template_id", "apply_phase_template_id", "tag_ids", "custom_fields"})
    audit = Audit(**data)
    db.add(audit)
    db.flush()

    _apply_tags(db, audit, payload.tag_ids)
    _apply_custom_fields(db, audit, payload.custom_fields)
    if audit.kanban_column_id is None:
        column = _column_for_status(db, audit.status)
        audit.kanban_column_id = column.id if column else None

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
    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)
    custom_fields = data.pop("custom_fields", None)

    for field, value in data.items():
        setattr(audit, field, value)

    if tag_ids is not None:
        _apply_tags(db, audit, tag_ids)
    if custom_fields is not None:
        _apply_custom_fields(db, audit, custom_fields)

    # Cohérence statut <-> colonne kanban
    if "kanban_column_id" in data and data["kanban_column_id"]:
        column = db.get(KanbanColumn, data["kanban_column_id"])
        if column is None:
            raise HTTPException(status_code=404, detail="Colonne kanban introuvable")
        if column.mapped_status is not None and "status" not in data:
            audit.status = column.mapped_status
    elif "status" in data and "kanban_column_id" not in data:
        column = _column_for_status(db, audit.status)
        audit.kanban_column_id = column.id if column else audit.kanban_column_id

    db.commit()
    db.refresh(audit)
    return audit


@router.post("/{audit_id}/kanban-column", response_model=AuditOut)
def move_audit_to_column(
    audit_id: str, payload: KanbanMove, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)
):
    """Déplace une carte dans une autre colonne du kanban (et applique le statut
    associé à la colonne, si elle en définit un)."""
    audit = _get_audit_or_404(db, audit_id)
    column = db.get(KanbanColumn, payload.column_id)
    if column is None:
        raise HTTPException(status_code=404, detail="Colonne kanban introuvable")
    audit.kanban_column_id = column.id
    if column.mapped_status is not None:
        audit.status = column.mapped_status
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
