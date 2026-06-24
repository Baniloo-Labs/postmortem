# postmortem ☠ — AI-Powered Ops Intelligence Harness
### Complete Build Specification v1.1
> This document is the single source of truth. Hand it to Claude Code and say: "Build this completely, top to bottom, one module at a time."

---

## 0. North Star

**postmortem** is a terminal-native, model-agnostic, open-source ops intelligence harness. It runs on your own machine — not any cloud service — watching your deployments (Vercel, Netlify), git activity, CI/CD pipelines, and health endpoints. When something breaks, it correlates everything into a single explanation and tells you why, using whatever AI you already have. No SaaS account. No data leaving your machine except to your chosen AI backend. Sensors first, actuators later. Installs in one command. Looks beautiful in the terminal.

**The terminal command is `mort`. The product name everywhere else is postmortem.**

---

## 1. Name & Command

| Property | Value |
|---|---|
| Product name | **postmortem** |
| Terminal command | `mort` |
| npm package | `@postmortem-cli/mort` |
| Binary | `mort` |
| Config dir | `~/.postmortem/` |
| Config file | `~/.postmortem/config.toml` |
| Database | `~/.postmortem/postmortem.db` (SQLite) |
| Log dir | `~/.postmortem/logs/` |
| Postmortem output dir | `~/.postmortem/reports/` |

**Naming rules — Claude Code must follow these everywhere:**
- In all terminal output, README headings, package.json name, directory names: `mort` is the command, `postmortem` is what you call it in prose
- Example: `mort watch` starts postmortem. "postmortem detected an incident." "Install postmortem with npm."
- The ☠ symbol appears at every size — in the terminal header, beside every AI output, in the README, in the npm description. It is the logo.

---

## 2. Installation

```bash
# Install postmortem
npm install -g @postmortem-cli/mort

# First run — postmortem setup wizard
mort setup

# Start postmortem watching
mort watch
```

**Requirements:**
- Node.js 22+ (Node 24 is the current LTS; Node 20 is end-of-life)
- npm 10+
- Optional: `claude` binary in PATH (Claude Code) for free AI via your existing subscription
- Windows users: a prebuilt `better-sqlite3` binary is used by default; if your platform has no prebuilt, Visual Studio Build Tools are required to compile it

postmortem runs entirely on your machine. No cloud account, no server, no SaaS. Exactly like OpenClaw.

---

## 3. Tech Stack

Versions below reflect the current ecosystem (verified against npm). The architecture is fixed; the libraries are the modern, actively-maintained choices.

| Layer | Technology | Version | Reason |
|---|---|---|---|
| Language | **TypeScript** | `^6` | Type safety, npm-native, Claude Code excels at it |
| Runtime | **Node.js** | `>=22` (24 LTS) | Native async I/O, perfect for multi-sensor watching |
| Package manager | **npm** | `10+` | Universal, same install UX as Claude Code |
| CLI framework | **Commander.js** | `^15` | Mature, simple, widely understood |
| Terminal UI | **Ink** (React for CLIs) | `^7` | Live-updating panels, component model, beautiful output |
| React (for Ink) | **React** | `^19` | Required peer for Ink v7 |
| Terminal styling | **Chalk** | `^5.6` | Colors, consistent with Claude Code aesthetics |
| Spinners/progress | **ora** | `^9` | Beautiful spinners, matches Claude Code's loading style |
| Tables/boxes | **cli-table3 + boxen** | `^0.6.5` / `^8` | Structured output, status panels |
| Config | **TOML** via `smol-toml` | `^1` | Maintained, fast TOML parser (replaces the unmaintained `@iarna/toml`) |
| Database | **better-sqlite3** | `^12` | Local SQLite, zero-ops, fast, synchronous API |
| ORM/Query | **Kysely** | `^0.29` | Type-safe SQL query builder, no magic |
| HTTP client | **got** | `^15` | Modern, stream-aware HTTP for polling APIs |
| File watching | **chokidar** | `^5` | Cross-platform file system events (git, logs) |
| Webhook server + Dashboard | **Fastify** | `^5.8` | Serves webhooks AND the local web dashboard on port 6660 |
| Dashboard UI | **Vanilla HTML/CSS/JS** (single embedded file) | — | No build step, no dependencies, ships inside the binary |
| Live updates | **Server-Sent Events (SSE)** | — | Streams live events to the dashboard without WebSocket complexity |
| AI (API path) | **Anthropic SDK + openai SDK** | `^0.105` / `^6` | Direct API access, model-agnostic |
| AI (CLI path) | **Node.js child_process** | — | Subprocess to `claude -p` binary |
| Schema validation | **Zod** | `^4` | Runtime type validation for events, config, and LLM JSON |
| Lint + format | **Biome** | `^2` | Single fast tool, replaces ESLint + Prettier |
| Testing | **Vitest + msw** | `^4` / `^2` | Fast TypeScript-native tests; `msw` mocks sensor HTTP |
| Build | **tsup** | `^8.5` | Zero-config TypeScript bundler; embeds the dashboard HTML |

> **Default model:** `claude-sonnet-4-6` (cost-appropriate for a background watcher). Opus 4.8 (`claude-opus-4-8`) is selectable via config for deeper analysis.

---

## 4. Repository Structure

