// Pure logfile parsing: classify a line's severity and split a read chunk into
// complete lines. No I/O — the sensor handles tailing and hands text here.

import { basename } from "node:path";
import type { EventSeverity, EventType } from "../../core/event.js";
import type { SensorEvent } from "../base.js";

export interface LineClass {
  type: Extract<EventType, "log.error" | "log.warning">;
  severity: EventSeverity;
}

/**
 * Classify a log line. Returns null if it matches none of the configured
 * patterns. Severity is inferred from the line's own keywords so a single
 * pattern list can still distinguish FATAL from WARN.
 */
export function classifyLine(line: string, patterns: string[]): LineClass | null {
  if (!patterns.some((p) => line.includes(p))) return null;
  const upper = line.toUpperCase();
  if (upper.includes("FATAL") || upper.includes("CRITICAL")) {
    return { type: "log.error", severity: "critical" };
  }
  if (upper.includes("ERROR") || upper.includes("EXCEPTION")) {
    return { type: "log.error", severity: "error" };
  }
  if (upper.includes("WARN")) {
    return { type: "log.warning", severity: "warning" };
  }
  // Matched a custom pattern with no known keyword — treat as an error.
  return { type: "log.error", severity: "error" };
}

export function lineToEvent(line: string, path: string, cls: LineClass): SensorEvent {
  const file = basename(path);
  return {
    source: "logfile",
    type: cls.type,
    severity: cls.severity,
    raw: line,
    summary: `logfile ${file} · ${line.trim().slice(0, 80)}`,
    metadata: {},
    payload: { file: path, line },
  };
}

/**
 * Split an accumulated buffer into complete lines plus a trailing remainder (an
 * incomplete last line held over until the next chunk arrives).
 */
export function splitLines(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split(/\r?\n/);
  const remainder = parts.pop() ?? "";
  return { lines: parts, remainder };
}
