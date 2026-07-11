import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { GitHubActionsSensor } from "../../src/sensors/github-actions/index.js";
import type { WorkflowRun } from "../../src/sensors/github-actions/parser.js";

const server = setupServer();
let runs: WorkflowRun[] = [];
let etag = '"v1"';

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function useHandlers() {
  server.use(
    http.get("https://api.github.com/repos/:owner/:repo/actions/runs", ({ request }) => {
      if (request.headers.get("if-none-match") === etag) {
        return new HttpResponse(null, { status: 304 });
      }
      return HttpResponse.json({ workflow_runs: runs }, { headers: { etag } });
    }),
    http.get("https://api.github.com/repos/:owner/:repo/actions/runs/:id/jobs", () =>
      HttpResponse.json({
        jobs: [{ name: "build", steps: [{ name: "test", conclusion: "failure" }] }],
      }),
    ),
    http.get("https://api.github.com/rate_limit", () => HttpResponse.json({ rate: {} })),
  );
}

const completedRun = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 1,
  name: "CI",
  head_branch: "main",
  head_sha: "abc",
  status: "completed",
  conclusion: "failure",
  ...over,
});

describe("GitHubActionsSensor (msw)", () => {
  it("emits build.failed with failed steps on a new failing run", async () => {
    useHandlers();
    runs = [completedRun({ id: 1, conclusion: "success" })]; // seed with a passing run
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new GitHubActionsSensor();

    await sensor.start({ token: "t", repos: ["acme/app"], poll_interval_seconds: 3600 });
    // A new failing run appears; bump the etag so the conditional request returns 200.
    runs = [completedRun({ id: 2 }), completedRun({ id: 1, conclusion: "success" })];
    etag = '"v2"';
    await sensor.poll();
    await sensor.stop();
    unsubscribe();

    const failed = captured.find((e) => e.type === "build.failed");
    expect(failed).toBeDefined();
    expect(failed?.severity).toBe("critical");
    expect(failed?.raw).toContain("build › test");
  });

  it("skips work on a 304 (nothing changed)", async () => {
    useHandlers();
    runs = [completedRun({ id: 5 })];
    etag = '"same"';
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new GitHubActionsSensor();

    await sensor.start({ token: "t", repos: ["acme/app"], poll_interval_seconds: 3600 }); // seed stores etag
    // etag unchanged → server replies 304 → the failing run is NOT re-emitted.
    await sensor.poll();
    await sensor.stop();
    unsubscribe();

    expect(captured.filter((e) => e.type === "build.failed")).toHaveLength(0);
  });

  it("healthCheck needs a token and repos", async () => {
    const sensor = new GitHubActionsSensor();
    expect((await sensor.healthCheck()).healthy).toBe(false);
  });
});
