import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { apiClient } from "../api/client";
import { PriorityChip, StatusChip } from "../components/StatusChips";
import { useAuth } from "../auth/AuthContext";
import type { Audit, AuditPriority, AuditStatus, Category, PhaseTemplate, PrestationCompany, Template, User } from "../types";

const PRIORITIES: AuditPriority[] = ["basse", "moyenne", "haute", "critique"];
const STATUSES: AuditStatus[] = ["brouillon", "planifie", "en_cours", "en_attente", "bloque", "termine", "annule"];

export function Audits() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [phaseTemplates, setPhaseTemplates] = useState<PhaseTemplate[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [openCreate, setOpenCreate] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    category_id: "",
    priority: "moyenne" as AuditPriority,
    status: "brouillon" as AuditStatus,
    pilot_id: "",
    service_owner_id: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    prestation_company_id: "",
    planned_start: "",
    planned_end: "",
    apply_template_id: "",
    apply_phase_template_id: "",
  });

  const canManage = user?.role === "admin" || user?.role === "pilote_audit";

  const loadAudits = () => {
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    apiClient.get<Audit[]>("/api/audits", { params }).then((r) => setAudits(r.data));
  };

  useEffect(() => {
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => setCompanies(r.data));
    apiClient.get<Template[]>("/api/templates").then((r) => setTemplates(r.data));
    apiClient.get<PhaseTemplate[]>("/api/phase-templates").then((r) => setPhaseTemplates(r.data));
  }, []);

  useEffect(loadAudits, [statusFilter, priorityFilter]);

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";
  const userName = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? "—";

  const handleCreate = async () => {
    const payload = {
      ...form,
      category_id: form.category_id || null,
      pilot_id: form.pilot_id || null,
      service_owner_id: form.service_owner_id || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      prestation_company_id: form.prestation_company_id || null,
      planned_start: form.planned_start || null,
      planned_end: form.planned_end || null,
      apply_template_id: form.apply_template_id || null,
      apply_phase_template_id: form.apply_phase_template_id || null,
    };
    const { data } = await apiClient.post<Audit>("/api/audits", payload);
    setOpenCreate(false);
    navigate(`/audits/${data.id}`);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Audits
        </Typography>
        {canManage && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenCreate(true)}>
            Nouvel audit
          </Button>
        )}
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Tous</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Priorité" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Toutes</MenuItem>
          {PRIORITIES.map((p) => (
            <MenuItem key={p} value={p}>{p}</MenuItem>
          ))}
        </TextField>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Catégorie</TableCell>
              <TableCell>Priorité</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Pilote</TableCell>
              <TableCell>Période</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {audits.map((audit) => (
              <TableRow key={audit.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/audits/${audit.id}`)}>
                <TableCell>{audit.name}</TableCell>
                <TableCell>{categoryName(audit.category_id)}</TableCell>
                <TableCell><PriorityChip priority={audit.priority} /></TableCell>
                <TableCell><StatusChip status={audit.status} /></TableCell>
                <TableCell>{userName(audit.pilot_id)}</TableCell>
                <TableCell>
                  {audit.planned_start ?? "?"} → {audit.planned_end ?? "?"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouvel audit</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <TextField label="Description" multiline rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <TextField select label="Catégorie" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <MenuItem value="">Aucune</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select label="Priorité" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as AuditPriority })}>
            {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>
          <TextField select label="Pilote d'audit" value={form.pilot_id} onChange={(e) => setForm({ ...form, pilot_id: e.target.value })}>
            <MenuItem value="">Aucun</MenuItem>
            {users.filter((u) => u.role === "pilote_audit" || u.role === "admin").map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
          </TextField>
          <TextField select label="Responsable de service" value={form.service_owner_id} onChange={(e) => setForm({ ...form, service_owner_id: e.target.value })}>
            <MenuItem value="">Aucun</MenuItem>
            {users.filter((u) => u.role === "responsable_service").map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField label="Contact responsable (nom)" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} fullWidth />
            <TextField label="Contact (email/tél.)" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} fullWidth />
          </Stack>
          <TextField select label="Société de prestation" value={form.prestation_company_id} onChange={(e) => setForm({ ...form, prestation_company_id: e.target.value })}>
            <MenuItem value="">Aucune (interne)</MenuItem>
            {companies.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select label="Template de pré-requis" value={form.apply_template_id} onChange={(e) => setForm({ ...form, apply_template_id: e.target.value })}>
            <MenuItem value="">Aucun</MenuItem>
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField select label="Template de phases" value={form.apply_phase_template_id} onChange={(e) => setForm({ ...form, apply_phase_template_id: e.target.value })}>
            <MenuItem value="">Aucun</MenuItem>
            {phaseTemplates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField type="date" label="Début prévu" InputLabelProps={{ shrink: true }} value={form.planned_start} onChange={(e) => setForm({ ...form, planned_start: e.target.value })} fullWidth />
            <TextField type="date" label="Fin prévue" InputLabelProps={{ shrink: true }} value={form.planned_end} onChange={(e) => setForm({ ...form, planned_end: e.target.value })} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreate(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!form.name}>Créer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
