import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bus } from "../../src/core/bus.js";
import { closeDb, type DB, migrateToLatest, openDb } from "../../src/core/db.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { listIncidents } from "../../src/core/repo.js";
import { type BrainLike, IncidentPipeline } from "../../src/incidents/pipeline.js";

const VALID_ANALYSIS = JSON.stringify({
  title: "Prod deploy failed",
  severity: "critical",
  root_cause: "axios upgrade broke interceptors",
  timeline: [{ timestamp: "2026-07-11T14:33:00Z", event: "build failed", source: "vercel" }],
  suggested_action: "pin axios",
  pattern_match: null,
  confidence: "medium",
});

const okBrain: BrainLike = { isConfigured: () => true, ask: async () => VALID_ANALYSIS };
const noBrain: BrainLike = { isConfigured: () => false, ask: async () => "" };
const junkBrain: BrainLike = { isConfigured: () => true, ask: async () => "sorry, no JSON here" };

function evt(
  severity: NormalizedEvent["severity"],
  over: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "vercel",
    type: "deploy.failed",
    severity,
    raw: "boom",
    summary: "vercel deploy failed",
    metadata: {},
    payload: {},
    ...over,
  };
}

let db: DB;
let dir: string;

beforeEach(async () => {
  db = openDb(":memory:");
  await migrateToLatest(db);
  dir = mkdtempSync(join(tmpdir(), "mort-pipeline-"));
});
afterEach(async () => {
  await closeDb(db);
  rmSync(dir, { recursive: true, force: true });
});

describe("IncidentPipeline.analyzeEvents", () => {
  it("persists an incident, writes a report, and notifies listeners", async () => {
    const pipeline = new IncidentPipeline({ brain: okBrain, db, reportsDir: dir });
    const seen: string[] = [];
    pipeline.onIncident((v) => seen.push(v.title));

    const incident = await pipeline.analyzeEvents([evt("critical")]);

    expect(incident?.title).toBe("Prod deploy failed");
    expect(incident?.reportPath).toBeDefined();
    expect(existsSync(incident?.reportPath ?? "")).toBe(true);
    expect(seen).toEqual(["Prod deploy failed"]);

    const rows = await listIncidents(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.severity).toBe("critical");
  });

  it("returns null when no brain is configured", async () => {
    const pipeline = new IncidentPipeline({ brain: noBrain, db, reportsDir: dir });
    expect(await pipeline.analyzeEvents([evt("critical")])).toBeNull();
    expect(await listIncidents(db, {})).toHaveLength(0);
  });

  it("records an unstructured incident when the brain returns non-JSON", async () => {
    const pipeline = new IncidentPipeline({ brain: junkBrain, db, reportsDir: dir });
    const incident = await pipeline.analyzeEvents([evt("critical")]);
    expect(incident?.title).toContain("unstructured");
    expect(incident?.rootCause).toContain("sorry");
    expect(await listIncidents(db, {})).toHaveLength(1);
  });

  it("publishes an incident.detected event on the bus", async () => {
    const pipeline = new IncidentPipeline({ brain: okBrain, db, reportsDir: dir });
    const detected: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => {
      if (e.type === "incident.detected") detected.push(e);
    });
    await pipeline.analyzeEvents([evt("critical")]);
    unsubscribe();
    expect(detected).toHaveLength(1);
    expect(detected[0]?.summary).toContain("Prod deploy failed");
  });
});

describe("IncidentPipeline correlation", () => {
  it("analyzes after buffering, and flush() drains the buffer", async () => {
    const ask = vi.fn(async () => VALID_ANALYSIS);
    const pipeline = new IncidentPipeline({
      brain: { isConfigured: () => true, ask },
      db,
      reportsDir: dir,
    });

    pipeline.ingest(evt("error"));
    pipeline.ingest(evt("error")); // 2 significant → would schedule
    await pipeline.flush();

    expect(ask).toHaveBeenCalledTimes(1); // one incident for the burst
    expect(await listIncidents(db, {})).toHaveLength(1);
  });

  it("ignores non-significant and incident.* events", async () => {
    const ask = vi.fn(async () => VALID_ANALYSIS);
    const pipeline = new IncidentPipeline({
      brain: { isConfigured: () => true, ask },
      db,
      reportsDir: dir,
    });

    pipeline.ingest(evt("info", { type: "git.commit", severity: "info" }));
    pipeline.ingest(evt("critical", { type: "incident.detected" })); // our own output
    await pipeline.flush();

    expect(ask).not.toHaveBeenCalled();
    expect(await listIncidents(db, {})).toHaveLength(0);
  });
});
