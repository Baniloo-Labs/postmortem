// postmortem ☠ — CLI entry point (bin: mort). Registers every subcommand:
// watch, setup, status, doctor, history, incident, predict, config, mcp, hooks,
// autostart.

import { Command } from "commander";
import { autostartCommand } from "./commands/autostart.js";
import { configCommand, configSetCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";
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
  .command("doctor")
  .description("diagnose setup: brain, daemon, db, reports, auto-start, telegram")
  .action(async () => {
    process.exit(await doctorCommand());
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
  .option("--since <time>", "analyze since a clock time today, e.g. 14:30")
  .action(async (opts: { last?: string; since?: string }) => {
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
  .description("show config, print its path, or set a key")
  .argument("[action]", "show | path | set", "show")
  .argument("[key]", "for set: dotted key, e.g. brain.model")
  .argument("[value]", 'for set: the value (JSON-coerced: true, 30, "str")')
  .action((action: string, key?: string, value?: string) => {
    if (action === "set") {
      if (!key || value === undefined) {
        process.stderr.write("usage: mort config set <key> <value>\n");
        process.exit(1);
      }
      process.exit(configSetCommand(key, value));
    }
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

program
  .command("autostart")
  .description("run the daemon on login (launchd / systemd / Task Scheduler)")
  .argument("<action>", "install | uninstall | status")
  .action(async (action: string) => {
    process.exit(await autostartCommand(action));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`mort: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
