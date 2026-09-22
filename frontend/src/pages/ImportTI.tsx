/**
 * Import en masse des TI (tests d'intrusion / audits).
 *
 * Parcours en 4 étapes :
 *   1. Fichier      — dépôt du CSV/XLSX, analyse automatique
 *   2. Colonnes     — correspondance colonne du fichier -> champ de l'application,
 *                     et création des champs qui n'existent pas encore en base
 *   3. Détails manquants — saisie des informations des catégories / sociétés /
 *                     pilotes / étiquettes absents de la base
 *   4. Contrôle & import — aperçu des lignes, erreurs, doublons, puis validation
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { apiClient } from "../api/client";
import type {
  Category,
  CustomField,
  CustomFieldType,
  ImportAnalysis,
  ImportBatch,
  ImportMissingEntity,
  PrestationCompany,
  Tag,
  User,
} from "../types";

const STEPS = ["Fichier", "Colonnes", "Détails manquants", "Contrôle & import"];
const IGNORE = "__ignore__";

const ENTITY_LABELS: Record<ImportMissingEntity["entity"], string> = {
  category: "Catégorie",
  prestation_company: "Société de prestation",
  user: "Utilisateur (pilote / responsable)",
  tag: "Étiquette",
};

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "texte", label: "Texte court" },
  { value: "texte_long", label: "Texte long" },
  { value: "nombre", label: "Nombre" },
  { value: "date", label: "Date" },
  { value: "booleen", label: "Oui / Non" },
  { value: "liste", label: "Liste de valeurs" },
];

interface EntityDecision {
  action: "create" | "map" | "ignore";
  id?: string;
  details: Record<string, string>;
}

interface FieldDecision {
  create: boolean;
  label: string;
  field_type: CustomFieldType;
  show_in_list: boolean;
}

export function ImportTI() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [entities, setEntities] = useState<Record<string, EntityDecision>>({});
  const [fields, setFields] = useState<Record<string, FieldDecision>>({});
  const [options, setOptions] = useState<Record<string, string | boolean>>({
    duplicate_strategy: "ignorer",
    default_status: "planifie",
    default_priority: "moyenne",
    auto_template_by_category: true,
    user_email_domain: "import.local",
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<PrestationCompany[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const loadReferences = () => {
    apiClient.get<Category[]>("/api/categories").then((r) => setCategories(r.data));
    apiClient.get<PrestationCompany[]>("/api/prestation-companies").then((r) => setCompanies(r.data));
    apiClient.get<User[]>("/api/users").then((r) => setUsers(r.data));
    apiClient.get<Tag[]>("/api/tags").then((r) => setTags(r.data));
    apiClient.get<CustomField[]>("/api/custom-fields").then((r) => setCustomFields(r.data));
    apiClient.get<ImportBatch[]>("/api/imports").then((r) => setBatches(r.data));
  };

  useEffect(loadReferences, []);

  const existingOptions = (entity: ImportMissingEntity["entity"]) => {
    if (entity === "category") return categories.map((c) => ({ id: c.id, label: c.name }));
    if (entity === "prestation_company") return companies.map((c) => ({ id: c.id, label: c.name }));
    if (entity === "tag") return tags.map((t) => ({ id: t.id, label: t.name }));
    return users.map((u) => ({ id: u.id, label: `${u.full_name} (${u.email})` }));
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await apiClient.post<ImportAnalysis>("/api/imports", form);
      applyAnalysis(data);
      setStep(1);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  };

  const applyAnalysis = (data: ImportAnalysis) => {
    setAnalysis(data);
    setMapping(data.mapping);
    setFields((current) => {
      const next = { ...current };
      data.new_fields.forEach((column) => {
        if (!next[column.source]) {
          next[column.source] = {
            create: true,
            label: column.source,
            field_type: column.detected_type,
            show_in_list: false,
          };
        }
      });
      return next;
    });
    setEntities((current) => {
      const next = { ...current };
      data.missing_entities.forEach((missing) => {
        const key = `${missing.entity}::${missing.value}`;
        if (!next[key]) {
          next[key] = {
            action: missing.suggested_match ? "map" : "create",
            id: missing.suggested_match ?? undefined,
            details: missing.entity === "user" ? { role: "pilote_audit" } : {},
          };
        }
      });
      return next;
    });
  };

  const persist = async (goTo?: number) => {
    if (!analysis) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.patch<ImportAnalysis>(`/api/imports/${analysis.id}`, {
        mapping,
        entities: Object.fromEntries(
          Object.entries(entities).map(([key, decision]) => [
            key,
            { action: decision.action, id: decision.id, details: decision.details },
          ])
        ),
        new_fields: Object.fromEntries(
          Object.entries(fields).map(([source, decision]) => [
            source,
            {
              create: decision.create,
              label: decision.label,
              field_type: decision.field_type,
              show_in_list: decision.show_in_list,
            },
          ])
        ),
        options,
      });
      applyAnalysis(data);
      if (goTo !== undefined) setStep(goTo);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!analysis) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.patch(`/api/imports/${analysis.id}`, { mapping, options });
      const { data } = await apiClient.post(`/api/imports/${analysis.id}/commit`);
      const refreshed = await apiClient.get<ImportAnalysis>(`/api/imports/${analysis.id}`);
      setAnalysis({ ...refreshed.data, report: data });
      loadReferences();
      setStep(4);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  };

  const mappedTargets = useMemo(() => Object.values(mapping).filter((t) => t && t !== IGNORE), [mapping]);
  const nameMapped = mappedTargets.includes("name");

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Import en masse des TI
        </Typography>
        <Button
          startIcon={<DownloadIcon />}
          href="/api/imports/template.csv"
          onClick={async (event) => {
            event.preventDefault();
            const response = await apiClient.get("/api/imports/template.csv", { responseType: "blob" });
            const url = URL.createObjectURL(response.data as Blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "modele-import-ti.csv";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Modèle de fichier
        </Button>
      </Stack>

      <Stepper activeStep={Math.min(step, 3)} sx={{ mb: 3 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* --- Étape 1 : fichier ------------------------------------------- */}
      {step === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={7}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  Déposer le fichier des TI
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Formats acceptés : CSV (séparateur « ; » ou « , », encodage UTF-8 ou Windows-1252) et
                  Excel (.xlsx). La première ligne doit contenir les intitulés de colonnes.
                  5 000 lignes maximum par lot.
                </Typography>
                <Button variant="contained" component="label" startIcon={<UploadFileIcon />} disabled={busy}>
                  {busy ? "Analyse en cours…" : "Choisir un fichier"}
                  <input
                    hidden type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm"
                    onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                  />
                </Button>
                <Alert severity="info" sx={{ mt: 2 }}>
                  <AlertTitle>Ce que fait l'analyse</AlertTitle>
                  Les colonnes sont rapprochées automatiquement des champs de l'application. Les colonnes
                  inconnues peuvent être créées en base comme <strong>champs personnalisés</strong>, et les
                  catégories / sociétés / pilotes / étiquettes absents vous seront proposés à la création,
                  avec une page de saisie des détails manquants. <strong>Rien n'est écrit en base avant
                  l'étape finale.</strong>
                </Alert>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={5}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  Derniers imports
                </Typography>
                {batches.length === 0 && (
                  <Typography variant="body2" color="text.secondary">Aucun import pour le moment.</Typography>
                )}
                <Stack spacing={1}>
                  {batches.slice(0, 8).map((batch) => (
                    <Stack key={batch.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2">{batch.filename}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(batch.created_at).toLocaleString("fr-FR")} ·{" "}
                          {batch.report ? `${batch.report.created_audits} audit(s) créé(s)` : batch.status}
                        </Typography>
                      </Box>
                      {batch.status !== "importe" && (
                        <Button
                          size="small"
                          onClick={async () => {
                            const { data } = await apiClient.get<ImportAnalysis>(`/api/imports/${batch.id}`);
                            applyAnalysis(data);
                            setStep(1);
                          }}
                        >
                          Reprendre
                        </Button>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* --- Étape 2 : colonnes ------------------------------------------ */}
      {step === 1 && analysis && (
        <Box>
          <Alert severity={nameMapped ? "info" : "warning"} sx={{ mb: 2 }}>
            {nameMapped
              ? `${analysis.rows_count} ligne(s) lue(s) dans « ${analysis.filename} ». Vérifiez la correspondance des colonnes.`
              : "La colonne « Nom de l'audit » doit être associée pour pouvoir importer."}
          </Alert>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Colonne du fichier</TableCell>
                  <TableCell>Exemples</TableCell>
                  <TableCell>Remplissage</TableCell>
                  <TableCell sx={{ minWidth: 250 }}>Champ de l'application</TableCell>
                  <TableCell sx={{ minWidth: 280 }}>Champ personnalisé à créer</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {analysis.columns.map((column) => {
                  const target = mapping[column.source] ?? "";
                  const isCustom = !target || target === IGNORE || target.startsWith("custom:");
                  const decision = fields[column.source];
                  return (
                    <TableRow key={column.source} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{column.source}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          type détecté : {column.detected_type}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {column.sample_values.join(" · ") || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>{Math.round(column.filled_ratio * 100)} %</TableCell>
                      <TableCell>
                        <TextField
                          select size="small" fullWidth value={target}
                          onChange={(e) => setMapping({ ...mapping, [column.source]: e.target.value })}
                        >
                          <MenuItem value="">— Non associée —</MenuItem>
                          <MenuItem value={IGNORE}>Ignorer cette colonne</MenuItem>
                          {Object.entries(analysis.available_targets).map(([key, label]) => (
                            <MenuItem key={key} value={key}>{label}</MenuItem>
                          ))}
                          {customFields.length > 0 && <Divider />}
                          {customFields.map((field) => (
                            <MenuItem key={field.id} value={`custom:${field.key}`}>
                              Champ personnalisé : {field.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        {isCustom && target !== IGNORE && !target.startsWith("custom:") ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Switch
                              size="small"
                              checked={decision?.create ?? true}
                              onChange={(e) =>
                                setFields({
                                  ...fields,
                                  [column.source]: {
                                    create: e.target.checked,
                                    label: decision?.label ?? column.source,
                                    field_type: decision?.field_type ?? column.detected_type,
                                    show_in_list: decision?.show_in_list ?? false,
                                  },
                                })
                              }
                            />
                            <TextField
                              size="small" label="Libellé" value={decision?.label ?? column.source}
                              disabled={decision?.create === false}
                              onChange={(e) =>
                                setFields({
                                  ...fields,
                                  [column.source]: { ...(decision ?? { create: true, field_type: column.detected_type, show_in_list: false }), label: e.target.value },
                                })
                              }
                            />
                            <TextField
                              select size="small" label="Type" sx={{ minWidth: 120 }}
                              disabled={decision?.create === false}
                              value={decision?.field_type ?? column.detected_type}
                              onChange={(e) =>
                                setFields({
                                  ...fields,
                                  [column.source]: { ...(decision ?? { create: true, label: column.source, show_in_list: false }), field_type: e.target.value as CustomFieldType },
                                })
                              }
                            >
                              {FIELD_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                            </TextField>
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button onClick={() => setStep(0)}>Retour</Button>
            <Button variant="contained" disabled={!nameMapped || busy} onClick={() => persist(2)}>
              Continuer
            </Button>
          </Stack>
        </Box>
      )}

      {/* --- Étape 3 : détails manquants --------------------------------- */}
      {step === 2 && analysis && (
        <Box>
          {analysis.missing_entities.length === 0 ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Toutes les valeurs référencées par le fichier existent déjà en base : aucune saisie
              complémentaire n'est nécessaire.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <AlertTitle>{analysis.missing_entities.length} valeur(s) absente(s) de la base</AlertTitle>
              Pour chacune, choisissez de la <strong>créer</strong> (en complétant les informations
              manquantes), de la <strong>rattacher</strong> à un enregistrement existant, ou de
              l'<strong>ignorer</strong> (le champ restera vide sur les audits concernés).
            </Alert>
          )}

          <Stack spacing={2}>
            {analysis.missing_entities.map((missing) => {
              const key = `${missing.entity}::${missing.value}`;
              const decision = entities[key] ?? { action: "create" as const, details: {} };
              const update = (patch: Partial<EntityDecision>) =>
                setEntities({ ...entities, [key]: { ...decision, ...patch } });
              const updateDetail = (name: string, value: string) =>
                update({ details: { ...decision.details, [name]: value } });

              return (
                <Card key={key} variant="outlined">
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={ENTITY_LABELS[missing.entity]} color="primary" variant="outlined" />
                      <Typography variant="subtitle1" fontWeight={700}>{missing.value}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {missing.occurrences} ligne(s) concernée(s)
                      </Typography>
                      <Box sx={{ flexGrow: 1 }} />
                      <TextField
                        select size="small" label="Action" value={decision.action} sx={{ minWidth: 180 }}
                        onChange={(e) => update({ action: e.target.value as EntityDecision["action"] })}
                      >
                        <MenuItem value="create">Créer en base</MenuItem>
                        <MenuItem value="map">Rattacher à un existant</MenuItem>
                        <MenuItem value="ignore">Ignorer</MenuItem>
                      </TextField>
                    </Stack>

                    {decision.action === "map" && (
                      <TextField
                        select size="small" fullWidth label="Enregistrement existant"
                        value={decision.id ?? ""} onChange={(e) => update({ id: e.target.value })}
                        helperText={
                          missing.suggested_match_label
                            ? `Proposition automatique : ${missing.suggested_match_label}`
                            : undefined
                        }
                      >
                        {existingOptions(missing.entity).map((option) => (
                          <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                        ))}
                      </TextField>
                    )}

                    {decision.action === "create" && missing.entity === "category" && (
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={5}>
                          <TextField size="small" fullWidth label="Nom" value={decision.details.name ?? missing.value}
                            onChange={(e) => updateDetail("name", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField size="small" fullWidth label="Code" value={decision.details.code ?? ""}
                            onChange={(e) => updateDetail("code", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField size="small" fullWidth type="number" label="Durée type (jours)"
                            value={decision.details.default_duration_days ?? ""}
                            onChange={(e) => updateDetail("default_duration_days", e.target.value)} />
                        </Grid>
                        <Grid item xs={12}>
                          <TextField size="small" fullWidth label="Description" value={decision.details.description ?? ""}
                            onChange={(e) => updateDetail("description", e.target.value)} />
                        </Grid>
                      </Grid>
                    )}

                    {decision.action === "create" && missing.entity === "prestation_company" && (
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={4}>
                          <TextField size="small" fullWidth label="Nom" value={decision.details.name ?? missing.value}
                            onChange={(e) => updateDetail("name", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField size="small" fullWidth label="Contact (nom)" value={decision.details.contact_name ?? ""}
                            onChange={(e) => updateDetail("contact_name", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField size="small" fullWidth label="Contact (email)" value={decision.details.contact_email ?? ""}
                            onChange={(e) => updateDetail("contact_email", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField size="small" fullWidth label="Contact (téléphone)" value={decision.details.contact_phone ?? ""}
                            onChange={(e) => updateDetail("contact_phone", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField size="small" fullWidth type="number" label="Jours alloués"
                            value={decision.details.allocated_days ?? ""}
                            onChange={(e) => updateDetail("allocated_days", e.target.value)} />
                        </Grid>
                      </Grid>
                    )}

                    {decision.action === "create" && missing.entity === "user" && (
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={4}>
                          <TextField size="small" fullWidth label="Nom complet"
                            value={decision.details.full_name ?? missing.value}
                            onChange={(e) => updateDetail("full_name", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            size="small" fullWidth label="Email" value={decision.details.email ?? ""}
                            onChange={(e) => updateDetail("email", e.target.value)}
                            helperText="Laissé vide : une adresse technique est générée, le compte reste sans mot de passe."
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField select size="small" fullWidth label="Rôle"
                            value={decision.details.role ?? "pilote_audit"}
                            onChange={(e) => updateDetail("role", e.target.value)}>
                            <MenuItem value="pilote_audit">Pilote d'audit</MenuItem>
                            <MenuItem value="responsable_service">Responsable de service</MenuItem>
                            <MenuItem value="admin">Administrateur</MenuItem>
                          </TextField>
                        </Grid>
                      </Grid>
                    )}

                    {decision.action === "create" && missing.entity === "tag" && (
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <TextField size="small" fullWidth label="Nom" value={decision.details.name ?? missing.value}
                            onChange={(e) => updateDetail("name", e.target.value)} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField size="small" fullWidth label="Couleur (hex)" value={decision.details.color ?? ""}
                            placeholder="#1565c0" onChange={(e) => updateDetail("color", e.target.value)} />
                        </Grid>
                      </Grid>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button onClick={() => setStep(1)}>Retour</Button>
            <Button variant="contained" disabled={busy} onClick={() => persist(3)}>Continuer</Button>
          </Stack>
        </Box>
      )}

      {/* --- Étape 4 : contrôle et import -------------------------------- */}
      {step === 3 && analysis && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography variant="caption" color="text.secondary">Lignes lues</Typography>
                <Typography variant="h5" fontWeight={700}>{analysis.rows_count}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography variant="caption" color="text.secondary">Lignes en erreur</Typography>
                <Typography variant="h5" fontWeight={700} color={analysis.errors_count ? "error.main" : "inherit"}>
                  {analysis.errors_count}
                </Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography variant="caption" color="text.secondary">Doublons détectés</Typography>
                <Typography variant="h5" fontWeight={700}>{analysis.duplicates_count}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography variant="caption" color="text.secondary">Champs à créer</Typography>
                <Typography variant="h5" fontWeight={700}>
                  {Object.values(fields).filter((f) => f.create).length}
                </Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <TextField
                select size="small" label="En cas de doublon" sx={{ minWidth: 230 }}
                value={options.duplicate_strategy as string}
                onChange={(e) => setOptions({ ...options, duplicate_strategy: e.target.value })}
              >
                <MenuItem value="ignorer">Ignorer la ligne</MenuItem>
                <MenuItem value="mettre_a_jour">Mettre à jour l'audit existant</MenuItem>
                <MenuItem value="creer">Créer malgré tout</MenuItem>
              </TextField>
              <TextField
                select size="small" label="Statut par défaut" sx={{ minWidth: 190 }}
                value={options.default_status as string}
                onChange={(e) => setOptions({ ...options, default_status: e.target.value })}
              >
                {["brouillon", "planifie", "en_cours", "en_attente", "bloque", "termine", "annule"].map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </TextField>
              <TextField
                select size="small" label="Priorité par défaut" sx={{ minWidth: 190 }}
                value={options.default_priority as string}
                onChange={(e) => setOptions({ ...options, default_priority: e.target.value })}
              >
                {["basse", "moyenne", "haute", "critique"].map((p) => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </TextField>
              <TextField
                select size="small" label="Templates de la catégorie" sx={{ minWidth: 250 }}
                value={String(options.auto_template_by_category)}
                onChange={(e) => setOptions({ ...options, auto_template_by_category: e.target.value === "true" })}
              >
                <MenuItem value="true">Appliquer pré-requis et phases</MenuItem>
                <MenuItem value="false">Ne rien appliquer</MenuItem>
              </TextField>
            </Stack>
          </Paper>

          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 460 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>État</TableCell>
                  {(analysis.columns ?? []).map((c) => <TableCell key={c.source}>{c.source}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {analysis.rows_preview.map((row) => (
                  <TableRow key={row.index} hover sx={{ bgcolor: row.errors.length ? "rgba(179,38,30,0.06)" : undefined }}>
                    <TableCell>{row.index + 1}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.errors.length > 0 && (
                        <Tooltip title={row.errors.join(" · ")}>
                          <ErrorOutlineIcon fontSize="small" sx={{ color: "#b3261e" }} />
                        </Tooltip>
                      )}
                      {row.warnings.length > 0 && (
                        <Tooltip title={row.warnings.join(" · ")}>
                          <WarningAmberIcon fontSize="small" sx={{ color: "#a16207" }} />
                        </Tooltip>
                      )}
                      {row.duplicate_of && (
                        <Tooltip title={`Doublon : ${row.duplicate_of}`}>
                          <Chip size="small" label="doublon" sx={{ height: 18, fontSize: 10 }} />
                        </Tooltip>
                      )}
                      {row.errors.length === 0 && row.warnings.length === 0 && !row.duplicate_of && "✓"}
                    </TableCell>
                    {(analysis.columns ?? []).map((c) => (
                      <TableCell key={c.source} sx={{ maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.values[c.source] ?? ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {analysis.rows_count > analysis.rows_preview.length && (
            <Typography variant="caption" color="text.secondary">
              Aperçu limité aux {analysis.rows_preview.length} premières lignes ; l'import traitera les{" "}
              {analysis.rows_count} lignes.
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button onClick={() => setStep(2)}>Retour</Button>
            <Button variant="contained" color="primary" disabled={busy} onClick={commit}>
              {busy ? "Import en cours…" : `Importer ${analysis.rows_count - analysis.errors_count} audit(s)`}
            </Button>
          </Stack>
        </Box>
      )}

      {/* --- Résultat ---------------------------------------------------- */}
      {step === 4 && analysis?.report && (
        <Box>
          <Alert severity="success" sx={{ mb: 2 }}>
            <AlertTitle>Import terminé</AlertTitle>
            {analysis.report.created_audits} audit(s) créé(s), {analysis.report.updated_audits} mis à jour,{" "}
            {analysis.report.skipped_rows} ligne(s) ignorée(s), {analysis.report.created_fields} champ(s)
            personnalisé(s) créé(s).
          </Alert>
          {Object.entries(analysis.report.created_entities).length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Entités créées</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {Object.entries(analysis.report.created_entities).map(([entity, count]) => (
                  <Chip key={entity} label={`${ENTITY_LABELS[entity as ImportMissingEntity["entity"]] ?? entity} : ${count}`} />
                ))}
              </Stack>
            </Paper>
          )}
          {analysis.report.errors.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <AlertTitle>Lignes non importées</AlertTitle>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {analysis.report.errors.slice(0, 15).map((message) => <li key={message}>{message}</li>)}
              </ul>
            </Alert>
          )}
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={() => navigate("/audits")}>Voir les audits</Button>
            <Button
              onClick={() => {
                setAnalysis(null); setMapping({}); setEntities({}); setFields({}); setStep(0); loadReferences();
              }}
            >
              Nouvel import
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

function extractError(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => (d as { msg?: string }).msg ?? String(d)).join(" · ");
  return "Une erreur est survenue. Vérifiez le fichier et réessayez.";
}
