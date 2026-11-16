import { isMessage } from "@bufbuild/protobuf";
import { nodeConfigValue } from "./node-registry/types";
import { requireNodeMessage } from "./node-registry/types";
import { ReverbNodeConfigSchema, CompressorNodeConfigSchema, EqNodeConfigSchema, TremoloNodeConfigSchema, PitchDriftNodeConfigSchema, AutoPanNodeConfigSchema, PhaserNodeConfigSchema, ChorusNodeConfigSchema, DelayNodeConfigSchema, ConvolverNodeConfigSchema } from "../../proto/generated/fx-chain-pb";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { bytesToBase64, base64ToBytes } from "../../proto/base64";
import { registerModuleStateCodec } from "../../proto/registry";
import {
  ChainPresetFileSchema,
  ChainStateSchema,
  EqBandConfigSchema,
  FxChainStateSchema,
  FxModulationRouteSchema,
  FxModulatorStateSchema,
  FxNodeType,
  MasterStateSchema,
  NodeParamStateSchema,
  NodePresetFileSchema,
  NodeStateSchema,
  PresetFileSchema,
  TempoSyncStateSchema,
  VisualizerFrameSchema,
  type AutoPanNodeConfig,
  type BitcrusherNodeConfig,
  type ChainPresetFile,
  type ChainState,
  type ChorusNodeConfig,
  type CompressorNodeConfig,
  type ConvolverNodeConfig,
  type DelayNodeConfig,
  type EqNodeConfig,
  type ExciterNodeConfig,
  type FxChainState,
  type FxModulationRoute,
  type FxModulatorState,
  type MasterState,
  type NoiseGateNodeConfig,
  type NodePresetFile,
  type NodeState,
  type NodeVisualizerFrame,
  type PhaserNodeConfig,
  type PitchDriftNodeConfig,
  type PresetFile,
  type ReverbNodeConfig,
  type ReverseNodeConfig,
  type RotarySpeakerNodeConfig,
  type StereoImagerNodeConfig,
  type SaturationNodeConfig,
  type TapeSaturationNodeConfig,
  type TransientShaperNodeConfig,
  type TremoloNodeConfig,
  type VisualizerFrame,
} from "../../proto/generated/fx-chain-pb";
import {
  ActiveModuleStateFrameSchema,
  HostSyncFrameSchema,
  InputStateFrameSchema,
  NavigationFrameSchema,
  PresetSaveRequestSchema,
  SetModuleStateRequestSchema,
  type ActiveModuleStateFrame,
  type HostSyncFrame,
  type InputStateFrame,
  type NavigationFrame,
  type PresetSaveRequest,
  type SetModuleStateRequest,
} from "../../proto/generated/bridge-pb";
import { clamp } from "../../utils/math";
import { FX_NODE_REGISTRY, createDefaultNodeState, getDefaultAddNodeType, getNodeDefinition, isFxNodeTypeAddable, resolveNodeConfig, syncNodeLegacyParams } from "./node-registry/registry";
import { clampTimingSyncDivisionIndex, findNearestTimingSyncDivisionIndex, type TimingSyncValueMode } from "./timing-sync";

export { FxNodeType };
export type {
  ActiveModuleStateFrame,
  AutoPanNodeConfig,
  BitcrusherNodeConfig,
  ChainPresetFile,
  ChainState,
  ChorusNodeConfig,
  CompressorNodeConfig,
  ConvolverNodeConfig,
  DelayNodeConfig,
  EqNodeConfig,
  ExciterNodeConfig,
  FxChainState,
  FxModulationRoute,
  FxModulatorState,
  HostSyncFrame,
  InputStateFrame,
  MasterState,
  NavigationFrame,
  NoiseGateNodeConfig,
  NodePresetFile,
  NodeState,
  NodeVisualizerFrame,
  PhaserNodeConfig,
  PitchDriftNodeConfig,
  PresetFile,
  PresetSaveRequest,
  ReverbNodeConfig,
  ReverseNodeConfig,
  RotarySpeakerNodeConfig,
  SetModuleStateRequest,
  StereoImagerNodeConfig,
  SaturationNodeConfig,
  TapeSaturationNodeConfig,
  TransientShaperNodeConfig,
  TremoloNodeConfig,
  VisualizerFrame,
};

