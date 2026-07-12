// Telegram output — send incident alerts to a chat via a BotFather bot (Bot API
// `sendMessage`). Wired as a pipeline listener in `mort watch`; a failed send is
// logged, never thrown (a down Telegram must not affect the daemon).
//
// Env: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID override the config values (secrets
// prefer env). The bot token is never logged (the redactor scrubs it as defense).

import got from "got";
import { createLogger } from "../../core/logger.js";
import type { IncidentView } from "../terminal/types.js";
import { formatIncidentMessage } from "./format.js";

const log = createLogger("output:telegram");

// Telegram supports self-hosted Bot API servers; TELEGRAM_API_BASE overrides the
// default for those setups (and for tests).
function apiBase(): string {
  return process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
}

export interface TelegramSettings {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
}

export interface ResolvedTelegram {
  botToken: string;
  chatId: string;
}

/** Resolve enabled+credentialed Telegram settings (config, then env), or null. */
export function resolveTelegram(settings: TelegramSettings): ResolvedTelegram | null {
  if (!settings.enabled) return null;
  const botToken = settings.bot_token || process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = settings.chat_id || process.env.TELEGRAM_CHAT_ID || "";
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/** Send a message to a chat. Throws on a non-2xx response (caller logs it). */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const res = await got.post(`${apiBase()}/bot${botToken}/sendMessage`, {
    json: { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true },
    responseType: "json",
    throwHttpErrors: false,
    timeout: { request: 10_000 },
    retry: { limit: 1 },
  });
  if (res.statusCode !== 200) {
    // Never include the URL/token in the error.
    throw new Error(`telegram sendMessage returned ${res.statusCode}`);
  }
}

export interface TelegramOutput {
  notify(view: IncidentView): void;
}

/** Build an output that alerts on each incident. Errors are swallowed + logged. */
export function createTelegramOutput(resolved: ResolvedTelegram): TelegramOutput {
  return {
    notify(view: IncidentView): void {
      void sendTelegramMessage(
        resolved.botToken,
        resolved.chatId,
        formatIncidentMessage(view),
      ).catch((err) => log.error("telegram alert failed", { error: String(err) }));
    },
  };
}
