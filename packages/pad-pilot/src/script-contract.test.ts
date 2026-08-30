import { expect, test } from "bun:test";
import { registerPadPilotScriptModule } from "./script-contract";

test("registers the exact QuickJS global contract without import-time side effects", () => {
  const target = {};
  registerPadPilotScriptModule({
    target,
    module: {
      moduleApiVersion: "0.1.0",
      healthCheck: () => true,
      onInput: (event) => event.type === "button"
        ? { type: "keystroke", keyCode: 65, isKeyDown: event.value > 0 }
        : null,
    },
  });

  expect(Reflect.get(target, "padpilotHealthCheck")()).toBe(true);
  expect(Reflect.get(target, "padpilotGetModuleManifest")()).toEqual({ moduleApiVersion: "0.1.0" });
  expect(Reflect.get(target, "padpilotOnInput")({ type: "axis" })).toBeNull();
});
