// Mirrors apps/dashboard/vitest.config.ts. This phase's pure functions
// (lib/glow.ts, lib/validation.ts, lib/mappers.ts) have no React Native
// imports, so a plain Node test environment is enough -- no jest-expo /
// RN renderer needed for this phase's coverage.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
