import { useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { GanttView } from "../components/GanttView";
import { KanbanBoard } from "../components/KanbanBoard";

type PlanningTab = "kanban" | "gantt-audit" | "gantt-pilot" | "gantt-company";

export function PlanningDashboard() {
  const [tab, setTab] = useState<PlanningTab>("kanban");

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Planification des audits
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="kanban" label="Kanban — tâches à faire" />
        <Tab value="gantt-audit" label="Gantt — par audit" />
        <Tab value="gantt-pilot" label="Gantt — par pilote" />
        <Tab value="gantt-company" label="Gantt — par société" />
      </Tabs>

      {tab === "kanban" && <KanbanBoard />}
      {tab === "gantt-audit" && <GanttView groupBy="audit" />}
      {tab === "gantt-pilot" && <GanttView groupBy="pilot" />}
      {tab === "gantt-company" && <GanttView groupBy="company" />}
    </Box>
  );
}
