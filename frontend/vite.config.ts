import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
const env = loadEnv(mode, ".", "");
const apiTarget = env.VITE_API_TARGET || "http://localhost:8000";

return {
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // En développement, l'API est relayée vers le backend local ;
    // en production, c'est nginx qui joue ce rôle (voir nginx.conf).
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Sépare les dépendances lourdes du code applicatif : le bundle vendor
        // reste en cache navigateur entre deux livraisons de l'application.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          mui: ["@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
        },
      },
    },
  },
};
});
