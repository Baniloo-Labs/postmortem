// Pure Vercel parsing. Turns a deployment object (Vercel REST v6) into a
// normalized state and, on a state change, into a SensorEvent. No I/O here — the
// sensor does the polling and log-fetching.

import type { SensorEvent } from "../base.js";

export interface VercelDeployment {
  uid: string;
  name?: string;
  url?: string;
  readyState?: string;
  state?: string;
  target?: string | null;
  created?: number;
  meta?: Record<string, string>;
}

export type VercelState = "building" | "ready" | "error" | "canceled" | "queued" | "unknown";

/** Normalize Vercel's readyState/state (QUEUED/BUILDING/READY/ERROR/CANCELED). */
export function normalizeState(deployment: VercelDeployment): VercelState {
  const raw = (deployment.readyState ?? deployment.state ?? "").toUpperCase();
  switch (raw) {
    case "BUILDING":
    case "INITIALIZING":
      return "building";
    case "READY":
      return "ready";
    case "ERROR":
      return "error";
    case "CANCELED":
      return "canceled";
    case "QUEUED":
      return "queued";
    default:
      return "unknown";
  }
}

export function isProduction(deployment: VercelDeployment): boolean {
  return deployment.target === "production";
}

/**
 * Map a deployment's current state to an event. Returns null for states we don't
 * surface (queued/canceled/unknown). `logText` (fetched by the sensor on error)
 * is placed in `raw`.
 */
export function deploymentEvent(
  deployment: VercelDeployment,
  state: VercelState,
  logText?: string,
): SensorEvent | null {
  const branch = deployment.meta?.githubCommitRef;
  const commit = deployment.meta?.githubCommitSha;
  const name = deployment.name ?? "vercel";
  const prod = isProduction(deployment);
  const metadata = {
    repo: name,
    branch,
    commit,
    url: deployment.url ? `https://${deployment.url}` : undefined,
  };
  const base = {
    source: "vercel" as const,
    metadata,
    payload: { uid: deployment.uid, target: deployment.target ?? null } as Record<string, unknown>,
  };

  switch (state) {
    case "building":
      return {
        ...base,
        type: "deploy.started",
        severity: "info",
        raw: `Deployment building${prod ? " (production)" : ""}`,
        summary: `vercel deploy started · ${branch ?? name}`,
      };
    case "ready":
      return {
        ...base,
        type: "deploy.succeeded",
        severity: "info",
        raw: `Deployment ready${prod ? " (production)" : ""}`,
        summary: `vercel ✓ deploy ready · ${branch ?? name}`,
      };
    case "error":
      return {
        ...base,
        type: "deploy.failed",
        severity: prod ? "critical" : "error",
        raw: logText?.trim() || "Deployment marked ERROR",
        summary: `vercel deploy failed · ${prod ? "production" : (branch ?? "preview")}`,
      };
    default:
      return null;
  }
}

/** Extract concise error lines from Vercel deployment event logs (v2 events API). */
export function parseDeploymentLog(
  events: Array<{ type?: string; payload?: { text?: string } }>,
): string {
  const lines = events
    .map((e) => e.payload?.text ?? "")
    .filter((t) => t.length > 0)
    .filter((t) => /error|failed|cannot|not found|exceeded|missing/i.test(t));
  const text = (lines.length > 0 ? lines : events.map((e) => e.payload?.text ?? "")).join("\n");
  return text.slice(0, 5000);
}
