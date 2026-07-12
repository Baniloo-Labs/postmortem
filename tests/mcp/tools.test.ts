import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, type DB, migrateToLatest, openDb } from "../../src/core/db.js";
import { insertEvent, insertIncident } from "../../src/core/repo.js";
import type { BrainLike } from "../../src/incidents/pipeline.js";
import {
  toolGetIncident,
  toolListIncidents,
  toolPredict,
  toolQueryEvents,
} from "../../src/mcp/tools.js";

let db: DB;

beforeEach(async () => {
  db = openDb(":memory:");
  await migrateToLatest(db);
});
afterEach(async () => {
  await closeDb(db);
});

async function seedIncident(id: string, severity: string, title: string) {
  await insertIncident(db, {
    id,
    detectedAt: new Date().toISOString(),
    severity,
    title,
    rootCause: "a cause",
    timeline: [{ time: "14:00", text: "boom", source: "vercel" }],
    suggestedAction: "do the thing",
    eventIds: [],
    postmortemPath: null,
  });
}

async function seedEvent(
  source: string,
  severity: "info" | "warning" | "error" | "critical",
  summary: string,
) {
  await insertEvent(db, {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    type: "deploy.failed",
    severity,
    raw: "r",
    summary,
    metadata: {},
    payload: {},
  });
}

describe("toolListIncidents", () => {
  it("lists incidents with a count, filterable by severity", async () => {
    await seedIncident("i1", "critical", "prod down");
    await seedIncident("i2", "warning", "slow");

    const all = (await toolListIncidents(db, {})) as { count: number };
    expect(all.count).toBe(2);

    const crit = (await toolListIncidents(db, { severity: "critical" })) as {
      count: number;
      incidents: Array<{ id: string }>;
    };
    expect(crit.count).toBe(1);
    expect(crit.incidents[0]?.id).toBe("i1");
  });
});

describe("toolGetIncident", () => {
  it("returns the full incident with its timeline", async () => {
    await seedIncident("i1", "critical", "prod down");
    const inc = (await toolGetIncident(db, { id: "i1" })) as {
      title: string;
      timeline: Array<{ text: string }>;
    };
    expect(inc.title).toBe("prod down");
    expect(inc.timeline[0]?.text).toBe("boom");
  });

  it("returns an error object for an unknown id", async () => {
    const res = (await toolGetIncident(db, { id: "nope" })) as { error: string };
    expect(res.error).toContain("not found");
  });
});

describe("toolQueryEvents", () => {
  it("filters events by source and severity", async () => {
    await seedEvent("vercel", "critical", "deploy failed");
    await seedEvent("git", "info", "a push");

    const vercel = (await toolQueryEvents(db, { source: "vercel" })) as {
      count: number;
      events: Array<{ summary: string }>;
    };
    expect(vercel.count).toBe(1);
    expect(vercel.events[0]?.summary).toBe("deploy failed");

    const critical = (await toolQueryEvents(db, { severity: "critical" })) as { count: number };
    expect(critical.count).toBe(1);
  });
});

describe("toolPredict", () => {
  const okBrain: BrainLike = {
    isConfigured: () => true,
    ask: async () =>
      JSON.stringify({
        risk_level: "high",
        confidence: "medium",
        concerns: ["touches auth"],
        likely_failure_points: ["session handling"],
        recommendation: "go-with-caution",
        reasoning: "auth files changed",
      }),
  };

  it("returns a parsed prediction for a provided diff", async () => {
    const res = (await toolPredict(
      { db, brain: okBrain, gatherDiff: async () => "" },
      { diff: "diff --git a/auth.ts" },
    )) as { risk_level: string };
    expect(res.risk_level).toBe("high");
  });

  it("uses the working diff when none is provided", async () => {
    const res = (await toolPredict(
      { db, brain: okBrain, gatherDiff: async () => "diff --git a/x.ts" },
      {},
    )) as { risk_level: string };
    expect(res.risk_level).toBe("high");
  });

  it("errors clearly with no brain or no diff", async () => {
    const noBrain: BrainLike = { isConfigured: () => false, ask: async () => "" };
    const r1 = (await toolPredict({ db, brain: noBrain, gatherDiff: async () => "diff" }, {})) as {
      error: string;
    };
    expect(r1.error).toContain("no brain");

    const r2 = (await toolPredict({ db, brain: okBrain, gatherDiff: async () => "" }, {})) as {
      error: string;
    };
    expect(r2.error).toContain("no diff");
  });
});
