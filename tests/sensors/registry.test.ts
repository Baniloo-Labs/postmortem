import { describe, expect, it, vi } from "vitest";
import { BaseSensor, type SensorHealthResult, SensorRegistry } from "../../src/sensors/index.js";

class StubSensor extends BaseSensor {
  constructor(
    readonly name: string,
    readonly displayName: string,
    private readonly behavior: {
      onStart?: () => void | Promise<void>;
      onHealth?: () => SensorHealthResult | Promise<SensorHealthResult>;
    } = {},
  ) {
    super();
  }
  started = false;
  stopped = false;
  async start(): Promise<void> {
    await this.behavior.onStart?.();
    this.started = true;
  }
  async stop(): Promise<void> {
    this.stopped = true;
  }
  async healthCheck(): Promise<SensorHealthResult> {
    return (await this.behavior.onHealth?.()) ?? { healthy: true, message: "ok" };
  }
}

const enabled = { git: { enabled: true }, logfile: { enabled: true }, boom: { enabled: true } };

describe("SensorRegistry isolation", () => {
  it("one sensor throwing on start does not stop the others", async () => {
    const good = new StubSensor("git", "Git");
    const bad = new StubSensor("boom", "Boom", {
      onStart: () => {
        throw new Error("kaboom");
      },
    });
    const registry = new SensorRegistry().register(good).register(bad);

    await expect(registry.startAll(enabled)).resolves.toBeUndefined();

    expect(good.started).toBe(true);
    const health = registry.getHealth();
    expect(health.find((h) => h.name === "git")?.healthy).toBe(true);
    expect(health.find((h) => h.name === "boom")?.healthy).toBe(false);
    expect(health.find((h) => h.name === "boom")?.message).toContain("kaboom");
  });

  it("skips disabled sensors and marks them disabled", async () => {
    const sensor = new StubSensor("git", "Git");
    const registry = new SensorRegistry().register(sensor);

    await registry.startAll({ git: { enabled: false } });

    expect(sensor.started).toBe(false);
    expect(registry.getHealth().find((h) => h.name === "git")?.message).toBe("disabled");
  });

  it("stops every sensor even if one stop() throws", async () => {
    const a = new StubSensor("a", "A");
    const b = new StubSensor("b", "B");
    vi.spyOn(a, "stop").mockRejectedValueOnce(new Error("stop failed"));
    const registry = new SensorRegistry().register(a).register(b);

    await expect(registry.stopAll()).resolves.toBeUndefined();
    expect(b.stopped).toBe(true);
  });

  it("records a thrown healthCheck as unhealthy", async () => {
    const sensor = new StubSensor("git", "Git", {
      onHealth: () => {
        throw new Error("probe failed");
      },
    });
    const registry = new SensorRegistry().register(sensor);

    const health = await registry.checkAll();
    expect(health[0]?.healthy).toBe(false);
    expect(health[0]?.message).toContain("probe failed");
  });
});
