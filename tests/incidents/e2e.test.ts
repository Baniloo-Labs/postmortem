// End-to-end: a REAL Brain (ollama backend, OpenAI-compatible transport) driving
// the REAL incident pipeline into a REAL SQLite db and a REAL markdown report.
// Only the model's HTTP is mocked (msw). This is the automated version of the
// live CLI smoke — it proves the whole analysis path wires together, for good.

import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Brain } from "../../src/brain/index.js";
import { defaultConfig } from "../../src/core/config.js";
import { closeDb, type DB, migrateToLatest, openDb } from "../../src/core/db.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { listIncidents } from "../../src/core/repo.js";
import { IncidentPipeline } from "../../src/incidents/pipeline.js";

const HOST = "http://ollama.test";
const ANALYSIS = {
  title: "Production deploys failing repeatedly",
  severity: "critical",
  root_cause: "Two consecutive production deploys failed — likely a bad dependency bump.",
  timeline: [{ timestamp: "2026-07-11T14:33:00Z", event: "deploy failed", source: "webhook:ci" }],
  suggested_action: "Roll back and inspect the build logs.",
  pattern_match: null,
  confidence: "medium",
};

const server = setupServer(
  http.get(`${HOST}/api/tags`, () => HttpResponse.json({ models: [{ name: "test" }] })),
  http.post(`${HOST}/v1/chat/completions`, () =>
    HttpResponse.json({
      id: "chatcmpl-mock",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(ANALYSIS) } }],
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let db: DB;
let dir: string;
beforeEach(async () => {
  db = openDb(":memory:");
  await migrateToLatest(db);
  dir = mkdtempSync(join(tmpdir(), "mort-e2e-"));
});
afterEach(async () => {
  await closeDb(db);
  rmSync(dir, { recursive: true, force: true });
});

function crit(): NormalizedEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "webhook:ci",
    type: "deploy.failed",
    severity: "critical",
    raw: "exit 1",
    summary: "prod deploy failed",
    metadata: {},
    payload: {},
  };
}

describe("end-to-end analysis through a real ollama Brain", () => {
  it("detects the backend, analyzes, persists an incident, and writes a report", async () => {
    const cfg = defaultConfig();
    cfg.brain.backend = "ollama";
    cfg.brain.ollama.host = HOST;
    cfg.brain.ollama.model = "test";

    const brain = new Brain(cfg.brain);
    await brain.init();
    expect(brain.kind).toBe("ollama"); // detection via /api/tags succeeded
    expect(brain.isConfigured()).toBe(true);

    const pipeline = new IncidentPipeline({
      brain,
      db,
      reportsDir: dir,
      brainLabel: "test via ollama",
    });
    const incident = await pipeline.analyzeEvents([crit(), crit()]);

    expect(incident?.title).toBe(ANALYSIS.title);
    expect(incident?.severity).toBe("critical");
    expect(incident?.suggestedAction).toContain("Roll back");
    expect(existsSync(incident?.reportPath ?? "")).toBe(true);

    const rows = await listIncidents(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe(ANALYSIS.title);
  });

  it("stays unconfigured (analysis disabled, non-fatal) when the model is unreachable", async () => {
    server.use(http.get(`${HOST}/api/tags`, () => HttpResponse.error()));
    const cfg = defaultConfig();
    cfg.brain.backend = "ollama";
    cfg.brain.ollama.host = HOST;

    const brain = new Brain(cfg.brain);
    await brain.init();
    expect(brain.isConfigured()).toBe(false);

    const pipeline = new IncidentPipeline({ brain, db, reportsDir: dir });
    expect(await pipeline.analyzeEvents([crit(), crit()])).toBeNull();
    expect(await listIncidents(db, {})).toHaveLength(0);
  });
});
