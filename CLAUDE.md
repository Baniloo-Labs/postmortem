# CLAUDE.md — postmortem ☠

Guidance for Claude Code working in this repo. `spec.md` is the product source of truth; **this file overrides spec.md wherever they conflict** (versions, security, platform, daemon model). The build roadmap lives in `Plan.md`.

---

## What this is

**postmortem** is a local-first, model-agnostic ops-intelligence harness. It watches deploys (Vercel/Netlify), git, CI, and health endpoints; when something breaks it correlates events and uses whatever AI the user already has to explain why. Runs entirely on the user's machine — no SaaS, no account. Ships a live Ink terminal UI and an embedded web dashboard on `127.0.0.1:6660`.

- **Terminal command:** `mort`
- **npm package:** `@postmortem-cli/mort`
- **Config:** `~/.postmortem/` (`config.toml`, `postmortem.db`, `logs/`, `reports/`)

---

## Branding rules (apply everywhere)

| Rule | Do | Don't |
|---|---|---|
| Command name | `mort watch`, `mort predict` | `postmortem watch` |
| Prose / product noun | "postmortem detected an incident" | "mort detected an incident" |
| Logo | ☠ unicode, always yellow `#FFD93D` | ASCII art; any other color |
| README title | `# postmortem ☠` | anything else |
| npm description | `postmortem ☠ — AI-powered ops intelligence` | — |
| AI-generated output | prefix every root-cause / suggested-action / prediction block with ☠ | unprefixed AI text |
| `warning` severity | orange `#FF922B` | yellow (yellow is brand-only) |

---

## Architecture in one screen

```
sensors ──emit NormalizedEvent──▶ bus ('mort:event') ──▶ ┌─ brain (analysis)
(git, logfile, vercel,                                    ├─ db (SQLite/Kysely)
 netlify, github-actions,                                 ├─ outputs (terminal, markdown, webhook)
 health-check, webhook)                                   └─ dashboard SSE (/api/stream)
```

- **`NormalizedEvent` (`src/core/event.ts`) is the only coupling point.** Nothing downstream knows or cares which sensor produced an event. Never bypass it.
- **Bus** is a typed `EventEmitter` (`src/core/bus.ts`); sensors `publish()`, everything else subscribes. Designed so actuators can subscribe later with zero changes.
- **Brain** (`src/brain/`) auto-detects a backend (claude CLI → ANTHROPIC_API_KEY → OPENAI_API_KEY → Ollama) and exposes one method: `ask(prompt): Promise<string>`.
- **Actuators** (`src/actuators/`) are **stubs in v1** — ship the abstract base + registry only, no concrete actuators.
- One Fastify server on `6660` serves webhooks + JSON API + SSE + the embedded dashboard. No second process.

---

## Build / test / run

```bash
npm run dev            # tsx src/index.ts  — run the CLI locally without building
npm run build          # tsup → dist/index.js (single ESM binary, embeds dashboard html)
npm test               # vitest run
npx vitest run path/to/file.test.ts   # single test file
npx tsx src/index.ts watch --headless # run the daemon without the Ink UI
```

Local CLI invocation during dev is `npx tsx src/index.ts <command>` (e.g. `... predict`, `... status`).

---

## Authoritative version matrix (Node 22+ baseline)

Pin these majors. **Do not reintroduce the stale versions written in spec.md §17.**

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
| smol-toml | `^1` (replaces unmaintained @iarna/toml) | vitest | `^4` |
| @biomejs/biome | `^2` (lint+format) | msw | `^2` (dev, mock HTTP for sensor tests) |

- **Default model stays `claude-sonnet-4-6`** (cost-appropriate for a background watcher). Opus 4.8 (`claude-opus-4-8`) is available for deep analysis; expose via config, don't default to it.
- When adding any dependency, confirm the latest with `npm view <pkg> version` and match the major here.

---

## Conventions

- **ESM only.** `"type": "module"`; use `.js` specifiers in relative imports (`./bus.js`), even from `.ts` files.
- **Zod-validate at every boundary:** sensor output before `publish()`, config on load, and **LLM JSON on the way in**. Never trust an LLM to return valid JSON.
- **Zod 4 syntax** (spec.md §5 uses deprecated Zod 3 forms — fix on sight):
  - `z.uuid()` not `z.string().uuid()`
  - `z.iso.datetime()` not `z.string().datetime()`
  - `z.record(z.string(), z.unknown())` — Zod 4 requires an explicit key type
