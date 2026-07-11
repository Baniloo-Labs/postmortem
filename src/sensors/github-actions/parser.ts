// Pure GitHub Actions parsing. Maps a workflow run (+ its failed steps) into a
// build.failed event. No I/O — the sensor polls and fetches jobs.

import type { SensorEvent } from "../base.js";

export interface WorkflowRun {
  id: number;
  name?: string;
  head_branch?: string;
  head_sha?: string;
  status?: string; // queued | in_progress | completed
  conclusion?: string | null; // success | failure | cancelled | ...
  html_url?: string;
  run_started_at?: string;
}

export interface JobStep {
  name: string;
  conclusion?: string | null;
}
export interface Job {
  name: string;
  steps?: JobStep[];
}

/** A run is a failure once it's completed with conclusion "failure". */
export function isFailedRun(run: WorkflowRun): boolean {
  return run.status === "completed" && run.conclusion === "failure";
}

/** main/master failures are critical; other branches are errors. */
export function isDefaultBranch(branch: string | undefined): boolean {
  return branch === "main" || branch === "master";
}

/** Names of the steps that failed, across all jobs. */
export function failedSteps(jobs: Job[]): string[] {
  const names: string[] = [];
  for (const job of jobs) {
    for (const step of job.steps ?? []) {
      if (step.conclusion === "failure") names.push(`${job.name} › ${step.name}`);
    }
  }
  return names;
}

export function runEvent(repo: string, run: WorkflowRun, steps: string[]): SensorEvent {
  const critical = isDefaultBranch(run.head_branch);
  const stepText = steps.length > 0 ? `\nfailed steps:\n- ${steps.join("\n- ")}` : "";
  return {
    source: "github-actions",
    type: "build.failed",
    severity: critical ? "critical" : "error",
    raw: `Workflow "${run.name ?? "run"}" failed on ${run.head_branch ?? "?"}${stepText}`.slice(
      0,
      5000,
    ),
    summary: `github-actions ✗ ${run.name ?? "workflow"} · ${run.head_branch ?? "?"}`,
    metadata: {
      repo,
      branch: run.head_branch,
      commit: run.head_sha,
      url: run.html_url,
    },
    payload: { run_id: run.id, failed_steps: steps },
  };
}
