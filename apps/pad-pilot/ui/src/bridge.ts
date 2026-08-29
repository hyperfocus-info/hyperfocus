import { fromBinary } from "@bufbuild/protobuf";
import { base64ToBytes, bytesToBase64 } from "./proto/base64";
import { CapabilityFrameEnvelopeSchema } from "./proto/generated/capability-pb";
import { ControllerLayoutKind } from "./proto/generated/bridge-pb";
import { canonicalModuleId } from "@hyperfocus/pad-pilot/module-identity";
import { fileNameFromPath } from "./utils/file-path";
import {
  controllerBindingKindFromProto,
  controllerLayoutKindFromProto,
  createDefaultControllerConfig,
  normalizeControllerConfig,
} from "./padpilot/controller-config";
import type { PadPilotInputDeviceState } from "./padpilot/io/input-device";
import { fileImportBeginResultSchema, hostFilePickResultSchema, installedModuleResultSchema, parseImportedHostFile, parseNativeJson, runtimeInfoSchema, stagedPluginUpdateSchema } from "./bridge-native-contracts";
import { PADPILOT_FILE_IMPORT_MAX_BYTES } from "@hyperfocus/pad-pilot/file-import";
import { hasValidHostStateShape, isBoundedHostProtoPayload, isBoundedHostStateObject, MAX_HOST_JSON_INGRESS_CHARS } from "./bridge-ingress";
import { createCapabilityStreamRegistry, getCoalescedCapabilityIntent, getQueuedCapabilityIntentKey } from "./bridge-capability-streams";
export { isBoundedHostProtoPayload, MAX_HOST_JSON_INGRESS_CHARS, MAX_HOST_PROTO_INGRESS_BYTES } from "./bridge-ingress";

import { type HostIntent, type CapabilityKind, type CoalescedCapabilityIntent, type NativePromiseListener, type HostState, type StagePluginUpdateInput, type HostFilePickOptions, type HostFilePickResult, type HostFileImportOptions, type HostImportedFile, type HostTransport, type CapabilityStreamFrame } from "./bridge-contracts";
export { type HostIntent, type CapabilityKind, type HostState, type RuntimeHostMode, type PadPilotRuntimeInfo, type StagePluginUpdateInput, type StagedPluginUpdate, type HostFilePickOptions, type HostFilePickResult, type HostFileImportOptions, type HostImportedFile, type InstalledModuleResult, type HostTransport, type CapabilityStreamFrame } from "./bridge-contracts";

type HostStateListener = (state: HostState) => void;
type CapabilityStreamListener = (frame: CapabilityStreamFrame) => void;

declare global {
  interface Window {
    __PADPILOT_DEV_IMPORTED_FILES__?: Record<string, {
      byteSize?: number;
      bytesBase64: string;
      mimeType: string;
      name: string;
    }>;
    __JUCE__?: {
      backend?: {
        addEventListener?: (eventId: string, listener: (payload: unknown) => void) => number;
        emitEvent?: (eventId: string, payload: unknown) => void;
      };
      initializationData?: {
        __juce__functions?: string[];
      };
    };
    padpilotHostReceive?: (payload: string | HostState) => void;
    padpilotHostReceiveProto?: (messageType: string, payloadBase64: string) => void;
  }
}

const listeners = new Set<HostStateListener>();
const nativeSubscribers = new Set<HostStateListener>();
const queuedCapabilityIntent = new Map<string, CoalescedCapabilityIntent>();
const queuedModuleState = new Map<string, Extract<HostIntent, { type: "setModuleStateProto" } | { type: "setModuleState" } | { type: "setControllerConfig" }>>();
const nativeListeners = new Map<number, NativePromiseListener>();
const acceptedModuleRevisions = new Map<string, bigint>();
const capabilityStreams = createCapabilityStreamRegistry();
let activeTransport: HostTransport | null = null;
let activeTransportUnsubscribe: (() => void) | null = null;
let flushHandle: number | undefined;
let latestHostState: HostState = {};
let nativeBridgeReady = false;
let nextPromiseId = 1;
let devHostRuntimeModulePromise: Promise<typeof import("./dev-host/runtime")> | null = null;
let fxChainStateModulePromise: Promise<typeof import("./modules/fx/fx-chain-state")> | null = null;
let pendingIntentFlushHandlersInstalled = false;
const FILE_IMPORT_CHUNK_BYTES = 256 * 1024;
const MAX_DEV_IMPORTED_FILES = 4;
const NATIVE_FUNCTION_TIMEOUT_MS = 15_000;

