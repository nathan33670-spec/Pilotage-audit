from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import PhaseTemplate, PhaseTemplateItem, User
from app.schemas import PhaseTemplateCreate, PhaseTemplateOut

router = APIRouter(prefix="/api/phase-templates", tags=["phase-templates"])


@router.get("", response_model=list[PhaseTemplateOut])
def list_phase_templates(
    category_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(PhaseTemplate).options(selectinload(PhaseTemplate.items))
    if category_id:
        query = query.filter(PhaseTemplate.category_id == category_id)
    return query.order_by(PhaseTemplate.name).all()


@router.post("", response_model=PhaseTemplateOut, status_code=201)
def create_phase_template(payload: PhaseTemplateCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    template = PhaseTemplate(
        name=payload.name,
        description=payload.description,
        category_id=payload.category_id,
    )
    template.items = [
        PhaseTemplateItem(name=item.name, position=item.position, duration_days=item.duration_days)
        for item in payload.items
    ]
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_phase_template(template_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    template = db.get(PhaseTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template introuvable")
    db.delete(template)
    db.commit()
