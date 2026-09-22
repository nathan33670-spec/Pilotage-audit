from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import Audit, Category, User
from app.schemas import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Category).order_by(Category.position, Category.name).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(Category).filter(Category.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Cette catégorie existe déjà")
    category = Category(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: str, payload: CategoryUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != category.name:
        if db.query(Category).filter(Category.name == data["name"]).first():
            raise HTTPException(status_code=400, detail="Cette catégorie existe déjà")
    for field, value in data.items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    used = db.query(Audit).filter(Audit.category_id == category_id).count()
    if used:
        raise HTTPException(
            status_code=400,
            detail=f"Catégorie utilisée par {used} audit(s) : réaffectez-les avant de la supprimer",
        )
    db.delete(category)
    db.commit()
