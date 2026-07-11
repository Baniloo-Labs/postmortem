import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { VercelSensor } from "../../src/sensors/vercel/index.js";
import type { VercelDeployment } from "../../src/sensors/vercel/parser.js";

const server = setupServer();
let deployments: VercelDeployment[] = [];

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function useHandlers() {
  server.use(
    http.get("https://api.vercel.com/v6/deployments", () => HttpResponse.json({ deployments })),
    http.get("https://api.vercel.com/v2/deployments/:uid/events", () =>
      HttpResponse.json([{ payload: { text: "Error: Cannot resolve 'axios'" } }]),
    ),
    http.get("https://api.vercel.com/v9/user", () => HttpResponse.json({ user: { id: "u" } })),
  );
}

describe("VercelSensor (msw)", () => {
  it("emits a critical deploy.failed on transition to ERROR in production", async () => {
    useHandlers();
    deployments = [
      {
        uid: "d1",
        name: "acme",
        readyState: "BUILDING",
        target: "production",
        meta: { githubCommitRef: "main" },
      },
    ];
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new VercelSensor();

    await sensor.start({ token: "tok", poll_interval_seconds: 3600 }); // seeds BUILDING
    deployments = [
      {
        uid: "d1",
        name: "acme",
        readyState: "ERROR",
        target: "production",
        meta: { githubCommitRef: "main" },
      },
    ];
    await sensor.poll(); // transition BUILDING → ERROR
    await sensor.stop();
    unsubscribe();

    const failed = captured.find((e) => e.type === "deploy.failed");
    expect(failed).toBeDefined();
    expect(failed?.severity).toBe("critical");
    expect(failed?.raw).toContain("Cannot resolve 'axios'");
    expect(failed?.metadata.branch).toBe("main");
  });

  it("does not replay history on the seeding poll", async () => {
    useHandlers();
    deployments = [{ uid: "d2", name: "acme", readyState: "ERROR", target: "production" }];
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new VercelSensor();

    await sensor.start({ token: "tok", poll_interval_seconds: 3600 }); // seed only
    await sensor.stop();
    unsubscribe();

    expect(captured).toHaveLength(0);
  });

  it("healthCheck reports connected with a valid token", async () => {
    useHandlers();
    const sensor = new VercelSensor();
    await sensor.start({ token: "tok", poll_interval_seconds: 3600 });
    const health = await sensor.healthCheck();
    await sensor.stop();
    expect(health.healthy).toBe(true);
  });

  it("healthCheck is unhealthy without a token", async () => {
    const sensor = new VercelSensor();
    const health = await sensor.healthCheck();
    expect(health.healthy).toBe(false);
  });
});
