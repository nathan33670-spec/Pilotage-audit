import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Card, CardActionArea, CardContent, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PriorityChip } from "./StatusChips";
import { STATUS_COLORS } from "../theme";
import type { Audit, AuditStatus, Category, PrestationCompany, User } from "../types";

const COLUMNS: { status: AuditStatus; label: string }[] = [
  { status: "brouillon", label: "Brouillon" },
  { status: "planifie", label: "Planifié" },
  { status: "en_cours", label: "En cours" },
  { status: "en_attente", label: "En attente" },
  { status: "bloque", label: "Bloqué" },
  { status: "termine", label: "Terminé" },
  { status: "annule", label: "Annulé" },
];

export function KanbanBoard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);

  const canManage = user?.role === "admin" || user?.role === "pilote_audit";

  const loadAudits = () => apiClient.get<Audit[]>("/api/audits").then((r) => setAudits(r.data));

  useEffect(() => {
    loadAudits();
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => setCompanies(r.data));
  }, []);

  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.full_name ?? null;
  const companyName = (cid: string | null) => companies.find((c) => c.id === cid)?.name ?? null;
  const categoryName = (cid: string | null) => categories.find((c) => c.id === cid)?.name ?? null;

  const changeStatus = async (auditId: string, status: AuditStatus) => {
    await apiClient.patch(`/api/audits/${auditId}`, { status });
    loadAudits();
  };

  return (
    <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1 }}>
      {COLUMNS.map((col) => {
        const columnAudits = audits.filter((a) => a.status === col.status);
        return (
          <Paper
            key={col.status}
            variant="outlined"
            sx={{ minWidth: 260, width: 260, flexShrink: 0, bgcolor: "background.paper", display: "flex", flexDirection: "column" }}
          >
            <Box sx={{ p: 1.5, borderBottom: "3px solid", borderColor: STATUS_COLORS[col.status] }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {col.label} <Typography component="span" variant="caption" color="text.secondary">({columnAudits.length})</Typography>
              </Typography>
            </Box>
            <Stack spacing={1} sx={{ p: 1, flexGrow: 1, minHeight: 80 }}>
              {columnAudits.map((audit) => (
                <Card key={audit.id} variant="outlined">
                  <CardActionArea onClick={() => navigate(`/audits/${audit.id}`)}>
                    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                        <Typography variant="body2" fontWeight={600} sx={{ pr: 1 }}>{audit.name}</Typography>
                        <PriorityChip priority={audit.priority} />
                      </Stack>
                      {categoryName(audit.category_id) && (
                        <Typography variant="caption" color="text.secondary" display="block">{categoryName(audit.category_id)}</Typography>
                      )}
                      {userName(audit.pilot_id) && (
                        <Typography variant="caption" display="block">Pilote : {userName(audit.pilot_id)}</Typography>
                      )}
                      {companyName(audit.prestation_company_id) && (
                        <Typography variant="caption" display="block">Prestataire : {companyName(audit.prestation_company_id)}</Typography>
                      )}
                      {(audit.planned_start || audit.planned_end) && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {audit.planned_start ?? "?"} → {audit.planned_end ?? "?"}
                        </Typography>
                      )}
                    </CardContent>
                  </CardActionArea>
                  {canManage && (
                    <TextField
                      select
                      size="small"
                      value={audit.status}
                      onChange={(e) => changeStatus(audit.id, e.target.value as AuditStatus)}
                      onClick={(e) => e.stopPropagation()}
                      variant="standard"
                      sx={{ width: "100%", px: 1.5, pb: 1 }}
                    >
                      {COLUMNS.map((c) => <MenuItem key={c.status} value={c.status}>{c.label}</MenuItem>)}
                    </TextField>
                  )}
                </Card>
              ))}
              {columnAudits.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                  Aucun audit
                </Typography>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Box>
  );
}
