import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { apiClient } from "../api/client";
import type { AuditorWorkload } from "../types";

export function Auditors() {
  const [start, setStart] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [end, setEnd] = useState(dayjs().endOf("month").format("YYYY-MM-DD"));
  const [workload, setWorkload] = useState<AuditorWorkload[]>([]);

  useEffect(() => {
    apiClient.get<AuditorWorkload[]>("/api/planning/workload", { params: { start, end } }).then((r) => setWorkload(r.data));
  }, [start, end]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Auditeurs & plan de charge
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField type="date" label="Début période" size="small" InputLabelProps={{ shrink: true }} value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField type="date" label="Fin période" size="small" InputLabelProps={{ shrink: true }} value={end} onChange={(e) => setEnd(e.target.value)} />
      </Stack>

      {workload.length === 0 && <Typography color="text.secondary">Aucune charge assignée sur cette période.</Typography>}

      <Stack spacing={2}>
        {workload.map((w) => {
          const ratio = Math.min(w.assigned_days / w.period_days, 1);
          const overload = w.assigned_days > w.period_days;
          return (
            <Card key={w.auditor_id} variant="outlined">
              <CardContent>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={600}>{w.auditor_name}</Typography>
                  <Typography variant="body2" color={overload ? "error.main" : "text.secondary"}>
                    {w.assigned_days} j / {w.period_days} j · {w.phases_count} phase(s)
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={ratio * 100}
                  color={overload ? "error" : ratio > 0.75 ? "warning" : "primary"}
                  sx={{ height: 10, borderRadius: 5, mt: 1 }}
                />
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
