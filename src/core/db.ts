// SQLite persistence via Kysely. All SQL goes through the query builder — no raw
// strings outside the migrations below.
//
// The db is opened in WAL mode with a busy timeout because postmortem runs as two
// processes at once: the long-lived `mort watch` daemon holds the database while
// `mort status` / `history` / `predict` open it from a second process. Without
// WAL those readers would hit SQLITE_BUSY.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { type ColumnType, type Generated, Kysely, SqliteDialect, sql } from "kysely";
import { type Migration, type MigrationProvider, Migrator } from "kysely/migration";
import { dbFile } from "./paths.js";

// ─── Table types ────────────────────────────────────────────────────────────

interface EventsTable {
  id: string;
  timestamp: string;
  source: string;
  type: string;
  severity: string;
  summary: string;
  raw: string;
  metadata: string; // JSON
  payload: string; // JSON
  created_at: ColumnType<string, string | undefined, never>;
}

interface IncidentsTable {
  id: string;
  detected_at: string;
  resolved_at: string | null;
  severity: string;
  title: string;
  root_cause: string | null; // LLM output
  timeline: string | null; // LLM output, JSON array
  suggested_action: string | null; // LLM output
  event_ids: string; // JSON array of triggering event ids
  postmortem_path: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}

interface SensorHealthTable {
  sensor_name: string;
  healthy: Generated<number>;
  last_check: string;
  message: string | null;
  updated_at: ColumnType<string, string | undefined, never>;
}

export interface Database {
  events: EventsTable;
  incidents: IncidentsTable;
  sensor_health: SensorHealthTable;
}

export type DB = Kysely<Database>;

// ─── Connection ─────────────────────────────────────────────────────────────

/**
 * Open (creating if needed) the postmortem database with WAL + busy timeout.
 * Pass an explicit path in tests; production uses `~/.postmortem/postmortem.db`.
 */
export function openDb(path: string = dbFile()): DB {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new SQLite(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}

export async function closeDb(db: DB): Promise<void> {
  await db.destroy();
}

// ─── Migrations ─────────────────────────────────────────────────────────────

const migrations: Record<string, Migration> = {
  "001_init": {
    async up(db) {
      await db.schema
        .createTable("events")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("timestamp", "text", (c) => c.notNull())
        .addColumn("source", "text", (c) => c.notNull())
        .addColumn("type", "text", (c) => c.notNull())
        .addColumn("severity", "text", (c) => c.notNull())
        .addColumn("summary", "text", (c) => c.notNull())
        .addColumn("raw", "text", (c) => c.notNull())
        .addColumn("metadata", "text", (c) => c.notNull())
        .addColumn("payload", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull().defaultTo(sql`(datetime('now'))`))
        .execute();

      await db.schema
        .createTable("incidents")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("detected_at", "text", (c) => c.notNull())
        .addColumn("resolved_at", "text")
        .addColumn("severity", "text", (c) => c.notNull())
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("root_cause", "text")
        .addColumn("timeline", "text")
        .addColumn("suggested_action", "text")
        .addColumn("event_ids", "text", (c) => c.notNull())
        .addColumn("postmortem_path", "text")
        .addColumn("created_at", "text", (c) => c.notNull().defaultTo(sql`(datetime('now'))`))
        .execute();

      await db.schema
        .createTable("sensor_health")
        .addColumn("sensor_name", "text", (c) => c.primaryKey())
        .addColumn("healthy", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("last_check", "text", (c) => c.notNull())
        .addColumn("message", "text")
        .addColumn("updated_at", "text", (c) => c.notNull().defaultTo(sql`(datetime('now'))`))
        .execute();

      for (const col of ["timestamp", "source", "type", "severity"]) {
        await db.schema.createIndex(`idx_events_${col}`).on("events").column(col).execute();
      }
      await db.schema
        .createIndex("idx_incidents_detected_at")
        .on("incidents")
        .column("detected_at")
        .execute();
    },
    async down(db) {
      await db.schema.dropTable("sensor_health").ifExists().execute();
      await db.schema.dropTable("incidents").ifExists().execute();
      await db.schema.dropTable("events").ifExists().execute();
    },
  },
};

class InlineMigrationProvider implements MigrationProvider {
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(migrations);
  }
}

/** Run all pending migrations. Throws if any migration fails. */
export async function migrateToLatest(db: DB): Promise<void> {
  const migrator = new Migrator({ db, provider: new InlineMigrationProvider() });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    const failed = results?.find((r) => r.status === "Error")?.migrationName;
    throw new Error(`migration failed${failed ? ` at ${failed}` : ""}: ${String(error)}`);
  }
}

// ─── Retention ──────────────────────────────────────────────────────────────

/**
 * Delete events older than `retentionDays`. Incidents are never pruned — they
 * are postmortem's memory and what makes `mort predict` sharper over time.
 * Returns the number of events removed.
 */
export async function pruneEvents(db: DB, retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const result = await db.deleteFrom("events").where("timestamp", "<", cutoff).executeTakeFirst();
  return Number(result.numDeletedRows ?? 0n);
}
