// Webhook payload handling — HMAC verification and body → NormalizedEvent mapping.
// Pure/testable; the Fastify route in ./index.ts wires these to HTTP.

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { EventMetadata, EventSeverity, EventType } from "../core/event.js";
import type { SensorEvent } from "../sensors/base.js";

/**
 * Verify an HMAC-SHA256 signature over the raw request body. Accepts both
 * "sha256=<hex>" (GitHub style) and a bare hex digest. Timing-safe. A missing or
 * malformed signature is a failure.
 */
export function verifyHmac(
  secret: string,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (!/^[0-9a-f]+$/i.test(provided) || provided.length % 2 !== 0) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// The accepted webhook contract: `type` must be a known EventType (validated at
// the boundary). Everything else is optional with sensible defaults.
const WebhookBody = z.object({
  type: EventType,
  severity: EventSeverity.default("info"),
  summary: z.string().optional(),
  raw: z.string().default(""),
  metadata: EventMetadata.default({}),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const VALID_EVENT_TYPES = EventType.options;

/** Map a validated webhook body to a SensorEvent. Throws (ZodError) on bad input. */
export function webhookToEvent(source: string, body: unknown): SensorEvent {
  const b = WebhookBody.parse(body);
  return {
    source,
    type: b.type,
    severity: b.severity,
    raw: b.raw,
    summary: b.summary ?? `${source} · ${b.type}`,
    metadata: b.metadata,
    payload: b.payload,
  };
}
