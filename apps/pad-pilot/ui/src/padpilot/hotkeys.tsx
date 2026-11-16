import { isTriggerDefinition } from "./hotkey-trigger";
import {
  HotkeysProvider as TanstackHotkeysProvider,
  createHotkey as createTanstackHotkey,
  type CreateHotkeyOptions,
  type HotkeysProviderOptions as TanstackHotkeysProviderOptions,
  type HotkeysProviderProps as TanstackHotkeysProviderProps,
} from "@tanstack/solid-hotkeys";
import {
  keyboardEventToHotkey,
  type Hotkey,
  type HotkeyCallback,
  type HotkeyCallbackContext,
  type HotkeyRecorderOptions,
  type RegisterableHotkey,
} from "@tanstack/solid-hotkeys";
import {
  ParentComponent,
  Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import { getLatestHostState } from "../bridge";
import { moduleSdk } from "../module-sdk";
import { useInputDevices } from "./provider";
import { jsonToBase64 } from "../proto/base64";
import type {
  PadPilotInputDeviceKind,
  PadPilotInputDeviceState,
} from "./io/input-device";
import {
  createCapabilityHandle,
  resolveSelectedCapabilityModuleId,
} from "@hyperfocus/pad-pilot/module-identity";

/**
 * Bridges TanStack Solid hotkeys with PadPilot input: keyboard chords stay on the TanStack path;
 * controller macros are evaluated from polled device state, with optional device scope and
 * synthesized key sequences sent through the declared keyboard-output capability when the
 * handler does not cancel.
 */

function executeKeyboardOutput(shortcuts: string[]) {
  const hostState = getLatestHostState();
  const moduleId = resolveSelectedCapabilityModuleId(hostState, "keyboard-output");
  if (!moduleId) {
    return;
  }
  const payloadBase64 = jsonToBase64(shortcuts);
  moduleSdk.sendCapabilityIntent(
    "keyboard-output",
    createCapabilityHandle("keyboard-output", moduleId),
    "execute",
    payloadBase64,
  );
}

/** Whether a macro listens on every connected device or is pinned to one id/kind pair. */
export type PadPilotDeviceScope =
  | { mode: "all-devices" }
  | {
      mode: "specific-device";
      deviceId: string;
      deviceKind: PadPilotInputDeviceKind;
      displayName: string;
    };

/**
 * Firing policy once a macro matches: `edge` avoids repeat while held; `continuous` can fire
 * every reactive tick (with dedupe across the same device id to reduce spam).
 */
export type PadPilotTriggerMode = "edge" | "continuous";

/** Single clause in an AND macro: button threshold or axis direction + threshold. */
export type PadPilotControllerCondition =
  | {
      kind: "button";
      index: number;
      minValue?: number;
    }
  | {
      kind: "axis";
      direction: "negative" | "positive";
      index: number;
      threshold: number;
    };

/**
 * Gamepad-side trigger: all `conditions` must hold on one device that also satisfies `scope`.
 * `keyboardOutput` is optional synthetic keys after the handler runs unless the event is canceled.
 */
export type PadPilotControllerMacro = {
  conditions: PadPilotControllerCondition[];
  enabled?: boolean;
  keyboardOutput?: string[];
  scope?: PadPilotDeviceScope;
  triggerMode?: PadPilotTriggerMode;
};

/** Union input: TanStack `RegisterableHotkey` and/or a `PadPilotControllerMacro` (either or both). */
export type PadPilotTriggerDefinition = {
  keyboard?: RegisterableHotkey;
  controller?: PadPilotControllerMacro;
};

/** Minimal DOM-like surface for controller callbacks so handlers can `preventDefault` / `stopPropagation`. */
export type PadPilotControllerEvent = {
  currentTarget: PadPilotInputDeviceState;
  defaultPrevented: boolean;
  preventDefault: () => void;
  propagationStopped: boolean;
  stopPropagation: () => void;
  type: "controller";
};

/** Extends TanStack keyboard context with a controller branch carrying the matched macro and device snapshot. */
export type PadPilotHotkeyCallbackContext =
  | ({
      source: "keyboard";
    } & HotkeyCallbackContext)
  | {
      controllerMacro: PadPilotControllerMacro;
      device: PadPilotInputDeviceState;
      source: "controller";
    };

/** Handler for either physical keyboard events or synthesized controller events plus discriminated context. */
export type PadPilotHotkeyCallback = (
  event: KeyboardEvent | PadPilotControllerEvent,
  context: PadPilotHotkeyCallbackContext,
) => void;

/** TanStack hotkey options plus defaults merged into any `controller` macro on `PadPilotTriggerDefinition`. */
export type PadPilotCreateHotkeyOptions = CreateHotkeyOptions & {
  controller?: {
    enabled?: boolean;
    keyboardOutput?: string[];
    triggerMode?: PadPilotTriggerMode;
  };
};

/** `keyboard`: window keydown only; `controller`: polled edge inference only; `mixed`: both paths active. */
export type PadPilotRecorderMode = "controller" | "keyboard" | "mixed";

/** Defaults applied when inferring a controller macro from the first qualifying edge transition. */
export type PadPilotRecorderControllerDefaults = {
  axisThreshold?: number;
  deviceScopeMode?: "all-devices" | "specific-device";
  triggerMode?: PadPilotTriggerMode;
};

/**
 * Recorder options: extends TanStack with `mode`, controller defaults, and optional unified
 * `onRecordTrigger` when you want one callback for keyboard or controller captures.
 */
export type PadPilotHotkeyRecorderOptions = Omit<
  HotkeyRecorderOptions,
  "onRecord"
> & {
  controller?: PadPilotRecorderControllerDefaults;
  mode?: PadPilotRecorderMode;
  onRecord?: (hotkey: Hotkey) => void;
  onRecordController?: (macro: PadPilotControllerMacro) => void;
  onRecordTrigger?: (trigger: PadPilotTriggerDefinition) => void;
};

/** Last capture: raw macro, full trigger definition wrapper, or nothing yet. */
export type PadPilotRecordedTrigger =
  | PadPilotControllerMacro
  | PadPilotTriggerDefinition
  | null;

/** Signals and controls returned by `createHotkeyRecorder` for UI wiring. */
export type PadPilotSolidHotkeyRecorder = {
  cancelRecording: () => void;
  clearRecording: () => void;
  isRecording: Accessor<boolean>;
  recordedHotkey: Accessor<Hotkey | null>;
  recordedTrigger: Accessor<PadPilotRecordedTrigger>;
  startRecording: () => void;
  stopRecording: () => void;
};

/** Provider-level defaults: forwarded to TanStack where applicable; `controller`/`hotkeyRecorderController` are PadPilot-specific. */
export type PadPilotHotkeysProviderOptions =
  TanstackHotkeysProviderOptions & {
    controller?: PadPilotCreateHotkeyOptions["controller"];
    hotkeyRecorderController?: PadPilotRecorderControllerDefaults;
  };

type PadPilotHotkeysContextValue = {
  defaultOptions: PadPilotHotkeysProviderOptions;
};

const PadPilotHotkeysContext =
  createContext<PadPilotHotkeysContextValue>();

const DEFAULT_HOTKEYS_OPTIONS: PadPilotHotkeysProviderOptions = {};

/** Distinguishes `{ keyboard?, controller? }` from a bare `RegisterableHotkey` object shape. */


/** Solid-friendly: unwraps accessors so hotkeys/recorder options can be reactive. */
const resolveValue = <T extends object | string,>(value: T | (() => T)) =>
  typeof value === "function" ? (value)() : value;

/** Fills macro fields from provider/create options without mutating the source macro. */
const mergeControllerMacro = (
  macro: PadPilotControllerMacro | undefined,
  defaults: PadPilotCreateHotkeyOptions["controller"] | undefined,
) => {
  if (!macro) {
    return null;
  }

  return {
    ...macro,
    enabled: macro.enabled ?? defaults?.enabled ?? true,
    keyboardOutput: macro.keyboardOutput ?? defaults?.keyboardOutput ?? [],
    triggerMode: macro.triggerMode ?? defaults?.triggerMode ?? "edge",
  };
};

/** False if device disconnected; `all-devices` or missing scope matches any connected device in scope rules. */
const matchesScope = (
  scope: PadPilotDeviceScope | undefined,
  device: PadPilotInputDeviceState,
) => {
  if (!device.connected) {
    return false;
  }

  if (!scope || scope.mode === "all-devices") {
    return true;
  }

  return (
    device.deviceId === scope.deviceId &&
    device.deviceKind === scope.deviceKind
  );
};

/** Evaluates one macro clause against a single device snapshot (buttons vs axes). */
const conditionMatches = (
  condition: PadPilotControllerCondition,
  device: PadPilotInputDeviceState,
) => {
  if (condition.kind === "button") {
    return (
      (device.buttons[condition.index] ?? 0) >= (condition.minValue ?? 0.75)
    );
  }

  const value = device.axes[condition.index] ?? 0;
  if (condition.direction === "positive") {
    return value >= condition.threshold;
  }

  return value <= -Math.abs(condition.threshold);
};

/**
 * First connected device, in iteration order, that satisfies scope and has every condition true.
 * Macro disabled or empty conditions yields no match.
 */
const matchControllerMacro = (
  macro: PadPilotControllerMacro | null,
  devices: PadPilotInputDeviceState[],
) => {
  if (!macro || macro.enabled === false || macro.conditions.length === 0) {
    return null;
  }

  for (const device of devices) {
    if (!matchesScope(macro.scope, device)) {
      continue;
    }

    const isMatch = macro.conditions.every((condition) =>
      conditionMatches(condition, device),
    );
    if (isMatch) {
      return device;
    }
  }

  return null;
};

/** Mutable flags behind getters so `preventDefault`/`stopPropagation` behave like DOM events. */
const createControllerEvent = (device: PadPilotInputDeviceState) => {
  let defaultPrevented = false;
  let propagationStopped = false;

  return {
    currentTarget: device,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault() {
      defaultPrevented = true;
    },
    get propagationStopped() {
      return propagationStopped;
    },
    stopPropagation() {
      propagationStopped = true;
    },
    type: "controller" as const,
  };
};

/**
 * Detects the first button press or axis threshold cross between two polled snapshots (rising edge),
 * then builds a one-condition macro using recorder defaults for scope and trigger mode.
 */
const captureControllerMacro = (
  previousDevices: PadPilotInputDeviceState[],
  nextDevices: PadPilotInputDeviceState[],
  defaults: PadPilotRecorderControllerDefaults | undefined,
) => {
  for (const device of nextDevices) {
    const previousDevice = previousDevices.find(
      (candidate) => candidate.deviceId === device.deviceId,
    );

    for (let index = 0; index < device.buttons.length; index += 1) {
      const nextValue = device.buttons[index] ?? 0;
      const previousValue = previousDevice?.buttons[index] ?? 0;
      if (nextValue >= 0.75 && previousValue < 0.75) {
        return {
          conditions: [{ kind: "button" as const, index }],
          scope:
            defaults?.deviceScopeMode === "all-devices"
              ? ({ mode: "all-devices" as const } as const)
              : ({
                  mode: "specific-device" as const,
                  deviceId: device.deviceId,
                  deviceKind: device.deviceKind,
                  displayName: device.displayName,
                } as const),
          triggerMode: defaults?.triggerMode ?? "edge",
        };
      }
    }

    for (let index = 0; index < device.axes.length; index += 1) {
      const nextValue = device.axes[index] ?? 0;
      const previousValue = previousDevice?.axes[index] ?? 0;
      const threshold = Math.max(
        defaults?.axisThreshold ?? 0.5,
        Math.min(Math.abs(nextValue), 0.95),
      );
      if (nextValue >= threshold && previousValue < threshold) {
        return {
          conditions: [
            {
              direction: "positive" as const,
              index,
              kind: "axis" as const,
              threshold,
            },
          ],
          scope:
            defaults?.deviceScopeMode === "all-devices"
              ? ({ mode: "all-devices" as const } as const)
              : ({
                  mode: "specific-device" as const,
                  deviceId: device.deviceId,
                  deviceKind: device.deviceKind,
                  displayName: device.displayName,
                } as const),
          triggerMode: defaults?.triggerMode ?? "edge",
        };
      }
      if (nextValue <= -threshold && previousValue > -threshold) {
        return {
          conditions: [
            {
              direction: "negative" as const,
              index,
              kind: "axis" as const,
              threshold,
            },
          ],
          scope:
            defaults?.deviceScopeMode === "all-devices"
              ? ({ mode: "all-devices" as const } as const)
              : ({
                  mode: "specific-device" as const,
                  deviceId: device.deviceId,
                  deviceKind: device.deviceKind,
                  displayName: device.displayName,
                } as const),
          triggerMode: defaults?.triggerMode ?? "edge",
        };
      }
    }
  }

  return null;
};

/**
 * Mounts TanStack's provider and stores PadPilot `defaultOptions` (controller/recorder defaults)
 * for `useDefaultHotkeysOptions`; only TanStack-compatible keys are forwarded into TanStack.
 */
export const HotkeysProvider: ParentComponent<
  TanstackHotkeysProviderProps & {
    defaultOptions?: PadPilotHotkeysProviderOptions;
  }
> = (props) => {
  const defaultOptions = props.defaultOptions ?? DEFAULT_HOTKEYS_OPTIONS;

  return (
    <PadPilotHotkeysContext.Provider value={{ defaultOptions }}>
      <TanstackHotkeysProvider
        defaultOptions={{
          hotkey: defaultOptions.hotkey,
          hotkeyRecorder: defaultOptions.hotkeyRecorder,
          hotkeySequence: defaultOptions.hotkeySequence,
        }}
      >
        {props.children}
      </TanstackHotkeysProvider>
    </PadPilotHotkeysContext.Provider>
  );
};

/** PadPilot defaults from context, or empty defaults when no provider ancestor exists. */
export function useHotkeysContext() {
  return useContext(PadPilotHotkeysContext) ?? {
    defaultOptions: DEFAULT_HOTKEYS_OPTIONS,
  };
}

/** Shorthand for merged hotkey/hotkeyRecorder defaults from `HotkeysProvider`. */
export function useDefaultHotkeysOptions() {
  return useHotkeysContext().defaultOptions;
}

/**
 * Registers a keyboard hotkey (TanStack) and/or a controller macro on the current input snapshot.
 * For `PadPilotTriggerDefinition`, keyboard uses TanStack; controller runs in an effect when the
 * macro matches, with `continuous` vs `edge` and same-device dedupe as in this file.
 */
export function createHotkey(
  hotkey: RegisterableHotkey | (() => RegisterableHotkey),
  callback: HotkeyCallback,
  options?: CreateHotkeyOptions | (() => CreateHotkeyOptions),
): void;
export function createHotkey(
  trigger: PadPilotTriggerDefinition | (() => PadPilotTriggerDefinition),
  callback: PadPilotHotkeyCallback,
  options?: PadPilotCreateHotkeyOptions | (() => PadPilotCreateHotkeyOptions),
): void;
export function createHotkey(
  hotkeyOrTrigger:
    | RegisterableHotkey
    | (() => RegisterableHotkey)
    | PadPilotTriggerDefinition
    | (() => PadPilotTriggerDefinition),
  callback: HotkeyCallback | PadPilotHotkeyCallback,
  options?:
    | CreateHotkeyOptions
    | (() => CreateHotkeyOptions)
    | PadPilotCreateHotkeyOptions
    | (() => PadPilotCreateHotkeyOptions),
) {
  const defaultOptions = useDefaultHotkeysOptions();
  const inputDevices = useInputDevices();
  const keyboardOptions =
    typeof options === "function"
      ? () => {
          const resolved = options();
          const { controller: _controller, ...rest } =
            Object.assign({ controller: undefined }, resolved);
          return {
            ...defaultOptions.hotkey,
            ...rest,
          };
        }
      : (() => {
          const { controller: _controller, ...rest } =
            Object.assign({ controller: undefined }, options);
          return {
            ...defaultOptions.hotkey,
            ...rest,
          };
        })();

  const resolvedInitial = resolveValue(
    hotkeyOrTrigger,
  );
  if (isTriggerDefinition(resolvedInitial)) {
    const triggerDefinition = resolvedInitial;
    if (triggerDefinition.keyboard) {
      createTanstackHotkey(
        triggerDefinition.keyboard,
        (event, context) => {
          Reflect.apply(callback, undefined, [event, {
            ...context,
            source: "keyboard",
          }]);
        },
        keyboardOptions,
      );
    }

    let wasMatched = false;
    let lastMatchedDeviceId = "";

    createEffect(() => {
      const resolvedTrigger = resolveValue(
        hotkeyOrTrigger,
      );
      const resolvedOptions = resolveValue(
        (options ?? {}),
      );
      if (!isTriggerDefinition(resolvedTrigger)) return;
      const controllerMacro = mergeControllerMacro(
        resolvedTrigger.controller,
        ("controller" in resolvedOptions ? resolvedOptions.controller : undefined) ?? defaultOptions.controller,
      );
      const matchedDevice = matchControllerMacro(
        controllerMacro,
        inputDevices(),
      );

      if (!matchedDevice || !controllerMacro) {
        wasMatched = false;
        lastMatchedDeviceId = "";
        return;
      }

      const shouldFire =
        controllerMacro.triggerMode === "continuous" ||
        !wasMatched ||
        lastMatchedDeviceId !== matchedDevice.deviceId;
      wasMatched = true;
      lastMatchedDeviceId = matchedDevice.deviceId;
      if (!shouldFire) {
        return;
      }

      const controllerEvent = createControllerEvent(matchedDevice);
      Reflect.apply(callback, undefined, [controllerEvent, {
        controllerMacro,
        device: matchedDevice,
        source: "controller",
      }]);
      if (
        !controllerEvent.defaultPrevented &&
        controllerMacro.keyboardOutput &&
        controllerMacro.keyboardOutput.length > 0
      ) {
        executeKeyboardOutput(controllerMacro.keyboardOutput);
      }
    });
    return;
  }

  createTanstackHotkey(
    () => { const value = resolveValue(hotkeyOrTrigger); return isTriggerDefinition(value) ? value.keyboard ?? "Escape" : value; },
    (event, context) => Reflect.apply(callback, undefined, [event, context]),
    keyboardOptions,
  );
}

/**
 * Records either a keyboard chord (window `keydown`) or an inferred controller macro from input
 * edges, depending on `mode`. Escape cancels; Backspace/Delete clears. Merges provider defaults.
 */
export function createHotkeyRecorder(
  options: HotkeyRecorderOptions | (() => HotkeyRecorderOptions),
): PadPilotSolidHotkeyRecorder;
export function createHotkeyRecorder(
  options:
    | PadPilotHotkeyRecorderOptions
    | (() => PadPilotHotkeyRecorderOptions),
): PadPilotSolidHotkeyRecorder;
export function createHotkeyRecorder(
  options:
    | HotkeyRecorderOptions
    | (() => HotkeyRecorderOptions)
    | PadPilotHotkeyRecorderOptions
    | (() => PadPilotHotkeyRecorderOptions),
) {
  const inputDevices = useInputDevices();
  const defaultOptions = useDefaultHotkeysOptions();
  const [isRecording, setIsRecording] = createSignal(false);
  const [recordedHotkey, setRecordedHotkey] = createSignal<Hotkey | null>(null);
  const [recordedTrigger, setRecordedTrigger] =
    createSignal<PadPilotRecordedTrigger>(null);
  const [previousDevices, setPreviousDevices] =
    createSignal<PadPilotInputDeviceState[]>([]);

  const resolveRecorderOptions = (): PadPilotHotkeyRecorderOptions => {
    const resolved = resolveValue(
      options,
    );
    return {
      ...defaultOptions.hotkeyRecorder,
      ...resolved,
      controller: {
        ...defaultOptions.hotkeyRecorderController,
        ...("controller" in resolved ? resolved.controller : undefined),
      },
    };
  };

  const stopRecording = () => {
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    resolveRecorderOptions().onCancel?.();
  };

  const clearRecording = () => {
    setRecordedHotkey(null);
    setRecordedTrigger(null);
    resolveRecorderOptions().onClear?.();
  };

  const recordHotkey = (hotkey: Hotkey) => {
    setRecordedHotkey(hotkey);
    setRecordedTrigger({ keyboard: hotkey });
    stopRecording();
    resolveRecorderOptions().onRecord?.(hotkey);
    resolveRecorderOptions().onRecordTrigger?.({ keyboard: hotkey });
  };

  const recordControllerMacro = (macro: PadPilotControllerMacro) => {
    setRecordedTrigger({ controller: macro });
    setRecordedHotkey(null);
    stopRecording();
    resolveRecorderOptions().onRecordController?.(macro);
    resolveRecorderOptions().onRecordTrigger?.({ controller: macro });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isRecording()) {
      return;
    }

    const recorderOptions = resolveRecorderOptions();
    const mode = recorderOptions.mode ?? "keyboard";
    if (mode === "controller") {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRecording();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      clearRecording();
      stopRecording();
      return;
    }

    const hotkey = keyboardEventToHotkey(event);
    if (!hotkey) {
      return;
    }

    event.preventDefault();
    recordHotkey(hotkey);
  };

  createEffect(() => {
    if (!isRecording()) {
      return;
    }

    const recorderOptions = resolveRecorderOptions();
    const mode = recorderOptions.mode ?? "keyboard";
    if (mode === "keyboard") {
      setPreviousDevices(inputDevices());
      return;
    }

    const capturedMacro = captureControllerMacro(
      previousDevices(),
      inputDevices(),
      recorderOptions.controller,
    );
    setPreviousDevices(inputDevices());
    if (!capturedMacro) {
      return;
    }

    recordControllerMacro(capturedMacro);
  });

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  }

  return {
    cancelRecording,
    clearRecording,
    isRecording,
    recordedHotkey,
    recordedTrigger,
    startRecording() {
      setRecordedHotkey(null);
      setRecordedTrigger(null);
      setPreviousDevices(inputDevices());
      setIsRecording(true);
    },
    stopRecording,
  };
}

/** Human-readable summary of conditions and optional specific-device suffix for UI labels. */
export function formatControllerMacro(macro: PadPilotControllerMacro) {
  const parts = macro.conditions.map((condition) => {
    if (condition.kind === "button") {
      return `Button ${condition.index}`;
    }

    return `Axis ${condition.index} ${
      condition.direction === "positive" ? "+" : "-"
    }`;
  });
  const scope =
    macro.scope?.mode === "specific-device"
      ? ` on ${macro.scope.displayName || macro.scope.deviceId}`
      : "";
  return `${parts.join(" + ")}${scope}`;
}

/** Prefers keyboard string when present; otherwise formats the controller macro. */
export function formatTriggerDefinition(trigger: PadPilotTriggerDefinition) {
  if (trigger.keyboard) {
    return String(trigger.keyboard);
  }
  if (trigger.controller) {
    return formatControllerMacro(trigger.controller);
  }
  return "";
}

/** Namespace export for consumers who prefer a single import object. */
export const hotkeys = {
  HotkeysProvider,
  createHotkey,
  createHotkeyRecorder,
  formatControllerMacro,
  formatTriggerDefinition,
  useDefaultHotkeysOptions,
  useHotkeysContext,
};

export * from "@tanstack/solid-hotkeys";
