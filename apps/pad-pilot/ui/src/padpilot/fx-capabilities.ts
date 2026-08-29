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

function getSelectedFxModuleId() {
  return resolveSelectedCapabilityModuleId(getLatestHostState(), "fx-graph");
}

function getFxCapabilityHandle(capability: "automation" | "fx-graph" | "fx-visualizer", moduleId = getSelectedFxModuleId()) {
  return createCapabilityHandle(capability, moduleId);
}

function getActiveFxState(moduleId = getSelectedFxModuleId()) {
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

function sendFxGraphIntent(action: string, payloadBase64: string, moduleId = getSelectedFxModuleId()) {
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

function sendAutomationIntent(action: string, payloadBase64: string, moduleId = getSelectedFxModuleId()) {
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
  applyState(state: FxChainState, moduleId = getSelectedFxModuleId()) {
    const normalized = normalizeFxChainState(state);
    sendFxGraphIntent("apply-state", bytesToBase64(encodeFxChainState(normalized)), moduleId);
  },
  beginAutomationTouch(parameterId: string, moduleId = getSelectedFxModuleId()) {
    sendAutomationIntent("begin-touch", textToBase64(parameterId), moduleId);
  },
  createPreset(name: string, state: FxChainState, presetId = "", moduleId = getSelectedFxModuleId()) {
    sendFxGraphIntent("create-preset", encodePresetSaveMessage(name, state, presetId), moduleId);
  },
  endAutomationTouch(parameterId: string, moduleId = getSelectedFxModuleId()) {
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
  }, moduleId = getSelectedFxModuleId()) {
    sendAutomationIntent("focus-target", encodeJsonPayload(binding), moduleId);
  },
  getActiveState(moduleId = getSelectedFxModuleId()) {
    return getActiveFxState(moduleId);
  },
  savePreset(name: string, state: FxChainState, presetId = "", moduleId = getSelectedFxModuleId()) {
    sendFxGraphIntent("save-preset", encodePresetSaveMessage(name, state, presetId), moduleId);
  },
  setMasterWetDry(value: number, moduleId = getSelectedFxModuleId()) {
    if (!Number.isFinite(value)) {
      return;
    }
    sendFxGraphIntent("set-master-wet-dry", textToBase64(String(clamp01(value))), moduleId);
  },
  setPreviewBypass(bypassed: boolean, moduleId = getSelectedFxModuleId()) {
    sendFxGraphIntent("set-preview-bypass", textToBase64(bypassed ? "1" : "0"), moduleId);
  },
  updateAutomationTouch(parameterId: string, normalizedValue: number, moduleId = getSelectedFxModuleId()) {
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
