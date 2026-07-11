import { afterEach, describe, expect, it, vi } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { HealthCheckSensor } from "../../src/sensors/health-check/index.js";

const url = "https://api.example.com/health";

afterEach(() => vi.unstubAllGlobals());

describe("HealthCheckSensor", () => {
  it("emits degraded then recovered across transitions, silent while stable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new HealthCheckSensor();

    fetchMock.mockResolvedValueOnce({ status: 200 }); // start: healthy, silent
    await sensor.start({ endpoints: [url], interval_seconds: 3600 });

    fetchMock.mockResolvedValueOnce({ status: 200 }); // still up: silent
    await sensor.poll();

    fetchMock.mockResolvedValueOnce({ status: 500 }); // down: degraded
    await sensor.poll();

    fetchMock.mockResolvedValueOnce({ status: 200 }); // up: recovered
    await sensor.poll();

    await sensor.stop();
    unsubscribe();

    expect(captured.map((e) => e.type)).toEqual(["health.degraded", "health.recovered"]);
    expect(captured[0]?.severity).toBe("critical");
  });

  it("treats a timeout/abort as down", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new HealthCheckSensor();

    fetchMock.mockResolvedValueOnce({ status: 200 });
    await sensor.start({ endpoints: [url], interval_seconds: 3600 });

    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abort);
    await sensor.poll();
    await sensor.stop();
    unsubscribe();

    const degraded = captured.find((e) => e.type === "health.degraded");
    expect(degraded?.raw).toContain("timeout");
  });

  it("never probes an SSRF-blocked URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sensor = new HealthCheckSensor();

    await sensor.start({
      endpoints: ["http://169.254.169.254/latest/meta-data/", "http://localhost/health"],
      interval_seconds: 3600,
    });
    await sensor.poll();
    const health = await sensor.healthCheck();
    await sensor.stop();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(health.healthy).toBe(false); // no valid endpoints
  });
});