export const MAX_CHAINS = 8;
export const MAX_NODES_PER_CHAIN = 8;
export const FX_CHAIN_SCHEMA_VERSION = 4;
export const MAX_FX_MODULATORS = 2;
export const MAX_FX_MODULATION_ROUTES = 16;

export type NodeBlueprint = {
  defaultName: string;
  type: FxNodeType;
};

export const NODE_LIBRARY: NodeBlueprint[] = FX_NODE_REGISTRY.map((definition) => ({
  defaultName: definition.defaultName,
  type: definition.type,
}));

function getLegacyParamValue(node: NodeState, parameterId: number, fallback: number) {
  return node.legacyParams.find((param) => param.parameterId === parameterId)?.value ?? fallback;
}

function normalizeTempoSyncState(
  input: { enabled: boolean; divisionIndex: number } | undefined,
  freeValue: number,
  mode: TimingSyncValueMode,
  maximumDivisionIndex?: number,
) {
  return create(TempoSyncStateSchema, {
    enabled: Boolean(input?.enabled),
    divisionIndex: clampTimingSyncDivisionIndex(
      input?.divisionIndex ?? findNearestTimingSyncDivisionIndex(freeValue, mode),
      maximumDivisionIndex,
    ),
  });
}

function migrateLegacyNodeConfig(node: NodeState) {
  const definition = getNodeDefinition(node.type);
  const config = resolveNodeConfig(node);

  switch (node.type) {
    case FxNodeType.COMPRESSOR: {
      const next = requireNodeMessage(config, CompressorNodeConfigSchema);
      next.thresholdDb = getLegacyParamValue(node, 1, next.thresholdDb);
      next.ratio = getLegacyParamValue(node, 2, next.ratio);
      next.makeupDb = getLegacyParamValue(node, 3, next.makeupDb);
      next.attackMs = getLegacyParamValue(node, 4, next.attackMs);
      next.releaseMs = getLegacyParamValue(node, 5, next.releaseMs);
      break;
    }
    case FxNodeType.CONVOLVER: {
      const next = requireNodeMessage(config, ConvolverNodeConfigSchema);
      next.irStretch = getLegacyParamValue(node, 1, next.irStretch);
      next.blend = getLegacyParamValue(node, 2, next.blend);
      break;
    }
    case FxNodeType.DELAY: {
      const next = requireNodeMessage(config, DelayNodeConfigSchema);
      next.time = getLegacyParamValue(node, 1, next.time);
      next.feedback = getLegacyParamValue(node, 2, next.feedback);
      next.focusMix = getLegacyParamValue(node, 3, next.focusMix);
      next.timeSync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 4, next.timeSync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 5, next.timeSync?.divisionIndex ?? 8),
        },
        next.time,
        "period-seconds",
        10,
      );
      next.lowCutHz = getLegacyParamValue(node, 6, next.lowCutHz);
      next.highCutHz = getLegacyParamValue(node, 7, next.highCutHz);
      next.width = getLegacyParamValue(node, 8, next.width);
      next.saturation = getLegacyParamValue(node, 9, next.saturation);
      break;
    }
    case FxNodeType.REVERB: {
      const next = requireNodeMessage(config, ReverbNodeConfigSchema);
      next.decay = getLegacyParamValue(node, 1, next.decay);
      next.size = getLegacyParamValue(node, 2, next.size);
      next.focusMix = getLegacyParamValue(node, 3, next.focusMix);
      next.preDelayMs = getLegacyParamValue(node, 4, next.preDelayMs);
      next.preDelaySync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 5, next.preDelaySync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 6, next.preDelaySync?.divisionIndex ?? 4),
        },
        next.preDelayMs,
        "period-ms",
        10,
      );
      next.modulationSpeedHz = getLegacyParamValue(node, 7, next.modulationSpeedHz);
      next.modulationSpeedSync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 8, next.modulationSpeedSync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 9, next.modulationSpeedSync?.divisionIndex ?? 8),
        },
        next.modulationSpeedHz,
        "period-hz",
      );
      break;
    }
    case FxNodeType.CHORUS: {
      const next = requireNodeMessage(config, ChorusNodeConfigSchema);
      next.rateHz = getLegacyParamValue(node, 1, next.rateHz);
      next.depth = getLegacyParamValue(node, 2, next.depth);
      next.feedback = getLegacyParamValue(node, 3, next.feedback);
      next.rateSync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 4, next.rateSync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 5, next.rateSync?.divisionIndex ?? 6),
        },
        next.rateHz,
        "period-hz",
      );
      next.voiceDelayMs = getLegacyParamValue(node, 6, next.voiceDelayMs);
      next.voiceDelaySync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 7, next.voiceDelaySync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 8, next.voiceDelaySync?.divisionIndex ?? 1),
        },
        next.voiceDelayMs,
        "period-ms",
        10,
      );
      break;
    }
    case FxNodeType.PHASER: {
      const next = requireNodeMessage(config, PhaserNodeConfigSchema);
      next.speedHz = getLegacyParamValue(node, 1, next.speedHz);
      next.centerFrequencyHz = getLegacyParamValue(node, 2, next.centerFrequencyHz);
      next.resonance = getLegacyParamValue(node, 3, next.resonance);
      next.speedSync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 4, next.speedSync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 5, next.speedSync?.divisionIndex ?? 6),
        },
        next.speedHz,
        "period-hz",
      );
      break;
    }
    case FxNodeType.AUTO_PAN: {
      const next = requireNodeMessage(config, AutoPanNodeConfigSchema);
      next.rateHz = getLegacyParamValue(node, 1, next.rateHz);
      next.amount = getLegacyParamValue(node, 2, next.amount);
      next.phaseOffset = getLegacyParamValue(node, 3, next.phaseOffset);
      next.rateSync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 4, next.rateSync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 5, next.rateSync?.divisionIndex ?? 9),
        },
        next.rateHz,
        "period-hz",
      );
      break;
    }
    case FxNodeType.PITCH_DRIFT: {
      const next = requireNodeMessage(config, PitchDriftNodeConfigSchema);
      next.depth = getLegacyParamValue(node, 1, next.depth);
      next.rateHz = getLegacyParamValue(node, 2, next.rateHz);
      next.rangeCents = getLegacyParamValue(node, 3, next.rangeCents);
      next.rateSync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 4, next.rateSync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 5, next.rateSync?.divisionIndex ?? 8),
        },
        next.rateHz,
        "period-hz",
      );
      break;
    }
    case FxNodeType.TREMOLO: {
      const next = requireNodeMessage(config, TremoloNodeConfigSchema);
      next.rateHz = getLegacyParamValue(node, 1, next.rateHz);
      next.depth = getLegacyParamValue(node, 2, next.depth);
      next.stereoPhaseOffset = getLegacyParamValue(node, 3, next.stereoPhaseOffset);
      next.rateSync = normalizeTempoSyncState(
        {
          enabled: getLegacyParamValue(node, 4, next.rateSync?.enabled ? 1 : 0) >= 0.5,
          divisionIndex: getLegacyParamValue(node, 5, next.rateSync?.divisionIndex ?? 8),
        },
        next.rateHz,
        "period-hz",
      );
      next.smoothing = getLegacyParamValue(node, 6, next.smoothing);
      break;
    }
    case FxNodeType.EQ: {
      const next = requireNodeMessage(config, EqNodeConfigSchema);
      const band = next.bands[0];
      if (band) {
        band.frequencyHz = getLegacyParamValue(node, 1, band.frequencyHz);
        band.gainDb = getLegacyParamValue(node, 2, band.gainDb);
        band.q = getLegacyParamValue(node, 3, band.q);
      }
      break;
    }
    default:
      break;
  }

  node.config = nodeConfigValue(definition.configCase, config);
  return syncNodeLegacyParams(node);
}

