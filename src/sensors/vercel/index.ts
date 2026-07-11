// Vercel sensor ★ — the primary deployment target for new-age devs. Polls the
// Vercel REST API for deployment state changes and, on failure, fetches the build
// log. Production failures are critical; preview failures are errors.

import type { Got } from "got";
import { createLogger } from "../../core/logger.js";
import { BaseSensor, type SensorHealthResult } from "../base.js";
import { apiClient } from "../http.js";
import {
  deploymentEvent,
  normalizeState,
  parseDeploymentLog,
  type VercelDeployment,
  type VercelState,
} from "./parser.js";

const log = createLogger("sensor:vercel");
const API = "https://api.vercel.com";

interface VercelConfig {
  token?: string;
  team_id?: string;
  project_ids?: string[];
  poll_interval_seconds?: number;
}

export class VercelSensor extends BaseSensor {
  readonly name = "vercel";
  readonly displayName = "Vercel";

  private client: Got = apiClient();
  private token = "";
  private teamId = "";
  private intervalId: NodeJS.Timeout | null = null;
  private readonly lastState = new Map<string, VercelState>();

  async start(config: Record<string, unknown>): Promise<void> {
    const c = config as VercelConfig;
    this.token = c.token || process.env.VERCEL_TOKEN || "";
    this.teamId = c.team_id ?? "";
    this.client = apiClient(this.token);
    const interval = (c.poll_interval_seconds ?? 30) * 1000;

    // Seed known deployments so we don't replay history on first poll.
    await this.poll(true);
    this.intervalId = setInterval(() => void this.poll(false), interval);
  }

  /** Public for deterministic testing. `seed` records state without emitting. */
  async poll(seed = false): Promise<void> {
    try {
      const search = new URLSearchParams({ limit: "20" });
      if (this.teamId) search.set("teamId", this.teamId);
      const res = await this.client.get(`${API}/v6/deployments?${search.toString()}`, {
        responseType: "json",
      });
      if (res.statusCode !== 200) {
        log.warn(`vercel API ${res.statusCode}`);
        return;
      }
      const body = res.body as { deployments?: VercelDeployment[] };
      for (const deployment of body.deployments ?? []) {
        await this.handleDeployment(deployment, seed);
      }
    } catch (err) {
      log.error("vercel poll failed", { error: String(err) });
    }
  }

  private async handleDeployment(deployment: VercelDeployment, seed: boolean): Promise<void> {
    const state = normalizeState(deployment);
    const previous = this.lastState.get(deployment.uid);
    this.lastState.set(deployment.uid, state);
    if (seed || previous === state) return;

    const logText = state === "error" ? await this.fetchLog(deployment.uid) : undefined;
    const event = deploymentEvent(deployment, state, logText);
    if (event) this.emit(event);
  }

  private async fetchLog(uid: string): Promise<string | undefined> {
    try {
      const search = new URLSearchParams({ limit: "100" });
      if (this.teamId) search.set("teamId", this.teamId);
      const res = await this.client.get(
        `${API}/v2/deployments/${uid}/events?${search.toString()}`,
        {
          responseType: "json",
        },
      );
      if (res.statusCode !== 200) return undefined;
      const events = res.body as Array<{ type?: string; payload?: { text?: string } }>;
      return parseDeploymentLog(Array.isArray(events) ? events : []);
    } catch {
      return undefined;
    }
  }

  async stop(): Promise<void> {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async healthCheck(): Promise<SensorHealthResult> {
    if (!this.token) return { healthy: false, message: "no token (set VERCEL_TOKEN or config)" };
    try {
      const res = await this.client.get(`${API}/v9/user`, { responseType: "json" });
      return res.statusCode === 200
        ? { healthy: true, message: "connected" }
        : { healthy: false, message: `API ${res.statusCode} — check token` };
    } catch (err) {
      return { healthy: false, message: String(err) };
    }
  }
}
