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
