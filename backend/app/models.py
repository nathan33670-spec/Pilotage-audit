import enum
import uuid
from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    PILOTE_AUDIT = "pilote_audit"
    RESPONSABLE_SERVICE = "responsable_service"


class AuthProvider(str, enum.Enum):
    LOCAL = "local"
    SSO = "sso"


class AuditPriority(str, enum.Enum):
    BASSE = "basse"
    MOYENNE = "moyenne"
    HAUTE = "haute"
    CRITIQUE = "critique"


class AuditStatus(str, enum.Enum):
    BROUILLON = "brouillon"
    PLANIFIE = "planifie"
    EN_COURS = "en_cours"
    EN_ATTENTE = "en_attente"
    BLOQUE = "bloque"
    TERMINE = "termine"
    ANNULE = "annule"


class PhaseStatus(str, enum.Enum):
    PLANIFIE = "planifie"
    CONFIRME = "confirme"
    EN_COURS = "en_cours"
    TERMINE = "termine"
    ANNULE = "annule"


class DocumentType(str, enum.Enum):
    TECHNIQUE = "technique"
    RAPPORT = "rapport"
    AUTRE = "autre"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.PILOTE_AUDIT)
    auth_provider: Mapped[AuthProvider] = mapped_column(Enum(AuthProvider), default=AuthProvider.LOCAL)
    sso_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    piloted_audits = relationship("Audit", foreign_keys="Audit.pilot_id", back_populates="pilot")
    owned_audits = relationship("Audit", foreign_keys="Audit.service_owner_id", back_populates="service_owner")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    templates = relationship("PrerequisiteTemplate", back_populates="category", cascade="all, delete-orphan")
    phase_templates = relationship("PhaseTemplate", back_populates="category", cascade="all, delete-orphan")
    audits = relationship("Audit", back_populates="category")


class PrerequisiteTemplate(Base):
    __tablename__ = "prerequisite_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    category = relationship("Category", back_populates="templates")
    items = relationship(
        "PrerequisiteTemplateItem", back_populates="template", cascade="all, delete-orphan", order_by="PrerequisiteTemplateItem.position"
    )


class PrerequisiteTemplateItem(Base):
    __tablename__ = "prerequisite_template_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    template_id: Mapped[str] = mapped_column(ForeignKey("prerequisite_templates.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(500))
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    template = relationship("PrerequisiteTemplate", back_populates="items")


class PhaseTemplate(Base):
    __tablename__ = "phase_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    category = relationship("Category", back_populates="phase_templates")
    items = relationship(
        "PhaseTemplateItem", back_populates="template", cascade="all, delete-orphan", order_by="PhaseTemplateItem.position"
    )


class PhaseTemplateItem(Base):
    __tablename__ = "phase_template_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    template_id: Mapped[str] = mapped_column(ForeignKey("phase_templates.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    position: Mapped[int] = mapped_column(Integer, default=0)
    duration_days: Mapped[int] = mapped_column(Integer, default=1)

    template = relationship("PhaseTemplate", back_populates="items")


class PrestationCompany(Base):
    __tablename__ = "prestation_companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    allocated_days: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    audits = relationship("Audit", back_populates="prestation_company")


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    priority: Mapped[AuditPriority] = mapped_column(Enum(AuditPriority), default=AuditPriority.MOYENNE)
    status: Mapped[AuditStatus] = mapped_column(Enum(AuditStatus), default=AuditStatus.BROUILLON)
    pilot_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    service_owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prestation_company_id: Mapped[str | None] = mapped_column(ForeignKey("prestation_companies.id"), nullable=True)
    planned_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category", back_populates="audits")
    pilot = relationship("User", foreign_keys=[pilot_id], back_populates="piloted_audits")
    service_owner = relationship("User", foreign_keys=[service_owner_id], back_populates="owned_audits")
    prestation_company = relationship("PrestationCompany", back_populates="audits")
    phases = relationship("AuditPhase", back_populates="audit", cascade="all, delete-orphan", order_by="AuditPhase.position")
    prerequisites = relationship("AuditPrerequisite", back_populates="audit", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="audit", cascade="all, delete-orphan")


class AuditPhase(Base):
    __tablename__ = "audit_phases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    position: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[PhaseStatus] = mapped_column(Enum(PhaseStatus), default=PhaseStatus.PLANIFIE)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    auditor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    auditor_external_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    audit = relationship("Audit", back_populates="phases")
    auditor = relationship("User")


class AuditPrerequisite(Base):
    __tablename__ = "audit_prerequisites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"))
    template_item_id: Mapped[str | None] = mapped_column(ForeignKey("prerequisite_template_items.id"), nullable=True)
    label: Mapped[str] = mapped_column(String(500))
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True)
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    audit = relationship("Audit", back_populates="prerequisites")
    checked_by = relationship("User")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(500))
    stored_filename: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), default=DocumentType.AUTRE)
    uploaded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    audit = relationship("Audit", back_populates="documents")
    uploaded_by = relationship("User")
