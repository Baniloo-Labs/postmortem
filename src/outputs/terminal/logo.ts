// The ☠ logo. postmortem's mark is the skull unicode character at every size —
// no ASCII art. It is ALWAYS yellow (#FFD93D); never white, red, or any other
// color. See CLAUDE.md branding rules.
//
// This module exports the raw glyph (for Ink <Text color={colors.brand}>) plus
// chalk-wrapped forms for plain, non-Ink CLI output (--help, setup, status).

import chalk from "chalk";
import { colors } from "./theme.js";

/** The mark itself. Render it yellow wherever it appears. */
export const SKULL_GLYPH = "☠";
export const PRODUCT = "postmortem";

const yellow = chalk.hex(colors.brand).bold;
const muted = chalk.hex(colors.muted);
const dim = chalk.hex(colors.textMuted);

export const SKULL = {
  /** Prefix before every AI-generated output line ("postmortem's brain said this"). */
  inline: yellow(SKULL_GLYPH),

  /** Top-left of the `mort watch` live dashboard. */
  header: yellow(`${SKULL_GLYPH}  ${PRODUCT}`),

  /** `mort setup`, `mort --help`, first-run welcome. */
  banner: [
    yellow(`    ${SKULL_GLYPH}`),
    yellow(`    ${PRODUCT}`),
    muted("    AI-powered ops intelligence"),
    dim('    "I watch so you don\'t have to."'),
  ].join("\n"),

  /** Shown large above the incident card when an incident is detected. */
  large: yellow(`  ${SKULL_GLYPH}  INCIDENT DETECTED`),
} as const;
