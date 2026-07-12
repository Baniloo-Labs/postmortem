import { describe, expect, it } from "vitest";
import {
  deploymentEvent,
  isProduction,
  type NetlifyDeploy,
  normalizeState,
} from "../../src/sensors/netlify/parser.js";

const base: NetlifyDeploy = {
  id: "dep_1",
  name: "acme",
  branch: "main",
  commit_ref: "4f2a9c1",
  deploy_ssl_url: "https://acme.netlify.app",
};

describe("normalizeState", () => {
  it("maps Netlify states", () => {
    expect(normalizeState({ ...base, state: "building" })).toBe("building");
    expect(normalizeState({ ...base, state: "enqueued" })).toBe("building");
    expect(normalizeState({ ...base, state: "ready" })).toBe("ready");
    expect(normalizeState({ ...base, state: "error" })).toBe("error");
    expect(normalizeState({ ...base, state: "cancelled" })).toBe("other");
  });
});

describe("deploymentEvent", () => {
  it("emits deploy.started / succeeded", () => {
    expect(deploymentEvent(base, "building")?.type).toBe("deploy.started");
    expect(deploymentEvent(base, "ready")?.type).toBe("deploy.succeeded");
  });

  it("critical production failure carries the error_message", () => {
    const e = deploymentEvent(
      { ...base, context: "production", error_message: "Build failed: plugin error" },
      "error",
    );
    expect(e?.type).toBe("deploy.failed");
    expect(e?.severity).toBe("critical");
    expect(e?.raw).toContain("plugin error");
    expect(e?.summary).toContain("production");
  });

  it("preview failure is error, not critical", () => {
    const e = deploymentEvent({ ...base, context: "deploy-preview" }, "error");
    expect(e?.severity).toBe("error");
    expect(e?.raw).toBe("Deploy marked error");
  });

  it("carries branch and commit metadata; null for unsurfaced states", () => {
    const e = deploymentEvent(base, "building");
    expect(e?.metadata.branch).toBe("main");
    expect(e?.metadata.commit).toBe("4f2a9c1");
    expect(deploymentEvent(base, "other")).toBeNull();
  });

  it("isProduction reads the context", () => {
    expect(isProduction({ ...base, context: "production" })).toBe(true);
    expect(isProduction({ ...base, context: "branch-deploy" })).toBe(false);
  });
});
