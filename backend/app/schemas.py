from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.models import AuditPriority, AuditStatus, AuthProvider, DocumentType, PhaseStatus, UserRole


def _validate_email_format(value: str) -> str:
    # Validation minimale (pas email-validator: trop strict pour les domaines internes type .local)
    if value.count("@") != 1 or value.startswith("@") or value.endswith("@"):
        raise ValueError("format d'email invalide")
    local_part, _, domain = value.partition("@")
    if not local_part or "." not in domain:
        raise ValueError("format d'email invalide")
    return value


# ---------- Users ----------
class UserBase(BaseModel):
    email: str
    full_name: str
    role: UserRole = UserRole.PILOTE_AUDIT

    email_format_validator = field_validator("email")(_validate_email_format)


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    auth_provider: AuthProvider
    created_at: datetime


# ---------- Auth ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str

    email_format_validator = field_validator("email")(_validate_email_format)


# ---------- Categories ----------
class CategoryBase(BaseModel):
    name: str
    description: str | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: str


# ---------- Prerequisite templates ----------
class TemplateItemBase(BaseModel):
    label: str
    is_mandatory: bool = True
    position: int = 0


class TemplateItemCreate(TemplateItemBase):
    pass


class TemplateItemOut(TemplateItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: str


class TemplateBase(BaseModel):
    name: str
    description: str | None = None
    category_id: str


class TemplateCreate(TemplateBase):
    items: list[TemplateItemCreate] = []


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str | None
    category_id: str
    items: list[TemplateItemOut] = []


# ---------- Phase templates ----------
class PhaseTemplateItemBase(BaseModel):
    name: str
    position: int = 0
    duration_days: int = 1


class PhaseTemplateItemCreate(PhaseTemplateItemBase):
    pass


class PhaseTemplateItemOut(PhaseTemplateItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: str


class PhaseTemplateBase(BaseModel):
    name: str
    description: str | None = None
    category_id: str


class PhaseTemplateCreate(PhaseTemplateBase):
    items: list[PhaseTemplateItemCreate] = []


class PhaseTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str | None
    category_id: str
    items: list[PhaseTemplateItemOut] = []


# ---------- Prestation companies ----------
class PrestationCompanyBase(BaseModel):
    name: str
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    allocated_days: float | None = None
    notes: str | None = None


class PrestationCompanyCreate(PrestationCompanyBase):
    pass


class PrestationCompanyUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    allocated_days: float | None = None
    notes: str | None = None


class PrestationCompanyOut(PrestationCompanyBase):
    model_config = ConfigDict(from_attributes=True)
    id: str


class PrestationConsumptionOut(BaseModel):
    company: PrestationCompanyOut
    consumed_days: float
    audits_count: int


# ---------- Audit phases ----------
class AuditPhaseBase(BaseModel):
    name: str
    position: int = 0
    start_date: date | None = None
    end_date: date | None = None
    status: PhaseStatus = PhaseStatus.PLANIFIE
    confirmed: bool = False
    auditor_id: str | None = None
    auditor_external_name: str | None = None
    notes: str | None = None


class AuditPhaseCreate(AuditPhaseBase):
    pass


class AuditPhaseUpdate(BaseModel):
    name: str | None = None
    position: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: PhaseStatus | None = None
    confirmed: bool | None = None
    auditor_id: str | None = None
    auditor_external_name: str | None = None
    notes: str | None = None


class AuditPhaseOut(AuditPhaseBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    audit_id: str


# ---------- Audit prerequisites ----------
class AuditPrerequisiteBase(BaseModel):
    label: str
    is_mandatory: bool = True


class AuditPrerequisiteCreate(AuditPrerequisiteBase):
    template_item_id: str | None = None


class AuditPrerequisiteUpdate(BaseModel):
    is_checked: bool | None = None
    notes: str | None = None


class AuditPrerequisiteOut(AuditPrerequisiteBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    audit_id: str
    is_checked: bool
    checked_by_id: str | None
    checked_at: datetime | None
    notes: str | None


# ---------- Documents ----------
class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    audit_id: str
    filename: str
    content_type: str | None
    size_bytes: int
    doc_type: DocumentType
    uploaded_by_id: str | None
    uploaded_at: datetime


# ---------- Audits ----------
class AuditBase(BaseModel):
    name: str
    description: str | None = None
    category_id: str | None = None
    priority: AuditPriority = AuditPriority.MOYENNE
    status: AuditStatus = AuditStatus.BROUILLON
    pilot_id: str | None = None
    service_owner_id: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    prestation_company_id: str | None = None
    planned_start: date | None = None
    planned_end: date | None = None


class AuditCreate(AuditBase):
    apply_template_id: str | None = None
    apply_phase_template_id: str | None = None


class AuditUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: str | None = None
    priority: AuditPriority | None = None
    status: AuditStatus | None = None
    pilot_id: str | None = None
    service_owner_id: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    prestation_company_id: str | None = None
    planned_start: date | None = None
    planned_end: date | None = None


class AuditOut(AuditBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime


class AuditDetailOut(AuditOut):
    phases: list[AuditPhaseOut] = []
    prerequisites: list[AuditPrerequisiteOut] = []
    documents: list[DocumentOut] = []


# ---------- Planning / workload ----------
class PlanningPhaseOut(BaseModel):
    phase_id: str
    audit_id: str
    audit_name: str
    phase_name: str
    priority: AuditPriority
    status: PhaseStatus
    confirmed: bool
    start_date: date | None
    end_date: date | None
    auditor_id: str | None
    auditor_name: str | None
    pilot_id: str | None
    pilot_name: str | None
    prestation_company_id: str | None
    prestation_company_name: str | None


class AuditorWorkloadOut(BaseModel):
    auditor_id: str
    auditor_name: str
    period_days: int
    assigned_days: float
    phases_count: int
