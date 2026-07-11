// Actuator registry — STUB, ships in v1.0 as scaffold only (spec §16). Mirrors
// the sensor registry's isolation contract: when concrete actuators land (v1.1+),
// one actuator throwing must never take down the daemon.

import type { BaseActuator } from "./base.js";

export class ActuatorRegistry {
  private readonly actuators = new Map<string, BaseActuator>();

  register(actuator: BaseActuator): this {
    this.actuators.set(actuator.name, actuator);
    return this;
  }

  get(name: string): BaseActuator | undefined {
    return this.actuators.get(name);
  }

  list(): BaseActuator[] {
    return [...this.actuators.values()];
  }
}

/** Empty in v1.0 — no concrete actuators ship. The seam exists; that's the point. */
export function createActuatorRegistry(): ActuatorRegistry {
  return new ActuatorRegistry();
}

export type { ActuatorResult } from "./base.js";
export { BaseActuator } from "./base.js";
