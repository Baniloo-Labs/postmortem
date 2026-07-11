// Webhook sensor — accepts inbound events from any platform that can POST. It
// runs the local Fastify server (127.0.0.1:6660) and emits each received,
// signature-verified event onto the bus. (Session 9's dashboard shares this same
// server; until then the webhook sensor owns it.)

import type { FastifyInstance } from "fastify";
import { createLogger } from "../../core/logger.js";
import { SERVER_HOST, SERVER_PORT, startServer } from "../../server/index.js";
import { BaseSensor, type SensorHealthResult } from "../base.js";

const log = createLogger("sensor:webhook");

interface WebhookConfig {
  secret?: string;
}

export class WebhookSensor extends BaseSensor {
  readonly name = "webhook";
  readonly displayName = "Webhook";

  private app: FastifyInstance | null = null;

  async start(config: Record<string, unknown>): Promise<void> {
    const c = config as WebhookConfig;
    const secret = c.secret || process.env.POSTMORTEM_WEBHOOK_SECRET || "";
    if (!secret) {
      log.warn("webhook receiver running without a secret — inbound requests are unauthenticated");
    }
    this.app = await startServer(
      { secret: secret || undefined, onEvent: (event) => this.emit(event) },
      SERVER_PORT,
    );
    log.info(`webhook receiver on http://${SERVER_HOST}:${SERVER_PORT}/webhook/:source`);
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
    }
  }

  async healthCheck(): Promise<SensorHealthResult> {
    return this.app
      ? { healthy: true, message: `listening on ${SERVER_HOST}:${SERVER_PORT}` }
      : { healthy: false, message: "not started" };
  }
}
