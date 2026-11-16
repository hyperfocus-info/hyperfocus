import { describe, expect, it } from "bun:test";
import { resolveElementSkin } from "./element-skin";
import { shouldCollapseButtonGroup } from "./button-group/button-group-layout";
import { joinElementClasses } from "./element-helpers";

describe("PadPilot element helpers", () => {
  it("resolves element skin state by disabled, active, hover, then idle priority", () => {
    const skin = {
      idle: { src: "idle.png" },
      hover: { src: "hover.png" },
      active: { src: "active.png" },
      disabled: { src: "disabled.png" },
    };

    expect(resolveElementSkin(skin, { active: false, disabled: true, hovered: true })?.src).toBe("disabled.png");
    expect(resolveElementSkin(skin, { active: true, disabled: false, hovered: true })?.src).toBe("active.png");
    expect(resolveElementSkin(skin, { active: false, disabled: false, hovered: true })?.src).toBe("hover.png");
    expect(resolveElementSkin(skin, { active: false, disabled: false, hovered: false })?.src).toBe("idle.png");
  });

  it("collapses button groups only when below the configured width", () => {
    expect(shouldCollapseButtonGroup(320)).toBe(false);
    expect(shouldCollapseButtonGroup(320, 480)).toBe(true);
    expect(shouldCollapseButtonGroup(640, 480)).toBe(false);
  });

  it("joins only populated element class slots", () => {
    expect(joinElementClasses("root", undefined, "consumer", "")).toBe("root consumer");
  });
});
