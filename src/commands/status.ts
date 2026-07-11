// `mort status` — a non-interactive health snapshot: brain backend, daemon lock
// state, sensor health, and recent event counts. Runs as a second process against
// the daemon's database (WAL makes that safe).

import { Brain } from "../brain/index.js";
import { loadConfig } from "../core/config.js";
import { closeDb, migrateToLatest, openDb } from "../core/db.js";
import { readLock } from "../core/lock.js";
import { countEventsSince, recentEvents } from "../core/repo.js";
import { SKULL } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { createSensorRegistry } from "../sensors/index.js";
import { VERSION } from "../version.js";
import { println } from "./util.js";

export async function statusCommand(): Promise<void> {
  const config = loadConfig();

  const brain = new Brain(config.brain);
  await brain.init();
  const lock = readLock();

  const db = openDb();
  await migrateToLatest(db);
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const count24h = await countEventsSince(db, since);
  const recent = await recentEvents(db, 5);
  await closeDb(db);

  const health = await createSensorRegistry().checkAll();

  println(`${SKULL.header}${theme.muted(`  v${VERSION}`)}`);
  println();

  println(theme.label("BRAIN"));
  println(
    brain.isConfigured()
      ? `  ${theme.success("●")} ${brain.kind} ${theme.muted(`· ${config.brain.model}`)}`
      : `  ${theme.muted("✗ not configured")} — run ${theme.primary("mort setup")}`,
  );
  println();

  println(theme.label("DAEMON"));
  println(
    lock
      ? `  ${theme.success("●")} running ${theme.muted(`· pid ${lock.pid} · http://localhost:${lock.port}`)}`
      : `  ${theme.muted("✗ not running")} — run ${theme.primary("mort watch")}`,
  );
  println();

  println(theme.label("SENSORS"));
  for (const h of health) {
    const dot = h.healthy ? theme.sensor("●") : theme.muted("✗");
    println(`  ${dot} ${h.name.padEnd(10)} ${theme.muted(`· ${h.message}`)}`);
  }
  println();

  println(`${theme.label("EVENTS")}${theme.muted(`  ${count24h} in last 24h`)}`);
  for (const e of recent) {
    println(
      `  ${theme.timestamp(e.timestamp.slice(11, 19))} ${theme.sensor(e.source.padEnd(9))} ${e.summary}`,
    );
  }
}
