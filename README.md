<div align="center">

# postmortem ☠

### AI-powered ops intelligence that lives in your terminal.

**It watches your deploys, your git, and your logs. When something breaks, it tells you _why_ — using whatever AI you already have.**

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-FFD93D.svg?style=for-the-badge&labelColor=0D0D0D)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-51CF66.svg?style=for-the-badge&labelColor=0D0D0D)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-74C0FC.svg?style=for-the-badge&labelColor=0D0D0D)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-1.0.0-FFD93D.svg?style=for-the-badge&labelColor=0D0D0D)](CHANGELOG.md)

<br/>

```
☠  postmortem is watching.   →   localhost:6660   →   ctrl+c to stop.
```

*Runs entirely on your machine. No SaaS. No account. No data leaves your box — except to the AI **you** chose.*

</div>

<br/>

---

## The 10-second pitch

You ship a commit. Three minutes later production is throwing 500s and you're tailing four dashboards trying to figure out what happened.

**postmortem already knows.** It was watching the whole time — the push, the deploy, the build log, the health endpoint going red. It correlates them into one explanation and drops it in your terminal and at `localhost:6660`.

```bash
☠ INCIDENT DETECTED · 14:33:12 · CRITICAL

☠ ROOT CAUSE        [confidence: medium]
The upgrade of axios 1.6.2 → 1.7.0 changed interceptor behavior.
3 tests depend on the old response shape. Pattern seen 2024-11-14.

☠ SUGGESTED ACTION
Pin axios to 1.6.2 or update src/api/__tests__/interceptor.test.ts
```

<br/>

## ⭐ The hero command: `mort predict`

postmortem doesn't just explain incidents **after** they happen. It catches them **before you push**.

```bash
$ mort predict

☠ DEPLOYMENT RISK: HIGH

This commit modifies: auth.ts, middleware/session.ts
3 previous incidents involved these same files.
Most recent: June 3 — session token expiry caused 500s on /api/user

Recommendation: review middleware/session.ts before deploying.
Confidence: medium
```

Wire it into a git pre-push hook (`mort hooks install`) and postmortem becomes a teammate who remembers every outage you've ever had — and stops you from repeating one.

<br/>

---

## Why it's different

| | postmortem ☠ | Typical SaaS observability |
|---|---|---|
| **Where it runs** | Your machine | Their cloud |
| **Your data** | Never leaves your box | Streamed to a vendor |
| **The AI** | Bring your own (or use Claude Code free) | Locked to their model |
| **Account** | None | Required, usually billed per seat |
| **Setup** | `npm i -g` + one wizard | SDKs, agents, dashboards |
| **The vibe** | Yellow-on-black, terminal-native, ☠ | Another browser tab |

<br/>

## Features

- 🛰️ **Sensors, not agents** — watches Vercel ★, GitHub Actions, git, log files, health endpoints, and inbound webhooks. (Netlify lands in v1.1.)
- 🧠 **Bring your own brain** — auto-detects Claude Code CLI → `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → local Ollama. Model-agnostic by design.
- 🔮 **Pre-deploy prediction** — risk-scores your diff against your own incident history.
- 🖥️ **Beautiful terminal UI** — live Ink dashboard, yellow incident cards, the ☠ before everything the AI says.
- 🌐 **Local web dashboard** at `localhost:6660` — dark, yellow, monospace, live event stream over SSE. Zero build step, embedded in the binary.
- 📝 **Markdown postmortems** — every incident written to `~/.postmortem/reports/`.
- 🔒 **Local-first & private** — binds `127.0.0.1` only, redacts secrets before anything is stored or sent to AI. **No telemetry, ever.**
- ⚡ **Try it in 60 seconds** — `mort watch --demo` replays a canned incident through the real pipeline. No tokens, no config.
- 🔌 **Extensible** — a clean `NormalizedEvent` contract and a stubbed actuator layer ready for v2.

<br/>

## How it works

```
   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │  Vercel  │   │   git    │   │  logs /  │   │  health  │   ← sensors
   │ Netlify  │   │  GitHub  │   │ webhooks │   │  checks  │
   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
        │              │              │              │
        └──────────────┴──────┬───────┴──────────────┘
                              ▼
                  ┌────────────────────────┐
                  │   NormalizedEvent bus   │   one contract, all sources
                  └───────────┬────────────┘
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
       ┌─────────┐      ┌──────────┐      ┌──────────────┐
       │  brain  │      │  SQLite  │      │  outputs:    │
       │ (BYO AI)│      │ (memory) │      │  terminal,   │
       └─────────┘      └──────────┘      │  :6660, .md  │
                                          └──────────────┘
```

Sensors emit one normalized event shape. Nothing downstream cares where it came from. The brain correlates, SQLite remembers, and the outputs make it beautiful.

<br/>

---

## Try it in 60 seconds

No account, no tokens, no config — the demo replays a real incident through the live UI:

```bash
npm install -g @postmortem-cli/mort
mort watch --demo
```

## Install

> **Status:** v1.0 — the full watch → detect → explain → predict loop, proven end-to-end. The roadmap is in [`Plan.md`](Plan.md); the full spec is in [`spec.md`](spec.md).

```bash
# Install postmortem
npm install -g @postmortem-cli/mort

