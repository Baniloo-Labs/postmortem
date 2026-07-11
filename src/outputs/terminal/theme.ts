// The single source of color for all terminal output. Components and commands
// reference these — never hardcode a hex. Two shapes are exported:
//   • `colors` — hex strings, for Ink <Text color={...}> and <Box borderColor>.
//   • `theme`  — chalk functions, for plain non-Ink CLI printing.
//
// Brand law (CLAUDE.md): yellow #FFD93D is postmortem's identity — the ☠, the
// product name, AI output. `warning` severity is orange #FF922B, NEVER yellow.

import chalk from "chalk";
import type { EventSeverity } from "../../core/event.js";

export const colors = {
  // Brand — yellow is postmortem's identity.
  brand: "#FFD93D",
  accent: "#FFB800",

  // Severity.
  critical: "#FF4444",
  error: "#FF6B6B",
  warning: "#FF922B", // orange — distinct from brand yellow
  success: "#51CF66",
  info: "#74C0FC",

  // Chrome.
  border: "#2A2A2A",
  label: "#888888",
  value: "#EEEEEE",
  timestamp: "#444444",
  muted: "#888888",
  textMuted: "#555555",

  // Special.
  brain: "#FFD93D", // AI output shares the brand color
  sensor: "#34D399", // emerald — sensor health indicators
} as const;

export type ColorName = keyof typeof colors;

export const theme = {
  primary: chalk.hex(colors.brand),
  accent: chalk.hex(colors.accent),
  critical: chalk.hex(colors.critical),
  error: chalk.hex(colors.error),
  warning: chalk.hex(colors.warning),
  success: chalk.hex(colors.success),
  info: chalk.hex(colors.info),
  muted: chalk.hex(colors.muted),
  border: chalk.hex(colors.border),
  label: chalk.bold.hex(colors.label),
  value: chalk.hex(colors.value),
  timestamp: chalk.hex(colors.timestamp),
  brain: chalk.hex(colors.brain),
  sensor: chalk.hex(colors.sensor),
} as const;

/** The hex color for an event severity. Warning is orange, never brand yellow. */
export function severityColor(severity: EventSeverity): string {
  switch (severity) {
    case "critical":
      return colors.critical;
    case "error":
      return colors.error;
    case "warning":
      return colors.warning;
    case "info":
      return colors.info;
  }
}
