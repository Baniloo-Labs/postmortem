// `mort incident --last <window>` — manually analyze recent events into an
// incident. Reads the window's events from the db, runs the same pipeline the
// daemon uses, persists the incident, and prints the card + report path.

import { Brain } from "../brain/index.js";
import { loadConfig, reportsDirFor } from "../core/config.js";
import { closeDb, migrateToLatest, openDb } from "../core/db.js";
import { getEventsSince } from "../core/repo.js";
import { IncidentPipeline } from "../incidents/pipeline.js";
import type { Incident } from "../incidents/types.js";
import { SKULL_GLYPH } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { parseSince, println, severityTheme } from "./util.js";

export interface IncidentOptions {
  last?: string;
}

export async function incidentCommand(options: IncidentOptions = {}): Promise<number> {
  const window = options.last ?? "10m";
  const sinceIso = parseSince(window) ?? parseSince("10m");
  if (!sinceIso) return 1;

  const config = loadConfig();
  const db = openDb();
  await migrateToLatest(db);
  const events = await getEventsSince(db, sinceIso);

  if (events.length === 0) {
    println(theme.muted(`no events in the last ${window} to analyze.`));
    await closeDb(db);
    return 0;
  }

  const brain = new Brain(config.brain);
  await brain.init();
  if (!brain.isConfigured()) {
    println(
      theme.muted(`${SKULL_GLYPH} no brain configured — run "mort setup" to enable analysis.`),
    );
    await closeDb(db);
    return 0;
  }

  const pipeline = new IncidentPipeline({
    brain,
    db,
    reportsDir: reportsDirFor(config),
    brainLabel: `${config.brain.model} via ${brain.kind}`,
  });

  println(theme.muted(`analyzing ${events.length} event(s) from the last ${window}…`));
  const incident = await pipeline.analyzeEvents(events);
  await closeDb(db);

  if (!incident) {
    println(theme.muted("could not produce an incident."));
    return 0;
  }
  printIncident(incident);
  return 0;
}

function printIncident(incident: Incident): void {
  const sev = severityTheme(incident.severity);
  println();
  println(`${theme.brain(SKULL_GLYPH)} ${sev("INCIDENT")}  ${incident.title}`);
  println();
  if (incident.rootCause) {
    const conf = incident.confidence ? theme.muted(`  [confidence: ${incident.confidence}]`) : "";
    println(`${theme.brain(SKULL_GLYPH)} ${theme.brain("ROOT CAUSE")}${conf}`);
    println(`  ${incident.rootCause}`);
    println();
  }
  if (incident.suggestedAction) {
    println(`${theme.brain(SKULL_GLYPH)} ${theme.brain("SUGGESTED ACTION")}`);
    println(`  ${incident.suggestedAction}`);
    println();
  }
  if (incident.timeline.length > 0) {
    println(theme.label("TIMELINE"));
    for (const t of incident.timeline) {
      println(`  ${theme.timestamp(t.time)} ${theme.sensor(t.source.padEnd(9))} ${t.text}`);
    }
    println();
  }
  if (incident.reportPath) {
    println(theme.muted(`report → ${incident.reportPath}`));
  }
}
