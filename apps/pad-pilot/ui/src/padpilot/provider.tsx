import {
  Accessor,
  ParentProps,
  Setter,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { subscribeHostState, type HostState } from "../bridge";
import { importHostFile, pickHostFile, type HostFileImportOptions, type HostFilePickOptions } from "../bridge";
import { moduleSdk } from "../module-sdk";
import {
  base64ToBytes,
  bytesToBase64,
} from "../proto/base64";
import { getModuleStateCodec } from "../proto/registry";
import type { PadPilotInputDeviceState } from "./io/input-device";
import {
  bindInputDevices,
  inputDevicesFromHostState,
} from "./io/input-device";
import {
  bindController,
  EMPTY_GAMEPAD,
  getPrimaryGamepad,
  type PadPilotGamepadState,
} from "./io/gamepad";
import {
  upload,
  type UploadWidgetProps,
} from "./io/uploadthing";
import {
  encodeControllerConfigRequestBase64,
  normalizeControllerConfig,
  type PadPilotControllerConfigState,
} from "./controller-config";
import {
  canonicalModuleId,
  moduleIdAliases,
} from "@hyperfocus/pad-pilot/module-identity";

export type MidiEvent = {
  note: number;
  velocity: number;
  channel?: number;
};

const CONTROLLER_CONFIG_ECHO_TIMEOUT_MS = 2_000;

type PadPilotContextValue = {
  gamepad: Accessor<PadPilotGamepadState>;
  inputDevices: Accessor<PadPilotInputDeviceState[]>;
  midiHistory: Accessor<MidiEvent[]>;
  emitMidi: (event: MidiEvent) => void;
  controllerConfig: Accessor<PadPilotControllerConfigState>;
  setControllerConfig: (next: PadPilotControllerConfigState) => void;
  beginModuleInteraction: (moduleId: string) => void;
  endModuleInteraction: (moduleId: string) => void;
  selectedProfile: Accessor<string>;
  setSelectedProfile: Setter<string>;
  getModuleState: <T>(moduleId: string, fallback: T) => T;
  setModuleState: <T>(moduleId: string, next: Partial<T>) => void;
  getEditorViewState: <T>(scopeId: string, fallback: T) => T;
  setEditorViewState: <T>(scopeId: string, next: Partial<T>) => void;
};

type ModuleScopeValue = {
  scopeId: string;
  container: Accessor<HTMLDivElement | undefined>;
};

const PadPilotContext = createContext<PadPilotContextValue>();
const ModuleScopeContext = createContext<ModuleScopeValue>();

const toRecord = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};
const serializeJsonState = (value: unknown) => {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
};
type HydrationPhase = "unseen" | "hydrating" | "hydrated" | "local-dirty";

function bumpRevision<T>(previous: T, value: T) {
  const nextRecord = toRecord(value);
  if (!nextRecord) {
    return value;
  }

  const previousRecord = toRecord(previous);
  const previousRevision =
    typeof previousRecord?.revision === "bigint"
      ? previousRecord.revision
      : null;
  const nextRevision = typeof nextRecord.revision === "bigint" ? nextRecord.revision : null;
  if (previousRevision !== null) {
    const revision =
      nextRevision !== null && nextRevision > previousRevision
        ? nextRevision
        : previousRevision + 1n;
    return { ...value, revision } as T;
  }

  return value;
}

function getStateRevision(value: unknown) {
  const record = toRecord(value);
  if (!record || typeof record.revision !== "bigint") {
    return null;
  }

  return record.revision;
}

