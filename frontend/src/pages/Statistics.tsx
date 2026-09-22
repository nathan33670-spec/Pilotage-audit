import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import dayjs from "dayjs";
import { apiClient } from "../api/client";
import {
  ChartCard,
  EmptyChart,
  GroupedBarChart,
  HBarChart,
  LineChart,
  StatTile,
  formatNumber,
  formatPercent,
} from "../components/charts/Charts";
import { PRIORITY_COLORS, STATUS_COLORS } from "../theme";
import type {
  AuditDurationRow,
  Category,
  DurationStat,
  PrestationCompany,
  StatsDurations,
  StatsOverview,
  StatsTimeseries,
  Tag,
  User,
} from "../types";

type Granularity = "jour" | "semaine" | "mois" | "trimestre" | "annee";
type Axis = "by_category" | "by_priority" | "by_company" | "by_pilot" | "by_phase";

const AXIS_LABELS: Record<Axis, string> = {
  by_category: "Catégorie",
  by_priority: "Priorité",
  by_company: "Société de prestation",
  by_pilot: "Pilote",
  by_phase: "Type de phase",
};

const PRESETS = [
  { key: "annee", label: "Année en cours" },
  { key: "12m", label: "12 derniers mois" },
  { key: "cycle", label: "Cycle 3 ans" },
  { key: "tout", label: "Tout l'historique" },
];