function controllerLayoutFromProtoValue(value: number) {
  return controllerLayoutKindFromProto(value as ControllerLayoutKind);
}

function mapInputDeviceFromProto(device: {
  connected: boolean;
  deviceId: string;
  runtimeDeviceId?: string;
  hardwareId?: string;
  deviceKind: number;
  displayName: string;
  frameIndex: number;
  axes: number[];
  buttons: number[];
  rawAxes?: number[];
  rawButtons?: number[];
  detectedLayoutKind?: number;
  activeLayoutKind?: number;
}) {
  return {
    connected: device.connected,
    deviceId: device.deviceId,
    runtimeDeviceId: device.runtimeDeviceId ?? device.deviceId,
    hardwareId: device.hardwareId ?? device.deviceId,
    deviceKind: device.deviceKind === 1 ? "gamepad" : "unknown",
    displayName: device.displayName,
    frameIndex: device.frameIndex,
    axes: [...device.axes],
    buttons: [...device.buttons],
    rawAxes: [...(device.rawAxes ?? [])],
    rawButtons: [...(device.rawButtons ?? [])],
    detectedLayoutKind: controllerLayoutFromProtoValue(device.detectedLayoutKind ?? 0),
    activeLayoutKind: controllerLayoutFromProtoValue(device.activeLayoutKind ?? 0),
  } satisfies PadPilotInputDeviceState;
}

function loadDevHostRuntimeModule() {
  devHostRuntimeModulePromise ??= import("./dev-host/runtime");
  return devHostRuntimeModulePromise;
}

function loadFxChainStateModule() {
  fxChainStateModulePromise ??= import("./modules/fx/fx-chain-state");
  return fxChainStateModulePromise;
}

type FxChainStateModule = Awaited<ReturnType<typeof loadFxChainStateModule>>;

function runDeferredHostDecoder(callback: (module: FxChainStateModule) => void) {
  loadFxChainStateModule().then((module) => {
    try {
      callback(module);
    } catch {
      // Native host ingress is untrusted at this boundary; malformed frames are dropped.
    }
  }).catch(() => {
    fxChainStateModulePromise = null;
    // A failed lazy decoder import must not create an unhandled rejection in the WebView.
  });
}

function ensureNativeBridge() {
  if (nativeBridgeReady) {
    return;
  }

  if (!window.__JUCE__?.backend?.addEventListener) {
    return;
  }

  window.__JUCE__.backend.addEventListener("__juce__complete", (payload: unknown) => {
    const data = payload as { promiseId?: number; result?: unknown };
    const promiseId = data.promiseId ?? 0;
    const listener = nativeListeners.get(promiseId);
    if (!listener) {
      return;
    }
    nativeListeners.delete(promiseId);
    if (listener.timeoutHandle !== undefined) {
      window.clearTimeout(listener.timeoutHandle);
    }
    listener.resolve(data.result);
  });
  nativeBridgeReady = true;
}

function rejectPendingNativeCalls(message: string) {
  for (const [promiseId, listener] of Array.from(nativeListeners.entries())) {
    nativeListeners.delete(promiseId);
    if (listener.timeoutHandle !== undefined) {
      window.clearTimeout(listener.timeoutHandle);
    }
    listener.reject(new Error(message));
  }
}

function getNativeFunction(name: string) {
  ensureNativeBridge();
  if (!window.__JUCE__?.backend?.emitEvent) {
    return null;
  }
  const available = window.__JUCE__?.initializationData?.__juce__functions ?? [];
  if (available.length > 0 && !available.includes(name)) {
    return null;
  }

  return (...params: unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      const promiseId = nextPromiseId;
      nextPromiseId += 1;
      const listener: NativePromiseListener = {
        reject,
        resolve,
      };
      nativeListeners.set(promiseId, listener);
      listener.timeoutHandle = window.setTimeout(() => {
        if (!nativeListeners.delete(promiseId)) {
          return;
        }
        reject(new Error(`Native function ${name} timed out.`));
      }, NATIVE_FUNCTION_TIMEOUT_MS);

      try {
        window.__JUCE__?.backend?.emitEvent?.("__juce__invoke", {
          name,
          params,
          resultId: promiseId,
        });
      } catch (error) {
        if (!nativeListeners.delete(promiseId)) {
          return;
        }
        window.clearTimeout(listener.timeoutHandle);
        reject(error instanceof Error ? error : new Error(`Native function ${name} failed.`));
      }
    });
}

