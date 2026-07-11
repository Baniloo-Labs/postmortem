// View-model types the terminal components render. Deliberately decoupled from db
// rows and NormalizedEvent internals so components stay pure and presentational.

import type { BrainBackendKind } from "../../brain/index.js";
import type { EventSeverity } from "../../core/event.js";

export interface BrainStatus {
  kind: BrainBackendKind | null;
  model?: string;
}

export interface TimelineEntry {
  time: string; // preformatted clock or ISO
  text: string;
  source: string;
  severity?: EventSeverity;
}

export interface IncidentView {
  title: string;
  severity: EventSeverity;
  detectedAt: string; // ISO
  durationLabel?: string;
  rootCause?: string;
  suggestedAction?: string;
  patternMatch?: string | null;
  confidence?: "high" | "medium" | "low";
  timeline: TimelineEntry[];
  reportPath?: string;
}
