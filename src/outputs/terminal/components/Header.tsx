// The dashboard header: yellow ☠ postmortem + version on the left, active brain
// on the right, watched-sensor count below.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { SKULL_GLYPH } from "../logo.js";
import { colors } from "../theme.js";
import type { BrainStatus } from "../types.js";
import { BrainIndicator } from "./BrainIndicator.js";

interface HeaderProps {
  version: string;
  brain: BrainStatus;
  sensorCount: number;
}

export function Header({ version, brain, sensorCount }: HeaderProps): ReactElement {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box flexDirection="column">
        <Text>
          <Text color={colors.brand} bold>
            {SKULL_GLYPH} postmortem
          </Text>
          <Text color={colors.muted}> v{version}</Text>
        </Text>
        <Text color={colors.muted}>
          watching {sensorCount} sensor{sensorCount === 1 ? "" : "s"}
        </Text>
      </Box>
      <BrainIndicator brain={brain} />
    </Box>
  );
}