function normalizeFileImportOptions(options: HostFileImportOptions = {}) {
  const requestedMaxBytes = options.maxBytes ?? PADPILOT_FILE_IMPORT_MAX_BYTES;
  const finiteMaxBytes = Number.isFinite(requestedMaxBytes)
    ? Math.floor(requestedMaxBytes)
    : PADPILOT_FILE_IMPORT_MAX_BYTES;
  return {
    category: options.category?.trim() || "sample",
    maxBytes: Math.min(PADPILOT_FILE_IMPORT_MAX_BYTES, Math.max(1, finiteMaxBytes)),
  };
}

function fileExtension(name: string) {
  const match = /\.[^./\\]+$/.exec(name);
  return match?.[0]?.toLowerCase() ?? "";
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function base64DecodedByteSize(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

async function buildSyntheticContentId(bytes: Uint8Array) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    return bytesToHex(new Uint8Array(digest));
  }

  let hash = 2166136261;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return hash.toString(16).padStart(8, "0");
}

async function buildDevImportedFile(input: File | string, options: HostFileImportOptions = {}) {
  const normalized = normalizeFileImportOptions(options);
  if (typeof input === "string") {
    const name = fileNameFromPath(input, "imported-file");
    const contentId = await buildSyntheticContentId(new TextEncoder().encode(input));
    return {
      byteSize: 0,
      contentId,
      mimeType: "application/octet-stream",
      name,
      path: `virtual://padpilot/media/${normalized.category}s/${contentId}${fileExtension(name)}`,
    } satisfies HostImportedFile;
  }

  if (input.size <= 0) {
    throw new Error("Imported sample is empty.");
  }
  if (input.size > normalized.maxBytes) {
    throw new Error("Imported sample exceeds the configured size limit.");
  }
  if (input.name.length > 256 || input.type.length > 128) {
    throw new Error("Imported sample metadata is too long.");
  }

  const bytes = new Uint8Array(await input.arrayBuffer());
  const contentId = await buildSyntheticContentId(bytes);
  window.__PADPILOT_DEV_IMPORTED_FILES__ ??= {};
  const retainedEntries = Object.entries(window.__PADPILOT_DEV_IMPORTED_FILES__)
    .filter(([entryContentId]) => entryContentId !== contentId);
  let retainedBytes = retainedEntries.reduce(
    (total, [, entry]) => total + (entry.byteSize ?? base64DecodedByteSize(entry.bytesBase64)),
    0,
  );
  while (
    retainedEntries.length >= MAX_DEV_IMPORTED_FILES ||
    retainedBytes + bytes.length > PADPILOT_FILE_IMPORT_MAX_BYTES
  ) {
    const removed = retainedEntries.shift();
    if (!removed) {
      break;
    }
    retainedBytes -= removed[1].byteSize ?? base64DecodedByteSize(removed[1].bytesBase64);
    delete window.__PADPILOT_DEV_IMPORTED_FILES__[removed[0]];
  }
  window.__PADPILOT_DEV_IMPORTED_FILES__[contentId] = {
    byteSize: bytes.length,
    bytesBase64: bytesToBase64(bytes),
    mimeType: input.type || "application/octet-stream",
    name: input.name,
  };
  return {
    byteSize: input.size,
    contentId,
    mimeType: input.type || "application/octet-stream",
    name: input.name,
    path: `virtual://padpilot/media/${normalized.category}s/${contentId}${fileExtension(input.name)}`,
  } satisfies HostImportedFile;
}

function getSelectedModuleId() {
  const moduleId = latestHostState.selectedModuleId ?? latestHostState.activeModuleId ?? "";
  return canonicalModuleId(moduleId);
}

function suppressStaleActiveModuleState(state: HostState) {
  if (state.activeModuleStateBase64 === undefined || state.acceptedRevision === undefined) {
    return state;
  }

  const moduleId = state.activeModuleId ?? state.selectedModuleId ?? latestHostState.selectedModuleId;
  if (!moduleId) {
    return state;
  }

  const canonicalId = canonicalModuleId(moduleId);
  if (state.type === "hostSyncProto") {
    acceptedModuleRevisions.clear();
    acceptedModuleRevisions.set(canonicalId, state.acceptedRevision);
    return state;
  }

  const lastAcceptedRevision = acceptedModuleRevisions.get(canonicalId);
  if (lastAcceptedRevision !== undefined && state.acceptedRevision < lastAcceptedRevision) {
    const freshState = { ...state };
    delete freshState.acceptedRevision;
    delete freshState.activeModuleId;
    delete freshState.activeModuleStateBase64;
    return freshState;
  }

  acceptedModuleRevisions.set(canonicalId, state.acceptedRevision);
  return state;
}

