---
name: review-conventions
description: Project-specific code review for postmortem — checks the conventions the generic /code-review doesn't know about (branding, theme colors, secret redaction, 127.0.0.1 binding, Zod-at-boundaries, ESM specifiers, no blocking render I/O). Use before merging any change to this repo.
---

# review-conventions

A postmortem-tuned review pass. This complements (does not replace) the built-in `/code-review` — run that for general correctness, then this for project rules. Review the current diff against the checklist; report findings as `file:line` with a concrete fix.

## Checklist

**Branding**
- [ ] Command references use `mort`; prose/product references use `postmortem`.
- [ ] ☠ is rendered yellow `#FFD93D` only (never white/red/other). `warning` severity is orange `#FF922B`, not yellow.
- [ ] AI-generated output blocks (root cause, suggested action, prediction) are prefixed with ☠.
- [ ] No hardcoded hex in components/commands — colors come from `src/outputs/terminal/theme.ts`.

**Security**
- [ ] Fastify / any server binds `127.0.0.1`, never `0.0.0.0`.
- [ ] Secrets read from env vars where possible; `config.toml` writes are `0600`.
- [ ] All `raw`/log text passes through `src/core/redact.ts` before persistence and before any brain call.
- [ ] Webhook receiver verifies HMAC when a secret is configured.
- [ ] health-check sensor guards user URLs against SSRF; enforces timeout.
- [ ] Dashboard responses set CSP.

**Data boundaries**
- [ ] Sensor output is Zod-validated against `NormalizedEvent` before `emit`.
- [ ] Config is Zod-validated on load.
- [ ] LLM JSON is parsed tolerantly (strip fences) then Zod-validated, with one retry — never `JSON.parse` raw model output directly.
- [ ] Zod 4 syntax: `z.uuid()`, `z.iso.datetime()`, `z.record(key, value)` — no deprecated Zod 3 forms.

**Runtime hygiene**
- [ ] ESM `.js` import specifiers in relative imports.
- [ ] No `console.log` while Ink is mounted — diagnostics via `src/core/logger.ts`.
- [ ] No blocking I/O inside Ink render (fetch/db/spawn happen in effects or the daemon).
- [ ] SQL goes through Kysely (raw SQL only inside migrations).
- [ ] A sensor throw can't crash the daemon (isolated loop, marked unhealthy).
- [ ] Pollers use retry/backoff + ETag/conditional requests where supported.
- [ ] Daemon mounts Ink only when `process.stdout.isTTY`; `--headless` path stays UI-free.

**Dependencies**
- [ ] New deps match the version matrix in `CLAUDE.md` (latest majors; no stale spec.md versions reintroduced).

## Output
Group findings by severity (blocker / should-fix / nit), each with `file:line` and the fix. If the diff is clean, say so explicitly.
