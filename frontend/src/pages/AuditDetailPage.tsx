import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { apiClient } from "../api/client";
import { PriorityChip, StatusChip } from "../components/StatusChips";
import { PHASE_STATUS_COLORS } from "../theme";
import { useAuth } from "../auth/AuthContext";
import type { AuditDetail, AuditPriority, AuditStatus, Category, PhaseStatus, PrestationCompany, User } from "../types";

const PRIORITIES: AuditPriority[] = ["basse", "moyenne", "haute", "critique"];
const STATUSES: AuditStatus[] = ["brouillon", "planifie", "en_cours", "en_attente", "bloque", "termine", "annule"];
const PHASE_STATUSES: PhaseStatus[] = ["planifie", "confirme", "en_cours", "termine", "annule"];

export function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);
  const [openPhaseDialog, setOpenPhaseDialog] = useState(false);
  const [phaseForm, setPhaseForm] = useState({ name: "", start_date: "", end_date: "", auditor_id: "", auditor_external_name: "" });
  const [newPrereqLabel, setNewPrereqLabel] = useState("");

  const canManage = user?.role === "admin" || user?.role === "pilote_audit";

  const load = useCallback(() => {
    if (!id) return;
    apiClient.get<AuditDetail>(`/api/audits/${id}`).then((r) => setAudit(r.data));
  }, [id]);

  useEffect(() => {
    load();
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => setCompanies(r.data));
  }, [load]);

  if (!audit) return <Typography>Chargement…</Typography>;

  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.full_name ?? "—";

  const patchAudit = async (data: Partial<AuditDetail>) => {
    await apiClient.patch(`/api/audits/${id}`, data);
    load();
  };

  const addPhase = async () => {
    await apiClient.post(`/api/audits/${id}/phases`, {
      ...phaseForm,
      auditor_id: phaseForm.auditor_id || null,
      auditor_external_name: phaseForm.auditor_external_name || null,
    });
    setOpenPhaseDialog(false);
    setPhaseForm({ name: "", start_date: "", end_date: "", auditor_id: "", auditor_external_name: "" });
    load();
  };

  const togglePhaseConfirmed = async (phaseId: string, confirmed: boolean) => {
    await apiClient.patch(`/api/audits/${id}/phases/${phaseId}`, { confirmed });
    load();
  };

  const updatePhaseStatus = async (phaseId: string, status: PhaseStatus) => {
    await apiClient.patch(`/api/audits/${id}/phases/${phaseId}`, { status });
    load();
  };

  const deletePhase = async (phaseId: string) => {
    await apiClient.delete(`/api/audits/${id}/phases/${phaseId}`);
    load();
  };

  const togglePrereq = async (prereqId: string, is_checked: boolean) => {
    await apiClient.patch(`/api/audits/${id}/prerequisites/${prereqId}`, { is_checked });
    load();
  };

  const addPrereq = async () => {
    if (!newPrereqLabel.trim()) return;
    await apiClient.post(`/api/audits/${id}/prerequisites`, { label: newPrereqLabel, is_mandatory: true });
    setNewPrereqLabel("");
    load();
  };

  const deletePrereq = async (prereqId: string) => {
    await apiClient.delete(`/api/audits/${id}/prerequisites/${prereqId}`);
    load();
  };

  const uploadDocument = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    await apiClient.post(`/api/audits/${id}/documents?doc_type=technique`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    load();
  };

  const downloadDocument = async (docId: string, filename: string) => {
    const res = await apiClient.get(`/api/audits/${id}/documents/${docId}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteDocument = async (docId: string) => {
    await apiClient.delete(`/api/audits/${id}/documents/${docId}`);
    load();
  };

  return (
    <Box>
      <Button onClick={() => navigate("/audits")} sx={{ mb: 2 }}>← Retour aux audits</Button>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h5" fontWeight={700}>{audit.name}</Typography>
                <Stack direction="row" spacing={1}>
                  <PriorityChip priority={audit.priority} />
                  <StatusChip status={audit.status} />
                </Stack>
              </Stack>
              <Typography color="text.secondary" sx={{ mt: 1 }}>{audit.description}</Typography>

              {canManage && (
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={6}>
                    <TextField select fullWidth size="small" label="Statut" value={audit.status} onChange={(e) => patchAudit({ status: e.target.value as AuditStatus })}>
                      {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField select fullWidth size="small" label="Priorité" value={audit.priority} onChange={(e) => patchAudit({ priority: e.target.value as AuditPriority })}>
                      {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField select fullWidth size="small" label="Pilote d'audit" value={audit.pilot_id ?? ""} onChange={(e) => patchAudit({ pilot_id: e.target.value || null })}>
                      <MenuItem value="">Aucun</MenuItem>
                      {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField select fullWidth size="small" label="Société de prestation" value={audit.prestation_company_id ?? ""} onChange={(e) => patchAudit({ prestation_company_id: e.target.value || null })}>
                      <MenuItem value="">Aucune (interne)</MenuItem>
                      {companies.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                </Grid>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="body2"><b>Catégorie :</b> {categories.find((c) => c.id === audit.category_id)?.name ?? "—"}</Typography>
              <Typography variant="body2"><b>Responsable de service :</b> {userName(audit.service_owner_id)}</Typography>
              <Typography variant="body2"><b>Période prévue :</b> {audit.planned_start ?? "?"} → {audit.planned_end ?? "?"}</Typography>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ mt: 3 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Phases</Typography>
                {canManage && <Button size="small" startIcon={<AddIcon />} onClick={() => setOpenPhaseDialog(true)}>Ajouter une phase</Button>}
              </Stack>
              {audit.phases.length === 0 && <Typography color="text.secondary">Aucune phase définie.</Typography>}
              {audit.phases.map((phase) => (
                <Box key={phase.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Chip size="small" label={phase.status} sx={{ bgcolor: PHASE_STATUS_COLORS[phase.status], color: "#fff" }} />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{phase.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {phase.start_date} → {phase.end_date} · {phase.auditor_id ? userName(phase.auditor_id) : (phase.auditor_external_name || "non assigné")}
                    </Typography>
                  </Box>
                  {canManage && (
                    <>
                      <FormControlLabel
                        control={<Checkbox size="small" checked={phase.confirmed} onChange={(e) => togglePhaseConfirmed(phase.id, e.target.checked)} />}
                        label="Confirmé"
                      />
                      <TextField select size="small" value={phase.status} onChange={(e) => updatePhaseStatus(phase.id, e.target.value as PhaseStatus)} sx={{ width: 130 }}>
                        {PHASE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                      </TextField>
                      <IconButton size="small" onClick={() => deletePhase(phase.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </>
                  )}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Pré-requis auditeur</Typography>
              {audit.prerequisites.map((prereq) => (
                <Stack key={prereq.id} direction="row" alignItems="center" spacing={1}>
                  <Checkbox checked={prereq.is_checked} onChange={(e) => togglePrereq(prereq.id, e.target.checked)} />
                  <Typography sx={{ flexGrow: 1, textDecoration: prereq.is_checked ? "line-through" : "none" }} variant="body2">
                    {prereq.label} {prereq.is_mandatory && <Chip label="obligatoire" size="small" sx={{ ml: 1 }} />}
                  </Typography>
                  {canManage && <IconButton size="small" onClick={() => deletePrereq(prereq.id)}><DeleteIcon fontSize="small" /></IconButton>}
                </Stack>
              ))}
              {canManage && (
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <TextField size="small" placeholder="Nouveau pré-requis" fullWidth value={newPrereqLabel} onChange={(e) => setNewPrereqLabel(e.target.value)} />
                  <Button onClick={addPrereq}>Ajouter</Button>
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ mt: 3 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Documents</Typography>
                {canManage && (
                  <Button component="label" size="small" startIcon={<UploadFileIcon />}>
                    Importer
                    <input type="file" hidden onChange={(e) => e.target.files && uploadDocument(e.target.files[0])} />
                  </Button>
                )}
              </Stack>
              {audit.documents.length === 0 && <Typography color="text.secondary">Aucun document.</Typography>}
              {audit.documents.map((doc) => (
                <Stack key={doc.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
                  <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>{doc.filename}</Typography>
                  <Chip size="small" label={doc.doc_type} />
                  <IconButton size="small" onClick={() => downloadDocument(doc.id, doc.filename)}><DownloadIcon fontSize="small" /></IconButton>
                  {canManage && <IconButton size="small" onClick={() => deleteDocument(doc.id)}><DeleteIcon fontSize="small" /></IconButton>}
                </Stack>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={openPhaseDialog} onClose={() => setOpenPhaseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouvelle phase</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nom de la phase (ex: Cadrage, Technique, Restitution)" value={phaseForm.name} onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField type="date" label="Début" InputLabelProps={{ shrink: true }} value={phaseForm.start_date} onChange={(e) => setPhaseForm({ ...phaseForm, start_date: e.target.value })} fullWidth />
            <TextField type="date" label="Fin" InputLabelProps={{ shrink: true }} value={phaseForm.end_date} onChange={(e) => setPhaseForm({ ...phaseForm, end_date: e.target.value })} fullWidth />
          </Stack>
          <TextField select label="Auditeur interne" value={phaseForm.auditor_id} onChange={(e) => setPhaseForm({ ...phaseForm, auditor_id: e.target.value })}>
            <MenuItem value="">Aucun</MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
          </TextField>
          <TextField label="Ou auditeur externe (nom libre)" value={phaseForm.auditor_external_name} onChange={(e) => setPhaseForm({ ...phaseForm, auditor_external_name: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPhaseDialog(false)}>Annuler</Button>
          <Button variant="contained" onClick={addPhase} disabled={!phaseForm.name || !phaseForm.start_date || !phaseForm.end_date}>Ajouter</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
