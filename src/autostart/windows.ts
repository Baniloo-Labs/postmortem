// Windows auto-start via a Startup-folder script. Task Scheduler (schtasks
// /Create ONLOGON) needs elevation, which a normal `mort autostart install` won't
// have — so we drop a .vbs launcher in the per-user Startup folder instead: no
// admin required, and .vbs (via WScript.Shell.Run ... , 0) starts the daemon
// hidden, with no flashing console window a .cmd would cause.

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Autostart, ServiceSpec } from "./types.js";

export const WINDOWS_STARTUP_FILE = "postmortem-mort.vbs";

function startupDir(): string {
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  return join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

/** Render the hidden-launch VBS. Pure. Double-quotes are doubled per VBS string rules. */
export function renderVbs(spec: ServiceSpec): string {
  const command = `"""${spec.nodeBin}"" ""${spec.script}"" ${spec.args.join(" ")}"`;
  return `' postmortem auto-start — managed by \`mort autostart\`. Runs hidden on login.
Set shell = CreateObject("WScript.Shell")
shell.Run ${command}, 0, False
`;
}

export function createWindowsAutostart(spec: ServiceSpec): Autostart {
  const path = join(startupDir(), WINDOWS_STARTUP_FILE);
  return {
    kind: "windows",
    async install() {
      try {
        await mkdir(startupDir(), { recursive: true });
        await writeFile(path, renderVbs(spec), "utf8");
        return { ok: true, message: `installed startup launcher → ${path}` };
      } catch (err) {
        return { ok: false, message: `startup install failed: ${String(err)}` };
      }
    },
    async uninstall() {
      try {
        await rm(path, { force: true });
        return { ok: true, message: "removed startup launcher" };
      } catch (err) {
        return { ok: false, message: `startup uninstall failed: ${String(err)}` };
      }
    },
    async status() {
      return existsSync(path)
        ? { ok: true, message: "auto-start is installed (Startup folder)" }
        : { ok: false, message: "auto-start is not installed" };
    },
  };
}
