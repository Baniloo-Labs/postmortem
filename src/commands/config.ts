// `mort config show` — print the resolved config with secrets masked.
// `mort config path` — print the config file location.
// (Editing via `config set` is a v1.1 item; the TOML file is hand-editable.)

import { existsSync, readFileSync } from "node:fs";
import { configFile } from "../core/paths.js";
import { SKULL } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { println } from "./util.js";

export function configCommand(action = "show"): void {
  const path = configFile();

  if (action === "path") {
    println(path);
    return;
  }

  if (!existsSync(path)) {
    println(theme.muted(`no config file at ${path}`));
    println(
      theme.muted(
        `run ${theme.primary("mort setup")} to create one (defaults are used until then)`,
      ),
    );
    return;
  }

  println(`${SKULL.header}${theme.muted(`  ${path}`)}`);
  println();
  println(maskSecrets(readFileSync(path, "utf8").trimEnd()));
}

/** Replace secret values in TOML with *** so `config show` is safe to paste. */
export function maskSecrets(toml: string): string {
  return toml.replace(
    /((?:token|secret|api_key|password)\s*=\s*)"([^"]+)"/gi,
    (_match, keyPart: string) => `${keyPart}"***"`,
  );
}
