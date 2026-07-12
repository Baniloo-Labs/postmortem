# Testing postmortem ☠ — a hands-on guide

A practical guide to exercising the full **watch → detect → explain → predict** loop
on your own machine. Commands are PowerShell-first (Windows); bash equivalents are
noted where they differ.

> **The one thing to know:** git *commits* are `info` severity and won't trigger an
> incident on their own. Incidents fire on **any `critical` event, or 2+
> `error`/`critical` events within 5 minutes.** So the fastest way to see a real
> incident is to produce a `critical` event (webhook, a 500 health check, a `FATAL`
> log line) — or to force analysis with `mort incident --last`.

---

## 0. Prerequisites

```powershell
npm install -g @postmortem-cli/mort      # v1.0.1+
mort --version                            # 1.0.1
mort setup                                # choose [1] Claude Code → "✓ Claude Code detected"
```

You need a brain configured for analysis. With Claude Code installed and logged in,
option `[1]` is free. Without a brain, sensors still record events and the dashboard
still works — but you won't get AI explanations.

---

## 1. The 60-second smoke (zero config)

```powershell
mort watch --demo
```

Replays a scripted incident (push → build fail → deploy fail → health red) through
the real UI, ending with a sample root-cause card. No tokens, no config. `Ctrl+C` to
stop. This proves the UI/pipeline render without touching your real data.

---

## 2. Real AI on demand (no waiting for an incident)

These call your brain immediately against real data:

```powershell
# Risk-score your current git diff (make an edit first so there's a diff)
mort predict

# Force-analyze recent events into an incident (works on whatever's in the db)
mort incident --last 24h
```

`mort predict` works even with zero history. `mort incident --last` needs some events
in the db first (run `mort watch` for a bit, or fire a webhook — see §4).

---

## 3. Start the real daemon

```powershell
mort watch
```

This is the full daemon: it holds the single-instance lock, persists events to
SQLite, runs the incident pipeline, and serves the **web dashboard**. Open it:

```
http://localhost:6660
```

Leave `mort watch` running in one terminal; run the trigger commands below in another.
While it runs you can also, from a second terminal:

```powershell
mort status                 # brain, daemon, sensor health, 24h event count
mort history                # past incidents (local time)
```

---

## 4. Trigger a REAL incident

Pick any of these. Each produces a `critical` (or 2+ significant) event → after a ~2s
debounce the pipeline calls your brain → an incident is persisted, a markdown report
is written, and the incident card appears in the terminal + dashboard.

### 4a. Webhook (fastest, fully controllable)

First enable the webhook receiver — `mort setup` doesn't ask about it, so edit the
config directly:

```powershell
mort config path            # prints e.g. C:\Users\you\.postmortem\config.toml
notepad "$env:USERPROFILE\.postmortem\config.toml"
```

Add (or set):

```toml
[sensors.webhook]
enabled = true
# secret = ""   # leave blank for local testing (accepts unsigned posts)
```

Restart `mort watch` (Ctrl+C, run again). Then post a **critical** event:

```powershell
$body = '{"type":"deploy.failed","severity":"critical","summary":"prod deploy failed","raw":"exit 1: module not found"}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:6660/webhook/ci -ContentType application/json -Body $body
```

Within a few seconds you'll see the incident card. Check the report:

```powershell
Get-ChildItem "$env:USERPROFILE\.postmortem\reports\"
Get-Content "$env:USERPROFILE\.postmortem\reports\*.md" | Select-Object -First 25
```

> Valid `type` values: `deploy.failed`, `build.failed`, `health.degraded`,
> `test.failed`, `log.error`, etc. A bad type returns `400` with the full list.

### 4b. Log file (realistic app-log tailing)

Point the logfile sensor at a file, then append error lines. Edit config:

```toml
[sensors.logfile]
enabled = true
paths = ["D:\\tmp\\app.log"]
patterns = ["ERROR", "FATAL", "Exception"]
```

Restart `mort watch`. Then (a single `FATAL` is `critical` → triggers on its own):

