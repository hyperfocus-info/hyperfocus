import { describe, expect, it } from "bun:test";
import { fromBinary } from "@bufbuild/protobuf";
import { base64ToBytes } from "../../proto/base64";
import { PresetSaveRequestSchema } from "../../proto/generated/bridge-pb";
import {
  FX_CHAIN_SCHEMA_VERSION,
  FxNodeType,
  MAX_CHAINS,
  MAX_NODES_PER_CHAIN,
  NODE_LIBRARY,
  createChainState,
  createDefaultFxChainState,
  createEmptyVisualizerFrame,
  createNode,
  decodeFxChainState,
  encodeFxChainState,
  encodePresetSaveMessage,
  normalizeFxChainState,
} from "./fx-chain-state";
import { createDefaultNodeState, syncNodeLegacyParams } from "./node-registry/registry";

describe("fx chain state", () => {
  it("creates the default typed FX snapshot with the expected schema and starter graph", () => {
    const state = createDefaultFxChainState();

    expect(state.schemaVersion).toBe(FX_CHAIN_SCHEMA_VERSION);
    expect(state.revision).toBe(1n);
    expect(state.chains).toHaveLength(1);
    expect(state.chains[0]?.nodes.length).toBeGreaterThan(0);
    expect(state.master!.wetDry).toBe(1);
    expect(NODE_LIBRARY.some((entry) => entry.type === FxNodeType.CONVOLVER)).toBe(true);
    expect(NODE_LIBRARY.some((entry) => entry.type === FxNodeType.PHASER)).toBe(true);
    expect(NODE_LIBRARY.some((entry) => entry.type === FxNodeType.ROTARY_SPEAKER)).toBe(true);
    expect(NODE_LIBRARY.some((entry) => entry.type === FxNodeType.PITCH_DRIFT)).toBe(true);
  });

  it("normalizes oversized chain graphs and clamps node counts per chain", () => {
    const blueprint = NODE_LIBRARY[0]!;
    const chains = Array.from({ length: MAX_CHAINS + 3 }, (_, chainIndex) =>
      createChainState(
        chainIndex + 1,
        `Chain ${chainIndex + 1}`,
        chainIndex,
        Array.from({ length: MAX_NODES_PER_CHAIN + 2 }, (_, nodeIndex) => createNode(blueprint, nodeIndex + 1, nodeIndex)),
        1.5,
      ),
    );

    const normalized = normalizeFxChainState({
      ...createDefaultFxChainState(),
      chains,
    });

    expect(normalized.chains).toHaveLength(MAX_CHAINS);
    expect(normalized.chains.every((chain) => chain.nodes.length <= MAX_NODES_PER_CHAIN)).toBe(true);
    expect(normalized.chains.every((chain) => chain.mix <= 1)).toBe(true);
  });

  it("round-trips encoded state and preset save payloads through the public helpers", () => {
    const state = createDefaultFxChainState();
    state.master!.wetDry = 0.42;

    const decoded = decodeFxChainState(encodeFxChainState(state));
    expect(decoded.master!.wetDry).toBeCloseTo(0.42, 5);

    const presetSave = fromBinary(PresetSaveRequestSchema, base64ToBytes(encodePresetSaveMessage("Demo Preset", state)));
    expect(presetSave.name).toBe("Demo Preset");
    expect(presetSave.preset?.name).toBe("Demo Preset");
    expect(presetSave.preset?.moduleId).toBe("fx");
  });

  it("preserves a fully dry node mix through persisted-state normalization", () => {
    const state = createDefaultFxChainState();
    state.chains[0]!.nodes[0]!.mix = 0;

    const decoded = decodeFxChainState(encodeFxChainState(state));

    expect(decoded.chains[0]!.nodes[0]!.mix).toBe(0);
  });

  it("normalizes loaded delay-bearing sync divisions without limiting rate sync", () => {
    const createTypedNode = (type: FxNodeType, id: number) =>
      createNode(NODE_LIBRARY.find((entry) => entry.type === type) ?? NODE_LIBRARY[0]!, id, id - 1);
    const delay = createTypedNode(FxNodeType.DELAY, 1);
    const reverb = createTypedNode(FxNodeType.REVERB, 2);
    const chorus = createTypedNode(FxNodeType.CHORUS, 3);

    if (delay.config.case === "delayConfig") {
      delay.config.value.timeSync!.enabled = true;
      delay.config.value.timeSync!.divisionIndex = 19;
    }
    if (reverb.config.case === "reverbConfig") {
      reverb.config.value.preDelaySync!.enabled = true;
      reverb.config.value.preDelaySync!.divisionIndex = 19;
      reverb.config.value.modulationSpeedSync!.enabled = true;
      reverb.config.value.modulationSpeedSync!.divisionIndex = 19;
    }
    if (chorus.config.case === "chorusConfig") {
      chorus.config.value.rateSync!.enabled = true;
      chorus.config.value.rateSync!.divisionIndex = 19;
      chorus.config.value.voiceDelaySync!.enabled = true;
      chorus.config.value.voiceDelaySync!.divisionIndex = 19;
    }
    syncNodeLegacyParams(delay);
    syncNodeLegacyParams(reverb);
    syncNodeLegacyParams(chorus);

    const normalized = normalizeFxChainState({
      ...createDefaultFxChainState(),
      chains: [createChainState(1, "Sync limits", 0, [delay, reverb, chorus], 1)],
    });
    const [normalizedDelay, normalizedReverb, normalizedChorus] = normalized.chains[0]!.nodes;

    expect(normalizedDelay?.config.case).toBe("delayConfig");
    expect(normalizedDelay?.config.case === "delayConfig" ? normalizedDelay.config.value.timeSync?.divisionIndex : -1).toBe(10);
    expect(normalizedDelay?.legacyParams.find((param) => param.parameterId === 5)?.maxValue).toBe(10);
    expect(normalizedReverb?.config.case === "reverbConfig" ? normalizedReverb.config.value.preDelaySync?.divisionIndex : -1).toBe(10);
    expect(normalizedReverb?.config.case === "reverbConfig" ? normalizedReverb.config.value.modulationSpeedSync?.divisionIndex : -1).toBe(19);
    expect(normalizedReverb?.legacyParams.find((param) => param.parameterId === 6)?.maxValue).toBe(10);
    expect(normalizedReverb?.legacyParams.find((param) => param.parameterId === 9)?.maxValue).toBe(19);
    expect(normalizedChorus?.config.case === "chorusConfig" ? normalizedChorus.config.value.voiceDelaySync?.divisionIndex : -1).toBe(10);
    expect(normalizedChorus?.config.case === "chorusConfig" ? normalizedChorus.config.value.rateSync?.divisionIndex : -1).toBe(19);
    expect(normalizedChorus?.legacyParams.find((param) => param.parameterId === 8)?.maxValue).toBe(10);
    expect(normalizedChorus?.legacyParams.find((param) => param.parameterId === 5)?.maxValue).toBe(19);
  });

  it("keeps all newly truthful FX nodes addable and enabled", () => {
    const compatibilityTypes = [
      FxNodeType.CONVOLVER,
      FxNodeType.PHASER,
      FxNodeType.ROTARY_SPEAKER,
      FxNodeType.PITCH_DRIFT,
    ];
    const nodes = compatibilityTypes.map((type, index) => createDefaultNodeState(type, index + 1, index));
    expect(nodes.map((node) => node.bypassed)).toEqual([false, false, false, false]);
    const normalized = normalizeFxChainState({
      ...createDefaultFxChainState(),
      chains: [createChainState(1, "Legacy nodes", 0, nodes, 1)],
    });

    expect(normalized.chains[0]?.nodes.map((node) => node.type)).toEqual(compatibilityTypes);
    expect(normalized.chains[0]?.nodes.map((node) => node.bypassed)).toEqual([false, false, false, false]);
    expect(normalized.chains[0]?.nodes.map((node) => node.config.case)).toEqual([
      "convolverConfig",
      "phaserConfig",
      "rotarySpeakerConfig",
      "pitchDriftConfig",
    ]);
  });

  it("creates an empty visualizer frame with silent stereo defaults", () => {
    const frame = createEmptyVisualizerFrame();

    expect(frame.masterInputPeakDbLeft).toBe(-120);
    expect(frame.masterInputPeakDbRight).toBe(-120);
    expect(frame.masterOutputPeakDbLeft).toBe(-120);
    expect(frame.masterOutputPeakDbRight).toBe(-120);
    expect(frame.nodeFrames).toHaveLength(0);
  });
});
