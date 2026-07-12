import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { formatIncidentMessage } from "../../src/outputs/telegram/format.js";
import { resolveTelegram, sendTelegramMessage } from "../../src/outputs/telegram/index.js";
import type { IncidentView } from "../../src/outputs/terminal/types.js";

const incident: IncidentView = {
  title: "Build failed · main <dep bump>",
  severity: "critical",
  detectedAt: "2026-07-12T14:33:00.000Z",
  rootCause: "axios 1.6.2 → 1.7.0 broke interceptors & 3 tests",
  suggestedAction: "pin axios to 1.6.2",
  timeline: [],
  reportPath: "~/.postmortem/reports/2026-07-12-1433.md",
};

describe("formatIncidentMessage", () => {
  it("builds an HTML alert with severity, title, cause, action", () => {
    const msg = formatIncidentMessage(incident);
    expect(msg).toContain("☠ <b>INCIDENT · CRITICAL</b>");
    expect(msg).toContain("<b>Action:</b> pin axios to 1.6.2");
    expect(msg).toContain("<b>Cause:</b>");
    expect(msg).toContain("report:");
  });

  it("escapes HTML-reserved characters in dynamic text", () => {
    const msg = formatIncidentMessage(incident);
    expect(msg).toContain("main &lt;dep bump&gt;"); // < > escaped in the title
    expect(msg).toContain("interceptors &amp; 3 tests"); // & escaped in the cause
  });

  it("caps the message under Telegram's limit", () => {
    const msg = formatIncidentMessage({ ...incident, rootCause: "x".repeat(9000) });
    expect(msg.length).toBeLessThanOrEqual(3901);
  });
});

describe("resolveTelegram", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns null when disabled", () => {
    expect(resolveTelegram({ enabled: false, bot_token: "t", chat_id: "c" })).toBeNull();
  });

  it("returns null when enabled but missing credentials", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    expect(resolveTelegram({ enabled: true, bot_token: "", chat_id: "" })).toBeNull();
  });

  it("prefers config, falls back to env vars", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_CHAT_ID = "envchat";
    const r = resolveTelegram({ enabled: true, bot_token: "cfgtoken", chat_id: "" });
    expect(r).toEqual({ botToken: "cfgtoken", chatId: "envchat" });
  });
});

describe("sendTelegramMessage (msw)", () => {
  const server = setupServer();
  let captured: { chat_id?: string; text?: string; parse_mode?: string } | null = null;

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    server.resetHandlers();
    captured = null;
  });
  afterAll(() => server.close());

  it("posts chat_id + HTML text to the bot's sendMessage", async () => {
    server.use(
      http.post("https://api.telegram.org/bot:token/sendMessage", async ({ request }) => {
        captured = (await request.json()) as typeof captured;
        return HttpResponse.json({ ok: true, result: {} });
      }),
    );

    await sendTelegramMessage("123:secret", "-1001", "<b>hi</b>");
    expect(captured?.chat_id).toBe("-1001");
    expect(captured?.text).toBe("<b>hi</b>");
    expect(captured?.parse_mode).toBe("HTML");
  });

  it("throws (without leaking the token) on a non-200", async () => {
    server.use(
      http.post("https://api.telegram.org/bot:token/sendMessage", () =>
        HttpResponse.json({ ok: false, description: "chat not found" }, { status: 400 }),
      ),
    );
    await expect(sendTelegramMessage("123:secret", "-1001", "hi")).rejects.toThrow(/returned 400/);
    await expect(sendTelegramMessage("123:secret", "-1001", "hi")).rejects.not.toThrow(/secret/);
  });
});
