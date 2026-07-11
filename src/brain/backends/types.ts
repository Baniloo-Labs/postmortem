// Shared contract for brain backends. Kept in its own module so backends and the
// Brain router can both import it without a cycle.
//
// Every backend is interchangeable: the caller gets one `ask(prompt)` and never
// knows (or cares) which model answered.

export type BrainBackendKind = "claude-cli" | "anthropic-api" | "openai-api" | "ollama";

export interface AskOptions {
  /** Override the backend's default model for this call. */
  model?: string;
  /** Hard timeout for the call. */
  timeoutMs?: number;
}

export interface Backend {
  readonly kind: BrainBackendKind;
  ask(prompt: string, opts?: AskOptions): Promise<string>;
}

/** Cost-appropriate default for a background watcher (CLAUDE.md). */
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_TIMEOUT_MS = 60_000;
/** Cap on tokens we ask a model to generate for a structured analysis. */
export const DEFAULT_MAX_TOKENS = 2048;
