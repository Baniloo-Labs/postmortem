import { describe, expect, it } from "vitest";
import {
  type ActuatorResult,
  BaseActuator,
  createActuatorRegistry,
} from "../../src/actuators/index.js";
import type { Incident } from "../../src/incidents/types.js";

// A fake actuator proving the abstract contract is implementable as spec'd (§16).
class EchoActuator extends BaseActuator {
  readonly name = "echo";
  readonly displayName = "Echo";
  async execute(incident: Incident): Promise<ActuatorResult> {
    return { ok: true, message: `would act on ${incident.title}` };
  }
  describe(incident: Incident): string {
    return `echo ${incident.title}`;
  }
}

const incident: Incident = {
  id: "i1",
  detectedAt: "2026-07-11T14:33:00.000Z",
  severity: "critical",
  title: "prod down",
  rootCause: null,
  suggestedAction: null,
  patternMatch: null,
  timeline: [],
  eventIds: [],
};

describe("actuator scaffold (v1.0 stubs)", () => {
  it("ships an empty registry by default — no concrete actuators in v1.0", () => {
    expect(createActuatorRegistry().list()).toHaveLength(0);
  });

  it("the BaseActuator seam is implementable and registrable", async () => {
    const registry = createActuatorRegistry().register(new EchoActuator());
    const actuator = registry.get("echo");
    expect(actuator?.describe(incident)).toBe("echo prod down");
    await expect(actuator?.execute(incident, {})).resolves.toMatchObject({ ok: true });
  });
});
