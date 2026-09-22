/**
 * Documentation intégrée à l'application (aide en ligne).
 * Le référentiel complet se trouve dans le dossier `docs/` du dépôt ;
 * cette page en reprend l'essentiel pour les utilisateurs finaux.
 */
import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Divider,
  Link,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

interface Section {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  content: JSX.Element;
}

const ROLES = [
  ["admin", "Administration complète : utilisateurs, catégories, étiquettes, kanban, champs personnalisés, sociétés, templates, tous les audits."],
  ["pilote_audit", "Crée et modifie les audits, phases, pré-requis, documents ; réalise les imports en masse."],
  ["responsable_service", "Consulte les audits de son périmètre, coche les pré-requis, suit l'avancement."],
];

const IMPORT_COLUMNS = [
  ["Référence / identifiant TI", "reference", "Sert de clé de détection des doublons (ex. TI-2026-001)."],
  ["Nom de l'audit", "name", "Obligatoire. Une ligne sans nom est rejetée."],
  ["Catégorie", "category", "Rapprochée des catégories existantes ; créable pendant l'import."],
  ["Étiquettes", "tags", "Plusieurs valeurs séparées par ; , / ou |."],
  ["Priorité", "priority", "basse / moyenne / haute / critique (synonymes reconnus : P1…P4, low, high…)."],
  ["Statut", "status", "brouillon, planifié, en cours, en attente, bloqué, terminé, annulé."],
  ["Pilote d'audit", "pilot", "Rapproché des comptes existants ; créable pendant l'import."],
  ["Responsable de service", "service_owner", "Idem pilote."],
  ["Société de prestation", "prestation_company", "Créable pendant l'import (contact, jours alloués)."],
  ["Début / fin prévus", "planned_start / planned_end", "Formats acceptés : AAAA-MM-JJ, JJ/MM/AAAA, JJ-MM-AAAA…"],
  ["Début / fin réels", "actual_start / actual_end", "Base du calcul des temps réels dans les tableaux de bord."],
  ["Charge estimée", "estimated_days", "Nombre de jours (virgule ou point décimal)."],
];