function publishHostState(state: HostState) {
  state = suppressStaleActiveModuleState(state);
  const previousSelectedModuleId = latestHostState.selectedModuleId;
  const selectedModuleChanged =
    state.selectedModuleId !== undefined &&
    state.selectedModuleId !== previousSelectedModuleId;
  const nextHostState = { ...latestHostState, ...state };
  if (state.controllerConfig !== undefined) {
    nextHostState.controllerConfig = normalizeControllerConfig(state.controllerConfig);
  }
  if (
    selectedModuleChanged &&
    !Object.prototype.hasOwnProperty.call(state, "activeModuleStateBase64")
  ) {
    delete nextHostState.activeModuleStateBase64;
    delete nextHostState.acceptedRevision;
    nextHostState.activeModuleId = state.selectedModuleId;
  }
  latestHostState = nextHostState;
  if (state.capabilityFrameEnvelopeBase64) {
    try {
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(state.capabilityFrameEnvelopeBase64));
      capabilityStreams.publish({
        capability: envelope.capability as CapabilityKind,
        handle: envelope.handle,
        payloadBase64: bytesToBase64(envelope.payload),
        payloadType: envelope.payloadType,
        sequence: envelope.sequence,
      }, getSelectedModuleId());
    } catch {
      // Malformed capability payload must not poison later host state.
    }
  }
  if (
    state.selectedModuleId !== undefined &&
    previousSelectedModuleId !== undefined &&
    state.selectedModuleId !== previousSelectedModuleId
  ) {
    capabilityStreams.closeAllOpen(sendIntent);
  }
  if (state.selectedModuleId !== undefined) {
    capabilityStreams.reopenRequested(getSelectedModuleId(), selectedModuleChanged, sendIntent);
  }
  for (const listener of listeners) {
    try {
      listener(latestHostState);
    } catch {
      // Public Module listeners cannot block provider/store reconciliation.
    }
  }
}

function publishNativeHostState(state: HostState) {
  if (nativeSubscribers.size === 0) {
    publishHostState(state);
    return;
  }
  for (const listener of nativeSubscribers) {
    try {
      listener(state);
    } catch {
      // One native transport subscriber cannot block remaining consumers.
    }
  }
}

window.padpilotHostReceive = (payload) => {
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    if (payload.length > MAX_HOST_JSON_INGRESS_CHARS) {
      return;
    }
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
  }
  if (!isBoundedHostStateObject(parsed) || !hasValidHostStateShape(parsed)) {
    return;
  }
  publishNativeHostState(parsed as HostState);
};

