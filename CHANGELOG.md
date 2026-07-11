# Changelog

All notable changes to `@postmortem-cli/mort` are documented here. This project
follows [semantic versioning](https://semver.org); pre-1.0, breaking changes may
land in minor releases.

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

[0.1.0-alpha.1]: https://github.com/Baniloo-Labs/postmortem/releases/tag/v0.1.0-alpha.1
