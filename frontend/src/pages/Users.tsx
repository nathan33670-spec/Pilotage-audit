import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { apiClient } from "../api/client";
import type { User, UserRole } from "../types";

const ROLES: UserRole[] = ["admin", "pilote_audit", "responsable_service"];
const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrateur",
  pilote_audit: "Pilote d'audit",
  responsable_service: "Responsable de service",
};

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "pilote_audit" as UserRole, password: "" });

  const load = () => {
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
  };
  useEffect(load, []);

  const create = async () => {
    await apiClient.post("/api/users", form);
    setOpen(false);
    setForm({ email: "", full_name: "", role: "pilote_audit", password: "" });
    load();
  };

  const toggleActive = async (user: User) => {
    await apiClient.patch(`/api/users/${user.id}`, { is_active: !user.is_active });
    load();
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Utilisateurs</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Ajouter</Button>
      </Stack>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Rôle</TableCell>
              <TableCell>Origine</TableCell>
              <TableCell>Actif</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.full_name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Chip size="small" label={ROLE_LABELS[u.role]} /></TableCell>
                <TableCell>{u.auth_provider === "sso" ? "SSO" : "Local"}</TableCell>
                <TableCell><Switch checked={u.is_active} onChange={() => toggleActive(u)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouvel utilisateur</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nom complet" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextField select label="Rôle" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            {ROLES.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r]}</MenuItem>)}
          </TextField>
          <TextField label="Mot de passe temporaire" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={create} disabled={!form.email || !form.full_name || !form.password}>Créer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
