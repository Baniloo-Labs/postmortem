---
name: add-brain-backend
description: Scaffold a new AI backend for the postmortem brain (detection hook + ask() implementation + detection-order registration + mocked tests). Use when adding support for a new model provider such as Gemini, Mistral, OpenRouter, or a local runtime.
---

# add-brain-backend

Add a new AI backend to the brain. The brain auto-detects one backend and exposes a single method: `ask(prompt): Promise<string>`. Backends are interchangeable — callers never know which one answered.

## Inputs to gather first
- **Backend id** (e.g. `gemini`) — extend the `BrainBackend` union in `src/brain/index.ts`.
- **Detection signal:** an env var (e.g. `GEMINI_API_KEY`), a reachable localhost port, or a binary in PATH.
- **Transport:** official SDK, OpenAI-compatible endpoint (reuse the `openai` backend pattern), or `node:child_process` subprocess (reuse the `claude-cli` pattern).
- **Default model id** for this provider.

## Steps
1. Create `src/brain/backends/<id>.ts` exporting an `ask`-style function (mirror `claude-cli.ts` / `anthropic.ts` / `openai.ts`). Many providers are OpenAI-compatible — point the `openai` SDK at their base URL instead of writing new transport code.
2. Add a detection helper in `src/brain/index.ts` and insert it into `detectBackend()` at the correct **priority position**. Current order: claude-cli → ANTHROPIC_API_KEY → OPENAI_API_KEY → ollama. Place new backends so they don't shadow a user's explicit choice.
3. Honor `config.brain.backend` when it is not `auto` — explicit config wins over detection.
4. Tests: `tests/brain/<id>.test.ts` — mock the SDK/subprocess/HTTP; assert detection fires only when the signal is present and `ask()` returns the response string.

## Rules (must follow)
- `ask()` returns a plain string; the **caller** owns JSON parsing (the tolerant fence-stripping + Zod-validate + one-retry logic lives in the analysis layer, not here).
- Respect the **per-window token budget** — don't add a backend that bypasses prompt truncation.
- Failures throw a descriptive `Error`; brain-not-configured stays non-fatal (sensors keep recording).
- Never log prompt/response contents containing secrets — they pass through the redactor upstream, but don't reintroduce raw dumps.
- Default model ids: keep `claude-sonnet-4-6` as the project default; confirm any new provider's current model id (don't guess).

## Done when
The backend is detected in priority order, selectable via `config.brain.backend`, `ask()` works against a mock, and `mort status` reports it as the active brain.