```
postmortem/                     ← repo name is postmortem
├── package.json                ← name: "@postmortem-cli/mort"
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md                   ← "postmortem ☠" everywhere in prose
├── SENSOR_SPEC.md              # Community sensor authoring guide
├── ACTUATOR_SPEC.md            # Community actuator authoring guide (stubs)
│
├── src/
│   ├── index.ts                # CLI entry point, Commander.js — binary name: mort
│   │
│   ├── core/
│   │   ├── bus.ts              # Internal async event bus (EventEmitter-based)
│   │   ├── event.ts            # NormalizedEvent Zod schema + TypeScript types
│   │   ├── db.ts               # SQLite connection, migrations, query helpers
│   │   ├── config.ts           # Config loader, validator, defaults
│   │   └── logger.ts           # Internal structured logger (file only, not terminal)
│   │
│   ├── brain/
│   │   ├── index.ts            # Brain class: detect backend, expose ask()
│   │   ├── backends/
│   │   │   ├── claude-cli.ts   # Subprocess to `claude -p`
│   │   │   ├── anthropic.ts    # Anthropic SDK direct
│   │   │   ├── openai.ts       # OpenAI SDK (also covers OpenRouter, etc.)
│   │   │   └── ollama.ts       # Local Ollama via OpenAI-compatible API
│   │   └── prompts/
│   │       ├── incident.ts     # Incident analysis prompt template
│   │       ├── build.ts        # Build failure analysis prompt template
│   │       └── predict.ts      # Pre-deploy prediction prompt template
│   │
│   ├── sensors/
│   │   ├── base.ts             # BaseSensor abstract class
│   │   ├── index.ts            # Sensor registry, loader
│   │   ├── git/
│   │   │   ├── index.ts        # Git sensor: watches .git dir via chokidar
│   │   │   └── parser.ts       # Parse git log, diff, branch info
│   │   ├── logfile/
│   │   │   ├── index.ts        # Log file sensor: tail -f equivalent
│   │   │   └── parser.ts       # Pattern matching, error extraction
│   │   ├── vercel/             # ★ PRIMARY SENSOR — most new-age devs deploy here
│   │   │   ├── index.ts        # Vercel API poller + webhook receiver
│   │   │   └── parser.ts       # Parse deployment logs, build output, error frames
│   │   ├── netlify/            # ★ PRIMARY SENSOR — second most common deployment
│   │   │   ├── index.ts        # Netlify API poller + webhook receiver
│   │   │   └── parser.ts       # Parse deploy logs, function errors, build output
│   │   ├── github-actions/
│   │   │   ├── index.ts        # GitHub Actions API poller
│   │   │   └── parser.ts       # Parse workflow run logs
│   │   ├── health-check/
│   │   │   ├── index.ts        # HTTP endpoint poller
│   │   │   └── parser.ts       # Response time, status code tracking
│   │   └── webhook/
│   │       ├── index.ts        # Fastify webhook receiver (any platform can POST)
│   │       └── parser.ts
│   │
│   ├── actuators/              # Empty in v1, architecture ready
│   │   ├── base.ts             # BaseActuator abstract class (stub)
│   │   └── index.ts            # Actuator registry (stub)
│   │
│   ├── server/                 # Fastify server — port 6660
│   │   ├── index.ts            # Server bootstrap: webhooks + dashboard + SSE on one port
│   │   ├── routes/
│   │   │   ├── webhook.ts      # POST /webhook/:source — incoming CI/CD events
│   │   │   ├── api.ts          # GET /api/events, /api/incidents, /api/sensors, /api/status
│   │   │   └── stream.ts       # GET /api/stream — Server-Sent Events for live updates
│   │   └── dashboard/
│   │       └── index.html      # Single-file dashboard — embedded in binary at build time
│   │
│   ├── outputs/
│   │   ├── terminal/
│   │   │   ├── index.ts        # Main Ink app, live dashboard
│   │   │   ├── logo.ts         # ☠ skull constants — all sizes
│   │   │   ├── theme.ts        # Chalk color theme — yellow brand
│   │   │   ├── components/
│   │   │   │   ├── Header.tsx          # ☠ postmortem logo + status bar
│   │   │   │   ├── SensorStatus.tsx    # Live sensor health panel
│   │   │   │   ├── EventStream.tsx     # Scrolling event feed
│   │   │   │   ├── IncidentCard.tsx    # Rich incident display
│   │   │   │   ├── BrainIndicator.tsx  # Which AI backend is active
│   │   │   │   └── Spinner.tsx         # Loading states
│   │   ├── markdown/
│   │   │   └── index.ts        # Write postmortem report .md files
│   │   └── webhook/
│   │       └── index.ts        # POST results to Slack / custom webhooks
│   │
│   └── commands/
│       ├── watch.ts            # `mort watch` — start postmortem daemon
│       ├── incident.ts         # `mort incident` — trigger manual analysis
│       ├── predict.ts          # `mort predict` — pre-deploy risk assessment
│       ├── setup.ts            # `mort setup` — interactive first-run wizard
│       ├── status.ts           # `mort status` — show sensor health
│       ├── history.ts          # `mort history` — show past incidents
│       ├── hooks.ts            # `mort hooks install/uninstall` — git hook integration
│       └── config.ts           # `mort config` — show/edit config
│
├── tests/
│   ├── core/
│   ├── brain/
│   └── sensors/
│
└── docs/
    ├── SENSOR_SPEC.md
    └── ACTUATOR_SPEC.md
```

---

## 5. The Normalized Event — Core Data Contract

Every sensor emits exactly this shape. Nothing downstream cares where data came from.

```typescript
// src/core/event.ts

import { z } from 'zod';

export const EventSeverity = z.enum(['info', 'warning', 'error', 'critical']);
export const EventType = z.enum([
  'build.started',
  'build.succeeded',
  'build.failed',
  'deploy.started',
  'deploy.succeeded',
  'deploy.failed',
  'test.failed',
  'lint.failed',
  'git.commit',
  'git.push',
  'git.branch_changed',
  'log.error',
  'log.warning',
  'health.degraded',
  'health.recovered',
  'incident.detected',
  'incident.resolved',
]);

// NOTE: Zod 4 syntax — z.uuid()/z.iso.datetime() are top-level,
// and z.record() requires an explicit key type.
export const NormalizedEvent = z.object({
  id: z.uuid(),
  timestamp: z.iso.datetime(),
  source: z.string(),           // 'github_actions' | 'logfile' | 'git' | etc.
  type: EventType,
  severity: EventSeverity,
  raw: z.string(),              // original text, unparsed (secrets redacted before persist/AI)
  summary: z.string(),          // one-line human-readable description
  metadata: z.object({
    repo: z.string().optional(),
    branch: z.string().optional(),
    commit: z.string().optional(),
    actor: z.string().optional(),
    url: z.string().optional(),
    duration_ms: z.number().optional(),
  }),
  payload: z.record(z.string(), z.unknown()), // sensor-specific structured data
});

export type NormalizedEvent = z.infer<typeof NormalizedEvent>;
```

---

## 6. The Event Bus

```typescript
// src/core/bus.ts
// Simple async event bus. All sensors emit here. Brain and outputs subscribe.
// Designed so actuators can subscribe later with zero changes.

import { EventEmitter } from 'node:events';
import type { NormalizedEvent } from './event.js';

class MortBus extends EventEmitter {
  emit(event: 'mort:event', data: NormalizedEvent): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: 'mort:event', listener: (data: NormalizedEvent) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  publish(event: NormalizedEvent): void {
    this.emit('mort:event', event);
  }
}

export const bus = new MortBus();
```

---

## 7. The Base Sensor

```typescript
// src/sensors/base.ts
// Every sensor extends this. One method to implement: start().

import type { NormalizedEvent } from '../core/event.js';
import { bus } from '../core/bus.js';

export abstract class BaseSensor {
  abstract readonly name: string;
  abstract readonly displayName: string;

  protected emit(event: NormalizedEvent): void {
    bus.publish(event);
  }

  abstract start(config: Record<string, unknown>): Promise<void>;
  abstract stop(): Promise<void>;
  abstract healthCheck(): Promise<{ healthy: boolean; message: string }>;
}
```

---

## 8. The Brain — AI Backend Detection & Routing

