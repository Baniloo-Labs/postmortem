// The base every sensor extends. A sensor watches one source and emits
// NormalizedEvents onto the bus — nothing downstream knows which sensor produced
// one. This class is where the two non-negotiable boundary rules live, so no
// individual sensor can forget them:
//   1. secrets are redacted (raw, summary, metadata, payload) before the event
//      ever reaches the bus (and therefore before persist or AI), and
//   2. the event is Zod-validated; a malformed event is dropped and logged, never
//      published — a sensor bug must not corrupt the bus or crash the daemon.

import { randomUUID } from "node:crypto";
import { bus } from "../core/bus.js";
import { type NormalizedEvent, safeParseEvent } from "../core/event.js";
import { createLogger } from "../core/logger.js";
import { redact, redactDeep } from "../core/redact.js";

const log = createLogger("sensor");

/** What a sensor supplies to emit(): everything but the id and timestamp. */
export type SensorEvent = Omit<NormalizedEvent, "id" | "timestamp">;

export interface SensorHealthResult {
  healthy: boolean;
  message: string;
}

/**
 * The one place events enter the bus. Stamps id/timestamp, redacts secrets
 * (raw/summary/metadata/payload), and Zod-validates. An invalid event is dropped
 * and logged, never thrown — publishers run inside async callbacks (sensors, the
 * webhook route) where a throw would go unhandled. Shared by BaseSensor.emit and
 * the webhook receiver so neither can bypass redaction or validation.
 */
export function publishEvent(event: SensorEvent): void {
  const candidate: NormalizedEvent = {
    ...event,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    raw: redact(event.raw),
    summary: redact(event.summary),
    metadata: redactDeep(event.metadata),
    payload: redactDeep(event.payload),
  };

  const result = safeParseEvent(candidate);
  if (!result.success) {
    log.error(`${event.source}: dropped invalid event`, {
      type: event.type,
      issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    });
    return;
  }
  bus.publish(result.data);
}

export abstract class BaseSensor {
  abstract readonly name: string;
  abstract readonly displayName: string;

  abstract start(config: Record<string, unknown>): Promise<void>;
  abstract stop(): Promise<void>;
  abstract healthCheck(): Promise<SensorHealthResult>;

  protected emit(event: SensorEvent): void {
    publishEvent(event);
  }
}
