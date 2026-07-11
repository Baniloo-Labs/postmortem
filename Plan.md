# Plan.md — postmortem ☠ Build Roadmap

The implementation roadmap. Product detail is in `spec.md`; engineering rules and the authoritative version matrix are in `CLAUDE.md` (which overrides spec.md on conflicts). This file is the order of operations.

---

## Version matrix (canonical — Node 22+ baseline)

| Package | Use | Package | Use |
|---|---|---|---|
| node engines | `>=22` | better-sqlite3 | `^12` |
| @anthropic-ai/sdk | `^0.105` | @types/better-sqlite3 | `^7.6` |
| openai | `^6` | kysely | `^0.29` |
| commander | `^15` | got | `^15` |
| ink | `^7` | chokidar | `^5` |
| react / @types/react | `^19` | fastify | `^5.8` |
| chalk | `^5.6` | zod | `^4` |
| ora | `^9` | tsup | `^8.5` |
| boxen | `^8` | tsx | `^4.22` |
| cli-table3 | `^0.6.5` | typescript | `^6` |
| smol-toml | `^1` | vitest | `^4` |
| @biomejs/biome | `^2` (dev) | msw | `^2` (dev) |

Default model: `claude-sonnet-4-6`. Opus 4.8 (`claude-opus-4-8`) selectable via config for deep analysis.

---

## Repository structure

Per `spec.md` §4, unchanged, with these additions:
- `src/core/redact.ts` — secret redactor used by all sensors before persist/AI.
- `src/core/lock.ts` — single-instance PID/port lock.
- `src/sensors/demo/` — fixture-replay sensor powering `mort watch --demo` (bundled canned incident).
- `.github/workflows/ci.yml` — lint + test + build matrix.
- `biome.json`, plus `LICENSE`, `CONTRIBUTING.md` at root.

And these v1.0 removals (deferred to v1.1 — see scope section):
- `src/sensors/netlify/` — not built in v1.0.
- `src/outputs/webhook/` — not built in v1.0.
- Auto-start units (launchd/systemd/Task Scheduler) — not built in v1.0.

---

## Revised build order

Foundations land before features. Each session is self-contained and ends green (lint + tests).

**Session 1 — Tooling & config foundation**
`package.json` (corrected versions), `tsconfig.json` (ESM, `nodenext`), `tsup.config.ts` (embeds `dashboard/index.html`), `vitest.config.ts`, `biome.json`, `.gitignore`, `.github/workflows/ci.yml`, `LICENSE` (MIT), `CONTRIBUTING.md`. `npm install` succeeds; `npm test` runs zero tests green.

**Session 2 — Core**
`event.ts` (NormalizedEvent in **Zod 4** syntax), `bus.ts` (typed EventEmitter), `db.ts` (better-sqlite3 + Kysely + versioned migrations for events/incidents/sensor_health, **WAL mode + busy timeout** — CLI commands are a second process, **30-day event retention prune** on start/daily), `config.ts` (smol-toml load + Zod validate + defaults + `0600` write), `logger.ts` (file-only structured), `redact.ts`, `lock.ts`. Tests: event schema, bus, redactor, migrations, retention prune.

**Session 3 — Brain**
`brain/index.ts` (detect: claude-cli → ANTHROPIC → OPENAI → ollama; `ask()`), backends (`claude-cli` via `node:child_process`, `anthropic`, `openai`, `ollama`), prompt templates (`incident`, `build`, `predict`), tolerant JSON extractor + Zod-validated parse with one retry, per-window token budget. `BrainNotConfiguredError` with setup instructions. Tests mock every backend path.

