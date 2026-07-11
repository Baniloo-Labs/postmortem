// The incident pipeline. Subscribes to the bus, correlates error/critical events,
// and — when a cluster warrants it — asks the brain for a structured analysis,
// persists the incident, writes a markdown report, and notifies the live UI.
//
// Cost control (CLAUDE.md): only significant events are buffered, a burst is
// debounced into a single incident, and analysis is skipped entirely when no brain
// is configured (the events are still recorded by the persistence subscriber).

import { randomUUID } from "node:crypto";
import { askJson } from "../brain/json.js";
import { buildIncidentPrompt, IncidentAnalysis } from "../brain/prompts/incident.js";
import { bus } from "../core/bus.js";
import type { DB } from "../core/db.js";
import type { NormalizedEvent } from "../core/event.js";
import { createLogger } from "../core/logger.js";
import { insertIncident, recentIncidentSummaries } from "../core/repo.js";
import { formatClock } from "../outputs/terminal/format.js";
import type { IncidentView } from "../outputs/terminal/types.js";
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_WINDOW_MS,
  isSignificant,
  pruneWindow,
  shouldAnalyze,
} from "./correlate.js";
import { writeReport } from "./report.js";
import { type Incident, toIncidentView } from "./types.js";

const log = createLogger("pipeline");

export interface BrainLike {
  ask(prompt: string): Promise<string>;
  isConfigured(): boolean;
}

export interface PipelineOptions {
  brain: BrainLike;
  db: DB;
  reportsDir: string;
  brainLabel?: string;
  windowMs?: number;
  debounceMs?: number;
}

type IncidentListener = (view: IncidentView) => void;

export class IncidentPipeline {
  private readonly brain: BrainLike;
  private readonly db: DB;
  private readonly reportsDir: string;
  private readonly brainLabel?: string;
  private readonly windowMs: number;
  private readonly debounceMs: number;

  private buffer: NormalizedEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<IncidentListener>();

  constructor(options: PipelineOptions) {
    this.brain = options.brain;
    this.db = options.db;
    this.reportsDir = options.reportsDir;
    this.brainLabel = options.brainLabel;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  /** Subscribe to the bus. Returns a detach function. */
  attach(): () => void {
    return bus.subscribe((event) => this.ingest(event));
  }

  /** Register a listener for newly-detected incidents (the live UI uses this). */
  onIncident(listener: IncidentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ingest(event: NormalizedEvent): void {
    if (event.type.startsWith("incident.")) return; // never correlate our own output
    if (!isSignificant(event.severity)) return;
    this.buffer.push(event);
    this.buffer = pruneWindow(this.buffer, Date.now(), this.windowMs);
    if (shouldAnalyze(this.buffer)) this.schedule();
  }

  private schedule(): void {
    if (this.timer) return; // already debouncing this burst
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Analyze whatever is buffered now. Public so the daemon can flush on shutdown. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const snapshot = pruneWindow(this.buffer, Date.now(), this.windowMs);
    this.buffer = [];
    if (snapshot.length === 0) return;
    try {
      await this.analyzeEvents(snapshot);
    } catch (err) {
      log.error("incident analysis failed", { error: String(err) });
    }
  }

  /**
   * Analyze a specific set of events into an incident (used by the correlation
   * flush and by `mort incident --last`). Returns null when there's no brain or
   * no events. Persists, writes a report, and notifies listeners on success.
   */
  async analyzeEvents(events: NormalizedEvent[]): Promise<Incident | null> {
    if (events.length === 0 || !this.brain.isConfigured()) return null;

    const history = await recentIncidentSummaries(this.db, 10);
    const result = await askJson(
      (p) => this.brain.ask(p),
      buildIncidentPrompt(events, history),
      IncidentAnalysis,
    );

    const incident = result.ok
      ? this.fromAnalysis(result.data, events)
      : this.fromRaw(result.raw, events);

    incident.reportPath = writeReport(this.reportsDir, incident);
    await this.persist(incident);
    this.publishDetected(incident);
    for (const listener of this.listeners) listener(toIncidentView(incident));
    return incident;
  }

  private fromAnalysis(a: IncidentAnalysis, events: NormalizedEvent[]): Incident {
    return {
      id: randomUUID(),
      detectedAt: new Date().toISOString(),
      severity: a.severity,
      title: a.title,
      rootCause: a.root_cause,
      suggestedAction: a.suggested_action,
      patternMatch: a.pattern_match,
      confidence: a.confidence,
      timeline: a.timeline.map((t) => ({
        time: formatClock(t.timestamp),
        text: t.event,
        source: t.source,
      })),
      eventIds: events.map((e) => e.id),
      brainLabel: this.brainLabel,
    };
  }

  // Brain returned unparseable JSON even after a retry — record what we can.
  private fromRaw(raw: string, events: NormalizedEvent[]): Incident {
    const severity = events.some((e) => e.severity === "critical") ? "critical" : "error";
    return {
      id: randomUUID(),
      detectedAt: new Date().toISOString(),
      severity,
      title: "Incident detected (unstructured analysis)",
      rootCause: raw.slice(0, 2000) || null,
      suggestedAction: null,
      patternMatch: null,
      timeline: events.map((e) => ({
        time: formatClock(e.timestamp),
        text: e.summary,
        source: e.source,
        severity: e.severity,
      })),
      eventIds: events.map((e) => e.id),
      brainLabel: this.brainLabel,
    };
  }

  private async persist(incident: Incident): Promise<void> {
    await insertIncident(this.db, {
      id: incident.id,
      detectedAt: incident.detectedAt,
      severity: incident.severity,
      title: incident.title,
      rootCause: incident.rootCause,
      timeline: incident.timeline,
      suggestedAction: incident.suggestedAction,
      eventIds: incident.eventIds,
      postmortemPath: incident.reportPath ?? null,
    });
  }

  private publishDetected(incident: Incident): void {
    bus.publish({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      source: "postmortem",
      type: "incident.detected",
      severity: incident.severity,
      raw: incident.rootCause ?? incident.title,
      summary: `incident · ${incident.title}`,
      metadata: {},
      payload: { incidentId: incident.id, reportPath: incident.reportPath ?? null },
    });
  }
}
