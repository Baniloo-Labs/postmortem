import { describe, expect, it } from "vitest";
import {
  failedSteps,
  isDefaultBranch,
  isFailedRun,
  type Job,
  runEvent,
  type WorkflowRun,
} from "../../src/sensors/github-actions/parser.js";

const run: WorkflowRun = {
  id: 42,
  name: "CI",
  head_branch: "main",
  head_sha: "abc123",
  status: "completed",
  conclusion: "failure",
  html_url: "https://github.com/acme/app/actions/runs/42",
};

describe("isFailedRun", () => {
  it("is true only for completed + failure", () => {
    expect(isFailedRun(run)).toBe(true);
    expect(isFailedRun({ ...run, conclusion: "success" })).toBe(false);
    expect(isFailedRun({ ...run, status: "in_progress" })).toBe(false);
  });
});

describe("isDefaultBranch", () => {
  it("recognizes main and master", () => {
    expect(isDefaultBranch("main")).toBe(true);
    expect(isDefaultBranch("master")).toBe(true);
    expect(isDefaultBranch("feature/x")).toBe(false);
  });
});

describe("failedSteps", () => {
  it("collects failed step names across jobs", () => {
    const jobs: Job[] = [
      {
        name: "build",
        steps: [
          { name: "install", conclusion: "success" },
          { name: "test", conclusion: "failure" },
        ],
      },
      { name: "lint", steps: [{ name: "biome", conclusion: "failure" }] },
    ];
    expect(failedSteps(jobs)).toEqual(["build › test", "lint › biome"]);
  });
});

describe("runEvent", () => {
  it("is critical on the default branch", () => {
    const e = runEvent("acme/app", run, ["build › test"]);
    expect(e.type).toBe("build.failed");
    expect(e.severity).toBe("critical");
    expect(e.raw).toContain("build › test");
    expect(e.metadata.repo).toBe("acme/app");
    expect(e.metadata.commit).toBe("abc123");
  });

  it("is error on a non-default branch", () => {
    expect(runEvent("acme/app", { ...run, head_branch: "feature/x" }, []).severity).toBe("error");
  });
});
