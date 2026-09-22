from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.models import (
    AuditPriority,
    AuditStatus,
    AuthProvider,
    CustomFieldType,
    DocumentType,
    ImportStatus,
    PhaseStatus,
    UserRole,
)


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
    code: str | None = None
    color: str | None = None
    default_duration_days: int | None = None
    position: int = 0


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    code: str | None = None
    color: str | None = None
    default_duration_days: int | None = None
    position: int | None = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: str


# ---------- Tags (catégorisation transverse) ----------
class TagBase(BaseModel):
    name: str
    color: str | None = None
    description: str | None = None


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    description: str | None = None


class TagOut(TagBase):
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
    actual_start_date: date | None = None
    actual_end_date: date | None = None
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
    actual_start_date: date | None = None
    actual_end_date: date | None = None
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
    reference: str | None = None
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
    actual_start: date | None = None
    actual_end: date | None = None
    estimated_days: float | None = None
    kanban_column_id: str | None = None


class AuditCreate(AuditBase):
    apply_template_id: str | None = None
    apply_phase_template_id: str | None = None
    tag_ids: list[str] = []
    custom_fields: dict[str, str | None] = {}


class AuditUpdate(BaseModel):
    name: str | None = None
    reference: str | None = None
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
    actual_start: date | None = None
    actual_end: date | None = None
    estimated_days: float | None = None
    kanban_column_id: str | None = None
    tag_ids: list[str] | None = None
    custom_fields: dict[str, str | None] | None = None


