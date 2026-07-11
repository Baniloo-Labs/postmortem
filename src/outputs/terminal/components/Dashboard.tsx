// The live `mort watch` dashboard: header, a two-column body (sensor health +
// event stream), and the incident card when one is active. Pure composition —
// state flows in as props; the daemon layer (Session 6) supplies and updates it.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { NormalizedEvent } from "../../../core/event.js";
import type { SensorHealth } from "../../../sensors/index.js";
import { colors } from "../theme.js";
import type { BrainStatus, IncidentView } from "../types.js";
import { EventStream } from "./EventStream.js";
import { Header } from "./Header.js";
import { IncidentCard } from "./IncidentCard.js";
import { SensorStatus } from "./SensorStatus.js";

export interface DashboardProps {
  version: string;
  brain: BrainStatus;
  sensors: SensorHealth[];
  events: NormalizedEvent[];
  activeIncident?: IncidentView | null;
  dashboardUrl?: string;
}

export function Dashboard({
  version,
  brain,
  sensors,
  events,
  activeIncident,
  dashboardUrl = "http://localhost:6660",
}: DashboardProps): ReactElement {
  return (
    <Box flexDirection="column">
      <Header version={version} brain={brain} sensorCount={sensors.length} />

      <Box marginTop={1} columnGap={3}>
        <Box width={22}>
          <SensorStatus sensors={sensors} />
        </Box>
        <Box flexGrow={1}>
          <EventStream events={events} />
        </Box>
      </Box>

      {activeIncident ? (
        <Box marginTop={1}>
          <IncidentCard incident={activeIncident} />
        </Box>
      ) : null}

      <Box marginTop={1} paddingX={1}>
        <Text color={colors.muted}>dashboard → {dashboardUrl} · ctrl+c to stop</Text>
      </Box>
    </Box>
  );
}