function normalizeNodeState(input: NodeState, order: number) {
  const normalizedType = input.type === FxNodeType.UNSPECIFIED ? getDefaultAddNodeType() : input.type;
  const definition = getNodeDefinition(normalizedType);
  const base = createDefaultNodeState(normalizedType, input.id || order + 1, order, input.name || undefined);
  base.name = input.name || base.name;
  base.bypassed = Boolean(input.bypassed) || !isFxNodeTypeAddable(normalizedType);
  base.muted = Boolean(input.muted);
  base.solo = Boolean(input.solo);
  base.mix = clamp(Number.isFinite(input.mix) ? input.mix : 1, 0, 1);
  base.selectedPresetId = input.selectedPresetId ?? "";

  const hasTypedConfig = input.config.case === definition.configCase;
  if (hasTypedConfig) {
    if (base.config.value && input.config.value) Object.assign(base.config.value, input.config.value);
  } else if (input.legacyParams.length > 0) {
    base.legacyParams = input.legacyParams.map((param) => create(NodeParamStateSchema, param));
  }

  const migrated = hasTypedConfig ? base : migrateLegacyNodeConfig(base);
  const config = resolveNodeConfig(migrated);
  if (migrated.type === FxNodeType.DELAY) {
    const typed = requireNodeMessage(config, DelayNodeConfigSchema);
    typed.timeSync = normalizeTempoSyncState(typed.timeSync, typed.time, "period-seconds", 10);
  } else if (migrated.type === FxNodeType.REVERB) {
    const typed = requireNodeMessage(config, ReverbNodeConfigSchema);
    typed.preDelaySync = normalizeTempoSyncState(typed.preDelaySync, typed.preDelayMs, "period-ms", 10);
    typed.modulationSpeedSync = normalizeTempoSyncState(typed.modulationSpeedSync, typed.modulationSpeedHz, "period-hz");
  } else if (migrated.type === FxNodeType.CHORUS) {
    const typed = requireNodeMessage(config, ChorusNodeConfigSchema);
    typed.rateSync = normalizeTempoSyncState(typed.rateSync, typed.rateHz, "period-hz");
    typed.voiceDelaySync = normalizeTempoSyncState(typed.voiceDelaySync, typed.voiceDelayMs, "period-ms", 10);
  } else if (migrated.type === FxNodeType.PHASER) {
    const typed = requireNodeMessage(config, PhaserNodeConfigSchema);
    typed.speedSync = normalizeTempoSyncState(typed.speedSync, typed.speedHz, "period-hz");
  } else if (migrated.type === FxNodeType.AUTO_PAN) {
    const typed = requireNodeMessage(config, AutoPanNodeConfigSchema);
    typed.rateSync = normalizeTempoSyncState(typed.rateSync, typed.rateHz, "period-hz");
  } else if (migrated.type === FxNodeType.PITCH_DRIFT) {
    const typed = requireNodeMessage(config, PitchDriftNodeConfigSchema);
    typed.rateSync = normalizeTempoSyncState(typed.rateSync, typed.rateHz, "period-hz");
  } else if (migrated.type === FxNodeType.TREMOLO) {
    const typed = requireNodeMessage(config, TremoloNodeConfigSchema);
    typed.rateSync = normalizeTempoSyncState(typed.rateSync, typed.rateHz, "period-hz");
  }
  for (const control of definition.controls) {
    if (control.kind === "toggle" || control.kind === "select") {
      continue;
    }

    const value = Number(control.getValue(config));
    if (Number.isFinite(value)) {
      const min = control.min ?? value;
      const max = control.max ?? value;
      control.setValue(config, clamp(value, min, max));
    }
  }

  return syncNodeLegacyParams(migrated);
}

