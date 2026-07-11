// GitHub Actions sensor — polls workflow runs per repo and emits build.failed on
// failing runs, enriched with the specific failed steps. Uses ETag conditional
// requests (If-None-Match → 304) because the GitHub API rate-limits aggressively.

import type { Got } from "got";
import { createLogger } from "../../core/logger.js";
import { BaseSensor, type SensorHealthResult } from "../base.js";
import { apiClient } from "../http.js";
import { failedSteps, isFailedRun, type Job, runEvent, type WorkflowRun } from "./parser.js";

const log = createLogger("sensor:github-actions");
const API = "https://api.github.com";
const GH_HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};

interface GitHubConfig {
  token?: string;
  repos?: string[];
  poll_interval_seconds?: number;
}

export class GitHubActionsSensor extends BaseSensor {
  readonly name = "github-actions";
  readonly displayName = "GitHub Actions";

  private client: Got = apiClient();
  private token = "";
  private repos: string[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private readonly etags = new Map<string, string>();
  private readonly seen = new Map<string, Set<number>>();

  async start(config: Record<string, unknown>): Promise<void> {
    const c = config as GitHubConfig;
    this.token = c.token || process.env.GITHUB_TOKEN || "";
    this.repos = (c.repos ?? []).filter((r): r is string => typeof r === "string");
    this.client = apiClient(this.token);
    const interval = (c.poll_interval_seconds ?? 60) * 1000;

    await this.poll(true);
    this.intervalId = setInterval(() => void this.poll(false), interval);
  }

  /** Public for deterministic testing. `seed` records runs without emitting. */
  async poll(seed = false): Promise<void> {
    for (const repo of this.repos) {
      await this.pollRepo(repo, seed);
    }
  }

  private async pollRepo(repo: string, seed: boolean): Promise<void> {
    try {
      const etag = this.etags.get(repo);
      const res = await this.client.get(`${API}/repos/${repo}/actions/runs?per_page=20`, {
        responseType: "json",
        headers: { ...GH_HEADERS, ...(etag ? { "if-none-match": etag } : {}) },
      });
      if (res.statusCode === 304) return; // nothing changed since last poll
      if (res.statusCode !== 200) {
        log.warn(`github API ${res.statusCode} for ${repo}`);
        return;
      }
      const newEtag = res.headers.etag;
      if (typeof newEtag === "string") this.etags.set(repo, newEtag);

      const seenForRepo = this.seen.get(repo) ?? new Set<number>();
      this.seen.set(repo, seenForRepo);

      const body = res.body as { workflow_runs?: WorkflowRun[] };
      for (const run of body.workflow_runs ?? []) {
        if (seenForRepo.has(run.id)) continue;
        if (run.status === "completed") seenForRepo.add(run.id);
        if (!isFailedRun(run) || seed) continue;

        const steps = await this.fetchFailedSteps(repo, run.id);
        this.emit(runEvent(repo, run, steps));
      }
    } catch (err) {
      log.error("github poll failed", { repo, error: String(err) });
    }
  }

  private async fetchFailedSteps(repo: string, runId: number): Promise<string[]> {
    try {
      const res = await this.client.get(`${API}/repos/${repo}/actions/runs/${runId}/jobs`, {
        responseType: "json",
        headers: GH_HEADERS,
      });
      if (res.statusCode !== 200) return [];
      const body = res.body as { jobs?: Job[] };
      return failedSteps(body.jobs ?? []);
    } catch {
      return [];
    }
  }

  async stop(): Promise<void> {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async healthCheck(): Promise<SensorHealthResult> {
    if (this.repos.length === 0) return { healthy: false, message: "no repos configured" };
    if (!this.token) return { healthy: false, message: "no token (set GITHUB_TOKEN or config)" };
    try {
      const res = await this.client.get(`${API}/rate_limit`, {
        responseType: "json",
        headers: GH_HEADERS,
      });
      return res.statusCode === 200
        ? { healthy: true, message: `watching ${this.repos.length} repo(s)` }
        : { healthy: false, message: `API ${res.statusCode} — check token` };
    } catch (err) {
      return { healthy: false, message: String(err) };
    }
  }
}
