import { Box, Typography } from "@mui/material";
import { WorkloadPanel } from "../components/WorkloadPanel";

export function Auditors() {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Auditeurs &amp; plan de charge
      </Typography>
      <WorkloadPanel />
    </Box>
  );
}
