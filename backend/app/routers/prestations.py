from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import Audit, AuditPhase, PrestationCompany, User
from app.schemas import (
    PrestationCompanyCreate,
    PrestationCompanyOut,
    PrestationCompanyUpdate,
    PrestationConsumptionOut,
)

router = APIRouter(prefix="/api/prestation-companies", tags=["prestation-companies"])


@router.get("", response_model=list[PrestationCompanyOut])
def list_companies(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(PrestationCompany).order_by(PrestationCompany.name).all()


@router.post("", response_model=PrestationCompanyOut, status_code=201)
def create_company(payload: PrestationCompanyCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(PrestationCompany).filter(PrestationCompany.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Cette société existe déjà")
    company = PrestationCompany(**payload.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.patch("/{company_id}", response_model=PrestationCompanyOut)
def update_company(
    company_id: str, payload: PrestationCompanyUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    company = db.get(PrestationCompany, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Société introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}", status_code=204)
def delete_company(company_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    company = db.get(PrestationCompany, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Société introuvable")
    db.delete(company)
    db.commit()


@router.get("/{company_id}/consumption", response_model=PrestationConsumptionOut)
def get_consumption(company_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Calcule la consommation (en jours) d'une société de prestation à partir des phases planifiées."""
    company = db.get(PrestationCompany, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Société introuvable")

    audits = db.query(Audit).filter(Audit.prestation_company_id == company_id).all()
    audit_ids = [a.id for a in audits]

    consumed_days = 0.0
    if audit_ids:
        phases = db.query(AuditPhase).filter(AuditPhase.audit_id.in_(audit_ids)).all()
        for phase in phases:
            # priorité aux dates réelles ; les phases non datées ne consomment rien
            start = phase.actual_start_date or phase.start_date
            end = phase.actual_end_date or phase.end_date
            if start is None or end is None or end < start:
                continue
            consumed_days += (end - start).days + 1

    return PrestationConsumptionOut(company=company, consumed_days=consumed_days, audits_count=len(audits))
