export type UserRole = "admin" | "pilote_audit" | "responsable_service";
export type AuthProvider = "local" | "sso";
export type AuditPriority = "basse" | "moyenne" | "haute" | "critique";
export type AuditStatus =
  | "brouillon"
  | "planifie"
  | "en_cours"
  | "en_attente"
  | "bloque"
  | "termine"
  | "annule";
export type PhaseStatus = "planifie" | "confirme" | "en_cours" | "termine" | "annule";
export type DocumentType = "technique" | "rapport" | "autre";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  auth_provider: AuthProvider;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  color: string | null;
  default_duration_days: number | null;
  position: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
}

export interface TemplateItem {
  id: string;
  label: string;
  is_mandatory: boolean;
  position: number;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  items: TemplateItem[];
}

export interface PhaseTemplateItem {
  id: string;
  name: string;
  position: number;
  duration_days: number;
}

export interface PhaseTemplate {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  items: PhaseTemplateItem[];
}

export interface PrestationCompany {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  allocated_days: number | null;
  notes: string | null;
}

export interface PrestationConsumption {
  company: PrestationCompany;
  consumed_days: number;
  audits_count: number;
}

export interface AuditPhase {
  id: string;
  audit_id: string;
  name: string;
  position: number;
  start_date: string | null;
  end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  status: PhaseStatus;
  confirmed: boolean;
  auditor_id: string | null;
  auditor_external_name: string | null;
  notes: string | null;
}

export interface AuditPrerequisite {
  id: string;
  audit_id: string;
  label: string;
  is_mandatory: boolean;
  is_checked: boolean;
  checked_by_id: string | null;
  checked_at: string | null;
  notes: string | null;
}

export interface AuditDocument {
  id: string;
  audit_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  doc_type: DocumentType;
  uploaded_by_id: string | null;
  uploaded_at: string;
}

export interface Audit {
  id: string;
  name: string;
  reference: string | null;
  description: string | null;
  category_id: string | null;
  priority: AuditPriority;
  status: AuditStatus;
  pilot_id: string | null;
  service_owner_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  prestation_company_id: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  estimated_days: number | null;
  kanban_column_id: string | null;
  tags: Tag[];
  tag_ids: string[];
  custom_fields: Record<string, string | null>;
  created_at: string;
  updated_at: string;
}

export interface AuditDetail extends Audit {
  phases: AuditPhase[];
  prerequisites: AuditPrerequisite[];
  documents: AuditDocument[];
}

export interface PlanningPhase {
  phase_id: string;
  audit_id: string;
  audit_name: string;
  phase_name: string;
  priority: AuditPriority;
  status: PhaseStatus;
  confirmed: boolean;
  start_date: string | null;
  end_date: string | null;
  auditor_id: string | null;
  auditor_name: string | null;
  pilot_id: string | null;
  pilot_name: string | null;
  prestation_company_id: string | null;
  prestation_company_name: string | null;
}

export interface AuditorWorkload {
  auditor_id: string;
  auditor_name: string;
  period_days: number;
  assigned_days: number;
  phases_count: number;
}

// ---------------------------------------------------------------------------
// Kanban configurable
// ---------------------------------------------------------------------------
export interface KanbanColumn {
  id: string;
  key: string;
  label: string;
  description: string | null;
  color: string;
  position: number;
  wip_limit: number | null;
  mapped_status: AuditStatus | null;
  is_default: boolean;
  is_final: boolean;
  is_active: boolean;
  audits_count: number;
}

export interface KanbanSettings {
  card_fields: string[];
  color_by: "priority" | "status" | "category";
  show_wip_limit: boolean;
  show_empty_columns: boolean;
  allow_drag_and_drop: boolean;
  title: string;
}

export interface PlanningSettings {
  default_scale: PlanningScale;
  cycle_years: number;
  week_start_monday: boolean;
  highlight_weekends: boolean;
}

