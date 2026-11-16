import { requireElement } from "../../utils/require-element";
import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { FxNodeType } from "../../proto/generated/fx-chain-pb";
import { getNodeDefinition, FX_NODE_REGISTRY } from "./node-registry/registry";
import {
  FX_NATIVE_SUPPORTED_CONTROL_KEYS,
  FX_PROTO_COMPATIBILITY_ONLY_FIELDS,
} from "./node-registry/native-control-contract";
import { IO } from "../../padpilot/provider";
import { PADPILOT_FILE_IMPORT_MAX_BYTES } from "@hyperfocus/pad-pilot/file-import";
import { renderConvolverNodeEditor } from "./node-registry/renderers-tone";
import { renderDelayNodeEditor } from "./node-registry/renderers-spatial";

describe("fx node registry", () => {
  it("exposes all 19 functional node types including parity additions", () => {
    expect(FX_NODE_REGISTRY).toHaveLength(19);
    expect(new Set(FX_NODE_REGISTRY.map((definition) => definition.type)).size).toBe(19);
    expect(FX_NODE_REGISTRY.some((definition) => definition.type === FxNodeType.CONVOLVER)).toBe(true);
    expect(FX_NODE_REGISTRY.some((definition) => definition.type === FxNodeType.PHASER)).toBe(true);
    expect(FX_NODE_REGISTRY.some((definition) => definition.type === FxNodeType.ROTARY_SPEAKER)).toBe(true);
    expect(FX_NODE_REGISTRY.some((definition) => definition.type === FxNodeType.PITCH_DRIFT)).toBe(true);
    expect(FX_NODE_REGISTRY.some((definition) => definition.type === FxNodeType.REVERSE)).toBe(true);
    expect(FX_NODE_REGISTRY.some((definition) => definition.type === FxNodeType.TREMOLO)).toBe(true);
    expect(FX_NODE_REGISTRY.some((definition) => definition.type === FxNodeType.SATURATION)).toBe(true);
    expect(getNodeDefinition(FxNodeType.CONVOLVER).controls.map((control) => control.key)).toEqual([
      "blend", "irId", "irSourcePath", "irSourceName",
    ]);
    expect(getNodeDefinition(FxNodeType.PHASER).controls).not.toEqual([]);
    expect(getNodeDefinition(FxNodeType.ROTARY_SPEAKER).controls).not.toEqual([]);
    expect(getNodeDefinition(FxNodeType.PITCH_DRIFT).controls).not.toEqual([]);
    expect(getNodeDefinition(FxNodeType.REVERB).defaultName).toBe("Reverb");
  });

  it("keeps timing-sync metadata on delay and reverb controls through the public registry", () => {
    const delayDefinition = getNodeDefinition(FxNodeType.DELAY);
    const reverbDefinition = getNodeDefinition(FxNodeType.REVERB);
    const chorusDefinition = getNodeDefinition(FxNodeType.CHORUS);
    const delayTime = delayDefinition.controls.find((control) => control.key === "time");
    const reverbPreDelay = reverbDefinition.controls.find((control) => control.key === "preDelayMs");
    const reverbModSpeed = reverbDefinition.controls.find((control) => control.key === "modulationSpeedHz");
    const chorusRate = chorusDefinition.controls.find((control) => control.key === "rateHz");
    const chorusVoiceDelay = chorusDefinition.controls.find((control) => control.key === "voiceDelayMs");
    const phaserSpeed = getNodeDefinition(FxNodeType.PHASER).controls.find((control) => control.key === "speedHz");
    const pitchDriftRate = getNodeDefinition(FxNodeType.PITCH_DRIFT).controls.find((control) => control.key === "rateHz");

    expect(delayTime?.timingSync?.syncEnabledParamId).toBe(4);
    expect(delayTime?.timingSync?.syncDivisionParamId).toBe(5);
    expect(delayTime?.timingSync?.maximumDivisionIndex).toBe(10);
    expect(reverbPreDelay?.timingSync?.syncEnabledParamId).toBe(5);
    expect(reverbPreDelay?.timingSync?.syncDivisionParamId).toBe(6);
    expect(reverbPreDelay?.timingSync?.maximumDivisionIndex).toBe(10);
    expect(reverbModSpeed?.timingSync?.syncEnabledParamId).toBe(8);
    expect(reverbModSpeed?.timingSync?.syncDivisionParamId).toBe(9);
    expect(reverbModSpeed?.timingSync?.maximumDivisionIndex).toBeUndefined();
    expect(chorusRate?.timingSync?.maximumDivisionIndex).toBeUndefined();
    expect(chorusVoiceDelay?.timingSync?.maximumDivisionIndex).toBe(10);
    expect(phaserSpeed?.timingSync?.syncEnabledParamId).toBe(4);
    expect(phaserSpeed?.timingSync?.syncDivisionParamId).toBe(5);
    expect(pitchDriftRate?.timingSync?.syncEnabledParamId).toBe(4);
    expect(pitchDriftRate?.timingSync?.syncDivisionParamId).toBe(5);
  });

  it("exposes only controls with an observable native DSP mapping", () => {
    for (const definition of FX_NODE_REGISTRY) {
      const renderedKeys = definition.controls.map((control) => control.key);
      expect(renderedKeys).toEqual([...FX_NATIVE_SUPPORTED_CONTROL_KEYS[definition.type]]);

      const compatibilityOnlyFields = FX_PROTO_COMPATIBILITY_ONLY_FIELDS[definition.type] ?? [];
      expect(renderedKeys.some((key) => compatibilityOnlyFields.includes(key))).toBe(false);
    }

    expect(FX_NATIVE_SUPPORTED_CONTROL_KEYS[FxNodeType.CONVOLVER]).toContain("blend");
    expect(FX_NATIVE_SUPPORTED_CONTROL_KEYS[FxNodeType.PHASER]).toContain("stages");
    expect(FX_NATIVE_SUPPORTED_CONTROL_KEYS[FxNodeType.ROTARY_SPEAKER]).toContain("acceleration");
    expect(FX_NATIVE_SUPPORTED_CONTROL_KEYS[FxNodeType.PITCH_DRIFT]).toContain("rangeCents");
  });

  it("labels legacy protobuf fields by their actual native behavior", () => {
    const reverbWidth = getNodeDefinition(FxNodeType.REVERB).controls.find((control) => control.key === "mode");
    const exciterTarget = getNodeDefinition(FxNodeType.EXCITER).controls.find((control) => control.key === "frequencyBandSolo");

    expect(reverbWidth?.label).toBe("Width character");
    expect(reverbWidth?.options).toEqual([
      { label: "Narrow", value: "Room" },
      { label: "Balanced", value: "Hall" },
      { label: "Wide", value: "Plate" },
      { label: "Extra wide", value: "Shimmer" },
    ]);
    expect(exciterTarget?.label).toBe("Target Band");
  });
});