window.padpilotHostReceiveProto = (messageType, payloadBase64) => {
  if (messageType.length > 64 || !isBoundedHostProtoPayload(payloadBase64)) {
    return;
  }
  if (messageType === "VisualizerFrame") {
    publishNativeHostState({
      type: "visualizerFrameProto",
      visualizerFrameBase64: payloadBase64,
    });
    return;
  }

  if (messageType === "CapabilityFrameEnvelope") {
    try {
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(payloadBase64));
      const capability = envelope.capability as CapabilityKind;
      const payload = bytesToBase64(envelope.payload);
      capabilityStreams.publish({
        capability,
        handle: envelope.handle,
        payloadBase64: payload,
        payloadType: envelope.payloadType,
        sequence: envelope.sequence,
      }, getSelectedModuleId());
      publishNativeHostState({
        type: "capabilityFrameEnvelopeProto",
      });
    } catch {
      // Drop malformed capability envelopes without destabilizing the host page.
    }
    return;
  }

  if (messageType === "HostSyncFrame") {
    runDeferredHostDecoder(({ decodeHostSyncFrameBase64 }) => {
      const frame = decodeHostSyncFrameBase64(payloadBase64);
      publishNativeHostState({
        acceptedRevision: frame.acceptedRevision,
        activeModuleId: frame.selectedModuleId,
        activeModuleStateBase64: bytesToBase64(frame.activeModuleState),
        controller: {
          connected: frame.controllerConnected,
          frameIndex: frame.controllerFrameIndex,
          axes: [...frame.controllerAxes],
          buttons: [...frame.controllerButtons],
        },
        controllerConfig: normalizeControllerConfig({
          rows: frame.controllerConfig?.rows.map((row) => ({
            stableId: row.stableId,
            hardwareId: row.hardwareId,
            layoutKind: controllerLayoutFromProtoValue(row.layoutKind),
            customLayoutId: row.customLayoutId,
            isPrimary: row.isPrimary,
          })) ?? createDefaultControllerConfig().rows,
          customLayouts: frame.controllerConfig?.customLayouts.map((layout) => ({
            id: layout.id,
            name: layout.name,
            buttonBindings: layout.buttonBindings.map((binding) => ({
              bindingKind: controllerBindingKindFromProto(binding.bindingKind),
              sourceIndex: binding.sourceIndex,
              threshold: binding.threshold,
            })),
            axisBindings: layout.axisBindings.map((binding) => ({
              sourceIndex: binding.sourceIndex,
              inverted: binding.inverted,
            })),
          })) ?? [],
        }),
        inputDevices: frame.inputDevices.map((device) => mapInputDeviceFromProto(device)),
        editorViewStates: Object.fromEntries(frame.editorViewStates.map((entry) => {
          try {
            return [entry.scopeId, JSON.parse(entry.payloadJson)];
          } catch {
            return [entry.scopeId, entry.payloadJson];
          }
        })),
        modules: frame.modules.map((moduleItem: (typeof frame.modules)[number]) => ({
          id: moduleItem.id,
          name: moduleItem.name,
          version: moduleItem.version,
          capabilities: [...moduleItem.capabilities],
          loadStatus: moduleItem.loadStatus,
          loadErrorMessage: moduleItem.loadErrorMessage,
          expectedModuleVersion: moduleItem.expectedModuleVersion,
          resolvedModuleVersion: moduleItem.resolvedModuleVersion,
          uiEntryPath: moduleItem.uiEntryPath,
          scriptEntryPath: moduleItem.scriptEntryPath,
        })),
        presets: frame.presets.map((preset: (typeof frame.presets)[number]) => ({ id: preset.id, name: preset.name })),
        projectBpm: frame.projectBpm,
        selectedModuleId: frame.selectedModuleId,
        selectedPresetId: frame.selectedPresetId,
        type: "hostSyncProto",
      });
    });
    return;
  }

  if (messageType === "NavigationFrame") {
    runDeferredHostDecoder(({ decodeNavigationFrameBase64 }) => {
      const frame = decodeNavigationFrameBase64(payloadBase64);
      publishNativeHostState({
        modules: frame.modules.map((moduleItem: (typeof frame.modules)[number]) => ({
          id: moduleItem.id,
          name: moduleItem.name,
          version: moduleItem.version,
          capabilities: [...moduleItem.capabilities],
          loadStatus: moduleItem.loadStatus,
          loadErrorMessage: moduleItem.loadErrorMessage,
          expectedModuleVersion: moduleItem.expectedModuleVersion,
          resolvedModuleVersion: moduleItem.resolvedModuleVersion,
          uiEntryPath: moduleItem.uiEntryPath,
          scriptEntryPath: moduleItem.scriptEntryPath,
        })),
        presets: frame.presets.map((preset: (typeof frame.presets)[number]) => ({ id: preset.id, name: preset.name })),
        selectedModuleId: frame.selectedModuleId,
        selectedPresetId: frame.selectedPresetId,
        type: "navigationFrameProto",
      });
    });
    return;
  }

  if (messageType === "ActiveModuleStateFrame") {
    runDeferredHostDecoder(({ decodeActiveModuleStateFrameBase64 }) => {
      const frame = decodeActiveModuleStateFrameBase64(payloadBase64);
      publishNativeHostState({
        acceptedRevision: frame.acceptedRevision,
        activeModuleId: frame.moduleId,
        activeModuleStateBase64: bytesToBase64(frame.payload),
        projectBpm: frame.projectBpm,
        type: "activeModuleStateFrameProto",
      });
    });
    return;
  }

  if (messageType === "InputStateFrame") {
    runDeferredHostDecoder(({ decodeInputStateFrameBase64 }) => {
      const frame = decodeInputStateFrameBase64(payloadBase64);
      publishNativeHostState({
        controller: {
          connected: frame.controllerConnected,
          frameIndex: frame.controllerFrameIndex,
          axes: [...frame.controllerAxes],
          buttons: [...frame.controllerButtons],
        },
        controllerConfig: normalizeControllerConfig({
          rows: frame.controllerConfig?.rows.map((row) => ({
            stableId: row.stableId,
            hardwareId: row.hardwareId,
            layoutKind: controllerLayoutFromProtoValue(row.layoutKind),
            customLayoutId: row.customLayoutId,
            isPrimary: row.isPrimary,
          })) ?? createDefaultControllerConfig().rows,
          customLayouts: frame.controllerConfig?.customLayouts.map((layout) => ({
            id: layout.id,
            name: layout.name,
            buttonBindings: layout.buttonBindings.map((binding) => ({
              bindingKind: controllerBindingKindFromProto(binding.bindingKind),
              sourceIndex: binding.sourceIndex,
              threshold: binding.threshold,
            })),
            axisBindings: layout.axisBindings.map((binding) => ({
              sourceIndex: binding.sourceIndex,
              inverted: binding.inverted,
            })),
          })) ?? [],
        }),
        inputDevices: frame.inputDevices.map((device) => mapInputDeviceFromProto(device)),
        type: "inputStateFrameProto",
      });
    });
    return;
  }
};