function normalizeChainNodes(nodes: readonly NodeState[]) {
  const limited = nodes.slice(0, MAX_NODES_PER_CHAIN).map((node, index) => normalizeNodeState(create(NodeStateSchema, node), index));
  let soloLocked = false;
  return limited.map((node, index) => {
    const next = create(NodeStateSchema, {
      ...node,
      order: index,
    });
    if (next.solo) {
      if (soloLocked) {
        next.solo = false;
      }
      soloLocked = true;
    }
    return syncNodeLegacyParams(next);
  });
}

export function encodeNodeTargetId(chainId: number, nodeId: number, parameterId = 0) {
  return ((chainId & 0xff) << 16) | ((nodeId & 0xff) << 8) | (parameterId & 0xff);
}

export function createMasterState(inputGainDb = 0, outputGainDb = 0, wetDry = 1, gainReductionDb = 0) {
  return create(MasterStateSchema, {
    gainReductionDb,
    inputGainDb,
    outputGainDb,
    wetDry,
  });
}

export function createNode(blueprint: NodeBlueprint, id: number, order: number) {
  return createDefaultNodeState(blueprint.type, id, order, blueprint.defaultName);
}

export function createChainState(id: number, name: string, order: number, nodes: NodeState[], mix = id === 1 ? 0.8 : 0.65) {
  return create(ChainStateSchema, {
    id,
    name,
    order,
    mix,
    muted: false,
    solo: false,
    nodes: normalizeChainNodes(nodes),
  });
}

