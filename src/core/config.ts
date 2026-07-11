// Configuration: load `~/.postmortem/config.toml`, validate with Zod, fill
// defaults. A token-bearing config file is written 0600 (owner-only). Secrets
// prefer env vars — the file is a fallback, never the recommended home for a key.
//
// v1.0 sensor set: git, logfile, vercel, github-actions, health-check, webhook.
// Netlify's config block arrives with its sensor in v1.1 (via /add-sensor).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { z } from "zod";
import { configFile, expandTilde, reportsDir } from "./paths.js";

// ─── Schema ─────────────────────────────────────────────────────────────────

const BrainConfig = z
  .object({
    backend: z
      .enum(["auto", "claude-cli", "anthropic-api", "openai-api", "ollama"])
      .default("auto"),
    model: z.string().default("claude-sonnet-4-6"),
    anthropic_api_key: z.string().optional(),
    openai_api_key: z.string().optional(),
    ollama: z
      .object({
        host: z.url().default("http://localhost:11434"),
        model: z.string().default("llama3"),
      })
      .prefault({}),
  })
  .prefault({});

const pollInterval = (fallback: number) => z.number().int().positive().default(fallback);

const SensorsConfig = z
  .object({
    git: z
      .object({
        enabled: z.boolean().default(true),
        repo_path: z.string().default("."),
        poll_interval_seconds: pollInterval(5),
      })
      .prefault({}),
    logfile: z
      .object({
        enabled: z.boolean().default(false),
        paths: z.array(z.string()).default([]),
        patterns: z.array(z.string()).default(["ERROR", "FATAL", "Exception"]),
      })
      .prefault({}),
    vercel: z
      .object({
        enabled: z.boolean().default(false),
        token: z.string().default(""),
        team_id: z.string().default(""),
        project_ids: z.array(z.string()).default([]),
        poll_interval_seconds: pollInterval(30),
      })
      .prefault({}),
    "github-actions": z
      .object({
        enabled: z.boolean().default(false),
        token: z.string().default(""),
        repos: z.array(z.string()).default([]),
        poll_interval_seconds: pollInterval(60),
      })
      .prefault({}),
    "health-check": z
      .object({
        enabled: z.boolean().default(false),
        endpoints: z.array(z.string()).default([]),
        interval_seconds: pollInterval(30),
        timeout_seconds: pollInterval(5),
      })
      .prefault({}),
    webhook: z
      .object({
        enabled: z.boolean().default(false),
        // No port: webhooks arrive on the single Fastify server (127.0.0.1:6660).
        secret: z.string().default(""),
      })
      .prefault({}),
  })
  .prefault({});

export const Config = z
  .object({
    brain: BrainConfig,
    output: z
      .object({
        // Defaults resolved lazily via reportsDirFor() so POSTMORTEM_HOME applies.
        reports_dir: z.string().optional(),
        webhook_url: z.url().optional(),
      })
      .prefault({}),
    storage: z
      .object({
        retention_days: z.number().int().positive().default(30),
      })
      .prefault({}),
    sensors: SensorsConfig,
  })
  .prefault({});

export type Config = z.infer<typeof Config>;

// ─── Load / write ───────────────────────────────────────────────────────────

/** The fully-defaulted config (as if the file were empty). */
export function defaultConfig(): Config {
  return Config.parse({});
}

/**
 * Load and validate config. A missing file yields defaults (postmortem works
 * before `mort setup` runs). A malformed or invalid file throws with detail.
 */
export function loadConfig(path: string = configFile()): Config {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw err;
  }
  const parsed = parseToml(text);
  return Config.parse(parsed);
}

/** Serialize and write config as TOML, owner-only (0600). Creates the dir. */
export function writeConfig(config: Config, path: string = configFile()): void {
  const validated = Config.parse(config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyToml(stripUndefined(validated)), { mode: 0o600 });
}

/** Resolve the reports directory, honoring config, ~ expansion, POSTMORTEM_HOME. */
export function reportsDirFor(config: Config): string {
  const configured = config.output.reports_dir;
  return configured ? expandTilde(configured) : reportsDir();
}

// smol-toml rejects `undefined` values; drop them before serializing.
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}
