import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Zero test files is a green run — foundation sessions land before features.
    passWithNoTests: true,
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.html"],
    },
  },
});
