import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { LogfileSensor } from "../../src/sensors/logfile/index.js";

let dir: string;
let file: string;
let sensor: LogfileSensor | null = null;
let captured: NormalizedEvent[] = [];
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mort-log-"));
  file = join(dir, "app.log");
  writeFileSync(file, "boot ok\n");
  captured = [];
  unsubscribe = bus.subscribe((e) => captured.push(e));
});

afterEach(async () => {
  unsubscribe?.();
  await sensor?.stop();
  sensor = null;
  rmSync(dir, { recursive: true, force: true });
});

describe("LogfileSensor (integration)", () => {
  it("tails appended lines and classifies severity, ignoring non-matches", async () => {
    sensor = new LogfileSensor();
    await sensor.start({ enabled: true, paths: [file], patterns: ["ERROR", "FATAL"] });

    appendFileSync(file, "ERROR db connection lost\nINFO all good\nFATAL out of memory\n");
    await sensor.pump(file);

    // Presence assertions (robust to a possible concurrent watcher pump).
    expect(captured.some((e) => e.severity === "error" && e.raw.includes("ERROR"))).toBe(true);
    expect(captured.some((e) => e.severity === "critical" && e.raw.includes("FATAL"))).toBe(true);
    expect(captured.some((e) => e.raw.includes("INFO"))).toBe(false);
  });

  it("does not replay history written before start()", async () => {
    writeFileSync(file, "ERROR old error before we started watching\n");
    sensor = new LogfileSensor();
    await sensor.start({ enabled: true, paths: [file], patterns: ["ERROR"] });

    await sensor.pump(file); // nothing new appended
    expect(captured).toHaveLength(0);
  });

  it("reports unhealthy when a configured file is missing", async () => {
    sensor = new LogfileSensor();
    await sensor.start({ enabled: true, paths: [join(dir, "nope.log")], patterns: ["ERROR"] });
    expect((await sensor.healthCheck()).healthy).toBe(false);
  });
});
