// Single-instance lock. Two `mort watch` daemons must not fight over port 6660
// and the database, so the daemon acquires a PID/port lock in ~/.postmortem/
// before starting. A lock left behind by a crashed process (stale PID) is
// reclaimed automatically — we don't want a crash to wedge the tool.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { lockFile } from "./paths.js";

export interface LockInfo {
  pid: number;
  port: number;
  startedAt: string;
}

export class LockHeldError extends Error {
  readonly info: LockInfo;
  constructor(info: LockInfo) {
    super(
      `postmortem is already running (pid ${info.pid}, port ${info.port}, since ${info.startedAt}). ` +
        "Stop it first, or check the dashboard at http://localhost:6660",
    );
    this.name = "LockHeldError";
    this.info = info;
  }
}

/** Is a process with this pid currently alive? EPERM means alive-but-not-ours. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Read the current lock, or null if absent/unreadable. */
export function readLock(path: string = lockFile()): LockInfo | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as LockInfo;
    if (typeof parsed.pid === "number" && typeof parsed.port === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Acquire the single-instance lock. Throws LockHeldError if another live
 * postmortem holds it; reclaims a stale lock from a dead process.
 */
export function acquireLock(port: number, path: string = lockFile()): LockInfo {
  const existing = readLock(path);
  if (existing && existing.pid !== process.pid && isAlive(existing.pid)) {
    throw new LockHeldError(existing);
  }
  const info: LockInfo = { pid: process.pid, port, startedAt: new Date().toISOString() };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(info), { mode: 0o600 });
  return info;
}

/** Release the lock, but only if we own it. Safe to call unconditionally. */
export function releaseLock(path: string = lockFile()): void {
  const existing = readLock(path);
  if (existing && existing.pid === process.pid) {
    try {
      rmSync(path);
    } catch {
      // Already gone — nothing to do.
    }
  }
}
