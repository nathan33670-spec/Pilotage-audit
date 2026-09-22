/**
 * Planning multi-échelles.
 *
 * L'analyste choisit l'échelle d'affichage (jour, semaine, mois, trimestre,
 * année, cycle pluriannuel), une fenêtre glissante ou alignée sur la période,
 * et peut restreindre la vue à une sélection d'audits, une catégorie, des
 * étiquettes, un pilote, un prestataire ou un auditeur.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import dayjs from "dayjs";
import { apiClient } from "../api/client";
import { PRIORITY_COLORS } from "../theme";
import type {
  Audit,
  Category,
  PlanningAudit,
  PlanningRange,
  PlanningScale,
  PrestationCompany,
  Tag,
  User,
} from "../types";

export type PlanningGroupBy = "audit" | "pilot" | "company" | "category" | "auditor";

const SCALE_OPTIONS: { value: PlanningScale; label: string; defaultSpan: number; step: [number, dayjs.ManipulateType] }[] = [
  { value: "jour", label: "Jour", defaultSpan: 14, step: [1, "day"] },
  { value: "semaine", label: "Semaine", defaultSpan: 12, step: [1, "week"] },
  { value: "mois", label: "Mois", defaultSpan: 12, step: [1, "month"] },
  { value: "trimestre", label: "Trimestre", defaultSpan: 8, step: [3, "month"] },
  { value: "annee", label: "Année", defaultSpan: 3, step: [1, "year"] },
  { value: "cycle", label: "Cycle 3 ans", defaultSpan: 1, step: [1, "year"] },
];

const GROUP_OPTIONS: { value: PlanningGroupBy; label: string }[] = [
  { value: "audit", label: "Par audit" },
  { value: "category", label: "Par catégorie" },
  { value: "pilot", label: "Par pilote" },
  { value: "company", label: "Par société de prestation" },
  { value: "auditor", label: "Par auditeur" },
];

interface Bar {
  key: string;
  label: string;
  title: string;
  start: string;
  end: string;
  color: string;
  kind: "planned" | "actual" | "phase";
  confirmed: boolean;
  auditId: string;
}

export function PlanningTimeline() {
  const navigate = useNavigate();
  const [scale, setScale] = useState<PlanningScale>("mois");
  const [span, setSpan] = useState<number>(12);
  const [rolling, setRolling] = useState(false);
  const [anchor, setAnchor] = useState(dayjs().format("YYYY-MM-DD"));
  const [cycleYears, setCycleYears] = useState(3);
  const [groupBy, setGroupBy] = useState<PlanningGroupBy>("audit");
  const [showActual, setShowActual] = useState(true);
  const [showPhases, setShowPhases] = useState(true);

  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [pilotId, setPilotId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [auditorId, setAuditorId] = useState("");
  const [selectedAudits, setSelectedAudits] = useState<Audit[]>([]);

  const [allAudits, setAllAudits] = useState<Audit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);

  const [range, setRange] = useState<PlanningRange | null>(null);
  const [rows, setRows] = useState<PlanningAudit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<Audit[]>("/api/audits", { params: { limit: 2000 } }).then((r) => setAllAudits(r.data));
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<Tag[]>("/api/tags").then((r) => setTags(r.data));
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => setCompanies(r.data));
  }, []);

  const changeScale = (value: PlanningScale) => {
    setScale(value);
    setSpan(SCALE_OPTIONS.find((o) => o.value === value)?.defaultSpan ?? 12);
    // Aux échelles larges, le détail des phases est illisible et alourdit
    // fortement la réponse : il est désactivé par défaut (réactivable).
    setShowPhases(!["annee", "cycle"].includes(value));
  };

  const shift = (direction: 1 | -1) => {
    const option = SCALE_OPTIONS.find((o) => o.value === scale)!;
    const [amount, unit] = option.step;
    setAnchor(dayjs(anchor).add(direction * amount * (scale === "cycle" ? cycleYears : 1), unit).format("YYYY-MM-DD"));
  };

  const queryParams = useMemo(() => {
    const params: Record<string, string | number | boolean | string[]> = {
      scale,
      anchor,
      span,
      rolling,
      cycle_years: cycleYears,
      include_phases: showPhases,
    };
    if (categoryId) params.category_id = categoryId;
    if (tagId) params.tag_id = [tagId];
    if (pilotId) params.pilot_id = pilotId;
    if (companyId) params.prestation_company_id = companyId;
    if (auditorId) params.auditor_id = auditorId;
    if (selectedAudits.length > 0) params.audit_ids = selectedAudits.map((a) => a.id);
    return params;
  }, [scale, anchor, span, rolling, cycleYears, categoryId, tagId, pilotId, companyId, auditorId, selectedAudits, showPhases]);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      apiClient.get<PlanningRange>("/api/planning/range", {
        params: { scale, anchor, span, rolling, cycle_years: cycleYears },
      }),
      apiClient.get<PlanningAudit[]>("/api/planning/audits", { params: queryParams }),
    ])
      .then(([r, a]) => {
        setRange(r.data);
        setRows(a.data);
      })
      .finally(() => setLoading(false));
  }, [scale, anchor, span, rolling, cycleYears, queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const totalDays = useMemo(() => {
    if (!range) return 1;
    return Math.max(dayjs(range.end).diff(dayjs(range.start), "day") + 1, 1);
  }, [range]);

  const position = (start: string, end: string) => {
    if (!range) return null;
    const from = dayjs(start).isBefore(range.start) ? dayjs(range.start) : dayjs(start);
    const to = dayjs(end).isAfter(range.end) ? dayjs(range.end) : dayjs(end);
    if (to.isBefore(from)) return null;
    const left = (from.diff(dayjs(range.start), "day") / totalDays) * 100;
    const width = ((to.diff(from, "day") + 1) / totalDays) * 100;
    return { left, width: Math.max(width, 0.4) };
  };

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; bars: Bar[] }>();
    const push = (key: string, label: string, bar: Bar) => {
      if (!map.has(key)) map.set(key, { label, bars: [] });
      map.get(key)!.bars.push(bar);
    };

    rows.forEach((audit) => {
      const color = PRIORITY_COLORS[audit.priority] ?? "#90a4ae";
      const baseBars: Bar[] = [];
      if (audit.planned_start && audit.planned_end) {
        baseBars.push({
          key: `${audit.audit_id}-planned`,
          label: audit.name,
          title: `${audit.name} — planifié ${audit.planned_start} → ${audit.planned_end}`,
          start: audit.planned_start,
          end: audit.planned_end,
          color,
          kind: "planned",
          confirmed: true,
          auditId: audit.audit_id,
        });
      }
      if (showActual && audit.actual_start && audit.actual_end) {
        baseBars.push({
          key: `${audit.audit_id}-actual`,
          label: audit.name,
          title: `${audit.name} — réel ${audit.actual_start} → ${audit.actual_end}`,
          start: audit.actual_start,
          end: audit.actual_end,
          color,
          kind: "actual",
          confirmed: true,
          auditId: audit.audit_id,
        });
      }
      const phaseBars: Bar[] = showPhases
        ? audit.phases
            .filter((p) => p.start_date && p.end_date)
            .map((p) => ({
              key: p.phase_id,
              label: p.phase_name,
              title: `${audit.name} — ${p.phase_name} — ${p.auditor_name ?? "non assigné"} (${p.start_date} → ${p.end_date}) — ${p.confirmed ? "confirmé" : "non confirmé"}`,
              start: p.start_date!,
              end: p.end_date!,
              color,
              kind: "phase" as const,
              confirmed: p.confirmed,
              auditId: audit.audit_id,
            }))
        : [];

      const bars = [...baseBars, ...phaseBars];
      if (groupBy === "audit") {
        bars.forEach((bar) => push(audit.audit_id, audit.reference ? `${audit.reference} — ${audit.name}` : audit.name, bar));
      } else if (groupBy === "category") {
        bars.forEach((bar) => push(audit.category_id ?? "none", audit.category_name ?? "Sans catégorie", bar));
      } else if (groupBy === "pilot") {
        bars.forEach((bar) => push(audit.pilot_id ?? "none", audit.pilot_name ?? "Pilote non assigné", bar));
      } else if (groupBy === "company") {
        bars.forEach((bar) =>
          push(audit.prestation_company_id ?? "none", audit.prestation_company_name ?? "Interne (sans prestataire)", bar)
        );
      } else {
        audit.phases.forEach((p) => {
          const bar = phaseBars.find((b) => b.key === p.phase_id);
          if (bar) push(p.auditor_id ?? "none", p.auditor_name ?? "Auditeur non assigné", bar);
        });
      }
    });

    return Array.from(map.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, groupBy, showActual, showPhases]);

  const labelWidth = 240;
  // Au-delà, le rendu devient illisible et coûteux : les lignes suivantes sont
  // masquées et l'utilisateur est invité à filtrer ou à réduire la fenêtre.
  const MAX_ROWS = 150;
  const visibleGroups = groups.slice(0, MAX_ROWS);

  return (
    <Box>
      {/* Contrôles d'échelle et filtres */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1.5 }}>
        <TextField select size="small" label="Échelle" value={scale}
          onChange={(e) => changeScale(e.target.value as PlanningScale)} sx={{ minWidth: 140 }}>
          {SCALE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <TextField
          type="number" size="small" label={scale === "cycle" ? "Cycles" : "Nombre de périodes"}
          value={span} onChange={(e) => setSpan(Math.max(1, Number(e.target.value) || 1))}
          sx={{ width: 150 }} inputProps={{ min: 1, max: 60 }}
        />
        {scale === "cycle" && (
          <TextField
            type="number" size="small" label="Années par cycle" value={cycleYears}
            onChange={(e) => setCycleYears(Math.max(1, Number(e.target.value) || 3))}
            sx={{ width: 150 }} inputProps={{ min: 1, max: 10 }}
          />
        )}
        <TextField
          type="date" size="small" label={rolling ? "Départ de la fenêtre" : "Date d'ancrage"}
          InputLabelProps={{ shrink: true }} value={anchor}
          onChange={(e) => e.target.value && setAnchor(e.target.value)}
        />
        <Stack direction="row" alignItems="center">
          <IconButton size="small" onClick={() => shift(-1)} aria-label="Période précédente"><ChevronLeftIcon /></IconButton>
          <Tooltip title="Revenir à aujourd'hui">
            <IconButton size="small" onClick={() => setAnchor(dayjs().format("YYYY-MM-DD"))}><TodayIcon /></IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => shift(1)} aria-label="Période suivante"><ChevronRightIcon /></IconButton>
        </Stack>
        <FormControlLabel
          control={<Checkbox size="small" checked={rolling} onChange={(e) => setRolling(e.target.checked)} />}
          label={<Typography variant="body2">Vue glissante</Typography>}
        />
        <TextField select size="small" label="Regroupement" value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as PlanningGroupBy)} sx={{ minWidth: 190 }}>
          {GROUP_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      </Stack>

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 2 }}>
        <Autocomplete
          multiple size="small" options={allAudits} value={selectedAudits}
          onChange={(_, value) => setSelectedAudits(value)}
          getOptionLabel={(option) => (option.reference ? `${option.reference} — ${option.name}` : option.name)}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 320, maxWidth: 520 }}
          renderInput={(params) => (
            <TextField {...params} label="Sélection d'audits" placeholder="tous les audits" />
          )}
        />
        <TextField select size="small" label="Catégorie" value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Toutes</MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Étiquette" value={tagId}
          onChange={(e) => setTagId(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Toutes</MenuItem>
          {tags.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Pilote" value={pilotId}
          onChange={(e) => setPilotId(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Tous</MenuItem>
          {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Auditeur" value={auditorId}
          onChange={(e) => setAuditorId(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Tous</MenuItem>
          {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Prestataire" value={companyId}
          onChange={(e) => setCompanyId(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Tous</MenuItem>
          {companies.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        {(selectedAudits.length > 0 || categoryId || tagId || pilotId || companyId || auditorId) && (
          <Button size="small" onClick={() => {
            setSelectedAudits([]); setCategoryId(""); setTagId(""); setPilotId(""); setCompanyId(""); setAuditorId("");
          }}>
            Réinitialiser
          </Button>
        )}
      </Stack>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary">Priorité :</Typography>
        {Object.entries(PRIORITY_COLORS).map(([key, color]) => (
          <Stack key={key} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: color }} />
            <Typography variant="caption">{key}</Typography>
          </Stack>
        ))}
        <Chip size="small" variant="outlined" label="Phase confirmée (trait plein)" sx={{ borderWidth: 2 }} />
        <Chip size="small" variant="outlined" label="Non confirmée (pointillés)" sx={{ borderStyle: "dashed", borderWidth: 2 }} />
        <Tooltip title="Affiche le détail des phases. Désactivé par défaut aux échelles « Année » et « Cycle », où il alourdit fortement l'affichage.">
          <FormControlLabel
            control={<Checkbox size="small" checked={showPhases} onChange={(e) => setShowPhases(e.target.checked)} />}
            label={<Typography variant="body2">Phases</Typography>}
          />
        </Tooltip>
        <FormControlLabel
          control={<Checkbox size="small" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />}
          label={<Typography variant="body2">Réalisé</Typography>}
        />
      </Stack>

      <Card variant="outlined">
        <CardContent sx={{ overflowX: "auto" }}>
          {loading && rows.length === 0 ? (
            <Typography color="text.secondary">Chargement…</Typography>
          ) : !range ? null : groups.length === 0 ? (
            <Typography color="text.secondary">
              Aucun audit planifié sur cette fenêtre ({dayjs(range.start).format("DD/MM/YYYY")} →{" "}
              {dayjs(range.end).format("DD/MM/YYYY")}).
            </Typography>
          ) : (
            <Box sx={{ minWidth: 900 }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Fenêtre affichée : {dayjs(range.start).format("DD/MM/YYYY")} →{" "}
                {dayjs(range.end).format("DD/MM/YYYY")} — {groups.length} ligne(s), {rows.length} audit(s)
                {groups.length > MAX_ROWS && ` — ${MAX_ROWS} premières lignes affichées`}
              </Typography>
              {groups.length > MAX_ROWS && (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  {groups.length} lignes correspondent à cette fenêtre : seules les {MAX_ROWS} premières
                  sont affichées. Réduisez la fenêtre, changez de regroupement ou filtrez (catégorie,
                  étiquette, pilote, sélection d'audits) pour voir le reste.
                </Alert>
              )}

              {/* En-tête de périodes */}
              <Box sx={{ display: "flex", borderBottom: "2px solid", borderColor: "divider", pb: 0.5, mb: 1 }}>
                <Box sx={{ width: labelWidth, flexShrink: 0 }} />
                <Box sx={{ display: "flex", flexGrow: 1 }}>
                  {range.columns.map((column) => {
                    const days = dayjs(column.end).diff(dayjs(column.start), "day") + 1;
                    return (
                      <Box
                        key={column.start}
                        sx={{
                          width: `${(days / totalDays) * 100}%`,
                          textAlign: "center",
                          fontSize: 11,
                          borderLeft: "1px solid",
                          borderColor: "divider",
                          bgcolor: column.is_weekend ? "action.hover" : "transparent",
                          overflow: "hidden",
                        }}
                      >
                        <Box sx={{ fontWeight: 700 }}>{column.label}</Box>
                        <Box sx={{ color: "text.secondary", fontSize: 10 }}>{column.sublabel}</Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {visibleGroups.map((group) => (
                <Box key={group.key} sx={{ display: "flex", alignItems: "center", py: 0.5, minHeight: 34 }}>
                  <Box sx={{ width: labelWidth, flexShrink: 0, pr: 1 }}>
                    <Typography variant="body2" noWrap title={group.label}>
                      {group.label}
                    </Typography>
                  </Box>
                  <Box sx={{ position: "relative", flexGrow: 1, height: 24 }}>
                    {range.columns.map((column) => {
                      const offset = (dayjs(column.start).diff(dayjs(range.start), "day") / totalDays) * 100;
                      return (
                        <Box
                          key={`grid-${column.start}`}
                          sx={{
                            position: "absolute",
                            left: `${offset}%`,
                            top: 0,
                            bottom: 0,
                            borderLeft: "1px solid",
                            borderColor: "divider",
                            opacity: 0.6,
                          }}
                        />
                      );
                    })}
                    {group.bars.map((bar) => {
                      const pos = position(bar.start, bar.end);
                      if (!pos) return null;
                      return (
                        <Tooltip key={bar.key} title={bar.title}>
                          <Box
                            onClick={() => navigate(`/audits/${bar.auditId}`)}
                            sx={{
                              position: "absolute",
                              left: `${pos.left}%`,
                              width: `calc(${pos.width}% - 2px)`,
                              top: bar.kind === "actual" ? 13 : 0,
                              height: bar.kind === "actual" ? 9 : bar.kind === "planned" ? 22 : 22,
                              bgcolor: bar.kind === "actual" ? "transparent" : bar.color,
                              backgroundImage:
                                bar.kind === "actual"
                                  ? `repeating-linear-gradient(45deg, ${bar.color}, ${bar.color} 3px, transparent 3px, transparent 6px)`
                                  : "none",
                              opacity: bar.kind === "phase" && !bar.confirmed ? 0.55 : 1,
                              border: bar.confirmed ? "1px solid rgba(0,0,0,0.25)" : "1px dashed rgba(0,0,0,0.45)",
                              borderRadius: "4px",
                              display: "flex",
                              alignItems: "center",
                              px: 0.5,
                              color: "#fff",
                              fontSize: 10,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                            }}
                          >
                            {bar.kind !== "actual" && groupBy === "audit" && bar.kind === "phase" ? bar.label : ""}
                            {bar.kind !== "actual" && groupBy !== "audit" ? bar.label : ""}
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
