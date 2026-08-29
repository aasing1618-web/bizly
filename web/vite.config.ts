import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Application cliente — servie par Express à la racine `/`.
 *
 * En production, un seul processus sert l'API et ce bundle : d'où `outDir`
 * pointant directement dans `server/public/app`, et l'absence totale de CORS.
 * En développement, Vite tourne à part et relaie `/api` vers Express, ce qui
 * reproduit la même origine côté navigateur.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "/",
  build: {
    outDir: "../server/public/app",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
});