# First run — interactive setup wizard
mort setup

# Start watching
mort watch          # ☠ dashboard → http://127.0.0.1:6660
```

**Requirements:** Node.js 22+ (24 LTS recommended) · npm 10+ · optionally the `claude` CLI in your `PATH` for free AI via your existing subscription.

> **Windows:** `better-sqlite3` ships prebuilt binaries for common platforms. If your setup has none, install the [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (Desktop C++ workload) so it can compile on install.

<br/>

## Bring your own brain 🧠

postmortem is model-agnostic. It picks the first backend it finds, in this order:

| Priority | Backend | How to enable |
|---|---|---|
| 1 | **Claude Code CLI** | `claude` in PATH — uses your subscription, **free**, no API key |
| 2 | **Anthropic API** | `export ANTHROPIC_API_KEY=sk-ant-...` |
| 3 | **OpenAI API** | `export OPENAI_API_KEY=sk-...` (also covers OpenRouter, etc.) |
| 4 | **Ollama** (local) | run Ollama on `localhost:11434` — 100% offline |

Default model: `claude-sonnet-4-6`. Opus 4.8 selectable for deeper analysis.

<br/>

## Sensors

| Sensor | Watches | Status |
|---|---|---|
| **Vercel** ★ | deployments, build logs, error frames | v1.0 |
| **Netlify** ★ | deploys, build failures, error messages | v1.1 |
| **GitHub Actions** | workflow runs, failed steps | v1.0 |
| **git** | commits, pushes, branch changes | v1.0 |
| **logfile** | `tail -f` + pattern matching | v1.0 |
| **health-check** | endpoint status & latency | v1.0 |
| **webhook** | anything that can POST | v1.0 |
| Railway · Fly.io · Render · CloudWatch · GCP | — | v2 / community |

<br/>

## Commands

```bash
mort watch                 # start the daemon + terminal dashboard + :6660
mort watch --demo          # ⚡ instant demo — replays a canned incident, zero config
mort watch --headless      # daemon only (no TTY)
mort predict               # ⭐ risk-score the current diff before pushing
mort incident --last 10m   # manually analyze recent events
mort status                # sensor health, active brain, event counts
mort history --last 7d     # browse past incidents
mort hooks install         # add the pre-push risk gate
mort autostart install     # run the daemon on login (macOS/Linux/Windows, no admin)
mort setup                 # re-run the wizard
mort config show           # inspect config (secrets masked)
mort mcp                   # read-only MCP server — plug your incident memory into an agent
```

### Plug postmortem into your coding agent 🔌

`mort mcp` runs a read-only [MCP](https://modelcontextprotocol.io) server over stdio, so Claude Code / Cursor can query your incident history while they work — `list_incidents`, `get_incident`, `query_events`, and `predict` (risk-score a diff against your own past outages). Read-only by design: agents read the memory, they don't pull levers. Point your MCP client at the command `mort mcp`.

<br/>

## Configuration

A single human-readable TOML file at `~/.postmortem/config.toml`, generated by `mort setup`:

```toml
[brain]
backend = "auto"               # auto | claude-cli | anthropic-api | openai-api | ollama
model   = "claude-sonnet-4-6"

[sensors.vercel]
enabled = true                 # ★ primary sensor
# token from config or VERCEL_TOKEN env var
poll_interval_seconds = 30

[sensors.git]
enabled = true
repo_path = "."
```

<br/>

---

## Roadmap

**v1.0 — shipping**
Core event bus · SQLite memory · 4 AI backends · 6 sensors + demo replay · terminal UI · web dashboard `:6660` · markdown reports · pre-deploy prediction (works from day one).

**v1.1 — fast follow**
`mort mcp` — plug postmortem's incident memory into Claude Code/Cursor as an MCP server · Netlify sensor · auto-start on login (macOS/Linux/Windows) · Slack/webhook output · Ink setup wizard.

**v2 — community + roadmap**
Actuators (Slack, GitHub issues, rollback, PagerDuty) · more sensors · multi-repo awareness · a community sensor marketplace.

> **The community builds sensors and actuators. The harness is the product.**

<br/>

## Contributing

postmortem is built around two clean extension points: the `NormalizedEvent` contract and the `BaseSensor` / `BaseActuator` abstractions. If you can write a poller, you can write a sensor. The authoring guide is [`docs/SENSOR_SPEC.md`](docs/SENSOR_SPEC.md) (the actuator guide arrives with concrete actuators in v1.1).

Contributions welcome — open an issue or a PR at **[Baniloo-Labs/postmortem](https://github.com/Baniloo-Labs/postmortem)**.

<br/>

## License

[MIT](LICENSE) © Baniloo Labs

<br/>

<div align="center">

**postmortem ☠**

*"I watch so you don't have to."*

</div>
