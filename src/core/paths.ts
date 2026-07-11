// Central filesystem layout for postmortem. Every module that touches disk
// resolves paths through here — never hand-rolls `~/.postmortem`.
//
// POSTMORTEM_HOME overrides the root dir. Production never sets it; tests point
// it at a temp dir so they never touch a real user's config or database.

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** Expand a leading `~` to the user's home directory. */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

/** The postmortem root — `~/.postmortem` unless overridden by POSTMORTEM_HOME. */
export function rootDir(): string {
  const override = process.env.POSTMORTEM_HOME;
  if (override && override.length > 0) {
    return isAbsolute(override) ? override : resolve(override);
  }
  return join(homedir(), ".postmortem");
}

export function configFile(): string {
  return join(rootDir(), "config.toml");
}

export function dbFile(): string {
  return join(rootDir(), "postmortem.db");
}

export function logsDir(): string {
  return join(rootDir(), "logs");
}

export function reportsDir(): string {
  return join(rootDir(), "reports");
}

export function lockFile(): string {
  return join(rootDir(), "postmortem.lock");
}
