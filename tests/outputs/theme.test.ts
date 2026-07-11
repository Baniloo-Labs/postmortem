import { describe, expect, it } from "vitest";
import { colors, severityColor } from "../../src/outputs/terminal/theme.js";

describe("theme colors", () => {
  it("brand is the yellow #FFD93D", () => {
    expect(colors.brand).toBe("#FFD93D");
    expect(colors.brain).toBe("#FFD93D"); // AI output shares the brand color
  });

  it("warning is orange #FF922B, never brand yellow", () => {
    expect(colors.warning).toBe("#FF922B");
    expect(colors.warning).not.toBe(colors.brand);
  });

  it("sensor indicators are emerald", () => {
    expect(colors.sensor).toBe("#34D399");
  });
});

describe("severityColor", () => {
  it("maps each severity to its color", () => {
    expect(severityColor("critical")).toBe(colors.critical);
    expect(severityColor("error")).toBe(colors.error);
    expect(severityColor("warning")).toBe(colors.warning);
    expect(severityColor("info")).toBe(colors.info);
  });

  it("never colors a warning with the brand yellow", () => {
    expect(severityColor("warning")).not.toBe(colors.brand);
  });
});