```typescript
// src/brain/index.ts

export type BrainBackend = 'claude-cli' | 'anthropic-api' | 'openai-api' | 'ollama';

export class Brain {
  private backend: BrainBackend;

  async init(): Promise<void> {
    this.backend = await this.detectBackend();
  }

  // Detection order: claude CLI → ANTHROPIC_API_KEY → OPENAI_API_KEY → Ollama
  private async detectBackend(): Promise<BrainBackend> {
    if (await this.claudeCliAvailable()) return 'claude-cli';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic-api';
    if (process.env.OPENAI_API_KEY) return 'openai-api';
    if (await this.ollamaRunning()) return 'ollama';
    throw new BrainNotConfiguredError();
  }

  async ask(prompt: string): Promise<string> {
    // Routes to the correct backend, returns string response
  }

  private async claudeCliAvailable(): Promise<boolean> {
    // Check if `claude` binary exists in PATH
  }

  private async ollamaRunning(): Promise<boolean> {
    // Check if localhost:11434 responds
  }
}

export class BrainNotConfiguredError extends Error {
  constructor() {
    super(`postmortem needs a brain. Configure one of:
  Option 1 (recommended): Install Claude Code → curl -fsSL https://claude.ai/install.sh | bash && claude /login
  Option 2: export ANTHROPIC_API_KEY=sk-ant-...
  Option 3: export OPENAI_API_KEY=sk-...
  Option 4: Install Ollama → https://ollama.ai`);
  }
}
```

### Claude CLI Backend (the key one)

```typescript
// src/brain/backends/claude-cli.ts
import { spawn } from 'node:child_process';

export async function askClaudeCli(prompt: string, model = 'claude-sonnet-4-6'): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '-p',
      '--output-format', 'text',
      '--model', model,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude CLI exited ${code}: ${stderr}`));
    });
  });
}
```

---

## 9. Configuration File

```toml
# ~/.postmortem/config.toml
# Generated by `mort setup`. Edit freely.

[brain]
# auto | claude-cli | anthropic-api | openai-api | ollama
backend = "auto"
model = "claude-sonnet-4-6"
# anthropic_api_key = ""   # or set ANTHROPIC_API_KEY env var
# openai_api_key = ""      # or set OPENAI_API_KEY env var

[brain.ollama]
host = "http://localhost:11434"
model = "llama3"

[output]
reports_dir = "~/.postmortem/reports"
# Optional: POST incident reports to a webhook
# webhook_url = "https://hooks.slack.com/services/..."

[sensors.git]
enabled = true
repo_path = "."             # path to watch, or list of paths
poll_interval_seconds = 5

[sensors.vercel]
enabled = false
token = ""                  # Vercel API token — or set VERCEL_TOKEN env var
team_id = ""                # optional, for team accounts
project_ids = []            # ["prj_xxxx"] — leave empty to watch all projects
poll_interval_seconds = 30

[sensors.netlify]
enabled = false
token = ""                  # Netlify personal access token — or set NETLIFY_TOKEN env var
site_ids = []               # ["xxxx-xxxx"] — leave empty to watch all sites
poll_interval_seconds = 30

[sensors.logfile]
enabled = false
paths = ["/var/log/app.log"]
# patterns = ["ERROR", "FATAL", "Exception"]

[sensors.github-actions]
enabled = false
token = ""                  # or set GITHUB_TOKEN env var
repos = []                  # ["myorg/myrepo"]
poll_interval_seconds = 60

[sensors.health-check]
enabled = false
endpoints = []              # ["https://api.myapp.com/health"]
interval_seconds = 30
timeout_seconds = 5

[sensors.webhook]
enabled = false
port = 9119                 # postmortem listens for incoming webhooks here
secret = ""                 # optional HMAC validation
```

---

## 10. SQLite Schema

```sql
-- Managed by Kysely migrations, not raw SQL files

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  raw TEXT NOT NULL,
  metadata TEXT NOT NULL,   -- JSON
  payload TEXT NOT NULL,    -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  root_cause TEXT,          -- LLM output
  timeline TEXT,            -- LLM output, JSON array
  suggested_action TEXT,    -- LLM output
  event_ids TEXT NOT NULL,  -- JSON array of event IDs that triggered this
  postmortem_path TEXT,     -- path to generated .md file
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sensor_health (
  sensor_name TEXT PRIMARY KEY,
  healthy INTEGER NOT NULL DEFAULT 1,
  last_check TEXT NOT NULL,
  message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_source ON events(source);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_incidents_detected_at ON incidents(detected_at);
```

---

## 11. CLI Commands

### `mort setup`
Interactive first-run wizard (Ink-rendered):
1. Detect Claude Code binary → show auth status
2. If not found: prompt for API key choice
3. Walk through enabling sensors — Vercel token first, Netlify token second, git repo path, GitHub token optional
4. Ask: "Start postmortem automatically on login? (recommended)" → installs launchd plist (macOS) or systemd unit (Linux)
5. Ask: "Install git pre-push hook for automatic risk prediction?" → runs `mort hooks install`
6. Write `~/.postmortem/config.toml`
7. Run connectivity tests on each enabled sensor
8. Show success screen: `mort watch` to start, `http://localhost:6660` for dashboard

### `mort watch`
Primary command. Starts the full postmortem daemon:
1. Load config, initialize brain
2. Start all enabled sensors
3. Start Fastify server on **port 6660** — serves webhooks, REST API, SSE stream, and web dashboard simultaneously
4. Render live Ink terminal dashboard
5. Print on startup: `☠ dashboard → http://localhost:6660`
6. Brain batches events every 30 seconds, analyzes if severity warrants
7. On `mort:event` with severity `error` or `critical`: trigger immediate analysis
8. Write incidents to SQLite, markdown report, stream to dashboard via SSE

### `mort hooks install`
Installs a git pre-push hook in the current repo:
- Writes `.git/hooks/pre-push` script that runs `mort predict` before every push
- If `mort predict` returns risk level `critical`: blocks push, shows warning, asks confirmation
- If risk level `high`: shows warning but allows push
- If risk level `low/medium`: silent pass-through
- Hook is unobtrusive — if postmortem daemon isn't running, hook exits silently without blocking

### `mort hooks uninstall`
Removes the pre-push hook from the current repo.

### `mort incident`
Manually trigger an incident analysis:
```
mort incident --last 10m        # analyze last 10 minutes of events
mort incident --since "14:30"   # analyze since a specific time
```

### `mort predict`
Pre-deploy risk assessment — the hero command:
```
mort predict                    # analyze current git diff against incident history
```
Output format:
```
☠ DEPLOYMENT RISK: HIGH

This commit modifies: auth.ts, middleware/session.ts
3 previous incidents involved these same files.
Most recent: June 3 — session token expiry caused 500s on /api/user

Recommendation: review middleware/session.ts before deploying.
Confidence: medium
```

### `mort status`
Show current sensor health, brain backend, recent event counts, dashboard URL. Non-interactive.

### `mort history`
List past incidents from SQLite:
```
mort history                    # last 10 incidents
mort history --last 7d
mort history --severity critical
mort history <incident-id>      # full incident detail
```

### `mort config`
```
mort config show
mort config set brain.backend claude-cli
mort config sensor enable vercel
```

