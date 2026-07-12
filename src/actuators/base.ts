// Actuator architecture — STUB, ships in v1.0 as scaffold only (spec §16).
// No concrete actuators exist yet; the abstraction ships so the seam is real and
// v2 actuators (Telegram, GitHub issues, rollback, PagerDuty) plug in with zero
// changes to the pipeline. The community builds actuators; the harness is the
// product.

import type { Incident } from "../incidents/types.js";

export interface ActuatorResult {
  ok: boolean;
  message: string;
  /** Actuator-specific details (issue URL, message ts, rollback id, …). */
  detail?: Record<string, unknown>;
}

export abstract class BaseActuator {
  abstract readonly name: string;
  abstract readonly displayName: string;

  /**
   * Perform the action for an incident. Called by the brain/pipeline when action
   * is warranted (v1.1+ — nothing calls this in v1.0).
   */
  abstract execute(incident: Incident, config: Record<string, unknown>): Promise<ActuatorResult>;

  /** Human-readable description of what execute() would do — shown before acting. */
  abstract describe(incident: Incident): string;
}
