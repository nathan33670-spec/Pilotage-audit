import { useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { PlanningTimeline } from "../components/PlanningTimeline";
import { KanbanBoard } from "../components/KanbanBoard";
import { WorkloadPanel } from "../components/WorkloadPanel";

type PlanningTab = "kanban" | "timeline" | "charge";

export function PlanningDashboard() {
  const [tab, setTab] = useState<PlanningTab>("kanban");

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Planification des audits
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="kanban" label="Kanban" />
        <Tab value="timeline" label="Planning (échelles)" />
        <Tab value="charge" label="Plan de charge" />
      </Tabs>

      {tab === "kanban" && <KanbanBoard />}
      {tab === "timeline" && <PlanningTimeline />}
      {tab === "charge" && <WorkloadPanel />}
    </Box>
  );
}