**Session 4 — Base sensor + git + logfile**
`sensors/base.ts` (abstract: `start/stop/healthCheck`, isolated so a throw can't kill the daemon), `sensors/index.ts` (registry/loader), git sensor (chokidar on `.git` + git log via `node:child_process`), logfile sensor (tail-equivalent + pattern match). Each emits validated NormalizedEvents through the redactor. Tests simulate git/log activity.

**Session 5 — Terminal UI**
`logo.ts` (☠ SKULL constants), `theme.ts` (Chalk palette), components: `Header`, `SensorStatus` (emerald), `EventStream` (severity-colored), `IncidentCard` (yellow border, ☠ before AI sections), `BrainIndicator`, `Spinner`. Pure render — no I/O in components.

**Session 6 — CLI commands + headless daemon**
`src/index.ts` (Commander entry, bin `mort`) + commands: `watch` (TTY→Ink, `--headless`→server+sensors only), `setup` (**plain prompts, not Ink** — v1.0), `status`, `history`, `incident --last`, `predict`, `config show/path`, `hooks`. Single-instance lock + graceful shutdown (SIGINT/SIGTERM). Daemon detects TTY via `process.stdout.isTTY`.

**Session 7 — Cloud/CI/health sensors + webhook receiver**
Vercel (REST v6/v9 poll + log fetch on failure), GitHub Actions (with ETag/conditional requests), health-check (SSRF-guarded), webhook receiver (on the 6660 Fastify server, HMAC verify). **Netlify deferred to v1.1** — the Vercel poller is its template; use `/add-sensor`. Prod-branch failure = `critical`, preview = `error`. Retry/backoff on all pollers. Tests use **msw** + recorded log fixtures.

**Session 8 — Incident pipeline + predict + demo mode**
Correlation (2+ error/critical within 5 min, or any critical → analyze), incident persistence, markdown report writer (`~/.postmortem/reports/`, ☠ title, **filesystem-safe filenames — no `:`**), `IncidentCard` render, SSE broadcast. `predict` passes git diff → brain with defined **exit codes** (critical=block/2, high=warn/1, low/med=pass/0) and a working **zero-history cold start** (diff-only analysis, "no incident history yet"). `mort watch --demo`: fixture-replay sensor plays a canned incident through the real pipeline — no tokens needed; canned analysis when no brain configured, clearly labeled.

**Session 9 — Web dashboard on 6660**
Fastify routes (`/`, `/api/events`, `/api/incidents[/:id]`, `/api/sensors`, `/api/status`, `/api/stream` SSE), single self-contained `dashboard/index.html` (dark/yellow/monospace, 240px sidebar, 5 views, EventSource live feed), embedded at build time, served from memory, CSP set. Bind `127.0.0.1`.

**Session 10 — Hooks + docs + ship polish**
`hooks install/uninstall` (portable pre-push, exits silently if daemon absent), README (`# postmortem ☠`, predict hero example, `mort watch --demo` as the try-it-first step, Windows build-tools note, no-telemetry promise), `SENSOR_SPEC.md`. Record the demo gif. Final lint/test/build pass, `/release` dry run. **Auto-start units and `ACTUATOR_SPEC.md` deferred to v1.1.**

---

## Spec gaps addressed in this build

1. Stale versions → corrected matrix.
2. Zod 4 syntax (`z.uuid()`, `z.iso.datetime()`, `z.record(key,val)`).
3. First-class Windows (auto-start, paths, hooks, sqlite build note).
4. Daemon without TTY → `--headless`.
5. Single-instance lock (port 6660 + db).
6. Security: `127.0.0.1` bind, `0600` config, secret redaction, webhook HMAC, health-check SSRF guard, dashboard CSP.
7. AI cost & JSON robustness: debounce/dedup, token budget, fence-tolerant parse + Zod + one retry.
8. Resilience: sensor isolation, retry/backoff, ETag conditional requests.
9. `predict` exit-code contract for pre-push hook.
10. OSS hygiene: Biome, CI workflow, LICENSE, CONTRIBUTING.
11. Concurrent db access (daemon + CLI = two processes) → WAL mode + busy timeout.
12. Unbounded db growth → 30-day event retention; incidents kept forever.
13. Cold start: `predict` with zero history, `mort watch --demo` fixture replay — day one must not feel empty.
14. Internal spec contradictions fixed: raven → ☠, phantom webhook port 9119 → single 6660 server, `~/.mort/postmortems/` → `~/.postmortem/reports/`, `:` in report filenames (invalid on Windows).
15. No-telemetry promise made explicit (trust is the adoption lever for a local-first tool).

---

## v1.0 / v1.1 / v2 scope

**v1.0** (ship-fast cut, per spec §19): core bus + event + SQLite (WAL, retention); brain (claude-cli/anthropic/openai/ollama); sensors vercel★/git/logfile/github-actions/health-check/webhook + demo replay; terminal UI; web dashboard `:6660`; commands watch(`--headless`/`--demo`)/setup/status/history/incident/predict/hooks/config-show; markdown reports; npm install. **Actuators stubbed only.**

**v1.1** (fast-follow): `mort mcp` (read-only MCP server over the SQLite db — incident history + events + predict for coding agents); Netlify sensor (`/add-sensor`); auto-start units (launchd/systemd/Task Scheduler); Slack/webhook output; `config set`; `incident --since`; Ink setup wizard; `ACTUATOR_SPEC.md`.

**v2:** concrete actuators (Slack, GitHub issues, rollback, PagerDuty); more sensors (Railway, Fly.io, Render, CloudWatch, GCP); multi-repo awareness; community sensor marketplace.

---

## Testing strategy

- **Vitest** unit tests for core (event, bus, config, redact, db migrations) and brain (mocked backends, JSON parser).
- **msw** for HTTP-mocked sensor pollers (Vercel/Netlify/GitHub) against recorded log **fixtures**.
- Each sensor: emits schema-valid events, handles API failure as `unhealthy` without crashing.
- CI runs Biome + `vitest run` + `tsup` build on the Node 22/24 matrix.
