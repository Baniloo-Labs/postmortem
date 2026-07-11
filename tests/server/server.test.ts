import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import { closeDb, type DB, migrateToLatest, openDb } from "../../src/core/db.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { insertEvent, insertIncident } from "../../src/core/repo.js";
import { createServer, type ServerDeps } from "../../src/server/index.js";
import { verifyHmac, webhookToEvent } from "../../src/server/webhook.js";

const SECRET = "s3cr3t";
const JSON_HEADERS = { "content-type": "application/json" };
function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

let db: DB;
beforeEach(async () => {
  db = openDb(":memory:");
  await migrateToLatest(db);
});
afterEach(async () => {
  await closeDb(db);
});

function deps(over: Partial<ServerDeps> = {}): ServerDeps {
  return {
    db,
    version: "9.9.9",
    brain: { kind: "claude-cli", model: "claude-sonnet-4-6" },
    getSensors: () => [{ name: "git", healthy: true, message: "watching" }],
    startedAt: Date.now(),
    ...over,
  };
}

describe("verifyHmac / webhookToEvent (pure)", () => {
  it("verifies a correct signature and rejects bad ones", () => {
    const body = '{"a":1}';
    const digest = createHmac("sha256", "k").update(body).digest("hex");
    expect(verifyHmac("k", body, digest)).toBe(true);
    expect(verifyHmac("k", body, "sha256=deadbeef")).toBe(false);
    expect(verifyHmac("k", body, undefined)).toBe(false);
  });
  it("maps a body to an event and rejects unknown types", () => {
    expect(webhookToEvent("railway", { type: "deploy.failed" }).source).toBe("railway");
    expect(() => webhookToEvent("x", { type: "nope" })).toThrow();
  });
});

describe("dashboard + API", () => {
  it("serves the embedded dashboard HTML with a CSP", async () => {
    const app = createServer(deps());
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.body).toContain("☠");
    expect(res.body).toContain("postmortem");
    await app.close();
  });

  it("/api/status reports version, brain, and dashboard url", async () => {
    const app = createServer(deps());
    const json = (await app.inject({ method: "GET", url: "/api/status" })).json() as {
      version: string;
      brain: { kind: string };
      dashboardUrl: string;
    };
    expect(json.version).toBe("9.9.9");
    expect(json.brain.kind).toBe("claude-cli");
    expect(json.dashboardUrl).toBe("http://127.0.0.1:6660");
    await app.close();
  });

  it("/api/events and /api/incidents return stored rows", async () => {
    await insertEvent(db, {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: "git",
      type: "git.push",
      severity: "info",
      raw: "r",
      summary: "a push",
      metadata: {},
      payload: {},
    });
    await insertIncident(db, {
      id: "i1",
      detectedAt: new Date().toISOString(),
      severity: "critical",
      title: "prod down",
      rootCause: "axios",
      timeline: [{ time: "14:00", text: "boom", source: "vercel" }],
      suggestedAction: "pin it",
      eventIds: [],
      postmortemPath: null,
    });
    const app = createServer(deps());

    const events = (await app.inject({ method: "GET", url: "/api/events" })).json() as unknown[];
    expect(events).toHaveLength(1);

    const incidents = (await app.inject({ method: "GET", url: "/api/incidents" })).json() as Array<{
      id: string;
    }>;
    expect(incidents[0]?.id).toBe("i1");

    const detail = (await app.inject({ method: "GET", url: "/api/incidents/i1" })).json() as {
      timeline: Array<{ text: string }>;
    };
    expect(detail.timeline[0]?.text).toBe("boom");

    expect((await app.inject({ method: "GET", url: "/api/incidents/nope" })).statusCode).toBe(404);
    await app.close();
  });

  it("/api/sensors returns the health snapshot", async () => {
    const app = createServer(deps());
    const rows = (await app.inject({ method: "GET", url: "/api/sensors" })).json() as Array<{
      name: string;
    }>;
    expect(rows[0]?.name).toBe("git");
    await app.close();
  });
});

describe("POST /webhook/:source", () => {
  it("accepts a valid signed webhook and publishes to the bus", async () => {
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const app = createServer(deps({ webhookSecret: SECRET }));
    const body = JSON.stringify({ type: "deploy.failed", severity: "critical" });

    const res = await app.inject({
      method: "POST",
      url: "/webhook/railway",
      headers: { ...JSON_HEADERS, "x-hub-signature-256": sign(SECRET, body) },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    expect(captured.some((e) => e.source === "railway" && e.severity === "critical")).toBe(true);
    unsubscribe();
    await app.close();
  });

  it("rejects invalid/missing signatures with 401", async () => {
    const app = createServer(deps({ webhookSecret: SECRET }));
    const bad = await app.inject({
      method: "POST",
      url: "/webhook/x",
      headers: { ...JSON_HEADERS, "x-hub-signature-256": "sha256=deadbeef" },
      payload: JSON.stringify({ type: "deploy.failed" }),
    });
    const missing = await app.inject({
      method: "POST",
      url: "/webhook/x",
      headers: JSON_HEADERS,
      payload: JSON.stringify({ type: "deploy.failed" }),
    });
    expect(bad.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    await app.close();
  });

  it("400s on an unknown event type", async () => {
    const app = createServer(deps());
    const res = await app.inject({
      method: "POST",
      url: "/webhook/ci",
      headers: JSON_HEADERS,
      payload: JSON.stringify({ type: "not.a.type" }),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
