// Terminal output barrel — the public surface the watch command mounts.

export { BrainIndicator } from "./components/BrainIndicator.js";
export { Dashboard, type DashboardProps } from "./components/Dashboard.js";
export { EventStream } from "./components/EventStream.js";
export { Header } from "./components/Header.js";
export { IncidentCard } from "./components/IncidentCard.js";
export { SensorStatus } from "./components/SensorStatus.js";
export { Spinner } from "./components/Spinner.js";
export { formatAge, formatClock } from "./format.js";
export { PRODUCT, SKULL, SKULL_GLYPH } from "./logo.js";
export { colors, severityColor, theme } from "./theme.js";
export type { BrainStatus, IncidentView, TimelineEntry } from "./types.js";
