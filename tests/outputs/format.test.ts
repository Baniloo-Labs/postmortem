import { describe, expect, it } from "vitest";
import { formatAge, formatClock, formatDateTime } from "../../src/outputs/terminal/format.js";

describe("formatClock", () => {
  it("renders HH:MM:SS", () => {
    expect(formatClock("2026-07-11T14:32:01.000Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
  it("falls back on garbage", () => {
    expect(formatClock("nope")).toBe("nope");
  });
});

describe("formatDateTime", () => {
  it("renders YYYY-MM-DD HH:MM (unambiguous, local)", () => {
    expect(formatDateTime("2026-07-11T14:32:01.000Z")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
  it("falls back on garbage", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatAge", () => {
  const now = Date.parse("2026-07-11T12:00:00.000Z");
  it("bucketizes into just now / m / h / d", () => {
    expect(formatAge("2026-07-11T11:59:50.000Z", now)).toBe("just now");
    expect(formatAge("2026-07-11T11:30:00.000Z", now)).toBe("30m ago");
    expect(formatAge("2026-07-11T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatAge("2026-07-09T12:00:00.000Z", now)).toBe("2d ago");
  });
});
