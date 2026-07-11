# Sensor Authoring Guide

A **sensor** watches one source (a deploy platform, CI, a log file, an endpoint) and emits `NormalizedEvent`s onto the bus. Everything downstream — the brain, the database, the terminal UI, the web dashboard — consumes that one shape and never knows which sensor produced an event. If you can write a poller, you can write a sensor.

> The fastest way to scaffold one is the `/add-sensor` Claude Code skill, which generates the index, parser, config schema, registry wiring, and tests. This document explains what it generates and why.

---

## The contract: `NormalizedEvent`

Every event is exactly this shape (`src/core/event.ts`, validated with Zod 4):

```ts
{
  id: string,            // uuid — stamped for you
  timestamp: string,     // ISO 8601 — stamped for you
  source: string,        // your sensor's name, e.g. "railway"
  type: EventType,       // one of the known enum values (deploy.*, build.*, health.*, log.*, git.*, incident.*)
  severity: "info" | "warning" | "error" | "critical",
  raw: string,           // original text (log line, error frame)
  summary: string,       // one-line human description
  metadata: { repo?, branch?, commit?, actor?, url?, duration_ms? },
  payload: Record<string, unknown>,  // sensor-specific structured data
}
```

If you need an event type that doesn't exist, add it to the `EventType` enum first — don't overload an unrelated one.

**Severity convention:** a production/default-branch failure is `critical`; a preview/feature-branch failure is `error`. Match that so the incident pipeline correlates and prioritizes correctly.

---

## The base class

Extend `BaseSensor` (`src/sensors/base.ts`) and implement three methods:

```ts
export class RailwaySensor extends BaseSensor {
  readonly name = "railway";          // must match the config key
  readonly displayName = "Railway";

  async start(config: Record<string, unknown>): Promise<void> { /* begin watching */ }
  async stop(): Promise<void> { /* clean up timers/watchers/servers */ }
  async healthCheck(): Promise<{ healthy: boolean; message: string }> { /* liveness */ }

  // Emit with this.emit({ source, type, severity, raw, summary, metadata, payload }).
}
```

You call `this.emit(...)` with everything **except** `id` and `timestamp`. Under the hood `emit` runs the shared `publishEvent`, which:

1. **stamps** `id` + `timestamp`,
2. **redacts secrets** from `raw`, `summary`, `metadata`, and `payload` (API keys, bearer tokens, and opaque values under sensitive key names) — you never handle redaction yourself,
3. **Zod-validates** the event and **drops it (logged, not thrown)** if invalid.

So a malformed event can't corrupt the bus or crash the daemon, and no sensor can accidentally leak a token.

---

## Keep the logic pure

Put the I/O in `index.ts` and the parsing/decision logic in a pure `parser.ts`. This is what makes sensors testable without hitting the network:

- `index.ts` — spawns/polls/watches, calls the parser, calls `this.emit`.
- `parser.ts` — pure functions: raw payload → event fields, and (for pollers) "given previous and current state, what changed?". No `fetch`, no `fs`, no clock.

The git, Vercel, and health-check sensors all follow this split — read them as references.

---

## The three mechanisms

- **Poller** (Vercel, GitHub Actions): `setInterval`, a `Set`/`Map` of seen ids for dedup, an immediate first poll that **seeds without emitting** (so you don't replay history on startup). Use the shared `apiClient()` (`src/sensors/http.ts`) — it brings retry/backoff and a request timeout. Use ETag/`If-None-Match` conditional requests where the API supports them (GitHub does) to respect rate limits.
- **Watcher** (git, logfile): `chokidar` on the paths of interest; debounce bursts; read only what's new.
- **Receiver** (webhook): handled by the shared Fastify server, not a sensor — see `src/server/`.

**Resilience:** one sensor throwing must never take down the daemon. Keep your poll loop in a `try/catch`, log failures, and report them through `healthCheck()`. The registry isolates each sensor's lifecycle, but your own loop should fail soft too.

---

## Config

Add a Zod schema for your sensor's block in `src/core/config.ts` and mirror it in the `[sensors.<name>]` TOML. Prefer env vars for tokens (`RAILWAY_TOKEN`) over config values; when a token lives in `config.toml`, it's written `0600`.

```toml
[sensors.railway]
enabled = false
token = ""                 # or set RAILWAY_TOKEN
poll_interval_seconds = 30
```

Then register the sensor in `createSensorRegistry()` (`src/sensors/index.ts`).

---

## Tests

- **Unit-test the parser** exhaustively — it's pure, so this is cheap and catches the real bugs.
- **Integration-test the poller** with [`msw`](https://mswjs.io) against recorded fixtures: assert it emits schema-valid events on a state change, seeds silently on first poll, and handles an API error as *unhealthy* without crashing.
- Expose your `poll()`/`pump()` method so tests can drive it deterministically instead of waiting on timers.

---

**The community builds sensors. The harness is the product.** Open a PR — a clean poller and a fixture test is all it takes.
