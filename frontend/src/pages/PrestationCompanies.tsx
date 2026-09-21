import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { PrestationCompany, PrestationConsumption } from "../types";

export function PrestationCompanies() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);
  const [consumption, setConsumption] = useState<Record<string, PrestationConsumption>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", allocated_days: "", notes: "" });

  const load = () => {
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => {
      setCompanies(r.data);
      r.data.forEach((c) => {
        apiClient.get<PrestationConsumption>(`/api/prestation-companies/${c.id}/consumption`).then((res) => {
          setConsumption((prev) => ({ ...prev, [c.id]: res.data }));
        });
      });
    });
  };

  useEffect(load, []);

  const create = async () => {
    await apiClient.post("/api/prestation-companies", {
      ...form,
      allocated_days: form.allocated_days ? Number(form.allocated_days) : null,
    });
    setOpen(false);
    setForm({ name: "", contact_name: "", contact_email: "", contact_phone: "", allocated_days: "", notes: "" });
    load();
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Sociétés de prestation</Typography>
        {user?.role === "admin" && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Ajouter</Button>}
      </Stack>

      <Grid container spacing={2}>
        {companies.map((c) => {
          const cons = consumption[c.id];
          const ratio = cons && c.allocated_days ? Math.min(cons.consumed_days / c.allocated_days, 1) : 0;
          const overload = cons && c.allocated_days ? cons.consumed_days > c.allocated_days : false;
          return (
            <Grid item xs={12} md={6} key={c.id}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600}>{c.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{c.contact_name} {c.contact_email && `· ${c.contact_email}`}</Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Audits en cours : {cons?.audits_count ?? "—"} · Consommation : {cons?.consumed_days ?? "—"} j
                    {c.allocated_days != null && ` / ${c.allocated_days} j alloués`}
                  </Typography>
                  {c.allocated_days != null && (
                    <LinearProgress
                      variant="determinate"
                      value={ratio * 100}
                      color={overload ? "error" : ratio > 0.75 ? "warning" : "primary"}
                      sx={{ height: 8, borderRadius: 4, mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouvelle société de prestation</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Contact" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          <TextField label="Email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          <TextField label="Téléphone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
          <TextField label="Jours alloués (contrat)" type="number" value={form.allocated_days} onChange={(e) => setForm({ ...form, allocated_days: e.target.value })} />
          <TextField label="Notes" multiline rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={create} disabled={!form.name}>Créer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
