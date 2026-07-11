// OpenAI-compatible backend. Powers both the OpenAI API path and Ollama's local
// OpenAI-compatible endpoint — same chat-completions shape, different base URL.

import OpenAI from "openai";
import {
  type AskOptions,
  type Backend,
  type BrainBackendKind,
  DEFAULT_TIMEOUT_MS,
} from "./types.js";

interface OpenAiCompatibleOptions {
  apiKey: string;
  defaultModel: string;
  kind: BrainBackendKind;
  baseURL?: string;
}

/** Build a backend against any OpenAI-compatible chat-completions endpoint. */
export function createOpenAiCompatibleBackend(opts: OpenAiCompatibleOptions): Backend {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  return {
    kind: opts.kind,
    async ask(prompt: string, askOpts?: AskOptions): Promise<string> {
      const model = askOpts?.model ?? opts.defaultModel;
      const res = await client.chat.completions.create(
        { model, messages: [{ role: "user", content: prompt }] },
        { timeout: askOpts?.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      );
      return (res.choices[0]?.message?.content ?? "").trim();
    },
  };
}

// The OpenAI default model is provider-appropriate here; when the user is on the
// OpenAI backend they set `brain.model` in config (the global default targets Claude).
export function createOpenAiBackend(apiKey: string, defaultModel = "gpt-4o-mini"): Backend {
  return createOpenAiCompatibleBackend({ apiKey, defaultModel, kind: "openai-api" });
}
