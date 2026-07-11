// postmortem ☠ — CLI entry point (bin: mort).
//
// Vertical slice: `mort watch` (with --demo / --headless) is wired end-to-end so
// the tool is runnable today. The remaining commands (setup, status, history,
// incident, predict, hooks, config) land in Session 6 and register here alongside.

import { Command } from "commander";
import { watchCommand } from "./commands/watch.js";

const VERSION = "0.1.0";

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

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`mort: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
