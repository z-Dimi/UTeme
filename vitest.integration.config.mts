import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests: real Supabase (via .env.local), external APIs mocked. Run: npm run test:integration
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/integration/**/*.itest.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
});
