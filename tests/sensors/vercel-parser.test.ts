import { describe, expect, it } from "vitest";
import {
  deploymentEvent,
  isProduction,
  normalizeState,
  parseDeploymentLog,
  type VercelDeployment,
} from "../../src/sensors/vercel/parser.js";

const base: VercelDeployment = {
  uid: "dpl_1",
  name: "acme",
  url: "acme-abc.vercel.app",
  meta: { githubCommitRef: "main", githubCommitSha: "4f2a9c1" },
};

describe("normalizeState", () => {
  it("maps Vercel ready states", () => {
    expect(normalizeState({ ...base, readyState: "BUILDING" })).toBe("building");
    expect(normalizeState({ ...base, readyState: "READY" })).toBe("ready");
    expect(normalizeState({ ...base, readyState: "ERROR" })).toBe("error");
    expect(normalizeState({ ...base, state: "QUEUED" })).toBe("queued");
    expect(normalizeState({ ...base, readyState: "WHATEVER" })).toBe("unknown");
  });
});

describe("deploymentEvent", () => {
  it("emits deploy.started for building", () => {
    const e = deploymentEvent(base, "building");
    expect(e?.type).toBe("deploy.started");
    expect(e?.severity).toBe("info");
  });

  it("emits deploy.succeeded for ready", () => {
    expect(deploymentEvent(base, "ready")?.type).toBe("deploy.succeeded");
  });

  it("emits critical deploy.failed for a production error", () => {
    const e = deploymentEvent({ ...base, target: "production" }, "error", "Build error: boom");
    expect(e?.type).toBe("deploy.failed");
    expect(e?.severity).toBe("critical");
    expect(e?.raw).toContain("Build error: boom");
    expect(e?.summary).toContain("production");
  });

  it("emits error (not critical) deploy.failed for a preview error", () => {
    const e = deploymentEvent({ ...base, target: null }, "error");
    expect(e?.severity).toBe("error");
    expect(e?.raw).toBe("Deployment marked ERROR");
  });

  it("carries branch and commit metadata", () => {
    const e = deploymentEvent(base, "building");
    expect(e?.metadata.branch).toBe("main");
    expect(e?.metadata.commit).toBe("4f2a9c1");
  });

  it("returns null for states we don't surface", () => {
    expect(deploymentEvent(base, "queued")).toBeNull();
    expect(deploymentEvent(base, "canceled")).toBeNull();
  });

  it("marks a production build (isProduction)", () => {
    expect(isProduction({ ...base, target: "production" })).toBe(true);
    expect(isProduction({ ...base, target: null })).toBe(false);
  });
});

describe("parseDeploymentLog", () => {
  it("prefers error-ish lines and truncates", () => {
    const text = parseDeploymentLog([
      { payload: { text: "Installing dependencies" } },
      { payload: { text: "Error: Cannot resolve 'axios'" } },
      { payload: { text: "Build failed" } },
    ]);
    expect(text).toContain("Cannot resolve 'axios'");
    expect(text).toContain("Build failed");
    expect(text).not.toContain("Installing dependencies");
  });

  it("falls back to all text when nothing looks error-ish", () => {
    expect(parseDeploymentLog([{ payload: { text: "hello" } }])).toBe("hello");
  });
});
