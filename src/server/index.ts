// The one local Fastify server (spec §12). Serves the embedded dashboard, the
// JSON API, the SSE live stream, and the webhook receiver — one process, one
// port, bound to 127.0.0.1 only (never 0.0.0.0). A restrictive CSP is set on
// every response; the page is self-contained except the JetBrains Mono font.

import Fastify, { type FastifyInstance } from "fastify";
import { bus } from "../core/bus.js";
import type { DB } from "../core/db.js";
import { countEventsSince, getIncident, listIncidents, recentEvents } from "../core/repo.js";
import { publishEvent, type SensorHealthResult } from "../sensors/base.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { VALID_EVENT_TYPES, verifyHmac, webhookToEvent } from "./webhook.js";

export const SERVER_HOST = "127.0.0.1"; // local-only, non-negotiable
export const SERVER_PORT = 6660;

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'none'";

export interface SensorHealthView extends SensorHealthResult {
  name: string;
}

export interface ServerDeps {
  db: DB;
  version: string;
  brain: { kind: string | null; model: string };
  getSensors: () => SensorHealthView[];
  startedAt: number;
  /** When set, webhook requests must carry a valid HMAC signature. */
  webhookSecret?: string;
}

export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // Restrictive CSP on every (non-hijacked) response.
  app.addHook("onSend", (_req, reply, payload, done) => {
    reply.header("content-security-policy", CSP);
    reply.header("x-content-type-options", "nosniff");
    done(null, payload);
  });

  // Capture the raw JSON body for HMAC verification, then parse it.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as { rawBody?: string }).rawBody = typeof body === "string" ? body : "";
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.get("/", (_req, reply) => {
    reply.type("text/html; charset=utf-8").send(DASHBOARD_HTML);
  });

  app.get("/api/events", async () => recentEvents(deps.db, 100));

  app.get("/api/incidents", async () => listIncidents(deps.db, { limit: 100 }));

  app.get("/api/incidents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const incident = await getIncident(deps.db, id);
    if (!incident) return reply.code(404).send({ error: "not found" });
    return incident;
  });

  app.get("/api/sensors", async () => deps.getSensors());

  app.get("/api/status", async () => {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    return {
      version: deps.version,
      brain: deps.brain,
      uptimeMs: Date.now() - deps.startedAt,
      events24h: await countEventsSince(deps.db, since),
      dashboardUrl: `http://${SERVER_HOST}:${SERVER_PORT}`,
    };
  });

  // Server-Sent Events — forward every bus event to connected browsers.
  app.get("/api/stream", (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-security-policy": CSP,
    });
    reply.raw.write(":ok\n\n");
    const unsubscribe = bus.subscribe((event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    request.raw.on("close", unsubscribe);
  });

  app.post("/webhook/:source", (request, reply) => {
    const { source } = request.params as { source: string };

    if (deps.webhookSecret) {
      const header =
        request.headers["x-hub-signature-256"] ?? request.headers["x-postmortem-signature"];
      const signature = Array.isArray(header) ? header[0] : header;
      const raw = (request as { rawBody?: string }).rawBody ?? "";
      if (!verifyHmac(deps.webhookSecret, raw, signature)) {
        return reply.code(401).send({ error: "invalid or missing signature" });
      }
    }

    try {
      publishEvent(webhookToEvent(source, request.body));
      return reply.code(202).send({ ok: true });
    } catch {
      return reply.code(400).send({
        error: "invalid event body — 'type' must be a known event type",
        validTypes: VALID_EVENT_TYPES,
      });
    }
  });

  return app;
}

/** Build and start the server, bound to 127.0.0.1. Returns the running instance. */
export async function startServer(deps: ServerDeps, port = SERVER_PORT): Promise<FastifyInstance> {
  const app = createServer(deps);
  await app.listen({ host: SERVER_HOST, port });
  return app;
}
