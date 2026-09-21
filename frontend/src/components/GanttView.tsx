import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { apiClient } from "../api/client";
import { PRIORITY_COLORS } from "../theme";
import type { PlanningPhase, User } from "../types";

export type GanttGroupBy = "audit" | "pilot" | "company";

function groupKeyAndLabel(phase: PlanningPhase, groupBy: GanttGroupBy): { key: string; label: string } {
  if (groupBy === "pilot") {
    return { key: phase.pilot_id ?? "none", label: phase.pilot_name ?? "Pilote non assigné" };
  }
  if (groupBy === "company") {
    return { key: phase.prestation_company_id ?? "none", label: phase.prestation_company_name ?? "Interne (sans prestataire)" };
  }
  return { key: phase.audit_id, label: phase.audit_name };
}

export function GanttView({ groupBy }: { groupBy: GanttGroupBy }) {
  const [monthKey, setMonthKey] = useState<string>(dayjs().format("YYYY-MM"));
  const [phases, setPhases] = useState<PlanningPhase[]>([]);
  const [auditors, setAuditors] = useState<User[]>([]);
  const [auditorFilter, setAuditorFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const rangeStart = useMemo(() => dayjs(monthKey + "-01").startOf("month"), [monthKey]);
  const rangeEnd = useMemo(() => rangeStart.endOf("month"), [rangeStart]);
  const days = useMemo(() => {
    const list: Dayjs[] = [];
    let cursor = rangeStart;
    while (cursor.isBefore(rangeEnd) || cursor.isSame(rangeEnd, "day")) {
      list.push(cursor);
      cursor = cursor.add(1, "day");
    }
    return list;
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    apiClient.get<User[]>("/api/users").then((r) => setAuditors(r.data));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params: Record<string, string> = {
      start: rangeStart.format("YYYY-MM-DD"),
      end: rangeEnd.format("YYYY-MM-DD"),
    };
    if (auditorFilter) params.auditor_id = auditorFilter;
    apiClient
      .get<PlanningPhase[]>("/api/planning/phases", { params })
      .then((r) => {
        if (!cancelled) setPhases(r.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey, auditorFilter]);

  const grouped = useMemo(() => {
    const byKey = new Map<string, { label: string; phases: PlanningPhase[] }>();
    for (const phase of phases) {
      const { key, label } = groupKeyAndLabel(phase, groupBy);
      if (!byKey.has(key)) byKey.set(key, { label, phases: [] });
      byKey.get(key)!.phases.push(phase);
    }
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [phases, groupBy]);

  const dayColumnWidth = 32;
  const labelWidth = 220;

  function columnsForPhase(phase: PlanningPhase) {
    if (!phase.start_date || !phase.end_date) return null;
    const start = dayjs(phase.start_date).isBefore(rangeStart) ? rangeStart : dayjs(phase.start_date);
    const end = dayjs(phase.end_date).isAfter(rangeEnd) ? rangeEnd : dayjs(phase.end_date);
    const startIdx = start.diff(rangeStart, "day");
    const span = end.diff(start, "day") + 1;
    return { startIdx, span: Math.max(span, 1) };
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          {groupBy === "audit" ? "Vue par audit" : groupBy === "pilot" ? "Vue par pilote" : "Vue par société"}
        </Typography>
        <Stack direction="row" spacing={2}>
          <TextField
            select
            size="small"
            label="Auditeur"
            value={auditorFilter}
            onChange={(e) => setAuditorFilter(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Tous les auditeurs</MenuItem>
            {auditors.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.full_name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="month"
            size="small"
            label="Mois"
            value={monthKey}
            onChange={(e) => e.target.value && setMonthKey(e.target.value)}
          />
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <Typography variant="caption" color="text.secondary">Priorité :</Typography>
        {Object.entries(PRIORITY_COLORS).map(([key, color]) => (
          <Chip key={key} size="small" label={key} sx={{ bgcolor: color, color: "#fff" }} />
        ))}
        <Chip size="small" variant="outlined" label="Confirmé (trait plein)" sx={{ borderStyle: "solid", borderWidth: 2 }} />
        <Chip size="small" variant="outlined" label="Non confirmé (pointillés)" sx={{ borderStyle: "dashed", borderWidth: 2 }} />
      </Stack>

      <Card variant="outlined">
        <CardContent sx={{ overflowX: "auto" }}>
          {loading ? (
            <Typography color="text.secondary">Chargement…</Typography>
          ) : grouped.length === 0 ? (
            <Typography color="text.secondary">Aucune phase planifiée sur cette période.</Typography>
          ) : (
            <Box sx={{ minWidth: labelWidth + days.length * dayColumnWidth }}>
              <Box sx={{ display: "flex", borderBottom: "2px solid", borderColor: "divider", pb: 1, mb: 1 }}>
                <Box sx={{ width: labelWidth, flexShrink: 0 }} />
                {days.map((d) => (
                  <Box
                    key={d.format("YYYY-MM-DD")}
                    sx={{
                      width: dayColumnWidth,
                      flexShrink: 0,
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: [0, 6].includes(d.day()) ? 700 : 400,
                      color: [0, 6].includes(d.day()) ? "text.secondary" : "text.primary",
                      bgcolor: [0, 6].includes(d.day()) ? "action.hover" : "transparent",
                    }}
                  >
                    {d.format("D")}
                  </Box>
                ))}
              </Box>

              {grouped.map(({ label, phases: rowPhases }) => (
                <Box key={label} sx={{ display: "flex", alignItems: "center", py: 0.5, position: "relative", minHeight: 36 }}>
                  <Box sx={{ width: labelWidth, flexShrink: 0, pr: 1 }}>
                    <Typography variant="body2" noWrap title={label}>
                      {label}
                    </Typography>
                  </Box>
                  <Box sx={{ position: "relative", flexGrow: 1, height: 24 }}>
                    {rowPhases.map((phase) => {
                      const cols = columnsForPhase(phase);
                      if (!cols) return null;
                      return (
                        <Tooltip
                          key={phase.phase_id}
                          title={`${phase.audit_name} — ${phase.phase_name} — ${phase.auditor_name ?? "non assigné"} (${phase.start_date} → ${phase.end_date}) — ${phase.confirmed ? "confirmé" : "non confirmé"}`}
                        >
                          <Box
                            sx={{
                              position: "absolute",
                              left: cols.startIdx * dayColumnWidth,
                              width: cols.span * dayColumnWidth - 4,
                              height: 24,
                              bgcolor: PRIORITY_COLORS[phase.priority],
                              opacity: phase.confirmed ? 1 : 0.55,
                              border: phase.confirmed ? "2px solid rgba(0,0,0,0.25)" : "2px dashed rgba(0,0,0,0.4)",
                              borderRadius: 1,
                              display: "flex",
                              alignItems: "center",
                              px: 0.5,
                              color: "#fff",
                              fontSize: 11,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              cursor: "default",
                            }}
                          >
                            {groupBy === "audit" ? phase.phase_name : phase.audit_name}
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
