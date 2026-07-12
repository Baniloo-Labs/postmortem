// Pure formatting for Telegram incident alerts. Produces an HTML-parse-mode
// message (Telegram's HTML subset), with all dynamic text escaped and the whole
// thing capped under Telegram's 4096-char message limit.

import type { IncidentView } from "../terminal/types.js";

const MAX_LEN = 3900; // leave headroom under Telegram's 4096
const EMOJI: Record<string, string> = {
  critical: "🔴",
  error: "🟠",
  warning: "🟡",
  info: "🔵",
};

/** Escape the characters Telegram's HTML parse mode reserves. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatIncidentMessage(view: IncidentView): string {
  const emoji = EMOJI[view.severity] ?? "";
  const lines: string[] = [];

  lines.push(`☠ <b>INCIDENT · ${view.severity.toUpperCase()}</b> ${emoji}`.trimEnd());
  lines.push(`<b>${escapeHtml(view.title)}</b>`);

  if (view.rootCause) {
    lines.push("");
    lines.push(`<b>Cause:</b> ${escapeHtml(view.rootCause)}`);
  }
  if (view.suggestedAction) {
    lines.push(`<b>Action:</b> ${escapeHtml(view.suggestedAction)}`);
  }
  if (view.reportPath) {
    lines.push("");
    lines.push(`<i>report: ${escapeHtml(view.reportPath)}</i>`);
  }

  const message = lines.join("\n");
  return message.length > MAX_LEN ? `${message.slice(0, MAX_LEN)}…` : message;
}
