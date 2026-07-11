// Live sensor health panel. Healthy sensors are emerald ●, unhealthy/disabled are
// dim ✗. Sensor names are emerald (the sensor brand color).

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { SensorHealth } from "../../../sensors/index.js";
import { colors } from "../theme.js";

export function SensorStatus({ sensors }: { sensors: SensorHealth[] }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={colors.label} bold>
        SENSORS
      </Text>
      {sensors.length === 0 ? (
        <Text color={colors.muted}>none enabled</Text>
      ) : (
        sensors.map((s) => (
          <Box key={s.name}>
            {s.healthy ? (
              <Text color={colors.sensor}>● </Text>
            ) : (
              <Text color={colors.muted}>✗ </Text>
            )}
            <Text color={s.healthy ? colors.sensor : colors.muted}>{s.name}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
