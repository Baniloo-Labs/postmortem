// `mort watch` — the primary command and the daemon. Real mode acquires the
// single-instance lock, opens the db, starts the sensors, runs the incident
// pipeline, and serves the web dashboard + webhook receiver on 127.0.0.1:6660.
// With a TTY it also mounts the live Ink dashboard; `--headless` skips the UI.
// `--demo` replays a bundled incident (ephemeral: no lock, no db, no server).

import type { FastifyInstance } from "fastify";
import { render } from "ink";
import { type ReactElement, useEffect, useState } from "react";
import { Brain } from "../brain/index.js";
import { bus } from "../core/bus.js";
import { loadConfig, reportsDirFor } from "../core/config.js";
import { closeDb, type DB, migrateToLatest, openDb } from "../core/db.js";
import type { NormalizedEvent } from "../core/event.js";
import { acquireLock, LockHeldError, releaseLock } from "../core/lock.js";
import { createLogger } from "../core/logger.js";
import { attachEventPersistence } from "../core/repo.js";
import { IncidentPipeline } from "../incidents/pipeline.js";
import { createTelegramOutput, resolveTelegram } from "../outputs/telegram/index.js";
import { Dashboard } from "../outputs/terminal/components/Dashboard.js";
import { theme } from "../outputs/terminal/theme.js";
import type { BrainStatus, IncidentView } from "../outputs/terminal/types.js";
import { DemoSensor } from "../sensors/demo/index.js";
import { createSensorRegistry, type SensorHealth, SensorRegistry } from "../sensors/index.js";
import { SERVER_HOST, SERVER_PORT, startServer } from "../server/index.js";
import { VERSION } from "../version.js";
import { ensureBrainConfigured } from "./setup.js";

/** Port the daemon reserves and the dashboard/webhook server binds. */
const DAEMON_PORT = SERVER_PORT;

const log = createLogger("watch");

export interface WatchOptions {
  demo?: boolean;
  headless?: boolean;
}

// The canned analysis shown in --demo. Clearly labeled as a sample: real analysis
// requires a configured brain and the incident pipeline (later sessions).
const DEMO_INCIDENT: IncidentView = {
  title: "Build failed · main · dependency bump",
  severity: "critical",
  detectedAt: new Date().toISOString(),
  durationLabel: "~4 minutes",
  rootCause:
    "The upgrade of axios 1.6.2 → 1.7.0 changed interceptor behavior; 3 tests depend on the old response shape. (sample analysis — configure a brain for real root-cause)",
  suggestedAction: "Pin axios to 1.6.2, or update src/api/__tests__/interceptor.test.ts",
  confidence: "medium",
  patternMatch: "Similar incident on 2024-11-14 — an axios upgrade broke interceptor tests.",
  timeline: [
    { time: "14:29:01", text: "push to main · chore: bump axios", source: "git", severity: "info" },
    { time: "14:29:15", text: "deploy triggered", source: "vercel", severity: "info" },
    { time: "14:31:44", text: "build failed · exit 1", source: "vercel", severity: "error" },
    { time: "14:33:01", text: "deployment marked ERROR", source: "vercel", severity: "critical" },
  ],
  reportPath: "~/.postmortem/reports/demo.md",
};

type SubscribeIncidents = (cb: (view: IncidentView) => void) => () => void;

interface WatchAppProps {
  brain: BrainStatus;
  registry: SensorRegistry;
  subscribeIncidents: SubscribeIncidents;
}

