---
name: add-sensor
description: Scaffold a new postmortem sensor (index + parser + config schema + registry wiring + tests/fixtures) following the BaseSensor contract. Use when adding a new data source such as Railway, Fly.io, Render, CloudWatch, or any platform that should emit NormalizedEvents.
---

# add-sensor

Scaffold a new sensor for postmortem. A sensor watches one source and emits `NormalizedEvent`s onto the bus. Nothing downstream knows which sensor produced an event — the `NormalizedEvent` contract is the only coupling point.

## Inputs to gather first
- **name** (kebab, e.g. `railway`) and **displayName** (e.g. `Railway`).
- **Mechanism:** poller (interval API calls), file watcher (chokidar), or webhook receiver.
- **Auth:** which env var / config token (e.g. `RAILWAY_TOKEN`).
- **Which `EventType`s** it emits (from `src/core/event.ts` — `deploy.*`, `build.*`, `health.*`, `log.*`, `git.*`). If a needed type is missing, add it to the `EventType` enum first and note it.

## Steps
1. Create `src/sensors/<name>/index.ts` — a class `extends BaseSensor` implementing `start(config)`, `stop()`, `healthCheck()`. Pollers store `intervalId` and a `Set` of seen IDs for dedup; call `poll()` once immediately on start.
2. Create `src/sensors/<name>/parser.ts` — pure functions that turn raw API/log payloads into the fields of a `NormalizedEvent`. No I/O here; keep it unit-testable.
3. Add a Zod config schema for the sensor and wire it into `src/core/config.ts` defaults + the `[sensors.<name>]` TOML block (mirror the shape in `spec.md` §9).
4. Register the sensor in `src/sensors/index.ts` (the registry/loader).
5. Tests: `tests/sensors/<name>.test.ts` using **msw** to mock the API, plus a recorded log **fixture** under `tests/sensors/fixtures/`. Assert emitted events are schema-valid and that an API failure marks the sensor unhealthy without throwing.

## Rules (must follow)
- Every emitted event is **Zod-validated** against `NormalizedEvent` before `this.emit(...)`.
- Run all `raw`/log text through the **redactor** (`src/core/redact.ts`) before emitting — never persist or send secrets to the brain.
- **Severity:** production-branch failure = `critical`; preview/non-prod failure = `error`; recoveries = `info`.
- A throw inside the sensor must not crash the daemon — guard the poll loop, log via the file logger, surface as unhealthy in `sensor_health`.
- Pollers use retry/backoff and **ETag/conditional requests** where the API supports them (avoid rate limits).
- Never `console.log` (corrupts the Ink UI) — use `src/core/logger.ts`.
- Reference the GitHub Actions / Vercel sensors in `spec.md` §14 as the canonical pattern.

## Done when
Sensor appears in the registry, `npm test` passes, and enabling it in `config.toml` makes `mort status` show it.
