import { CompressorNodeConfigSchema, EqNodeConfigSchema, TransientShaperNodeConfigSchema, NoiseGateNodeConfigSchema, DelayNodeConfigSchema, ReverbNodeConfigSchema, ConvolverNodeConfigSchema, TapeSaturationNodeConfigSchema, BitcrusherNodeConfigSchema, ExciterNodeConfigSchema, ChorusNodeConfigSchema, PhaserNodeConfigSchema, AutoPanNodeConfigSchema, RotarySpeakerNodeConfigSchema, StereoImagerNodeConfigSchema, PitchDriftNodeConfigSchema, ReverseNodeConfigSchema, TremoloNodeConfigSchema, SaturationNodeConfigSchema } from "../../../proto/generated/fx-chain-pb";
import { create, fromBinary, toBinary, isMessage, type DescMessage, type MessageShape, type Message } from "@bufbuild/protobuf";
import type { GenMessage } from "@bufbuild/protobuf/codegenv2";
import { base64ToBytes, bytesToBase64 } from "../../../proto/base64";
import { NodeParamStateSchema, type FxNodeType, type NodeParamState, type NodeState, type NodeVisualizerFrame } from "../../../proto/generated/fx-chain-pb";
import type { TimingSyncValueMode } from "../timing-sync";

export type AnyNodeConfig = Message<string>;

export type NodeConfigCase = Exclude<NodeState["config"]["case"], undefined>;
export type FxNodeControlValue = number | string | boolean;

export type FxNodeControlOption = {
  label: string;
  value: string;
};

export type FxNodeControlDefinition<TConfig = any> = {
  key: string;
  label: string;
  getValue: (config: TConfig) => FxNodeControlValue;
  setValue: (config: TConfig, value: FxNodeControlValue) => void;
  kind?: "knob" | "toggle" | "select";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: FxNodeControlOption[];
  timingSync?: FxNodeTimingSyncDefinition<TConfig>;
};

export type FxNodeTimingSyncDefinition<TConfig = any> = {
  valueMode: TimingSyncValueMode;
  maximumDivisionIndex?: number;
  freeParamId: number;
  syncEnabledParamId: number;
  syncDivisionParamId: number;
  getSyncEnabled: (config: TConfig) => boolean;
  setSyncEnabled: (config: TConfig, enabled: boolean) => void;
  getDivisionIndex: (config: TConfig) => number;
  setDivisionIndex: (config: TConfig, divisionIndex: number) => void;
};

export type FxNodeDefinition<TConfig = any, TVisualizer = unknown> = {
  type: FxNodeType;
  defaultName: string;
  configCase: NodeConfigCase;
  createDefaultConfig: () => TConfig;
  createLegacyParams: (config: TConfig) => NodeParamState[];
  controls: FxNodeControlDefinition<TConfig>[];
  rack: {
    leadingControlKeys: string[];
    trailingControlKeys?: string[];
  };
  focus: {
    inlineControlKeys: string[];
  };
  preset: {
    serialize: (config: TConfig) => string;
    deserialize: (input: string) => TConfig;
  };
  visualizer: {
    selectPayload: (frame: NodeVisualizerFrame) => TVisualizer | null;
  };
};

type CreateNodeDefinitionOptions<TConfig extends Message = Message, TVisualizer = unknown> = {
  type: FxNodeType;
  defaultName: string;
  configCase: NodeConfigCase;
  configSchema: GenMessage<TConfig>;
  createDefaultConfig: () => TConfig;
  createLegacyParams: (config: TConfig) => NodeParamState[];
  rackControls: FxNodeControlDefinition<TConfig>[];
  focusControls?: FxNodeControlDefinition<TConfig>[];
  selectPayload: (frame: NodeVisualizerFrame) => TVisualizer | null;
};

/**
 * Creates a serializable FX node definition used by the registry and UI shells.
 */
export function createNodeDefinition<TConfig extends Message = Message, TVisualizer = unknown>(
  options: CreateNodeDefinitionOptions<TConfig, TVisualizer>,
) {
  const controlsByKey = new Map<string, FxNodeControlDefinition<TConfig>>();
  for (const control of [...options.rackControls, ...(options.focusControls ?? options.rackControls)]) {
    if (!controlsByKey.has(control.key)) {
      controlsByKey.set(control.key, control);
    }
  }
  const controls = [...controlsByKey.values()];
  const inlineControlKeys = [...new Set((options.focusControls ?? options.rackControls).map((control) => control.key))];

  return {
    type: options.type,
    defaultName: options.defaultName,
    configCase: options.configCase,
    createDefaultConfig: options.createDefaultConfig,
    createLegacyParams: options.createLegacyParams,
    controls,
    rack: {
      leadingControlKeys: options.rackControls.map((control) => control.key),
    },
    focus: {
      inlineControlKeys,
    },
    preset: {
      serialize: (config: TConfig) => bytesToBase64(toBinary(options.configSchema, config)),
      deserialize: (input: string) => fromBinary(options.configSchema, base64ToBytes(input)),
    },
    visualizer: {
      selectPayload: options.selectPayload,
    },
  };
}

