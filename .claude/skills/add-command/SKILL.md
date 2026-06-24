---
name: add-command
description: Scaffold a new `mort` CLI subcommand following the Commander.js pattern (command file + entry wiring + help text + exit codes). Use when adding a new top-level command like `mort export` or `mort doctor`.
---

# add-command

Add a new `mort` subcommand. Each command is a self-contained file in `src/commands/` wired into the Commander entry in `src/index.ts`.

## Inputs to gather first
- **Command name** and signature (e.g. `mort export --since 7d --format json`).
- **Interactive or non-interactive?** Non-interactive commands (`status`, `history`) print and exit. Interactive ones (`setup`) may mount Ink — only when `process.stdout.isTTY`.
- **Side effects:** reads db? touches config? spawns the brain? needs the daemon running?

## Steps
1. Create `src/commands/<name>.ts` exporting a handler. Read via Kysely (`src/core/db.ts`), config via `src/core/config.ts`. Keep argument parsing in Commander, business logic in the handler.
2. Register it in `src/index.ts`: `program.command(...).description(...).option(...).action(handler)`. Match the existing help-text voice.
3. Branding in output: ☠ is yellow `#FFD93D`; prose says "postmortem", commands say `mort`; use `src/outputs/terminal/theme.ts` colors — never hardcode hex in the command.
4. Define **exit codes** explicitly (see contract below) — scripts and git hooks depend on them.
5. Tests: `tests/commands/<name>.test.ts` for the handler logic (inject a temp db/config; assert output + exit code).

## Exit-code contract
- `0` success / no action needed.
- `1` runtime error (bad config, db failure, brain error).
- `2` reserved for `predict` "block" (critical risk) so the pre-push hook can distinguish block-vs-warn. Don't reuse `2` for generic errors.

## Rules (must follow)
- **Never `console.log` while Ink is mounted.** For non-interactive commands, plain stdout is fine; for the live dashboard, render through Ink only.
- Non-TTY must still work — degrade interactive prompts gracefully (flags or sensible defaults).
- Validate any user input / config with Zod before use.
- Long-running work belongs in the daemon (`watch`), not a one-shot command.

## Done when
`mort <name> --help` shows correct usage, the handler is tested, and exit codes match the contract.
