/**
 * Panneau d'administration.
 *
 * Tout ce qui structure l'outil est modifiable ici, sans intervention
 * technique : colonnes du kanban (libellé, couleur, ordre, limite d'en-cours,
 * statut associé), affichage des cartes, catégories d'audit, étiquettes,
 * champs personnalisés et comptes utilisateurs.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
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
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { apiClient } from "../api/client";
import { Users } from "./Users";
import type {
  AppSetting,
  AuditStatus,
  Category,
  CustomField,
  CustomFieldType,
  KanbanColumn,
  KanbanSettings,
  Tag,
} from "../types";

const STATUSES: AuditStatus[] = [
  "brouillon", "planifie", "en_cours", "en_attente", "bloque", "termine", "annule",
];

const CARD_FIELDS = [
  { key: "priority", label: "Priorité" },
  { key: "category", label: "Catégorie" },
  { key: "tags", label: "Étiquettes" },
  { key: "pilot", label: "Pilote" },
  { key: "company", label: "Prestataire" },
  { key: "dates", label: "Dates prévues" },
];

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "texte", label: "Texte court" },
  { value: "texte_long", label: "Texte long" },
  { value: "nombre", label: "Nombre" },
  { value: "date", label: "Date" },
  { value: "booleen", label: "Oui / Non" },
  { value: "liste", label: "Liste de valeurs" },
];

type AdminTab = "kanban" | "categories" | "tags" | "champs" | "utilisateurs";

export function AdminPanel() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("onglet") as AdminTab) || "kanban";

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Administration
      </Typography>
      <Tabs
        value={tab}
        onChange={(_, value) => setParams({ onglet: value })}
        sx={{ mb: 2 }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab value="kanban" label="Kanban" />
        <Tab value="categories" label="Catégories d'audit" />
        <Tab value="tags" label="Étiquettes" />
        <Tab value="champs" label="Champs personnalisés" />
        <Tab value="utilisateurs" label="Utilisateurs" />
      </Tabs>

      {tab === "kanban" && <KanbanAdmin />}
      {tab === "categories" && <CategoriesAdmin />}
      {tab === "tags" && <TagsAdmin />}
      {tab === "champs" && <CustomFieldsAdmin />}
      {tab === "utilisateurs" && <Users />}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Kanban
// ---------------------------------------------------------------------------
const EMPTY_COLUMN = {
  key: "",
  label: "",
  description: "",
  color: "#1565c0",
  wip_limit: "",
  mapped_status: "" as AuditStatus | "",
  is_default: false,
  is_final: false,
  is_active: true,
};

function KanbanAdmin() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [settings, setSettings] = useState<KanbanSettings | null>(null);
  const [editing, setEditing] = useState<KanbanColumn | null>(null);
  const [form, setForm] = useState({ ...EMPTY_COLUMN });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<KanbanColumn | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const load = () => {
    apiClient.get<KanbanColumn[]>("/api/kanban/columns?include_inactive=true").then((r) => setColumns(r.data));
    apiClient
      .get<AppSetting<KanbanSettings>>("/api/settings/kanban")
      .then((r) => setSettings(r.data.value))
      .catch(() => undefined);
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_COLUMN });
    setOpen(true);
  };

  const openEdit = (column: KanbanColumn) => {
    setEditing(column);
    setForm({
      key: column.key,
      label: column.label,
      description: column.description ?? "",
      color: column.color,
      wip_limit: column.wip_limit === null ? "" : String(column.wip_limit),
      mapped_status: column.mapped_status ?? "",
      is_default: column.is_default,
      is_final: column.is_final,
      is_active: column.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    setError(null);
    const payload = {
      key: form.key || slugify(form.label),
      label: form.label,
      description: form.description || null,
      color: form.color,
      wip_limit: form.wip_limit === "" ? null : Number(form.wip_limit),
      mapped_status: form.mapped_status || null,
      is_default: form.is_default,
      is_final: form.is_final,
      is_active: form.is_active,
    };
    try {
      if (editing) await apiClient.patch(`/api/kanban/columns/${editing.id}`, payload);
      else await apiClient.post("/api/kanban/columns", payload);
      setOpen(false);
      load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  const reorder = async (index: number, direction: -1 | 1) => {
    const next = [...columns];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setColumns(next);
    await apiClient.post("/api/kanban/columns/reorder", { column_ids: next.map((c) => c.id) });
    load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setError(null);
    try {
      const query = moveTo ? `?move_audits_to=${moveTo}` : "";
      await apiClient.delete(`/api/kanban/columns/${deleting.id}${query}`);
      setDeleting(null);
      setMoveTo("");
      load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  const updateSettings = async (patch: Partial<KanbanSettings>) => {
    const value = { ...(settings ?? {}), ...patch } as KanbanSettings;
    setSettings(value);
    await apiClient.put("/api/settings/kanban", { value: patch });
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>Colonnes du tableau</Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
          Nouvelle colonne
        </Button>
      </Stack>

      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={110}>Ordre</TableCell>
              <TableCell>Colonne</TableCell>
              <TableCell>Clé</TableCell>
              <TableCell>Statut appliqué</TableCell>
              <TableCell align="right">Limite d'en-cours</TableCell>
              <TableCell align="right">Audits</TableCell>
              <TableCell>État</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {columns.map((column, index) => (
              <TableRow key={column.id} hover>
                <TableCell>
                  <IconButton size="small" disabled={index === 0} onClick={() => reorder(index, -1)}>
                    <ArrowUpwardIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton size="small" disabled={index === columns.length - 1} onClick={() => reorder(index, 1)}>
                    <ArrowDownwardIcon fontSize="inherit" />
                  </IconButton>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: column.color }} />
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{column.label}</Typography>
                      {column.description && (
                        <Typography variant="caption" color="text.secondary">{column.description}</Typography>
                      )}
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell><code>{column.key}</code></TableCell>
                <TableCell>{column.mapped_status ?? "— (organisationnelle)"}</TableCell>
                <TableCell align="right">{column.wip_limit ?? "—"}</TableCell>
                <TableCell align="right">{column.audits_count}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    {column.is_default && <Chip size="small" label="par défaut" />}
                    {column.is_final && <Chip size="small" label="finale" variant="outlined" />}
                    {!column.is_active && <Chip size="small" color="warning" label="masquée" />}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Modifier">
                    <IconButton size="small" onClick={() => openEdit(column)}><EditIcon fontSize="inherit" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Supprimer">
                    <IconButton size="small" onClick={() => { setDeleting(column); setMoveTo(""); }}>
                      <DeleteIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>Affichage des cartes</Typography>
          {settings && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Informations affichées sur les cartes
                </Typography>
                <Stack direction="row" flexWrap="wrap" useFlexGap>
                  {CARD_FIELDS.map((field) => (
                    <FormControlLabel
                      key={field.key}
                      control={
                        <Checkbox
                          size="small"
                          checked={settings.card_fields.includes(field.key)}
                          onChange={(e) =>
                            updateSettings({
                              card_fields: e.target.checked
                                ? [...settings.card_fields, field.key]
                                : settings.card_fields.filter((f) => f !== field.key),
                            })
                          }
                        />
                      }
                      label={<Typography variant="body2">{field.label}</Typography>}
                    />
                  ))}
                </Stack>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  select fullWidth size="small" label="Couleur des cartes" value={settings.color_by}
                  onChange={(e) => updateSettings({ color_by: e.target.value as KanbanSettings["color_by"] })}
                >
                  <MenuItem value="priority">Selon la priorité</MenuItem>
                  <MenuItem value="status">Selon le statut</MenuItem>
                  <MenuItem value="category">Selon la catégorie</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}>
                <Stack>
                  <FormControlLabel
                    control={
                      <Checkbox size="small" checked={settings.allow_drag_and_drop}
                        onChange={(e) => updateSettings({ allow_drag_and_drop: e.target.checked })} />
                    }
                    label={<Typography variant="body2">Glisser-déposer</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox size="small" checked={settings.show_empty_columns}
                        onChange={(e) => updateSettings({ show_empty_columns: e.target.checked })} />
                    }
                    label={<Typography variant="body2">Afficher les colonnes vides</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox size="small" checked={settings.show_wip_limit}
                        onChange={(e) => updateSettings({ show_wip_limit: e.target.checked })} />
                    }
                    label={<Typography variant="body2">Afficher les limites d'en-cours</Typography>}
                  />
                </Stack>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Modifier la colonne" : "Nouvelle colonne"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Libellé" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
          <TextField
            label="Clé technique" value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            helperText="Laissée vide, elle est déduite du libellé. Sert aux filtres et à l'API."
          />
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField
              type="color" label="Couleur" value={form.color} sx={{ width: 120 }}
              InputLabelProps={{ shrink: true }} onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <TextField
              type="number" label="Limite d'en-cours (WIP)" value={form.wip_limit} fullWidth
              onChange={(e) => setForm({ ...form, wip_limit: e.target.value })}
              helperText="Vide = pas de limite"
            />
          </Stack>
          <TextField
            select label="Statut appliqué aux audits déposés" value={form.mapped_status}
            onChange={(e) => setForm({ ...form, mapped_status: e.target.value as AuditStatus })}
            helperText="Aucun = colonne purement organisationnelle, le statut de l'audit n'est pas modifié."
          >
            <MenuItem value="">Aucun</MenuItem>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={<Checkbox checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />}
              label="Colonne par défaut"
            />
            <FormControlLabel
              control={<Checkbox checked={form.is_final} onChange={(e) => setForm({ ...form, is_final: e.target.checked })} />}
              label="Colonne finale"
            />
            <FormControlLabel
              control={<Checkbox checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
              label="Visible"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={save} disabled={!form.label}>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Supprimer « {deleting?.label} » ?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {deleting?.audits_count
              ? `${deleting.audits_count} audit(s) se trouvent dans cette colonne. Choisissez la colonne qui les accueillera.`
              : "Cette colonne ne contient aucun audit."}
          </Typography>
          <TextField
            select fullWidth size="small" label="Déplacer les audits vers" value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            <MenuItem value="">Colonne par défaut</MenuItem>
            {columns.filter((c) => c.id !== deleting?.id).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Annuler</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Supprimer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------
function CategoriesAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", code: "", color: "#1565c0", default_duration_days: "", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError(null);
    const payload = {
      name: form.name,
      code: form.code || null,
      color: form.color || null,
      default_duration_days: form.default_duration_days ? Number(form.default_duration_days) : null,
      description: form.description || null,
    };
    try {
      if (editingId) await apiClient.patch(`/api/categories/${editingId}`, payload);
      else await apiClient.post("/api/categories", payload);
      setForm({ name: "", code: "", color: "#1565c0", default_duration_days: "", description: "" });
      setEditingId(null);
      load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await apiClient.delete(`/api/categories/${id}`);
      load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        La catégorie est l'axe principal de classement d'un audit (type de TI). Elle porte les templates
        de pré-requis et de phases, et sert de filtre dans le planning et les tableaux de bord.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField size="small" label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField size="small" label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} sx={{ width: 120 }} />
          <TextField
            size="small" type="color" label="Couleur" InputLabelProps={{ shrink: true }}
            value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} sx={{ width: 110 }}
          />
          <TextField
            size="small" type="number" label="Durée type (j)" value={form.default_duration_days}
            onChange={(e) => setForm({ ...form, default_duration_days: e.target.value })} sx={{ width: 140 }}
          />
          <TextField
            size="small" label="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} sx={{ minWidth: 240, flexGrow: 1 }}
          />
          <Button variant="contained" onClick={submit} disabled={!form.name}>
            {editingId ? "Enregistrer" : "Ajouter"}
          </Button>
          {editingId && (
            <Button onClick={() => { setEditingId(null); setForm({ name: "", code: "", color: "#1565c0", default_duration_days: "", description: "" }); }}>
              Annuler
            </Button>
          )}
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Catégorie</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Durée type</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: category.color ?? "#90a4ae" }} />
                    {category.name}
                  </Stack>
                </TableCell>
                <TableCell>{category.code ?? "—"}</TableCell>
                <TableCell>{category.default_duration_days ? `${category.default_duration_days} j` : "—"}</TableCell>
                <TableCell>{category.description ?? "—"}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditingId(category.id);
                      setForm({
                        name: category.name,
                        code: category.code ?? "",
                        color: category.color ?? "#1565c0",
                        default_duration_days: category.default_duration_days ? String(category.default_duration_days) : "",
                        description: category.description ?? "",
                      });
                    }}
                  >
                    <EditIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton size="small" onClick={() => remove(category.id)}><DeleteIcon fontSize="inherit" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && (
              <TableRow><TableCell colSpan={5}>Aucune catégorie définie.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Étiquettes
// ---------------------------------------------------------------------------
function TagsAdmin() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [form, setForm] = useState({ name: "", color: "#00897b", description: "" });
  const [error, setError] = useState<string | null>(null);

  const load = () => apiClient.get<Tag[]>("/api/tags").then((r) => setTags(r.data));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError(null);
    try {
      await apiClient.post("/api/tags", {
        name: form.name,
        color: form.color || null,
        description: form.description || null,
      });
      setForm({ name: "", color: "#00897b", description: "" });
      load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Les étiquettes permettent une catégorisation transverse et multiple (exigence réglementaire,
        périmètre, entité, exposition…), en complément de la catégorie principale.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField size="small" label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField
            size="small" type="color" label="Couleur" InputLabelProps={{ shrink: true }}
            value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} sx={{ width: 110 }}
          />
          <TextField
            size="small" label="Description" value={form.description} sx={{ minWidth: 260, flexGrow: 1 }}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Button variant="contained" onClick={submit} disabled={!form.name}>Ajouter</Button>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {tags.map((tag) => (
          <Chip
            key={tag.id}
            label={tag.name}
            sx={{ borderColor: tag.color ?? undefined }}
            variant="outlined"
            onDelete={async () => {
              await apiClient.delete(`/api/tags/${tag.id}`);
              load();
            }}
          />
        ))}
        {tags.length === 0 && <Typography color="text.secondary">Aucune étiquette définie.</Typography>}
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Champs personnalisés
// ---------------------------------------------------------------------------
function CustomFieldsAdmin() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [form, setForm] = useState({ key: "", label: "", field_type: "texte" as CustomFieldType, options: "", show_in_list: false });
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    apiClient.get<CustomField[]>("/api/custom-fields?include_inactive=true").then((r) => setFields(r.data));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError(null);
    try {
      await apiClient.post("/api/custom-fields", {
        key: form.key || slugify(form.label),
        label: form.label,
        field_type: form.field_type,
        options: form.field_type === "liste" ? form.options.split(";").map((o) => o.trim()).filter(Boolean) : null,
        show_in_list: form.show_in_list,
      });
      setForm({ key: "", label: "", field_type: "texte", options: "", show_in_list: false });
      load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  const toggle = async (field: CustomField, patch: Partial<CustomField>) => {
    await apiClient.patch(`/api/custom-fields/${field.id}`, patch);
    load();
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Les champs personnalisés complètent la fiche d'un audit sans modification du code. Ils sont
        également créés automatiquement lors d'un import en masse pour les colonnes qui n'existent pas
        encore en base.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField size="small" label="Libellé" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <TextField size="small" label="Clé" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} sx={{ width: 160 }} />
          <TextField
            select size="small" label="Type" value={form.field_type} sx={{ width: 170 }}
            onChange={(e) => setForm({ ...form, field_type: e.target.value as CustomFieldType })}
          >
            {FIELD_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          {form.field_type === "liste" && (
            <TextField
              size="small" label="Valeurs (séparées par ;)" value={form.options} sx={{ minWidth: 240 }}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
            />
          )}
          <FormControlLabel
            control={<Checkbox size="small" checked={form.show_in_list} onChange={(e) => setForm({ ...form, show_in_list: e.target.checked })} />}
            label={<Typography variant="body2">Afficher dans la liste des audits</Typography>}
          />
          <Button variant="contained" onClick={submit} disabled={!form.label}>Ajouter</Button>
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Champ</TableCell>
              <TableCell>Clé</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Origine</TableCell>
              <TableCell align="center">Dans la liste</TableCell>
              <TableCell align="center">Actif</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((field) => (
              <TableRow key={field.id} hover>
                <TableCell>{field.label}</TableCell>
                <TableCell><code>{field.key}</code></TableCell>
                <TableCell>
                  {FIELD_TYPES.find((t) => t.value === field.field_type)?.label ?? field.field_type}
                  {field.options?.length ? ` (${field.options.join(", ")})` : ""}
                </TableCell>
                <TableCell>{field.created_from_import ? "Import" : "Saisie manuelle"}</TableCell>
                <TableCell align="center">
                  <Checkbox
                    size="small" checked={field.show_in_list}
                    onChange={(e) => toggle(field, { show_in_list: e.target.checked })}
                  />
                </TableCell>
                <TableCell align="center">
                  <Checkbox
                    size="small" checked={field.is_active}
                    onChange={(e) => toggle(field, { is_active: e.target.checked })}
                  />
                </TableCell>
              </TableRow>
            ))}
            {fields.length === 0 && (
              <TableRow><TableCell colSpan={6}>Aucun champ personnalisé.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function errorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return "L'opération a échoué.";
}
