import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, type DB, migrateToLatest, openDb, pruneEvents } from "../../src/core/db.js";

let db: DB;

function insertEvent(id: string, timestamp: string) {
  return db
    .insertInto("events")
    .values({
      id,
      timestamp,
      source: "git",
      type: "git.push",
      severity: "info",
      summary: "push",
      raw: "raw",
      metadata: "{}",
      payload: "{}",
    })
    .execute();
}

beforeEach(async () => {
  db = openDb(":memory:");
  await migrateToLatest(db);
});

afterEach(async () => {
  await closeDb(db);
});

describe("migrations", () => {
  it("creates the events, incidents, and sensor_health tables", async () => {
    const tables = await db.introspection.getTables();
    const names = tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["events", "incidents", "sensor_health"]));
  });

  it("stamps created_at by default when omitted", async () => {
    await insertEvent("e1", new Date().toISOString());
    const row = await db
      .selectFrom("events")
      .select("created_at")
      .where("id", "=", "e1")
      .executeTakeFirstOrThrow();
    expect(row.created_at).toBeTruthy();
  });

  it("is idempotent — running again is a no-op", async () => {
    await expect(migrateToLatest(db)).resolves.toBeUndefined();
  });
});

describe("pruneEvents", () => {
  it("removes events older than the retention window and keeps recent ones", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await insertEvent("old", old);
    await insertEvent("recent", recent);

    const removed = await pruneEvents(db, 30);

    expect(removed).toBe(1);
    const remaining = await db.selectFrom("events").select("id").execute();
    expect(remaining.map((r) => r.id)).toEqual(["recent"]);
  });

  it("never touches incidents", async () => {
    await db
      .insertInto("incidents")
      .values({
        id: "i1",
        detected_at: new Date(Date.now() - 400 * 86_400_000).toISOString(),
        resolved_at: null,
        severity: "critical",
        title: "old incident",
        root_cause: null,
        timeline: null,
        suggested_action: null,
        event_ids: "[]",
        postmortem_path: null,
      })
      .execute();

    await pruneEvents(db, 30);

    const incidents = await db.selectFrom("incidents").select("id").execute();
    expect(incidents.map((i) => i.id)).toEqual(["i1"]);
  });
});
