import { describe, expect, it } from "bun:test";
import {
  ALL_CONTROLLER_PREVIEW_SCOPE,
  buildControllerPreviewModel,
  buildControllerPreviewScopeOptions,
  createPreviewDevice,
  resolveControllerPreviewScope,
} from "./controller-input-preview-model";

describe("controller-input-preview-model", () => {
  it("builds selector options from connected gamepads only", () => {
    const options = buildControllerPreviewScopeOptions([
      createPreviewDevice({ displayName: "Deck A", runtimeDeviceId: "deck-a" }),
      createPreviewDevice({ connected: false, displayName: "Deck B", runtimeDeviceId: "deck-b" }),
      createPreviewDevice({ deviceKind: "unknown", displayName: "MIDI Surface", runtimeDeviceId: "midi-a" }),
    ]);

    expect(options).toEqual([
      { value: ALL_CONTROLLER_PREVIEW_SCOPE, label: "All Connected Devices" },
      { value: "deck-a", label: "Deck A (deck-a)" },
    ]);
  });

  it("aggregates canonical buttons with max values in all-devices mode", () => {
    const model = buildControllerPreviewModel([
      createPreviewDevice({ buttons: [0.25, 0, 0, 0.1] }),
      createPreviewDevice({ buttons: [0.6, 0.8, 0, 0.05] }),
    ], ALL_CONTROLLER_PREVIEW_SCOPE);

    expect(model.buttons.slice(0, 4)).toEqual([0.6, 0.8, 0, 0.1]);
  });

  it("aggregates canonical axes by strongest absolute magnitude", () => {
    const model = buildControllerPreviewModel([
      createPreviewDevice({ axes: [0.25, -0.4, 0.3, 0.1] }),
      createPreviewDevice({ axes: [-0.9, -0.2, 0.1, -0.75] }),
    ], ALL_CONTROLLER_PREVIEW_SCOPE);

    expect(model.axes).toEqual([-0.9, -0.4, 0.3, -0.75]);
  });

  it("extracts overflow raw buttons 16+ and axes 4+", () => {
    const model = buildControllerPreviewModel([
      createPreviewDevice({
        rawAxes: [0.1, 0.2, 0.3, 0.4, 0.9],
        rawButtons: Array.from({ length: 18 }, (_, index) => index === 16 ? 1 : 0),
        runtimeDeviceId: "deck-a",
      }),
    ], "deck-a");

    expect(model.overflowGroups).toHaveLength(1);
    expect(model.overflowGroups[0]?.buttons).toEqual([
      { index: 16, value: 1 },
      { index: 17, value: 0 },
    ]);
    expect(model.overflowGroups[0]?.axes).toEqual([
      { index: 4, value: 0.9 },
    ]);
  });

  it("keeps overflow grouped per device in all-devices mode", () => {
    const model = buildControllerPreviewModel([
      createPreviewDevice({
        displayName: "Deck A",
        rawButtons: Array.from({ length: 17 }, (_, index) => index === 16 ? 0.7 : 0),
        runtimeDeviceId: "deck-a",
      }),
      createPreviewDevice({
        displayName: "Deck B",
        rawAxes: [0, 0, 0, 0, -0.5],
        runtimeDeviceId: "deck-b",
      }),
    ], ALL_CONTROLLER_PREVIEW_SCOPE);

    expect(model.overflowGroups).toHaveLength(2);
    expect(model.overflowGroups[0]?.deviceLabel).toBe("Deck A (deck-a)");
    expect(model.overflowGroups[1]?.deviceLabel).toBe("Deck B (deck-b)");
  });

  it("formats active summary for idle, single-device, and all-devices states", () => {
    const idleModel = buildControllerPreviewModel([], ALL_CONTROLLER_PREVIEW_SCOPE);
    const singleModel = buildControllerPreviewModel([
      createPreviewDevice({
        axes: [0.25, -0.5, 0, 0],
        buttons: [1, 0, 0, 0, 0, 0, 0.62],
        runtimeDeviceId: "deck-a",
      }),
    ], "deck-a");
    const allModel = buildControllerPreviewModel([
      createPreviewDevice({ buttons: [1], runtimeDeviceId: "deck-a" }),
      createPreviewDevice({ buttons: [0, 0, 0, 0, 0, 1], runtimeDeviceId: "deck-b" }),
    ], ALL_CONTROLLER_PREVIEW_SCOPE);

    expect(idleModel.activeSummary).toBe("Idle");
    expect(singleModel.activeSummary).toBe("Active: A / South, LT 62%, Left Stick (0.25, -0.50)");
    expect(allModel.activeSummary).toBe("2 devices active: A / South, RB");
  });

  it("falls back cleanly when arrays are shorter than canonical surface", () => {
    const model = buildControllerPreviewModel([
      createPreviewDevice({
        axes: [0.3],
        buttons: [1],
      }),
    ], ALL_CONTROLLER_PREVIEW_SCOPE);

    expect(model.axes).toEqual([0.3, 0, 0, 0]);
    expect(model.buttons).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("falls back to all-devices scope when the selected runtime device disappears", () => {
    const resolved = resolveControllerPreviewScope([
      createPreviewDevice({ runtimeDeviceId: "deck-a" }),
    ], "missing-device");

    expect(resolved).toBe(ALL_CONTROLLER_PREVIEW_SCOPE);
  });
});