export function createDefaultFxChainState() {
  const eqNode = createNode(NODE_LIBRARY.find((entry) => entry.type === FxNodeType.EQ) ?? NODE_LIBRARY[0]!, 1, 0);
  eqNode.name = "Clean Tone";
  eqNode.mix = 1;
  const eqConfig = requireNodeMessage(resolveNodeConfig(eqNode), EqNodeConfigSchema);
  eqConfig.lowShelfGainDb = -1.5;
  eqConfig.highShelfGainDb = 2;
  eqConfig.bands = [
    create(EqBandConfigSchema, {
      enabled: true,
      frequencyHz: 150,
      gainDb: -1.5,
      q: 0.7,
      type: "LowShelf",
    }),
    create(EqBandConfigSchema, {
      enabled: true,
      frequencyHz: 8000,
      gainDb: 2,
      q: 0.7,
      type: "HighShelf",
    }),
  ];
  syncNodeLegacyParams(eqNode);

  const compressorNode = createNode(NODE_LIBRARY.find((entry) => entry.type === FxNodeType.COMPRESSOR) ?? NODE_LIBRARY[0]!, 2, 1);
  compressorNode.name = "Glue Comp";
  compressorNode.mix = 1;
  const compressorConfig = requireNodeMessage(resolveNodeConfig(compressorNode), CompressorNodeConfigSchema);
  compressorConfig.thresholdDb = -12;
  compressorConfig.ratio = 2;
  compressorConfig.makeupDb = 1.5;
  compressorConfig.attackMs = 15;
  compressorConfig.releaseMs = 120;
  compressorConfig.kneeDb = 0.5;
  compressorConfig.sidechainHpfHz = 80;
  syncNodeLegacyParams(compressorNode);

  const reverbNode = createNode(NODE_LIBRARY.find((entry) => entry.type === FxNodeType.REVERB) ?? NODE_LIBRARY[0]!, 3, 2);
  reverbNode.name = "Cinematic Hall";
  reverbNode.mix = 0.25;
  const reverbConfig = requireNodeMessage(resolveNodeConfig(reverbNode), ReverbNodeConfigSchema);
  reverbConfig.mode = "Hall";
  reverbConfig.decay = 3.2;
  reverbConfig.size = 85;
  reverbConfig.focusMix = 0.25;
  reverbConfig.damping = 4500;
  reverbConfig.preDelayMs = 20;
  reverbConfig.modulationSpeedHz = 0.4;
  reverbConfig.modulationDepth = 0.6;
  syncNodeLegacyParams(reverbNode);

  return create(FxChainStateSchema, {
    schemaVersion: FX_CHAIN_SCHEMA_VERSION,
    revision: 1n,
    selectedPresetId: "pad_pilot_init_default",
    master: createMasterState(),
    chains: [
      createChainState(1, "Lush Foundation", 0, [eqNode, compressorNode, reverbNode], 1),
    ],
    modulators: [
      create(FxModulatorStateSchema, {
        id: 1,
        enabled: true,
        shape: "Sine",
        rateHz: 0.25,
        rateSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 10 }),
        phaseOffset: 0,
      }),
      create(FxModulatorStateSchema, {
        id: 2,
        enabled: true,
        shape: "Triangle",
        rateHz: 0.125,
        rateSync: create(TempoSyncStateSchema, { enabled: true, divisionIndex: 12 }),
        phaseOffset: 0.5,
      }),
    ],
    modulationRoutes: [],
  });
}

