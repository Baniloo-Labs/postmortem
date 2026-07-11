import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, LockHeldError, readLock, releaseLock } from "../../src/core/lock.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mort-lock-"));
  path = join(dir, "postmortem.lock");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("lock", () => {
  it("acquires when no lock exists and writes our pid", () => {
    const info = acquireLock(6660, path);
    expect(info.pid).toBe(process.pid);
    expect(info.port).toBe(6660);
    expect(existsSync(path)).toBe(true);
    expect(readLock(path)?.pid).toBe(process.pid);
  });

  it("reclaims a stale lock from a dead process", () => {
    const deadPid = 2_147_483_646; // implausibly high; not a running process
    writeFileSync(
      path,
      JSON.stringify({ pid: deadPid, port: 6660, startedAt: new Date().toISOString() }),
    );
    const info = acquireLock(6660, path);
    expect(info.pid).toBe(process.pid);
  });

  it("throws for a live foreign holder", () => {
    const deadPid = 2_147_483_646;
    // Fake a live foreign holder by monkeypatching process.kill to report alive.
    const original = process.kill;
    (process as { kill: typeof process.kill }).kill = ((pid: number, signal?: unknown) => {
      if (pid === deadPid && signal === 0) return true;
      return original(pid, signal as never);
    }) as typeof process.kill;
    try {
      writeFileSync(
        path,
        JSON.stringify({ pid: deadPid, port: 6660, startedAt: new Date().toISOString() }),
      );
      expect(() => acquireLock(6660, path)).toThrow(LockHeldError);
    } finally {
      (process as { kill: typeof process.kill }).kill = original;
    }
  });

  it("releases only a lock we own", () => {
    acquireLock(6660, path);
    releaseLock(path);
    expect(existsSync(path)).toBe(false);
  });

  it("does not release a lock owned by another pid", () => {
    writeFileSync(
      path,
      JSON.stringify({ pid: 2_147_483_646, port: 6660, startedAt: new Date().toISOString() }),
    );
    releaseLock(path);
    expect(existsSync(path)).toBe(true);
  });
});
