// `mort config show` — print the resolved config with secrets masked.
// `mort config path` — print the config file location.
// (Editing via `config set` is a v1.1 item; the TOML file is hand-editable.)

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { Config, loadConfig, writeConfig } from "../core/config.js";
import { configFile } from "../core/paths.js";
import { SKULL, SKULL_GLYPH } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { println } from "./util.js";

export function configCommand(action = "show"): void {
  const path = configFile();

  if (action === "path") {
    println(path);
    return;
  }

  if (!existsSync(path)) {
    println(theme.muted(`no config file at ${path}`));
    println(
      theme.muted(
        `run ${theme.primary("mort setup")} to create one (defaults are used until then)`,
      ),
    );
    return;
  }

  println(`${SKULL.header}${theme.muted(`  ${path}`)}`);
  println();
  println(maskSecrets(readFileSync(path, "utf8").trimEnd()));
}

/** Replace secret values in TOML with *** so `config show` is safe to paste. */
export function maskSecrets(toml: string): string {
  return toml.replace(
    /((?:token|secret|api_key|password)\s*=\s*)"([^"]+)"/gi,
    (_match, keyPart: string) => `${keyPart}"***"`,
  );
}

// ─── config set ─────────────────────────────────────────────────────────────

// Coerce a CLI string: JSON-parse (so true/30/["a"] become typed), else string.
function coerceValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function setPath(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i] as string;
    if (typeof cursor[k] !== "object" || cursor[k] === null) cursor[k] = {};
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = value;
}

function getPath(obj: unknown, keys: string[]): unknown {
  let cursor: unknown = obj;
  for (const k of keys) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[k];
  }
  return cursor;
}

/**
 * Apply a `key = value` change to a config. Pure: coerces the value, sets it at
 * the dotted path, and re-validates the whole config through Zod. Returns
 * `applied: false` when the key isn't a real config key (Zod strips it).
 * Throws (ZodError) when the value is the wrong type for a known key.
 */
export function applyConfigSet(
  base: Config,
  key: string,
  raw: string,
): { config: Config; applied: boolean } {
  const keys = key.split(".").filter(Boolean);
  if (keys.length === 0) throw new Error("empty key");
  const value = coerceValue(raw);

  const draft = structuredClone(base) as Record<string, unknown>;
  setPath(draft, keys, value);
  const config = Config.parse(draft);

  const applied = JSON.stringify(getPath(config, keys)) === JSON.stringify(value);
  return { config, applied };
}

const SECRET_KEY = /token|secret|api_key|password/i;

export function configSetCommand(key: string, value: string): number {
  let result: { config: Config; applied: boolean };
  try {
    result = applyConfigSet(loadConfig(), key, value);
  } catch (err) {
    const detail =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join("; ")
        : (err as Error).message;
    println(theme.error(`invalid value for ${key}: ${detail}`));
    return 1;
  }
  if (!result.applied) {
    println(theme.error(`unknown config key: ${key}`));
    return 1;
  }
  writeConfig(result.config);
  const shown = SECRET_KEY.test(key) ? "***" : value;
  println(`${theme.primary(SKULL_GLYPH)} set ${theme.label(key)} = ${shown}`);
  return 0;
}
