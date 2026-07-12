// `mort mcp` — run a read-only MCP server over postmortem's incident memory,
// speaking JSON-RPC on stdio so coding agents (Claude Code, Cursor) can plug in.
//
// CRITICAL: stdout is the MCP protocol channel — never write to it. All logs go
// to the file logger. The MCP SDK is lazy-imported so it doesn't load for other
// commands (`mort status`, etc.).

import { Brain } from "../brain/index.js";
import { loadConfig } from "../core/config.js";
import { closeDb, migrateToLatest, openDb } from "../core/db.js";
import { createLogger } from "../core/logger.js";
import { VERSION } from "../version.js";

const log = createLogger("mcp");

export async function mcpCommand(): Promise<void> {
  const config = loadConfig();
  const brain = new Brain(config.brain);
  await brain.init();

  const db = openDb();
  await migrateToLatest(db);

  // Lazy-load the SDK (and our server, which imports it) only when actually
  // running the MCP server, keeping every other command's startup lean.
  const { createMcpServer } = await import("../mcp/server.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = createMcpServer({ db, brain, version: VERSION });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void closeDb(db).finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(new StdioServerTransport());
  log.info(`mcp server connected (stdio) · v${VERSION}`);
  // connect() resolves after the handshake; the open stdin keeps the process alive.
}
