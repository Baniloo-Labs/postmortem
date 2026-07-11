// The local Fastify server. In v1.0 it hosts the webhook receiver; Session 9 adds
// the dashboard, JSON API, and SSE routes to this same instance (one process, one
// port). It binds 127.0.0.1 only — never 0.0.0.0.

import Fastify, { type FastifyInstance } from "fastify";
import type { SensorEvent } from "../sensors/base.js";
import { VALID_EVENT_TYPES, verifyHmac, webhookToEvent } from "./webhook.js";

export const SERVER_HOST = "127.0.0.1"; // local-only, non-negotiable
export const SERVER_PORT = 6660;

export interface ServerOptions {
  /** When set, webhook requests must carry a valid HMAC signature. */
  secret?: string;
  /** Called with each event a webhook produces. */
  onEvent: (event: SensorEvent) => void;
}

// Fastify request augmented with the captured raw body (needed for HMAC).
interface WithRawBody {
  rawBody?: string;
}

/** Build the server (not yet listening) so tests can use app.inject(). */
export function createServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  // Capture the raw JSON body so we can HMAC-verify it, then parse it.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as WithRawBody).rawBody = typeof body === "string" ? body : "";
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post("/webhook/:source", (request, reply) => {
    const { source } = request.params as { source: string };

    if (options.secret) {
      const header =
        request.headers["x-hub-signature-256"] ?? request.headers["x-postmortem-signature"];
      const signature = Array.isArray(header) ? header[0] : header;
      const raw = (request as WithRawBody).rawBody ?? "";
      if (!verifyHmac(options.secret, raw, signature)) {
        return reply.code(401).send({ error: "invalid or missing signature" });
      }
    }

    try {
      options.onEvent(webhookToEvent(source, request.body));
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
export async function startServer(
  options: ServerOptions,
  port = SERVER_PORT,
): Promise<FastifyInstance> {
  const app = createServer(options);
  await app.listen({ host: SERVER_HOST, port });
  return app;
}
