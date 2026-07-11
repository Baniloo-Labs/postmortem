import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, writeConfig } from "../../src/core/config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mort-config-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("defaultConfig", () => {
  it("fills sensible defaults", () => {
    const c = defaultConfig();
    expect(c.brain.backend).toBe("auto");
    expect(c.brain.model).toBe("claude-sonnet-4-6");
    expect(c.brain.ollama.host).toBe("http://localhost:11434");
    expect(c.storage.retention_days).toBe(30);
    expect(c.sensors.git.enabled).toBe(true);
    expect(c.sensors.vercel.enabled).toBe(false);
    expect(c.sensors.vercel.poll_interval_seconds).toBe(30);
  });
});

describe("loadConfig", () => {
  it("returns defaults when the file is missing", () => {
    const c = loadConfig(join(dir, "does-not-exist.toml"));
    expect(c.brain.backend).toBe("auto");
  });

  it("merges partial TOML over defaults", () => {
    const path = join(dir, "config.toml");
    writeFileSync(
      path,
      ["[brain]", 'backend = "openai-api"', "", "[sensors.vercel]", "enabled = true"].join("\n"),
    );
    const c = loadConfig(path);
    expect(c.brain.backend).toBe("openai-api");
    expect(c.brain.model).toBe("claude-sonnet-4-6"); // still defaulted
    expect(c.sensors.vercel.enabled).toBe(true);
  });

  it("rejects an invalid enum value", () => {
    const path = join(dir, "bad.toml");
    writeFileSync(path, '[brain]\nbackend = "telepathy"\n');
    expect(() => loadConfig(path)).toThrow();
  });

  it("rejects a non-positive retention window", () => {
    const path = join(dir, "bad2.toml");
    writeFileSync(path, "[storage]\nretention_days = 0\n");
    expect(() => loadConfig(path)).toThrow();
  });
});

describe("writeConfig", () => {
  it("round-trips through TOML", () => {
    const path = join(dir, "out.toml");
    const c = defaultConfig();
    c.sensors.vercel.enabled = true;
    c.sensors.vercel.token = "tok";
    writeConfig(c, path);

    const reloaded = loadConfig(path);
    expect(reloaded.sensors.vercel.enabled).toBe(true);
    expect(reloaded.sensors.vercel.token).toBe("tok");
  });

  it("writes the file owner-only (0600) on POSIX", () => {
    if (process.platform === "win32") return; // mode bits are a no-op on Windows
    const path = join(dir, "perms.toml");
    writeConfig(defaultConfig(), path);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
