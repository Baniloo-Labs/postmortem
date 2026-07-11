// Claude CLI backend — the key one. If the user has Claude Code installed and
// logged in, postmortem's brain is free (their subscription) and needs no API key.
// We shell out to `claude -p` and pipe the prompt over stdin.

import { spawn } from "node:child_process";
import { type AskOptions, type Backend, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from "./types.js";

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
      const proc = spawn("claude", ["--version"], { stdio: "ignore" });
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
      const model = opts?.model ?? defaultModel;
      const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      return new Promise((resolve, reject) => {
        const proc = spawn("claude", ["-p", "--output-format", "text", "--model", model]);
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
        proc.stdout.on("data", (d) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        proc.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`claude CLI exited ${code}: ${stderr.trim()}`));
        });

        proc.stdin.write(prompt);
        proc.stdin.end();
      });
    },
  };
}
