import { z } from "zod";
import { expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { EditorModule } from "./editor-module";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";
import { moduleSdk } from "../../module-sdk";
import { getDevHostRuntime } from "../../dev-host/runtime";
import { base64ToBytes } from "../../proto/base64";

createUiTest("EditorModule", () => {
  it("renders profile controls and enters binding mode", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="editor">
          <EditorModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    expect(screen.getByText("Editor Module")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Binding" }));
    expect(screen.getByText("Press controller button…")).not.toBeNull();
  });

  it("executes a saved controller shortcut on the rising button edge", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.sendIntent({ type: "selectModule", moduleId: "editor" });
    const original = moduleSdk.sendCapabilityIntent;
    const keyboardActions: string[] = [];
    moduleSdk.sendCapabilityIntent = (capability, handle, action, payloadBase64) => {
      if (capability === "keyboard-output") keyboardActions.push(action);
      return original(capability, handle, action, payloadBase64);
    };

    try {
      render(() => (
        <PadPilotProvider>
          <ModuleSurface scopeId="editor">
            <EditorModule />
          </ModuleSurface>
        </PadPilotProvider>
      ));
      runtime.setInputDevices([{
        axes: [0, 0, 0, 0],
        buttons: [1, ...Array.from({ length: 15 }, () => 0)],
        connected: true,
        deviceId: "editor-test",
        deviceKind: "gamepad",
        displayName: "Editor Test Controller",
        frameIndex: 1,
      }]);

      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(keyboardActions).toEqual(["execute"]);
    } finally {
      moduleSdk.sendCapabilityIntent = original;
      runtime.reset();
    }
  });

  it("executes only mappings owned by the selected persisted profile", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.sendIntent({ type: "selectModule", moduleId: "editor" });
    runtime.sendIntent({
      type: "setModuleState",
      moduleId: "editor",
      payload: JSON.stringify({
        profileName: "Default",
        mappings: [
          { control: "Button 0", actionType: "daw", profile: "Default", target: "SPACE" },
          { control: "Button 0", actionType: "macro", profile: "New", target: "R" },
        ],
      }),
    });
    const original = moduleSdk.sendCapabilityIntent;
    const shortcuts: string[] = [];
    moduleSdk.sendCapabilityIntent = (capability, handle, action, payloadBase64) => {
      if (capability === "keyboard-output") {
        shortcuts.push(...z.array(z.string()).parse(JSON.parse(new TextDecoder().decode(base64ToBytes(payloadBase64)))));
      }
      return original(capability, handle, action, payloadBase64);
    };

    try {
      render(() => (
        <PadPilotProvider>
          <ModuleSurface scopeId="editor">
            <EditorModule />
          </ModuleSurface>
        </PadPilotProvider>
      ));
      await waitFor(() => expect(screen.getByText(/daw: SPACE/)).not.toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Profile" }));
      fireEvent.click(await screen.findByRole("option", { name: "New" }));
      await waitFor(() => expect(screen.getByText(/macro: R/)).not.toBeNull());

      runtime.setInputDevices([{
        axes: [0, 0, 0, 0],
        buttons: [1, ...Array.from({ length: 15 }, () => 0)],
        connected: true,
        deviceId: "editor-profile-test",
        deviceKind: "gamepad",
        displayName: "Editor Profile Test Controller",
        frameIndex: 1,
      }]);
      await waitFor(() => expect(shortcuts).toEqual(["R"]));
    } finally {
      moduleSdk.sendCapabilityIntent = original;
      runtime.reset();
    }
  });

  it("turns a button mapping into a bounded automation gesture", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.sendIntent({ type: "selectModule", moduleId: "editor" });
    runtime.sendIntent({
      type: "setModuleState",
      moduleId: "editor",
      payload: JSON.stringify({
        profileName: "Default",
        mappings: [{ control: "Button 0", actionType: "automation", profile: "Default", target: "pp.macro.01" }],
      }),
    });
    const original = moduleSdk.sendCapabilityIntent;
    const automationActions: string[] = [];
    moduleSdk.sendCapabilityIntent = (capability, handle, action, payloadBase64) => {
      if (capability === "automation") automationActions.push(action);
      return original(capability, handle, action, payloadBase64);
    };

    try {
      render(() => (
        <PadPilotProvider>
          <ModuleSurface scopeId="editor">
            <EditorModule />
          </ModuleSurface>
        </PadPilotProvider>
      ));
      await waitFor(() => expect(screen.getByText(/automation: pp\.macro\.01/)).not.toBeNull());
      const device = {
        axes: [0, 0, 0, 0],
        connected: true,
        deviceId: "editor-automation-test",
        deviceKind: "gamepad" as const,
        displayName: "Editor Automation Test Controller",
      };
      runtime.setInputDevices([{ ...device, buttons: [1], frameIndex: 1 }]);
      await waitFor(() => expect(automationActions).toEqual(["begin-touch", "update-touch"]));
      runtime.setInputDevices([{ ...device, buttons: [0], frameIndex: 2 }]);
      await waitFor(() => expect(automationActions).toEqual([
        "begin-touch",
        "update-touch",
        "update-touch",
        "end-touch",
      ]));
    } finally {
      moduleSdk.sendCapabilityIntent = original;
      runtime.reset();
    }
  });
});
