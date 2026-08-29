import { toBinary } from "@bufbuild/protobuf";
import path from "node:path";
import { encodeCompactFxPresetCode } from "../ui/src/modules/fx/fx-compact-preset";
import {
  FxNodeType,
  NODE_LIBRARY,
  createChainState,
  createDefaultFxChainState,
  createMasterState,
  createNode,
  createPresetFile,
} from "../ui/src/modules/fx/fx-chain-state";
import { syncNodeLegacyParams } from "../ui/src/modules/fx/node-registry/registry";
import { PresetFileSchema } from "../ui/src/proto/generated/fx-chain-pb";

function createUnityState() {
  const state = createDefaultFxChainState();
  state.selectedPresetId = "";
  state.master = createMasterState(0, 0, 1, 0);
  state.chains = Array.from({ length: 8 }, (_, index) =>
    createChainState(index + 1, `Unity ${index + 1}`, index, [], 1),
  );
  state.modulationRoutes = [];
  return state;
}

function createControlsState() {
  const state = createDefaultFxChainState();
  const eqBlueprint = NODE_LIBRARY.find((entry) => entry.type === FxNodeType.EQ);
  if (!eqBlueprint) {
    throw new Error("FX EQ blueprint is unavailable.");
  }

  const eqNode = createNode(eqBlueprint, 1, 0);
  eqNode.name = "997 Hz State Check";
  eqNode.mix = 1;
  if (eqNode.config.case !== "eqConfig" || !eqNode.config.value.bands[0]) {
    throw new Error("FX EQ defaults are unavailable.");
  }
  eqNode.config.value.bands[0].enabled = true;
  eqNode.config.value.bands[0].frequencyHz = 997;
  eqNode.config.value.bands[0].gainDb = 12;
  eqNode.config.value.bands[0].q = 1.1;
  eqNode.config.value.bands[0].type = "Bell";
  syncNodeLegacyParams(eqNode);

  state.selectedPresetId = "";
  state.master = createMasterState(0, 0, 1, 0);
  state.chains = [createChainState(1, "FL State Check", 0, [eqNode], 1)];
  state.modulationRoutes = [];
  return state;
}

export function createFlStudioValidationPresets() {
  const definitions = [
    { id: "fl-validation-unity", name: "FL Validation - Unity", state: createUnityState() },
    { id: "fl-validation-controls", name: "FL Validation - Controls", state: createControlsState() },
  ];

  return definitions.map((definition) => ({
    ...definition,
    bytes: toBinary(PresetFileSchema, createPresetFile(definition.name, definition.state, definition.id)),
    code: encodeCompactFxPresetCode(definition.name, definition.state, definition.id),
  }));
}

export async function writeFlStudioValidationPresets(outputDirectory: string) {
  const presets = createFlStudioValidationPresets();
  for (const preset of presets) {
    await Bun.write(path.join(outputDirectory, `${preset.id}.preset`), preset.bytes);
    await Bun.write(path.join(outputDirectory, `${preset.id}.preset-code.txt`), `${preset.code}\n`);
  }
  return presets;
}

async function main() {
  const outputDirectory = path.join(path.resolve(import.meta.dir, ".."), "validation", "fl-studio");
  const presets = await writeFlStudioValidationPresets(outputDirectory);
  console.log(`Wrote ${presets.length} FL Studio validation presets to ${outputDirectory}.`);
}

if (import.meta.main) {
  await main();
}
