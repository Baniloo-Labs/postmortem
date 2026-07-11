import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Brain, BrainNotConfiguredError } from "../../src/brain/index.js";
import { defaultConfig } from "../../src/core/config.js";

const { isClaudeCliAvailable, isOllamaRunning } = vi.hoisted(() => ({
  isClaudeCliAvailable: vi.fn(),
  isOllamaRunning: vi.fn(),
}));

vi.mock("../../src/brain/backends/claude-cli.js", () => ({
  isClaudeCliAvailable,
  createClaudeCliBackend: () => ({ kind: "claude-cli", ask: vi.fn() }),
}));
vi.mock("../../src/brain/backends/ollama.js", () => ({
  isOllamaRunning,
  createOllamaBackend: () => ({ kind: "ollama", ask: vi.fn() }),
}));
vi.mock("../../src/brain/backends/anthropic.js", () => ({
  createAnthropicBackend: () => ({ kind: "anthropic-api", ask: vi.fn() }),
}));
vi.mock("../../src/brain/backends/openai.js", () => ({
  createOpenAiBackend: () => ({ kind: "openai-api", ask: vi.fn() }),
}));

const savedEnv = { ...process.env };

function brainConfig(overrides: Partial<ReturnType<typeof defaultConfig>["brain"]> = {}) {
  return { ...defaultConfig().brain, ...overrides };
}

beforeEach(() => {
  isClaudeCliAvailable.mockResolvedValue(false);
  isOllamaRunning.mockResolvedValue(false);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...savedEnv };
});

describe("Brain auto-detection order", () => {
  it("prefers the claude CLI when available", async () => {
    isClaudeCliAvailable.mockResolvedValue(true);
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    const brain = new Brain(brainConfig());
    await brain.init();
    expect(brain.kind).toBe("claude-cli");
  });

  it("falls back to ANTHROPIC_API_KEY when the CLI is absent", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    const brain = new Brain(brainConfig());
    await brain.init();
    expect(brain.kind).toBe("anthropic-api");
  });

  it("falls back to OPENAI_API_KEY next", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    const brain = new Brain(brainConfig());
    await brain.init();
    expect(brain.kind).toBe("openai-api");
  });

  it("falls back to Ollama last", async () => {
    isOllamaRunning.mockResolvedValue(true);
    const brain = new Brain(brainConfig());
    await brain.init();
    expect(brain.kind).toBe("ollama");
  });

  it("is unconfigured (non-fatal) when nothing is available", async () => {
    const brain = new Brain(brainConfig());
    await brain.init();
    expect(brain.isConfigured()).toBe(false);
    expect(brain.kind).toBeNull();
    await expect(brain.ask("q")).rejects.toBeInstanceOf(BrainNotConfiguredError);
  });
});

describe("explicit backend config", () => {
  it("honors an explicit choice over auto-detection", async () => {
    isClaudeCliAvailable.mockResolvedValue(true); // would win under auto
    process.env.OPENAI_API_KEY = "sk-openai";
    const brain = new Brain(brainConfig({ backend: "openai-api" }));
    await brain.init();
    expect(brain.kind).toBe("openai-api");
  });

  it("reads the anthropic key from config, not just env", async () => {
    const brain = new Brain(
      brainConfig({ backend: "anthropic-api", anthropic_api_key: "sk-ant-cfg" }),
    );
    await brain.init();
    expect(brain.kind).toBe("anthropic-api");
  });

  it("stays unconfigured if the explicit backend's signal is missing", async () => {
    const brain = new Brain(brainConfig({ backend: "claude-cli" })); // CLI mocked unavailable
    await brain.init();
    expect(brain.isConfigured()).toBe(false);
  });
});
