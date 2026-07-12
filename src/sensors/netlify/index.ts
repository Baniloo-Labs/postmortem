// Netlify sensor — the second most common deploy target. Polls the Netlify API v1
// per site for deploy state changes; the error text rides on the deploy object, so
// (unlike Vercel) no separate log fetch is needed. Production failures are
// critical; preview/branch failures are errors.

import type { Got } from "got";
import { createLogger } from "../../core/logger.js";
import { BaseSensor, type SensorHealthResult } from "../base.js";
import { apiClient } from "../http.js";
import {
  deploymentEvent,
  type NetlifyDeploy,
  type NetlifyState,
  normalizeState,
} from "./parser.js";

const log = createLogger("sensor:netlify");
const API = "https://api.netlify.com/api/v1";

interface NetlifyConfig {
  token?: string;
  site_ids?: string[];
  poll_interval_seconds?: number;
}

export class NetlifySensor extends BaseSensor {
  readonly name = "netlify";
  readonly displayName = "Netlify";

  private client: Got = apiClient();
  private token = "";
  private siteIds: string[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private readonly lastState = new Map<string, NetlifyState>();

  async start(config: Record<string, unknown>): Promise<void> {
    const c = config as NetlifyConfig;
    this.token = c.token || process.env.NETLIFY_TOKEN || "";
    this.client = apiClient(this.token);

    // Explicit site ids, else discover all sites once.
    this.siteIds =
      Array.isArray(c.site_ids) && c.site_ids.length > 0
        ? c.site_ids.filter((s): s is string => typeof s === "string")
        : await this.fetchSiteIds();

    const interval = (c.poll_interval_seconds ?? 30) * 1000;
    await this.poll(true); // seed without emitting
    this.intervalId = setInterval(() => void this.poll(false), interval);
  }

  private async fetchSiteIds(): Promise<string[]> {
    try {
      const res = await this.client.get(`${API}/sites`, { responseType: "json" });
      if (res.statusCode !== 200) return [];
      const sites = res.body as Array<{ id?: string }>;
      return Array.isArray(sites) ? sites.map((s) => s.id).filter((id): id is string => !!id) : [];
    } catch {
      return [];
    }
  }

  /** Public for deterministic testing. `seed` records state without emitting. */
  async poll(seed = false): Promise<void> {
    for (const siteId of this.siteIds) {
      await this.pollSite(siteId, seed);
    }
  }

  private async pollSite(siteId: string, seed: boolean): Promise<void> {
    try {
      const res = await this.client.get(`${API}/sites/${siteId}/deploys?per_page=20`, {
        responseType: "json",
      });
      if (res.statusCode !== 200) {
        log.warn(`netlify API ${res.statusCode} for site ${siteId}`);
        return;
      }
      const deploys = res.body as NetlifyDeploy[];
      for (const deploy of Array.isArray(deploys) ? deploys : []) {
        this.handleDeploy(deploy, seed);
      }
    } catch (err) {
      log.error("netlify poll failed", { siteId, error: String(err) });
    }
  }

  private handleDeploy(deploy: NetlifyDeploy, seed: boolean): void {
    const state = normalizeState(deploy);
    const previous = this.lastState.get(deploy.id);
    this.lastState.set(deploy.id, state);
    if (seed || previous === state) return;

    const event = deploymentEvent(deploy, state);
    if (event) this.emit(event);
  }

  async stop(): Promise<void> {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async healthCheck(): Promise<SensorHealthResult> {
    if (!this.token) return { healthy: false, message: "no token (set NETLIFY_TOKEN or config)" };
    try {
      const res = await this.client.get(`${API}/user`, { responseType: "json" });
      return res.statusCode === 200
        ? { healthy: true, message: `watching ${this.siteIds.length} site(s)` }
        : { healthy: false, message: `API ${res.statusCode} — check token` };
    } catch (err) {
      return { healthy: false, message: String(err) };
    }
  }
}
