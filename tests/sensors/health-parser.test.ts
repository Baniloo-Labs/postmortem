import { describe, expect, it } from "vitest";
import { healthEvent, isUp, nextHealth } from "../../src/sensors/health-check/parser.js";

const url = "https://api.example.com/health";

describe("healthEvent transitions", () => {
  it("is silent on a healthy first observation", () => {
    expect(healthEvent({ url, ok: true, status: 200 }, undefined)).toBeNull();
  });

  it("emits health.degraded (critical) on up→down", () => {
    const e = healthEvent({ url, ok: false, status: 500, latencyMs: 20 }, "up");
    expect(e?.type).toBe("health.degraded");
    expect(e?.severity).toBe("critical");
    expect(e?.summary).toContain("down");
  });

  it("emits health.degraded on a down first observation", () => {
    const e = healthEvent({ url, ok: false, error: "timeout" }, undefined);
    expect(e?.type).toBe("health.degraded");
    expect(e?.raw).toContain("timeout");
  });

  it("emits health.recovered on down→up", () => {
    const e = healthEvent({ url, ok: true, status: 200 }, "down");
    expect(e?.type).toBe("health.recovered");
    expect(e?.severity).toBe("info");
  });

  it("is silent when state is unchanged", () => {
    expect(healthEvent({ url, ok: true, status: 200 }, "up")).toBeNull();
    expect(healthEvent({ url, ok: false, status: 503 }, "down")).toBeNull();
  });

  it("classifies 5xx as down, <500 as up", () => {
    expect(isUp({ url, ok: true, status: 200 })).toBe(true);
    expect(nextHealth({ url, ok: false, status: 500 })).toBe("down");
  });
});
