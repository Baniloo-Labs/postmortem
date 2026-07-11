// A minimal braille spinner for loading states. Self-animates via an effect; the
// frame is the only state — no external I/O.

import { Box, Text } from "ink";
import { type ReactElement, useEffect, useState } from "react";
import { colors } from "../theme.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label: string }): ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box>
      <Text color={colors.brand}>{FRAMES[frame]}</Text>
      <Text color={colors.muted}> {label}</Text>
    </Box>
  );
}
