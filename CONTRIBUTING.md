# Contributing to postmortem ☠

Thanks for helping build postmortem — a local-first, model-agnostic ops-intelligence harness. This guide covers the dev setup and the conventions the codebase enforces.

## Ground rules (the short version)

- **The pitch is the product.** postmortem runs entirely on the user's machine: no SaaS, no account, **no telemetry, ever**. The only outbound calls are to the sensor APIs the user enabled and the AI backend they chose. A change that breaks this doesn't get merged.
- **`NormalizedEvent` is the only coupling point.** Sensors `publish()` events; nothing downstream knows which sensor produced one. Never bypass the bus.
- **Command is `mort`, the product is `postmortem`.** In prose it's "postmortem detected an incident"; on the command line it's `mort watch`. The ☠ is always yellow `#FFD93D`.

The full engineering law is in [`CLAUDE.md`](CLAUDE.md); the product spec is [`spec.md`](spec.md); the build order is [`Plan.md`](Plan.md). `CLAUDE.md` wins any conflict.

## Prerequisites

- **Node.js 22+** (24 LTS recommended)
- **npm 10+**
- **Windows:** `better-sqlite3` installs from a prebuilt binary. If your platform has none, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (Desktop C++ workload) so it can compile.

## Setup

```bash
git clone https://github.com/Baniloo-Labs/postmortem.git
cd postmortem
npm install
```

## Everyday commands

```bash
npm run dev            # run the CLI locally without building (tsx src/index.ts)
npm run build          # tsup → dist/index.js (single ESM binary, embeds the dashboard)
npm test               # vitest run
npm run test:watch     # vitest in watch mode
npm run typecheck      # tsc --noEmit
npm run lint           # biome check .
npm run format         # biome format --write .

npx vitest run tests/core/event.test.ts   # a single test file
```

## Conventions that CI enforces

- **ESM only.** `"type": "module"`; use `.js` specifiers in relative imports (`./bus.js`) even from `.ts` files.
- **Zod-validate at every boundary** — sensor output before `publish()`, config on load, and **LLM JSON on the way in** (never trust a model to return valid JSON). Use Zod 4 syntax (`z.uuid()`, `z.iso.datetime()`, `z.record(z.string(), z.unknown())`).
- **All SQL through Kysely.** No raw string SQL outside migrations.
- **Never `console.log` while the Ink UI is mounted** — it corrupts the render. Diagnostics go to the file logger (`~/.postmortem/logs/`). Biome flags stray `console` use.
- **Security is non-negotiable:** bind servers to `127.0.0.1` only; write token-bearing config files `0600`; redact secrets before they hit SQLite or any AI backend.
- Prefer `node:`-prefixed builtins (`node:child_process`, `node:crypto`).

CI runs Biome, `tsc`, Vitest, and a `tsup` build on the Node 22/24 matrix across Linux and Windows. All four must be green.

## Use the project skills

Don't hand-roll scaffolding — the repo ships Claude Code skills for the common tasks:

- `/add-sensor` — a new data source (Railway, Fly.io, Render, …)
- `/add-brain-backend` — a new AI provider
- `/add-command` — a new `mort` subcommand
- `/review-conventions` — the project-specific review checklist
- `/spec-drift` — verify code still matches intent (run before opening a PR)
- `/gen-docs` — regenerate docs from source
- `/release` — the publish checklist

## Pull requests

1. Branch off `main`.
2. Keep the change focused; match the surrounding code's style.
3. Run `npm run lint && npm run typecheck && npm test` before pushing.
4. Run `/spec-drift` if you touched commands, sensors, config keys, or the event schema — a PR that drifts from the spec without amending it won't merge.
5. Describe what changed and why. Reference the `Plan.md` session or spec section when relevant.

## The extension model

postmortem is built around two clean seams: the `NormalizedEvent` contract and the `BaseSensor` / `BaseActuator` abstractions. If you can write a poller, you can write a sensor. Authoring guides: `docs/SENSOR_SPEC.md` and `docs/ACTUATOR_SPEC.md` (concrete actuators land in v2.0).

**The community builds sensors and actuators. The harness is the product.**
