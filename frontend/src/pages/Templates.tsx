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
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Category, Template } from "../types";

export function Templates() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [openCategory, setOpenCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [openTemplate, setOpenTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", category_id: "", itemsText: "" });

  const load = () => {
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<Template[]>("/api/templates").then((r) => setTemplates(r.data));
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

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Catégories & templates de pré-requis</Typography>
        {isAdmin && (
          <Stack direction="row" spacing={1}>
            <Button startIcon={<AddIcon />} onClick={() => setOpenCategory(true)}>Catégorie</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenTemplate(true)} disabled={categories.length === 0}>
              Template
            </Button>
          </Stack>
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 3 }} flexWrap="wrap">
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} onDelete={isAdmin ? () => deleteCategory(c.id) : undefined} />
        ))}
      </Stack>

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
    </Box>
  );
}
