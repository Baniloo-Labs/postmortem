---
name: spec-drift
description: Audit the gap between what postmortem was intended to be (spec.md + CLAUDE.md + Plan.md) and what it is becoming (code, README, skills, package.json). Detects scope creep, silently dropped features, internal contradictions between the source docs, and identity drift (local-first, no SaaS, no telemetry, model-agnostic, ☠ branding). Run after every build session, before every release, and whenever a new feature idea is about to land.
---

# spec-drift

postmortem has one existential risk as a solo-built project: it slowly becomes a different product than the one that was specced — a feature here, a dropped promise there — until the pitch and the binary no longer match. This skill is the tripwire.

## Document precedence (who wins a conflict)

1. **CLAUDE.md** — engineering law + deliberate scope overrides. Wins every conflict.
2. **Plan.md** — build order and current scope (v1.0 / v1.1 / v2 split).
3. **spec.md** — product source of truth: North Star (§0), features, UX, design.
4. **README.md** — marketing. May only promise what exists or what is explicitly labeled as roadmap/status.

A contradiction between any two of these is itself drift — even with zero code written.

## Step 1 — Identity invariants (the North Star, spec §0)

These define what postmortem *is*. Check each mechanically where possible:

| Invariant | How to check |
|---|---|
| Local-first, no SaaS, no account | No auth flows, no hosted endpoints, no vendor SDKs beyond AI providers. `grep` deps for analytics/telemetry packages (posthog, segment, sentry, amplitude, mixpanel). |
| **No telemetry, ever** | No outbound calls except enabled sensor APIs + chosen brain backend. Grep for `fetch(`/`got(`/`https.request` targets outside those. |
| Servers bind `127.0.0.1` only | `grep -rn "0\.0\.0\.0\|host: *'::'" src/` must be empty; Fastify `listen` calls specify `127.0.0.1`. |
| One process, one port (6660) | No second server, no second port (the phantom `9119` must never return). |
| Model-agnostic brain | Nothing outside `src/brain/backends/` imports a provider SDK; everything calls `brain.ask()`. |
| `NormalizedEvent` is the only coupling | Sensors only `publish()`; nothing downstream imports from `src/sensors/*`; no sensor imports db/brain directly. |
| Branding | Command = `mort`, prose = `postmortem`, ☠ yellow `#FFD93D` only, warning = orange `#FF922B`, ☠ prefix on all AI output. No stray "raven"/`◢█◣` remnants. |
| Actuators are stubs in v1 | `src/actuators/` contains base + registry only — a concrete actuator appearing is scope creep. |

Any violation here is **severity: critical** — it breaks the pitch, not just the code.

## Step 2 — Surface inventory diff (intent ↔ reality)

Build two lists — "specced" and "shipped" — for each surface, and diff them:

- **Commands:** files in `src/commands/` + Commander registrations in `src/index.ts` ↔ spec §11 (as amended by CLAUDE.md v1.0 scope) ↔ README command block. Include flags and **exit codes** (`predict`: 0/1/2 — the pre-push hook contract).
- **Sensors:** dirs in `src/sensors/` ↔ spec §4/§14 ↔ Plan.md session scope ↔ README sensor table (statuses must be truthful: v1.0 / v1.1 / v2).
- **Brain backends:** `src/brain/backends/` ↔ detection order (claude-cli → ANTHROPIC → OPENAI → ollama) ↔ README table.
- **Config keys:** Zod schema in `src/core/config.ts` ↔ spec §9 TOML ↔ README config example. Every key in code must be documented; every documented key must exist.
- **Event types:** `EventType` enum in `src/core/event.ts` ↔ spec §5.
- **API routes:** Fastify routes in `src/server/` ↔ spec §12 route list ↔ dashboard JS fetch calls.
- **Versions:** `package.json` deps ↔ the CLAUDE.md version matrix (majors must match; the matrix is authoritative, not spec §17).
- **Paths & names:** `~/.postmortem/` everywhere (never `~/.mort/`), reports in `~/.postmortem/reports/` with Windows-safe filenames (no `:`), package `@postmortem-cli/mort`, bin `mort`.

Before code exists, run this step doc-against-doc (spec ↔ Plan ↔ CLAUDE.md ↔ README ↔ skills' assumptions).

## Step 3 — Classify every delta

Every finding gets exactly one label and one resolution:

| Label | Meaning | Resolution |
|---|---|---|
| **DRIFT** | Code/README diverged from intent unintentionally | Fix the code/README. |
| **STALE-SPEC** | Intent changed deliberately but docs weren't updated | Amend the doc. If it overrides spec.md, record it in CLAUDE.md (that's where overrides live), dated. |
| **CREEP** | Feature exists that no doc asked for | Justify it (then spec it, in the right version bucket) or remove it. Default for v1.0: remove — shipping is the feature. |
| **GAP** | Specced for the current version but missing | Schedule it in Plan.md's session order, or move it to v1.1 explicitly. Silent omission is how promises rot. |

**Never silently edit spec.md to match the code.** The spec moves only by deliberate, visible amendment. The North Star (§0) may not be weakened by this skill at all — if a finding argues against it, stop and surface the tension to the user; that's a product decision, not a drift fix.

## Step 4 — Report

Output a drift report (also useful as a PR comment / pre-release gate):

```
☠ SPEC DRIFT REPORT · <date> · <git rev>

CRITICAL (identity)     n findings
DRIFT / STALE-SPEC / CREEP / GAP   n / n / n / n

<one line per finding>
[LABEL] file:line — what diverged from what (doc §ref) → resolution
```

End with a verdict: **clean** / **drifting** (fix before next session) / **off-course** (stop building, realign scope).

## When to run

- After each Plan.md session lands (each session must end green *and* aligned).
- Before `/release` — a release with unresolved CRITICAL or DRIFT findings does not ship.
- When a new feature idea appears mid-build: run steps 1 + 3 on the *idea* first — does it serve the loop (watch → detect → explain → predict) and the current version bucket? If not, it goes to v1.1/v2 in writing, not into the code.