export interface AppSetting<T = Record<string, unknown>> {
  key: string;
  value: T;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Champs personnalisés
// ---------------------------------------------------------------------------
export type CustomFieldType = "texte" | "texte_long" | "nombre" | "date" | "booleen" | "liste";

export interface CustomField {
  id: string;
  entity: string;
  key: string;
  label: string;
  field_type: CustomFieldType;
  description: string | null;
  options: string[] | null;
  is_required: boolean;
  is_active: boolean;
  show_in_list: boolean;
  position: number;
  created_from_import: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Import en masse
// ---------------------------------------------------------------------------
export type ImportStatus = "analyse" | "a_completer" | "pret" | "importe" | "annule";

export interface ImportColumnAnalysis {
  source: string;
  suggested_target: string | null;
  sample_values: string[];
  filled_ratio: number;
  detected_type: CustomFieldType;
  is_known_field: boolean;
}

export interface ImportMissingEntity {
  entity: "category" | "prestation_company" | "user" | "tag";
  value: string;
  occurrences: number;
  suggested_match: string | null;
  suggested_match_label: string | null;
}

export interface ImportRowPreview {
  index: number;
  values: Record<string, string | null>;
  errors: string[];
  warnings: string[];
  duplicate_of: string | null;
}

export interface ImportAnalysis {
  id: string;
  filename: string;
  status: ImportStatus;
  created_at: string;
  rows_count: number;
  columns: ImportColumnAnalysis[];
  mapping: Record<string, string>;
  missing_entities: ImportMissingEntity[];
  new_fields: ImportColumnAnalysis[];
  rows_preview: ImportRowPreview[];
  errors_count: number;
  duplicates_count: number;
  available_targets: Record<string, string>;
  options: Record<string, unknown>;
  report: ImportCommitReport | null;
}

export interface ImportCommitReport {
  batch_id: string;
  created_audits: number;
  updated_audits: number;
  skipped_rows: number;
  created_entities: Record<string, number>;
  created_fields: number;
  errors: string[];
}

export interface ImportBatch {
  id: string;
  filename: string;
  status: ImportStatus;
  created_at: string;
  committed_at: string | null;
  created_by_id: string | null;
  report: ImportCommitReport | null;
}

// ---------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------
export interface StatCount {
  key: string;
  label: string;
  count: number;
  color: string | null;
}

export interface DurationStat {
  key: string;
  label: string;
  audits_count: number;
  avg_planned_days: number | null;
  avg_actual_days: number | null;
  median_actual_days: number | null;
  min_actual_days: number | null;
  max_actual_days: number | null;
  avg_drift_days: number | null;
  on_time_ratio: number | null;
}

export interface TimeseriesPoint {
  period: string;
  label: string;
  started: number;
  finished: number;
  created: number;
  open_at_end: number;
}

export interface StatsOverview {
  generated_at: string;
  period_start: string | null;
  period_end: string | null;
  total_audits: number;
  audits_in_period: number;
  by_status: StatCount[];
  by_priority: StatCount[];
  by_category: StatCount[];
  by_company: StatCount[];
  by_pilot: StatCount[];
  by_tag: StatCount[];
  completed_audits: number;
  in_progress_audits: number;
  late_audits: number;
  unscheduled_audits: number;
  avg_actual_days: number | null;
  median_actual_days: number | null;
  avg_planned_days: number | null;
  avg_drift_days: number | null;
  on_time_ratio: number | null;
  total_actual_days: number;
  total_planned_days: number;
  prerequisites_completion: number | null;
}

export interface StatsDurations {
  by_category: DurationStat[];
  by_priority: DurationStat[];
  by_company: DurationStat[];
  by_pilot: DurationStat[];
  by_phase: DurationStat[];
  distribution: StatCount[];
}

export interface StatsTimeseries {
  granularity: string;
  points: TimeseriesPoint[];
}

export interface AuditDurationRow {
  audit_id: string;
  name: string;
  reference: string | null;
  category_name: string | null;
  status: AuditStatus;
  planned_days: number | null;
  actual_days: number | null;
  drift_days: number | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
}

// ---------------------------------------------------------------------------
// Planning multi-échelles
// ---------------------------------------------------------------------------
export type PlanningScale = "jour" | "semaine" | "mois" | "trimestre" | "annee" | "cycle";

export interface PlanningColumn {
  start: string;
  end: string;
  label: string;
  sublabel: string;
  is_weekend: boolean;
}

export interface PlanningRange {
  scale: PlanningScale;
  start: string;
  end: string;
  columns: PlanningColumn[];
}

export interface PlanningAudit {
  audit_id: string;
  name: string;
  reference: string | null;
  category_id: string | null;
  category_name: string | null;
  tag_ids: string[];
  priority: AuditPriority;
  status: AuditStatus;
  pilot_id: string | null;
  pilot_name: string | null;
  prestation_company_id: string | null;
  prestation_company_name: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  phases: PlanningPhase[];
}
