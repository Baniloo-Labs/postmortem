import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBuildFailurePrompt } from "../../src/brain/prompts/build.js";
import {
  buildIncidentPrompt,
  IncidentAnalysis,
  MAX_RAW_CHARS,
} from "../../src/brain/prompts/incident.js";
import { buildPredictPrompt, Prediction } from "../../src/brain/prompts/predict.js";
import type { NormalizedEvent } from "../../src/core/event.js";

function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: randomUUID(),
    timestamp: "2026-07-11T14:33:00.000Z",
    source: "vercel",
    type: "deploy.failed",
    severity: "critical",
    raw: "Build error: module 'axios' not found",
    summary: "vercel deploy failed",
    metadata: {},
    payload: {},
    ...overrides,
  };
}

describe("buildIncidentPrompt", () => {
  it("includes event summaries and past incidents", () => {
    const prompt = buildIncidentPrompt(
      [event()],
      [{ detected_at: "2026-06-01", title: "axios break", root_cause: "interceptor change" }],
    );
    expect(prompt).toContain("vercel deploy failed");
    expect(prompt).toContain("axios break");
    expect(prompt).toContain("interceptor change");
  });

  it("notes when there is no incident history", () => {
    const prompt = buildIncidentPrompt([event()], []);
    expect(prompt).toContain("no prior incidents recorded");
  });

  it("truncates oversized raw blobs to the budget", () => {
    const huge = "x".repeat(MAX_RAW_CHARS + 500);
    const prompt = buildIncidentPrompt([event({ raw: huge })], []);
    expect(prompt).not.toContain("x".repeat(MAX_RAW_CHARS + 1));
  });
});

describe("buildPredictPrompt", () => {
  it("scores against incident history when present", () => {
    const prompt = buildPredictPrompt("diff --git a/auth.ts", [
      { detected_at: "2026-06-03", title: "session expiry", root_cause: "token bug" },
    ]);
    expect(prompt).toContain("auth.ts");
    expect(prompt).toContain("session expiry");
  });

  it("cold-starts gracefully with no history", () => {
    const prompt = buildPredictPrompt("diff --git a/x.ts", []);
    expect(prompt).toContain("no incident history yet");
  });
});

describe("buildBuildFailurePrompt", () => {
  it("focuses the model on build logs", () => {
    const prompt = buildBuildFailurePrompt([event({ type: "build.failed" })]);
    expect(prompt).toContain("build or deployment failed");
    expect(prompt).toContain("axios");
  });
});

describe("response schemas", () => {
  it("IncidentAnalysis accepts a valid analysis", () => {
    const parsed = IncidentAnalysis.safeParse({
      title: "Build failed",
      severity: "critical",
      root_cause: "axios upgrade",
      timeline: [{ timestamp: "2026-07-11T14:33:00Z", event: "build failed", source: "vercel" }],
      suggested_action: "pin axios",
      pattern_match: null,
      confidence: "medium",
    });
    expect(parsed.success).toBe(true);
  });

  it("IncidentAnalysis rejects an unknown severity", () => {
    const parsed = IncidentAnalysis.safeParse({
      title: "x",
      severity: "apocalyptic",
      root_cause: "y",
      timeline: [],
      suggested_action: "z",
      pattern_match: null,
      confidence: "high",
    });
    expect(parsed.success).toBe(false);
  });

  it("Prediction accepts a valid prediction", () => {
    const parsed = Prediction.safeParse({
      risk_level: "high",
      confidence: "medium",
      concerns: ["touches auth"],
      likely_failure_points: ["session handling"],
      recommendation: "go-with-caution",
      reasoning: "auth files changed",
    });
    expect(parsed.success).toBe(true);
  });

  it("Prediction rejects an invalid recommendation", () => {
    const parsed = Prediction.safeParse({
      risk_level: "high",
      confidence: "medium",
      concerns: [],
      likely_failure_points: [],
      recommendation: "yolo",
      reasoning: "x",
    });
    expect(parsed.success).toBe(false);
  });
});
