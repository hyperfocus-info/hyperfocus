/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "./utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "./utils/tests/store-test-utils";
import { harnessStore, readBrowserUiSession } from "./harness-store";
import { createHarnessStateFixture } from "./utils/tests/test-fixtures";
import { clearCurrentTabItemSelectorsForTests, registerCurrentTabItemSelector } from "./lib/current-tab-item-hotkeys";

type HotkeyDefinition = { hotkey: string; callback: () => void };
type HotkeyOptions = { enabled: boolean; ignoreInputs: boolean; preventDefault: boolean; stopPropagation: boolean };
type HotkeySource = HotkeyDefinition[] | (() => HotkeyDefinition[]);

const createHotkeysMock = mock((_hotkeys: HotkeySource, _options: () => HotkeyOptions) => undefined);
const createHotkeySequenceMock = mock(() => undefined);
const createHotkeySequencesMock = mock(() => undefined);

mock.module("@tanstack/solid-hotkeys", () => ({
  createHotkeys: createHotkeysMock,
  createHotkeySequence: createHotkeySequenceMock,
  createHotkeySequences: createHotkeySequencesMock,
  formatForDisplay: (hotkey: string) => hotkey
}));

mock.module("./harness-websocket", () => ({
  connectHarnessWebSocket: () => ({
    sendCommand: () => undefined,
    dispose: () => undefined
  })
}));

import { App, createDefaultIdeWindowBounds, shouldCollapseTabStrip } from "./app";
import { ideStore } from "./ide/ide-store";

function getCreateHotkeysCall(): [HotkeyDefinition[], () => HotkeyOptions] {
  const call = createHotkeysMock.mock.calls.find(([hotkeys]) => {
    const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
    return definitions.length > 1 && definitions.every((definition) => typeof definition.hotkey === "string");
  });
  if (!call) {
    throw new Error("Expected createHotkeys to be called");
  }

  const [hotkeys, getOptions] = call;
  const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
  return [definitions, getOptions];
}

function getProjectSwitcherHotkeysCall(): [HotkeyDefinition[], () => HotkeyOptions] {
  const call = createHotkeysMock.mock.calls.find(([hotkeys]) => {
    const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
    return definitions.length === 2 && definitions.map((definition) => definition.hotkey).join(",") === "Mod+K,Mod+Space";
  });
  if (!call) {
    throw new Error("Expected project switcher hotkeys to be called");
  }

  const [hotkeys, getOptions] = call;
  const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
  return [definitions, getOptions];
}

function getHotkeyCall(hotkey: string): [HotkeyDefinition[], () => HotkeyOptions] {
  const call = createHotkeysMock.mock.calls.find(([source]) => {
    const definitions = typeof source === "function" ? source() : source;
    return definitions.some((definition) => definition.hotkey === hotkey);
  });
  if (!call) throw new Error(`Expected ${hotkey} hotkey registration`);
  const [source, options] = call;
  return [typeof source === "function" ? source() : source, options];
}

