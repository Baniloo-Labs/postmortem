// Linux auto-start via a systemd user unit.

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Autostart, ServiceSpec } from "./types.js";

const execFileAsync = promisify(execFile);

export const SYSTEMD_UNIT = "postmortem.service";

function unitPath(): string {
  return join(homedir(), ".config", "systemd", "user", SYSTEMD_UNIT);
}

// Quote a token for systemd ExecStart if it contains whitespace.
function q(token: string): string {
  return /\s/.test(token) ? `"${token}"` : token;
}

/** Render the systemd user unit. Pure. */
export function renderUnit(spec: ServiceSpec): string {
  const exec = [spec.nodeBin, spec.script, ...spec.args].map(q).join(" ");
  return `[Unit]
Description=postmortem ops-intelligence daemon
After=network.target

[Service]
Type=simple
ExecStart=${exec}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

async function systemctl(args: string[]): Promise<void> {
  await execFileAsync("systemctl", ["--user", ...args]);
}

export function createSystemdAutostart(spec: ServiceSpec): Autostart {
  const path = unitPath();
  return {
    kind: "systemd",
    async install() {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, renderUnit(spec), "utf8");
        await systemctl(["daemon-reload"]);
        await systemctl(["enable", "--now", SYSTEMD_UNIT]);
        return { ok: true, message: `installed systemd user unit → ${path}` };
      } catch (err) {
        return { ok: false, message: `systemd install failed: ${String(err)}` };
      }
    },
    async uninstall() {
      try {
        await systemctl(["disable", "--now", SYSTEMD_UNIT]).catch(() => {});
        await rm(path, { force: true });
        await systemctl(["daemon-reload"]).catch(() => {});
        return { ok: true, message: "removed systemd user unit" };
      } catch (err) {
        return { ok: false, message: `systemd uninstall failed: ${String(err)}` };
      }
    },
    async status() {
      try {
        await systemctl(["is-enabled", SYSTEMD_UNIT]);
        return { ok: true, message: "auto-start is installed (systemd)" };
      } catch {
        return { ok: false, message: "auto-start is not installed" };
      }
    },
  };
}
