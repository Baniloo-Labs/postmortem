import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { GitSensor } from "../../src/sensors/git/index.js";

let repo: string;
let sensor: GitSensor | null = null;
let captured: NormalizedEvent[] = [];
let unsubscribe: (() => void) | undefined;

function git(args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "mort-git-"));
  git(["init", "-b", "main"]);
  git(["config", "user.email", "tester@example.com"]);
  git(["config", "user.name", "Tester"]);
  git(["commit", "--allow-empty", "-m", "first"]);
  captured = [];
  unsubscribe = bus.subscribe((e) => captured.push(e));
});

afterEach(async () => {
  unsubscribe?.();
  await sensor?.stop();
  sensor = null;
  rmSync(repo, { recursive: true, force: true });
});

describe("GitSensor (integration)", () => {
  it("emits a git.commit event on a new commit", async () => {
    sensor = new GitSensor();
    await sensor.start({ enabled: true, repo_path: repo });

    git(["commit", "--allow-empty", "-m", "second"]);
    await sensor.poll();

    const commit = captured.find((e) => e.type === "git.commit");
    expect(commit).toBeDefined();
    expect(commit?.payload.subject).toBe("second");
    expect(commit?.metadata.commit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("reports healthy for a real repository", async () => {
    sensor = new GitSensor();
    await sensor.start({ enabled: true, repo_path: repo });
    expect((await sensor.healthCheck()).healthy).toBe(true);
  });

  it("reports unhealthy for a non-repo path", async () => {
    const notRepo = mkdtempSync(join(tmpdir(), "mort-notgit-"));
    try {
      sensor = new GitSensor();
      await sensor.start({ enabled: true, repo_path: notRepo });
      expect((await sensor.healthCheck()).healthy).toBe(false);
    } finally {
      await sensor?.stop();
      sensor = null;
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});
