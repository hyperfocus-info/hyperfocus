import { describe, expect, it } from "bun:test";
import {
  CONTROLLER_PREVIEW_SHOULDER_WIDTH_RATIO,
  CONTROLLER_PREVIEW_TRIGGER_WIDTH_RATIO,
  buildControllerPreviewGeometry,
} from "./controller-input-preview-geometry";

describe("controller-input-preview-geometry", () => {
  it("returns mirrored shell anchors around the canvas center", () => {
    const geometry = buildControllerPreviewGeometry(1000, 300);
    const {
      leftGripBottom,
      leftGripOuter,
      leftShoulderCrest,
      leftUpperWaist,
      rightGripBottom,
      rightGripOuter,
      rightShoulderCrest,
      rightUpperWaist,
    } = geometry.shellAnchors;

    expect(leftShoulderCrest.x + rightShoulderCrest.x).toBeCloseTo(1000, 4);
    expect(leftUpperWaist.x + rightUpperWaist.x).toBeCloseTo(1000, 4);
    expect(leftGripOuter.x + rightGripOuter.x).toBeCloseTo(1000, 4);
    expect(leftGripBottom.x + rightGripBottom.x).toBeCloseTo(1000, 4);
  });

  it("uses trigger and shoulder widths that are 20 percent narrower than the old ratio", () => {
    const geometry = buildControllerPreviewGeometry(1000, 300);

    expect(geometry.leftTrigger.width).toBeCloseTo(1000 * CONTROLLER_PREVIEW_TRIGGER_WIDTH_RATIO, 4);
    expect(geometry.leftShoulder.width).toBeCloseTo(1000 * CONTROLLER_PREVIEW_SHOULDER_WIDTH_RATIO, 4);
    expect(geometry.leftTrigger.width).toBeCloseTo(176, 4);
    expect(geometry.leftShoulder.width).toBeCloseTo(176, 4);
  });

  it("keeps interactive control anchors inside the shell bounds band", () => {
    const geometry = buildControllerPreviewGeometry(1000, 300);
    const { shellBounds } = geometry;

    expect(geometry.leftStick.x).toBeGreaterThan(shellBounds.left);
    expect(geometry.leftStick.x).toBeLessThan(shellBounds.right);
    expect(geometry.leftStick.y).toBeGreaterThan(shellBounds.top);
    expect(geometry.leftStick.y).toBeLessThan(shellBounds.bottom);

    expect(geometry.rightStick.x).toBeGreaterThan(shellBounds.left);
    expect(geometry.rightStick.x).toBeLessThan(shellBounds.right);
    expect(geometry.rightStick.y).toBeGreaterThan(shellBounds.top);
    expect(geometry.rightStick.y).toBeLessThan(shellBounds.bottom);

    expect(geometry.dpad.x).toBeGreaterThan(shellBounds.left);
    expect(geometry.dpad.x).toBeLessThan(shellBounds.right);
    expect(geometry.dpad.y).toBeGreaterThan(shellBounds.top);
    expect(geometry.dpad.y).toBeLessThan(shellBounds.bottom);

    expect(geometry.faceCluster.x).toBeGreaterThan(shellBounds.left);
    expect(geometry.faceCluster.x).toBeLessThan(shellBounds.right);
    expect(geometry.faceCluster.y).toBeGreaterThan(shellBounds.top);
    expect(geometry.faceCluster.y).toBeLessThan(shellBounds.bottom);
  });
});
