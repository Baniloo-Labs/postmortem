import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { askJson, extractJson } from "../../src/brain/json.js";

const Shape = z.object({ risk: z.enum(["low", "high"]), reason: z.string() });

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence", () => {
    const text = '```json\n{"a":1}\n```';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it("strips a plain ``` fence", () => {
    expect(extractJson('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("ignores leading and trailing prose", () => {
    const text = 'Sure! Here is the analysis:\n{"a":3}\nHope that helps.';
    expect(extractJson(text)).toEqual({ a: 3 });
  });

  it("throws on text with no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("askJson", () => {
  it("returns validated data on the first try", async () => {
    const ask = vi.fn().mockResolvedValue('{"risk":"low","reason":"looks fine"}');
    const result = await askJson(ask, "prompt", Shape);
    expect(result).toEqual({ ok: true, data: { risk: "low", reason: "looks fine" } });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("retries once with a JSON-only reminder when the first response is unparseable", async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce("I cannot help with that.")
      .mockResolvedValueOnce('{"risk":"high","reason":"auth changed"}');
    const result = await askJson(ask, "prompt", Shape);

    expect(result).toEqual({ ok: true, data: { risk: "high", reason: "auth changed" } });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1]?.[0]).toContain("ONLY");
  });

  it("degrades gracefully to raw text after a failed retry", async () => {
    const ask = vi.fn().mockResolvedValue("still not json");
    const result = await askJson(ask, "prompt", Shape);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.raw).toBe("still not json");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("rejects JSON that parses but fails schema validation, then degrades", async () => {
    const ask = vi.fn().mockResolvedValue('{"risk":"medium","reason":"x"}'); // 'medium' not allowed
    const result = await askJson(ask, "prompt", Shape);
    expect(result.ok).toBe(false);
  });
});
