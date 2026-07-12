import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claudeSpawnSpec,
  createClaudeCliBackend,
  isClaudeCliAvailable,
} from "../../src/brain/backends/claude-cli.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const spawnMock = vi.mocked(spawn);

// Everything spawn was asked to run, flattened to one string — platform-agnostic
// (POSIX passes an args array; Windows passes one shell command string).
function spawnedCommand(call: unknown[]): string {
  return call
    .flat(Infinity)
    .filter((x) => typeof x === "string")
    .join(" ");
}

describe("claudeSpawnSpec (platform-correct spawn params)", () => {
  it("POSIX: spawns claude with an args array, no shell", () => {
    const spec = claudeSpawnSpec(["--version"], "linux");
    expect(spec).toEqual({ command: "claude", args: ["--version"], options: {} });
    expect(spec.options.shell).toBeUndefined();
  });

  it("Windows: runs claude through the shell as one command string (no args array)", () => {
    const spec = claudeSpawnSpec(["-p", "--model", "claude-sonnet-4-6"], "win32", {
      stdio: "ignore",
    });
    expect(spec.args).toBeNull(); // no args array → no DEP0190 warning
    expect(spec.command).toBe("claude -p --model claude-sonnet-4-6");
    expect(spec.options).toMatchObject({ shell: true, stdio: "ignore" });
  });
});

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
};

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn();
  return child;
}

afterEach(() => {
  spawnMock.mockReset();
});

describe("isClaudeCliAvailable", () => {
  it("resolves true when `claude --version` exits 0", async () => {
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      queueMicrotask(() => child.emit("close", 0));
      return child as unknown as ChildProcess;
    });
    await expect(isClaudeCliAvailable()).resolves.toBe(true);
  });

  it("resolves false when the binary is missing (spawn error)", async () => {
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      queueMicrotask(() => child.emit("error", new Error("ENOENT")));
      return child as unknown as ChildProcess;
    });
    await expect(isClaudeCliAvailable()).resolves.toBe(false);
  });
});

describe("createClaudeCliBackend", () => {
  it("pipes the prompt to stdin and resolves trimmed stdout", async () => {
    const child = fakeChild();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from("  the answer  "));
        child.emit("close", 0);
      });
      return child as unknown as ChildProcess;
    });

    const backend = createClaudeCliBackend("claude-sonnet-4-6");
    await expect(backend.ask("why did it break?")).resolves.toBe("the answer");
    expect(child.stdin.write).toHaveBeenCalledWith("why did it break?");
    expect(child.stdin.end).toHaveBeenCalled();
    // Platform-agnostic: the flags + model reached spawn either way.
    const cmd = spawnedCommand(spawnMock.mock.calls[0] ?? []);
    expect(cmd).toContain("-p");
    expect(cmd).toContain("--model claude-sonnet-4-6");
  });

  it("rejects when the CLI exits non-zero", async () => {
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("boom"));
        child.emit("close", 1);
      });
      return child as unknown as ChildProcess;
    });
    const backend = createClaudeCliBackend();
    await expect(backend.ask("q")).rejects.toThrow(/exited 1/);
  });

  it("honors a per-call model override", async () => {
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      queueMicrotask(() => child.emit("close", 0));
      return child as unknown as ChildProcess;
    });
    const backend = createClaudeCliBackend("claude-sonnet-4-6");
    await backend.ask("q", { model: "claude-opus-4-8" });
    expect(spawnedCommand(spawnMock.mock.calls[0] ?? [])).toContain("claude-opus-4-8");
  });
});