class NativeHostTransport implements HostTransport {
  isAvailable() {
    return Boolean(window.__JUCE__?.backend?.emitEvent || window.__JUCE__?.backend?.addEventListener);
  }

  subscribe(listener: (state: HostState) => void) {
    nativeSubscribers.add(listener);
    return () => {
      nativeSubscribers.delete(listener);
    };
  }

  sendIntent(intent: HostIntent) {
    const nativeBridge = getNativeFunction("padpilotBridge");
    if (nativeBridge) {
      nativeBridge(JSON.stringify(intent)).catch(() => undefined);
      return;
    }

    const encoded = encodeURIComponent(JSON.stringify(intent));
    window.location.href = `padpilot://bridge/${encoded}`;
  }
}

class DevHostTransport implements HostTransport {
  isAvailable() {
    return !hasNativeHostTransport();
  }

  subscribe(listener: (state: HostState) => void) {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    loadDevHostRuntimeModule().then(({ getDevHostRuntime }) => {
      if (cancelled) {
        return;
      }
      unsubscribe = getDevHostRuntime().subscribe(listener);
    }).catch(() => {
      devHostRuntimeModulePromise = null;
      // Dev-host chunk failures stay contained and a later subscription may retry.
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  sendIntent(intent: HostIntent) {
    loadDevHostRuntimeModule().then(({ getDevHostRuntime }) => {
      getDevHostRuntime().sendIntent(intent);
    }).catch(() => {
      devHostRuntimeModulePromise = null;
      // Dev-host chunk failures stay contained and a later intent may retry.
    });
  }
}

const nativeHostTransport = new NativeHostTransport();
const devHostTransport = new DevHostTransport();

export function hasNativeHostTransport() {
  return nativeHostTransport.isAvailable();
}

function getActiveTransport() {
  return hasNativeHostTransport() ? nativeHostTransport : devHostTransport;
}

function ensureTransportSubscription() {
  const transport = getActiveTransport();
  if (activeTransport === transport) {
    return transport;
  }

  activeTransportUnsubscribe?.();
  activeTransport = transport;
  activeTransportUnsubscribe = transport.subscribe((state) => publishHostState(state));
  return transport;
}

function flushQueuedIntents() {
  if (flushHandle !== undefined) {
    window.clearTimeout(flushHandle);
    flushHandle = undefined;
  }
  const transport = ensureTransportSubscription();
  queuedModuleState.forEach((intent) => transport.sendIntent(intent));
  queuedCapabilityIntent.forEach((intent) => transport.sendIntent(intent));
  queuedModuleState.clear();
  queuedCapabilityIntent.clear();
}

function flushQueuedCapabilityIntents(
  transport: HostTransport,
  shouldFlush: (intent: CoalescedCapabilityIntent) => boolean,
) {
  for (const [key, intent] of Array.from(queuedCapabilityIntent.entries())) {
    if (!shouldFlush(intent)) {
      continue;
    }
    transport.sendIntent(intent);
    queuedCapabilityIntent.delete(key);
  }
}

function scheduleFlush() {
  if (flushHandle !== undefined) {
    return;
  }

  flushHandle = window.setTimeout(flushQueuedIntents, 16);
}

function installPendingIntentFlushHandlers() {
  if (pendingIntentFlushHandlersInstalled || typeof window === "undefined") {
    return;
  }

  const flushPendingIntents = () => {
    flushQueuedIntents();
    capabilityStreams.closeAllOpen(sendIntent);
  };
  window.addEventListener("pagehide", flushPendingIntents);
  window.addEventListener("beforeunload", flushPendingIntents);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingIntents();
    }
  });
  pendingIntentFlushHandlersInstalled = true;
}

