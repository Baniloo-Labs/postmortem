// Scrolling live event feed. Newest first. Timestamps are muted (metadata, not
// content), sources are emerald, and each summary is colored by severity.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { NormalizedEvent } from "../../../core/event.js";
import { formatClock } from "../format.js";
import { colors, severityColor } from "../theme.js";

interface EventStreamProps {
  events: NormalizedEvent[];
  limit?: number;
}

export function EventStream({ events, limit = 12 }: EventStreamProps): ReactElement {
  const rows = events.slice(-limit).reverse();
  return (
    <Box flexDirection="column">
      <Text color={colors.label} bold>
        EVENT STREAM
      </Text>
      {rows.length === 0 ? (
        <Text color={colors.muted}>waiting for events…</Text>
      ) : (
        rows.map((e) => (
          <Box key={e.id}>
            <Text color={colors.timestamp}>{formatClock(e.timestamp)} </Text>
            <Text color={colors.sensor}>{e.source.padEnd(9)} </Text>
            <Text color={severityColor(e.severity)}>{e.summary}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