const SECTIONS: Section[] = [
  {
    id: "demarrage",
    title: "1. Prise en main",
    summary: "Rôles, premiers pas, organisation des menus.",
    keywords: ["role", "connexion", "menu", "demarrage", "admin"],
    content: (
      <Box>
        <Typography paragraph>
          L'application couvre le <strong>pilotage</strong> des audits / tests d'intrusion : planification,
          charge des auditeurs et prestataires, pré-requis, documents et suivi d'avancement. Elle ne
          stocke volontairement <strong>ni les résultats d'audit ni les vulnérabilités</strong>.
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>Rôle</TableCell><TableCell>Droits</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {ROLES.map(([role, rights]) => (
                <TableRow key={role}>
                  <TableCell><code>{role}</code></TableCell>
                  <TableCell>{rights}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="subtitle2" gutterBottom>Parcours type d'un nouvel environnement</Typography>
        <List dense>
          <ListItem><ListItemText primary="1. Créer les catégories d'audit et les étiquettes (Administration)." /></ListItem>
          <ListItem><ListItemText primary="2. Adapter les colonnes du kanban au workflow de l'équipe." /></ListItem>
          <ListItem><ListItemText primary="3. Déclarer les sociétés de prestation et leurs jours alloués." /></ListItem>
          <ListItem><ListItemText primary="4. Créer les templates de pré-requis et de phases par catégorie." /></ListItem>
          <ListItem><ListItemText primary="5. Importer le portefeuille de TI existant (Import en masse)." /></ListItem>
          <ListItem><ListItemText primary="6. Planifier : kanban, planning multi-échelles, plan de charge." /></ListItem>
        </List>
      </Box>
    ),
  },
  {
    id: "categorisation",
    title: "2. Catégoriser les audits",
    summary: "Catégorie principale, étiquettes transverses, champs personnalisés.",
    keywords: ["categorie", "tag", "etiquette", "champ", "classement"],
    content: (
      <Box>
        <Typography paragraph>Trois niveaux de classement coexistent :</Typography>
        <List dense>
          <ListItem>
            <ListItemText
              primary="Catégorie (une seule par audit)"
              secondary="Axe principal : type de TI (applicatif externe, infrastructure, red team…). Elle porte les templates de pré-requis et de phases, une couleur, un code et une durée type. Gérée dans Administration → Catégories d'audit."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Étiquettes (plusieurs par audit)"
              secondary="Classement transverse : exigence réglementaire, périmètre, entité, exposition… Gérées dans Administration → Étiquettes, filtrables dans le kanban, le planning et les tableaux de bord."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Champs personnalisés"
              secondary="Données propres à votre organisation (application concernée, numéro de lot, contrat…). Créés dans Administration → Champs personnalisés, ou automatiquement lors d'un import."
            />
          </ListItem>
        </List>
        <Alert severity="info">
          Les filtres par catégorie et par étiquette sont disponibles sur la liste des audits, le kanban,
          le planning et tous les tableaux de bord.
        </Alert>
      </Box>
    ),
  },
  {
    id: "kanban",
    title: "3. Kanban configurable",
    summary: "Colonnes, couleurs, limites d'en-cours, affichage des cartes.",
    keywords: ["kanban", "colonne", "wip", "glisser", "workflow"],
    content: (
      <Box>
        <Typography paragraph>
          Le tableau kanban est entièrement piloté depuis <strong>Administration → Kanban</strong>. Aucune
          modification de code n'est nécessaire pour faire évoluer le workflow.
        </Typography>
        <List dense>
          <ListItem><ListItemText primary="Créer, renommer, recolorer, réordonner et masquer les colonnes." /></ListItem>
          <ListItem><ListItemText primary="Limite d'en-cours (WIP) par colonne : le dépassement est signalé sur le tableau." /></ListItem>
          <ListItem><ListItemText primary="Statut appliqué automatiquement quand une carte arrive dans la colonne (ou aucun, pour une colonne purement organisationnelle)." /></ListItem>
          <ListItem><ListItemText primary="Suppression sûre : les audits d'une colonne supprimée sont déplacés vers la colonne de votre choix, jamais perdus." /></ListItem>
          <ListItem><ListItemText primary="Affichage des cartes : champs visibles (catégorie, étiquettes, pilote, prestataire, dates, priorité), source de la couleur, activation du glisser-déposer." /></ListItem>
        </List>
        <Alert severity="info">
          Le déplacement d'une carte est aussi possible sans souris grâce au sélecteur de colonne présent
          au bas de chaque carte.
        </Alert>
      </Box>
    ),
  },
  {
    id: "planning",
    title: "4. Planning multi-échelles",
    summary: "Jour, semaine, mois, trimestre, année, cycle de 3 ans, vue glissante, sélection d'audits.",
    keywords: ["planning", "gantt", "echelle", "cycle", "glissant", "selection"],
    content: (
      <Box>
        <Typography paragraph>
          L'onglet <strong>Planification → Planning (échelles)</strong> s'adapte à l'horizon d'analyse :
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {["Jour", "Semaine", "Mois", "Trimestre", "Année", "Cycle 3 ans"].map((scale) => (
            <Chip key={scale} label={scale} size="small" />
          ))}
        </Stack>
        <List dense>
          <ListItem>
            <ListItemText
              primary="Nombre de périodes"
              secondary="Détermine la largeur de la fenêtre (ex. 14 jours, 12 mois, 3 ans)."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Vue glissante"
              secondary="Activée, la fenêtre démarre exactement à la date d'ancrage ; désactivée, elle est alignée sur le début de la période (mois, trimestre, année, cycle)."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Sélection d'audits"
              secondary="Le champ « Sélection d'audits » limite le planning à un sous-ensemble choisi ; les filtres catégorie, étiquette, pilote, auditeur et prestataire se combinent."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Regroupement"
              secondary="Par audit, catégorie, pilote, société de prestation ou auditeur."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Planifié vs réalisé"
              secondary="La barre pleine représente le planifié, la barre hachurée le réalisé. Les phases non confirmées sont en pointillés."
            />
          </ListItem>
        </List>
      </Box>
    ),
  },
  {
    id: "import",
    title: "5. Import en masse des TI",
    summary: "Fichier, correspondance des colonnes, détails manquants, contrôle et import.",
    keywords: ["import", "csv", "xlsx", "masse", "colonne", "doublon"],
    content: (
      <Box>
        <Typography paragraph>
          <strong>Import en masse</strong> charge un portefeuille de TI depuis un fichier CSV ou Excel.
          Rien n'est écrit en base avant l'étape finale.
        </Typography>
        <List dense>
          <ListItem><ListItemText primary="Étape 1 — Fichier" secondary="CSV (; ou ,, UTF-8 ou Windows-1252) ou .xlsx, première ligne = en-têtes, 5 000 lignes maximum par lot. Un modèle est téléchargeable depuis la page." /></ListItem>
          <ListItem><ListItemText primary="Étape 2 — Colonnes" secondary="Les intitulés sont rapprochés automatiquement des champs de l'application. Les colonnes inconnues peuvent être créées comme champs personnalisés (libellé et type modifiables), ou ignorées." /></ListItem>
          <ListItem><ListItemText primary="Étape 3 — Détails manquants" secondary="Chaque catégorie, société, pilote ou étiquette absente de la base est listée : créez-la en complétant ses informations, rattachez-la à un enregistrement existant, ou ignorez-la." /></ListItem>
          <ListItem><ListItemText primary="Étape 4 — Contrôle & import" secondary="Aperçu des lignes avec erreurs, avertissements et doublons ; choix de la stratégie de doublon (ignorer, mettre à jour, créer) et des valeurs par défaut. Un rapport détaillé est conservé." /></ListItem>
        </List>
        <Typography variant="subtitle2" sx={{ mt: 2 }} gutterBottom>Colonnes reconnues automatiquement</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Champ</TableCell><TableCell>Clé</TableCell><TableCell>Remarques</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {IMPORT_COLUMNS.map(([label, key, note]) => (
                <TableRow key={key}>
                  <TableCell>{label}</TableCell>
                  <TableCell><code>{key}</code></TableCell>
                  <TableCell>{note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Alert severity="warning" sx={{ mt: 2 }}>
          Les comptes utilisateurs créés pendant un import n'ont pas de mot de passe : un administrateur
          doit en définir un avant toute connexion.
        </Alert>
      </Box>
    ),
  },
  {
    id: "statistiques",
    title: "6. Tableaux de bord",
    summary: "Volumétrie, temps réels, écarts au planning, export CSV.",
    keywords: ["statistique", "dashboard", "duree", "temps reel", "export"],
    content: (
      <Box>
        <Typography paragraph>
          Les tableaux de bord reposent sur deux notions de durée, exprimées en jours calendaires :
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText
              primary="Durée planifiée"
              secondary="Dates prévues de l'audit, ou à défaut l'enveloppe des dates prévues de ses phases."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Durée réelle"
              secondary="Dates réelles saisies sur l'audit, ou à défaut l'enveloppe des dates réelles de ses phases. Sans dates réelles, l'audit ne compte pas dans les moyennes de durée réelle."
            />
          </ListItem>
        </List>
        <Typography paragraph>
          L'onglet <strong>Synthèse</strong> donne la volumétrie (par statut, catégorie, priorité,
          prestataire, pilote, étiquette) et l'activité dans le temps (démarrés, terminés, encours).
          L'onglet <strong>Temps réels</strong> compare planifié et réel par axe d'analyse, et affiche
          la distribution des durées. L'onglet <strong>Détail par audit</strong> liste chaque audit avec
          son écart ; l'export CSV reprend ces colonnes.
        </Typography>
        <Alert severity="info">
          Pour que les statistiques de temps réel soient exploitables, renseignez les dates réelles des
          audits (ou de leurs phases) à leur clôture.
        </Alert>
      </Box>
    ),
  },
  {
    id: "exploitation",
    title: "7. Exploitation & dimensionnement",
    summary: "Déploiement, sauvegardes, volumétrie supportée.",
    keywords: ["docker", "sauvegarde", "dimensionnement", "performance", "volumetrie"],
    content: (
      <Box>
        <Typography paragraph>
          Déploiement par Docker Compose (3 services : base PostgreSQL, API FastAPI, frontend nginx).
          Les documents sont stockés dans le volume <code>uploads_data</code>, la base dans{" "}
          <code>db_data</code> : ce sont les deux éléments à sauvegarder.
        </Typography>
        <Typography paragraph>
          Le dimensionnement de référence (jusqu'à ~5 000 audits, ~25 000 phases, une vingtaine
          d'utilisateurs simultanés) est documenté en détail dans le fichier{" "}
          <code>docs/dimensionnement.md</code> du dépôt, avec les seuils au-delà desquels des évolutions
          sont recommandées.
        </Typography>
      </Box>
    ),
  },
];

export function Documentation() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visible = SECTIONS.filter(
    (section) =>
      !normalized ||
      section.title.toLowerCase().includes(normalized) ||
      section.summary.toLowerCase().includes(normalized) ||
      section.keywords.some((k) => k.includes(normalized))
  );

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        Documentation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Guide d'utilisation de l'application. La documentation technique complète (architecture, API,
        modèle de données, exploitation, dimensionnement) se trouve dans le dossier <code>docs/</code>{" "}
        du dépôt, et la référence interactive de l'API sur{" "}
        <Link href="/api/docs" target="_blank" rel="noreferrer">/api/docs</Link>.
      </Typography>

      <TextField
        size="small" fullWidth placeholder="Rechercher dans la documentation…"
        value={query} onChange={(e) => setQuery(e.target.value)} sx={{ mb: 2, maxWidth: 420 }}
      />

      {visible.length === 0 && (
        <Typography color="text.secondary">Aucune rubrique ne correspond à « {query} ».</Typography>
      )}

      {visible.map((section) => (
        <Accordion key={section.id} defaultExpanded={section.id === "demarrage"} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>{section.title}</Typography>
              <Typography variant="caption" color="text.secondary">{section.summary}</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Divider sx={{ mb: 2 }} />
            {section.content}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
