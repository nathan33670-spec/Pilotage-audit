import { createTheme } from "@mui/material/styles";
import { frFR } from "@mui/material/locale";

export const theme = createTheme(
  {
    palette: {
      mode: "light",
      primary: { main: "#1565c0" },
      secondary: { main: "#00897b" },
      background: { default: "#f4f6f8" },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 600 } } },
    },
  },
  frFR
);

// Codes couleur utilisés dans les vues de planification (statut / priorité)
export const PRIORITY_COLORS: Record<string, string> = {
  basse: "#4caf50",
  moyenne: "#2196f3",
  haute: "#ff9800",
  critique: "#e53935",
};

export const STATUS_COLORS: Record<string, string> = {
  brouillon: "#9e9e9e",
  planifie: "#42a5f5",
  en_cours: "#7e57c2",
  en_attente: "#ffb300",
  bloque: "#e53935",
  termine: "#43a047",
  annule: "#616161",
};

// Palette catégorielle des graphiques (ordre fixe, jamais recyclé).
// Validée pour la vision des couleurs (deutan/protan/tritan) sur fond clair.
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
export const SERIES_LABELS = { planned: "Planifié", actual: "Réel", other: "Autre" };

// Encres de texte : les valeurs et libellés ne portent jamais la couleur de série.
export const CHART_INK = {
  primary: "#1a1a19",
  secondary: "#52514e",
  muted: "#8a8983",
  grid: "#e3e5e8",
  surface: "#ffffff",
};

export const PHASE_STATUS_COLORS: Record<string, string> = {
  planifie: "#90a4ae",
  confirme: "#43a047",
  en_cours: "#7e57c2",
  termine: "#1565c0",
  annule: "#bdbdbd",
};
