import { describe, expect, it } from "vitest";
import { HOOK_MARKER, isPostmortemHook, PRE_PUSH_SCRIPT } from "../../src/commands/hooks.js";
import { applyBrainChoice, applySetupAnswers } from "../../src/commands/setup.js";
import { defaultConfig } from "../../src/core/config.js";

describe("pre-push hook script", () => {
  it("carries the ownership marker and calls mort predict", () => {
    expect(PRE_PUSH_SCRIPT).toContain(HOOK_MARKER);
    expect(PRE_PUSH_SCRIPT).toContain("mort predict");
  });

  it("blocks on exit 2 and warns on exit 1", () => {
    expect(PRE_PUSH_SCRIPT).toContain('[ "$code" = "2" ]');
    expect(PRE_PUSH_SCRIPT).toContain('[ "$code" = "1" ]');
  });

  it("exits silently when mort is not on PATH", () => {
    expect(PRE_PUSH_SCRIPT).toContain("command -v mort");
  });

  it("detects a postmortem-owned hook vs a foreign one", () => {
    expect(isPostmortemHook(PRE_PUSH_SCRIPT)).toBe(true);
    expect(isPostmortemHook("#!/bin/sh\necho hi")).toBe(false);
  });
});

describe("applySetupAnswers", () => {
  it("maps answers onto a validated config", () => {
    const c = applySetupAnswers(defaultConfig(), {
      brainBackend: "anthropic-api",
      anthropicKey: "sk-ant-xxx",
      gitRepoPath: "/work/app",
      vercelEnabled: true,
      vercelToken: "vtok",
      netlifyEnabled: true,
      netlifyToken: "ntok",
      githubEnabled: true,
      githubToken: "gtok",
      githubRepos: ["acme/app", "acme/api"],
    });

    expect(c.brain.backend).toBe("anthropic-api");
    expect(c.brain.anthropic_api_key).toBe("sk-ant-xxx");
    expect(c.sensors.git.repo_path).toBe("/work/app");
    expect(c.sensors.vercel.enabled).toBe(true);
    expect(c.sensors.vercel.token).toBe("vtok");
    expect(c.sensors.netlify.enabled).toBe(true);
    expect(c.sensors.netlify.token).toBe("ntok");
    expect(c.sensors["github-actions"].enabled).toBe(true);
    expect(c.sensors["github-actions"].repos).toEqual(["acme/app", "acme/api"]);
  });

  it("defaults git repo path to '.' and leaves secrets unset when blank", () => {
    const c = applySetupAnswers(defaultConfig(), {
      brainBackend: "auto",
      gitRepoPath: "",
      vercelEnabled: false,
      netlifyEnabled: false,
      githubEnabled: false,
    });
    expect(c.sensors.git.repo_path).toBe(".");
    expect(c.brain.backend).toBe("auto");
    expect(c.sensors.vercel.enabled).toBe(false);
    expect(c.brain.anthropic_api_key).toBeUndefined();
  });

  it("applyBrainChoice sets only the brain, leaving sensors untouched", () => {
    const base = defaultConfig();
    base.sensors.vercel.enabled = true; // pre-existing sensor config
    const c = applyBrainChoice(base, { brainBackend: "claude-cli" });
    expect(c.brain.backend).toBe("claude-cli");
    expect(c.sensors.vercel.enabled).toBe(true); // preserved
    expect(base.brain.backend).toBe("auto"); // input not mutated
  });

  it("does not mutate the input config", () => {
    const base = defaultConfig();
    applySetupAnswers(base, {
      brainBackend: "ollama",
      gitRepoPath: "/x",
      vercelEnabled: true,
      netlifyEnabled: false,
      githubEnabled: false,
    });
    expect(base.brain.backend).toBe("auto");
    expect(base.sensors.vercel.enabled).toBe(false);
  });
});
