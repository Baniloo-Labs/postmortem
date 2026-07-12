// Claude CLI backend — the key one. If the user has Claude Code installed and
// logged in, postmortem's brain is free (their subscription) and needs no API key.
// We shell out to `claude -p` and pipe the prompt over stdin.
//
// Windows note: `claude` is a .cmd/.ps1 shim there, which Node cannot launch
// directly (spawn won't resolve the shim, and Node refuses to exec .cmd/.bat
// without a shell). So on Windows we run it through the shell as a single command
// string — passing a command string rather than an args array also avoids Node's
// shell-args deprecation warning (DEP0190). Every interpolated value is a fixed
// flag or a charset-validated model, so there is no injection surface.

import { type SpawnOptions, spawn } from "node:child_process";
import { type AskOptions, type Backend, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from "./types.js";

const SAFE_MODEL = /^[A-Za-z0-9._-]+$/;

export interface ClaudeSpawnSpec {
  command: string;
  /** Null means `command` is a full shell string (Windows path). */
  args: string[] | null;
  options: SpawnOptions;
}

/** Build platform-correct spawn parameters for the `claude` CLI. Pure/testable. */
export function claudeSpawnSpec(
  argv: string[],
  platform: NodeJS.Platform,
  options: SpawnOptions = {},
): ClaudeSpawnSpec {
  if (platform === "win32") {
    return {
      command: ["claude", ...argv].join(" "),
      args: null,
      options: { ...options, shell: true },
    };
  }
  return { command: "claude", args: argv, options };
}

function spawnClaude(argv: string[], options: SpawnOptions = {}) {
  const spec = claudeSpawnSpec(argv, process.platform, options);
  return spec.args
    ? spawn(spec.command, spec.args, spec.options)
    : spawn(spec.command, spec.options);
}

/** True if a `claude` binary is on PATH and responds. Never throws. */
export function isClaudeCliAvailable(timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const proc = spawnClaude(["--version"], { stdio: "ignore" });
      const timer = setTimeout(() => {
        proc.kill();
        done(false);
      }, timeoutMs);
      proc.on("error", () => {
        clearTimeout(timer);
        done(false);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        done(code === 0);
      });
    } catch {
      done(false);
    }
  });
}

export function createClaudeCliBackend(defaultModel: string = DEFAULT_MODEL): Backend {
  return {
    kind: "claude-cli",
    ask(prompt: string, opts?: AskOptions): Promise<string> {
      const requested = opts?.model ?? defaultModel;
      // Validate before it can reach a Windows shell command string.
      const model = SAFE_MODEL.test(requested) ? requested : DEFAULT_MODEL;
      const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      return new Promise((resolve, reject) => {
        const proc = spawnClaude(["-p", "--output-format", "text", "--model", model]);
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          proc.kill();
          reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        proc.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        proc.stdout?.on("data", (d) => {
          stdout += d.toString();
        });
        proc.stderr?.on("data", (d) => {
          stderr += d.toString();
        });
        proc.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`claude CLI exited ${code}: ${stderr.trim()}`));
        });

        proc.stdin?.write(prompt);
        proc.stdin?.end();
      });
    },
  };
}
