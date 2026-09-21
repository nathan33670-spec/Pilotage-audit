import { Chip } from "@mui/material";
import { PRIORITY_COLORS, STATUS_COLORS } from "../theme";
import type { AuditPriority, AuditStatus } from "../types";

const PRIORITY_LABELS: Record<AuditPriority, string> = {
  basse: "Basse",
  moyenne: "Moyenne",
  haute: "Haute",
  critique: "Critique",
};

const STATUS_LABELS: Record<AuditStatus, string> = {
  brouillon: "Brouillon",
  planifie: "Planifié",
  en_cours: "En cours",
  en_attente: "En attente",
  bloque: "Bloqué",
  termine: "Terminé",
  annule: "Annulé",
};

export function PriorityChip({ priority }: { priority: AuditPriority }) {
  return (
    <Chip
      size="small"
      label={PRIORITY_LABELS[priority]}
      sx={{ bgcolor: PRIORITY_COLORS[priority], color: "#fff", fontWeight: 600 }}
    />
  );
}

export function StatusChip({ status }: { status: AuditStatus }) {
  return (
    <Chip
      size="small"
      label={STATUS_LABELS[status]}
      sx={{ bgcolor: STATUS_COLORS[status], color: "#fff", fontWeight: 600 }}
    />
  );
}
