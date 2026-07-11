import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClaudeCliBackend,
  isClaudeCliAvailable,
} from "../../src/brain/backends/claude-cli.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const spawnMock = vi.mocked(spawn);

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
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      "-p",
      "--output-format",
      "text",
      "--model",
      "claude-sonnet-4-6",
    ]);
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
    expect(spawnMock.mock.calls[0]?.[1]).toContain("claude-opus-4-8");
  });
});
