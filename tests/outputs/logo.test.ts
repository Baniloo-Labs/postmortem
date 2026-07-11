import { describe, expect, it } from "vitest";
import { PRODUCT, SKULL, SKULL_GLYPH } from "../../src/outputs/terminal/logo.js";

describe("logo", () => {
  it("uses the ☠ skull unicode glyph", () => {
    expect(SKULL_GLYPH).toBe("☠");
    expect(PRODUCT).toBe("postmortem");
  });

  it("every SKULL form contains the skull", () => {
    for (const form of Object.values(SKULL)) {
      expect(form).toContain("☠");
    }
  });

  it("the banner names the product", () => {
    expect(SKULL.banner).toContain("postmortem");
  });

  it("carries no legacy 'raven' or ASCII-art branding", () => {
    const all = Object.values(SKULL).join("\n");
    expect(all.toLowerCase()).not.toContain("raven");
    expect(all).not.toContain("◢█◣");
  });
});
