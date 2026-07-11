import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { DEMO_DURATION_MS, DemoSensor } from "../../src/sensors/demo/index.js";

describe("DemoSensor", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("replays the scripted incident through the bus", async () => {
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new DemoSensor();

    await sensor.start({});
    await vi.advanceTimersByTimeAsync(DEMO_DURATION_MS + 100);
    unsubscribe();

    expect(captured.length).toBeGreaterThanOrEqual(5);
    expect(captured.some((e) => e.type === "git.push")).toBe(true);
    expect(captured.some((e) => e.type === "deploy.failed" && e.severity === "critical")).toBe(
      true,
    );
    expect(captured.some((e) => e.type === "health.degraded")).toBe(true);
    await sensor.stop();
  });

  it("cancels pending events on stop", async () => {
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new DemoSensor();

    await sensor.start({});
    await sensor.stop(); // stop before any timer fires
    await vi.advanceTimersByTimeAsync(DEMO_DURATION_MS + 100);
    unsubscribe();

    expect(captured).toHaveLength(0);
  });
});
