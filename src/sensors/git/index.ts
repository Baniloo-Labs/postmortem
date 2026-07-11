// Git sensor — watches a repo's .git directory via chokidar and emits commit and
// branch-change events. All git access is via `git` subprocesses (no libgit dep);
// the change-detection logic lives in the pure parser.

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import { createLogger } from "../../core/logger.js";
import { BaseSensor, type SensorHealthResult } from "../base.js";
import { diffGitState, type FullGitState, type GitState, parseCommit } from "./parser.js";

const execFileAsync = promisify(execFile);
const log = createLogger("sensor:git");

export class GitSensor extends BaseSensor {
  readonly name = "git";
  readonly displayName = "Git";

  private watcher: FSWatcher | null = null;
  private repoPath = ".";
  private prev: GitState = { sha: null, branch: null };
  private debounce: NodeJS.Timeout | null = null;

  async start(config: Record<string, unknown>): Promise<void> {
    this.repoPath = typeof config.repo_path === "string" ? config.repo_path : ".";
    // Seed current state so the first real change is a diff, not a replay.
    this.prev = await this.readState();

    const gitDir = join(this.repoPath, ".git");
    this.watcher = chokidar.watch([join(gitDir, "HEAD"), join(gitDir, "refs")], {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      depth: 4,
    });
    this.watcher.on("all", () => this.schedulePoll());
    log.info(`watching ${this.repoPath}`);
  }

  private schedulePoll(): void {
    // .git changes arrive in bursts; debounce so one commit is one poll.
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.poll(), 200);
  }

  /** Read current git state, diff against last seen, emit any changes. Public so
   *  tests can drive it deterministically without waiting on filesystem events. */
  async poll(): Promise<void> {
    try {
      const curr = await this.readFullState();
      for (const event of diffGitState(this.prev, curr, this.repoPath)) {
        this.emit(event);
      }
      this.prev = { sha: curr.sha, branch: curr.branch };
    } catch (err) {
      log.error("git poll failed", { error: String(err) });
    }
  }

  private async readState(): Promise<GitState> {
    const [sha, branch] = await Promise.all([
      this.git(["rev-parse", "HEAD"]),
      this.git(["rev-parse", "--abbrev-ref", "HEAD"]),
    ]);
    return { sha: sha?.trim() || null, branch: branch?.trim() || null };
  }

  private async readFullState(): Promise<FullGitState> {
    const base = await this.readState();
    let commit = null;
    if (base.sha) {
      const raw = await this.git(["log", "-1", "--format=%H%n%an%n%s"]);
      commit = raw ? parseCommit(raw) : null;
    }
    return { ...base, commit };
  }

  private async git(args: string[]): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd: this.repoPath });
      return stdout;
    } catch {
      return null;
    }
  }

  async stop(): Promise<void> {
    if (this.debounce) clearTimeout(this.debounce);
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  async healthCheck(): Promise<SensorHealthResult> {
    const sha = await this.git(["rev-parse", "HEAD"]);
    return sha
      ? { healthy: true, message: `watching ${this.repoPath}` }
      : { healthy: false, message: `not a git repository: ${this.repoPath}` };
  }
}
