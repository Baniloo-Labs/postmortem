import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import { closeDb, type DB, migrateToLatest, openDb } from "../../src/core/db.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import {
  attachEventPersistence,
  countEventsSince,
  insertEvent,
  insertIncident,
  listIncidents,
  recentEvents,
} from "../../src/core/repo.js";

let db: DB;

function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "git",
    type: "git.commit",
    severity: "info",
    raw: "raw",
    summary: "a commit",
    metadata: { branch: "main" },
    payload: { sha: "abc" },
    ...overrides,
  };
}

beforeEach(async () => {
  db = openDb(":memory:");
  await migrateToLatest(db);
});
afterEach(async () => {
  await closeDb(db);
});

describe("events", () => {
  it("inserts and reads back recent events newest-first", async () => {
    await insertEvent(db, event({ timestamp: "2026-07-11T10:00:00.000Z", summary: "old" }));
    await insertEvent(db, event({ timestamp: "2026-07-11T12:00:00.000Z", summary: "new" }));
    const rows = await recentEvents(db, 10);
    expect(rows.map((r) => r.summary)).toEqual(["new", "old"]);
  });

  it("is idempotent on duplicate id (onConflict do nothing)", async () => {
    const e = event();
    await insertEvent(db, e);
    await insertEvent(db, e);
    expect(await countEventsSince(db, "1970-01-01T00:00:00.000Z")).toBe(1);
  });

  it("counts events since a cutoff", async () => {
    await insertEvent(db, event({ timestamp: "2026-07-10T00:00:00.000Z" }));
    await insertEvent(db, event({ timestamp: "2026-07-11T12:00:00.000Z" }));
    expect(await countEventsSince(db, "2026-07-11T00:00:00.000Z")).toBe(1);
  });
});

describe("attachEventPersistence", () => {
  it("persists events published on the bus", async () => {
    const detach = attachEventPersistence(db);
    bus.publish(event({ summary: "via bus" }));
    // insert is async/fire-and-forget; let the microtask flush.
    await new Promise((r) => setTimeout(r, 20));
    detach();
    const rows = await recentEvents(db, 10);
    expect(rows.some((r) => r.summary === "via bus")).toBe(true);
  });
});

describe("incidents", () => {
  it("inserts and lists incidents, filtered by severity", async () => {
    await insertIncident(db, {
      id: "i1",
      detectedAt: "2026-07-11T14:00:00.000Z",
      severity: "critical",
      title: "prod down",
      rootCause: "axios",
      timeline: [],
      suggestedAction: "pin it",
      eventIds: ["e1"],
      postmortemPath: null,
    });
    await insertIncident(db, {
      id: "i2",
      detectedAt: "2026-07-11T15:00:00.000Z",
      severity: "warning",
      title: "slow",
      rootCause: null,
      timeline: [],
      suggestedAction: null,
      eventIds: [],
      postmortemPath: null,
    });

    const all = await listIncidents(db, {});
    expect(all.map((i) => i.id)).toEqual(["i2", "i1"]); // newest first

    const critical = await listIncidents(db, { severity: "critical" });
    expect(critical.map((i) => i.id)).toEqual(["i1"]);
  });
});
