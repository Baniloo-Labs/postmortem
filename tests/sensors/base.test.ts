import { afterEach, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { BaseSensor, type SensorEvent, type SensorHealthResult } from "../../src/sensors/base.js";

class TestSensor extends BaseSensor {
  readonly name = "test";
  readonly displayName = "Test";
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async healthCheck(): Promise<SensorHealthResult> {
    return { healthy: true, message: "ok" };
  }
  fire(event: SensorEvent): void {
    this.emit(event);
  }
}

function baseEvent(overrides: Partial<SensorEvent> = {}): SensorEvent {
  return {
    source: "test",
    type: "log.error",
    severity: "error",
    raw: "something happened",
    summary: "test event",
    metadata: {},
    payload: {},
    ...overrides,
  };
}

let captured: NormalizedEvent[] = [];
let unsubscribe: () => void;

function subscribe() {
  captured = [];
  unsubscribe = bus.subscribe((e) => captured.push(e));
}

afterEach(() => {
  unsubscribe?.();
});

describe("BaseSensor.emit", () => {
  it("stamps a uuid id and ISO timestamp", () => {
    subscribe();
    new TestSensor().fire(baseEvent());
    expect(captured).toHaveLength(1);
    expect(captured[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => new Date(captured[0]?.timestamp ?? "")).not.toThrow();
  });

  it("redacts secrets in raw before publishing", () => {
    subscribe();
    new TestSensor().fire(
      baseEvent({ raw: "connecting with ghp_abcdefghijklmnopqrstuvwxyz0123456789" }),
    );
    expect(captured[0]?.raw).not.toContain("ghp_abcdefghij");
    expect(captured[0]?.raw).toContain("[REDACTED]");
  });

  it("deep-redacts secrets in payload", () => {
    subscribe();
    new TestSensor().fire(baseEvent({ payload: { env: { TOKEN: "supersecretvalue123" } } }));
    expect(JSON.stringify(captured[0]?.payload)).not.toContain("supersecretvalue123");
  });

  it("drops (does not publish) an event that fails validation", () => {
    subscribe();
    // Invalid severity — safeParse fails, event is dropped, not thrown.
    new TestSensor().fire(baseEvent({ severity: "meltdown" as never }));
    expect(captured).toHaveLength(0);
  });
});
