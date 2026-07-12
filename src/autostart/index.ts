// Auto-start factory — picks the right platform implementation. Auto-start units
// run `mort watch --headless` on login (spec §11 / first-class Windows).

import { fileURLToPath } from "node:url";
import { logsDir } from "../core/paths.js";
import { createLaunchdAutostart } from "./launchd.js";
import { createSystemdAutostart } from "./systemd.js";
import type { Autostart, ServiceSpec } from "./types.js";
import { createWindowsAutostart } from "./windows.js";

/** The service spec for the currently-running CLI. */
export function defaultServiceSpec(): ServiceSpec {
  // process.argv[1] is the real entry npm's bin shim invokes (…/dist/index.js);
  // fall back to this module's own path (same file, once bundled).
  const script = process.argv[1] ?? fileURLToPath(import.meta.url);
  return {
    nodeBin: process.execPath,
    script,
    args: ["watch", "--headless"],
    logDir: logsDir(),
  };
}

export function createAutostart(
  spec: ServiceSpec,
  platform: NodeJS.Platform = process.platform,
): Autostart {
  switch (platform) {
    case "darwin":
      return createLaunchdAutostart(spec);
    case "linux":
      return createSystemdAutostart(spec);
    case "win32":
      return createWindowsAutostart(spec);
    default:
      return {
        kind: "unsupported",
        async install() {
          return { ok: false, message: `auto-start is not supported on ${platform}` };
        },
        async uninstall() {
          return { ok: false, message: `auto-start is not supported on ${platform}` };
        },
        async status() {
          return { ok: false, message: `auto-start is not supported on ${platform}` };
        },
      };
  }
}

export type { Autostart, AutostartResult, ServiceSpec } from "./types.js";