---

## 12. Local Web Dashboard — port 6660

**This is a first-class feature, not an afterthought.**

postmortem serves a beautiful local web dashboard at `http://localhost:6660` whenever `mort watch` is running. It shares the same Fastify server that receives webhooks. No separate process, no separate install, no build step for the user. The entire dashboard is a single HTML file embedded in the binary at build time.

### Why port 6660

Three sixes. On-brand for a tool called postmortem. Memorable. Almost certainly unused on developer machines. Developers will notice and appreciate it.

### Architecture

```
Fastify on :6660
├── POST /webhook/:source        → sensor webhook receiver (existing)
├── GET  /                       → serves embedded dashboard HTML
├── GET  /api/events             → last N events from SQLite, JSON
├── GET  /api/incidents          → all incidents, filterable, JSON
├── GET  /api/incidents/:id      → single incident full detail, JSON
├── GET  /api/sensors            → sensor health status, JSON
├── GET  /api/status             → brain backend, uptime, event count, JSON
└── GET  /api/stream             → Server-Sent Events — live event stream
```

The dashboard subscribes to `/api/stream` on load. Every event the bus emits is forwarded over SSE to all connected browser clients. No polling, no WebSocket complexity.

### Dashboard Views

**Five routes, nothing more:**

```
/              Overview — live event stream + sensor health + active incident if any
/incidents     All incidents — sortable list, severity badges, click to expand
/incidents/:id Full incident — timeline, AI analysis confidence, raw events, report link
/predict       Risk assessment — shows last mort predict result, re-run button
/sensors       Sensor health — last event time, enabled/disabled, API connectivity
```

### Visual Design — Dark, Yellow, Surgical

The dashboard must feel like it was designed by the same person who designed the terminal UI. Not a generic SaaS dashboard.

**Design rules for Claude Code building this:**

```css
/* Core palette — hardcoded, not system theme */
--bg-primary:    #0D0D0D;    /* near-black — main background */
--bg-surface:    #141414;    /* slightly lighter — cards, panels */
--bg-border:     #1E1E1E;    /* subtle borders */
--brand:         #FFD93D;    /* yellow — ☠ logo, highlights, active states */
--brand-dim:     #B89A2A;    /* dimmed yellow — hover states */
--text-primary:  #EEEEEE;    /* main text */
--text-secondary:#888888;    /* labels, metadata */
--text-muted:    #444444;    /* timestamps, dimmed info */
--critical:      #FF4444;    /* critical severity */
--error:         #FF6B6B;    /* error severity */
--warning:       #FF922B;    /* warning — orange, NOT yellow */
--success:       #51CF66;    /* success, healthy */
--info:          #74C0FC;    /* info events */
--sensor-ok:     #34D399;    /* emerald — sensor healthy */
```

**Typography:**
- Font: `'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace` — developer-native, monospace everywhere
- Headings: 500 weight only, never bold
- Body: 14px, line-height 1.6
- Timestamps: always `--text-muted`, smaller
- No serif, no system-ui, no sans-serif anywhere in the dashboard

**Layout rules:**
- Full dark background — `#0D0D0D` on `<body>`, no white surfaces
- Left sidebar (240px) — navigation + sensor status indicators
- Main content area — the view
- No top navigation bar — sidebar only
- Maximum content width: 1100px, centered
- Card borders: 1px solid `#1E1E1E` — barely visible, structural not decorative
- No shadows, no blur, no gradients — flat, surgical

**The ☠ in the dashboard:**
- Top of the sidebar: large `☠` in yellow (`#FFD93D`), below it `postmortem` in smaller yellow text
- Every AI-generated section (likely cause, suggested action, prediction) has a small `☠` prefix in yellow
- Active/current incident shows as a yellow pulsing dot beside the ☠ in the sidebar header

### Overview Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  sidebar (240px fixed)    │  main content                       │
│                           │                                      │
│  [YELLOW] ☠               │  LIVE EVENTS                        │
│  [YELLOW] postmortem      │  ─────────────────────────────────  │
│           v0.1.0          │  14:32:01  vercel   deploy started  │
│  ● 4 sensors active       │  14:31:45  git      push · main     │
│                           │  14:28:12  logfile  ERROR timeout   │
│  ─────────────────────    │  14:27:55  health   200 · 45ms      │
│  [GRN] ● vercel           │  14:25:01  vercel   ✓ deploy ready  │
│  [GRN] ● netlify          │  ...streaming live via SSE...       │
│  [GRN] ● git              │                                      │
│  [GRN] ● health-check     │  ─────────────────────────────────  │
│                           │  LAST INCIDENT  3h ago              │
│  ─────────────────────    │  Build failed · main · dep bump     │
│  [NAV] Overview      ←    │  [YELLOW] ☠ Likely cause: axios...  │
│  [NAV] Incidents          │                                      │
│  [NAV] Predict            │                                      │
│  [NAV] Sensors            │                                      │
│                           │                                      │
│  [MUTED] localhost:6660   │                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Incident Detail Page

The single most important view. When a developer clicks an incident:

```
☠  Build failed · main · dependency bump        [CRITICAL]
   Detected 3h ago · Duration ~4 minutes · vercel sensor

   TIMELINE
   ────────────────────────────────────────────────
   14:29:01  [git]     push to main · commit 4f2a9c
   14:29:15  [vercel]  deploy triggered
   14:31:44  [vercel]  build failed · exit code 1
   14:33:01  [vercel]  deployment marked ERROR

   ☠ LIKELY CAUSE    [confidence: medium]
   ─────────────────────────────────────────────
   The upgrade of axios 1.6.2 → 1.7.0 introduced a breaking
   change in interceptor behavior. 3 tests depend on the old
   response shape.

   ☠ SUGGESTED ACTION
   ─────────────────────────────────────────────
   Pin axios to 1.6.2 or update the 3 affected test files.
   See: src/api/__tests__/interceptor.test.ts

   PATTERN MATCH
   ─────────────────────────────────────────────
   Similar incident on 2024-11-14 — axios upgrade broke
   interceptor tests. Same file changed.

   RAW EVENTS (3)               [expand ▼]
   ─────────────────────────────────────────────

   [ View full report → ~/.postmortem/reports/2026-06-23.md ]
```

### Single HTML File — Implementation Note for Claude Code

The dashboard is built as a single `index.html` file with all CSS and JavaScript inline. No external dependencies except one CDN font import for JetBrains Mono. It is embedded into the binary at build time using `tsup`'s asset embedding. Fastify serves it from memory, not from disk.

The JS uses `EventSource` API to connect to `/api/stream` and appends events to the live feed without reloading. All data fetching is plain `fetch()` against the JSON API routes. No React, no Vue, no build step — pure vanilla JS that any developer can read and understand.

