// `mort doctor` — one-shot setup diagnostics. Complements `mort status` (which is
// about live activity) by checking that everything is configured correctly:
// brain, daemon, db, reports, auto-start, and Telegram. Great for "why isn't it
// working?".

import { accessSync, constants, mkdirSync } from "node:fs";
import { createAutostart, defaultServiceSpec } from "../autostart/index.js";
import { Brain } from "../brain/index.js";
import { loadConfig, reportsDirFor } from "../core/config.js";
import { closeDb, migrateToLatest, openDb } from "../core/db.js";
import { readLock } from "../core/lock.js";
import { countEventsSince, listIncidents } from "../core/repo.js";
import { resolveTelegram } from "../outputs/telegram/index.js";
import { SKULL } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { VERSION } from "../version.js";
import { println } from "./util.js";

function ok(label: string, detail: string): void {
  println(`  ${theme.success("✓")} ${label} ${theme.muted(`· ${detail}`)}`);
}
function bad(label: string, detail: string): void {
  println(`  ${theme.warning("✗")} ${label} ${theme.muted(`· ${detail}`)}`);
}
function info(label: string, detail: string): void {
  println(`  ${theme.muted("•")} ${label} ${theme.muted(`· ${detail}`)}`);
}

export async function doctorCommand(): Promise<number> {
  println(`${SKULL.header}${theme.muted(`  doctor · v${VERSION}`)}`);
  println();

  let healthy = true;

  info("runtime", `node ${process.version} · ${process.platform}`);

  // Config
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
    ok("config", "loads and validates");
  } catch (err) {
    bad("config", `invalid: ${String(err)}`);
    return 1; // nothing else will work with a broken config
  }

  // Brain
  const brain = new Brain(config.brain);
  await brain.init();
  if (brain.isConfigured()) {
    ok("brain", `${brain.kind} · ${config.brain.model}`);
  } else {
    bad("brain", "not configured — run `mort setup` (analysis is disabled)");
    healthy = false;
  }

  // Daemon
  const lock = readLock();
  if (lock) ok("daemon", `running · pid ${lock.pid} · http://localhost:${lock.port}`);
  else info("daemon", "not running — start with `mort watch`");

  // Database
  try {
    const db = openDb();
    await migrateToLatest(db);
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const events = await countEventsSince(db, since);
    const incidents = await listIncidents(db, { limit: 1 });
    await closeDb(db);
    ok("database", `ok · ${events} events (24h) · ${incidents.length ? "has" : "no"} incidents`);
  } catch (err) {
    bad("database", `cannot open: ${String(err)}`);
    healthy = false;
  }

  // Reports dir writable
  const dir = reportsDirFor(config);
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    ok("reports", `writable · ${dir}`);
  } catch {
    bad("reports", `not writable · ${dir}`);
    healthy = false;
  }

  // Sensors enabled
  const enabled = Object.entries(config.sensors)
    .filter(([, s]) => (s as { enabled?: boolean }).enabled)
    .map(([name]) => name);
  if (enabled.length > 0) ok("sensors", `enabled: ${enabled.join(", ")}`);
  else info("sensors", "only git watches by default — enable more in `mort setup`");

  // Auto-start
  const autostart = await createAutostart(defaultServiceSpec()).status();
  if (autostart.ok) ok("auto-start", autostart.message);
  else info("auto-start", "not installed — `mort autostart install`");

  // Telegram
  const telegram = resolveTelegram(config.output.telegram);
  if (config.output.telegram.enabled) {
    if (telegram) ok("telegram", "configured");
    else bad("telegram", "enabled but missing bot_token/chat_id");
  } else {
    info("telegram", "off");
  }

  println();
  println(
    healthy
      ? theme.success("postmortem looks healthy.")
      : theme.warning("some checks need attention (see ✗ above)."),
  );
  return healthy ? 0 : 1;
}
