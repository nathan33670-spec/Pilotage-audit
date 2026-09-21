from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import PrerequisiteTemplate, PrerequisiteTemplateItem, User
from app.schemas import TemplateCreate, TemplateOut

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=list[TemplateOut])
def list_templates(
    category_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(PrerequisiteTemplate).options(selectinload(PrerequisiteTemplate.items))
    if category_id:
        query = query.filter(PrerequisiteTemplate.category_id == category_id)
    return query.order_by(PrerequisiteTemplate.name).all()


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    template = PrerequisiteTemplate(
        name=payload.name,
        description=payload.description,
        category_id=payload.category_id,
    )
    template.items = [
        PrerequisiteTemplateItem(label=item.label, is_mandatory=item.is_mandatory, position=item.position)
        for item in payload.items
    ]
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    template = db.get(PrerequisiteTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template introuvable")
    db.delete(template)
    db.commit()
