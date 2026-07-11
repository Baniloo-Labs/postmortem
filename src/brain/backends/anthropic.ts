// Anthropic API backend — direct SDK access when ANTHROPIC_API_KEY is set.

import Anthropic from "@anthropic-ai/sdk";
import {
  type AskOptions,
  type Backend,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
} from "./types.js";

export function createAnthropicBackend(
  apiKey: string,
  defaultModel: string = DEFAULT_MODEL,
): Backend {
  const client = new Anthropic({ apiKey });
  return {
    kind: "anthropic-api",
    async ask(prompt: string, opts?: AskOptions): Promise<string> {
      const model = opts?.model ?? defaultModel;
      const res = await client.messages.create(
        {
          model,
          max_tokens: DEFAULT_MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
        },
        { timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      );
      return res.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
    },
  };
}
