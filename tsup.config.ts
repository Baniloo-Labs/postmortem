import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
  minify: false,
  // The single-file web dashboard is embedded into the binary at build time.
  // `import html from "./server/dashboard/index.html"` resolves to a string;
  // Fastify serves it from memory (spec.md §12). No dashboard file on disk at runtime.
  loader: {
    ".html": "text",
  },
  // CLI entry needs a shebang so `mort` is directly executable after npm install.
  banner: {
    js: "#!/usr/bin/env node",
  },
  // tsup externalizes package.json `dependencies` automatically (keeps
  // better-sqlite3's native binary and the React/Ink runtime out of the bundle).
});
