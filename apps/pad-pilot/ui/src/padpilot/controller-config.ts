import { create, toBinary } from "@bufbuild/protobuf";
import {
  ControllerBindingKind,
  ControllerLayoutKind,
  SetControllerConfigRequestSchema,
} from "../proto/generated/bridge-pb";
import { bytesToBase64 } from "../proto/base64";
import { clamp01Or } from "../utils/math";

export type PadPilotControllerLayoutKind =
  | "auto"
  | "xbox"
  | "playstation"
  | "switch"
  | "generic"
  | "custom";

export type PadPilotControllerBindingKind =
  | "none"
  | "button"
  | "axis-positive"
  | "axis-negative";

export type PadPilotControllerButtonBinding = {
  bindingKind: PadPilotControllerBindingKind;
  sourceIndex: number;
  threshold: number;
};

export type PadPilotControllerAxisBinding = {
  sourceIndex: number;
  inverted: boolean;
};

export type PadPilotCustomControllerLayout = {
  id: string;
  name: string;
  buttonBindings: PadPilotControllerButtonBinding[];
  axisBindings: PadPilotControllerAxisBinding[];
};

export type PadPilotControllerConfigRow = {
  stableId: string;
  hardwareId: string;
  layoutKind: PadPilotControllerLayoutKind;
  customLayoutId: string;
  isPrimary: boolean;
};

export type PadPilotControllerConfigState = {
  rows: PadPilotControllerConfigRow[];
  customLayouts: PadPilotCustomControllerLayout[];
};

export const CANONICAL_BUTTON_LABELS = [
  "A / South",
  "B / East",
  "X / West",
  "Y / North",
  "LB",
  "RB",
  "LT",
  "RT",
  "Select",
  "Start",
  "L3",
  "R3",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
] as const;

export const CANONICAL_AXIS_LABELS = [
  "Left X",
  "Left Y",
  "Right X",
  "Right Y",
] as const;

export const MAX_CONTROLLER_CONFIG_ROWS = 64;
export const MAX_CUSTOM_CONTROLLER_LAYOUTS = 64;

const MAX_CONTROLLER_ID_BYTES = 128;
const MAX_CONTROLLER_HARDWARE_ID_BYTES = 127;
const MAX_CONTROLLER_LAYOUT_NAME_BYTES = 128;
const MAX_CONTROLLER_SOURCE_BUTTONS = 32;
const MAX_CONTROLLER_SOURCE_AXES = 8;
const controllerLayoutKinds = new Set<PadPilotControllerLayoutKind>([
  "auto",
  "xbox",
  "playstation",
  "switch",
  "generic",
  "custom",
]);
const controllerBindingKinds = new Set<PadPilotControllerBindingKind>([
  "none",
  "button",
  "axis-positive",
  "axis-negative",
]);

function boundedUtf8(value: string, maxBytes: number) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let length = maxBytes; length >= Math.max(0, maxBytes - 3); length -= 1) {
    try {
      return decoder.decode(bytes.subarray(0, length));
    } catch {
      // Back up to the start of the final UTF-8 code point.
    }
  }
  return "";
}

function boundedIndex(value: number | undefined, maxExclusive: number) {
  if (!Number.isInteger(value) || value === undefined) {
    return 0;
  }
  return Math.min(maxExclusive - 1, Math.max(0, value));
}

function boundedThreshold(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return clamp01Or(value, fallback);
}

function uniqueControllerId(value: string | undefined, usedIds: Set<string>) {
  let candidate = boundedUtf8(value?.trim() ?? "", MAX_CONTROLLER_ID_BYTES);
  while (!candidate || usedIds.has(candidate)) {
    candidate = makeControllerStableId();
  }
  usedIds.add(candidate);
  return candidate;
}

