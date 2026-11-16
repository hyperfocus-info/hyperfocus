import { afterEach, expect, test } from "bun:test";
import { installAppShortcuts } from "./app-shortcuts";

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); });

test("Mod comma matches either platform modifier exactly and returns an idempotent cleanup", () => {
  let calls = 0;
  const dispose = installAppShortcuts({ actions: [{ id: "preferences", key: "Mod+,", run: () => { calls++; } }] });
  disposers.push(dispose);
  for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
    const event = new KeyboardEvent("keydown", { key: ",", ...init, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  for (const init of [{}, { ctrlKey: true, metaKey: true }, { ctrlKey: true, altKey: true }, { metaKey: true, shiftKey: true }, { ctrlKey: true, repeat: true }, { metaKey: true, isComposing: true }, { ctrlKey: true, keyCode: 229 }]) {
    const event = new KeyboardEvent("keydown", { key: ",", ...init, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(calls).toBe(2);
  dispose(); dispose();
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true, bubbles: true }));
  expect(calls).toBe(2);
});

test("settings works in editable controls only when allowed and never takes native editing", () => {
  const runs: string[] = [];
  disposers.push(installAppShortcuts({ actions: [
    { id: "settings", key: "Mod+,", allowInInput: true, run: () => runs.push("settings") },
    { id: "search", key: "Mod+k", run: () => runs.push("search") },
    { id: "copy", key: "Mod+c", allowInInput: true, run: () => runs.push("copy") },
    { id: "type", key: "x", allowInInput: true, run: () => runs.push("type") },
  ] }));
  const input = document.createElement("input");
  const editable = document.createElement("div"); editable.contentEditable = "true";
  const nested = document.createElement("span"); editable.append(nested);
  const shadow = document.createElement("div").attachShadow({ mode: "open" });
  const shadowInput = document.createElement("textarea"); shadow.append(shadowInput);
  document.body.append(input, editable, shadow.host);
  for (const element of [input, nested, shadowInput]) {
    for (const key of [",", "k", "c", "x"]) {
      element.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: key !== "x", bubbles: true, composed: true, cancelable: true }));
    }
  }
  expect(runs).toEqual(["settings", "settings", "settings"]);
});

test("disabled actions and consumed events leave host editing/commands alone", () => {
  let enabled = false;
  let calls = 0;
  disposers.push(installAppShortcuts({ actions: [{ id: "save", key: "Mod+s", enabled: () => enabled, run: () => { calls++; } }] }));
  const dispatch = (prevented: boolean) => {
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    if (prevented) event.preventDefault();
    document.body.dispatchEvent(event);
  };
  dispatch(false); enabled = true; dispatch(true); expect(calls).toBe(0);
  dispatch(false); expect(calls).toBe(1);
});
