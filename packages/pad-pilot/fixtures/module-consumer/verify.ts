import {
  definePadPilotModuleManifest,
  type PadPilotModuleManifest,
} from "@hyperfocus/pad-pilot/module-manifest";
import { definePadPilotModule } from "@hyperfocus/pad-pilot/module-ui-contract";
import type { PadPilotServiceHostSurface } from "@hyperfocus/pad-pilot/host-surface";
import { registerPadPilotScriptModule } from "@hyperfocus/pad-pilot/script-contract";

const manifest = definePadPilotModuleManifest({
  id: "controller-notes",
  name: "Controller Notes",
  version: "1.0.0",
  moduleApiVersion: "0.1.0",
  uiEntry: "ui/ui-entry.js",
  scriptEntry: "script/module.js",
  stateSchemaVersion: 1,
  capabilities: ["controller-input", "keyboard-output", "midi-output", "module-state"],
  minHostVersion: "0.1.0",
});

const publicContract: PadPilotModuleManifest = manifest;
declare const PadPilot: PadPilotServiceHostSurface<string, never, Record<string, unknown>>;

const ControllerNotes = () => {
  const gamepad = PadPilot.hooks.useGamepad();
  const [state, setState] = PadPilot.hooks.useModuleState(manifest.id, { notes: "" });
  const interaction = PadPilot.hooks.useModuleInteraction(manifest.id);
  const actions = PadPilot.createProducerActions(manifest.id);
  if (gamepad().buttons[0]) {
    interaction.begin();
    setState({ notes: "A pressed" });
    actions.keyboard.execute(["Space"]);
    interaction.end();
  }
  return state().notes;
};

const uiDefinition = definePadPilotModule({
  Component: ControllerNotes,
  manifest,
  register(context) {
    context.registerModuleStateCodec(manifest.id, {
      decode: (bytes) => ({ notes: new TextDecoder().decode(bytes) }),
      encode: (state) => new TextEncoder().encode(state.notes),
    });
  },
});
const scriptTarget = {};
registerPadPilotScriptModule({
  target: scriptTarget,
  module: {
    moduleApiVersion: manifest.moduleApiVersion,
    healthCheck: () => true,
    onInput: (event) => event.type === "button"
      ? { type: "keystroke", keyCode: 65, isKeyDown: event.value > 0 }
      : null,
  },
});

console.log(JSON.stringify({
  ...publicContract,
  scriptReady: Reflect.get(scriptTarget, "padpilotHealthCheck")(),
  uiContractReady: uiDefinition.Component === ControllerNotes,
}));