```powershell
"2026-07-12 10:01 ERROR database connection lost"  | Add-Content D:\tmp\app.log
"2026-07-12 10:01 FATAL out of memory, worker died" | Add-Content D:\tmp\app.log
```

### 4c. Health check (a real endpoint going red)

```toml
[sensors.health-check]
enabled = true
endpoints = ["https://httpstat.us/500"]   # returns HTTP 500
interval_seconds = 15
```

Restart `mort watch`. The first poll sees a 500 → `health.degraded` (`critical`) →
incident. (Internal/private URLs are blocked by the SSRF guard by design.)

### 4d. GitHub Actions (a real failing CI run)

You enabled this sensor in setup. To exercise it you need a `GITHUB_TOKEN` and a repo
with a failing workflow:

```powershell
$env:GITHUB_TOKEN = "ghp_yourtoken"
```
```toml
[sensors.github-actions]
enabled = true
repos = ["your-org/your-test-repo"]
poll_interval_seconds = 60
```

Push a workflow that fails (see the test-repo recipe in §6). Failures on
`main`/`master` are `critical`; other branches are `error`.

### 4e. Vercel (a real failing deploy)

```powershell
$env:VERCEL_TOKEN = "your_vercel_token"
```
```toml
[sensors.vercel]
enabled = true
poll_interval_seconds = 30
```

Trigger a production deploy that fails (e.g. push a build error). Production failures
are `critical`.

---

## 5. Where to look

| What | Where |
|---|---|
| Live event stream + incident card | the `mort watch` terminal, and `http://localhost:6660` |
| Past incidents | `mort history` (or the Incidents view in the dashboard) |
| Full incident + timeline | click an incident in the dashboard, or open the report file |
| Markdown postmortems | `~/.postmortem/reports/*.md` |
| Daemon / sensor health | `mort status`, or `http://localhost:6660/api/status` |
| Diagnostics (never the UI) | `~/.postmortem/logs/postmortem-YYYY-MM-DD.log` |
| Raw JSON API | `/api/events`, `/api/incidents`, `/api/sensors`, `/api/stream` (SSE) |

---

## 6. Set up a dedicated test repo

A throwaway repo you can safely spam with commits and failing builds:

```powershell
mkdir D:\tmp\mort-testbed; cd D:\tmp\mort-testbed
git init -b main
git commit --allow-empty -m "init"
```

Point postmortem at it (in config):

```toml
[sensors.git]
enabled = true
repo_path = "D:\\tmp\\mort-testbed"
```

To exercise the **GitHub Actions** sensor, push this repo to GitHub and add a workflow
that fails on purpose — `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "pretending to build"
      - run: exit 1        # deliberate failure
```

Push it, set `GITHUB_TOKEN` + `repos = ["you/mort-testbed"]`, and within a poll cycle
postmortem detects the failed run, pulls the failed step, and analyzes it.

Combine sources for a richer incident: push a commit *and* fire a health-check 500 in
the same 5-minute window — the pipeline correlates them into one incident with a
timeline spanning both sensors.

---

## 7. Reset between tests

```powershell
mort watch            # stop it first (Ctrl+C)
Remove-Item "$env:USERPROFILE\.postmortem\postmortem.db*"     # wipe events + incidents
Remove-Item "$env:USERPROFILE\.postmortem\reports\*"          # wipe reports
# Full reset (also removes config): Remove-Item -Recurse "$env:USERPROFILE\.postmortem"
```

---

## 8. Gotchas

- **git commits alone won't trigger an incident** — they're `info`. You need a
  `critical`, or 2+ `error`/`critical` in 5 minutes.
- **Analysis needs a brain.** No brain → events are recorded but not explained.
  `mort watch` will prompt you to set one up.
- **One daemon at a time.** A second `mort watch` fails fast with "already running."
  Stop the first, or use `--demo` (which runs lock-free alongside it).
- **`mort setup` only configures brain / git / Vercel / GitHub.** Webhook, logfile,
  and health-check are enabled by editing `config.toml` (see §4).
- **Everything is local.** No data leaves your machine except calls to the AI backend
  you chose and the sensor APIs you enabled. No telemetry.