export function Statistics() {
  const [preset, setPreset] = useState("annee");
  const [start, setStart] = useState(dayjs().startOf("year").format("YYYY-MM-DD"));
  const [end, setEnd] = useState(dayjs().endOf("year").format("YYYY-MM-DD"));
  const [granularity, setGranularity] = useState<Granularity>("mois");
  const [axis, setAxis] = useState<Axis>("by_category");

  const [categoryId, setCategoryId] = useState("");
  const [pilotId, setPilotId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [tagId, setTagId] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [durations, setDurations] = useState<StatsDurations | null>(null);
  const [series, setSeries] = useState<StatsTimeseries | null>(null);
  const [rows, setRows] = useState<AuditDurationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"synthese" | "durees" | "detail">("synthese");

  useEffect(() => {
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => setCompanies(r.data));
    apiClient.get<Tag[]>("/api/tags").then((r) => setTags(r.data));
  }, []);

  const applyPreset = (key: string) => {
    setPreset(key);
    if (key === "annee") {
      setStart(dayjs().startOf("year").format("YYYY-MM-DD"));
      setEnd(dayjs().endOf("year").format("YYYY-MM-DD"));
      setGranularity("mois");
    } else if (key === "12m") {
      setStart(dayjs().subtract(11, "month").startOf("month").format("YYYY-MM-DD"));
      setEnd(dayjs().endOf("month").format("YYYY-MM-DD"));
      setGranularity("mois");
    } else if (key === "cycle") {
      const cycleStart = dayjs().year(dayjs().year() - (dayjs().year() % 3)).startOf("year");
      setStart(cycleStart.format("YYYY-MM-DD"));
      setEnd(cycleStart.add(3, "year").subtract(1, "day").format("YYYY-MM-DD"));
      setGranularity("trimestre");
    } else {
      setStart("2015-01-01");
      setEnd(dayjs().add(2, "year").endOf("year").format("YYYY-MM-DD"));
      setGranularity("annee");
    }
  };

  const params = useMemo(() => {
    const p: Record<string, string> = { start, end };
    if (categoryId) p.category_id = categoryId;
    if (pilotId) p.pilot_id = pilotId;
    if (companyId) p.prestation_company_id = companyId;
    if (tagId) p.tag_id = tagId;
    return p;
  }, [start, end, categoryId, pilotId, companyId, tagId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient.get<StatsOverview>("/api/stats/overview", { params }),
      apiClient.get<StatsDurations>("/api/stats/durations", { params }),
      apiClient.get<StatsTimeseries>("/api/stats/timeseries", { params: { ...params, granularity } }),
      apiClient.get<AuditDurationRow[]>("/api/stats/audits", { params }),
    ])
      .then(([o, d, t, r]) => {
        if (cancelled) return;
        setOverview(o.data);
        setDurations(d.data);
        setSeries(t.data);
        setRows(r.data);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params, granularity]);

  const durationData: DurationStat[] = durations ? durations[axis] : [];

  const exportCsv = () => {
    const header = [
      "Référence", "Audit", "Catégorie", "Statut", "Début prévu", "Fin prévue",
      "Début réel", "Fin réelle", "Jours planifiés", "Jours réels", "Écart (j)",
    ];
    const lines = rows.map((r) =>
      [
        r.reference ?? "", r.name, r.category_name ?? "", r.status,
        r.planned_start ?? "", r.planned_end ?? "", r.actual_start ?? "", r.actual_end ?? "",
        r.planned_days ?? "", r.actual_days ?? "", r.drift_days ?? "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(";")
    );
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `statistiques-audits-${start}_${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Tableaux de bord
        </Typography>
        <Button startIcon={<DownloadIcon />} onClick={exportCsv} disabled={rows.length === 0}>
          Exporter (CSV)
        </Button>
      </Stack>

      {/* Filtres : une seule rangée, au-dessus des graphiques */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
          {PRESETS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              color={preset === p.key ? "primary" : "default"}
              variant={preset === p.key ? "filled" : "outlined"}
              onClick={() => applyPreset(p.key)}
              size="small"
            />
          ))}
          <TextField
            type="date" size="small" label="Du" InputLabelProps={{ shrink: true }}
            value={start} onChange={(e) => { setStart(e.target.value); setPreset(""); }}
          />
          <TextField
            type="date" size="small" label="Au" InputLabelProps={{ shrink: true }}
            value={end} onChange={(e) => { setEnd(e.target.value); setPreset(""); }}
          />
          <TextField select size="small" label="Granularité" value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)} sx={{ minWidth: 140 }}>
            {["jour", "semaine", "mois", "trimestre", "annee"].map((g) => (
              <MenuItem key={g} value={g}>{g === "annee" ? "année" : g}</MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Catégorie" value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="">Toutes</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Étiquette" value={tagId}
            onChange={(e) => setTagId(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">Toutes</MenuItem>
            {tags.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Pilote" value={pilotId}
            onChange={(e) => setPilotId(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">Tous</MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Prestataire" value={companyId}
            onChange={(e) => setCompanyId(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="">Tous</MenuItem>
            {companies.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
        </Stack>
      </Paper>

      {loading && !overview ? (
        <Typography color="text.secondary">Chargement des statistiques…</Typography>
      ) : !overview ? (
        <EmptyChart />
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} md={3} lg={2}>
              <StatTile label="Audits (période)" value={overview.audits_in_period}
                hint={`${overview.total_audits} au total`} />
            </Grid>
            <Grid item xs={6} md={3} lg={2}>
              <StatTile label="Terminés" value={overview.completed_audits} tone="good"
                hint={`${overview.in_progress_audits} en cours`} />
            </Grid>
            <Grid item xs={6} md={3} lg={2}>
              <StatTile label="Durée réelle moyenne" value={formatNumber(overview.avg_actual_days ?? 0)} unit="j"
                hint={`médiane ${formatNumber(overview.median_actual_days ?? 0)} j`} />
            </Grid>
            <Grid item xs={6} md={3} lg={2}>
              <StatTile
                label="Écart au planning"
                value={`${(overview.avg_drift_days ?? 0) > 0 ? "+" : ""}${formatNumber(overview.avg_drift_days ?? 0)}`}
                unit="j"
                tone={(overview.avg_drift_days ?? 0) > 1 ? "warning" : "good"}
                hint={`planifié ${formatNumber(overview.avg_planned_days ?? 0)} j en moyenne`}
              />
            </Grid>
            <Grid item xs={6} md={3} lg={2}>
              <StatTile label="Dans les délais" value={formatPercent(overview.on_time_ratio)}
                tone={(overview.on_time_ratio ?? 0) >= 0.8 ? "good" : "warning"}
                hint={`${overview.late_audits} audit(s) en retard`} />
            </Grid>
            <Grid item xs={6} md={3} lg={2}>
              <StatTile label="Charge réelle cumulée" value={formatNumber(overview.total_actual_days)} unit="j"
                hint={`planifiée ${formatNumber(overview.total_planned_days)} j`} />
            </Grid>
          </Grid>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab value="synthese" label="Synthèse" />
            <Tab value="durees" label="Temps réels" />
            <Tab value="detail" label="Détail par audit" />
          </Tabs>

          {tab === "synthese" && (
            <Grid container spacing={2}>
              <Grid item xs={12} lg={8}>
                <ChartCard
                  title="Activité dans le temps"
                  subtitle="Audits démarrés, terminés et encours en fin de période"
                >
                  <LineChart
                    labels={(series?.points ?? []).map((p) => p.label)}
                    series={[
                      { label: "Démarrés", points: (series?.points ?? []).map((p) => p.started) },
                      { label: "Terminés", points: (series?.points ?? []).map((p) => p.finished) },
                      { label: "En cours (fin de période)", points: (series?.points ?? []).map((p) => p.open_at_end) },
                    ]}
                  />
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <ChartCard title="Répartition par statut" subtitle="Nombre d'audits">
                  <HBarChart
                    data={overview.by_status.map((s) => ({
                      key: s.key, label: s.label, value: s.count,
                      color: s.color ?? STATUS_COLORS[s.key],
                    }))}
                  />
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <ChartCard title="Répartition par catégorie" subtitle="Nombre d'audits">
                  <HBarChart data={overview.by_category.map((s) => ({ key: s.key, label: s.label, value: s.count }))} />
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <ChartCard title="Répartition par priorité" subtitle="Nombre d'audits">
                  <HBarChart
                    data={overview.by_priority.map((s) => ({
                      key: s.key, label: s.label, value: s.count, color: s.color ?? PRIORITY_COLORS[s.key],
                    }))}
                  />
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <ChartCard title="Répartition par prestataire" subtitle="Nombre d'audits">
                  <HBarChart data={overview.by_company.map((s) => ({ key: s.key, label: s.label, value: s.count }))} />
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6} lg={6}>
                <ChartCard title="Charge par pilote" subtitle="Nombre d'audits pilotés sur la période">
                  <HBarChart data={overview.by_pilot.map((s) => ({ key: s.key, label: s.label, value: s.count }))} />
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6} lg={6}>
                <ChartCard title="Étiquettes les plus fréquentes" subtitle="Nombre d'audits étiquetés">
                  <HBarChart data={overview.by_tag.map((s) => ({ key: s.key, label: s.label, value: s.count }))} />
                </ChartCard>
              </Grid>
            </Grid>
          )}

          {tab === "durees" && durations && (
            <Grid container spacing={2}>
              <Grid item xs={12} lg={7}>
                <ChartCard
                  title="Durée planifiée vs durée réelle"
                  subtitle="Moyenne en jours calendaires, par axe d'analyse"
                  action={
                    <TextField select size="small" value={axis} onChange={(e) => setAxis(e.target.value as Axis)}>
                      {Object.entries(AXIS_LABELS).map(([key, label]) => (
                        <MenuItem key={key} value={key}>{label}</MenuItem>
                      ))}
                    </TextField>
                  }
                >
                  <GroupedBarChart
                    seriesLabels={["Planifié", "Réel"]}
                    data={durationData.map((d) => ({
                      key: d.key,
                      label: `${d.label} (${d.audits_count})`,
                      values: [d.avg_planned_days, d.avg_actual_days],
                    }))}
                  />
                </ChartCard>
              </Grid>
              <Grid item xs={12} lg={5}>
                <ChartCard title="Distribution des durées réelles" subtitle="Nombre d'audits par tranche">
                  <HBarChart data={durations.distribution.map((d) => ({ key: d.key, label: d.label, value: d.count }))} />
                </ChartCard>
              </Grid>
              <Grid item xs={12}>
                <ChartCard title={`Détail par ${AXIS_LABELS[axis].toLowerCase()}`} subtitle="Vue tableau des mêmes données">
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{AXIS_LABELS[axis]}</TableCell>
                          <TableCell align="right">Audits</TableCell>
                          <TableCell align="right">Planifié moy. (j)</TableCell>
                          <TableCell align="right">Réel moy. (j)</TableCell>
                          <TableCell align="right">Médiane (j)</TableCell>
                          <TableCell align="right">Min / Max (j)</TableCell>
                          <TableCell align="right">Écart moy. (j)</TableCell>
                          <TableCell align="right">Dans les délais</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {durationData.map((d) => (
                          <TableRow key={d.key} hover>
                            <TableCell>{d.label}</TableCell>
                            <TableCell align="right">{d.audits_count}</TableCell>
                            <TableCell align="right">
                              {d.avg_planned_days === null ? "—" : formatNumber(d.avg_planned_days)}
                            </TableCell>
                            <TableCell align="right">
                              {d.avg_actual_days === null ? "—" : formatNumber(d.avg_actual_days)}
                            </TableCell>
                            <TableCell align="right">
                              {d.median_actual_days === null ? "—" : formatNumber(d.median_actual_days)}
                            </TableCell>
                            <TableCell align="right">
                              {d.min_actual_days === null ? "—" : formatNumber(d.min_actual_days)} /{" "}
                              {d.max_actual_days === null ? "—" : formatNumber(d.max_actual_days)}
                            </TableCell>
                            <TableCell align="right">
                              {d.avg_drift_days === null
                                ? "—"
                                : `${d.avg_drift_days > 0 ? "+" : ""}${formatNumber(d.avg_drift_days)}`}
                            </TableCell>
                            <TableCell align="right">{formatPercent(d.on_time_ratio)}</TableCell>
                          </TableRow>
                        ))}
                        {durationData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8}>
                              <EmptyChart message="Aucune durée réelle saisie sur la période : renseignez les dates réelles des audits ou de leurs phases." />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </ChartCard>
              </Grid>
            </Grid>
          )}

          {tab === "detail" && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Référence</TableCell>
                    <TableCell>Audit</TableCell>
                    <TableCell>Catégorie</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>Période planifiée</TableCell>
                    <TableCell>Période réelle</TableCell>
                    <TableCell align="right">Planifié (j)</TableCell>
                    <TableCell align="right">Réel (j)</TableCell>
                    <TableCell align="right">Écart (j)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.audit_id} hover>
                      <TableCell>{r.reference ?? "—"}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.category_name ?? "—"}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>{r.planned_start ?? "?"} → {r.planned_end ?? "?"}</TableCell>
                      <TableCell>{r.actual_start ?? "?"} → {r.actual_end ?? "?"}</TableCell>
                      <TableCell align="right">{r.planned_days === null ? "—" : formatNumber(r.planned_days)}</TableCell>
                      <TableCell align="right">{r.actual_days === null ? "—" : formatNumber(r.actual_days)}</TableCell>
                      <TableCell align="right" sx={{ color: (r.drift_days ?? 0) > 0 ? "#b3261e" : "inherit" }}>
                        {r.drift_days === null ? "—" : `${r.drift_days > 0 ? "+" : ""}${formatNumber(r.drift_days)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <EmptyChart />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
