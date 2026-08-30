import { bytesToBase64, jsonToBase64, textToBase64 } from "../proto/base64";
import { clamp01 } from "../utils/math";
import {
  getCachedCapabilityStreamPayload,
  getLatestHostState,
  sendIntent,
  subscribeCapabilityStream,
} from "../bridge";
import {
  decodeFxChainStateBase64,
  decodeVisualizerFrameBase64,
  encodeFxChainState,
  encodePresetSaveMessage,
  normalizeFxChainState,
  type FxChainState,
  type VisualizerFrame,
} from "../modules/fx/fx-chain-state";
import {
  canonicalModuleId,
  createCapabilityHandle,
  resolveSelectedCapabilityModuleId,
} from "@hyperfocus/pad-pilot/module-identity";

type FxVisualizerSubscription = {
  close: () => void;
  isClosed: () => boolean;
};

type FxVisualizerFrameListener = (frame: VisualizerFrame) => void;

type FxCapability = "automation" | "fx-graph" | "fx-visualizer";

function getSelectedFxModuleId(capability: FxCapability) {
  return resolveSelectedCapabilityModuleId(getLatestHostState(), capability);
}

function getFxCapabilityHandle(capability: FxCapability, requestedModuleId?: string) {
  const grantedModuleId = getSelectedFxModuleId(capability);
  if (!grantedModuleId || (requestedModuleId && canonicalModuleId(requestedModuleId) !== grantedModuleId)) {
    return "";
  }
  return createCapabilityHandle(capability, grantedModuleId);
}

function getActiveFxState(moduleId = getSelectedFxModuleId("fx-graph")) {
  const hostState = getLatestHostState();
  if (!moduleId || canonicalModuleId(hostState.selectedModuleId ?? hostState.activeModuleId ?? "") !== moduleId) {
    return null;
  }
  const payload = hostState.activeModuleStateBase64;
  return payload ? decodeFxChainStateBase64(payload) : null;
}

function encodeJsonPayload(value: unknown) {
  return jsonToBase64(value);
}

function sendFxGraphIntent(action: string, payloadBase64: string, moduleId?: string) {
  const handle = getFxCapabilityHandle("fx-graph", moduleId);
  if (!handle) {
    return;
  }
  sendIntent({
    type: "sendCapabilityIntent",
    capability: "fx-graph",
    handle,
    action,
    payloadBase64,
  });
}

function sendAutomationIntent(action: string, payloadBase64: string, moduleId?: string) {
  const handle = getFxCapabilityHandle("automation", moduleId);
  if (!handle) {
    return;
  }
  sendIntent({
    type: "sendCapabilityIntent",
    capability: "automation",
    handle,
    action,
    payloadBase64,
  });
}

export const fxGraph = {
  applyState(state: FxChainState, moduleId?: string) {
    const normalized = normalizeFxChainState(state);
    sendFxGraphIntent("apply-state", bytesToBase64(encodeFxChainState(normalized)), moduleId);
  },
  beginAutomationTouch(parameterId: string, moduleId?: string) {
    sendAutomationIntent("begin-touch", textToBase64(parameterId), moduleId);
  },
  createPreset(name: string, state: FxChainState, presetId = "", moduleId?: string) {
    sendFxGraphIntent("create-preset", encodePresetSaveMessage(name, state, presetId), moduleId);
  },
  endAutomationTouch(parameterId: string, moduleId?: string) {
    sendAutomationIntent("end-touch", textToBase64(parameterId), moduleId);
  },
  focusAutomationTarget(binding: {
    chainId: number;
    controlKey: string;
    displayName: string;
    maxValue: number;
    minValue: number;
    moduleId: string;
    nodeId: number;
    parameterId: number;
    slotIndex: number;
    targetKind: "masterInputGain" | "masterOutputGain" | "masterWetDry" | "fxChainMix" | "fxNodeMix" | "fxNodeParamFloat";
    valueKind: "float" | "boolean";
  }, moduleId?: string) {
    sendAutomationIntent("focus-target", encodeJsonPayload(binding), moduleId);
  },
  getActiveState(moduleId = getSelectedFxModuleId("fx-graph")) {
    return getActiveFxState(moduleId);
  },
  savePreset(name: string, state: FxChainState, presetId = "", moduleId?: string) {
    sendFxGraphIntent("save-preset", encodePresetSaveMessage(name, state, presetId), moduleId);
  },
  setMasterWetDry(value: number, moduleId?: string) {
    if (!Number.isFinite(value)) {
      return;
    }
    sendFxGraphIntent("set-master-wet-dry", textToBase64(String(clamp01(value))), moduleId);
  },
  setPreviewBypass(bypassed: boolean, moduleId?: string) {
    sendFxGraphIntent("set-preview-bypass", textToBase64(bypassed ? "1" : "0"), moduleId);
  },
  updateAutomationTouch(parameterId: string, normalizedValue: number, moduleId?: string) {
    sendAutomationIntent("update-touch", encodeJsonPayload({
      normalizedValue,
      parameterId,
    }), moduleId);
  },
};

export const fxVisualizer = {
  getCachedFrame() {
    const handle = getFxCapabilityHandle("fx-visualizer");
    if (!handle) {
      return null;
    }
    const cachedFrame = getCachedCapabilityStreamPayload("fx-visualizer", handle);
    return cachedFrame?.payloadType === "VisualizerFrame"
      ? decodeVisualizerFrameBase64(cachedFrame.payloadBase64)
      : null;
  },
  subscribe(options: { onFrame: FxVisualizerFrameListener }) {
    const handle = getFxCapabilityHandle("fx-visualizer");
    if (!handle) {
      return {
        close() {},
        isClosed() {
          return true;
        },
      } satisfies FxVisualizerSubscription;
    }

    const unsubscribe = subscribeCapabilityStream("fx-visualizer", handle, (frame) => {
      if (frame.payloadType !== "VisualizerFrame") {
        return;
      }
      options.onFrame(decodeVisualizerFrameBase64(frame.payloadBase64));
    });

    let closed = false;
    return {
      close() {
        if (closed) {
          return;
        }
        closed = true;
        unsubscribe();
      },
      isClosed() {
        return closed;
      },
    } satisfies FxVisualizerSubscription;
  },
};
