import { describe, expect, it } from "vitest";
import { createAutostart } from "../../src/autostart/index.js";
import { LAUNCHD_LABEL, renderPlist } from "../../src/autostart/launchd.js";
import { renderUnit, SYSTEMD_UNIT } from "../../src/autostart/systemd.js";
import type { ServiceSpec } from "../../src/autostart/types.js";
import { renderVbs, WINDOWS_STARTUP_FILE } from "../../src/autostart/windows.js";

const spec: ServiceSpec = {
  nodeBin: "/usr/bin/node",
  script: "/opt/app/dist/index.js",
  args: ["watch", "--headless"],
  logDir: "/home/u/.postmortem/logs",
};

describe("renderPlist (launchd)", () => {
  it("runs node + script + args at load", () => {
    const plist = renderPlist(spec);
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`);
    expect(plist).toContain("<string>/usr/bin/node</string>");
    expect(plist).toContain("<string>/opt/app/dist/index.js</string>");
    expect(plist).toContain("<string>watch</string>");
    expect(plist).toContain("<string>--headless</string>");
    expect(plist).toContain("<key>RunAtLoad</key>");
  });

  it("escapes XML-special characters in paths", () => {
    const p = renderPlist({ ...spec, script: "/opt/a&b/index.js" });
    expect(p).toContain("/opt/a&amp;b/index.js");
  });
});

describe("renderUnit (systemd)", () => {
  it("has an ExecStart with the full command and installs to default.target", () => {
    const unit = renderUnit(spec);
    expect(unit).toContain("ExecStart=/usr/bin/node /opt/app/dist/index.js watch --headless");
    expect(unit).toContain("WantedBy=default.target");
    expect(unit).toContain("Restart=on-failure");
  });

  it("quotes tokens containing spaces", () => {
    const unit = renderUnit({ ...spec, script: "/opt/my app/index.js" });
    expect(unit).toContain('"/opt/my app/index.js"');
  });
});

describe("startup VBS (windows)", () => {
  it("runs node + script + args hidden, no console window", () => {
    const vbs = renderVbs(spec);
    expect(vbs).toContain('CreateObject("WScript.Shell")');
    // paths are quoted (VBS-doubled), args present, window mode 0 (hidden), async
    expect(vbs).toContain('"""/usr/bin/node"" ""/opt/app/dist/index.js"" watch --headless"');
    expect(vbs).toContain(", 0, False");
  });

  it("uses a stable startup filename", () => {
    expect(WINDOWS_STARTUP_FILE).toBe("postmortem-mort.vbs");
  });
});

describe("createAutostart platform selection", () => {
  it("picks the right implementation per platform", () => {
    expect(createAutostart(spec, "darwin").kind).toBe("launchd");
    expect(createAutostart(spec, "linux").kind).toBe("systemd");
    expect(createAutostart(spec, "win32").kind).toBe("windows");
    expect(createAutostart(spec, "aix").kind).toBe("unsupported");
  });

  it("unsupported platform fails cleanly, never throws", async () => {
    const res = await createAutostart(spec, "sunos").install();
    expect(res.ok).toBe(false);
    expect(res.message).toContain("not supported");
  });

  it("systemd/launchd unit names are stable", () => {
    expect(SYSTEMD_UNIT).toBe("postmortem.service");
    expect(LAUNCHD_LABEL).toBe("dev.postmortem.mort");
  });
});
