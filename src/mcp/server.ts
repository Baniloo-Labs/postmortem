// The read-only MCP server (spec §v1.1). Exposes postmortem's incident memory to
// coding agents (Claude Code, Cursor, …) over stdio: query incidents and events,
// and risk-score a diff against this project's history. Every tool is annotated
// read-only; none writes to the db or triggers anything.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gatherDiff } from "../commands/predict.js";
import type { DB } from "../core/db.js";
import type { BrainLike } from "../incidents/pipeline.js";
import { toolGetIncident, toolListIncidents, toolPredict, toolQueryEvents } from "./tools.js";

export interface McpDeps {
  db: DB;
  brain: BrainLike;
  version: string;
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const SEVERITY = z.enum(["info", "warning", "error", "critical"]);

/** Wrap a tool result as an MCP text content block (JSON, agent-friendly). */
function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: "postmortem", version: deps.version });

  server.registerTool(
    "list_incidents",
    {
      description:
        "List past incidents postmortem detected and explained (newest first). Each has a root cause and suggested action.",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional(),
        severity: SEVERITY.optional(),
        since: z.string().optional().describe("relative window, e.g. 7d, 24h, 30m"),
      },
      annotations: READ_ONLY,
    },
    async (args) => text(await toolListIncidents(deps.db, args)),
  );

  server.registerTool(
    "get_incident",
    {
      description:
        "Get one incident in full: root cause, suggested action, timeline, severity, and the report path.",
      inputSchema: { id: z.string().describe("incident id from list_incidents") },
      annotations: READ_ONLY,
    },
    async (args) => text(await toolGetIncident(deps.db, args)),
  );

  server.registerTool(
    "query_events",
    {
      description:
        "Query recorded ops events (deploys, builds, git activity, health checks, log errors), newest first.",
      inputSchema: {
        limit: z.number().int().positive().max(200).optional(),
        since: z.string().optional().describe("relative window, e.g. 7d, 24h"),
        severity: SEVERITY.optional(),
        source: z.string().optional().describe("sensor name, e.g. vercel, git, github-actions"),
      },
      annotations: READ_ONLY,
    },
    async (args) => text(await toolQueryEvents(deps.db, args)),
  );

  server.registerTool(
    "predict",
    {
      description:
        "Risk-score a git diff against this project's incident history before deploying. Uses the current working diff if none is given. Requires a configured brain.",
      inputSchema: {
        diff: z.string().optional().describe("unified diff; omit to use the working diff"),
      },
      annotations: READ_ONLY,
    },
    async (args) => text(await toolPredict({ db: deps.db, brain: deps.brain, gatherDiff }, args)),
  );

  return server;
}