export function makeControllerStableId() {
  return globalThis.crypto?.randomUUID?.() ?? `controller-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDefaultButtonBindings() {
  const bindings: PadPilotControllerButtonBinding[] = Array.from({ length: CANONICAL_BUTTON_LABELS.length }, () => ({
    bindingKind: "none" as const,
    sourceIndex: 0,
    threshold: 0.5,
  }));
  bindings[0] = { bindingKind: "button", sourceIndex: 0, threshold: 0.5 };
  bindings[1] = { bindingKind: "button", sourceIndex: 1, threshold: 0.5 };
  bindings[2] = { bindingKind: "button", sourceIndex: 2, threshold: 0.5 };
  bindings[3] = { bindingKind: "button", sourceIndex: 3, threshold: 0.5 };
  bindings[4] = { bindingKind: "button", sourceIndex: 9, threshold: 0.5 };
  bindings[5] = { bindingKind: "button", sourceIndex: 10, threshold: 0.5 };
  bindings[6] = { bindingKind: "axis-positive", sourceIndex: 4, threshold: 0.15 };
  bindings[7] = { bindingKind: "axis-positive", sourceIndex: 5, threshold: 0.15 };
  bindings[8] = { bindingKind: "button", sourceIndex: 4, threshold: 0.5 };
  bindings[9] = { bindingKind: "button", sourceIndex: 6, threshold: 0.5 };
  bindings[10] = { bindingKind: "button", sourceIndex: 7, threshold: 0.5 };
  bindings[11] = { bindingKind: "button", sourceIndex: 8, threshold: 0.5 };
  bindings[12] = { bindingKind: "button", sourceIndex: 11, threshold: 0.5 };
  bindings[13] = { bindingKind: "button", sourceIndex: 12, threshold: 0.5 };
  bindings[14] = { bindingKind: "button", sourceIndex: 13, threshold: 0.5 };
  bindings[15] = { bindingKind: "button", sourceIndex: 14, threshold: 0.5 };
  return bindings;
}

export function createDefaultAxisBindings() {
  const bindings: PadPilotControllerAxisBinding[] = Array.from({ length: CANONICAL_AXIS_LABELS.length }, (_, index) => ({
    sourceIndex: index,
    inverted: false,
  }));
  return bindings;
}

export function createTemplateCustomLayout(name = "Custom Layout", id: string = makeControllerStableId()) {
  const layout: PadPilotCustomControllerLayout = {
    id,
    name,
    buttonBindings: createDefaultButtonBindings(),
    axisBindings: createDefaultAxisBindings(),
  };
  return layout;
}

export function createBlankAxisBinding() {
  return ({
    sourceIndex: 0 as const,
    inverted: false as const,
  });
}

export function createDefaultControllerConfig() {
  const config: PadPilotControllerConfigState = {
    rows: [{
      stableId: makeControllerStableId(),
      hardwareId: "",
      layoutKind: "auto",
      customLayoutId: "",
      isPrimary: true,
    }],
    customLayouts: [],
  };
  return config;
}

export function normalizeControllerConfig(config?: Partial<PadPilotControllerConfigState> | null) {
  const base = createDefaultControllerConfig();
  const usedLayoutIds = new Set<string>();
  const customLayouts = (config?.customLayouts ?? [])
    .slice(0, MAX_CUSTOM_CONTROLLER_LAYOUTS)
    .map((layout) => {
      const id = uniqueControllerId(layout?.id, usedLayoutIds);
      const name = boundedUtf8(layout?.name?.trim() ?? "", MAX_CONTROLLER_LAYOUT_NAME_BYTES) || "Custom Layout";
      const buttonBindings = Array.from({ length: CANONICAL_BUTTON_LABELS.length }, (_, index) => {
        const binding = layout?.buttonBindings?.[index];
        const bindingKind = controllerBindingKinds.has(binding?.bindingKind ?? "none")
          ? binding?.bindingKind ?? "none"
          : "none";
        const sourceLimit = bindingKind === "button" ? MAX_CONTROLLER_SOURCE_BUTTONS : MAX_CONTROLLER_SOURCE_AXES;
        return {
          bindingKind,
          sourceIndex: bindingKind === "none" ? 0 : boundedIndex(binding?.sourceIndex, sourceLimit),
          threshold: boundedThreshold(binding?.threshold, index === 6 || index === 7 ? 0.15 : 0.5),
        };
      });
      const axisBindings = Array.from({ length: CANONICAL_AXIS_LABELS.length }, (_, index) => {
        const binding = layout?.axisBindings?.[index];
        return {
          sourceIndex: boundedIndex(binding?.sourceIndex ?? index, MAX_CONTROLLER_SOURCE_AXES),
          inverted: Boolean(binding?.inverted),
        };
      });
      return { id, name, buttonBindings, axisBindings };
    });

  const validLayoutIds = new Set(customLayouts.map((layout) => layout.id));
  const configuredRows = (config?.rows ?? base.rows).slice(0, MAX_CONTROLLER_CONFIG_ROWS);
  const primaryIndex = configuredRows.findIndex((candidate) => candidate?.isPrimary);
  const usedRowIds = new Set<string>();
  const rows = configuredRows.map((row, index) => {
    const requestedLayoutKind = controllerLayoutKinds.has(row?.layoutKind ?? "auto")
      ? row?.layoutKind ?? "auto"
      : "auto";
    const requestedCustomLayoutId = boundedUtf8(row?.customLayoutId?.trim() ?? "", MAX_CONTROLLER_ID_BYTES);
    const hasCustomLayout = requestedLayoutKind === "custom" && validLayoutIds.has(requestedCustomLayoutId);
    return {
      stableId: uniqueControllerId(row?.stableId, usedRowIds),
      hardwareId: boundedUtf8(row?.hardwareId ?? "", MAX_CONTROLLER_HARDWARE_ID_BYTES),
      layoutKind: hasCustomLayout ? "custom" as const : requestedLayoutKind === "custom" ? "auto" as const : requestedLayoutKind,
      customLayoutId: hasCustomLayout ? requestedCustomLayoutId : "",
      isPrimary: Boolean(row?.isPrimary) && index === primaryIndex,
    };
  });
  if (rows.length === 0) {
    rows.push(base.rows[0]!);
  }
  if (!rows.some((row) => row.isPrimary)) {
    rows[0]!.isPrimary = true;
  }

  return {
    rows,
    customLayouts,
  };
}

export function controllerLayoutKindFromProto(value: ControllerLayoutKind) {
  switch (value) {
    case ControllerLayoutKind.XBOX:
      return "xbox";
    case ControllerLayoutKind.PLAYSTATION:
      return "playstation";
    case ControllerLayoutKind.SWITCH:
      return "switch";
    case ControllerLayoutKind.GENERIC:
      return "generic";
    case ControllerLayoutKind.CUSTOM:
      return "custom";
    case ControllerLayoutKind.AUTO:
    default:
      return "auto";
  }
}

export function controllerLayoutKindToProto(value: PadPilotControllerLayoutKind) {
  switch (value) {
    case "xbox":
      return ControllerLayoutKind.XBOX;
    case "playstation":
      return ControllerLayoutKind.PLAYSTATION;
    case "switch":
      return ControllerLayoutKind.SWITCH;
    case "generic":
      return ControllerLayoutKind.GENERIC;
    case "custom":
      return ControllerLayoutKind.CUSTOM;
    case "auto":
    default:
      return ControllerLayoutKind.AUTO;
  }
}

export function controllerBindingKindFromProto(value: ControllerBindingKind) {
  switch (value) {
    case ControllerBindingKind.BUTTON:
      return "button";
    case ControllerBindingKind.AXIS_POSITIVE:
      return "axis-positive";
    case ControllerBindingKind.AXIS_NEGATIVE:
      return "axis-negative";
    case ControllerBindingKind.NONE:
    default:
      return "none";
  }
}

export function controllerBindingKindToProto(value: PadPilotControllerBindingKind) {
  switch (value) {
    case "button":
      return ControllerBindingKind.BUTTON;
    case "axis-positive":
      return ControllerBindingKind.AXIS_POSITIVE;
    case "axis-negative":
      return ControllerBindingKind.AXIS_NEGATIVE;
    case "none":
    default:
      return ControllerBindingKind.NONE;
  }
}

export function encodeControllerConfigRequestBase64(config: PadPilotControllerConfigState) {
  const normalized = normalizeControllerConfig(config);
  const request = create(SetControllerConfigRequestSchema, {
    controllerConfig: {
      rows: normalized.rows.map((row) => ({
        stableId: row.stableId,
        hardwareId: row.hardwareId,
        layoutKind: controllerLayoutKindToProto(row.layoutKind),
        customLayoutId: row.customLayoutId,
        isPrimary: row.isPrimary,
      })),
      customLayouts: normalized.customLayouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        buttonBindings: layout.buttonBindings.map((binding) => ({
          bindingKind: controllerBindingKindToProto(binding.bindingKind),
          sourceIndex: binding.sourceIndex,
          threshold: binding.threshold,
        })),
        axisBindings: layout.axisBindings.map((binding) => ({
          sourceIndex: binding.sourceIndex,
          inverted: binding.inverted,
        })),
      })),
    },
  });
  return bytesToBase64(toBinary(SetControllerConfigRequestSchema, request));
}
