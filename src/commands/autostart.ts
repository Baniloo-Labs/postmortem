// `mort autostart install|uninstall|status` — manage running the daemon on login.

import { createAutostart, defaultServiceSpec } from "../autostart/index.js";
import { SKULL_GLYPH } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { println } from "./util.js";

export async function autostartCommand(action: string): Promise<number> {
  const autostart = createAutostart(defaultServiceSpec());

  const result =
    action === "install"
      ? await autostart.install()
      : action === "uninstall"
        ? await autostart.uninstall()
        : action === "status"
          ? await autostart.status()
          : {
              ok: false,
              message: `unknown action "${action}" — use install | uninstall | status`,
            };

  if (result.ok) {
    println(`${theme.primary(SKULL_GLYPH)} ${result.message}`);
    if (action === "install") {
      println(theme.muted("  starts on next login. Start now: mort watch --headless"));
    }
    return 0;
  }
  println(theme.muted(result.message));
  return 1;
}
