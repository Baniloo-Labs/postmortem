// Repository — the typed data-access layer over the SQLite tables. All command
// and daemon db access goes through here so the raw Kysely queries live in one
// place. Events arriving here are already redacted (BaseSensor.emit did it).

import { bus } from "./bus.js";
import type { DB } from "./db.js";
import type { NormalizedEvent } from "./event.js";
import { createLogger } from "./logger.js";

const log = createLogger("repo");

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Subscribe the database to the bus: every published event is persisted. Returns
 * an unsubscribe function. A failed insert is logged, never thrown — persistence
 * must not crash the daemon.
 */
export function attachEventPersistence(db: DB): () => void {
  return bus.subscribe((event) => {
    void insertEvent(db, event).catch((err) => {
      log.error("failed to persist event", { id: event.id, error: String(err) });
    });
  });
}

// ─── Events ─────────────────────────────────────────────────────────────────

export async function insertEvent(db: DB, event: NormalizedEvent): Promise<void> {
  await db
    .insertInto("events")
    .values({
      id: event.id,
      timestamp: event.timestamp,
      source: event.source,
      type: event.type,
      severity: event.severity,
      summary: event.summary,
      raw: event.raw,
      metadata: JSON.stringify(event.metadata),
      payload: JSON.stringify(event.payload),
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();
}

export async function countEventsSince(db: DB, sinceIso: string): Promise<number> {
  const row = await db
    .selectFrom("events")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("timestamp", ">=", sinceIso)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

export interface StoredEvent {
  id: string;
  timestamp: string;
  source: string;
  type: string;
  severity: string;
  summary: string;
}

export async function recentEvents(db: DB, limit = 20): Promise<StoredEvent[]> {
  return db
    .selectFrom("events")
    .select(["id", "timestamp", "source", "type", "severity", "summary"])
    .orderBy("timestamp", "desc")
    .limit(limit)
    .execute();
}

/** Full events since a cutoff (chronological), reconstructed as NormalizedEvents. */
export async function getEventsSince(db: DB, sinceIso: string): Promise<NormalizedEvent[]> {
  const rows = await db
    .selectFrom("events")
    .selectAll()
    .where("timestamp", ">=", sinceIso)
    .orderBy("timestamp", "asc")
    .execute();

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    source: r.source,
    type: r.type as NormalizedEvent["type"],
    severity: r.severity as NormalizedEvent["severity"],
    raw: r.raw,
    summary: r.summary,
    metadata: safeJson(r.metadata) as NormalizedEvent["metadata"],
    payload: safeJson(r.payload) as NormalizedEvent["payload"],
  }));
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── Incidents ──────────────────────────────────────────────────────────────

export interface IncidentRow {
  id: string;
  detected_at: string;
  resolved_at: string | null;
  severity: string;
  title: string;
  root_cause: string | null;
  suggested_action: string | null;
  postmortem_path: string | null;
}

export interface NewIncident {
  id: string;
  detectedAt: string;
  severity: string;
  title: string;
  rootCause: string | null;
  timeline: unknown;
  suggestedAction: string | null;
  eventIds: string[];
  postmortemPath: string | null;
}

export async function insertIncident(db: DB, incident: NewIncident): Promise<void> {
  await db
    .insertInto("incidents")
    .values({
      id: incident.id,
      detected_at: incident.detectedAt,
      resolved_at: null,
      severity: incident.severity,
      title: incident.title,
      root_cause: incident.rootCause,
      timeline: JSON.stringify(incident.timeline),
      suggested_action: incident.suggestedAction,
      event_ids: JSON.stringify(incident.eventIds),
      postmortem_path: incident.postmortemPath,
    })
    .execute();
}

export interface HistoryFilter {
  limit?: number;
  severity?: string;
  sinceIso?: string;
}

export async function listIncidents(db: DB, filter: HistoryFilter = {}): Promise<IncidentRow[]> {
  let query = db
    .selectFrom("incidents")
    .select([
      "id",
      "detected_at",
      "resolved_at",
      "severity",
      "title",
      "root_cause",
      "suggested_action",
      "postmortem_path",
    ])
    .orderBy("detected_at", "desc");

  if (filter.severity) query = query.where("severity", "=", filter.severity);
  if (filter.sinceIso) query = query.where("detected_at", ">=", filter.sinceIso);
  query = query.limit(filter.limit ?? 10);

  return query.execute();
}

export interface IncidentDetail extends IncidentRow {
  timeline: unknown;
  event_ids: unknown;
}

/** A single incident with its parsed timeline/event ids, or null. */
export async function getIncident(db: DB, id: string): Promise<IncidentDetail | null> {
  const row = await db.selectFrom("incidents").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) return null;
  return { ...row, timeline: parseJson(row.timeline), event_ids: parseJson(row.event_ids) };
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Recent incidents as the lightweight shape the brain's prompts consume. */
export async function recentIncidentSummaries(
  db: DB,
  limit = 10,
): Promise<Array<{ detected_at: string; title: string; root_cause: string | null }>> {
  return db
    .selectFrom("incidents")
    .select(["detected_at", "title", "root_cause"])
    .orderBy("detected_at", "desc")
    .limit(limit)
    .execute();
}
