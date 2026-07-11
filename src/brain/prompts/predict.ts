// Pre-deploy prediction prompt — the hero command's brain. Risk-scores a git diff
// against the user's own incident history. Works from day one: with no history it
// still scores the diff alone (cold-start requirement, spec §11 / §18.5).

import { z } from "zod";
import type { IncidentHistoryItem } from "./incident.js";

export const Prediction = z.object({
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.enum(["high", "medium", "low"]),
  concerns: z.array(z.string()),
  likely_failure_points: z.array(z.string()),
  recommendation: z.enum(["go", "go-with-caution", "hold"]),
  reasoning: z.string(),
});
export type Prediction = z.infer<typeof Prediction>;

export const MAX_DIFF_CHARS = 3000;

export function buildPredictPrompt(diff: string, recentIncidents: IncidentHistoryItem[]): string {
  const history =
    recentIncidents.length > 0
      ? recentIncidents
          .slice(0, 10)
          .map((i) => `- ${i.title}: ${i.root_cause ?? "unknown"}`)
          .join("\n")
      : "(no incident history yet — score this diff on its own merits)";

  return `You are postmortem. A developer is about to deploy. Analyze this git diff and predict risk.

GIT DIFF:
${diff.slice(0, MAX_DIFF_CHARS)}

RECENT INCIDENTS (last 30 days):
${history}

Respond with JSON only:
{
  "risk_level": "low|medium|high|critical",
  "confidence": "high|medium|low",
  "concerns": ["list of specific concerns about this diff"],
  "likely_failure_points": ["what could break"],
  "recommendation": "go|go-with-caution|hold",
  "reasoning": "2-3 sentences"
}`;
}
