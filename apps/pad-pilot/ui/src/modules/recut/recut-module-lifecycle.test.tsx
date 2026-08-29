import { fromBinary } from "@bufbuild/protobuf";
import { expect, it } from "bun:test";
import { render, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { getDevHostRuntime } from "../../dev-host/runtime";
import { moduleSdk } from "../../module-sdk";
import {
  RecutModuleStoreProvider,
  useRecutModuleStore,
} from "./recut-module-store";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";
import { base64ToBytes } from "../../proto/base64";
import { SlicePlaybackTriggerSchema } from "../../proto/generated/capability-pb";

function StoreProbe(props: {
  onReady: (actions: ReturnType<typeof useRecutModuleStore>["actions"]) => void;
}) {
  props.onReady(useRecutModuleStore().actions);
  return null;
}

createUiTest("RecutModuleStore lifecycle", () => {
  it("releases every locally pressed pad when the module unmounts", () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    const originalSendCapabilityIntent = moduleSdk.sendCapabilityIntent;
    const triggers: Array<{ padIndex: number; pressed: boolean }> = [];
    moduleSdk.sendCapabilityIntent = ((capability, handle, action, payloadBase64) => {
      if (capability === "slice-playback" && action === "trigger-pad") {
        const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(payloadBase64));
        triggers.push({ padIndex: payload.padIndex, pressed: payload.pressed });
      }
      return originalSendCapabilityIntent(capability, handle, action, payloadBase64);
    }) as typeof moduleSdk.sendCapabilityIntent;

    let actions: ReturnType<typeof useRecutModuleStore>["actions"] | undefined;
    try {
      const view = render(() => (
        <PadPilotProvider>
          <ModuleSurface scopeId="recut">
            <RecutModuleStoreProvider>
              <StoreProbe onReady={(nextActions) => { actions = nextActions; }} />
            </RecutModuleStoreProvider>
          </ModuleSurface>
        </PadPilotProvider>
      ));

      actions?.triggerPad(3, true);
      expect(triggers.at(-1)).toEqual({ padIndex: 3, pressed: true });

      view.unmount();
      expect(triggers.at(-1)).toEqual({ padIndex: 3, pressed: false });
    } finally {
      moduleSdk.sendCapabilityIntent = originalSendCapabilityIntent;
    }
  });

  it("releases an active pad before replacing its sample source", () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    const originalSendCapabilityIntent = moduleSdk.sendCapabilityIntent;
    const triggers: Array<{ padIndex: number; pressed: boolean }> = [];
    moduleSdk.sendCapabilityIntent = ((capability, handle, action, payloadBase64) => {
      if (capability === "slice-playback" && action === "trigger-pad") {
        const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(payloadBase64));
        triggers.push({ padIndex: payload.padIndex, pressed: payload.pressed });
      }
      return originalSendCapabilityIntent(capability, handle, action, payloadBase64);
    }) as typeof moduleSdk.sendCapabilityIntent;

    let actions: ReturnType<typeof useRecutModuleStore>["actions"] | undefined;
    try {
      render(() => (
        <PadPilotProvider>
          <ModuleSurface scopeId="recut">
            <RecutModuleStoreProvider>
              <StoreProbe onReady={(nextActions) => { actions = nextActions; }} />
            </RecutModuleStoreProvider>
          </ModuleSurface>
        </PadPilotProvider>
      ));

      actions?.triggerPad(7, true);
      actions?.replaceSource({ path: "C:\\samples\\replacement.wav" });

      expect(triggers.slice(-2)).toEqual([
        { padIndex: 7, pressed: true },
        { padIndex: 7, pressed: false },
      ]);
    } finally {
      moduleSdk.sendCapabilityIntent = originalSendCapabilityIntent;
    }
  });

  it("keeps a pad held until every input owner releases it", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    const originalSendCapabilityIntent = moduleSdk.sendCapabilityIntent;
    const triggers: Array<{ padIndex: number; pressed: boolean }> = [];
    moduleSdk.sendCapabilityIntent = ((capability, handle, action, payloadBase64) => {
      if (capability === "slice-playback" && action === "trigger-pad") {
        const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(payloadBase64));
        triggers.push({ padIndex: payload.padIndex, pressed: payload.pressed });
      }
      return originalSendCapabilityIntent(capability, handle, action, payloadBase64);
    }) as typeof moduleSdk.sendCapabilityIntent;

    const gamepadState = (pressed: boolean, frameIndex: number) => ({
      axes: [0, 0, 0, 0],
      buttons: [0, 0, pressed ? 1 : 0, 0],
      connected: true,
      deviceId: "test-gamepad",
      deviceKind: "gamepad" as const,
      displayName: "Test Gamepad",
      frameIndex,
    });

    let actions: ReturnType<typeof useRecutModuleStore>["actions"] | undefined;
    let view: ReturnType<typeof render> | undefined;
    try {
      view = render(() => (
        <PadPilotProvider>
          <ModuleSurface scopeId="recut">
            <RecutModuleStoreProvider>
              <StoreProbe onReady={(nextActions) => { actions = nextActions; }} />
            </RecutModuleStoreProvider>
          </ModuleSurface>
        </PadPilotProvider>
      ));

      runtime.setInputDevices([gamepadState(true, 1)]);
      await waitFor(() => {
        expect(triggers).toEqual([{ padIndex: 0, pressed: true }]);
      });

      actions?.triggerPad(0, true);
      runtime.setInputDevices([gamepadState(false, 2)]);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(triggers).toEqual([{ padIndex: 0, pressed: true }]);

      actions?.triggerPad(0, false);
      expect(triggers).toEqual([
        { padIndex: 0, pressed: true },
        { padIndex: 0, pressed: false },
      ]);
    } finally {
      view?.unmount();
      moduleSdk.sendCapabilityIntent = originalSendCapabilityIntent;
    }
  });
});
