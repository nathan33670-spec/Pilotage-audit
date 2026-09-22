import enum
import uuid
from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
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


class CustomFieldType(str, enum.Enum):
    TEXTE = "texte"
    TEXTE_LONG = "texte_long"
    NOMBRE = "nombre"
    DATE = "date"
    BOOLEEN = "booleen"
    LISTE = "liste"


class ImportStatus(str, enum.Enum):
    ANALYSE = "analyse"          # fichier chargé, analyse disponible
    A_COMPLETER = "a_completer"  # des détails manquants doivent être saisis
    PRET = "pret"                # prêt à être importé
    IMPORTE = "importe"
    ANNULE = "annule"


# Association audits <-> tags (catégorisation transverse, multi-valuée)
audit_tags = Table(
    "audit_tags",
    Base.metadata,
    Column("audit_id", String(36), ForeignKey("audits.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


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
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    default_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

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
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    priority: Mapped[AuditPriority] = mapped_column(Enum(AuditPriority), default=AuditPriority.MOYENNE)
    status: Mapped[AuditStatus] = mapped_column(Enum(AuditStatus), default=AuditStatus.BROUILLON, index=True)
    kanban_column_id: Mapped[str | None] = mapped_column(
        ForeignKey("kanban_columns.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pilot_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    service_owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prestation_company_id: Mapped[str | None] = mapped_column(ForeignKey("prestation_companies.id"), nullable=True)
    planned_start: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    planned_end: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    # Temps reels (saisis ou deduits des phases) : base des statistiques de duree reelle
    actual_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    estimated_days: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    import_batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category", back_populates="audits")
    kanban_column = relationship("KanbanColumn", back_populates="audits")
    tags = relationship("Tag", secondary=audit_tags, back_populates="audits", lazy="selectin")
    custom_values = relationship(
        "AuditCustomValue", back_populates="audit", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def custom_fields(self) -> dict:
        """Valeurs des champs personnalisés, indexées par clé de champ."""
        return {v.field.key: v.value for v in self.custom_values if v.field is not None}

    @property
    def tag_ids(self) -> list[str]:
        return [t.id for t in self.tags]
    pilot = relationship("User", foreign_keys=[pilot_id], back_populates="piloted_audits")
    service_owner = relationship("User", foreign_keys=[service_owner_id], back_populates="owned_audits")
    prestation_company = relationship("PrestationCompany", back_populates="audits")
    phases = relationship("AuditPhase", back_populates="audit", cascade="all, delete-orphan", order_by="AuditPhase.position")
    prerequisites = relationship("AuditPrerequisite", back_populates="audit", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="audit", cascade="all, delete-orphan")


class AuditPhase(Base):
    __tablename__ = "audit_phases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    position: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    actual_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[PhaseStatus] = mapped_column(Enum(PhaseStatus), default=PhaseStatus.PLANIFIE)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    auditor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
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


# ---------------------------------------------------------------------------
# Catégorisation transverse (tags)
# ---------------------------------------------------------------------------
class Tag(Base):
    """Étiquette libre permettant de catégoriser un audit sur plusieurs axes
    (périmètre, exigence réglementaire, entité, criticité métier, …).
    Complète la catégorie principale (`Category`), qui reste unique par audit."""

    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    audits = relationship("Audit", secondary=audit_tags, back_populates="tags")


# ---------------------------------------------------------------------------
# Kanban entièrement configurable depuis le panneau d'administration
# ---------------------------------------------------------------------------
class KanbanColumn(Base):
    """Colonne du tableau kanban. Entièrement pilotée par l'administrateur :
    libellé, couleur, ordre, limite d'en-cours (WIP), statut d'audit associé."""

    __tablename__ = "kanban_columns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    label: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#9e9e9e")
    position: Mapped[int] = mapped_column(Integer, default=0)
    wip_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Statut d'audit appliqué automatiquement quand une carte arrive dans la colonne
    # (facultatif : une colonne purement organisationnelle peut ne pas en avoir).
    mapped_status: Mapped[AuditStatus | None] = mapped_column(Enum(AuditStatus), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    audits = relationship("Audit", back_populates="kanban_column")


class AppSetting(Base):
    """Paramètres applicatifs modifiables en ligne (affichage du kanban,
    options de planning, etc.). Valeur stockée en JSON."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ---------------------------------------------------------------------------
# Champs personnalisés (créés à la volée lors d'un import en masse)
# ---------------------------------------------------------------------------
class CustomFieldDefinition(Base):
    __tablename__ = "custom_field_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    entity: Mapped[str] = mapped_column(String(40), default="audit")
    key: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(String(200))
    field_type: Mapped[CustomFieldType] = mapped_column(Enum(CustomFieldType), default=CustomFieldType.TEXTE)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    show_in_list: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_from_import: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    values = relationship("AuditCustomValue", back_populates="field", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("entity", "key", name="uq_custom_field_entity_key"),)


class AuditCustomValue(Base):
    __tablename__ = "audit_custom_values"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[str] = mapped_column(ForeignKey("custom_field_definitions.id", ondelete="CASCADE"), index=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)

    audit = relationship("Audit", back_populates="custom_values")
    field = relationship("CustomFieldDefinition", back_populates="values", lazy="joined")

    __table_args__ = (UniqueConstraint("audit_id", "field_id", name="uq_audit_custom_value"),)


# ---------------------------------------------------------------------------
# Import en masse des TI (tests d'intrusion / audits)
# ---------------------------------------------------------------------------
class ImportBatch(Base):
    """Lot d'import. Conserve le fichier analysé (lignes normalisées), le mapping
    des colonnes et les décisions de l'analyste, afin que l'import puisse être
    repris ou rejoué, et qu'il reste traçable."""

    __tablename__ = "import_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    filename: Mapped[str] = mapped_column(String(500))
    status: Mapped[ImportStatus] = mapped_column(Enum(ImportStatus), default=ImportStatus.ANALYSE)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    source_columns: Mapped[list] = mapped_column(JSON, default=list)
    mapping: Mapped[dict] = mapped_column(JSON, default=dict)          # colonne source -> champ cible
    rows: Mapped[list] = mapped_column(JSON, default=list)             # lignes brutes normalisées
    resolutions: Mapped[dict] = mapped_column(JSON, default=dict)      # détails saisis par l'analyste
    options: Mapped[dict] = mapped_column(JSON, default=dict)          # doublons, template à appliquer, …
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # résultat de l'import

    created_by = relationship("User")


Index("ix_audits_status_planned_start", Audit.status, Audit.planned_start)
Index("ix_audit_phases_dates", AuditPhase.start_date, AuditPhase.end_date)
