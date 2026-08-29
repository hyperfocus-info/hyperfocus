import { create, fromBinary, toBinary, type Message } from "@bufbuild/protobuf";
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

type CreateNodeDefinitionOptions<TConfig = any, TVisualizer = unknown> = {
  type: FxNodeType;
  defaultName: string;
  configCase: NodeConfigCase;
  configSchema: any;
  createDefaultConfig: () => TConfig;
  createLegacyParams: (config: TConfig) => NodeParamState[];
  rackControls: FxNodeControlDefinition<TConfig>[];
  focusControls?: FxNodeControlDefinition<TConfig>[];
  selectPayload: (frame: NodeVisualizerFrame) => TVisualizer | null;
};

/**
 * Creates a serializable FX node definition used by the registry and UI shells.
 */
export function createNodeDefinition<TConfig = any, TVisualizer = unknown>(
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
      serialize: (config) => bytesToBase64(toBinary(options.configSchema, config as any)),
      deserialize: (input) => fromBinary(options.configSchema, base64ToBytes(input)) as TConfig,
    },
    visualizer: {
      selectPayload: options.selectPayload,
    },
  } satisfies FxNodeDefinition<TConfig, TVisualizer>;
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
    kind: "knob",
    getValue,
    setValue: (config, value) => setValue(config, Number(value)),
    ...options,
  } satisfies FxNodeControlDefinition<TConfig>;
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
    kind: "toggle",
    getValue,
    setValue: (config, value) => setValue(config, Boolean(value)),
  } satisfies FxNodeControlDefinition<TConfig>;
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
    kind: "select",
    options,
    getValue,
    setValue: (config, value) => setValue(config, String(value)),
  } satisfies FxNodeControlDefinition<TConfig>;
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
