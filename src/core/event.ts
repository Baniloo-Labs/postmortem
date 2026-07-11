// The NormalizedEvent — postmortem's only coupling point.
//
// Every sensor emits exactly this shape onto the bus. Nothing downstream (brain,
// db, outputs, dashboard) knows or cares which sensor produced an event. This
// contract is the seam the whole architecture pivots on — never bypass it.
//
// Zod 4 syntax: z.uuid() / z.iso.datetime() are top-level; z.record() requires
// an explicit key type.

import { z } from "zod";

export const EventSeverity = z.enum(["info", "warning", "error", "critical"]);
export type EventSeverity = z.infer<typeof EventSeverity>;

export const EventType = z.enum([
  "build.started",
  "build.succeeded",
  "build.failed",
  "deploy.started",
  "deploy.succeeded",
  "deploy.failed",
  "test.failed",
  "lint.failed",
  "git.commit",
  "git.push",
  "git.branch_changed",
  "log.error",
  "log.warning",
  "health.degraded",
  "health.recovered",
  "incident.detected",
  "incident.resolved",
]);
export type EventType = z.infer<typeof EventType>;

export const EventMetadata = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  actor: z.string().optional(),
  url: z.string().optional(),
  duration_ms: z.number().optional(),
});
export type EventMetadata = z.infer<typeof EventMetadata>;

export const NormalizedEvent = z.object({
  id: z.uuid(),
  timestamp: z.iso.datetime(),
  source: z.string().min(1), // 'vercel' | 'git' | 'logfile' | 'github-actions' | ...
  type: EventType,
  severity: EventSeverity,
  raw: z.string(), // original text, unparsed — secrets redacted before persist/AI
  summary: z.string().min(1), // one-line human-readable description
  metadata: EventMetadata,
  payload: z.record(z.string(), z.unknown()), // sensor-specific structured data
});
export type NormalizedEvent = z.infer<typeof NormalizedEvent>;

/**
 * Validate an unknown value as a NormalizedEvent, throwing on failure.
 * Sensors call this at the boundary before publishing — an invalid event is a
 * sensor bug, and we want it loud and local, not corrupting the bus.
 */
export function parseEvent(value: unknown): NormalizedEvent {
  return NormalizedEvent.parse(value);
}

/**
 * Non-throwing variant for places that want to branch on validity.
 */
export function safeParseEvent(value: unknown): ReturnType<typeof NormalizedEvent.safeParse> {
  return NormalizedEvent.safeParse(value);
}
