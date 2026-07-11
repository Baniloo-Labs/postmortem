// Ollama backend — 100% local, offline. Talks to Ollama's OpenAI-compatible
// endpoint at `${host}/v1`, reusing the openai transport.

import { createOpenAiCompatibleBackend } from "./openai.js";
import type { Backend } from "./types.js";

/** True if an Ollama server responds at `host`. Never throws. */
export async function isOllamaRunning(host: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createOllamaBackend(host: string, defaultModel: string): Backend {
  return createOpenAiCompatibleBackend({
    apiKey: "ollama", // Ollama ignores the key but the SDK requires a non-empty one.
    defaultModel,
    kind: "ollama",
    baseURL: `${host}/v1`,
    // Local models can be slow to load; the default timeout still applies per call.
  });
}