function WatchApp({ brain, registry, subscribeIncidents }: WatchAppProps): ReactElement {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [sensors, setSensors] = useState<SensorHealth[]>(registry.getHealth());
  const [incident, setIncident] = useState<IncidentView | null>(null);

  // Live event feed off the bus.
  useEffect(() => bus.subscribe((e) => setEvents((prev) => [...prev, e].slice(-100))), []);

  // Refresh sensor health periodically.
  useEffect(() => {
    const tick = () => void registry.checkAll().then(setSensors);
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [registry]);

  // Show the most recent incident (from the real pipeline, or the demo source).
  useEffect(() => subscribeIncidents(setIncident), [subscribeIncidents]);

  return (
    <Dashboard
      version={VERSION}
      brain={brain}
      sensors={sensors}
      events={events}
      activeIncident={incident}
    />
  );
}

export async function watchCommand(options: WatchOptions = {}): Promise<void> {
  const demo = options.demo ?? false;
  let config = loadConfig();

  // Single-instance lock FIRST (real mode) so a second `mort watch` fails fast
  // with a clear "already running" message — before any brain prompts or db work.
  let locked = false;
  if (!demo) {
    try {
      acquireLock(DAEMON_PORT);
      locked = true;
    } catch (err) {
      if (err instanceof LockHeldError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
  }

  let brain = new Brain(config.brain);
  await brain.init();

  // Brain-first: real mode is about explaining incidents, so don't silently run
  // with analysis disabled. If no brain is configured, walk the user through
  // picking one (Claude Code is the free default) before starting the daemon.
  if (!demo && !brain.isConfigured()) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      await ensureBrainConfigured();
      config = loadConfig();
      brain = new Brain(config.brain);
      await brain.init();
    }
    if (!brain.isConfigured()) {
      process.stdout.write(
        `${theme.muted("☠ no brain configured — incident analysis is disabled. Run ")}${theme.primary("mort setup")}${theme.muted(" or install Claude Code (npm i -g @anthropic-ai/claude-code). Sensors still record events.")}\n`,
      );
    }
  }

  const brainStatus: BrainStatus = { kind: brain.kind, model: config.brain.model };

  // Real mode persists to SQLite (the lock is already held from above). Demo mode
  // is ephemeral — no lock, no db — so it can run alongside a real daemon.
  let db: DB | null = null;
  let detachPersistence: (() => void) | null = null;

  if (!demo) {
    db = openDb();
    await migrateToLatest(db);
    detachPersistence = attachEventPersistence(db);
  }

  // The incident pipeline correlates events → analysis. Real mode only (demo uses
  // a canned incident; analysis needs a brain + db anyway).
  let pipeline: IncidentPipeline | null = null;
  let detachPipeline: (() => void) | null = null;
  if (!demo && db) {
    pipeline = new IncidentPipeline({
      brain,
      db,
      reportsDir: reportsDirFor(config),
      brainLabel: brain.kind ? `${config.brain.model} via ${brain.kind}` : undefined,
    });
    detachPipeline = pipeline.attach();

    // Telegram alerts: notify on each detected incident (best-effort).
    const telegram = resolveTelegram(config.output.telegram);
    if (telegram) {
      const output = createTelegramOutput(telegram);
      pipeline.onIncident((view) => output.notify(view));
      log.info("telegram alerts enabled");
    }
  }

  const subscribeIncidents: SubscribeIncidents = demo
    ? (cb) => {
        const timer = setTimeout(() => cb(DEMO_INCIDENT), 5200);
        return () => clearTimeout(timer);
      }
    : (cb) => (pipeline ? pipeline.onIncident(cb) : () => {});

  const registry = demo ? new SensorRegistry().register(new DemoSensor()) : createSensorRegistry();
  const sensorsConfig = demo ? { demo: { enabled: true } } : config.sensors;
  await registry.startAll(sensorsConfig);

  // The one Fastify server: dashboard + JSON API + SSE + webhook receiver (real
  // mode only). Demo mode stays ephemeral with no bound port.
  let server: FastifyInstance | null = null;
  if (!demo && db) {
    const wh = config.sensors.webhook;
    server = await startServer(
      {
        db,
        version: VERSION,
        brain: { kind: brain.kind, model: config.brain.model },
        getSensors: () => registry.getHealth(),
        startedAt: Date.now(),
        webhookEnabled: wh.enabled,
        webhookSecret: wh.enabled
          ? wh.secret || process.env.POSTMORTEM_WEBHOOK_SECRET || undefined
          : undefined,
      },
      DAEMON_PORT,
    );
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    detachPipeline?.();
    await registry.stopAll();
    if (server) await server.close();
    detachPersistence?.();
    if (db) await closeDb(db);
    if (locked) releaseLock();
  };

  // Headless (no TTY / --headless): sensors only, log to file, stay alive.
  if (options.headless || !process.stdout.isTTY) {
    log.info(`postmortem watching (headless)${demo ? " · demo" : ""}`);
    process.stdout.write("☠ postmortem is watching (headless). ctrl+c to stop.\n");
    if (server) process.stdout.write(`  dashboard → http://${SERVER_HOST}:${SERVER_PORT}\n`);
    const onSignal = () => void shutdown().then(() => process.exit(0));
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    return;
  }

  const app = render(
    <WatchApp brain={brainStatus} registry={registry} subscribeIncidents={subscribeIncidents} />,
  );
  const onSignal = () => {
    void shutdown().then(() => {
      app.unmount();
      process.exit(0);
    });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  await app.waitUntilExit();
  await shutdown();
}