```javascript
// Live event stream connection in the dashboard
const stream = new EventSource('/api/stream');
stream.onmessage = (e) => {
  const event = JSON.parse(e.data);
  prependEventRow(event);  // adds to top of live feed
};
```

---

## 12. Terminal UI Design — Beautiful Like Claude Code

**Philosophy:** postmortem's terminal UI is dark-first, information-dense but not cluttered, yellow on black. Like a warning light that never sleeps. The ☠ symbol is everywhere — it is the product.

---

### Logo — ☠ Skull Unicode

postmortem's logo is the **☠ skull unicode character** at every size. No ASCII art. The unicode skull renders perfectly in every modern terminal, scales with font size, and is instantly recognisable. Simple, clean, on-brand.

```typescript
// src/outputs/terminal/logo.ts

import chalk from 'chalk';

const Y = chalk.hex('#FFD93D').bold;

export const SKULL = {
  // Inline — prefix before every AI-generated output line
  inline:  Y('☠'),

  // Header — top-left of mort watch live dashboard
  header:  Y('☠  postmortem'),

  // Banner — mort setup, mort --help, first run
  banner:  `
${Y('    ☠')}
${Y('    postmortem')}
${chalk.hex('#888888')('    AI-powered ops intelligence')}
${chalk.hex('#555555')('    "I watch so you don\'t have to."')}
`,

  // Incident — shown large when incident is detected
  large:   Y('  ☠  INCIDENT DETECTED'),
};
```

**Rules Claude Code must follow:**
- `SKULL.inline` — prefix every root cause, suggested action, and prediction output line. Signals "postmortem's brain said this."
- `SKULL.header` — top-left of the `mort watch` live dashboard at all times
- `SKULL.banner` — `mort setup`, `mort --help`, and first-run welcome only
- `SKULL.large` — displayed above the incident card border on every incident
- ☠ is **always yellow** (`#FFD93D`). Never white, never red, never any other color
- In README.md the title is: `# postmortem ☠`
- In all npm/package descriptions: "postmortem ☠ — AI-powered ops intelligence"

---

### Color Palette (Chalk)

mort's brand is **yellow** — the color of caution lights, alert signals, and things worth paying attention to. High contrast on dark terminals. Unmistakable.

```typescript
// src/outputs/terminal/theme.ts
import chalk from 'chalk';

export const theme = {
  // Brand — YELLOW is mort's identity
  primary:    chalk.hex('#FFD93D'),   // golden yellow — mort brand, logo, headers
  accent:     chalk.hex('#FFB800'),   // deeper amber yellow — active states, highlights

  // Semantic
  critical:   chalk.hex('#FF4444'),   // red
  error:      chalk.hex('#FF6B6B'),   // lighter red
  warning:    chalk.hex('#FF922B'),   // orange — distinct from brand yellow
  success:    chalk.hex('#51CF66'),   // green
  info:       chalk.hex('#74C0FC'),   // blue
  muted:      chalk.hex('#555555'),   // dimmed

  // UI Chrome
  border:     chalk.hex('#2A2A2A'),   // near-black borders
  label:      chalk.bold.hex('#888888'),
  value:      chalk.hex('#EEEEEE'),
  timestamp:  chalk.hex('#444444'),

  // Special
  brain:      chalk.hex('#FFD93D'),   // yellow — AI output shares brand color
  sensor:     chalk.hex('#34D399'),   // emerald — sensor health indicators
  raven:      chalk.hex('#FFD93D'),   // yellow raven in header
};
```

**Color rules Claude Code must follow:**
- The raven logo is always rendered in `theme.primary` (yellow)
- The word `mort` wherever it appears as a brand name is always yellow
- Sensor names are emerald (`theme.sensor`)
- AI-generated content (root cause, suggested action) is yellow (`theme.brain`) to signal "this came from the raven"
- Timestamps are always muted (`theme.timestamp`) — they are metadata, not content
- Borders use near-black, never gray — keeps the dark aesthetic clean
- Warning severity uses orange (`#FF922B`), never yellow — yellow is reserved for brand only

### Dashboard Layout (`mort watch`)

Colors noted in brackets — implement with Chalk theme values:

```
┌─────────────────────────────────────────────────────────────────┐
│  [YELLOW] ◢█◣ mort v0.1.0         [GREEN] ● claude-sonnet-4-6  │
│  [MUTED]  watching 4 sensors      [MUTED] claude code · free   │
├──────────────────┬──────────────────────────────────────────────┤
│  [LABEL] SENSORS │  [LABEL] EVENT STREAM                        │
│                  │                                               │
│  [GRN] ● git     │  [MUTED]14:32:01 [EMRLD]git    [WHT]commit  │
│  [GRN] ● github  │  [MUTED]14:31:45 [EMRLD]github [WHT]build ↑ │
│  [GRN] ● logfile │  [MUTED]14:28:12 [EMRLD]logfile [RED]ERROR  │
│  [DIM] ✗ cloud   │  [MUTED]14:27:55 [EMRLD]health [GRN]200 ok  │
│  [DIM] not set   │  [MUTED]14:25:01 [EMRLD]github [GRN]✓ pass  │
│                  │  [MUTED]14:22:33 [EMRLD]git    [WHT]branch  │
│                  │  ...                                          │
├──────────────────┴──────────────────────────────────────────────┤
│  [MUTED] LAST INCIDENT  3h ago · build.failed · dep bump        │
│  [MUTED] ──────────────────────────────── mort history ───────  │
└─────────────────────────────────────────────────────────────────┘
```

### Incident Card (rendered when incident detected)

The incident card border renders in **yellow** — it is the most important thing on screen when it appears.

```
╔══════════════════════════════════════════════════════════════════╗  ← YELLOW border
║  [RED] 🔴 INCIDENT DETECTED  [MUTED] · 14:33:12                 ║
╠══════════════════════════════════════════════════════════════════╣
║  [LABEL] Title     [WHITE] Build failed · main · dep bump        ║
║  [LABEL] Severity  [RED]   CRITICAL                              ║
║  [LABEL] Duration  [MUTED] ~4 minutes                            ║
╠══════════════════════════════════════════════════════════════════╣
║  [YELLOW] ◢█◣ ROOT CAUSE                                        ║  ← raven icon before AI content
║  [WHITE] The upgrade of axios from 1.6.2 → 1.7.0 introduced a   ║
║  [WHITE] breaking change in interceptor behavior. 3 tests fail.  ║
║  [WHITE] Pattern seen before: 2024-11-14.                        ║
╠══════════════════════════════════════════════════════════════════╣
║  [YELLOW] ◢█◣ SUGGESTED ACTION                                  ║
║  [WHITE] Pin axios to 1.6.2 or update the 3 affected test files. ║
║  [WHITE] See: src/api/__tests__/interceptor.test.ts              ║
╠══════════════════════════════════════════════════════════════════╣
║  [LABEL] TIMELINE                                                ║
║  [MUTED] 14:29:01  [WHITE] git push to main (commit abc123)      ║
║  [MUTED] 14:29:15  [WHITE] github-actions build triggered        ║
║  [MUTED] 14:31:44  [RED]   3 tests failed                        ║
║  [MUTED] 14:33:01  [RED]   build marked failed                   ║
╠══════════════════════════════════════════════════════════════════╣
║  [MUTED] postmortem → ~/.mort/postmortems/2026-06-23-14:33.md    ║
╚══════════════════════════════════════════════════════════════════╝
```