installPendingIntentFlushHandlers();

export function sendIntent(intent: HostIntent) {
  const transport = ensureTransportSubscription();
  const coalescedIntent = getCoalescedCapabilityIntent(intent);
  if (coalescedIntent) {
    queuedCapabilityIntent.set(getQueuedCapabilityIntentKey(coalescedIntent), coalescedIntent);
    scheduleFlush();
    return;
  }

  if (intent.type === "setModuleState" || intent.type === "setModuleStateProto") {
    queuedModuleState.set(intent.moduleId, intent);
    scheduleFlush();
    return;
  }

  if (intent.type === "setControllerConfig") {
    queuedModuleState.set("__controller_config__", intent);
    scheduleFlush();
    return;
  }

  if (intent.type === "sendCapabilityIntent") {
    flushQueuedCapabilityIntents(
      transport,
      (queuedIntent) =>
        queuedIntent.capability === intent.capability &&
        queuedIntent.handle === intent.handle,
    );
  }

  transport.sendIntent(intent);
}

export async function getPadPilotRuntimeInfo() {
  const nativeGetter = getNativeFunction("padpilotGetRuntimeInfo");
  if (nativeGetter) {
    const payload = String(await nativeGetter());
    if (payload.startsWith("error:")) {
      throw new Error(payload.slice(6));
    }
    return parseNativeJson(runtimeInfoSchema, payload, "runtime info");
  }

  return {
    arch: "x64",
    canApplyUpdates: false,
    currentVersion: "0.1.0-dev",
    defaultInstallPath: null,
    hostMode: "standalone" as const,
    installPath: null,
    platform: "windows",
  };
}

export async function stagePluginUpdate(input: StagePluginUpdateInput) {
  const nativeStage = getNativeFunction("padpilotStagePluginUpdate");
  if (!nativeStage) {
    throw new Error("Native updater is unavailable in the browser dev host.");
  }
  const payload = String(await nativeStage(JSON.stringify(input)));
  if (payload.startsWith("error:")) {
    throw new Error(payload.slice(6));
  }
  return parseNativeJson(stagedPluginUpdateSchema, payload, "update staging");
}

export async function restartAndApplyPluginUpdate() {
  const nativeRestart = getNativeFunction("padpilotRestartAndApplyPluginUpdate");
  if (!nativeRestart) {
    throw new Error("Restart-and-apply is unavailable in the browser dev host.");
  }
  const payload = await nativeRestart();
  if (typeof payload === "string" && payload.startsWith("error:")) {
    throw new Error(payload.slice(6));
  }
}

export async function pickHostFile(options: HostFilePickOptions = {}) {
  const nativePicker = getNativeFunction("padpilotPickFile");
  if (!nativePicker) {
    return {
      cancelled: true,
      path: "",
    } satisfies HostFilePickResult;
  }

  const payload = String(await nativePicker(JSON.stringify(options)));
  if (payload.startsWith("error:")) {
    throw new Error(payload.slice(6));
  }
  return parseNativeJson(hostFilePickResultSchema, payload, "file picker");
}

