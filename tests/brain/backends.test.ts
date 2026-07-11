import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicBackend } from "../../src/brain/backends/anthropic.js";
import { createOllamaBackend, isOllamaRunning } from "../../src/brain/backends/ollama.js";
import { createOpenAiBackend } from "../../src/brain/backends/openai.js";

const { anthropicCreate, openaiCreate } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
    constructor(_opts: unknown) {}
  },
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
    constructor(_opts: unknown) {}
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("anthropic backend", () => {
  it("concatenates text blocks and drops non-text blocks", async () => {
    anthropicCreate.mockResolvedValue({
      content: [
        { type: "text", text: "root cause: " },
        { type: "tool_use", id: "x" },
        { type: "text", text: "axios upgrade" },
      ],
    });
    const backend = createAnthropicBackend("sk-ant-key", "claude-sonnet-4-6");
    expect(backend.kind).toBe("anthropic-api");
    await expect(backend.ask("why?")).resolves.toBe("root cause: axios upgrade");
    expect(anthropicCreate.mock.calls[0]?.[0]).toMatchObject({ model: "claude-sonnet-4-6" });
  });
});

describe("openai backend", () => {
  it("returns the first choice's message content", async () => {
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: "the answer" } }] });
    const backend = createOpenAiBackend("sk-openai");
    expect(backend.kind).toBe("openai-api");
    await expect(backend.ask("q")).resolves.toBe("the answer");
  });
});

describe("ollama backend", () => {
  it("reuses the OpenAI-compatible transport", async () => {
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: "local answer" } }] });
    const backend = createOllamaBackend("http://localhost:11434", "llama3");
    expect(backend.kind).toBe("ollama");
    await expect(backend.ask("q")).resolves.toBe("local answer");
    expect(openaiCreate.mock.calls[0]?.[0]).toMatchObject({ model: "llama3" });
  });

  it("detects a running server (200 from /api/tags)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(isOllamaRunning("http://localhost:11434")).resolves.toBe(true);
  });

  it("reports not-running when the probe throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(isOllamaRunning("http://localhost:11434")).resolves.toBe(false);
  });
});
