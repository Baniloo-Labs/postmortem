import { describe, expect, it } from "vitest";
import { isSignificant, pruneWindow, shouldAnalyze } from "../../src/incidents/correlate.js";

describe("isSignificant", () => {
  it("is true only for error and critical", () => {
    expect(isSignificant("critical")).toBe(true);
    expect(isSignificant("error")).toBe(true);
    expect(isSignificant("warning")).toBe(false);
    expect(isSignificant("info")).toBe(false);
  });
});

describe("shouldAnalyze", () => {
  it("triggers immediately on any critical", () => {
    expect(shouldAnalyze([{ severity: "critical", timestamp: "2026-07-11T00:00:00Z" }])).toBe(true);
  });
  it("triggers on 2+ significant events", () => {
    const t = "2026-07-11T00:00:00Z";
    expect(shouldAnalyze([{ severity: "error", timestamp: t }])).toBe(false);
    expect(
      shouldAnalyze([
        { severity: "error", timestamp: t },
        { severity: "error", timestamp: t },
      ]),
    ).toBe(true);
  });
});

describe("pruneWindow", () => {
  it("drops events older than the window", () => {
    const now = Date.parse("2026-07-11T00:10:00Z");
    const events = [
      { severity: "error" as const, timestamp: "2026-07-11T00:00:00Z" }, // 10 min old
      { severity: "error" as const, timestamp: "2026-07-11T00:08:00Z" }, // 2 min old
    ];
    const kept = pruneWindow(events, now, 5 * 60_000);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.timestamp).toBe("2026-07-11T00:08:00Z");
  });
});