// Provider hooks expose generic runtime state; feature UI semantics should stay in shared elements.
export function PadPilotProvider(props: ParentProps) {
  const [gamepad, setGamepad] =
    createSignal<PadPilotGamepadState>(EMPTY_GAMEPAD);
  const [inputDevices, setInputDevices] =
    createSignal<PadPilotInputDeviceState[]>([]);
  const [midiHistory, setMidiHistory] = createSignal<MidiEvent[]>([]);
  const initialControllerConfig = normalizeControllerConfig();
  const [controllerConfig, setControllerConfig] = createSignal<PadPilotControllerConfigState>(initialControllerConfig);
  const [pendingControllerConfigPayload, setPendingControllerConfigPayload] = createSignal<string | null>(null);
  const [selectedProfile, setSelectedProfile] = createSignal("Default");
  const [moduleStateMap, setModuleStateMap] = createStore<
    Record<string, unknown>
  >({});
  const [moduleHydration, setModuleHydration] = createStore<
    Record<string, { phase: HydrationPhase }>
  >({});
  const [editorViewStateMap, setEditorViewStateMap] = createStore<
    Record<string, unknown>
  >({});
  const moduleInteractionCounts = new Map<string, number>();
  const pendingActiveModulePayloads = new Map<string, { authoritative: boolean; payloadBase64: string }>();
  const pendingPreHydrationModulePatches = new Map<string, Record<string, unknown>>();
  const lastAppliedModuleRevisions = new Map<string, bigint>();
  let lastAuthoritativeControllerConfig = initialControllerConfig;
  let deferredControllerConfigEcho: PadPilotControllerConfigState | null = null;
  let controllerConfigEchoTimeout: number | undefined;

  const commitModuleState = <T,>(canonicalId: string, next: Partial<T>) => {
    const prev = (moduleStateMap[canonicalId] ?? {}) as T;
    const prevRecord = toRecord(prev);
    const mergedValue = bumpRevision(prev, {
      ...(prevRecord ?? {}),
      ...(toRecord(next) ?? {}),
    } as T);
    const codec = getModuleStateCodec<T>(canonicalId);
    let payload: string | null;
    try {
      payload = codec
        ? bytesToBase64(codec.encode(mergedValue))
        : serializeJsonState(mergedValue);
    } catch {
      return;
    }
    if (payload === null) {
      return;
    }

    setModuleStateMap(canonicalId, mergedValue as unknown);
    setModuleHydration(canonicalId, { phase: "local-dirty" });
    if (codec) {
      const mergedRecord = toRecord(mergedValue);
      const revision =
        typeof mergedRecord?.revision === "bigint"
          ? mergedRecord.revision
          : 0n;
      moduleSdk.setModuleStateProto(
        canonicalId,
        payload,
        revision
      );
      return;
    }
    moduleSdk.setModuleState(canonicalId, payload);
  };

  const flushHydratedModulePatches = () => {
    for (const [canonicalId, patch] of pendingPreHydrationModulePatches) {
      if ((moduleHydration[canonicalId]?.phase ?? "unseen") !== "hydrated") {
        continue;
      }
      pendingPreHydrationModulePatches.delete(canonicalId);
      commitModuleState<Record<string, unknown>>(canonicalId, patch);
    }
  };

  const publishInputDeviceState = (nextDevices: PadPilotInputDeviceState[]) => {
    const snapshot = nextDevices.map((device) => ({
      axes: [...device.axes],
      buttons: [...device.buttons],
      connected: device.connected,
      deviceId: device.deviceId,
      runtimeDeviceId: device.runtimeDeviceId,
      hardwareId: device.hardwareId,
      deviceKind: device.deviceKind,
      displayName: device.displayName,
      frameIndex: device.frameIndex,
      rawAxes: [...device.rawAxes],
      rawButtons: [...device.rawButtons],
      detectedLayoutKind: device.detectedLayoutKind,
      activeLayoutKind: device.activeLayoutKind,
    }));
    const nextGamepad = getPrimaryGamepad(snapshot);
    setInputDevices(snapshot);
    setGamepad(nextGamepad);
  };

  const applyInputState = (hostState: HostState) => {
    const devices = inputDevicesFromHostState(hostState);
    if (devices) {
      publishInputDeviceState(devices);
    }
  };

  const reconcileControllerConfigEcho = (hostState: HostState) => {
    if (!hostState.controllerConfig) {
      return;
    }

    const normalized = normalizeControllerConfig(hostState.controllerConfig);
    const pendingPayload = pendingControllerConfigPayload();
    const hostPayload = encodeControllerConfigRequestBase64(normalized);
    if (pendingPayload && pendingPayload !== hostPayload) {
      deferredControllerConfigEcho = normalized;
      return;
    }

    if (controllerConfigEchoTimeout !== undefined) {
      window.clearTimeout(controllerConfigEchoTimeout);
      controllerConfigEchoTimeout = undefined;
    }
    deferredControllerConfigEcho = null;
    lastAuthoritativeControllerConfig = normalized;
    setControllerConfig(normalized);
    if (pendingPayload === hostPayload) {
      setPendingControllerConfigPayload(null);
    }
  };

  const applyLegacyModuleStates = (hostState: HostState) => {
    if (!hostState.moduleStates || typeof hostState.moduleStates !== "object") {
      return;
    }

    for (const [moduleId, payload] of Object.entries(hostState.moduleStates)) {
      const canonicalId = canonicalModuleId(moduleId);
      if (getModuleStateCodec<unknown>(canonicalId)) {
        continue;
      }
      setModuleStateMap(canonicalId, payload);
      setModuleHydration(canonicalId, { phase: "hydrated" });
    }
  };

  const applyEditorViewStates = (hostState: HostState) => {
    if (!hostState.editorViewStates || typeof hostState.editorViewStates !== "object") {
      return;
    }

    for (const [scopeId, payload] of Object.entries(hostState.editorViewStates)) {
      setEditorViewStateMap(scopeId, payload);
    }
  };

  const applyActiveModulePayload = (canonicalId: string, payloadBase64: string, authoritative = false) => {
    const codec = getModuleStateCodec<unknown>(canonicalId);
    if (payloadBase64.length === 0) {
      setModuleStateMap(canonicalId, undefined);
      lastAppliedModuleRevisions.delete(canonicalId);
      setModuleHydration(canonicalId, { phase: "hydrated" });
      return;
    }

    if (codec) {
      let decodedState: unknown;
      try {
        decodedState = codec.decode(base64ToBytes(payloadBase64));
      } catch {
        return;
      }

      const currentRevision = getStateRevision(moduleStateMap[canonicalId]);
      const nextRevision = getStateRevision(decodedState);
      const lastAppliedRevision = lastAppliedModuleRevisions.get(canonicalId) ?? null;
      if (
        !authoritative &&
        nextRevision !== null &&
        ((currentRevision !== null && nextRevision < currentRevision) ||
          (lastAppliedRevision !== null && nextRevision < lastAppliedRevision))
      ) {
        return;
      }
      setModuleStateMap(canonicalId, decodedState);
      if (nextRevision !== null) {
        lastAppliedModuleRevisions.set(canonicalId, nextRevision);
      }
    } else {
      try {
        setModuleStateMap(
          canonicalId,
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(payloadBase64)))
        );
      } catch {
        // Non-codec module state continues to flow through legacy JSON payloads when available.
        return;
      }
    }
    setModuleHydration(canonicalId, { phase: "hydrated" });
  };

  const beginModuleInteraction = (moduleId: string) => {
    const canonicalId = canonicalModuleId(moduleId);
    moduleInteractionCounts.set(
      canonicalId,
      (moduleInteractionCounts.get(canonicalId) ?? 0) + 1
    );
  };

  const endModuleInteraction = (moduleId: string) => {
    const canonicalId = canonicalModuleId(moduleId);
    const currentCount = moduleInteractionCounts.get(canonicalId) ?? 0;
    if (currentCount > 1) {
      moduleInteractionCounts.set(canonicalId, currentCount - 1);
      return;
    }

    moduleInteractionCounts.delete(canonicalId);
    const pendingPayload = pendingActiveModulePayloads.get(canonicalId);
    pendingActiveModulePayloads.delete(canonicalId);
    if (pendingPayload !== undefined) {
      applyActiveModulePayload(canonicalId, pendingPayload.payloadBase64, pendingPayload.authoritative);
      flushHydratedModulePatches();
    }
  };

  const applyActiveModuleState = (hostState: HostState) => {
    if (hostState.selectedModuleId && hostState.activeModuleStateBase64 === undefined) {
      const canonicalId = canonicalModuleId(hostState.selectedModuleId);
      if ((moduleHydration[canonicalId]?.phase ?? "unseen") === "unseen") {
        setModuleHydration(canonicalId, { phase: "hydrating" });
      }
    }

    const activeModuleId = hostState.activeModuleId ?? hostState.selectedModuleId;
    if (!activeModuleId || hostState.activeModuleStateBase64 === undefined) {
      return;
    }

    const canonicalId = canonicalModuleId(activeModuleId);
    const authoritative = hostState.type === "hostSyncProto";
    if ((moduleInteractionCounts.get(canonicalId) ?? 0) > 0) {
      pendingActiveModulePayloads.set(canonicalId, {
        authoritative,
        payloadBase64: hostState.activeModuleStateBase64,
      });
      return;
    }

    applyActiveModulePayload(canonicalId, hostState.activeModuleStateBase64, authoritative);
  };

  onMount(() => {
    moduleSdk.registerReady();
    const unsubscribe = subscribeHostState((hostState) => {
      applyInputState(hostState);
      reconcileControllerConfigEcho(hostState);
      applyLegacyModuleStates(hostState);
      applyEditorViewStates(hostState);
      applyActiveModuleState(hostState);
      flushHydratedModulePatches();
    });
    onCleanup(() => {
      unsubscribe();
      if (controllerConfigEchoTimeout !== undefined) {
        window.clearTimeout(controllerConfigEchoTimeout);
      }
    });
  });

  const contextValue: PadPilotContextValue = {
    gamepad,
    inputDevices,
    midiHistory,
    beginModuleInteraction,
    endModuleInteraction,
    emitMidi: (event) =>
      setMidiHistory((prev) => {
        const history = [...prev, event];
        return history.slice(-128);
      }),
    controllerConfig,
    setControllerConfig: (next) => {
      const normalized = normalizeControllerConfig(next);
      const payloadBase64 = encodeControllerConfigRequestBase64(normalized);
      setControllerConfig(normalized);
      setPendingControllerConfigPayload(payloadBase64);
      deferredControllerConfigEcho = null;
      if (controllerConfigEchoTimeout !== undefined) {
        window.clearTimeout(controllerConfigEchoTimeout);
      }
      controllerConfigEchoTimeout = window.setTimeout(() => {
        controllerConfigEchoTimeout = undefined;
        setPendingControllerConfigPayload(null);
        setControllerConfig(deferredControllerConfigEcho ?? lastAuthoritativeControllerConfig);
        deferredControllerConfigEcho = null;
      }, CONTROLLER_CONFIG_ECHO_TIMEOUT_MS);
      moduleSdk.setControllerConfig(payloadBase64);
    },
    selectedProfile,
    setSelectedProfile,
    getModuleState: <T,>(moduleId: string, fallback: T) => {
      const canonicalId = canonicalModuleId(moduleId);
      const aliases = moduleIdAliases(moduleId);
      let current: unknown;
      for (const alias of aliases) {
        if (
          moduleStateMap[alias] !== undefined &&
          moduleStateMap[alias] !== null
        ) {
          current = moduleStateMap[alias];
          break;
        }
      }
      if (current === undefined) {
        if ((moduleHydration[canonicalId]?.phase ?? "unseen") !== "hydrated") {
          return fallback;
        }
        return fallback;
      }

      const currentRecord = toRecord(current);
      const fallbackRecord = toRecord(fallback);
      if (currentRecord && fallbackRecord) {
        const hydrated = { ...fallbackRecord, ...currentRecord } as T;
        return hydrated;
      }
      return current as T;
    },
    setModuleState: <T,>(moduleId: string, next: Partial<T>) => {
      const canonicalId = canonicalModuleId(moduleId);
      const phase = moduleHydration[canonicalId]?.phase ?? "unseen";
      if (phase === "unseen" || phase === "hydrating") {
        const patch = toRecord(next);
        if (!patch) {
          return;
        }
        const queuedPatch = {
          ...(pendingPreHydrationModulePatches.get(canonicalId) ?? {}),
          ...patch,
        };
        const cachedValue = {
          ...(toRecord(moduleStateMap[canonicalId]) ?? {}),
          ...patch,
        };
        if (!getModuleStateCodec<unknown>(canonicalId) && serializeJsonState(cachedValue) === null) {
          return;
        }
        pendingPreHydrationModulePatches.set(canonicalId, queuedPatch);
        setModuleStateMap(canonicalId, cachedValue);
        setModuleHydration(canonicalId, { phase: "hydrating" });
        return;
      }
      commitModuleState(canonicalId, next);
    },
    getEditorViewState: <T,>(scopeId: string, fallback: T) => {
      const current = editorViewStateMap[scopeId];
      if (current === undefined) {
        return fallback;
      }
      const currentRecord = toRecord(current);
      const fallbackRecord = toRecord(fallback);
      if (currentRecord && fallbackRecord) {
        return { ...fallbackRecord, ...currentRecord } as T;
      }
      return current as T;
    },
    setEditorViewState: <T,>(scopeId: string, next: Partial<T>) => {
      const prev = (editorViewStateMap[scopeId] ?? {}) as T;
      const prevRecord = toRecord(prev);
      const mergedValue = {
        ...(prevRecord ?? {}),
        ...(next as object),
      } as T;
      const payload = serializeJsonState(mergedValue);
      if (payload === null) {
        return;
      }
      setEditorViewStateMap(scopeId, mergedValue as unknown);
      moduleSdk.setEditorViewState(scopeId, payload);
    },
  };

  return (
    <PadPilotContext.Provider value={contextValue}>
      {props.children}
    </PadPilotContext.Provider>
  );
}