**Key rule:** The small raven icon `◢█◣` appears before every piece of AI-generated content (root cause, suggested action, prediction) — visually signals "the raven said this."

### Startup Screen

```
    ☠                            ← YELLOW
    postmortem v0.1.0            ← YELLOW bold
    AI-powered ops intelligence  ← muted

  ⠸ detecting brain...
  ✓ claude code found · claude-sonnet-4-6 · no api key needed   ← GREEN ✓

  ⠸ starting sensors...
  ✓ vercel        watching all projects · 30s interval           ← GREEN ✓
  ✓ netlify        watching all sites · 30s interval
  ✓ git            watching ~/myproject
  ✗ github-actions disabled · enable in ~/.postmortem/config.toml ← DIM ✗

  ✓ postmortem is watching. ctrl+c to stop.
```

---

## 13. Brain Prompt Templates

### Incident Analysis Prompt

```typescript
// src/brain/prompts/incident.ts

export function buildIncidentPrompt(events: NormalizedEvent[], recentHistory: Incident[]): string {
  return `You are postmortem, an ops intelligence tool. Analyze the following events and produce a structured incident report.

RECENT EVENTS (chronological):
${events.map(e => `[${e.timestamp}] [${e.source}] [${e.type}] ${e.summary}\nRAW: ${e.raw.slice(0, 500)}`).join('\n\n')}

RECENT INCIDENT HISTORY (for pattern matching):
${recentHistory.slice(0, 5).map(i => `- ${i.detected_at}: ${i.title} · root cause: ${i.root_cause}`).join('\n')}

Respond with a JSON object only, no markdown, no preamble:
{
  "title": "one-line incident title",
  "severity": "info|warning|error|critical",
  "root_cause": "2-3 sentence explanation of what caused this",
  "timeline": [
    { "timestamp": "ISO8601", "event": "what happened", "source": "which sensor" }
  ],
  "suggested_action": "specific, actionable next step",
  "pattern_match": "null or description of similar past incident",
  "confidence": "high|medium|low"
}`;
}
```

### Pre-Deploy Prediction Prompt

```typescript
export function buildPredictPrompt(diff: string, recentIncidents: Incident[]): string {
  return `You are postmortem. A developer is about to deploy. Analyze this git diff and predict risk.

GIT DIFF:
${diff.slice(0, 3000)}

RECENT INCIDENTS (last 30 days):
${recentIncidents.slice(0, 10).map(i => `- ${i.title}: ${i.root_cause}`).join('\n')}

Respond with JSON only:
{
  "risk_level": "low|medium|high|critical",
  "confidence": "high|medium|low",
  "concerns": ["list of specific concerns about this diff"],
  "likely_failure_points": ["what could break"],
  "recommendation": "go|go-with-caution|hold",
  "reasoning": "2-3 sentences"
}`;
}
```

---

## 14. Sensor Implementation Guide

### GitHub Actions Sensor (example)

```typescript
// src/sensors/github-actions/index.ts

export class GitHubActionsSensor extends BaseSensor {
  readonly name = 'github-actions';
  readonly displayName = 'GitHub Actions';

  private intervalId: NodeJS.Timeout | null = null;
  private knownRunIds = new Set<number>();

  async start(config: GitHubActionsConfig): Promise<void> {
    this.intervalId = setInterval(
      () => this.poll(config),
      (config.poll_interval_seconds ?? 60) * 1000
    );
    await this.poll(config); // immediate first poll
  }

  private async poll(config: GitHubActionsConfig): Promise<void> {
    for (const repo of config.repos) {
      const runs = await this.fetchRecentRuns(repo, config.token);
      for (const run of runs) {
        if (this.knownRunIds.has(run.id)) continue;
        this.knownRunIds.add(run.id);

        if (run.conclusion === 'failure') {
          const logs = await this.fetchRunLogs(repo, run.id, config.token);
          this.emit({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            source: 'github-actions',
            type: 'build.failed',
            severity: 'error',
            raw: logs.slice(0, 5000),
            summary: `Build failed: ${run.name} on ${run.head_branch}`,
            metadata: {
              repo,
              branch: run.head_branch,
              commit: run.head_sha,
              url: run.html_url,
            },
            payload: { run_id: run.id, workflow: run.name, duration_ms: run.duration_ms },
          });
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async healthCheck() {
    // Try fetching from GitHub API, return healthy/unhealthy
  }
}
```

### Vercel Sensor ★ Primary

```typescript
// src/sensors/vercel/index.ts
// Vercel is the primary deployment target for new-age developers.
// Uses Vercel REST API v9. Docs: https://vercel.com/docs/rest-api

export class VercelSensor extends BaseSensor {
  readonly name = 'vercel';
  readonly displayName = 'Vercel';

  // Poll Vercel API for deployment events every 30 seconds
  // API endpoint: GET https://api.vercel.com/v6/deployments
  // Auth: Bearer token from config.token or VERCEL_TOKEN env var

  // Events to emit:
  // deploy.started  → when a new deployment appears with state "BUILDING"
  // deploy.succeeded → when deployment state becomes "READY"
  // deploy.failed   → when deployment state becomes "ERROR"
  // build.failed    → parse build logs for error details on failure

  // On deploy.failed:
  // 1. Fetch deployment logs: GET /v2/deployments/{id}/events
  // 2. Extract error frames, failed function names, build output
  // 3. Emit NormalizedEvent with full raw log in .raw field
  // 4. Set metadata.url to the deployment URL
  // 5. Severity: 'error' for build failure, 'critical' if production branch

  // Parser extracts from Vercel logs:
  // - Next.js build errors (module not found, type errors)
  // - Function size limit exceeded
  // - Environment variable missing
  // - Edge runtime errors
  // - Timeout during build

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    // GET https://api.vercel.com/v9/user — verify token is valid
  }
}
```

### Netlify Sensor ★ Primary

