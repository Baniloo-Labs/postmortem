// Shared helpers for the non-interactive commands. These print directly (no Ink
// mounted), so writing to stdout is safe here.

import { theme } from "../outputs/terminal/theme.js";

/** Print a line to stdout. Commands here never run under the Ink renderer. */
export function println(text = ""): void {
  process.stdout.write(`${text}\n`);
}

/** Parse a relative window like "10m" / "6h" / "7d" into an ISO cutoff. */
export function parseSince(spec: string, now: number = Date.now()): string | undefined {
  const match = spec.match(/^(\d+)([mhd])$/);
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = match[2];
  const ms = unit === "m" ? n * 60_000 : unit === "h" ? n * 3_600_000 : n * 86_400_000;
  return new Date(now - ms).toISOString();
}

/** The theme color function for a severity string (unknown → muted). */
export function severityTheme(severity: string): (s: string) => string {
  switch (severity) {
    case "critical":
      return theme.critical;
    case "error":
      return theme.error;
    case "warning":
      return theme.warning;
    case "info":
      return theme.info;
    default:
      return theme.muted;
  }
}
