import { create } from "@bufbuild/protobuf";
import { FxNodeType, NodeStateSchema, type NodeState } from "../../../proto/generated/fx-chain-pb";
import { AutoPanNodeDefinition } from "./definitions/auto-pan-node";
import { BitcrusherNodeDefinition } from "./definitions/bitcrusher-node";
import { ChorusNodeDefinition } from "./definitions/chorus-node";
import { CompressorNodeDefinition } from "./definitions/compressor-node";
import { ConvolverNodeDefinition } from "./definitions/convolver-node";
import { DelayNodeDefinition } from "./definitions/delay-node";
import { EqNodeDefinition } from "./definitions/eq-node";
import { ExciterNodeDefinition } from "./definitions/exciter-node";
import { NoiseGateNodeDefinition } from "./definitions/noise-gate-node";
import { PhaserNodeDefinition } from "./definitions/phaser-node";
import { PitchDriftNodeDefinition } from "./definitions/pitch-drift-node";
import { ReverbNodeDefinition } from "./definitions/reverb-node";
import { ReverseNodeDefinition } from "./definitions/reverse-node";
import { RotarySpeakerNodeDefinition } from "./definitions/rotary-speaker-node";
import { StereoImagerNodeDefinition } from "./definitions/stereo-imager-node";
import { SaturationNodeDefinition } from "./definitions/saturation-node";
import { TapeSaturationNodeDefinition } from "./definitions/tape-saturation-node";
import { TransientShaperNodeDefinition } from "./definitions/transient-shaper-node";
import { TremoloNodeDefinition } from "./definitions/tremolo-node";
import { type AnyNodeConfig, type FxNodeDefinition } from "./types";

export const FX_NODE_REGISTRY = [
  CompressorNodeDefinition,
  EqNodeDefinition,
  TransientShaperNodeDefinition,
  NoiseGateNodeDefinition,
  ConvolverNodeDefinition,
  DelayNodeDefinition,
  ReverbNodeDefinition,
  TapeSaturationNodeDefinition,
  BitcrusherNodeDefinition,
  ExciterNodeDefinition,
  ChorusNodeDefinition,
  PhaserNodeDefinition,
  AutoPanNodeDefinition,
  RotarySpeakerNodeDefinition,
  StereoImagerNodeDefinition,
  PitchDriftNodeDefinition,
  ReverseNodeDefinition,
  TremoloNodeDefinition,
  SaturationNodeDefinition,
] as const;

const FX_NODE_COMPATIBILITY_DEFINITIONS = [] as const;
const FX_ADDABLE_NODE_TYPES = new Set<FxNodeType>(FX_NODE_REGISTRY.map((definition) => definition.type));

const FX_NODE_DEFINITION_MAP = new Map<FxNodeType, FxNodeDefinition<any, any>>(
  [...FX_NODE_REGISTRY, ...FX_NODE_COMPATIBILITY_DEFINITIONS].map((definition) => [definition.type, definition])
);

export function getNodeDefinition(type: FxNodeType) {
  const definition: FxNodeDefinition<any, any> =
    FX_NODE_DEFINITION_MAP.get(type) ?? DelayNodeDefinition;
  return definition;
}

export function getNodeName(type: FxNodeType) {
  return getNodeDefinition(type).defaultName;
}

export function isFxNodeTypeAddable(type: FxNodeType) {
  return FX_ADDABLE_NODE_TYPES.has(type);
}

export function getDefaultAddNodeType() {
  return FxNodeType.DELAY;
}

export function createDefaultNodeState(type: FxNodeType, id: number, order: number, name?: string) {
  const definition = getNodeDefinition(type);
  const config = definition.createDefaultConfig() as AnyNodeConfig;
  return create(NodeStateSchema, {
    id,
    type: definition.type,
    name: name ?? definition.defaultName,
    order,
    bypassed: !isFxNodeTypeAddable(definition.type),
    legacyParams: definition.createLegacyParams(config),
    muted: false,
    solo: false,
    mix: 1,
    selectedPresetId: "",
    config: {
      case: definition.configCase,
      value: config,
    } as any,
  });
}

export function syncNodeLegacyParams(node: NodeState) {
  const definition = getNodeDefinition(node.type);
  const config = resolveNodeConfig(node);
  node.legacyParams = definition.createLegacyParams(config);
  return node;
}

export function resolveNodeConfig(node: NodeState) {
  const definition = getNodeDefinition(node.type);
  if (node.config.case === definition.configCase) {
    return node.config.value as AnyNodeConfig;
  }

  const nextConfig = definition.createDefaultConfig();
  node.config = {
    case: definition.configCase,
    value: nextConfig,
  } as any;
  return nextConfig;
}

export function findNodeControlDefinition(type: FxNodeType, key: string) {
  const definition = getNodeDefinition(type);
  return definition.controls.find((control) => control.key === key);
}
