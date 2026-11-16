/** @jsxImportSource solid-js */
import { afterEach, expect, it, mock } from "bun:test";
import { render, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../utils/tests/test-harness";
import { terminalStore } from "../terminal-store";

import { FakeTerminal, FakeFit, FakeSearch, FakeSerialize, FakeLinks, FakeWebgl, FakeResizeObserver, terminals, resizeObservers, webglAddons } from "../tests/xterm-fixtures";

mock.module("@xterm/xterm", () => ({ Terminal: FakeTerminal }));
mock.module("@xterm/addon-fit", () => ({ FitAddon: FakeFit }));
mock.module("@xterm/addon-search", () => ({ SearchAddon: FakeSearch }));
mock.module("@xterm/addon-serialize", () => ({ SerializeAddon: FakeSerialize }));
mock.module("@xterm/addon-web-links", () => ({ WebLinksAddon: FakeLinks }));
mock.module("@xterm/addon-webgl", () => ({ WebglAddon: FakeWebgl }));
const { XtermRenderer } = await import("./xterm-renderer");

function latestTerminal() {
  const terminal = terminals.at(-1);
  if (!terminal) throw new Error("Expected a mounted terminal");
  return terminal;
}

createUiTest("XtermRenderer lifetime", () => {
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const resizeObserver = globalThis.ResizeObserver;
  afterEach(() => {
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    terminals.length = 0;
    resizeObservers.length = 0; webglAddons.clear();
    globalThis.ResizeObserver = resizeObserver;
  });

  it("remounts equal buffers/versions across session and project switches and rejects old callbacks", async () => {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: FakeResizeObserver });
    const [session, setSession] = createSignal({ project: "p1", id: "a", cwd: "/repo/a", readOnly: false });
    const [output, setOutput] = createSignal("same output");
    const [version, setVersion] = createSignal(4);
    const input: string[] = [];
    const opened: string[] = [];
    const resized: string[] = [];
    const handles: import("./xterm-renderer").XtermRendererHandle[] = [];
    let resolvePaste: ((text: string) => void) | undefined;
    const copied = mock(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      readText: () => new Promise<string>((resolve) => { resolvePaste = resolve; }), writeText: copied
    } });
    const result = render(() => <XtermRenderer sessionId={session().id} projectId={session().project}
      sessionCwd={session().cwd} projectRoot="/repo" output={output()} outputVersion={version()} outputResetVersion={2}
      searchQuery="" copyOnSelect ctrlCMode="auto" readOnly={session().readOnly}
      onInput={(text) => input.push(`${session().project}/${session().id}:${text}`)}
      onResize={() => resized.push(`${session().project}/${session().id}`)}
      onOpenFile={(path) => opened.push(path)} onReady={(handle) => handles.push(handle)} />);
    const first = latestTerminal();
    const firstObserver = resizeObservers[0];
    expect(first.writes).toEqual(["same output"]);
    first.data("old input");
    first.key(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));
    first.selection();
    let oldLink: { activate: (event: MouseEvent) => void } | undefined;
    first.links?.provideLinks(1, (links) => { oldLink = links?.[0]; });
    setSession({ project: "p1", id: "b", cwd: "/repo/b", readOnly: false });
    await waitFor(() => expect(terminals).toHaveLength(2));
    const second = latestTerminal();
    expect(second).not.toBe(first);
    expect(first.disposed).toBe(true);
    expect(firstObserver?.disconnected).toBe(true);
    firstObserver?.callback();
    expect(second.writes).toEqual(["same output"]);
    expect(second.resets).toBe(1);
    resolvePaste?.("stale paste");
    first.data("late input");
    first.key(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, shiftKey: true }));
    oldLink?.activate(new MouseEvent("click"));
    expect(handles[0]?.serialize()).toBe("");
    expect(handles[0]?.findNext("old")).toBe(false);
    second.data("new input");
    await new Promise((resolve) => setTimeout(resolve, 210));
    expect(copied).not.toHaveBeenCalled();
    expect(first.addons.some((addon) => webglAddons.has(addon))).toBe(false);
    expect(opened).toEqual([]);
    expect(input).toEqual(["p1/a:old input", "p1/b:new input"]);
    let liveLink: { activate: (event: MouseEvent) => void } | undefined;
    second.links?.provideLinks(1, (links) => { liveLink = links?.[0]; });
    const count = terminals.length;
    setSession({ ...session(), cwd: "/repo/changed", readOnly: true });
    expect(terminals).toHaveLength(count);
    second.data("locked");
    liveLink?.activate(new MouseEvent("click"));
    expect(opened).toEqual(["changed/src/file.ts"]);
    setOutput("same output plus"); setVersion(5);
    await waitFor(() => expect(second.writes).toEqual(["same output", " plus"]));
    setSession({ project: "p2", id: "b", cwd: "/repo/other", readOnly: false });
    await waitFor(() => expect(terminals).toHaveLength(3));
    const third = latestTerminal();
    expect(second.disposed).toBe(true);
    expect(third.writes).toEqual(["same output plus"]);
    result.unmount();
    const addons = third.addons.length;
    third.data("after unmount");
    await Promise.resolve(); await Promise.resolve();
    expect(third.disposed).toBe(true);
    expect(third.addons).toHaveLength(addons);
    expect(resized).toEqual(["p1/a", "p1/b", "p2/b"]);
    expect(input).toEqual(["p1/a:old input", "p1/b:new input"]);
  });

  it("rechecks input locks when clipboard resolves within the same identity", async () => {
    const [readOnly, setReadOnly] = createSignal(false);
    let resolvePaste: ((text: string) => void) | undefined;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      readText: () => new Promise<string>((resolve) => { resolvePaste = resolve; })
    } });
    const input = mock(() => undefined);
    render(() => <XtermRenderer sessionId="a" projectId="p" sessionCwd="/repo" projectRoot="/repo" output=""
      searchQuery="" copyOnSelect={false} ctrlCMode="auto" readOnly={readOnly()} onInput={input} onOpenFile={() => {}} />);
    latestTerminal().key(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));
    setReadOnly(true);
    resolvePaste?.("locked paste");
    await Promise.resolve();
    expect(input).not.toHaveBeenCalled();
    terminalStore.setSearch(false);
  });
});
