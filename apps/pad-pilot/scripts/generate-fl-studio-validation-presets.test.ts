import { expect, it } from "bun:test";
import { fromBinary } from "@bufbuild/protobuf";
import { PresetFileSchema } from "../ui/src/proto/generated/fx-chain-pb";
import { decodeCompactFxPresetCode } from "../ui/src/modules/fx/fx-compact-preset";
import { createFlStudioValidationPresets } from "./generate-fl-studio-validation-presets";

it("builds deterministic protobuf presets for FL unity and control fixtures", () => {
  const presets = createFlStudioValidationPresets();
  expect(presets).toHaveLength(2);

  const unity = presets.find((preset) => preset.id === "fl-validation-unity")!;
  const unityEnvelope = fromBinary(PresetFileSchema, unity.bytes);
  const unityState = decodeCompactFxPresetCode(unity.code).state;
  expect(unityEnvelope.name).toBe("FL Validation - Unity");
  expect(unityState.chains).toHaveLength(8);
  expect(unityState.chains.every((chain) => chain.nodes.length === 0 && chain.mix === 1 && !chain.muted && !chain.solo)).toBe(true);
  expect(unityState.master).toMatchObject({ inputGainDb: 0, outputGainDb: 0, wetDry: 1 });

  const controls = presets.find((preset) => preset.id === "fl-validation-controls")!;
  const controlsState = decodeCompactFxPresetCode(controls.code).state;
  expect(controlsState.chains).toHaveLength(1);
  expect(controlsState.chains[0]?.mix).toBe(1);
  expect(controlsState.chains[0]?.nodes).toHaveLength(1);
  const node = controlsState.chains[0]!.nodes[0]!;
  expect(node.config.case).toBe("eqConfig");
  expect(node.config.case === "eqConfig" ? node.config.value.bands[0]?.frequencyHz : 0).toBe(997);
  expect(node.config.case === "eqConfig" ? node.config.value.bands[0]?.gainDb : 0).toBe(12);
  expect(node.config.case === "eqConfig" ? node.config.value.bands[0]?.q : 0).toBeCloseTo(1.1, 5);
});
