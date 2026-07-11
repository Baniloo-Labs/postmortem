// The incident card — the most important thing on screen when it appears. Yellow
// border. Every AI-generated section (root cause, suggested action) is prefixed
// with a yellow ☠, signaling "postmortem's brain said this".

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { SKULL_GLYPH } from "../logo.js";
import { colors, severityColor } from "../theme.js";
import type { IncidentView } from "../types.js";

/** A section whose content came from the AI — always led by the yellow ☠. */
function BrainSection({ title, body }: { title: string; body: string }): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={colors.brand} bold>
          {SKULL_GLYPH} {title}
        </Text>
      </Text>
      <Text color={colors.value}>{body}</Text>
    </Box>
  );
}

export function IncidentCard({ incident }: { incident: IncidentView }): ReactElement {
  const sev = severityColor(incident.severity);
  return (
    <Box flexDirection="column" borderStyle="double" borderColor={colors.brand} paddingX={1}>
      <Text>
        <Text color={sev} bold>
          {SKULL_GLYPH} INCIDENT DETECTED
        </Text>
        <Text color={colors.muted}> · {incident.title}</Text>
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={colors.label} bold>
            Severity{"  "}
          </Text>
          <Text color={sev}>{incident.severity.toUpperCase()}</Text>
        </Text>
        {incident.durationLabel ? (
          <Text>
            <Text color={colors.label} bold>
              Duration{"  "}
            </Text>
            <Text color={colors.muted}>{incident.durationLabel}</Text>
          </Text>
        ) : null}
      </Box>

      {incident.rootCause ? (
        <BrainSection
          title={
            incident.confidence ? `ROOT CAUSE   [confidence: ${incident.confidence}]` : "ROOT CAUSE"
          }
          body={incident.rootCause}
        />
      ) : null}

      {incident.suggestedAction ? (
        <BrainSection title="SUGGESTED ACTION" body={incident.suggestedAction} />
      ) : null}

      {incident.timeline.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.label} bold>
            TIMELINE
          </Text>
          {incident.timeline.map((entry) => (
            <Box key={`${entry.time}-${entry.source}-${entry.text}`}>
              <Text color={colors.timestamp}>{entry.time} </Text>
              <Text color={colors.sensor}>{entry.source.padEnd(8)} </Text>
              <Text color={entry.severity ? severityColor(entry.severity) : colors.value}>
                {entry.text}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}

      {incident.patternMatch ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.label} bold>
            PATTERN MATCH
          </Text>
          <Text color={colors.muted}>{incident.patternMatch}</Text>
        </Box>
      ) : null}

      {incident.reportPath ? (
        <Box marginTop={1}>
          <Text color={colors.muted}>postmortem → {incident.reportPath}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
