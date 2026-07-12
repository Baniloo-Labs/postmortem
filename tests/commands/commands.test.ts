import { describe, expect, it } from "vitest";
import { applyConfigSet, maskSecrets } from "../../src/commands/config.js";
import { exitCodeForRisk } from "../../src/commands/predict.js";
import { parseClock, parseSince, severityTheme } from "../../src/commands/util.js";
import { defaultConfig } from "../../src/core/config.js";
import { theme } from "../../src/outputs/terminal/theme.js";

describe("exitCodeForRisk (pre-push hook contract)", () => {
  it("blocks on critical (2)", () => {
    expect(exitCodeForRisk("critical")).toBe(2);
  });
  it("warns on high (1)", () => {
    expect(exitCodeForRisk("high")).toBe(1);
  });
  it("passes on medium and low (0)", () => {
    expect(exitCodeForRisk("medium")).toBe(0);
    expect(exitCodeForRisk("low")).toBe(0);
  });
});

describe("parseSince", () => {
  const now = Date.parse("2026-07-11T12:00:00.000Z");
  it("parses minutes/hours/days", () => {
    expect(parseSince("30m", now)).toBe("2026-07-11T11:30:00.000Z");
    expect(parseSince("6h", now)).toBe("2026-07-11T06:00:00.000Z");
    expect(parseSince("7d", now)).toBe("2026-07-04T12:00:00.000Z");
  });
  it("returns undefined for garbage", () => {
    expect(parseSince("soon", now)).toBeUndefined();
    expect(parseSince("10", now)).toBeUndefined();
  });
});

describe("severityTheme", () => {
  it("maps known severities and falls back to muted", () => {
    expect(severityTheme("critical")).toBe(theme.critical);
    expect(severityTheme("warning")).toBe(theme.warning);
    expect(severityTheme("nonsense")).toBe(theme.muted);
  });
});

describe("parseClock", () => {
  const now = Date.parse("2026-07-12T20:00:00.000Z");
  it("parses HH:MM into today's cutoff (local time)", () => {
    const iso = parseClock("14:30", now);
    expect(iso).toBeDefined();
    const d = new Date(iso as string);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
  it("rejects invalid clock strings", () => {
    expect(parseClock("25:00", now)).toBeUndefined();
    expect(parseClock("14:99", now)).toBeUndefined();
    expect(parseClock("2pm", now)).toBeUndefined();
  });
});

describe("applyConfigSet", () => {
  it("sets a string value and re-validates", () => {
    const { config, applied } = applyConfigSet(defaultConfig(), "brain.model", "claude-opus-4-8");
    expect(applied).toBe(true);
    expect(config.brain.model).toBe("claude-opus-4-8");
  });

  it("coerces booleans and numbers via JSON", () => {
    const a = applyConfigSet(defaultConfig(), "sensors.vercel.enabled", "true");
    expect(a.config.sensors.vercel.enabled).toBe(true);
    const b = applyConfigSet(defaultConfig(), "storage.retention_days", "60");
    expect(b.config.storage.retention_days).toBe(60);
  });

  it("throws on a value that fails schema validation", () => {
    expect(() => applyConfigSet(defaultConfig(), "brain.backend", "telepathy")).toThrow();
    expect(() => applyConfigSet(defaultConfig(), "storage.retention_days", "-5")).toThrow();
  });

  it("reports applied:false for an unknown key (Zod strips it)", () => {
    expect(applyConfigSet(defaultConfig(), "brain.nonsense", "x").applied).toBe(false);
    expect(applyConfigSet(defaultConfig(), "made.up.path", "x").applied).toBe(false);
  });

  it("does not mutate the input config", () => {
    const base = defaultConfig();
    applyConfigSet(base, "brain.model", "changed");
    expect(base.brain.model).toBe("claude-sonnet-4-6");
  });
});

describe("maskSecrets", () => {
  it("masks token/secret/api_key/password values, leaves others", () => {
    const toml = [
      'token = "abc123secret"',
      'anthropic_api_key = "sk-ant-xyz"',
      'secret = "hmacvalue"',
      'model = "claude-sonnet-4-6"',
      'repo_path = "."',
    ].join("\n");
    const masked = maskSecrets(toml);
    expect(masked).toContain('token = "***"');
    expect(masked).toContain('anthropic_api_key = "***"');
    expect(masked).toContain('secret = "***"');
    expect(masked).toContain('model = "claude-sonnet-4-6"'); // untouched
    expect(masked).toContain('repo_path = "."'); // untouched
    expect(masked).not.toContain("abc123secret");
    expect(masked).not.toContain("sk-ant-xyz");
  });

  it("leaves empty values as-is", () => {
    expect(maskSecrets('token = ""')).toBe('token = ""');
  });
});
