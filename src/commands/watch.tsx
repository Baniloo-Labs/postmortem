// `mort watch` — the primary command. Starts the enabled sensors and, when a TTY
// is present, mounts the live Ink dashboard. `--headless` runs sensors only (no
// UI), and `--demo` replays a bundled incident so you can try postmortem with zero
// config. (The web dashboard on :6660 and the incident pipeline arrive in later
// sessions; this is the vertical slice that makes `mort` runnable today.)

import { render } from "ink";
import { type ReactElement, useEffect, useState } from "react";
import { Brain } from "../brain/index.js";
import { bus } from "../core/bus.js";
import { loadConfig } from "../core/config.js";
import type { NormalizedEvent } from "../core/event.js";
import { createLogger } from "../core/logger.js";
import { Dashboard } from "../outputs/terminal/components/Dashboard.js";
import type { BrainStatus, IncidentView } from "../outputs/terminal/types.js";
import { DemoSensor } from "../sensors/demo/index.js";
import { createSensorRegistry, type SensorHealth, SensorRegistry } from "../sensors/index.js";

const log = createLogger("watch");

const VERSION = "0.1.0";

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

interface WatchAppProps {
  brain: BrainStatus;
  registry: SensorRegistry;
  demo: boolean;
}

function WatchApp({ brain, registry, demo }: WatchAppProps): ReactElement {
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

  // In demo mode, reveal the canned incident once the failure has "happened".
  useEffect(() => {
    if (!demo) return;
    const timer = setTimeout(() => setIncident(DEMO_INCIDENT), 5200);
    return () => clearTimeout(timer);
  }, [demo]);

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
  const config = loadConfig();

  const brain = new Brain(config.brain);
  await brain.init();
  const brainStatus: BrainStatus = { kind: brain.kind, model: config.brain.model };

  const registry = options.demo
    ? new SensorRegistry().register(new DemoSensor())
    : createSensorRegistry();
  const sensorsConfig = options.demo ? { demo: { enabled: true } } : config.sensors;

  await registry.startAll(sensorsConfig);

  const shutdown = async () => {
    await registry.stopAll();
  };

  // Headless (no TTY / --headless): sensors only, log to file, stay alive.
  if (options.headless || !process.stdout.isTTY) {
    log.info(`postmortem watching (headless)${options.demo ? " · demo" : ""}`);
    process.stdout.write("☠ postmortem is watching (headless). ctrl+c to stop.\n");
    const onSignal = () => void shutdown().then(() => process.exit(0));
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    return;
  }

  const app = render(
    <WatchApp brain={brainStatus} registry={registry} demo={options.demo ?? false} />,
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
