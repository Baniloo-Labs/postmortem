// Demo sensor — powers `mort watch --demo`. Replays a bundled, canned incident
// sequence through the bus on a compressed timeline: a push, a build failure, a
// failed production deploy, and a health endpoint going red. No tokens, no config
// — this is the 60-second "try it before you trust it with API keys" experience.

import { createLogger } from "../../core/logger.js";
import { BaseSensor, type SensorEvent, type SensorHealthResult } from "../base.js";

const log = createLogger("sensor:demo");

interface ScriptedEvent {
  afterMs: number;
  event: SensorEvent;
}

// A believable production incident, told through the event stream.
const SCRIPT: ScriptedEvent[] = [
  {
    afterMs: 400,
    event: {
      source: "git",
      type: "git.push",
      severity: "info",
      raw: "pushed 1 commit to main (dependency bump)",
      summary: "git push · main",
      metadata: { branch: "main", commit: "4f2a9c1" },
      payload: { subject: "chore: bump axios 1.6.2 → 1.7.0" },
    },
  },
  {
    afterMs: 1400,
    event: {
      source: "vercel",
      type: "deploy.started",
      severity: "info",
      raw: "Deployment building for production",
      summary: "vercel deploy started · production",
      metadata: { branch: "main", url: "https://acme.vercel.app" },
      payload: {},
    },
  },
  {
    afterMs: 2800,
    event: {
      source: "vercel",
      type: "build.failed",
      severity: "error",
      raw: "Build error: Module not found: Error: Can't resolve 'axios/lib/interceptors' — 3 tests failed",
      summary: "vercel build failed · exit 1",
      metadata: { branch: "main" },
      payload: { exitCode: 1 },
    },
  },
  {
    afterMs: 3600,
    event: {
      source: "vercel",
      type: "deploy.failed",
      severity: "critical",
      raw: "Deployment marked ERROR (production)",
      summary: "vercel deploy failed · production",
      metadata: { branch: "main" },
      payload: {},
    },
  },
  {
    afterMs: 4800,
    event: {
      source: "health-check",
      type: "health.degraded",
      severity: "critical",
      raw: "GET /api/user → 500 (was 200) · latency 4200ms",
      summary: "health · /api/user 500",
      metadata: { url: "https://acme.app/api/user", duration_ms: 4200 },
      payload: { status: 500 },
    },
  },
];

export class DemoSensor extends BaseSensor {
  readonly name = "demo";
  readonly displayName = "Demo (replay)";

  private timers: NodeJS.Timeout[] = [];

  async start(_config: Record<string, unknown>): Promise<void> {
    log.info("replaying a canned incident sequence");
    for (const { afterMs, event } of SCRIPT) {
      this.timers.push(setTimeout(() => this.emit(event), afterMs));
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  async healthCheck(): Promise<SensorHealthResult> {
    return { healthy: true, message: "replaying demo incident" };
  }
}

/** How long the scripted sequence runs, for callers that want to time the demo. */
export const DEMO_DURATION_MS = Math.max(...SCRIPT.map((s) => s.afterMs));
