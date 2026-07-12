import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { bus } from "../../src/core/bus.js";
import type { NormalizedEvent } from "../../src/core/event.js";
import { NetlifySensor } from "../../src/sensors/netlify/index.js";
import type { NetlifyDeploy } from "../../src/sensors/netlify/parser.js";

const server = setupServer();
let deploys: NetlifyDeploy[] = [];

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function useHandlers() {
  server.use(
    http.get("https://api.netlify.com/api/v1/sites/:siteId/deploys", () =>
      HttpResponse.json(deploys),
    ),
    http.get("https://api.netlify.com/api/v1/user", () => HttpResponse.json({ id: "u" })),
  );
}

describe("NetlifySensor (msw)", () => {
  it("emits a critical deploy.failed on transition to error in production", async () => {
    useHandlers();
    deploys = [
      { id: "d1", name: "acme", state: "building", context: "production", branch: "main" },
    ];
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new NetlifySensor();

    await sensor.start({ token: "tok", site_ids: ["site1"], poll_interval_seconds: 3600 });
    deploys = [
      {
        id: "d1",
        name: "acme",
        state: "error",
        context: "production",
        branch: "main",
        error_message: "Build script returned non-zero exit code: 2",
      },
    ];
    await sensor.poll();
    await sensor.stop();
    unsubscribe();

    const failed = captured.find((e) => e.type === "deploy.failed");
    expect(failed).toBeDefined();
    expect(failed?.severity).toBe("critical");
    expect(failed?.raw).toContain("non-zero exit code");
    expect(failed?.metadata.branch).toBe("main");
  });

  it("does not replay history on the seeding poll", async () => {
    useHandlers();
    deploys = [{ id: "d2", name: "acme", state: "error", context: "production" }];
    const captured: NormalizedEvent[] = [];
    const unsubscribe = bus.subscribe((e) => captured.push(e));
    const sensor = new NetlifySensor();

    await sensor.start({ token: "tok", site_ids: ["site1"], poll_interval_seconds: 3600 });
    await sensor.stop();
    unsubscribe();

    expect(captured).toHaveLength(0);
  });

  it("healthCheck reports connected with a token, unhealthy without", async () => {
    useHandlers();
    const sensor = new NetlifySensor();
    await sensor.start({ token: "tok", site_ids: ["site1"], poll_interval_seconds: 3600 });
    expect((await sensor.healthCheck()).healthy).toBe(true);
    await sensor.stop();

    expect((await new NetlifySensor().healthCheck()).healthy).toBe(false);
  });
});
