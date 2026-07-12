# Changelog

All notable changes to `@postmortem-cli/mort` are documented here. This project
follows [semantic versioning](https://semver.org); pre-1.0, breaking changes may
land in minor releases.

## [1.0.1] — 2026-07-12

### Fixed
- **Claude Code brain now works on Windows.** `claude` is a `.cmd`/`.ps1` shim on
  Windows, which Node can't launch directly — so `mort setup` reported "Claude
  Code isn't installed" even when it was, and analysis calls would have failed
  with ENOENT. The CLI now runs through the shell on Windows (as a single command
  string, avoiding the DEP0190 args-with-shell warning; the model is validated to
  a safe charset so there's no injection surface). Verified end-to-end against a
  real `claude` install: detection and a live `claude -p` call both succeed.

## [1.0.0] — 2026-07-12

First stable release. The full **watch → detect → explain → predict** loop,
proven end-to-end: a real brain driving the real pipeline into a real database
and markdown report, across git / logfile / Vercel / GitHub Actions / health-check
sensors and inbound webhooks, with a live terminal UI and a local web dashboard.
Local-first, model-agnostic, no telemetry. Everything in `0.1.0-alpha.1` below,
plus the following since the alphas:

### Added
- **Claude Code as an explicit, recommended brain** in `mort setup` (option `[1]`,
  free with your subscription) with install guidance when the `claude` CLI is
  absent. It was always the #1 auto-detect backend; now it's front and center.
- **Brain-first gate** in `mort watch`: real mode no longer silently runs with
  analysis disabled — it walks you through picking a brain before starting.
- **End-to-end coverage**: an automated test drives a real `Brain` (ollama
  backend) through the real pipeline into a real SQLite db + markdown report,
  mocking only the model's HTTP. The whole analysis path is now proven, not
  assumed.
- Actuator scaffold (`src/actuators/`) — `BaseActuator` + registry stubs (spec
  §16); no concrete actuators ship in v1.0.

### Fixed
- `mort history` showed incident times in UTC while reports used local time —
  both now use one local `YYYY-MM-DD HH:MM` formatter; report headers are no
  longer locale-ambiguous.
- The webhook route accepted POSTs even when `[sensors.webhook]` was disabled —
  it's now registered only when webhook is enabled (404 otherwise). The dashboard
  and API stay up regardless.
- `mort watch` acquired the single-instance lock *after* brain init, so a second
  instance printed brain prompts before failing — the lock is now checked first,
  so a second daemon fails fast with a clear "already running" message.
- `bin` path (`dist/index.js`, no `./`) so the global CLI works after install.

## [0.1.0-alpha.1] — 2026-07-11

First public alpha. The full watch → detect → explain → predict loop, runnable
end-to-end. Published under the `alpha` tag while it bakes.

### Added

**Core**
- `NormalizedEvent` contract (Zod 4) — the single coupling point for all sensors
- Typed event bus; central secret redactor (provider keys, JWTs, auth headers,
  URL credentials, and opaque values under sensitive key names)
- SQLite persistence via Kysely — WAL mode + busy timeout, versioned migrations,
  30-day event retention (incidents kept forever)
- TOML config with Zod validation and `0600` writes; single-instance lock;
  file-only structured logger

**Brain (model-agnostic)**
- Auto-detection: Claude Code CLI → `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` →
  local Ollama; explicit config wins
- Tolerant LLM-JSON parsing (strip fences/preamble, Zod-validate, one retry, then
  degrade); per-window token budget in the prompts

**Sensors**
- **Vercel** ★ (deployments + build logs, prod=critical/preview=error)
- **GitHub Actions** (ETag conditional requests, failed-step extraction)
- **git** (commits, branch changes) · **logfile** (`tail -f` + patterns)
- **health-check** (SSRF-guarded, transition-only events)
- **webhook** receiver (HMAC-verified, on the shared server)

**Commands**
- `mort watch` (`--demo`, `--headless`), `setup`, `status`, `history`,
  `incident --last`, `predict` (exit codes 0/1/2 for the pre-push hook),
  `hooks install|uninstall`, `config show|path`

**Incident pipeline**
- Correlation (any critical, or 2+ error/critical in a 5-min window), debounced
  into one incident; brain analysis → SQLite + markdown report (Windows-safe
  filenames); live incident card in the terminal

**Outputs**
- Live Ink terminal dashboard (yellow-on-black, ☠ branding)
- Web dashboard + JSON API + SSE stream on `127.0.0.1:6660`, one Fastify server,
  restrictive CSP, self-contained embedded HTML
- Markdown postmortems in `~/.postmortem/reports/`

### Notes
- **No telemetry, ever.** The only outbound calls are the sensor APIs you enable
  and the AI backend you choose.
- Cross-platform, Windows-first: prebuilt `better-sqlite3` binaries with a
  documented build-tools fallback.

### Deferred to v1.1
`mort mcp` (read-only MCP server over the incident db), Netlify sensor, auto-start
units (launchd/systemd/Task Scheduler), Slack/webhook output, `config set`,
`incident --since`, Ink-rendered setup wizard, `ACTUATOR_SPEC.md`.

[1.0.1]: https://github.com/Baniloo-Labs/postmortem/releases/tag/v1.0.1
[1.0.0]: https://github.com/Baniloo-Labs/postmortem/releases/tag/v1.0.0
[0.1.0-alpha.1]: https://github.com/Baniloo-Labs/postmortem/releases/tag/v0.1.0-alpha.1
