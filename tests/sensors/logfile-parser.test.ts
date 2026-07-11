import { describe, expect, it } from "vitest";
import { classifyLine, lineToEvent, splitLines } from "../../src/sensors/logfile/parser.js";

const patterns = ["ERROR", "FATAL", "Exception", "WARN"];

describe("classifyLine", () => {
  it("classifies ERROR as error severity", () => {
    expect(classifyLine("2026-07-11 ERROR connection lost", patterns)).toEqual({
      type: "log.error",
      severity: "error",
    });
  });

  it("classifies FATAL as critical", () => {
    expect(classifyLine("FATAL out of memory", patterns)?.severity).toBe("critical");
  });

  it("classifies WARN as a warning event", () => {
    expect(classifyLine("WARN retrying", patterns)).toEqual({
      type: "log.warning",
      severity: "warning",
    });
  });

  it("classifies an Exception as error", () => {
    expect(classifyLine("Uncaught Exception: boom", patterns)?.severity).toBe("error");
  });

  it("returns null when no pattern matches", () => {
    expect(classifyLine("INFO all good", patterns)).toBeNull();
  });

  it("defaults a matched custom pattern to error", () => {
    expect(classifyLine("something PANIC happened", ["PANIC"])).toEqual({
      type: "log.error",
      severity: "error",
    });
  });
});

describe("lineToEvent", () => {
  it("builds a logfile event with the file path in payload", () => {
    const event = lineToEvent("ERROR boom", "/var/log/app.log", {
      type: "log.error",
      severity: "error",
    });
    expect(event.source).toBe("logfile");
    expect(event.summary).toContain("app.log");
    expect(event.payload).toMatchObject({ file: "/var/log/app.log", line: "ERROR boom" });
  });
});

describe("splitLines", () => {
  it("splits complete lines and holds an incomplete remainder", () => {
    expect(splitLines("a\nb\nc")).toEqual({ lines: ["a", "b"], remainder: "c" });
  });

  it("handles CRLF endings", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual({ lines: ["a", "b"], remainder: "" });
  });

  it("returns no complete lines for a single partial line", () => {
    expect(splitLines("partial")).toEqual({ lines: [], remainder: "partial" });
  });
});
