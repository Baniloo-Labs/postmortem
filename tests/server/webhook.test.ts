import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SensorEvent } from "../../src/sensors/base.js";
import { createServer } from "../../src/server/index.js";
import { verifyHmac, webhookToEvent } from "../../src/server/webhook.js";

const SECRET = "s3cr3t";
function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}
const JSON_HEADERS = { "content-type": "application/json" };

describe("verifyHmac", () => {
  const body = '{"a":1}';
  const digest = createHmac("sha256", "k").update(body).digest("hex");

  it("accepts a correct signature (bare and sha256= prefixed)", () => {
    expect(verifyHmac("k", body, digest)).toBe(true);
    expect(verifyHmac("k", body, `sha256=${digest}`)).toBe(true);
  });
  it("rejects wrong, missing, or malformed signatures", () => {
    expect(verifyHmac("k", body, "sha256=deadbeef")).toBe(false);
    expect(verifyHmac("k", body, undefined)).toBe(false);
    expect(verifyHmac("k", body, "not-hex!!")).toBe(false);
  });
});

describe("webhookToEvent", () => {
  it("fills defaults and requires a valid type", () => {
    const e = webhookToEvent("railway", { type: "deploy.failed" });
    expect(e.source).toBe("railway");
    expect(e.severity).toBe("info");
    expect(e.summary).toBe("railway · deploy.failed");
  });
  it("throws on an unknown type", () => {
    expect(() => webhookToEvent("x", { type: "not.a.type" })).toThrow();
  });
});

describe("POST /webhook/:source", () => {
  it("accepts a valid signed webhook and emits an event", async () => {
    const events: SensorEvent[] = [];
    const app = createServer({ secret: SECRET, onEvent: (e) => events.push(e) });
    const body = JSON.stringify({
      type: "deploy.failed",
      severity: "critical",
      summary: "prod down",
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhook/railway",
      headers: { ...JSON_HEADERS, "x-hub-signature-256": sign(SECRET, body) },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe("railway");
    expect(events[0]?.severity).toBe("critical");
    await app.close();
  });

  it("rejects an invalid signature with 401", async () => {
    const app = createServer({ secret: SECRET, onEvent: () => {} });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/x",
      headers: { ...JSON_HEADERS, "x-hub-signature-256": "sha256=deadbeef" },
      payload: JSON.stringify({ type: "deploy.failed" }),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a missing signature when a secret is configured", async () => {
    const app = createServer({ secret: SECRET, onEvent: () => {} });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/x",
      headers: JSON_HEADERS,
      payload: JSON.stringify({ type: "deploy.failed" }),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("accepts unsigned requests when no secret is configured", async () => {
    const events: SensorEvent[] = [];
    const app = createServer({ onEvent: (e) => events.push(e) });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/ci",
      headers: JSON_HEADERS,
      payload: JSON.stringify({ type: "build.failed" }),
    });
    expect(res.statusCode).toBe(202);
    expect(events).toHaveLength(1);
    await app.close();
  });

  it("returns 400 with the valid types on a bad event type", async () => {
    const app = createServer({ onEvent: () => {} });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/ci",
      headers: JSON_HEADERS,
      payload: JSON.stringify({ type: "not.a.type" }),
    });
    expect(res.statusCode).toBe(400);
    const json = res.json() as { validTypes: string[] };
    expect(json.validTypes).toContain("build.failed");
    await app.close();
  });
});