export function ModuleSurface(
  props: ParentProps<{ scopeId: string; class?: string }>
) {
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const scope = createMemo<ModuleScopeValue>(() => ({
    scopeId: props.scopeId,
    container,
  }));

  return (
    <div
      ref={setContainer}
      data-pp-module-scope={props.scopeId}
      class={props.class}
    >
      <ModuleScopeContext.Provider value={scope()}>
        {props.children}
      </ModuleScopeContext.Provider>
    </div>
  );
}

export function useModuleScope() {
  const value = useContext(ModuleScopeContext);
  if (!value) {
    throw new Error("useModuleScope must be used inside ModuleSurface.");
  }

  return value;
}

function usePadPilotContext() {
  const value = useContext(PadPilotContext);
  if (!value) {
    throw new Error("PadPilot hooks must be used inside PadPilotProvider.");
  }

  return value;
}

export function useGamepad() {
  const context = usePadPilotContext();
  return context.gamepad;
}

export function useInputDevices() {
  const context = usePadPilotContext();
  return context.inputDevices;
}

export function useControllerConfig() {
  const context = usePadPilotContext();
  return {
    config: context.controllerConfig,
    setConfig: context.setControllerConfig,
  };
}

export function useMidi() {
  const context = usePadPilotContext();
  return {
    history: context.midiHistory,
    latest: createMemo(() => {
      const history = context.midiHistory();
      return history[history.length - 1];
    }),
    emit: context.emitMidi,
  };
}

