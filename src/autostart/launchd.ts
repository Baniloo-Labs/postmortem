// macOS auto-start via a launchd user agent.

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Autostart, ServiceSpec } from "./types.js";

const execFileAsync = promisify(execFile);

export const LAUNCHD_LABEL = "dev.postmortem.mort";

function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render the launchd plist. Pure. */
export function renderPlist(spec: ServiceSpec): string {
  const argv = [spec.nodeBin, spec.script, ...spec.args]
    .map((a) => `    <string>${xml(a)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argv}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(join(spec.logDir, "autostart.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(spec.logDir, "autostart.err.log"))}</string>
</dict>
</plist>
`;
}

export function createLaunchdAutostart(spec: ServiceSpec): Autostart {
  const path = plistPath();
  return {
    kind: "launchd",
    async install() {
      try {
        await mkdir(dirname(path), { recursive: true });
        await mkdir(spec.logDir, { recursive: true });
        await writeFile(path, renderPlist(spec), "utf8");
        await execFileAsync("launchctl", ["unload", path]).catch(() => {});
        await execFileAsync("launchctl", ["load", path]);
        return { ok: true, message: `installed launchd agent → ${path}` };
      } catch (err) {
        return { ok: false, message: `launchd install failed: ${String(err)}` };
      }
    },
    async uninstall() {
      try {
        await execFileAsync("launchctl", ["unload", path]).catch(() => {});
        await rm(path, { force: true });
        return { ok: true, message: "removed launchd agent" };
      } catch (err) {
        return { ok: false, message: `launchd uninstall failed: ${String(err)}` };
      }
    },
    async status() {
      try {
        await execFileAsync("launchctl", ["list", LAUNCHD_LABEL]);
        return { ok: true, message: "auto-start is installed (launchd)" };
      } catch {
        return { ok: false, message: "auto-start is not installed" };
      }
    },
  };
}