export function cloneFxChainState(state: FxChainState) {
  return fromBinary(FxChainStateSchema, toBinary(FxChainStateSchema, state));
}

export function normalizeFxChainState(input: FxChainState | undefined) {
  const fallback = createDefaultFxChainState();
  if (!input) {
    return fallback;
  }

  const state = cloneFxChainState(input);
  if (state.schemaVersion < 4) {
    for (const chain of state.chains) {
      for (const node of chain.nodes) {
        if (node.config.case === "delayConfig") {
          node.config.value.lowCutHz = 110;
          node.config.value.highCutHz = 6800;
          node.config.value.width = 1;
          node.config.value.saturation = 0;
          node.config.value.character = "Clean";
        } else if (node.config.case === "eqConfig") {
          node.config.value.lowShelfFrequencyHz = 120;
          node.config.value.highShelfFrequencyHz = 8000;
        }
      }
    }
  }
  state.schemaVersion = FX_CHAIN_SCHEMA_VERSION;
  state.master = createMasterState(
    state.master?.inputGainDb ?? fallback.master!.inputGainDb,
    state.master?.outputGainDb ?? fallback.master!.outputGainDb,
    state.master?.wetDry ?? fallback.master!.wetDry,
    state.master?.gainReductionDb ?? fallback.master!.gainReductionDb,
  );
  state.chains = state.chains.slice(0, MAX_CHAINS).map((chain, chainIndex) =>
    create(ChainStateSchema, {
      ...chain,
      order: chainIndex,
      mix: clamp(chain.mix || 0, 0, 1),
      nodes: normalizeChainNodes(chain.nodes),
    }),
  );
  const fallbackModulators = fallback.modulators;
  state.modulators = Array.from({ length: MAX_FX_MODULATORS }, (_, index) => {
    const inputModulator = state.modulators[index] ?? fallbackModulators[index]!;
    return create(FxModulatorStateSchema, {
      id: index + 1,
      enabled: inputModulator.enabled,
      shape: ["Sine", "Triangle", "Square", "Random"].includes(inputModulator.shape) ? inputModulator.shape : "Sine",
      rateHz: clamp(inputModulator.rateHz || fallbackModulators[index]!.rateHz, 0.01, 20),
      rateSync: normalizeTempoSyncState(inputModulator.rateSync, inputModulator.rateHz, "period-hz"),
      phaseOffset: clamp(inputModulator.phaseOffset, 0, 1),
    });
  });
  const nodeTargets = new Set(state.chains.flatMap((chain) => chain.nodes.map((node) => `${chain.id}:${node.id}`)));
  state.modulationRoutes = state.modulationRoutes
    .filter((route) => nodeTargets.has(`${route.chainId}:${route.nodeId}`) && route.modulatorId >= 1 && route.modulatorId <= MAX_FX_MODULATORS)
    .slice(0, MAX_FX_MODULATION_ROUTES)
    .map((route) => {
      const minimum = Math.min(route.minValue, route.maxValue);
      const maximum = Math.max(route.minValue, route.maxValue);
      return create(FxModulationRouteSchema, {
        ...route,
        depth: clamp(route.depth, -1, 1),
        minValue: minimum,
        maxValue: maximum,
        baseValue: clamp(route.baseValue, minimum, maximum),
      });
    });
  return state;
}

export function encodeFxChainState(state: FxChainState) {
  return toBinary(FxChainStateSchema, normalizeFxChainState(state));
}

export function decodeFxChainState(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return createDefaultFxChainState();
  }
  return normalizeFxChainState(fromBinary(FxChainStateSchema, bytes));
}

