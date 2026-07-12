// Shared types for the auto-start units. Each platform generates a unit that runs
// `mort watch --headless` on login. Renderers are pure (testable); only
// install/uninstall/status touch the OS.

export interface ServiceSpec {
  nodeBin: string; // process.execPath
  script: string; // the CLI entry (dist/index.js when installed)
  args: string[]; // ["watch", "--headless"]
  logDir: string; // ~/.postmortem/logs
}

export interface AutostartResult {
  ok: boolean;
  message: string;
}

export interface Autostart {
  /** "launchd" | "systemd" | "windows" | "unsupported" */
  readonly kind: string;
  install(): Promise<AutostartResult>;
  uninstall(): Promise<AutostartResult>;
  status(): Promise<AutostartResult>;
}