createUiTest("App shortcuts", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    clearCurrentTabItemSelectorsForTests();
    harnessStore.setActiveSurface("chat");
    ideStore.resetForTests();
    createHotkeysMock.mockClear();
    createHotkeySequenceMock.mockClear();
    createHotkeySequencesMock.mockClear();
  });

  it("registers app shortcuts through TanStack Hotkeys", () => {
    render(() => <App />);

    expect(createHotkeysMock.mock.calls.length).toBeGreaterThanOrEqual(1);

    const [definitions, getOptions] = getCreateHotkeysCall();

    expect(definitions.map((definition) => definition.hotkey)).toEqual([
      "Mod+K",
      "Mod+Space",
      "Mod+1",
      "Mod+2",
      "Mod+3",
      "Mod+4",
      "Mod+5",
      "Mod+,",
      "Mod+I",
      "Mod+`",
      "Mod+T",
      "Mod+N",
      "Mod+Shift+A",
      "Mod+Shift+J",
      "Mod+Shift+1",
      "Mod+Shift+2",
      "Mod+Shift+3",
      "Mod+Shift+4",
      "Mod+Shift+5",
      "Mod+Shift+6",
      "Mod+Shift+7",
      "Mod+Shift+8",
      "Mod+Shift+9"
    ]);
    expect(getOptions()).toEqual({
      enabled: true,
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    });
  });

  it("opens preferences from the shortcut callback", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    const preferencesShortcut = definitions.find((definition) => definition.hotkey === "Mod+5");

    expect(harnessStore.state.activeLeftTab).toBe("projects");

    preferencesShortcut?.callback();

    expect(harnessStore.state.activeLeftTab).toBe("preferences");
    expect(harnessStore.state.activeSurface).toBe("preferences");
  });

  it("selects the nth current-tab item from number shortcuts", () => {
    const selected: number[] = [];
    registerCurrentTabItemSelector("projects", (index) => {
      selected.push(index);
      return true;
    });
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    definitions.find((definition) => definition.hotkey === "Mod+Shift+3")?.callback();

    expect(selected).toEqual([2]);
  });

  it("opens side panels from number shortcuts", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    definitions.find((definition) => definition.hotkey === "Mod+2")?.callback();
    expect(harnessStore.state.activeLeftTab).toBe("assistants");

    definitions.find((definition) => definition.hotkey === "Mod+4")?.callback();
    expect(harnessStore.state.activeLeftTab).toBe("runs");
  });

  it("cycles trace panel from the shortcut callback", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    const traceShortcut = definitions.find((definition) => definition.hotkey === "Mod+T");

    expect(harnessStore.state.tracePanelMode).toBe("open");

    traceShortcut?.callback();

    expect(harnessStore.state.tracePanelMode).toBe("closed");
    expect(readBrowserUiSession().tracePanelMode).toBe("closed");
  });

  it("opens create dialogs from assistant and job shortcuts", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    definitions.find((definition) => definition.hotkey === "Mod+Shift+A")?.callback();
    expect(harnessStore.state.assistantEditorOpen).toBe(true);
    expect(harnessStore.state.activeLeftTab).toBe("assistants");

    definitions.find((definition) => definition.hotkey === "Mod+Shift+J")?.callback();
    expect(harnessStore.state.backgroundJobEditorOpen).toBe(true);
    expect(harnessStore.state.backgroundJobEditorDraft?.kind).toBe("ai-routine");
    expect(harnessStore.state.activeLeftTab).toBe("jobs");
  });

  it("disables the shortcut while the switcher is open or focused", () => {
    render(() => <App />);

    const [, getOptions] = getCreateHotkeysCall();

    harnessStore.openProjectSwitcher();
    expect(getOptions().enabled).toBe(false);

    harnessStore.closeProjectSwitcher();
    const input = document.createElement("input");
    input.dataset.projectSwitcherInput = "true";
    document.body.append(input);
    input.focus();

    expect(getOptions().enabled).toBe(false);
  });

  it("keeps project switcher shortcuts enabled on the IDE surface", () => {
    harnessStore.setActiveSurface("ide");
    render(() => <App />);

    const [definitions, getOptions] = getProjectSwitcherHotkeysCall();

    expect(getOptions()).toEqual({
      enabled: true,
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    });

    definitions.find((definition) => definition.hotkey === "Mod+Space")?.callback();
    expect(harnessStore.state.projectSwitcherOpen).toBe(true);
  });

  it("registers configured app shortcuts from local preferences", async () => {
    window.localStorage.setItem(
      "pi-harness:app-hotkeys:v1",
      JSON.stringify({
        openProjectSwitcher: "Alt+P",
        openProjectSwitcherAlternate: "Alt+Shift+P",
        openPreferences: "Alt+,",
        selectCurrentItem3: "Alt+3"
      })
    );
    harnessStore.hydrateLocalPreferences();

    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();

    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+P");
    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+Shift+P");
    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+,");
    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+3");
  });

  it("keeps app shortcuts enabled while editable controls own focus", () => {
    render(() => <App />);

    const [, getOptions] = getCreateHotkeysCall();
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();

    expect(getOptions().enabled).toBe(true);

    textarea.remove();
    const textbox = document.createElement("div");
    textbox.setAttribute("role", "textbox");
    textbox.tabIndex = 0;
    document.body.append(textbox);
    textbox.focus();

    expect(getOptions().enabled).toBe(true);
  });

  it("keeps search shortcut enabled while editable controls own focus", () => {
    render(() => <App />);
    const searchCall = getHotkeyCall("Mod+F");

    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();

    expect(searchCall[1]().enabled).toBe(true);
    expect(searchCall[1]().preventDefault).toBe(true);
    expect(searchCall[1]().stopPropagation).toBe(true);
  });

  it("renders left tabs with tab-owned active styling state", () => {
    render(() => <App />);

    const nav = document.querySelector("[data-test-left-tab-nav]");
    const buttons: HTMLButtonElement[] = [...(nav?.querySelectorAll("button") ?? [])];

    expect(nav?.getAttribute("role")).toBe("tablist");
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Projects");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Assistants");
    expect(buttons[2]?.getAttribute("aria-label")).toBe("Jobs");
    expect(buttons[3]?.getAttribute("aria-label")).toBe("Runs");
    expect(buttons[4]?.getAttribute("aria-label")).toBe("Settings");
    expect(buttons[0]?.getAttribute("role")).toBe("tab");
    expect(buttons[0]?.getAttribute("aria-selected")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-selected")).toBe("false");
    expect(buttons[0]?.hasAttribute("data-test-button")).toBe(true);
  });

  it("renders settings in the shared left pane shell", () => {
    harnessStore.setActiveLeftTab("preferences");
    const { container } = render(() => <App />);

    const shell = container.querySelector("[data-test-left-pane-shell][data-left-pane-kind='preferences']");
    expect(shell).not.toBeNull();
    expect(shell?.querySelector("nav[aria-label='Preference sections']")).not.toBeNull();
  });

  it("collapses left tab labels when tabs wrap", () => {
    const nav = document.createElement("nav");
    const tabItems = Array.from({ length: 5 }, () => {
      const tabItem = document.createElement("span");
      nav.append(tabItem);
      return tabItem;
    });

    Object.defineProperty(nav, "scrollWidth", { configurable: true, value: 320 });
    Object.defineProperty(nav, "clientWidth", { configurable: true, value: 320 });
    tabItems.forEach((tabItem, index) => {
      tabItem.getBoundingClientRect = () => DOMRect.fromRect({ y: index >= 3 ? 28 : 0 });
    });

    expect(shouldCollapseTabStrip(nav)).toBe(true);
  });

  it("keeps workspace grid columns shrinkable when project threads have long content", () => {
    render(() => <App />);

    const grid = document.querySelector("[data-test-main-panel-grid]");

    expect(grid?.getAttribute("data-main-panel-mode")).toBe("open");
    expect(grid?.getAttribute("style")).toContain("--center-panel-size");
  });

  it("persists main panel sizes in browser session state", () => {
    render(() => <App />);

    harnessStore.setMainPanelSizes({ left: 2, center: 4, right: 1.5 });

    expect(readBrowserUiSession().mainPanelSizes).toEqual({ left: 2, center: 4, right: 1.5 });
  });

  it("cycles trace panel through closed and peek states", async () => {
    render(() => <App />);

    const traceButton = screen.getByRole("button", { name: /Trace panel:/ });

    expect(harnessStore.state.tracePanelMode).toBe("open");

    fireEvent.click(traceButton);
    await Promise.resolve();
    expect(harnessStore.state.tracePanelMode).toBe("closed");
    expect(readBrowserUiSession().tracePanelMode).toBe("closed");

    fireEvent.click(traceButton);
    await Promise.resolve();
    expect(harnessStore.state.tracePanelMode).toBe("peek");
    expect(readBrowserUiSession().tracePanelMode).toBe("peek");
  });

  it("keeps the technical trace surface out of simple mode without losing its advanced state", () => {
    seedHarnessStoreForTests(createHarnessStateFixture({
      experienceMode: "simple",
      tracePanelMode: "open",
      tracePanelOpen: true,
    }));

    render(() => <App />);

    expect(screen.queryByRole("button", { name: /Trace panel:/ })).toBeNull();
    expect(document.querySelector("[data-test-main-panel-grid]")?.getAttribute("data-main-panel-mode")).toBe("closed");
    expect(harnessStore.state.tracePanelMode).toBe("open");
  });

  it("renders trace peek rail when session mode is peek", () => {
    harnessStore.setTracePanelMode("peek");

    render(() => <App />);

    expect(document.querySelector("[data-test-trace-peek-rail]")).not.toBeNull();
  });

  it("moves active tab styling when switching left tabs", async () => {
    render(() => <App />);
    const nav = document.querySelector("[data-test-left-tab-nav]");
    const buttons: HTMLButtonElement[] = [...(nav?.querySelectorAll("button") ?? [])];
    const assistantsTab = buttons[1];
    const runsTab = buttons[3];

    expect(assistantsTab?.getAttribute("aria-selected")).toBe("false");

    if (assistantsTab) {
      fireEvent.click(assistantsTab);
    }

    expect(harnessStore.state.activeLeftTab).toBe("assistants");
    expect(harnessStore.state.activeSurface).toBe("assistants");
    expect(readBrowserUiSession().activeLeftTab).toBe("assistants");

    if (runsTab) {
      fireEvent.click(runsTab);
    }

    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(readBrowserUiSession().activeLeftTab).toBe("runs");
  });

  it("shows current surface context in the mobile header", () => {
    harnessStore.setActiveLeftTab("runs");

    render(() => <App />);

    const label = document.querySelector("[data-test-mobile-surface-label]");
    expect(label?.textContent).toContain("Runs");
  });

  it("opens the IDE surface from the shortcut", async () => {
    render(() => <App />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const [definitions] = getCreateHotkeysCall();
    const ideShortcut = definitions.find((definition) => definition.hotkey === "Mod+I");
    expect(ideShortcut).toBeDefined();
    ideShortcut?.callback();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(harnessStore.state.activeSurface).toBe("ide");
  });

  it("renders the IDE as a maximizable virtual app window", async () => {
    harnessStore.setActiveSurface("ide");
    render(() => <App />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const ideWindow = document.querySelector("[data-test-ide-virtual-window]");
    const titlebar = document.querySelector("[data-test-ide-titlebar]");
    expect(ideWindow).not.toBeNull();
    expect(titlebar).not.toBeNull();

    const maximizeButton = document.querySelector<HTMLButtonElement>("button[aria-label='Maximize IDE window']");
    expect(maximizeButton).not.toBeNull();
    expect(document.querySelector("[data-test-ide-window-resize]")).not.toBeNull();

    expect(ideWindow?.getAttribute("data-maximized")).toBe("false");
  });

  it("keeps default IDE bounds inside a narrow viewport", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });

    try {
      expect(createDefaultIdeWindowBounds()).toEqual({ x: 8, y: 8, width: 374, height: 720 });
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("closes the IDE virtual window from Escape", async () => {
    harnessStore.setActiveSurface("ide");
    render(() => <App />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.querySelector("[data-test-ide-virtual-window]")).not.toBeNull();

    const escapeCall = getHotkeyCall("Escape");
    expect(escapeCall[1]().enabled).toBe(true);
    const escapeDefinitions = escapeCall[0];
    escapeDefinitions.find((definition) => definition.hotkey === "Escape")?.callback();

    expect(harnessStore.state.activeSurface).toBe("chat");
  });

  it("closes only the project switcher when Escape is pressed over the IDE", async () => {
    harnessStore.setActiveSurface("ide");
    harnessStore.openProjectSwitcher();
    render(() => <App />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const escapeCall = getHotkeyCall("Escape");
    const escapeDefinitions = escapeCall[0];
    escapeDefinitions.find((definition) => definition.hotkey === "Escape")?.callback();

    expect(harnessStore.state.projectSwitcherOpen).toBe(false);
    expect(harnessStore.state.activeSurface).toBe("ide");
  });

  it("closes IDE overlays before Escape closes the virtual window", async () => {
    harnessStore.setActiveSurface("ide");
    ideStore.setCommandPalette(true);
    render(() => <App />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const escapeCall = getHotkeyCall("Escape");
    const escapeDefinitions = escapeCall[0];
    const escape = escapeDefinitions.find((definition) => definition.hotkey === "Escape")?.callback;

    escape?.();
    expect(ideStore.state.commandPaletteOpen).toBe(false);
    expect(harnessStore.state.activeSurface).toBe("ide");

    ideStore.setDocumentFindOpen(true);
    escape?.();
    expect(ideStore.state.documentFindOpen).toBe(false);
    expect(harnessStore.state.activeSurface).toBe("ide");

    escape?.();
    expect(harnessStore.state.activeSurface).toBe("chat");
  });
});