createUiTest("fx node renderers", () => {
  it("renders the shared sync toggle and combobox-backed delay editor controls", () => {
    const definition = getNodeDefinition(FxNodeType.DELAY);
    const config = definition.createDefaultConfig();

    render(() =>
      renderDelayNodeEditor({
        controls: definition.controls,
        config,
        name: definition.defaultName,
        nodeFrame: null,
        updateControl: () => undefined,
        visualizer: null,
      }),
    );

    expect(screen.getByRole("button", { name: "Sync" })).not.toBeNull();
    expect(screen.getByText("Delay output activity")).not.toBeNull();
    expect(screen.getByText("Feedback")).not.toBeNull();
    expect(screen.queryByText("Granular engine")).toBeNull();
    expect(screen.queryByText("Grain Mode")).toBeNull();
  });

  it("caps delay-bearing sync controls at the native one-beat boundary", () => {
    const definition = getNodeDefinition(FxNodeType.DELAY);
    const config = definition.createDefaultConfig();
    config.timeSync!.enabled = true;
    config.timeSync!.divisionIndex = 19;

    render(() =>
      renderDelayNodeEditor({
        controls: definition.controls,
        config,
        name: definition.defaultName,
        nodeFrame: null,
        updateControl: () => undefined,
        visualizer: null,
      }),
    );

    const timeControl = screen.getByRole("slider", { name: "Time" });
    expect(timeControl.getAttribute("aria-valuemax")).toBe("10");
    expect(timeControl.getAttribute("aria-valuenow")).toBe("10");
  });

  it("imports an impulse response through PadPilot.IO and publishes one per-node managed reference", async () => {
    const definition = getNodeDefinition(FxNodeType.CONVOLVER);
    const config = definition.createDefaultConfig();
    const updates: Array<[string, unknown, boolean]> = [];
    const originalImport = IO.importFile;
    IO.importFile = (async (_input, options) => {
      expect(options?.category).toBe("impulse-response");
      expect(options?.maxBytes).toBe(PADPILOT_FILE_IMPORT_MAX_BYTES);
      return {
        byteSize: 4,
        contentId: "0123456789abcdef0123456789abcdef",
        mimeType: "audio/wav",
        name: "room.wav",
        path: "C:/PadPilot/media/impulse-responses/0123456789abcdef0123456789abcdef.wav",
      };
    });

    try {
      const result = render(() => renderConvolverNodeEditor({
        controls: definition.controls,
        config,
        name: definition.defaultName,
        nodeFrame: null,
        updateControl: (key, value, commit) => updates.push([key, value, commit]),
        visualizer: null,
      }));
      const input = requireElement(result.container.querySelector("input[type=file]"), HTMLInputElement);
      fireEvent.change(input, { target: { files: [new File(["room"], "room.wav", { type: "audio/wav" })] } });
      await waitFor(() => expect(updates).toEqual([
        ["irSourcePath", "C:/PadPilot/media/impulse-responses/0123456789abcdef0123456789abcdef.wav", true],
        ["irSourceName", "room.wav", true],
        ["irId", "0123456789abcdef0123456789abcdef", true],
      ]));
    } finally {
      IO.importFile = originalImport;
    }
  });
});
