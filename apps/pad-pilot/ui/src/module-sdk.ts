import { sendIntent } from "./bridge";
import type { CapabilityKind } from "./bridge";

export type ConvolverParams = {
  convolverWet: number;
  convolverDry: number;
  impulsePath: string;
  delaySyncEnabled: boolean;
  delayTimeBeats: number;
  delayTimeHz: number;
  delayWet: number;
  delayDry: number;
  reverbWet: number;
  reverbDry: number;
};

// Keep transport intent APIs generic; UI element rules stay in the shared element layer.
export const moduleSdk = {
  registerReady() {
    sendIntent({ type: "ready" });
  },
  createModule(name: string) {
    sendIntent({ type: "createModule", name });
  },
  selectModule(moduleId: string) {
    sendIntent({ type: "selectModule", moduleId });
  },
  selectPreset(presetId: string) {
    sendIntent({ type: "selectPreset", presetId });
  },
  setModuleState(moduleId: string, payload: string) {
    sendIntent({ type: "setModuleState", moduleId, payload });
  },
  setModuleStateProto(moduleId: string, payloadBase64: string, revision: bigint) {
    sendIntent({ type: "setModuleStateProto", moduleId, payloadBase64, revision: revision.toString() });
  },
  setControllerConfig(payloadBase64: string) {
    sendIntent({ type: "setControllerConfig", payloadBase64 });
  },
  setEditorViewState(scopeId: string, payload: string) {
    sendIntent({ type: "setEditorViewState", scopeId, payload });
  },
  setDiagnosticsVisible(visible: boolean) {
    sendIntent({ type: "setDiagnosticsVisible", visible });
  },
  openCapabilityStream(capability: CapabilityKind, handle: string) {
    sendIntent({ type: "openCapabilityStream", capability, handle });
  },
  closeCapabilityStream(capability: CapabilityKind, handle: string) {
    sendIntent({ type: "closeCapabilityStream", capability, handle });
  },
  sendCapabilityIntent(
    capability: CapabilityKind,
    handle: string,
    action: string,
    payloadBase64: string,
  ) {
    sendIntent({ type: "sendCapabilityIntent", capability, handle, action, payloadBase64 });
  },
};

