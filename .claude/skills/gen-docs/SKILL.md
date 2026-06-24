---
name: gen-docs
description: Regenerate postmortem's docs from source so they never drift — README hero/install, the command reference, SENSOR_SPEC.md and ACTUATOR_SPEC.md. Use after adding/changing commands, sensors, config keys, or the event schema.
---

# gen-docs

Keep documentation in sync with the code. Read the source as the source of truth, then update the docs to match. Do not invent features — document only what exists.

## What to regenerate

**README.md** (`# postmortem ☠`)
- Hero example is the `mort predict` demo (from `spec.md` §11) — keep it first.
- Install block: `npm install -g @postmortem-cli/mort`, then `mort setup`, then `mort watch`.
- Requirements: Node 22+, npm. Include the **Windows `better-sqlite3` build-tools note**.
- Brain options (claude CLI / ANTHROPIC / OPENAI / Ollama) and the `127.0.0.1:6660` dashboard.

**Command reference**
- Enumerate commands from `src/commands/` and their Commander options in `src/index.ts`. For each: usage line, flags, exit codes (`0` ok, `1` error, `2` predict-block). Flag any command in code but missing from docs, and vice versa.

**SENSOR_SPEC.md** (`docs/`)
- Authoring guide derived from `src/sensors/base.ts` and the registry: the `NormalizedEvent` contract, `EventType`/severity rules (prod=critical), redaction requirement, the `[sensors.<name>]` config block shape, and a worked example matching a real sensor in `src/sensors/`.

**ACTUATOR_SPEC.md** (`docs/`)
- Stub-level guide from `src/actuators/base.ts` (`execute`, `describe`). Mark actuators **v2 / community** — none ship in v1.

## Rules
- Source of truth is the code. If docs and code disagree, fix the docs (or surface the code bug).
- Keep branding correct: `mort` for commands, `postmortem` in prose, ☠ yellow.
- Config examples must match the real Zod schema/defaults in `src/core/config.ts` — no stale keys.
- Don't document v2 features as if they ship in v1.

## Done when
README, command reference, and both SPEC files reflect the current `src/` with no missing or phantom commands/sensors/config keys.
