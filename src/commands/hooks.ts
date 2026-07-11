// `mort hooks install` / `mort hooks uninstall` — manage a git pre-push hook that
// runs `mort predict` and blocks the push on CRITICAL risk. The hook is portable
// (POSIX sh, works via Git Bash on Windows) and unobtrusive: if `mort` isn't on
// PATH it exits silently, and a HIGH risk warns but still allows the push.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { SKULL_GLYPH } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { println } from "./util.js";

/** Marker that identifies a hook postmortem owns (so we never clobber a foreign one). */
export const HOOK_MARKER = "# postmortem ☠ pre-push hook";

export const PRE_PUSH_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
# Managed by \`mort hooks install\`. Remove with \`mort hooks uninstall\`.
# Runs a pre-deploy risk check; blocks only on CRITICAL. Override any push with
# \`git push --no-verify\`.

command -v mort >/dev/null 2>&1 || exit 0

mort predict
code=$?

if [ "$code" = "2" ]; then
  echo ""
  echo "${SKULL_GLYPH} postmortem: CRITICAL deploy risk — push blocked. Override: git push --no-verify"
  exit 1
fi

if [ "$code" = "1" ]; then
  echo ""
  echo "${SKULL_GLYPH} postmortem: elevated deploy risk — pushing anyway (review advised)."
fi

exit 0
`;

/** True if the given hook file content is one postmortem installed. */
export function isPostmortemHook(content: string): boolean {
  return content.includes(HOOK_MARKER);
}

function gitHooksDir(): string | null {
  try {
    const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], {
      encoding: "utf8",
    }).trim();
    const abs = isAbsolute(gitDir) ? gitDir : resolve(process.cwd(), gitDir);
    return join(abs, "hooks");
  } catch {
    return null;
  }
}

export function hooksInstall(): number {
  const hooksDir = gitHooksDir();
  if (!hooksDir) {
    println(theme.error("not a git repository — run this inside a repo."));
    return 1;
  }
  const hookPath = join(hooksDir, "pre-push");

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf8");
    if (!isPostmortemHook(existing)) {
      println(theme.error(`a pre-push hook already exists at ${hookPath}`));
      println(
        theme.muted("remove or merge it manually, then re-run — postmortem won't overwrite it."),
      );
      return 1;
    }
  }

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookPath, PRE_PUSH_SCRIPT, { mode: 0o755 });
  chmodSync(hookPath, 0o755);
  println(`${theme.primary(SKULL_GLYPH)} installed pre-push risk gate → ${theme.muted(hookPath)}`);
  println(theme.muted("it runs `mort predict` before each push; blocks only on CRITICAL risk."));
  return 0;
}

export function hooksUninstall(): number {
  const hooksDir = gitHooksDir();
  if (!hooksDir) {
    println(theme.error("not a git repository — run this inside a repo."));
    return 1;
  }
  const hookPath = join(hooksDir, "pre-push");

  if (!existsSync(hookPath) || !isPostmortemHook(readFileSync(hookPath, "utf8"))) {
    println(theme.muted("no postmortem pre-push hook found — nothing to remove."));
    return 0;
  }
  rmSync(hookPath);
  println(`${theme.primary(SKULL_GLYPH)} removed the postmortem pre-push hook.`);
  return 0;
}

export function hooksCommand(action: string): number {
  if (action === "install") return hooksInstall();
  if (action === "uninstall") return hooksUninstall();
  println(theme.error(`unknown action "${action}" — use: mort hooks install | uninstall`));
  return 1;
}
