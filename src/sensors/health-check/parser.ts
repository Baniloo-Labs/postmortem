// Pure health-check classification. Given a probe result and the previous health
// state, decide whether to emit an event (only on transitions — we don't spam an
// event every poll while an endpoint stays up or stays down).

import type { SensorEvent } from "../base.js";

export type Health = "up" | "down";

export interface ProbeResult {
  url: string;
  ok: boolean; // reachable AND status < 500
  status?: number;
  latencyMs?: number;
  error?: string;
}

/** A probe is healthy when it responded with a status below 500. */
export function isUp(result: ProbeResult): boolean {
  return result.ok;
}

/**
 * Emit on transition only: up→down = health.degraded, down→up = health.recovered.
 * First observation of a healthy endpoint is silent; first observation of a
 * down endpoint reports degraded (previous undefined, current down).
 */
export function healthEvent(result: ProbeResult, previous: Health | undefined): SensorEvent | null {
  const current: Health = isUp(result) ? "up" : "down";
  if (previous === current) return null;
  if (current === "up" && previous === undefined) return null; // silent healthy start

  const metadata = { url: result.url, duration_ms: result.latencyMs };

  if (current === "down") {
    const detail = result.error
      ? result.error
      : `status ${result.status ?? "?"}${result.latencyMs ? ` · ${result.latencyMs}ms` : ""}`;
    return {
      source: "health-check",
      type: "health.degraded",
      severity: "critical",
      raw: `${result.url} → ${detail}`,
      summary: `health · ${hostOf(result.url)} down (${detail})`,
      metadata,
      payload: { status: result.status ?? null, error: result.error ?? null },
    };
  }

  return {
    source: "health-check",
    type: "health.recovered",
    severity: "info",
    raw: `${result.url} recovered · status ${result.status ?? "?"}`,
    summary: `health · ${hostOf(result.url)} recovered`,
    metadata,
    payload: { status: result.status ?? null },
  };
}

export function nextHealth(result: ProbeResult): Health {
  return isUp(result) ? "up" : "down";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