```typescript
// src/sensors/netlify/index.ts
// Netlify is the second most common deployment platform for new-age developers.
// Uses Netlify API v1. Docs: https://docs.netlify.com/api/get-started/

export class NetlifySensor extends BaseSensor {
  readonly name = 'netlify';
  readonly displayName = 'Netlify';

  // Poll Netlify API for deploy events every 30 seconds
  // API endpoint: GET https://api.netlify.com/api/v1/sites/{site_id}/deploys
  // Auth: Bearer token from config.token or NETLIFY_TOKEN env var

  // Events to emit:
  // deploy.started   → deploy state "building"
  // deploy.succeeded → deploy state "ready"
  // deploy.failed    → deploy state "error"
  // build.failed     → on error, fetch and parse deploy log

  // On deploy.failed:
  // 1. Fetch deploy summary: GET /api/v1/deploys/{deploy_id}
  // 2. Fetch build log lines from summary.deploy_url + /log
  // 3. Extract error message, failed plugin, build command that failed
  // 4. Emit NormalizedEvent with raw log in .raw field
  // 5. Severity: 'error' for preview, 'critical' for production branch

  // Parser extracts from Netlify logs:
  // - Build command failures (npm run build exit code)
  // - Plugin failures (netlify-plugin-*)
  // - Function bundling errors
  // - Redirect rule conflicts
  // - Environment variable missing at build time

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    // GET https://api.netlify.com/api/v1/user — verify token is valid
  }
}
```

---

## 15. Postmortem Report Output

When an incident is detected, postmortem writes a markdown report to `~/.postmortem/reports/`:

```markdown
# ☠ Incident Report · 2026-06-23 14:33

**Severity:** CRITICAL  
**Duration:** ~4 minutes  
**Detected by:** postmortem · vercel sensor  
**Brain:** claude-sonnet-4-6 via Claude Code

---

## Summary
Vercel production deploy failed on main after dependency bump.

## Likely Cause
The upgrade of axios from 1.6.2 → 1.7.0 introduced a breaking change in
interceptor behavior. 3 tests depend on the old response shape.
Pattern seen before: 2024-11-14.

## Timeline

| Time | Event | Source |
|------|-------|--------|
| 14:29:01 | git push to main (commit abc123) | git |
| 14:29:15 | Vercel deploy triggered | vercel |
| 14:31:44 | Build failed · axios interceptor error | vercel |
| 14:33:01 | Production deploy marked ERROR | vercel |

## Suggested Action
Pin axios to 1.6.2 in package.json or update the 3 affected test files.
See: src/api/__tests__/interceptor.test.ts

## Pattern Match
Similar incident on 2024-11-14: axios upgrade also broke interceptor tests.

---
*Generated by postmortem ☠ v0.1.0*
```

---

## 16. Actuator Architecture (v2 Ready)

The actuator system is stubbed in v1. No actuators ship, but the architecture is ready.

```typescript
// src/actuators/base.ts — STUB, ships in v1 as empty scaffold

export abstract class BaseActuator {
  abstract readonly name: string;
  
  // Called by the brain when it decides action is warranted
  abstract execute(incident: Incident, config: Record<string, unknown>): Promise<ActuatorResult>;
  
  // Human-readable description of what action will be taken
  abstract describe(incident: Incident): string;
}

// Future actuators (v2+):
// - SlackActuator: post incident to channel
// - GitHubActuator: open issue, comment on PR
// - RollbackActuator: trigger a deploy rollback
// - PagerDutyActuator: create alert
// - WebhookActuator: POST to any URL
```

**The community builds actuators. The harness is the product.**

---

## 17. package.json

```json
{
  "name": "@postmortem-cli/mort",
  "version": "0.1.0",
  "description": "postmortem ☠ — AI-powered ops intelligence for developers",
  "bin": {
    "mort": "./dist/index.js"
  },
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "files": ["dist"],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "lint": "biome check .",
    "format": "biome format --write .",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.105.0",
    "better-sqlite3": "^12.0.0",
    "boxen": "^8.0.0",
    "chalk": "^5.6.0",
    "chokidar": "^5.0.0",
    "cli-table3": "^0.6.5",
    "commander": "^15.0.0",
    "fastify": "^5.8.0",
    "got": "^15.0.0",
    "ink": "^7.0.0",
    "kysely": "^0.29.0",
    "openai": "^6.0.0",
    "ora": "^9.0.0",
    "react": "^19.0.0",
    "smol-toml": "^1.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "msw": "^2.0.0",
    "tsup": "^8.5.0",
    "tsx": "^4.22.0",
    "typescript": "^6.0.0",
    "vitest": "^4.0.0"
  },
  "keywords": ["ops", "devops", "incident", "postmortem", "cli", "ai", "terminal"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/Baniloo-Labs/postmortem.git"
  }
}
```

---

## 18. Build Order for Claude Code

Give Claude Code these sessions in order. Each session is self-contained.

**Session 1 — Core foundation**
> "Build the core module: NormalizedEvent Zod schema (src/core/event.ts), the event bus (src/core/bus.ts), SQLite setup with Kysely migrations (src/core/db.ts), and TOML config loader with Zod validation (src/core/config.ts). No sensors, no brain yet. Include Vitest tests for the event schema and bus."

**Session 2 — Brain module**
> "Build the brain module (src/brain/). Implement backend auto-detection in this priority order: claude CLI subprocess, ANTHROPIC_API_KEY, OPENAI_API_KEY, Ollama at localhost:11434. The claude-cli backend pipes prompts via stdin to `claude -p --output-format text`. Expose one async method: brain.ask(prompt: string): Promise<string>. Include BrainNotConfiguredError with setup instructions. Test each backend path with mocks."

**Session 3 — Base sensor + Git sensor**
> "Build BaseSensor abstract class (src/sensors/base.ts) and the Git sensor (src/sensors/git/). The Git sensor uses chokidar to watch a configured repo's .git directory, detects commits and branch changes by reading git log via child_process, and emits NormalizedEvents onto the bus. Include tests that simulate git activity."

**Session 4 — Terminal UI**
> "Build the terminal UI using Ink v7 (React 19) and Chalk. First create src/outputs/terminal/logo.ts with the SKULL constants using the ☠ unicode character at different sizes (inline, header, banner, large). Then create src/outputs/terminal/theme.ts with the full Chalk color theme. Components needed: Header (yellow ☠ postmortem logo + brain indicator), SensorStatus (live sensor health in emerald), EventStream (scrolling event feed colored by severity), IncidentCard (yellow-bordered rich incident display with ☠ before all AI-generated content). Brand color is yellow #FFD93D. The ☠ symbol must appear before every AI-generated output section. Main dashboard renders in mort watch."

**Session 5 — CLI commands**
> "Build the Commander.js CLI entry point (src/index.ts) and all commands: mort watch (starts daemon + renders Ink dashboard), mort setup (interactive wizard that writes config.toml), mort status (non-interactive health check), mort history (lists incidents from SQLite), mort incident (manual trigger), mort predict (pre-deploy analysis). Each command is a separate file in src/commands/."

**Session 6 — Vercel + Netlify sensors + webhook receiver**
> "Build the Vercel sensor (src/sensors/vercel/) that polls the Vercel REST API v9 every 30 seconds for deployment state changes, fetches build logs on failure, and emits NormalizedEvents with deploy.started / deploy.succeeded / deploy.failed / build.failed types. Build the Netlify sensor (src/sensors/netlify/) with the same pattern against the Netlify API v1. Both sensors should treat production branch failures as critical severity and preview failures as error severity. Also build the webhook receiver sensor (src/sensors/webhook/) using Fastify that accepts POST /webhook/:source."

