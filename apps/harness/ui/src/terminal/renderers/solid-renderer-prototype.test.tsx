/** @jsxImportSource solid-js */
import { afterEach, beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../utils/tests/test-harness";
import { terminalStore } from "../terminal-store";
import { SolidTerminalRendererPrototype } from "./solid-renderer-prototype";

createUiTest("SolidTerminalRendererPrototype", () => {
  beforeEach(() => {
    terminalStore.resetForTests();
  });

  it("sends keyboard input for printable and control keys", () => {
    const inputs: Array<string | Uint8Array> = [];

    render(() => (
      <SolidTerminalRendererPrototype
        output="PS>"
        backspaceInput={"\b"}
        onInput={(input) => inputs.push(input)}
      />
    ));

    const terminal = screen.getByRole("textbox", { name: "Terminal output" });
    fireEvent.keyDown(terminal, { key: "a" });
    fireEvent.keyDown(terminal, { key: "Backspace" });
    fireEvent.keyDown(terminal, { key: "Enter" });
    fireEvent.keyDown(terminal, { key: "ArrowUp" });

    expect(inputs).toEqual(["a", "\b", "\r", "\x1b[A"]);
  });

  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  afterEach(() => {
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  });

  it("drops pending paste on disposal or a new input lock", async () => {
    let resolvePaste: ((text: string) => void) | undefined;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      readText: () => new Promise<string>((resolve) => { resolvePaste = resolve; })
    } });
    const input: Array<string | Uint8Array> = [];
    const [readOnly, setReadOnly] = createSignal(false);
    const result = render(() => <SolidTerminalRendererPrototype output="" readOnly={readOnly()}
      onInput={(text) => input.push(text)} />);
    const terminal = screen.getByRole("textbox", { name: "Terminal output" });
    fireEvent.keyDown(terminal, { key: "v", ctrlKey: true });
    setReadOnly(true); resolvePaste?.("locked paste"); await Promise.resolve();
    expect(input).toEqual([]);
    setReadOnly(false);
    fireEvent.keyDown(terminal, { key: "v", ctrlKey: true });
    result.unmount(); resolvePaste?.("disposed paste"); await Promise.resolve();
    expect(input).toEqual([]);
  });

  it("toggles terminal search from primary f and closes it from Escape", () => {
    render(() => <SolidTerminalRendererPrototype output="PS>" />);

    const terminal = screen.getByRole("textbox", { name: "Terminal output" });
    fireEvent.keyDown(terminal, { key: "f", ctrlKey: true });
    expect(terminalStore.state.searchOpen).toBe(true);

    fireEvent.keyDown(terminal, { key: "Escape" });
    expect(terminalStore.state.searchOpen).toBe(false);
  });
});
