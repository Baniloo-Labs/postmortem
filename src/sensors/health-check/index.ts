// Health-check sensor — polls configured HTTP endpoints, tracks status and
// latency, and emits health.degraded / health.recovered on transitions. User URLs
// are SSRF-guarded (no internal/metadata targets) and each probe has a timeout.

import { createLogger } from "../../core/logger.js";
import { BaseSensor, type SensorHealthResult } from "../base.js";
import { type Health, healthEvent, nextHealth, type ProbeResult } from "./parser.js";
import { checkUrl } from "./ssrf.js";

const log = createLogger("sensor:health-check");

interface HealthConfig {
  endpoints?: string[];
  interval_seconds?: number;
  timeout_seconds?: number;
}

export class HealthCheckSensor extends BaseSensor {
  readonly name = "health-check";
  readonly displayName = "Health Checks";

  private endpoints: string[] = [];
  private timeoutMs = 5000;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly lastHealth = new Map<string, Health>();

  async start(config: Record<string, unknown>): Promise<void> {
    const c = config as HealthConfig;
    // Drop SSRF-blocked URLs up front, loudly — they never get probed.
    this.endpoints = (c.endpoints ?? []).filter((url): url is string => {
      if (typeof url !== "string") return false;
      const check = checkUrl(url);
      if (!check.ok) log.warn(`blocked health-check URL: ${url} (${check.reason})`);
      return check.ok;
    });
    this.timeoutMs = (c.timeout_seconds ?? 5) * 1000;
    const interval = (c.interval_seconds ?? 30) * 1000;

    await this.poll();
    this.intervalId = setInterval(() => void this.poll(), interval);
  }

  /** Public for deterministic testing. Probes each endpoint once. */
  async poll(): Promise<void> {
    for (const url of this.endpoints) {
      const result = await this.probe(url);
      const event = healthEvent(result, this.lastHealth.get(url));
      this.lastHealth.set(url, nextHealth(result));
      if (event) this.emit(event);
    }
  }

  private async probe(url: string): Promise<ProbeResult> {
    // Re-check on every probe: config could have been reloaded with a bad URL.
    const check = checkUrl(url);
    if (!check.ok) return { url, ok: false, error: check.reason };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      // redirect: "manual" so a 3xx to an internal host can't bypass the guard.
      const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
      const latencyMs = Date.now() - started;
      return { url, ok: res.status < 500, status: res.status, latencyMs };
    } catch (err) {
      const error = (err as Error).name === "AbortError" ? "timeout" : String(err);
      return { url, ok: false, error, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  async stop(): Promise<void> {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async healthCheck(): Promise<SensorHealthResult> {
    if (this.endpoints.length === 0) {
      return { healthy: false, message: "no (valid) endpoints configured" };
    }
    return { healthy: true, message: `probing ${this.endpoints.length} endpoint(s)` };
  }
}
