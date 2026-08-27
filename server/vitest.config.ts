import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pas de globals : chaque test importe explicitement ce qu'il utilise.
    globals: false,
  },
});
