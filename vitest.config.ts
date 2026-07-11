import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Zero test files is a green run — foundation sessions land before features.
    passWithNoTests: true,
    globals: false,
    environment: "node",
    // Some suites cold-start Fastify or spawn git subprocesses; give them room.
    testTimeout: 20_000,
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.html"],
    },
  },
});