class AuditOut(AuditBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = []
    tag_ids: list[str] = []
    custom_fields: dict[str, str | None] = {}


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


# ---------- Kanban configurable ----------
class KanbanColumnBase(BaseModel):
    key: str
    label: str
    description: str | None = None
    color: str = "#9e9e9e"
    position: int = 0
    wip_limit: int | None = None
    mapped_status: AuditStatus | None = None
    is_default: bool = False
    is_final: bool = False
    is_active: bool = True


class KanbanColumnCreate(KanbanColumnBase):
    pass


class KanbanColumnUpdate(BaseModel):
    key: str | None = None
    label: str | None = None
    description: str | None = None
    color: str | None = None
    position: int | None = None
    wip_limit: int | None = None
    mapped_status: AuditStatus | None = None
    is_default: bool | None = None
    is_final: bool | None = None
    is_active: bool | None = None


class KanbanColumnOut(KanbanColumnBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    audits_count: int = 0


class KanbanReorder(BaseModel):
    """Nouvel ordre des colonnes (liste d'identifiants, du premier au dernier)."""

    column_ids: list[str]


class KanbanMove(BaseModel):
    column_id: str


class KanbanColumnDelete(BaseModel):
    """Colonne de repli pour les audits de la colonne supprimée."""

    move_audits_to: str | None = None


# ---------- Paramètres applicatifs ----------
class AppSettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    value: dict
    updated_at: datetime


class AppSettingUpdate(BaseModel):
    value: dict


# ---------- Champs personnalisés ----------
class CustomFieldBase(BaseModel):
    key: str
    label: str
    field_type: CustomFieldType = CustomFieldType.TEXTE
    description: str | None = None
    options: list[str] | None = None
    is_required: bool = False
    is_active: bool = True
    show_in_list: bool = False
    position: int = 0

    @field_validator("key")
    @classmethod
    def _normalize_key(cls, value: str) -> str:
        cleaned = "".join(ch if ch.isalnum() else "_" for ch in value.strip().lower()).strip("_")
        while "__" in cleaned:
            cleaned = cleaned.replace("__", "_")
        if not cleaned:
            raise ValueError("clé de champ invalide")
        return cleaned[:80]


class CustomFieldCreate(CustomFieldBase):
    entity: str = "audit"


class CustomFieldUpdate(BaseModel):
    label: str | None = None
    field_type: CustomFieldType | None = None
    description: str | None = None
    options: list[str] | None = None
    is_required: bool | None = None
    is_active: bool | None = None
    show_in_list: bool | None = None
    position: int | None = None


class CustomFieldOut(CustomFieldBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    entity: str
    created_from_import: bool
    created_at: datetime


# ---------- Import en masse ----------
class ImportColumnAnalysis(BaseModel):
    """Analyse d'une colonne du fichier source."""

    source: str                      # intitulé de la colonne dans le fichier
    suggested_target: str | None     # champ de l'application proposé automatiquement
    sample_values: list[str] = []
    filled_ratio: float = 0.0
    detected_type: CustomFieldType = CustomFieldType.TEXTE
    is_known_field: bool = False     # False => champ absent de la base, à créer


class ImportMissingEntity(BaseModel):
    """Valeur référencée dans le fichier mais inconnue en base (catégorie,
    société de prestation, pilote, tag…). L'analyste complète les détails
    manquants avant l'import."""

    entity: str                      # category | prestation_company | user | tag
    value: str
    occurrences: int
    suggested_match: str | None = None   # id d'un enregistrement existant proche
    suggested_match_label: str | None = None


class ImportRowPreview(BaseModel):
    index: int
    values: dict[str, str | None]
    errors: list[str] = []
    warnings: list[str] = []
    duplicate_of: str | None = None


class ImportAnalysisOut(BaseModel):
    id: str
    filename: str
    status: ImportStatus
    created_at: datetime
    rows_count: int
    columns: list[ImportColumnAnalysis]
    mapping: dict[str, str]
    missing_entities: list[ImportMissingEntity]
    new_fields: list[ImportColumnAnalysis]
    rows_preview: list[ImportRowPreview]
    errors_count: int
    duplicates_count: int
    available_targets: dict[str, str]
    options: dict = {}
    report: dict | None = None


class ImportResolutionsIn(BaseModel):
    """Décisions de l'analyste : mapping des colonnes, création des entités
    manquantes (avec leurs détails) et définition des nouveaux champs."""

    mapping: dict[str, str] | None = None
    entities: dict[str, dict] | None = None      # "category::Réseau" -> {action, id, details…}
    new_fields: dict[str, dict] | None = None    # "Colonne source" -> {create, key, label, field_type, options}
    options: dict | None = None                  # duplicate_strategy, default_*, apply_templates…


class ImportCommitReport(BaseModel):
    batch_id: str
    created_audits: int
    updated_audits: int
    skipped_rows: int
    created_entities: dict[str, int]
    created_fields: int
    errors: list[str] = []


class ImportBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    filename: str
    status: ImportStatus
    created_at: datetime
    committed_at: datetime | None
    created_by_id: str | None
    report: dict | None


# ---------- Statistiques ----------
class StatCount(BaseModel):
    key: str
    label: str
    count: int
    color: str | None = None


class DurationStat(BaseModel):
    key: str
    label: str
    audits_count: int
    avg_planned_days: float | None = None
    avg_actual_days: float | None = None
    median_actual_days: float | None = None
    min_actual_days: float | None = None
    max_actual_days: float | None = None
    avg_drift_days: float | None = None       # réel - planifié
    on_time_ratio: float | None = None        # part terminée dans les délais


class TimeseriesPoint(BaseModel):
    period: str
    label: str
    started: int
    finished: int
    created: int
    open_at_end: int


class StatsOverviewOut(BaseModel):
    generated_at: datetime
    period_start: date | None
    period_end: date | None
    total_audits: int
    audits_in_period: int
    by_status: list[StatCount]
    by_priority: list[StatCount]
    by_category: list[StatCount]
    by_company: list[StatCount]
    by_pilot: list[StatCount]
    by_tag: list[StatCount]
    completed_audits: int
    in_progress_audits: int
    late_audits: int
    unscheduled_audits: int
    avg_actual_days: float | None
    median_actual_days: float | None
    avg_planned_days: float | None
    avg_drift_days: float | None
    on_time_ratio: float | None
    total_actual_days: float
    total_planned_days: float
    prerequisites_completion: float | None


class StatsDurationsOut(BaseModel):
    by_category: list[DurationStat]
    by_priority: list[DurationStat]
    by_company: list[DurationStat]
    by_pilot: list[DurationStat]
    by_phase: list[DurationStat]
    distribution: list[StatCount]


class StatsTimeseriesOut(BaseModel):
    granularity: str
    points: list[TimeseriesPoint]


class AuditDurationOut(BaseModel):
    audit_id: str
    name: str
    reference: str | None
    category_name: str | None
    status: AuditStatus
    planned_days: float | None
    actual_days: float | None
    drift_days: float | None
    planned_start: date | None
    planned_end: date | None
    actual_start: date | None
    actual_end: date | None


# ---------- Planning ----------
class PlanningRangeOut(BaseModel):
    scale: str
    start: date
    end: date
    columns: list[dict]


class PlanningAuditOut(BaseModel):
    """Audit projeté sur le planning, avec ses phases, pour les vues d'échelle
    (jour, semaine, mois, année, cycle pluriannuel)."""

    audit_id: str
    name: str
    reference: str | None
    category_id: str | None
    category_name: str | None
    tag_ids: list[str] = []
    priority: AuditPriority
    status: AuditStatus
    pilot_id: str | None
    pilot_name: str | None
    prestation_company_id: str | None
    prestation_company_name: str | None
    planned_start: date | None
    planned_end: date | None
    actual_start: date | None
    actual_end: date | None
    phases: list[PlanningPhaseOut] = []
