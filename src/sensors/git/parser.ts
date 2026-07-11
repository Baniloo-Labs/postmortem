// Pure git parsing + change detection. No I/O here — the sensor does the spawning
// and hands raw output to these functions, which stay trivially unit-testable.

import { basename } from "node:path";
import type { SensorEvent } from "../base.js";

export interface GitState {
  sha: string | null;
  branch: string | null;
}

export interface CommitInfo {
  sha: string;
  author: string;
  subject: string;
}

export interface FullGitState extends GitState {
  commit: CommitInfo | null;
}

/** Parse `git log -1 --format=%H%n%an%n%s` output into a commit. */
export function parseCommit(raw: string): CommitInfo | null {
  const lines = raw.trim().split("\n");
  const sha = lines[0]?.trim();
  if (!sha) return null;
  return {
    sha,
    author: lines[1]?.trim() ?? "",
    subject: lines.slice(2).join("\n").trim(),
  };
}

/**
 * Given the previously-seen state and the current state, return the events to
 * emit. Emits nothing on first observation (prev fields null) so seeding the
 * sensor doesn't fire a spurious "new commit".
 */
export function diffGitState(prev: GitState, curr: FullGitState, repoPath: string): SensorEvent[] {
  const events: SensorEvent[] = [];
  const repo = basename(repoPath === "." ? process.cwd() : repoPath);

  if (curr.branch && prev.branch !== null && curr.branch !== prev.branch) {
    events.push({
      source: "git",
      type: "git.branch_changed",
      severity: "info",
      raw: `branch ${prev.branch} → ${curr.branch}`,
      summary: `git branch → ${curr.branch}`,
      metadata: { repo, branch: curr.branch },
      payload: { from: prev.branch, to: curr.branch },
    });
  }

  if (curr.sha && prev.sha !== null && curr.sha !== prev.sha) {
    const subject = curr.commit?.subject || curr.sha;
    events.push({
      source: "git",
      type: "git.commit",
      severity: "info",
      raw: subject,
      summary: `git commit · ${subject.slice(0, 60)}`,
      metadata: {
        repo,
        branch: curr.branch ?? undefined,
        commit: curr.sha,
        actor: curr.commit?.author || undefined,
      },
      payload: { sha: curr.sha, subject: curr.commit?.subject ?? null },
    });
  }

  return events;
}