**Session 7 — Incident analysis pipeline**
> "Build the incident analysis pipeline. When 2+ error/critical events arrive within 5 minutes, or any critical event arrives, trigger brain analysis. Use the prompt templates in src/brain/prompts/. Parse the JSON response, write to SQLite incidents table, render IncidentCard in terminal, write markdown report to ~/.postmortem/reports/ with ☠ in the title. Include the predict command that passes git diff to brain."

**Session 8 — Hooks + auto-start + polish**
> "Build mort hooks install/uninstall (src/commands/hooks.ts) — installs a git pre-push hook that runs mort predict and blocks on critical risk (exit code 2). Build the mort setup wizard with full Ink interactive UI covering: Vercel token, Netlify token, git repo path, brain backend, auto-start on login (write launchd plist at ~/Library/LaunchAgents/dev.postmortem.mort.plist on macOS, systemd unit at ~/.config/systemd/user/postmortem.service on Linux, and a Task Scheduler entry / Startup shortcut on Windows — all invoking `mort watch --headless`), and git hooks offer. Add mort history command with filtering. Add graceful shutdown (SIGINT/SIGTERM). Write README.md with title '# postmortem ☠', the predict demo as the opening hero example, install command, Vercel/Netlify setup, and SENSOR_SPEC.md."

**Session 9 — Local web dashboard on port 6660**
> "Build the local web dashboard. Add to the existing Fastify server (src/server/): GET / serves an embedded single HTML file, GET /api/events returns last 100 events as JSON, GET /api/incidents returns all incidents sortable by date/severity, GET /api/incidents/:id returns full incident with raw events, GET /api/sensors returns sensor health, GET /api/status returns brain/uptime/event-count, GET /api/stream is a Server-Sent Events endpoint that forwards every bus event to connected clients. Build src/server/dashboard/index.html as a single self-contained file with all CSS and JS inline — no framework, no build step, just HTML/CSS/vanilla JS. Design spec: #0D0D0D body background, #FFD93D yellow brand (#FFD93D), monospace font stack (JetBrains Mono → Fira Code → Cascadia Code → monospace), left sidebar 240px fixed with ☠ postmortem logo in yellow at top, five views (Overview with live SSE event stream, Incidents list, Incident detail page with timeline and ☠ likely cause, Predict showing last result, Sensors health). EventSource connects to /api/stream for live updates. Embed the HTML file in the binary at build time via tsup and serve from memory. Print 'dashboard → http://localhost:6660' on mort watch startup."

---

## 18.5. Engineering Addenda (hardening — applies across all sessions)

These cross-cutting decisions extend the spec and take precedence over any conflicting inline detail above.

**Daemon vs interactive.** `mort watch` runs two ways: with a TTY it mounts the Ink dashboard; with `--headless` (no TTY / auto-start) it runs sensors + server only and logs to file. Detect via `process.stdout.isTTY` and mount Ink only when true. A single-instance lock (PID/port file in `~/.postmortem/`) prevents two daemons fighting over port 6660 and the database.

**Security (non-negotiable).**
- Fastify (webhooks + dashboard) binds `127.0.0.1` only — never `0.0.0.0`.
- Secrets prefer env vars; when `config.toml` holds a token the file is written `0600`.
- A central redactor (`src/core/redact.ts`) strips API keys / bearer tokens from `raw` and log text **before** persistence to SQLite and **before** any prompt is sent to a brain backend.
- Webhook receiver verifies HMAC when a secret is configured.
- The health-check sensor guards user-supplied URLs against SSRF (block internal/metadata addresses) and enforces a timeout.
- Dashboard responses set a restrictive CSP (page is self-contained; only the JetBrains Mono font is external).

**AI cost & JSON robustness.** Events are debounced + deduped before analysis (batch on the 30s window, or immediately on `critical`). A per-window token budget caps prompt size (truncate `raw`, cap event count). LLM output is parsed tolerantly (strip ```` ```json ```` fences/preamble) then Zod-validated; on failure, retry once with a "JSON only" reminder, then degrade gracefully. Brain-not-configured is non-fatal — sensors keep recording and the dashboard still works.

**Resilience.** One sensor throwing must not crash the daemon — each sensor loop is isolated, errors are logged and surfaced as unhealthy in `sensor_health`. API pollers use retry/backoff and ETag/conditional requests where supported (GitHub especially) to avoid rate limits. Graceful shutdown on SIGINT/SIGTERM stops sensors, flushes, closes the db, and releases the lock.

**Cross-platform (first-class Windows).** All paths via `node:path` with explicit `~` expansion. Auto-start supports launchd (macOS), systemd user units (Linux), and Task Scheduler / Startup (Windows). The pre-push git hook stays portable. `better-sqlite3` relies on prebuilt binaries with a documented build-tools fallback for Windows.

**`mort predict` exit codes** (the pre-push hook depends on these): `0` = pass (low/medium risk), `1` = warn but allow (high risk), `2` = block (critical risk).

---

## 19. What Ships in v1 vs v2

### v1 Ships
- Core event bus, normalized event schema, SQLite memory — runs entirely on your machine
- Brain: claude-cli (uses your Claude Code subscription free), anthropic-api, openai-api, ollama
- Sensors: **vercel** ★, **netlify** ★, git, logfile, github-actions, health-check, webhook
- Terminal UI: live ☠ dashboard, yellow incident cards, startup screen
- **Web dashboard at `http://localhost:6660`** — dark, yellow, monospace, live event stream via SSE
- Commands: mort watch, mort setup, mort status, mort history, mort incident, mort predict, mort hooks install/uninstall
- Auto-start: launchd (macOS) and systemd (Linux), offered during mort setup
- Outputs: terminal, markdown reports to `~/.postmortem/reports/`
- Install: `npm install -g @postmortem-cli/mort`

### v2 (community + roadmap)
- Actuators: Slack, GitHub issues, rollback, PagerDuty
- Additional sensors: Railway, Fly.io, Render, CloudWatch, GCP Logging
- Multi-repo / multi-project awareness
- Sensor marketplace (community contributions)

---

## 20. The One-Line Pitch

> postmortem ☠ watches your Vercel and Netlify deploys, your git, and your logs. When something breaks, it tells you why — in your terminal and at localhost:6660, using whatever AI you already have. Runs on your machine. No SaaS. No account.

---

*SPEC v1.1 · Built for solo manifestation with Claude Code · MIT License*
*v1.1 changelog: dependency versions modernized to current majors (Node 22+, Zod 4, Ink 7/React 19, TS 6, Vitest 4, Commander 15, etc.); `@iarna/toml` → `smol-toml`; added Biome + msw; Zod 4 schema syntax; §18.5 Engineering Addenda (security, headless daemon, Windows, AI robustness, resilience).*