export function encodeFxChainStateBase64(state: FxChainState) {
  return bytesToBase64(encodeFxChainState(state));
}

export function decodeFxChainStateBase64(value: string) {
  return decodeFxChainState(base64ToBytes(value));
}

export function createPresetFile(name: string, state: FxChainState, presetId = "") {
  const normalized = normalizeFxChainState(state);
  return create(PresetFileSchema, {
    id: presetId,
    moduleId: "fx",
    name,
    state: encodeFxChainState(normalized),
    schemaVersion: FX_CHAIN_SCHEMA_VERSION,
  });
}

export function createChainPresetFile(name: string, chain: ChainState, presetId = "") {
  return create(ChainPresetFileSchema, {
    id: presetId,
    chainId: String(chain.id),
    name,
    chain: create(ChainStateSchema, chain),
    schemaVersion: FX_CHAIN_SCHEMA_VERSION,
  });
}

export function createNodePresetFile(name: string, node: NodeState, presetId = "") {
  return create(NodePresetFileSchema, {
    id: presetId,
    nodeType: node.type,
    name,
    node: create(NodeStateSchema, syncNodeLegacyParams(create(NodeStateSchema, node))),
    schemaVersion: FX_CHAIN_SCHEMA_VERSION,
  });
}

export function encodeChainPresetFile(chainPreset: ChainPresetFile) {
  return toBinary(ChainPresetFileSchema, chainPreset);
}

export function decodeChainPresetFile(bytes: Uint8Array) {
  return fromBinary(ChainPresetFileSchema, bytes);
}

export function encodeNodePresetFile(nodePreset: NodePresetFile) {
  return toBinary(NodePresetFileSchema, nodePreset);
}

export function decodeNodePresetFile(bytes: Uint8Array) {
  return fromBinary(NodePresetFileSchema, bytes);
}

export function createSetModuleStateMessage(moduleId: string, state: FxChainState) {
  const normalized = normalizeFxChainState(state);
  return create(SetModuleStateRequestSchema, {
    moduleId,
    payload: encodeFxChainState(normalized),
    revision: normalized.revision,
  });
}

export function encodePresetSaveMessage(name: string, state: FxChainState, presetId = "") {
  return bytesToBase64(
    toBinary(
      PresetSaveRequestSchema,
      create(PresetSaveRequestSchema, {
        name,
        preset: createPresetFile(name, state, presetId),
      }),
    ),
  );
}

export function decodeHostSyncFrameBase64(value: string) {
  return fromBinary(HostSyncFrameSchema, base64ToBytes(value));
}

export function decodeNavigationFrameBase64(value: string) {
  return fromBinary(NavigationFrameSchema, base64ToBytes(value));
}

export function decodeActiveModuleStateFrameBase64(value: string) {
  return fromBinary(ActiveModuleStateFrameSchema, base64ToBytes(value));
}

export function decodeInputStateFrameBase64(value: string) {
  return fromBinary(InputStateFrameSchema, base64ToBytes(value));
}

export function decodeVisualizerFrameBase64(value: string) {
  return fromBinary(VisualizerFrameSchema, base64ToBytes(value));
}

export function createEmptyVisualizerFrame() {
  return create(VisualizerFrameSchema, {
    sequence: 0n,
    masterInputPeakDb: -120,
    masterInputPeakDbLeft: -120,
    masterInputPeakDbRight: -120,
    masterOutputPeakDb: -120,
    masterOutputPeakDbLeft: -120,
    masterOutputPeakDbRight: -120,
    gainReductionDb: 0,
    taps: [],
    nodeFrames: [],
  });
}

registerModuleStateCodec("fx", { encode: encodeFxChainState, decode: decodeFxChainState }, readfxState);
registerModuleStateCodec("reverb", { encode: encodeFxChainState, decode: decodeFxChainState }, readfxState);

export function readfxState(value: unknown) { if (!isMessage(value, FxChainStateSchema)) throw new TypeError("Invalid fx state"); return fromBinary(FxChainStateSchema, toBinary(FxChainStateSchema, value)); }
