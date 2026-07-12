# Actuator Authoring Guide

An **actuator** is where postmortem stops *explaining* and starts *acting*: when an
incident is detected, an actuator can take an action — post to a chat, open a
GitHub issue, page on-call, trigger a rollback. Actuators are the headline of
**v2.0**; the scaffold (`BaseActuator` + registry) ships stubbed in v1.x so the
seam is real, but **no concrete actuator runs until v2.0**.

> Acting on production is high-stakes. This guide is as much about the **safety
> model** as the API. Read the safety section before writing an `execute()`.

---

## The contract: `BaseActuator`

Extend `BaseActuator` (`src/actuators/base.ts`) and implement two methods:

```ts
export class TelegramActuator extends BaseActuator {
  readonly name = "telegram";
  readonly displayName = "Telegram";

  // Human-readable — shown to the user BEFORE anything happens.
  describe(incident: Incident): string {
    return `post "${incident.title}" to the configured Telegram chat`;
  }

  // The action itself. Called only after the safety gates below pass.
  async execute(incident: Incident, config: Record<string, unknown>): Promise<ActuatorResult> {
    // …do the thing…
    return { ok: true, message: "posted to chat", detail: { messageId: 42 } };
  }
}
```

`describe()` must be truthful and specific — it is the last thing a human sees
before an action runs. `execute()` returns an `ActuatorResult` (`ok`, `message`,
optional `detail`); it should **never throw** for an expected failure (a down API),
only return `{ ok: false }`.

---

## The safety model (non-negotiable)

An actuator that acts on the wrong signal, or too eagerly, is worse than no
actuator. The v2.0 framework enforces:

1. **Dry-run by default.** A newly-configured actuator runs in dry-run: it logs
   what it *would* do (via `describe()`) and does not act. Acting requires an
   explicit opt-in per actuator in config.
2. **Confirmation / approval gate.** For high-stakes actuators (rollback, paging),
   an action is proposed and requires confirmation (interactive prompt, or an
   approval step) before it fires. Low-stakes notifications (Telegram) may be
   configured to auto-fire.
3. **Audit trail.** Every actuation — proposed, confirmed, executed, result — is
   recorded (db + log). You must be able to answer "what did postmortem do, and
   why" after the fact.
4. **Isolation.** Like sensors, one actuator throwing must never crash the daemon
   or block the others. The registry wraps each in try/catch.
5. **Severity gating.** Actuators declare the minimum severity they act on (e.g.
   rollback only on `critical` production incidents), and never act on their own
   output.

The pipeline calls actuators only after these gates; an actuator author should
still fail safe (validate inputs, no destructive default).

---

## Config

Each actuator gets a `[actuators.<name>]` block, opt-in and dry-run by default:

```toml
[actuators.telegram]
enabled = false
dry_run = true              # log the action, don't perform it
min_severity = "error"      # only act on error/critical
# secrets prefer env vars; when in config, the file stays 0600
```

Secrets are redacted before persistence/logging by the same central redactor
sensors use — never handle redaction yourself.

---

## Registry

Register the actuator in the actuator registry (`src/actuators/index.ts`), which
mirrors the sensor registry's isolation contract. The registry is empty in v1.x.

---

## Tests

- **Unit-test `describe()`** — it's pure and it's what humans trust.
- **Unit-test `execute()`** against a mocked API (msw / injected client): assert it
  performs the right call for a given incident, returns `{ ok: false }` (not throws)
  on API failure, and **respects `dry_run`** (no call made).
- Test the severity gate: below `min_severity`, `execute()` is never reached.

---

**The community builds actuators. The harness — and its safety model — is the
product.** A concrete actuator (`TelegramActuator`) ships first in v2.0 as the
reference implementation.
