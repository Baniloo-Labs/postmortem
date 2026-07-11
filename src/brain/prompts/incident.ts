// Incident analysis prompt + the schema its response must satisfy.

import { z } from "zod";
import type { NormalizedEvent } from "../../core/event.js";

/** Lightweight view of a past incident, for pattern-matching in the prompt. */
export interface IncidentHistoryItem {
  detected_at: string;
  title: string;
  root_cause: string | null;
}

export const IncidentAnalysis = z.object({
  title: z.string(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  root_cause: z.string(),
  timeline: z.array(
    z.object({
      timestamp: z.string(),
      event: z.string(),
      source: z.string(),
    }),
  ),
  suggested_action: z.string(),
  pattern_match: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type IncidentAnalysis = z.infer<typeof IncidentAnalysis>;

// Per-window token budget: cap events and truncate each raw blob so a noisy
// window can't blow the prompt size (CLAUDE.md AI-cost rules).
export const MAX_EVENTS = 40;
export const MAX_RAW_CHARS = 500;

export function buildIncidentPrompt(
  events: NormalizedEvent[],
  recentHistory: IncidentHistoryItem[],
): string {
  const eventLines = events
    .slice(-MAX_EVENTS)
    .map(
      (e) =>
        `[${e.timestamp}] [${e.source}] [${e.type}] ${e.summary}\nRAW: ${e.raw.slice(0, MAX_RAW_CHARS)}`,
    )
    .join("\n\n");

  const historyLines =
    recentHistory.length > 0
      ? recentHistory
          .slice(0, 5)
          .map((i) => `- ${i.detected_at}: ${i.title} · root cause: ${i.root_cause ?? "unknown"}`)
          .join("\n")
      : "(no prior incidents recorded)";

  return `You are postmortem, an ops intelligence tool. Analyze the following events and produce a structured incident report.

RECENT EVENTS (chronological):
${eventLines}

RECENT INCIDENT HISTORY (for pattern matching):
${historyLines}

Respond with a JSON object only, no markdown, no preamble:
{
  "title": "one-line incident title",
  "severity": "info|warning|error|critical",
  "root_cause": "2-3 sentence explanation of what caused this",
  "timeline": [
    { "timestamp": "ISO8601", "event": "what happened", "source": "which sensor" }
  ],
  "suggested_action": "specific, actionable next step",
  "pattern_match": "null or description of similar past incident",
  "confidence": "high|medium|low"
}`;
}
