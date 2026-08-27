import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Dashboard admin — servi par Express sous `/admin/`.
 *
 * Bundle SÉPARÉ de l'application cliente, et non une route de celle-ci : le
 * code de l'admin ne doit jamais être téléchargé par un utilisateur client.
 * `base` doit rester `/admin/`, sinon les URL d'assets générées par Vite
 * pointeraient à la racine et entreraient en collision avec l'app cliente.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/admin/",
  build: {
    outDir: "../server/public/admin",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
});