export function useModuleState<T>(
  moduleId: string,
  fallback: T
) {
  const context = usePadPilotContext();

  const value = createMemo(() => context.getModuleState<T>(moduleId, fallback));
  const update = (next: Partial<T>) =>
    context.setModuleState<T>(moduleId, next);
  return [value, update] as const;
}

export function useModuleInteraction(moduleId: string) {
  const context = usePadPilotContext();
  const canonicalId = canonicalModuleId(moduleId);
  let activeCount = 0;

  onCleanup(() => {
    while (activeCount > 0) {
      activeCount -= 1;
      context.endModuleInteraction(canonicalId);
    }
  });

  return {
    begin: () => {
      activeCount += 1;
      context.beginModuleInteraction(canonicalId);
    },
    end: () => {
      if (activeCount === 0) {
        return;
      }
      activeCount -= 1;
      context.endModuleInteraction(canonicalId);
    },
  };
}

export function useProfile() {
  const context = usePadPilotContext();
  return {
    profile: context.selectedProfile,
    setProfile: context.setSelectedProfile,
  };
}

export function useEditorViewState<T>(
  scopeId: string,
  fallback: T
) {
  const context = usePadPilotContext();
  const value = createMemo(() =>
    context.getEditorViewState<T>(scopeId, fallback)
  );
  const update = (next: Partial<T>) =>
    context.setEditorViewState<T>(scopeId, next);
  return [value, update] as const;
}

export const IO = {
  upload: (props: UploadWidgetProps) => upload(props),
  importFile: (input: File | string, options: HostFileImportOptions = {}) => importHostFile(input, options),
  pickFile: async (options: HostFilePickOptions = {}) => {
    const result = await pickHostFile(options);
    return result.cancelled ? null : result.path;
  },
  bindController,
  bindInputDevices,
};
