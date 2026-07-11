// The Brain — auto-detects one AI backend and exposes a single method: ask().
//
// Detection order (auto): claude CLI → ANTHROPIC_API_KEY → OPENAI_API_KEY → Ollama.
// An explicit `brain.backend` in config wins over auto-detection. Being
// unconfigured is NOT fatal: sensors keep recording and the dashboard still works;
// only analysis is disabled until a brain is available.

import type { Config } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import { createAnthropicBackend } from "./backends/anthropic.js";
import { createClaudeCliBackend, isClaudeCliAvailable } from "./backends/claude-cli.js";
import { createOllamaBackend, isOllamaRunning } from "./backends/ollama.js";
import { createOpenAiBackend } from "./backends/openai.js";
import {
  type AskOptions,
  type Backend,
  type BrainBackendKind,
  DEFAULT_MODEL,
} from "./backends/types.js";

const log = createLogger("brain");

export class BrainNotConfiguredError extends Error {
  constructor() {
    super(
      [
        "postmortem needs a brain. Configure one of:",
        "  Option 1 (recommended): Install Claude Code → npm install -g @anthropic-ai/claude-code && claude /login",
        "  Option 2: export ANTHROPIC_API_KEY=sk-ant-...",
        "  Option 3: export OPENAI_API_KEY=sk-...",
        "  Option 4: Install Ollama → https://ollama.ai",
      ].join("\n"),
    );
    this.name = "BrainNotConfiguredError";
  }
}

type BrainConfig = Config["brain"];

export class Brain {
  private backend: Backend | null = null;
  private readonly config: BrainConfig;

  constructor(config: BrainConfig) {
    this.config = config;
  }

  /** Detect and bind a backend. Never throws — leaves the brain unconfigured. */
  async init(): Promise<void> {
    this.backend = await this.resolve();
    if (this.backend) {
      log.info(`brain ready: ${this.backend.kind}`);
    } else {
      log.warn("no brain configured — sensors still record; analysis is disabled");
    }
  }

  get kind(): BrainBackendKind | null {
    return this.backend?.kind ?? null;
  }

  isConfigured(): boolean {
    return this.backend !== null;
  }

  /** Ask the bound backend. Throws BrainNotConfiguredError if none is available. */
  async ask(prompt: string, opts?: AskOptions): Promise<string> {
    if (!this.backend) throw new BrainNotConfiguredError();
    return this.backend.ask(prompt, opts);
  }

  private async resolve(): Promise<Backend | null> {
    const c = this.config;
    const model = c.model || DEFAULT_MODEL;
    const anthropicKey = c.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    const openaiKey = c.openai_api_key || process.env.OPENAI_API_KEY;

    // Explicit config wins over detection.
    switch (c.backend) {
      case "claude-cli":
        return (await isClaudeCliAvailable()) ? createClaudeCliBackend(model) : null;
      case "anthropic-api":
        return anthropicKey ? createAnthropicBackend(anthropicKey, model) : null;
      case "openai-api":
        return openaiKey ? createOpenAiBackend(openaiKey) : null;
      case "ollama":
        return (await isOllamaRunning(c.ollama.host))
          ? createOllamaBackend(c.ollama.host, c.ollama.model)
          : null;
      case "auto":
        break;
    }

    // Auto-detection, in priority order.
    if (await isClaudeCliAvailable()) return createClaudeCliBackend(model);
    if (anthropicKey) return createAnthropicBackend(anthropicKey, model);
    if (openaiKey) return createOpenAiBackend(openaiKey);
    if (await isOllamaRunning(c.ollama.host)) {
      return createOllamaBackend(c.ollama.host, c.ollama.model);
    }
    return null;
  }
}

export type { AskOptions, BrainBackendKind };
