// Structured, file-only logger.
//
// CRITICAL: never write to the terminal here. `console.log` while the Ink UI is
// mounted corrupts the render. All diagnostics go to `~/.postmortem/logs/` as
// JSON lines. Logging must never crash the daemon, so every write is best-effort
// and swallows its own errors.

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logsDir } from "./paths.js";
import { redact } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

interface LogRecord {
  ts: string;
  level: LogLevel;
  scope: string;
  msg: string;
  [key: string]: unknown;
}

function currentLogFile(): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(logsDir(), `postmortem-${day}.log`);
}

let dirReady = false;
async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(logsDir(), { recursive: true });
  dirReady = true;
}

// Minimum level to persist. DEBUG stays off unless explicitly enabled.
let minLevel: LogLevel =
  process.env.POSTMORTEM_LOG_LEVEL && process.env.POSTMORTEM_LOG_LEVEL in LEVEL_ORDER
    ? (process.env.POSTMORTEM_LOG_LEVEL as LogLevel)
    : "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

async function write(
  level: LogLevel,
  scope: string,
  msg: string,
  fields?: Record<string, unknown>,
): Promise<void> {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    scope,
    // Redact defensively — a caller may log an event's raw text or an error
    // that embedded a token. The logger is the last line before disk.
    msg: redact(msg),
    ...redactFields(fields),
  };
  try {
    await ensureDir();
    await appendFile(currentLogFile(), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Best-effort: a failed log write must never propagate into the daemon.
  }
}

function redactFields(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = typeof v === "string" ? redact(v) : v;
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

/**
 * Create a logger bound to a scope (usually a module or sensor name).
 * Calls are fire-and-forget — the returned methods don't block the caller.
 */
export function createLogger(scope: string): Logger {
  return {
    debug: (msg, fields) => void write("debug", scope, msg, fields),
    info: (msg, fields) => void write("info", scope, msg, fields),
    warn: (msg, fields) => void write("warn", scope, msg, fields),
    error: (msg, fields) => void write("error", scope, msg, fields),
  };
}
