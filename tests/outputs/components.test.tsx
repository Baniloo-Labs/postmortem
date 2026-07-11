import { render } from "ink-testing-library";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "../../src/core/event.js";
import { BrainIndicator } from "../../src/outputs/terminal/components/BrainIndicator.js";
import { Dashboard } from "../../src/outputs/terminal/components/Dashboard.js";
import { EventStream } from "../../src/outputs/terminal/components/EventStream.js";
import { Header } from "../../src/outputs/terminal/components/Header.js";
import { IncidentCard } from "../../src/outputs/terminal/components/IncidentCard.js";
import { SensorStatus } from "../../src/outputs/terminal/components/SensorStatus.js";
import type { SensorHealth } from "../../src/sensors/index.js";

function frameOf(node: ReactElement): string {
  const { lastFrame, unmount } = render(node);
  const out = lastFrame() ?? "";
  unmount();
  return out;
}

function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: "2026-07-11T14:32:01.000Z",
    source: "vercel",
    type: "deploy.failed",
    severity: "critical",
    raw: "boom",
    summary: "deploy failed · main",
    metadata: {},
    payload: {},
    ...overrides,
  };
}

const sensors: SensorHealth[] = [
  { name: "git", displayName: "Git", healthy: true, message: "watching", lastCheck: "" },
  { name: "logfile", displayName: "Log Files", healthy: false, message: "missing", lastCheck: "" },
];

describe("Header", () => {
  it("shows the ☠ postmortem logo, version, and sensor count", () => {
    const frame = frameOf(
      <Header
        version="0.1.0"
        brain={{ kind: "claude-cli", model: "claude-sonnet-4-6" }}
        sensorCount={4}
      />,
    );
    expect(frame).toContain("☠ postmortem");
    expect(frame).toContain("v0.1.0");
    expect(frame).toContain("watching 4 sensors");
  });
});

describe("BrainIndicator", () => {
  it("shows the active model and backend label", () => {
    const frame = frameOf(
      <BrainIndicator brain={{ kind: "claude-cli", model: "claude-sonnet-4-6" }} />,
    );
    expect(frame).toContain("claude-sonnet-4-6");
    expect(frame).toContain("claude code");
  });

  it("shows a disabled state when no brain is configured", () => {
    const frame = frameOf(<BrainIndicator brain={{ kind: null }} />);
    expect(frame).toContain("no brain");
  });
});

describe("SensorStatus", () => {
  it("renders sensor names with health markers", () => {
    const frame = frameOf(<SensorStatus sensors={sensors} />);
    expect(frame).toContain("SENSORS");
    expect(frame).toContain("git");
    expect(frame).toContain("logfile");
    expect(frame).toContain("●"); // healthy marker
    expect(frame).toContain("✗"); // unhealthy marker
  });
});

describe("EventStream", () => {
  it("renders event summaries and sources", () => {
    const frame = frameOf(
      <EventStream events={[event({ summary: "git push · main", source: "git" })]} />,
    );
    expect(frame).toContain("EVENT STREAM");
    expect(frame).toContain("git push · main");
    expect(frame).toMatch(/\d{2}:\d{2}:\d{2}/); // clock is rendered in local time
  });

  it("shows a waiting state when empty", () => {
    expect(frameOf(<EventStream events={[]} />)).toContain("waiting for events");
  });
});

describe("IncidentCard", () => {
  it("prefixes every AI section with the ☠ and shows the timeline", () => {
    const frame = frameOf(
      <IncidentCard
        incident={{
          title: "Build failed · main",
          severity: "critical",
          detectedAt: "2026-07-11T14:33:00.000Z",
          durationLabel: "~4 minutes",
          rootCause: "axios upgrade broke interceptors",
          suggestedAction: "pin axios to 1.6.2",
          confidence: "medium",
          patternMatch: "similar on 2024-11-14",
          timeline: [{ time: "14:29:01", text: "push to main", source: "git", severity: "info" }],
          reportPath: "~/.postmortem/reports/2026-07-11-1433.md",
        }}
      />,
    );
    expect(frame).toContain("☠ INCIDENT DETECTED");
    expect(frame).toContain("☠ ROOT CAUSE");
    expect(frame).toContain("confidence: medium");
    expect(frame).toContain("☠ SUGGESTED ACTION");
    expect(frame).toContain("axios upgrade broke interceptors");
    expect(frame).toContain("TIMELINE");
    expect(frame).toContain("push to main");
    expect(frame).toContain("PATTERN MATCH");
    expect(frame).toContain("~/.postmortem/reports/2026-07-11-1433.md");
  });

  it("omits AI sections that have no content", () => {
    const frame = frameOf(
      <IncidentCard
        incident={{
          title: "partial",
          severity: "error",
          detectedAt: "2026-07-11T14:33:00.000Z",
          timeline: [],
        }}
      />,
    );
    expect(frame).not.toContain("ROOT CAUSE");
    expect(frame).not.toContain("SUGGESTED ACTION");
  });
});

describe("Dashboard", () => {
  it("composes header, sensors, events, and the incident card", () => {
    const frame = frameOf(
      <Dashboard
        version="0.1.0"
        brain={{ kind: "ollama", model: "llama3" }}
        sensors={sensors}
        events={[event({ summary: "deploy failed · main" })]}
        activeIncident={{
          title: "Build failed",
          severity: "critical",
          detectedAt: "2026-07-11T14:33:00.000Z",
          rootCause: "dep bump",
          timeline: [],
        }}
      />,
    );
    expect(frame).toContain("☠ postmortem");
    expect(frame).toContain("SENSORS");
    expect(frame).toContain("EVENT STREAM");
    expect(frame).toContain("deploy failed · main");
    expect(frame).toContain("☠ INCIDENT DETECTED");
    expect(frame).toContain("dashboard → http://localhost:6660");
  });
});
