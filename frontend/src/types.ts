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
  start_date: string;
  end_date: string;
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
  description: string | null;
  category_id: string | null;
  priority: AuditPriority;
  status: AuditStatus;
  pilot_id: string | null;
  service_owner_id: string | null;
  prestation_company_id: string | null;
  planned_start: string | null;
  planned_end: string | null;
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
  start_date: string;
  end_date: string;
  auditor_id: string | null;
  auditor_name: string | null;
}

export interface AuditorWorkload {
  auditor_id: string;
  auditor_name: string;
  period_days: number;
  assigned_days: number;
  phases_count: number;
}
