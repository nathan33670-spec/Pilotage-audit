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

function startOfMonth(d: Dayjs) {
  return d.startOf("month");
}
function endOfMonth(d: Dayjs) {
  return d.endOf("month");
}

export function PlanningDashboard() {
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));
  const [phases, setPhases] = useState<PlanningPhase[]>([]);
  const [auditors, setAuditors] = useState<User[]>([]);
  const [auditorFilter, setAuditorFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const rangeStart = startOfMonth(month);
  const rangeEnd = endOfMonth(month);
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
    setLoading(true);
    const params: Record<string, string> = {
      start: rangeStart.format("YYYY-MM-DD"),
      end: rangeEnd.format("YYYY-MM-DD"),
    };
    if (auditorFilter) params.auditor_id = auditorFilter;
    apiClient
      .get<PlanningPhase[]>("/api/planning/phases", { params })
      .then((r) => setPhases(r.data))
      .finally(() => setLoading(false));
  }, [rangeStart, rangeEnd, auditorFilter]);

  const grouped = useMemo(() => {
    const byAudit = new Map<string, { audit_name: string; phases: PlanningPhase[] }>();
    for (const phase of phases) {
      if (!byAudit.has(phase.audit_id)) {
        byAudit.set(phase.audit_id, { audit_name: phase.audit_name, phases: [] });
      }
      byAudit.get(phase.audit_id)!.phases.push(phase);
    }
    return Array.from(byAudit.values());
  }, [phases]);

  const dayColumnWidth = 32;
  const labelWidth = 220;

  function columnsForPhase(phase: PlanningPhase) {
    const start = dayjs(phase.start_date).isBefore(rangeStart) ? rangeStart : dayjs(phase.start_date);
    const end = dayjs(phase.end_date).isAfter(rangeEnd) ? rangeEnd : dayjs(phase.end_date);
    const startIdx = start.diff(rangeStart, "day");
    const span = end.diff(start, "day") + 1;
    return { startIdx, span: Math.max(span, 1) };
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Planification des audits
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
            value={month.format("YYYY-MM")}
            onChange={(e) => e.target.value && setMonth(dayjs(e.target.value + "-01"))}
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
              {/* Header: day numbers */}
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

              {/* Rows: one per audit */}
              {grouped.map(({ audit_name, phases: auditPhases }) => (
                <Box key={audit_name + auditPhases[0].audit_id} sx={{ display: "flex", alignItems: "center", py: 0.5, position: "relative", minHeight: 36 }}>
                  <Box sx={{ width: labelWidth, flexShrink: 0, pr: 1 }}>
                    <Typography variant="body2" noWrap title={audit_name}>
                      {audit_name}
                    </Typography>
                  </Box>
                  <Box sx={{ position: "relative", flexGrow: 1, height: 24 }}>
                    {auditPhases.map((phase) => {
                      const { startIdx, span } = columnsForPhase(phase);
                      return (
                        <Tooltip
                          key={phase.phase_id}
                          title={`${phase.audit_name} — ${phase.auditor_name ?? "non assigné"} (${phase.start_date} → ${phase.end_date}) — ${phase.confirmed ? "confirmé" : "non confirmé"}`}
                        >
                          <Box
                            sx={{
                              position: "absolute",
                              left: startIdx * dayColumnWidth,
                              width: span * dayColumnWidth - 4,
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
                            {phase.phase_name}
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
