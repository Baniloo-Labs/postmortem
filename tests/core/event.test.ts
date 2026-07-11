import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type NormalizedEvent, parseEvent, safeParseEvent } from "../../src/core/event.js";

function validEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "git",
    type: "git.push",
    severity: "info",
    raw: "pushed 3 commits to main",
    summary: "git push · main",
    metadata: { repo: "acme/app", branch: "main" },
    payload: { commits: 3 },
    ...overrides,
  };
}

describe("NormalizedEvent", () => {
  it("accepts a well-formed event", () => {
    const event = validEvent();
    expect(parseEvent(event)).toEqual(event);
  });

  it("rejects a non-uuid id", () => {
    const result = safeParseEvent(validEvent({ id: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    const result = safeParseEvent(validEvent({ timestamp: "2026-07-11 14:33" }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown event type", () => {
    const result = safeParseEvent(validEvent({ type: "deploy.exploded" as never }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown severity", () => {
    const result = safeParseEvent(validEvent({ severity: "fatal" as never }));
    expect(result.success).toBe(false);
  });

  it("rejects an empty source", () => {
    const result = safeParseEvent(validEvent({ source: "" }));
    expect(result.success).toBe(false);
  });

  it("allows empty metadata but requires the object", () => {
    expect(parseEvent(validEvent({ metadata: {} }))).toBeTruthy();
    const result = safeParseEvent({ ...validEvent(), metadata: undefined });
    expect(result.success).toBe(false);
  });

  it("preserves arbitrary payload shape", () => {
    const event = validEvent({ payload: { nested: { a: 1 }, list: [1, 2, 3] } });
    expect(parseEvent(event).payload).toEqual({ nested: { a: 1 }, list: [1, 2, 3] });
  });
});
