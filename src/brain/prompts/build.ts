// Build-failure analysis prompt. A failed build IS an incident, so the response
// reuses the IncidentAnalysis schema — this prompt just focuses the model on build
// logs (module resolution, type errors, missing env, dependency breakage).

import type { NormalizedEvent } from "../../core/event.js";
import type { IncidentAnalysis } from "./incident.js";
import { MAX_EVENTS, MAX_RAW_CHARS } from "./incident.js";

export function buildBuildFailurePrompt(events: NormalizedEvent[]): string {
  const eventLines = events
    .slice(-MAX_EVENTS)
    .map(
      (e) =>
        `[${e.timestamp}] [${e.source}] [${e.type}] ${e.summary}\nLOG: ${e.raw.slice(0, MAX_RAW_CHARS)}`,
    )
    .join("\n\n");

  return `You are postmortem, an ops intelligence tool. A build or deployment failed. Analyze the logs below and explain why, focusing on the concrete failure: module resolution, type errors, missing environment variables, dependency or lockfile breakage, function size limits, or timeouts.

BUILD/DEPLOY EVENTS (chronological):
${eventLines}

Respond with a JSON object only, no markdown, no preamble:
{
  "title": "one-line failure title",
  "severity": "info|warning|error|critical",
  "root_cause": "2-3 sentence explanation of what broke the build",
  "timeline": [
    { "timestamp": "ISO8601", "event": "what happened", "source": "which sensor" }
  ],
  "suggested_action": "specific fix — a command, a pin, or a file to change",
  "pattern_match": "null or description of a similar past failure",
  "confidence": "high|medium|low"
}`;
}

export type { IncidentAnalysis as BuildAnalysis };