export async function importHostFile(input: File | string, options: HostFileImportOptions = {}) {
  const normalized = normalizeFileImportOptions(options);
  const nativeHost = hasNativeHostTransport();
  const nativeImportPath = getNativeFunction("padpilotImportFilePath");
  const nativeBegin = getNativeFunction("padpilotBeginFileImport");
  const nativeAppend = getNativeFunction("padpilotAppendFileImport");
  const nativeFinish = getNativeFunction("padpilotFinishFileImport");
  const nativeCancel = getNativeFunction("padpilotCancelFileImport");

  if (typeof input === "string") {
    if (!nativeImportPath) {
      if (nativeHost) {
        throw new Error("PadPilot native file-path import bridge is unavailable.");
      }
      return buildDevImportedFile(input, normalized);
    }

    const payload = String(await nativeImportPath(JSON.stringify({
      category: normalized.category,
      maxBytes: normalized.maxBytes,
      path: input,
    })));
    if (payload.startsWith("error:")) {
      throw new Error(payload.slice(6));
    }
    return parseImportedHostFile(payload, normalized.maxBytes);
  }

  if (input.size <= 0) {
    throw new Error("Imported sample is empty.");
  }
  if (input.size > normalized.maxBytes) {
    throw new Error("Imported sample exceeds the configured size limit.");
  }
  if (input.name.length > 256 || input.type.length > 128) {
    throw new Error("Imported sample metadata is too long.");
  }

  if (!nativeBegin || !nativeAppend || !nativeFinish || !nativeCancel) {
    if (nativeHost) {
      throw new Error("PadPilot native file import bridge is unavailable.");
    }
    return buildDevImportedFile(input, normalized);
  }

  const beginPayload = String(await nativeBegin(JSON.stringify({
    byteSize: input.size,
    category: normalized.category,
    maxBytes: normalized.maxBytes,
    mimeType: input.type || "application/octet-stream",
    name: input.name,
  })));
  if (beginPayload.startsWith("error:")) {
    throw new Error(beginPayload.slice(6));
  }

  const { importId } = parseNativeJson(fileImportBeginResultSchema, beginPayload, "file import begin");

  try {
    const bytes = new Uint8Array(await input.arrayBuffer());
    for (let offset = 0; offset < bytes.length; offset += FILE_IMPORT_CHUNK_BYTES) {
      const chunk = bytes.slice(offset, offset + FILE_IMPORT_CHUNK_BYTES);
      const appendPayload = String(await nativeAppend(importId, bytesToBase64(chunk)));
      if (appendPayload.startsWith("error:")) {
        throw new Error(appendPayload.slice(6));
      }
    }

    const finishPayload = String(await nativeFinish(importId));
    if (finishPayload.startsWith("error:")) {
      throw new Error(finishPayload.slice(6));
    }
    return parseImportedHostFile(finishPayload, normalized.maxBytes);
  } catch (error) {
    try {
      await nativeCancel(importId);
    } catch {
      // Preserve original import error; cancellation is best effort.
    }
    throw error;
  }
}

export async function installHostModuleBundle(bundlePath: string) {
  const nativeInstall = getNativeFunction("padpilotInstallModuleBundle");
  if (!nativeInstall) {
    const { getDevHostRuntime } = await loadDevHostRuntimeModule();
    return getDevHostRuntime().installModuleBundle(bundlePath);
  }

  const payload = String(await nativeInstall(bundlePath));
  if (payload.startsWith("error:")) {
    throw new Error(payload.slice(6));
  }
  return parseNativeJson(installedModuleResultSchema, payload, "module install");
}

export function subscribeHostState(listener: HostStateListener) {
  listeners.add(listener);
  ensureTransportSubscription();
  if (Object.keys(latestHostState).length > 0) {
    try {
      listener(latestHostState);
    } catch {
      // Public listener failure cannot break subscription setup.
    }
  }
  return () => listeners.delete(listener);
}

export function getLatestHostState() {
  return latestHostState;
}

export function subscribeCapabilityStream(
  capability: CapabilityKind,
  handle: string,
  listener: CapabilityStreamListener,
) {
  ensureTransportSubscription();
  return capabilityStreams.subscribe(capability, handle, listener, sendIntent);
}

export function getCachedCapabilityStreamPayload(capability: CapabilityKind, handle: string) {
  return capabilityStreams.getCached(capability, handle);
}

export function resetBridgeStateForTests() {
  rejectPendingNativeCalls("Native bridge reset before completion.");
  activeTransportUnsubscribe?.();
  activeTransportUnsubscribe = null;
  activeTransport = null;
  latestHostState = {};
  nativeBridgeReady = false;
  nextPromiseId = 1;
  if (flushHandle !== undefined) {
    window.clearTimeout(flushHandle);
    flushHandle = undefined;
  }
  queuedCapabilityIntent.clear();
  queuedModuleState.clear();
  listeners.clear();
  nativeSubscribers.clear();
  acceptedModuleRevisions.clear();
  capabilityStreams.clear();
  delete window.__PADPILOT_DEV_IMPORTED_FILES__;
}


