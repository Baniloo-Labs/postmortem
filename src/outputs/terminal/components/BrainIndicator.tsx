// Which AI backend is active, shown top-right of the dashboard.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { colors } from "../theme.js";
import type { BrainStatus } from "../types.js";

const LABELS: Record<string, string> = {
  "claude-cli": "claude code · free",
  "anthropic-api": "anthropic api",
  "openai-api": "openai api",
  ollama: "ollama · local",
};

export function BrainIndicator({ brain }: { brain: BrainStatus }): ReactElement {
  if (!brain.kind) {
    return (
      <Box>
        <Text color={colors.muted}>✗ no brain — analysis disabled</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" alignItems="flex-end">
      <Text color={colors.success}>● {brain.model ?? brain.kind}</Text>
      <Text color={colors.muted}>{LABELS[brain.kind] ?? brain.kind}</Text>
    </Box>
  );
}
