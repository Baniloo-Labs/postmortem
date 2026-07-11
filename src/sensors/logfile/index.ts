// Logfile sensor — a cross-platform `tail -f`. Watches configured files via
// chokidar, reads only bytes appended since the last read (so history isn't
// replayed on startup), and emits an event per line that matches a pattern.

import { open, stat } from "node:fs/promises";
import chokidar, { type FSWatcher } from "chokidar";
import { createLogger } from "../../core/logger.js";
import { BaseSensor, type SensorHealthResult } from "../base.js";
import { classifyLine, lineToEvent, splitLines } from "./parser.js";

const log = createLogger("sensor:logfile");
const DEFAULT_PATTERNS = ["ERROR", "FATAL", "Exception"];

export class LogfileSensor extends BaseSensor {
  readonly name = "logfile";
  readonly displayName = "Log Files";

  private watcher: FSWatcher | null = null;
  private paths: string[] = [];
  private patterns: string[] = DEFAULT_PATTERNS;
  private readonly positions = new Map<string, number>();
  private readonly remainders = new Map<string, string>();

  async start(config: Record<string, unknown>): Promise<void> {
    this.paths = Array.isArray(config.paths)
      ? config.paths.filter((p): p is string => typeof p === "string")
      : [];
    this.patterns =
      Array.isArray(config.patterns) && config.patterns.length > 0
        ? config.patterns.filter((p): p is string => typeof p === "string")
        : DEFAULT_PATTERNS;

    // Seed each file's read position to its current end — start tailing from now.
    for (const path of this.paths) {
      this.positions.set(path, await fileSize(path));
      this.remainders.set(path, "");
    }

    this.watcher = chokidar.watch(this.paths, {
      ignoreInitial: true,
      ignorePermissionErrors: true,
    });
    this.watcher.on("change", (path) => void this.pump(path));
    this.watcher.on("add", (path) => void this.pump(path));
    log.info(`tailing ${this.paths.length} file(s)`);
  }

  /** Read newly-appended content from a file and emit matching lines. Public so
   *  tests can drive it without waiting on filesystem events. */
  async pump(path: string): Promise<void> {
    try {
      const size = await fileSize(path);
      let from = this.positions.get(path) ?? 0;
      if (size < from) from = 0; // file was truncated or rotated — start over
      if (size === from) return;

      const chunk = await readRange(path, from, size);
      this.positions.set(path, size);

      const buffer = (this.remainders.get(path) ?? "") + chunk;
      const { lines, remainder } = splitLines(buffer);
      this.remainders.set(path, remainder);

      for (const line of lines) {
        if (!line.trim()) continue;
        const cls = classifyLine(line, this.patterns);
        if (cls) this.emit(lineToEvent(line, path, cls));
      }
    } catch (err) {
      log.error("logfile pump failed", { path, error: String(err) });
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  async healthCheck(): Promise<SensorHealthResult> {
    if (this.paths.length === 0) {
      return { healthy: false, message: "no log paths configured" };
    }
    const missing: string[] = [];
    for (const path of this.paths) {
      if (!(await exists(path))) missing.push(path);
    }
    return missing.length > 0
      ? { healthy: false, message: `missing: ${missing.join(", ")}` }
      : { healthy: true, message: `tailing ${this.paths.length} file(s)` };
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function readRange(path: string, from: number, to: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const length = to - from;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, from);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
