// postmortem ☠ — CLI entry point (bin: mort).
//
// Wired: watch (with --demo/--headless), status, history, predict, config.
// Coming in the S6 follow-up: setup (plain prompts), hooks install/uninstall,
// incident --last (needs the correlation pipeline).

import { Command } from "commander";
import { configCommand } from "./commands/config.js";
import { historyCommand } from "./commands/history.js";
import { hooksCommand } from "./commands/hooks.js";
import { incidentCommand } from "./commands/incident.js";
import { mcpCommand } from "./commands/mcp.js";
import { predictCommand } from "./commands/predict.js";
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";
import { watchCommand } from "./commands/watch.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("mort")
  .description("postmortem ☠ — AI-powered ops intelligence for developers")
  .version(VERSION, "-v, --version");

program
  .command("watch")
  .description("start postmortem — watch sensors and show the live dashboard")
  .option("--demo", "replay a bundled incident, no tokens or config needed")
  .option("--headless", "run sensors only, without the terminal UI")
  .action(async (opts: { demo?: boolean; headless?: boolean }) => {
    await watchCommand(opts);
  });

program
  .command("setup")
  .description("interactive first-run wizard — configure brain, sensors, and hooks")
  .action(async () => {
    await setupCommand();
  });

program
  .command("status")
  .description("show brain, daemon, sensor health, and recent event counts")
  .action(async () => {
    await statusCommand();
  });

program
  .command("history")
  .description("list past incidents")
  .option("--last <window>", "only incidents within a window, e.g. 7d, 24h, 30m")
  .option("--severity <level>", "filter by severity (info|warning|error|critical)")
  .action(async (opts: { last?: string; severity?: string }) => {
    await historyCommand(opts);
  });

program
  .command("incident")
  .description("analyze recent events into an incident")
  .option("--last <window>", "how far back to analyze, e.g. 10m, 1h", "10m")
  .action(async (opts: { last?: string }) => {
    process.exit(await incidentCommand(opts));
  });

program
  .command("predict")
  .description("risk-score the current git diff before you push (exit 0/1/2)")
  .action(async () => {
    process.exit(await predictCommand());
  });

program
  .command("config")
  .description("show config (secrets masked) or print its path")
  .argument("[action]", "show | path", "show")
  .action((action: string) => {
    configCommand(action);
  });

program
  .command("mcp")
  .description("run a read-only MCP server over postmortem's incident memory (stdio)")
  .action(async () => {
    await mcpCommand();
  });

program
  .command("hooks")
  .description("install or remove the git pre-push risk hook")
  .argument("<action>", "install | uninstall")
  .action((action: string) => {
    process.exit(hooksCommand(action));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`mort: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
