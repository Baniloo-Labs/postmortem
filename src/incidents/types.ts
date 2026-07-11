// The incident domain object — the shape the pipeline produces and that the
// report writer, the db repository, and the UI all consume.

import type { EventSeverity } from "../core/event.js";
import type { IncidentView, TimelineEntry } from "../outputs/terminal/types.js";

export interface Incident {
  id: string;
  detectedAt: string; // ISO
  severity: EventSeverity;
  title: string;
  rootCause: string | null;
  suggestedAction: string | null;
  patternMatch: string | null;
  confidence?: "high" | "medium" | "low";
  timeline: TimelineEntry[];
  eventIds: string[];
  reportPath?: string;
  brainLabel?: string; // e.g. "claude-sonnet-4-6 via claude-cli"
}

/** Project an Incident onto the terminal view model. */
export function toIncidentView(incident: Incident): IncidentView {
  return {
    title: incident.title,
    severity: incident.severity,
    detectedAt: incident.detectedAt,
    rootCause: incident.rootCause ?? undefined,
    suggestedAction: incident.suggestedAction ?? undefined,
    patternMatch: incident.patternMatch,
    confidence: incident.confidence,
    timeline: incident.timeline,
    reportPath: incident.reportPath,
  };
}
