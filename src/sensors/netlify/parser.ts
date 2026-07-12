// Pure Netlify parsing. Turns a deploy object (Netlify API v1) into a normalized
// state and, on a state change, into a SensorEvent. No I/O — the sensor polls.
// Mirrors the Vercel parser; Netlify carries the error text on the deploy itself
// (`error_message`), so no second log fetch is needed.

import type { SensorEvent } from "../base.js";

export interface NetlifyDeploy {
  id: string;
  name?: string; // site subdomain
  state?: string;
  context?: string; // "production" | "deploy-preview" | "branch-deploy" | ...
  branch?: string;
  commit_ref?: string;
  title?: string; // commit message / deploy title
  error_message?: string | null;
  deploy_ssl_url?: string;
  ssl_url?: string;
  url?: string;
}

export type NetlifyState = "building" | "ready" | "error" | "other";

const IN_PROGRESS = new Set([
  "new",
  "enqueued",
  "accepted",
  "building",
  "processing",
  "uploading",
  "preparing",
  "prepared",
  "uploaded",
]);

/** Normalize Netlify's `state` into the states we surface. */
export function normalizeState(deploy: NetlifyDeploy): NetlifyState {
  const raw = (deploy.state ?? "").toLowerCase();
  if (raw === "ready") return "ready";
  if (raw === "error") return "error";
  if (IN_PROGRESS.has(raw)) return "building";
  return "other"; // cancelled / deleted / skipped — no event
}

export function isProduction(deploy: NetlifyDeploy): boolean {
  return deploy.context === "production";
}

function deployUrl(deploy: NetlifyDeploy): string | undefined {
  return deploy.deploy_ssl_url ?? deploy.ssl_url ?? deploy.url;
}

/** Map a deploy's current state to an event, or null for states we don't surface. */
export function deploymentEvent(deploy: NetlifyDeploy, state: NetlifyState): SensorEvent | null {
  const name = deploy.name ?? "netlify";
  const prod = isProduction(deploy);
  const metadata = {
    repo: name,
    branch: deploy.branch,
    commit: deploy.commit_ref,
    url: deployUrl(deploy),
  };
  const base = {
    source: "netlify" as const,
    metadata,
    payload: { deploy_id: deploy.id, context: deploy.context ?? null } as Record<string, unknown>,
  };

  switch (state) {
    case "building":
      return {
        ...base,
        type: "deploy.started",
        severity: "info",
        raw: `Deploy building${prod ? " (production)" : ""}`,
        summary: `netlify deploy started · ${deploy.branch ?? name}`,
      };
    case "ready":
      return {
        ...base,
        type: "deploy.succeeded",
        severity: "info",
        raw: `Deploy ready${prod ? " (production)" : ""}`,
        summary: `netlify ✓ deploy ready · ${deploy.branch ?? name}`,
      };
    case "error":
      return {
        ...base,
        type: "deploy.failed",
        severity: prod ? "critical" : "error",
        raw: (deploy.error_message ?? "Deploy marked error").slice(0, 5000),
        summary: `netlify deploy failed · ${prod ? "production" : (deploy.branch ?? "preview")}`,
      };
    default:
      return null;
  }
}
