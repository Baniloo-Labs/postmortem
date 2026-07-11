// Pure correlation logic — decides when a cluster of events warrants a brain
// analysis. Keeping this pure makes the "when do we spend tokens" policy testable
// without a bus, a clock, or a model.

import type { EventSeverity } from "../core/event.js";

export const DEFAULT_WINDOW_MS = 5 * 60_000; // 5 minutes
export const DEFAULT_DEBOUNCE_MS = 2_000; // batch a burst into one incident

interface Timed {
  severity: EventSeverity;
  timestamp: string;
}

/** Only error/critical events are correlation-worthy. */
export function isSignificant(severity: EventSeverity): boolean {
  return severity === "error" || severity === "critical";
}

/** Drop events older than the window relative to `nowMs`. */
export function pruneWindow<T extends Timed>(
  events: T[],
  nowMs: number,
  windowMs = DEFAULT_WINDOW_MS,
): T[] {
  const cutoff = nowMs - windowMs;
  return events.filter((e) => {
    const t = Date.parse(e.timestamp);
    return Number.isNaN(t) || t >= cutoff;
  });
}

/**
 * Trigger analysis when any critical event is present, or when 2+ significant
 * events have accumulated in the window. (The buffer only holds significant
 * events, so length ≥ 2 means correlation.)
 */
export function shouldAnalyze(windowEvents: Timed[]): boolean {
  if (windowEvents.some((e) => e.severity === "critical")) return true;
  return windowEvents.length >= 2;
}
