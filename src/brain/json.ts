// Tolerant LLM-JSON handling. Never trust a model to return clean JSON: strip
// ```json fences and preamble, parse, then Zod-validate. On failure, retry once
// with a "JSON only" reminder, then degrade gracefully (return the raw text so the
// caller can still record something).

import type { z } from "zod";

/**
 * Pull a JSON object out of an LLM response. Handles ```json fences and leading/
 * trailing prose by slicing to the outermost braces. Throws if no JSON parses.
 */
export function extractJson(text: string): unknown {
  let t = text.trim();

  // Prefer the contents of a fenced code block if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();

  // Slice to the outermost object braces to drop any surrounding prose.
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  return JSON.parse(t);
}

function tryParse<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    const result = schema.safeParse(extractJson(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type AskFn = (prompt: string) => Promise<string>;

export type JsonResult<T> = { ok: true; data: T } | { ok: false; raw: string };

const JSON_ONLY_REMINDER =
  "\n\nIMPORTANT: Respond with ONLY the JSON object. No markdown, no code fences, no preamble.";

/**
 * Ask a model for JSON matching `schema`. Validates tolerantly, retries once with
 * a reminder, then gives up and returns the raw text. Never throws on bad JSON —
 * a flaky model must not crash the analysis pipeline.
 */
export async function askJson<T>(
  ask: AskFn,
  prompt: string,
  schema: z.ZodType<T>,
): Promise<JsonResult<T>> {
  const first = await ask(prompt);
  const parsedFirst = tryParse(first, schema);
  if (parsedFirst !== null) return { ok: true, data: parsedFirst };

  const second = await ask(prompt + JSON_ONLY_REMINDER);
  const parsedSecond = tryParse(second, schema);
  if (parsedSecond !== null) return { ok: true, data: parsedSecond };

  return { ok: false, raw: second.trim() || first.trim() };
}
