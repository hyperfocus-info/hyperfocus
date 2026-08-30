import { expect, test } from "bun:test";
import { PADPILOT_SCRIPT_AUDIO_COMMANDS } from "@hyperfocus/pad-pilot/script-contract";

test("QuickJS execution has watchdog and explicit idle-boundary garbage collection", async () => {
  const quickJsSource = await Bun.file(new URL("./quick-js-host.cpp", import.meta.url)).text();
  const scriptHostSource = await Bun.file(new URL("./script-host.cpp", import.meta.url)).text();
  const scriptHostHeader = await Bun.file(new URL("./script-host.h", import.meta.url)).text();

  expect(quickJsSource).toContain("JS_SetInterruptHandler(runtime_, &QuickJSHost::shouldInterrupt, this)");
  expect(quickJsSource).toContain("JS_RunGC(runtime_)");
  expect(scriptHostHeader).toContain("kInputEventsBetweenGarbageCollections = 2'048");
  expect(scriptHostSource).toContain("scriptEngine_.collectGarbage()");
  expect(scriptHostSource.indexOf("while (inputQueue_.pop(inputEvent))")).toBeLessThan(
    scriptHostSource.indexOf("scriptEngine_.collectGarbage()"),
  );
});

test("public script command names and input fields stay aligned with QuickJS", async () => {
  const quickJsSource = await Bun.file(new URL("./quick-js-host.cpp", import.meta.url)).text();
  for (const command of PADPILOT_SCRIPT_AUDIO_COMMANDS) {
    expect(quickJsSource).toContain(`commandName == "${command}"`);
  }
  for (const field of [
    "type",
    "controlId",
    "deviceSlot",
    "mappedType",
    "mappedControlId",
    "mappedControlActive",
    "value",
    "frameIndex",
  ]) {
    expect(quickJsSource).toContain(`eventObject, "${field}"`);
  }
});
