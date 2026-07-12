// Read-only tool logic for the MCP server. Kept separate from the SDK wiring so
// each tool is a plain async function testable against a real db. NOTHING here
// writes to the database or triggers an actuator — the MCP surface is read-only
// by design (a hard rule: postmortem is the memory agents query, not a lever they
// pull).

import { askJson } from "../brain/json.js";
import { buildPredictPrompt, Prediction } from "../brain/prompts/predict.js";
import { parseSince } from "../commands/util.js";
import type { DB } from "../core/db.js";
import { getIncident, listIncidents, queryEvents, recentIncidentSummaries } from "../core/repo.js";
import type { BrainLike } from "../incidents/pipeline.js";

export async function toolListIncidents(
  db: DB,
  args: { limit?: number; severity?: string; since?: string },
): Promise<unknown> {
  const sinceIso = args.since ? parseSince(args.since) : undefined;
  const incidents = await listIncidents(db, {
    limit: args.limit ?? 20,
    severity: args.severity,
    sinceIso,
  });
  return { count: incidents.length, incidents };
}

export async function toolGetIncident(db: DB, args: { id: string }): Promise<unknown> {
  const incident = await getIncident(db, args.id);
  return incident ?? { error: "incident not found", id: args.id };
}

export async function toolQueryEvents(
  db: DB,
  args: { limit?: number; since?: string; severity?: string; source?: string },
): Promise<unknown> {
  const sinceIso = args.since ? parseSince(args.since) : undefined;
  const events = await queryEvents(db, {
    limit: args.limit ?? 50,
    sinceIso,
    severity: args.severity,
    source: args.source,
  });
  return { count: events.length, events };
}

export interface PredictToolDeps {
  db: DB;
  brain: BrainLike;
  gatherDiff: () => Promise<string>;
}

export async function toolPredict(
  deps: PredictToolDeps,
  args: { diff?: string },
): Promise<unknown> {
  const diff = args.diff?.trim() || (await deps.gatherDiff());
  if (!diff) return { error: "no diff to analyze (pass `diff`, or run from a repo with changes)" };
  if (!deps.brain.isConfigured()) {
    return { error: "no brain configured — run `mort setup` to enable predictions" };
  }
  const history = await recentIncidentSummaries(deps.db, 10);
  const result = await askJson(
    (p) => deps.brain.ask(p),
    buildPredictPrompt(diff, history),
    Prediction,
  );
  return result.ok ? result.data : { error: "could not parse a risk assessment from the model" };
}