- **All SQL through Kysely.** No raw string SQL except inside migrations. Migrations are versioned files run by a Kysely migrator.
- **Logging:** structured file logger (`src/core/logger.ts`) writes to `~/.postmortem/logs/` only. **Never `console.log`** while the Ink UI is mounted — it corrupts the render. Diagnostics go to the file log.
- **No blocking I/O inside Ink render.** Fetch/db/spawn happen in effects or the daemon layer; components render state.
- Prefer `node:` prefixed builtins (`node:child_process`, `node:crypto`).

---

## Security rules (non-negotiable)

- **Bind servers to `127.0.0.1` only** — never `0.0.0.0`. The dashboard and webhook receiver are local-only.
- **Secrets:** prefer env vars (`VERCEL_TOKEN`, `NETLIFY_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) over config. When `config.toml` holds a token, write the file `0600`.
- **Redact secrets** (API keys, bearer tokens, common secret patterns) from `raw`/log text **before persisting to SQLite and before sending to any brain backend.** Centralize in one redactor used by all sensors.
- **Webhook receiver:** verify HMAC signature when a secret is configured; reject otherwise.
- **health-check sensor:** guard user-supplied URLs against SSRF (block internal/metadata addresses unless explicitly allowed); enforce timeout.
- Dashboard responses set a restrictive CSP (the page is self-contained; only the JetBrains Mono font is external).

---

## Daemon vs interactive (added to spec)

`mort watch` runs two ways — keep them cleanly separated:

- **Interactive** (TTY present): mount the Ink dashboard.
- **`--headless`** (no TTY / auto-start): run sensors + server only, log to file, no Ink. Auto-start units (launchd/systemd/Windows Task Scheduler) always invoke `--headless`.

Detect with `process.stdout.isTTY`; only mount Ink when true. A **single-instance lock** (PID/port lock in `~/.postmortem/`) prevents two daemons fighting over port 6660 and the db.

---

## AI cost & robustness rules

- **Debounce + dedup** events before analysis; batch on the 30s window (or immediately on `critical`). Don't fire a brain call per event.
- Enforce a **per-window token budget**; truncate `raw` (e.g. 500–5000 chars as the prompt templates already do) and cap event counts.
- **Tolerant JSON parse:** strip ```` ```json ```` fences / preamble, then Zod-validate. On failure, retry **once** with a "return JSON only" reminder, then give up gracefully (record the incident with raw analysis text).
- Brain-not-configured is non-fatal: sensors keep recording events and the dashboard still works.

---

## Cross-platform (first-class Windows)

The user develops on Windows. Keep everything cross-platform:
- Paths via `node:path`; expand `~` explicitly.
- Auto-start: launchd plist (macOS), systemd user unit (Linux), **Task Scheduler / Startup (Windows)**.
- git hooks: `.git/hooks/pre-push` must work on Windows (shebang script is fine via Git Bash; keep it portable).
- `better-sqlite3` needs a native binary — rely on prebuilt binaries; document the build-tools fallback for Windows in the README.

---

## Resilience

- One sensor throwing must not crash the daemon — isolate each sensor's loop, log and surface as unhealthy in `sensor_health`.
- API pollers use retry with backoff and **ETag/conditional requests** where supported (GitHub especially) to avoid rate limits.
- Graceful shutdown on SIGINT/SIGTERM: stop sensors, flush, close db, release lock.

---

## Project skills

Scaffolding/maintenance skills live in `.claude/skills/`. Use them instead of hand-rolling:
- `/add-sensor` — new sensor (index + parser + config schema + registry + tests/fixtures)
- `/add-brain-backend` — new AI backend
- `/add-command` — new `mort` subcommand
- `/review-conventions` — project-specific review checklist (branding, security, Zod boundaries)
- `/gen-docs` — regenerate README / SENSOR_SPEC / ACTUATOR_SPEC / command reference from source
- `/release` — version bump + changelog + publish checklist
