import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Category, PhaseTemplate, Template } from "../types";

export function Templates() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<"prerequisites" | "phases">("prerequisites");
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [phaseTemplates, setPhaseTemplates] = useState<PhaseTemplate[]>([]);
  const [openCategory, setOpenCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [openTemplate, setOpenTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", category_id: "", itemsText: "" });
  const [openPhaseTemplate, setOpenPhaseTemplate] = useState(false);
  const [phaseTemplateForm, setPhaseTemplateForm] = useState({ name: "", description: "", category_id: "", itemsText: "" });

  const load = () => {
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<Template[]>("/api/templates").then((r) => setTemplates(r.data));
    apiClient.get<PhaseTemplate[]>("/api/phase-templates").then((r) => setPhaseTemplates(r.data));
  };
  useEffect(load, []);

  const createCategory = async () => {
    await apiClient.post("/api/categories", newCategory);
    setOpenCategory(false);
    setNewCategory({ name: "", description: "" });
    load();
  };

  const deleteCategory = async (id: string) => {
    await apiClient.delete(`/api/categories/${id}`);
    load();
  };

  const createTemplate = async () => {
    const items = templateForm.itemsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label, position) => ({ label, is_mandatory: true, position }));
    await apiClient.post("/api/templates", {
      name: templateForm.name,
      description: templateForm.description,
      category_id: templateForm.category_id,
      items,
    });
    setOpenTemplate(false);
    setTemplateForm({ name: "", description: "", category_id: "", itemsText: "" });
    load();
  };

  const deleteTemplate = async (id: string) => {
    await apiClient.delete(`/api/templates/${id}`);
    load();
  };

  const createPhaseTemplate = async () => {
    // Une phase par ligne, format optionnel "Nom | duree_en_jours" (defaut 1 jour)
    const items = phaseTemplateForm.itemsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line, position) => {
        const [name, duration] = line.split("|").map((p) => p.trim());
        return { name: name || line, position, duration_days: Number(duration) > 0 ? Number(duration) : 1 };
      });
    await apiClient.post("/api/phase-templates", {
      name: phaseTemplateForm.name,
      description: phaseTemplateForm.description,
      category_id: phaseTemplateForm.category_id,
      items,
    });
    setOpenPhaseTemplate(false);
    setPhaseTemplateForm({ name: "", description: "", category_id: "", itemsText: "" });
    load();
  };

  const deletePhaseTemplate = async (id: string) => {
    await apiClient.delete(`/api/phase-templates/${id}`);
    load();
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h5" fontWeight={700}>Catégories & templates</Typography>
        {isAdmin && <Button startIcon={<AddIcon />} onClick={() => setOpenCategory(true)}>Catégorie</Button>}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} onDelete={isAdmin ? () => deleteCategory(c.id) : undefined} />
        ))}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="prerequisites" label="Templates de pré-requis" />
        <Tab value="phases" label="Templates de phases" />
      </Tabs>

      {tab === "prerequisites" && (
        <Box>
          {isAdmin && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenTemplate(true)}
              disabled={categories.length === 0}
              sx={{ mb: 2 }}
            >
              Nouveau template de pré-requis
            </Button>
          )}
          <Grid container spacing={2}>
            {templates.map((t) => (
              <Grid item xs={12} md={6} key={t.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Typography variant="subtitle1" fontWeight={600}>{t.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {categories.find((c) => c.id === t.category_id)?.name}
                        </Typography>
                      </Box>
                      {isAdmin && <IconButton size="small" onClick={() => deleteTemplate(t.id)}><DeleteIcon fontSize="small" /></IconButton>}
                    </Stack>
                    <Box sx={{ mt: 1 }}>
                      {t.items.map((item) => (
                        <Typography key={item.id} variant="body2">• {item.label} {item.is_mandatory && <Chip label="obligatoire" size="small" sx={{ ml: 0.5 }} />}</Typography>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {tab === "phases" && (
        <Box>
          {isAdmin && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenPhaseTemplate(true)}
              disabled={categories.length === 0}
              sx={{ mb: 2 }}
            >
              Nouveau template de phases
            </Button>
          )}
          <Grid container spacing={2}>
            {phaseTemplates.map((t) => (
              <Grid item xs={12} md={6} key={t.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Typography variant="subtitle1" fontWeight={600}>{t.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {categories.find((c) => c.id === t.category_id)?.name}
                        </Typography>
                      </Box>
                      {isAdmin && <IconButton size="small" onClick={() => deletePhaseTemplate(t.id)}><DeleteIcon fontSize="small" /></IconButton>}
                    </Stack>
                    <Box sx={{ mt: 1 }}>
                      {t.items.map((item) => (
                        <Typography key={item.id} variant="body2">
                          • {item.name} <Chip label={`${item.duration_days} j`} size="small" sx={{ ml: 0.5 }} />
                        </Typography>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Dialog open={openCategory} onClose={() => setOpenCategory(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouvelle catégorie</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nom" value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
          <TextField label="Description" multiline rows={2} value={newCategory.description} onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCategory(false)}>Annuler</Button>
          <Button variant="contained" onClick={createCategory} disabled={!newCategory.name}>Créer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openTemplate} onClose={() => setOpenTemplate(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouveau template de pré-requis</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nom du template" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
          <TextField select label="Catégorie" value={templateForm.category_id} onChange={(e) => setTemplateForm({ ...templateForm, category_id: e.target.value })}>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField label="Description" value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
          <TextField
            label="Éléments du pré-requis (un par ligne)"
            multiline
            rows={5}
            value={templateForm.itemsText}
            onChange={(e) => setTemplateForm({ ...templateForm, itemsText: e.target.value })}
            placeholder={"Accès VPN\nCompte de test\nSchéma réseau"}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTemplate(false)}>Annuler</Button>
          <Button variant="contained" onClick={createTemplate} disabled={!templateForm.name || !templateForm.category_id}>Créer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openPhaseTemplate} onClose={() => setOpenPhaseTemplate(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouveau template de phases</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nom du template" value={phaseTemplateForm.name} onChange={(e) => setPhaseTemplateForm({ ...phaseTemplateForm, name: e.target.value })} />
          <TextField select label="Catégorie" value={phaseTemplateForm.category_id} onChange={(e) => setPhaseTemplateForm({ ...phaseTemplateForm, category_id: e.target.value })}>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField label="Description" value={phaseTemplateForm.description} onChange={(e) => setPhaseTemplateForm({ ...phaseTemplateForm, description: e.target.value })} />
          <TextField
            label="Phases (une par ligne, format: Nom | durée en jours)"
            multiline
            rows={5}
            value={phaseTemplateForm.itemsText}
            onChange={(e) => setPhaseTemplateForm({ ...phaseTemplateForm, itemsText: e.target.value })}
            placeholder={"Cadrage | 2\nTechnique | 5\nRestitution | 1"}
            helperText="La durée est optionnelle (1 jour par défaut). Les dates sont calculées automatiquement à partir de la date de début de l'audit."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPhaseTemplate(false)}>Annuler</Button>
          <Button variant="contained" onClick={createPhaseTemplate} disabled={!phaseTemplateForm.name || !phaseTemplateForm.category_id}>Créer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
