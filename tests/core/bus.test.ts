import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { bus, MORT_EVENT, type MortBus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";

function event(): NormalizedEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "logfile",
    type: "log.error",
    severity: "error",
    raw: "ERROR connection timeout",
    summary: "logfile · ERROR timeout",
    metadata: {},
    payload: {},
  };
}

describe("bus", () => {
  it("delivers a published event to a subscriber", () => {
    const seen: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => seen.push(e));
    const sent = event();

    bus.publish(sent);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(sent);
    unsubscribe();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.publish(event());
    unsubscribe();
    bus.publish(event());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fans out to multiple subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.subscribe(a);
    const unsubB = bus.subscribe(b);

    bus.publish(event());

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it("publishes on the MORT_EVENT channel", () => {
    const listener = vi.fn();
    const typed: MortBus = bus;
    typed.on(MORT_EVENT, listener);

    bus.publish(event());

    expect(listener).toHaveBeenCalledTimes(1);
    typed.off(MORT_EVENT, listener);
  });
});
