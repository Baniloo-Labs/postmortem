// `mort history` — list past incidents from SQLite. Incidents are postmortem's
// long-term memory (never pruned), so this is also what makes `predict` valuable.

import { closeDb, migrateToLatest, openDb } from "../core/db.js";
import { listIncidents } from "../core/repo.js";
import { formatDateTime } from "../outputs/terminal/format.js";
import { SKULL, SKULL_GLYPH } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { parseSince, println, severityTheme } from "./util.js";

export interface HistoryOptions {
  last?: string;
  severity?: string;
}

export async function historyCommand(options: HistoryOptions = {}): Promise<void> {
  const db = openDb();
  await migrateToLatest(db);
  const sinceIso = options.last ? parseSince(options.last) : undefined;
  const incidents = await listIncidents(db, {
    severity: options.severity,
    sinceIso,
    limit: 20,
  });
  await closeDb(db);

  println(`${SKULL.header}${theme.muted(" · incident history")}`);
  println();

  if (incidents.length === 0) {
    println(theme.muted("  no incidents recorded yet — postmortem learns as it watches"));
    return;
  }

  for (const incident of incidents) {
    const sev = severityTheme(incident.severity);
    const when = formatDateTime(incident.detected_at);
    println(
      `  ${sev(incident.severity.toUpperCase().padEnd(8))} ${theme.timestamp(when)}  ${incident.title}`,
    );
    if (incident.root_cause) {
      println(`     ${theme.brain(SKULL_GLYPH)} ${theme.muted(incident.root_cause.slice(0, 100))}`);
    }
  }
}