/**
 * Creates a numeric control definition for a mutable protobuf config field.
 */
export function createNumberControl<TConfig = any>(
  key: string,
  label: string,
  getValue: (config: TConfig) => number,
  setValue: (config: TConfig, value: number) => void,
  options: Pick<FxNodeControlDefinition<TConfig>, "max" | "min" | "step" | "unit" | "timingSync"> = {},
) {
  return {
    key,
    label,
    kind: "knob" as const,
    getValue,
    setValue: (config: TConfig, value: FxNodeControlValue) => setValue(config, Number(value)),
    ...options,
  };
}

/**
 * Creates a boolean toggle definition for a mutable protobuf config field.
 */
export function createToggleControl<TConfig = any>(
  key: string,
  label: string,
  getValue: (config: TConfig) => boolean,
  setValue: (config: TConfig, value: boolean) => void,
) {
  return {
    key,
    label,
    kind: "toggle" as const,
    getValue,
    setValue: (config: TConfig, value: FxNodeControlValue) => setValue(config, Boolean(value)),
  };
}

/**
 * Creates a string select control definition for a mutable protobuf config field.
 */
export function createSelectControl<TConfig = any>(
  key: string,
  label: string,
  options: FxNodeControlOption[],
  getValue: (config: TConfig) => string,
  setValue: (config: TConfig, value: string) => void,
) {
  return {
    key,
    label,
    kind: "select" as const,
    options,
    getValue,
    setValue: (config: TConfig, value: FxNodeControlValue) => setValue(config, String(value)),
  };
}

/**
 * Creates a legacy param message used to keep old transport and migration paths alive.
 */
export function createLegacyParamState(
  parameterId: number,
  label: string,
  value: number,
  minValue: number,
  maxValue: number,
  unit = "",
) {
  return create(NodeParamStateSchema, {
    parameterId,
    label,
    value,
    minValue,
    maxValue,
    defaultValue: value,
    unit,
  });
}

/** Narrow a foreign message using the protobuf runtime discriminator. */
export function requireNodeMessage<D extends DescMessage>(value: unknown, schema: D): MessageShape<D> {
 if (!isMessage(value, schema)) throw new TypeError("Unexpected FX message: " + schema.typeName);
 return value;
}

export function nodeConfigValue(kind: NodeConfigCase, value: unknown): NodeState["config"] {
 switch(kind) { case "compressorConfig": return { case: "compressorConfig", value: requireNodeMessage(value, CompressorNodeConfigSchema) };
case "eqConfig": return { case: "eqConfig", value: requireNodeMessage(value, EqNodeConfigSchema) };
case "transientShaperConfig": return { case: "transientShaperConfig", value: requireNodeMessage(value, TransientShaperNodeConfigSchema) };
case "noiseGateConfig": return { case: "noiseGateConfig", value: requireNodeMessage(value, NoiseGateNodeConfigSchema) };
case "delayConfig": return { case: "delayConfig", value: requireNodeMessage(value, DelayNodeConfigSchema) };
case "reverbConfig": return { case: "reverbConfig", value: requireNodeMessage(value, ReverbNodeConfigSchema) };
case "convolverConfig": return { case: "convolverConfig", value: requireNodeMessage(value, ConvolverNodeConfigSchema) };
case "tapeSaturationConfig": return { case: "tapeSaturationConfig", value: requireNodeMessage(value, TapeSaturationNodeConfigSchema) };
case "bitcrusherConfig": return { case: "bitcrusherConfig", value: requireNodeMessage(value, BitcrusherNodeConfigSchema) };
case "exciterConfig": return { case: "exciterConfig", value: requireNodeMessage(value, ExciterNodeConfigSchema) };
case "chorusConfig": return { case: "chorusConfig", value: requireNodeMessage(value, ChorusNodeConfigSchema) };
case "phaserConfig": return { case: "phaserConfig", value: requireNodeMessage(value, PhaserNodeConfigSchema) };
case "autoPanConfig": return { case: "autoPanConfig", value: requireNodeMessage(value, AutoPanNodeConfigSchema) };
case "rotarySpeakerConfig": return { case: "rotarySpeakerConfig", value: requireNodeMessage(value, RotarySpeakerNodeConfigSchema) };
case "stereoImagerConfig": return { case: "stereoImagerConfig", value: requireNodeMessage(value, StereoImagerNodeConfigSchema) };
case "pitchDriftConfig": return { case: "pitchDriftConfig", value: requireNodeMessage(value, PitchDriftNodeConfigSchema) };
case "reverseConfig": return { case: "reverseConfig", value: requireNodeMessage(value, ReverseNodeConfigSchema) };
case "tremoloConfig": return { case: "tremoloConfig", value: requireNodeMessage(value, TremoloNodeConfigSchema) };
case "saturationConfig": return { case: "saturationConfig", value: requireNodeMessage(value, SaturationNodeConfigSchema) }; }
}
