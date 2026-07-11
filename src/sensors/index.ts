// Sensor registry / loader. Owns every sensor's lifecycle and — critically —
// isolates it: one sensor throwing in start/stop/healthCheck must never take down
// the daemon or the others. Failures are caught, logged, and surfaced as unhealthy.

import { createLogger } from "../core/logger.js";
import type { BaseSensor } from "./base.js";
import { GitSensor } from "./git/index.js";
import { GitHubActionsSensor } from "./github-actions/index.js";
import { HealthCheckSensor } from "./health-check/index.js";
import { LogfileSensor } from "./logfile/index.js";
import { VercelSensor } from "./vercel/index.js";

const log = createLogger("sensors");

export interface SensorHealth {
  name: string;
  displayName: string;
  healthy: boolean;
  message: string;
  lastCheck: string;
}

type SensorConfig = { enabled?: boolean } & Record<string, unknown>;
type SensorsConfig = Record<string, SensorConfig | undefined>;

export class SensorRegistry {
  private readonly sensors = new Map<string, BaseSensor>();
  private readonly health = new Map<string, SensorHealth>();

  register(sensor: BaseSensor): this {
    this.sensors.set(sensor.name, sensor);
    return this;
  }

  list(): BaseSensor[] {
    return [...this.sensors.values()];
  }

  /** Start every enabled sensor, each in isolation. Never throws. */
  async startAll(config: SensorsConfig): Promise<void> {
    for (const sensor of this.sensors.values()) {
      const cfg = config[sensor.name];
      if (!cfg?.enabled) {
        this.record(sensor, true, "disabled");
        continue;
      }
      try {
        await sensor.start(cfg);
        this.record(sensor, true, "started");
      } catch (err) {
        log.error(`sensor ${sensor.name} failed to start`, { error: String(err) });
        this.record(sensor, false, `start failed: ${String(err)}`);
      }
    }
  }

  /** Stop every sensor, each in isolation. Never throws. */
  async stopAll(): Promise<void> {
    for (const sensor of this.sensors.values()) {
      try {
        await sensor.stop();
      } catch (err) {
        log.error(`sensor ${sensor.name} failed to stop`, { error: String(err) });
      }
    }
  }

  /** Run every sensor's health check in isolation and return the latest snapshot. */
  async checkAll(): Promise<SensorHealth[]> {
    for (const sensor of this.sensors.values()) {
      try {
        const result = await sensor.healthCheck();
        this.record(sensor, result.healthy, result.message);
      } catch (err) {
        this.record(sensor, false, `healthCheck threw: ${String(err)}`);
      }
    }
    return this.getHealth();
  }

  getHealth(): SensorHealth[] {
    return [...this.health.values()];
  }

  private record(sensor: BaseSensor, healthy: boolean, message: string): void {
    this.health.set(sensor.name, {
      name: sensor.name,
      displayName: sensor.displayName,
      healthy,
      message,
      lastCheck: new Date().toISOString(),
    });
  }
}

// Webhooks are received by the shared Fastify server (src/server/), not a sensor.
/** The registry with all v1.0 polling/watching sensors registered. */
export function createSensorRegistry(): SensorRegistry {
  return new SensorRegistry()
    .register(new GitSensor())
    .register(new LogfileSensor())
    .register(new VercelSensor())
    .register(new GitHubActionsSensor())
    .register(new HealthCheckSensor());
}

export type { SensorEvent, SensorHealthResult } from "./base.js";
export { BaseSensor } from "./base.js";
