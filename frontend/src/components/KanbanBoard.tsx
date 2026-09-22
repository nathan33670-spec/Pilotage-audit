import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PriorityChip } from "./StatusChips";
import { PRIORITY_COLORS, STATUS_COLORS } from "../theme";
import type {
  AppSetting,
  Audit,
  Category,
  KanbanColumn,
  KanbanSettings,
  PrestationCompany,
  Tag,
  User,
} from "../types";

const DEFAULT_SETTINGS: KanbanSettings = {
  card_fields: ["category", "tags", "pilot", "company", "dates", "priority"],
  color_by: "priority",
  show_wip_limit: true,
  show_empty_columns: true,
  allow_drag_and_drop: true,
  title: "Kanban des audits",
};

export function KanbanBoard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [settings, setSettings] = useState<KanbanSettings>(DEFAULT_SETTINGS);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [pilotFilter, setPilotFilter] = useState("");

  const canManage = user?.role === "admin" || user?.role === "pilote_audit";
  const isAdmin = user?.role === "admin";
  // Le tableau ne charge pas l'intégralité d'un gros portefeuille : au-delà,
  // l'utilisateur est invité à filtrer (le total réel reste affiché par colonne).
  const CARD_LIMIT = 1000;
  const filtersActive = Boolean(search.trim() || categoryFilter || tagFilter || pilotFilter);

  const loadAudits = useCallback(() => {
    const params: Record<string, string> = { limit: String(CARD_LIMIT) };
    if (search.trim()) params.q = search.trim();
    if (categoryFilter) params.category_id = categoryFilter;
    if (tagFilter) params.tag_id = tagFilter;
    if (pilotFilter) params.pilot_id = pilotFilter;
    return apiClient.get<Audit[]>("/api/audits", { params }).then((r) => setAudits(r.data));
  }, [search, categoryFilter, tagFilter, pilotFilter]);

  useEffect(() => {
    apiClient.get<KanbanColumn[]>("/api/kanban/columns").then((r) => setColumns(r.data));
    apiClient
      .get<AppSetting<KanbanSettings>>("/api/settings/kanban")
      .then((r) => setSettings({ ...DEFAULT_SETTINGS, ...r.data.value }))
      .catch(() => setSettings(DEFAULT_SETTINGS));
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => setCompanies(r.data));
    apiClient.get<Tag[]>("/api/tags").then((r) => setTags(r.data));
  }, []);

  useEffect(() => {
    loadAudits();
  }, [loadAudits]);

  const byColumn = useMemo(() => {
    const map = new Map<string, Audit[]>();
    columns.forEach((c) => map.set(c.id, []));
    const fallback = columns.find((c) => c.is_default) ?? columns[0];
    audits.forEach((audit) => {
      const key =
        (audit.kanban_column_id && map.has(audit.kanban_column_id) && audit.kanban_column_id) ||
        columns.find((c) => c.mapped_status === audit.status)?.id ||
        fallback?.id;
      if (key) map.get(key)!.push(audit);
    });
    return map;
  }, [audits, columns]);

  const move = async (auditId: string, columnId: string) => {
    setError(null);
    const previous = audits;
    setAudits((current) => current.map((a) => (a.id === auditId ? { ...a, kanban_column_id: columnId } : a)));
    try {
      await apiClient.post(`/api/audits/${auditId}/kanban-column`, { column_id: columnId });
      await loadAudits();
    } catch {
      setAudits(previous);
      setError("Le déplacement de la carte a échoué. Rechargez la page et réessayez.");
    }
  };

  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.full_name ?? null;
  const companyName = (cid: string | null) => companies.find((c) => c.id === cid)?.name ?? null;
  const category = (cid: string | null) => categories.find((c) => c.id === cid) ?? null;

  const cardColor = (audit: Audit): string => {
    if (settings.color_by === "status") return STATUS_COLORS[audit.status] ?? "#9e9e9e";
    if (settings.color_by === "category") return category(audit.category_id)?.color ?? "#90a4ae";
    return PRIORITY_COLORS[audit.priority] ?? "#90a4ae";
  };

  const shows = (field: string) => settings.card_fields.includes(field);
  const visibleColumns = settings.show_empty_columns
    ? columns
    : columns.filter((c) => (byColumn.get(c.id) ?? []).length > 0);

  return (
    <Box>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} alignItems="center">
        <TextField
          size="small" label="Rechercher" placeholder="nom, référence…"
          value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 200 }}
        />
        <TextField select size="small" label="Catégorie" value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Toutes</MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Étiquette" value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Toutes</MenuItem>
          {tags.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Pilote" value={pilotFilter}
          onChange={(e) => setPilotFilter(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Tous</MenuItem>
          {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        {isAdmin && (
          <Button
            component={RouterLink} to="/administration?onglet=kanban"
            size="small" startIcon={<SettingsIcon />}
          >
            Configurer les colonnes
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {audits.length >= CARD_LIMIT && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Plus de {CARD_LIMIT} audits correspondent à ces critères : seuls les {CARD_LIMIT} premiers sont
          affichés sur le tableau. Les compteurs de colonnes indiquent le total réel — affinez les filtres
          pour travailler sur un sous-ensemble.
        </Alert>
      )}
      {columns.length === 0 && (
        <Alert severity="info">
          Aucune colonne de kanban n'est définie. Un administrateur peut les créer depuis
          l'onglet « Kanban » du panneau d'administration.
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1, alignItems: "flex-start" }}>
        {visibleColumns.map((column) => {
          const columnAudits = byColumn.get(column.id) ?? [];
          const overLimit = column.wip_limit !== null && columnAudits.length > column.wip_limit;
          const truncated = !filtersActive && column.audits_count > columnAudits.length;
          return (
            <Paper
              key={column.id}
              variant="outlined"
              onDragOver={(e) => {
                if (!settings.allow_drag_and_drop || !canManage) return;
                e.preventDefault();
                setHoveredColumn(column.id);
              }}
              onDragLeave={() => setHoveredColumn((c) => (c === column.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setHoveredColumn(null);
                if (dragged && canManage) move(dragged, column.id);
                setDragged(null);
              }}
              sx={{
                minWidth: 272,
                width: 272,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                bgcolor: hoveredColumn === column.id ? "action.hover" : "background.paper",
                outline: hoveredColumn === column.id ? "2px dashed" : "none",
                outlineColor: "primary.main",
              }}
            >
              <Box sx={{ p: 1.5, borderBottom: "3px solid", borderColor: column.color }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Tooltip title={column.description ?? ""}>
                    <Typography variant="subtitle2" fontWeight={700} noWrap>
                      {column.label}
                    </Typography>
                  </Tooltip>
                  <Tooltip
                    title={
                      truncated
                        ? `${columnAudits.length} carte(s) affichée(s) sur ${column.audits_count} audit(s) dans cette colonne`
                        : ""
                    }
                  >
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      sx={{ color: overLimit ? "#b3261e" : "text.secondary" }}
                    >
                      {truncated ? `${columnAudits.length} / ${column.audits_count}` : columnAudits.length}
                      {settings.show_wip_limit && column.wip_limit !== null ? ` · WIP ${column.wip_limit}` : ""}
                    </Typography>
                  </Tooltip>
                </Stack>
                {overLimit && (
                  <Typography variant="caption" sx={{ color: "#b3261e" }}>
                    Limite d'en-cours dépassée
                  </Typography>
                )}
              </Box>

              <Stack spacing={1} sx={{ p: 1, flexGrow: 1, minHeight: 90 }}>
                {columnAudits.map((audit) => (
                  <Card
                    key={audit.id}
                    variant="outlined"
                    draggable={settings.allow_drag_and_drop && canManage}
                    onDragStart={() => setDragged(audit.id)}
                    onDragEnd={() => setDragged(null)}
                    sx={{
                      borderLeft: "4px solid",
                      borderLeftColor: cardColor(audit),
                      opacity: dragged === audit.id ? 0.5 : 1,
                      cursor: settings.allow_drag_and_drop && canManage ? "grab" : "pointer",
                    }}
                  >
                    <CardActionArea onClick={() => navigate(`/audits/${audit.id}`)}>
                      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                          <Typography variant="body2" fontWeight={600} sx={{ pr: 1 }}>
                            {audit.reference ? `${audit.reference} — ` : ""}
                            {audit.name}
                          </Typography>
                          {shows("priority") && <PriorityChip priority={audit.priority} />}
                        </Stack>
                        {shows("category") && category(audit.category_id) && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {category(audit.category_id)!.name}
                          </Typography>
                        )}
                        {shows("tags") && audit.tags?.length > 0 && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ my: 0.5 }}>
                            {audit.tags.map((tag) => (
                              <Chip
                                key={tag.id} label={tag.name} size="small" variant="outlined"
                                sx={{ height: 18, fontSize: 10, borderColor: tag.color ?? undefined }}
                              />
                            ))}
                          </Stack>
                        )}
                        {shows("pilot") && userName(audit.pilot_id) && (
                          <Typography variant="caption" display="block">Pilote : {userName(audit.pilot_id)}</Typography>
                        )}
                        {shows("company") && companyName(audit.prestation_company_id) && (
                          <Typography variant="caption" display="block">
                            Prestataire : {companyName(audit.prestation_company_id)}
                          </Typography>
                        )}
                        {shows("dates") && (audit.planned_start || audit.planned_end) && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {audit.planned_start ?? "?"} → {audit.planned_end ?? "?"}
                          </Typography>
                        )}
                      </CardContent>
                    </CardActionArea>
                    {canManage && (
                      <TextField
                        select size="small" variant="standard" value={column.id}
                        onChange={(e) => move(audit.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        sx={{ width: "100%", px: 1.5, pb: 1 }}
                        // Alternative accessible au glisser-déposer
                        SelectProps={{ "aria-label": "Déplacer la carte vers une autre colonne" }}
                      >
                        {columns.map((c) => (
                          <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>
                        ))}
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
    </Box>
  );
}
