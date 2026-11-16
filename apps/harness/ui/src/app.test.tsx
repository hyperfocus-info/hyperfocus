/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock, spyOn } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "./utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "./utils/tests/store-test-utils";
import { harnessStore, readBrowserUiSession } from "./harness-store";
import { createHarnessStateFixture, createViewProjectFixture } from "./utils/tests/test-fixtures";
import { clearCurrentTabItemSelectorsForTests, registerCurrentTabItemSelector } from "./lib/current-tab-item-hotkeys";

type HotkeyDefinition = { hotkey: string; callback: () => void };
type HotkeyOptions = { enabled: boolean; ignoreInputs: boolean; preventDefault: boolean; stopPropagation: boolean };
type HotkeySource = HotkeyDefinition[] | (() => HotkeyDefinition[]);

const createHotkeysMock = mock((_hotkeys: HotkeySource, _options: () => HotkeyOptions) => undefined);
const createHotkeySequenceMock = mock(() => undefined);
const createHotkeySequencesMock = mock(() => undefined);
const { formatForDisplay } = await import("@tanstack/solid-hotkeys");

mock.module("@tanstack/solid-hotkeys", () => ({
  createHotkeys: createHotkeysMock,
  createHotkeySequence: createHotkeySequenceMock,
  createHotkeySequences: createHotkeySequencesMock,
  formatForDisplay
}));

mock.module("./harness-websocket", () => ({
  connectHarnessWebSocket: () => ({
    sendCommand: () => undefined,
    dispose: () => undefined
  })
}));

import { App, createDefaultIdeWindowBounds, shouldCollapseTabStrip } from "./app";
import { measureTabStripMinimumWidth } from "./app/layout-measurement";
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
    return definitions.length < 10 && definitions.some(definition => definition.hotkey === "Mod+K") && definitions.some(definition => definition.hotkey === "Mod+Space");
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
    const project = createViewProjectFixture();
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { projects: [project], activeProjectId: project.id, workspaceModes: [] } }));
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
      "Meta+,",
      "Control+,",
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
    render(() => <App />);
    getHotkeyCall("Mod+I")[0].find((definition) => definition.hotkey === "Mod+I")?.callback();

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

  it("renders preferences as one shared workspace with one section navigator", () => {
    harnessStore.setActiveLeftTab("preferences");
    render(() => <App />);
    expect(document.querySelectorAll('[data-ui-settings-workspace]')).toHaveLength(1);
    expect(screen.getAllByRole('navigation', { name: 'Preference sections' })).toHaveLength(1);
    expect(document.querySelector('[data-panel-group-panel="navigation"]')).toBeNull();
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

  it("measures overflowing tooltip wrappers before collapsing tab labels", () => {
    const nav = document.createElement("nav");
    nav.style.gap = "4px";
    nav.style.paddingLeft = "16px";
    nav.style.paddingRight = "16px";
    for (let index = 0; index < 5; index++) {
      const wrapper = document.createElement("span");
      wrapper.getBoundingClientRect = () => DOMRect.fromRect({ width: 60 });
      Object.defineProperty(wrapper, "scrollWidth", { value: 90 });
      nav.append(wrapper);
    }
    document.body.append(nav);
    expect(measureTabStripMinimumWidth(nav)).toBe(498);
    nav.remove();
  });

  it("uses the shared measured panel group for long workspace content", () => {
    render(() => <App />);

    const grid = document.querySelector("[data-test-main-panel-grid]");

    expect(grid?.getAttribute("data-main-panel-mode")).toBe("open");
    expect(grid?.querySelector('[data-panel-group=""]')).not.toBeNull();
    expect(grid?.querySelector('[data-panel-group-panel="work"]')).not.toBeNull();
    expect(grid?.querySelector('[data-panel-group-handle="navigation"]')?.getAttribute("aria-valuenow")).toBe("276");
  });

  it("gives first-run the workspace and restores contextual panes after opening a project", () => {
    seedHarnessStoreForTests(createHarnessStateFixture({ experienceMode: "advanced", tracePanelMode: "open", workspace: { projects: [], activeProjectId: undefined, workspaceModes: [] } }));
    render(() => <App />);
    expect(document.querySelector('[data-test-empty-project]')).not.toBeNull();
    expect(document.querySelector('[data-panel-group-panel="navigation"]')).toBeNull();
    expect(document.querySelector('[data-panel-group-panel="run-details"]')).toBeNull();
    expect(harnessStore.state.tracePanelMode).toBe("open");
    fireEvent.click(screen.getByRole("button", { name: "Open project switcher" }));
    expect(harnessStore.state.projectSwitcherOpen).toBe(true);
    const project = createViewProjectFixture();
    seedHarnessStoreForTests(createHarnessStateFixture({ experienceMode: "advanced", tracePanelMode: "open", workspace: { projects: [project], activeProjectId: project.id, workspaceModes: [] } }));
    expect(document.querySelector('[data-test-empty-project]')).toBeNull();
    expect(document.querySelector('[data-panel-group-panel="navigation"]')).not.toBeNull();
    expect(document.querySelector('[data-panel-group-panel="run-details"]')).not.toBeNull();
  });

  it("hides run details while editing preferences and restores the previous mode", () => {
    seedHarnessStoreForTests(createHarnessStateFixture({ experienceMode: "advanced", tracePanelMode: "open", workspace: harnessStore.state.workspace }));
    render(() => <App />);
    harnessStore.setActiveLeftTab("preferences");
    expect(document.querySelector('[data-panel-group-panel="run-details"]')).toBeNull();
    expect(document.querySelector('[data-test-terminal-visibility]')?.hasAttribute("hidden")).toBe(true);
    expect(harnessStore.state.tracePanelMode).toBe("open");
    harnessStore.setActiveLeftTab("projects");
    expect(document.querySelector('[data-panel-group-panel="run-details"]')).not.toBeNull();
    expect(document.querySelector('[data-test-terminal-visibility]')?.hasAttribute("hidden")).toBe(false);
  });

  it("mounts one preferences listener owner when entering and reopening settings", () => {
    const added = spyOn(window, "addEventListener");
    try {
      const view = render(() => <App />);
      for (let visit = 1; visit <= 2; visit++) {
        harnessStore.setActiveLeftTab("preferences");
        expect(added.mock.calls.filter(([type]) => type === "preferences-section-change")).toHaveLength(visit);
        expect(added.mock.calls.filter(([type]) => type === "preferences-search-change")).toHaveLength(visit);
        harnessStore.setActiveLeftTab("projects");
      }
      view.unmount();
    } finally { added.mockRestore(); }
  });

  it("labels the narrow navigation mode for its current roster without replacing the pane", () => {
    render(() => <App />);
    const pane = document.querySelector('[data-panel-group-panel="navigation"]');
    const mode = () => document.querySelector('[data-panel-group-mode="navigation"]');
    expect(mode()?.textContent).toBe("Projects");
    harnessStore.setActiveLeftTab("jobs");
    expect(mode()?.textContent).toBe("Jobs");
    expect(document.querySelector('[data-panel-group-panel="navigation"]') === pane).toBe(true);
    harnessStore.setActiveLeftTab("runs");
    expect(mode()?.textContent).toBe("Runs");
    expect(document.querySelector('[data-panel-group-panel="navigation"]') === pane).toBe(true);
  });

  it("persists project-pane collapse through the shared separator", () => {
    render(() => <App />);
    const handle = document.querySelector<HTMLElement>('[data-panel-group-handle="navigation"]')!;
    fireEvent.keyDown(handle, { key: "Enter" });
    expect(readBrowserUiSession().mainPanelSizes?.leftCollapsed).toBe(true);
  });

  it("keeps the selected preferences section reachable without an extra work-pane step", () => {
    render(() => <App />);
    harnessStore.setActiveLeftTab("preferences");
    for (let repeat = 0; repeat < 2; repeat++) {
      fireEvent.click(screen.getByRole("button", { name: "General & UI" }));
      expect(harnessStore.state.preferencesActiveSectionId).toBe('general-ui');
      expect(document.querySelector('[data-ui-settings-content]')?.textContent).toContain('Appearance');
    }
  });

  it("persists main panel sizes in browser session state", () => {
    render(() => <App />);

    harnessStore.setMainPanelSizes({ left: 2, center: 4, right: 1.5 });

    expect(readBrowserUiSession().mainPanelSizes).toEqual({ left: 2, center: 4, right: 1.5 });
  });

  it("cycles trace panel through closed and peek states", async () => {
    render(() => <App />);

    const actions = screen.getByRole("button", { name: "Workspace actions" });
    fireEvent.click(actions);

    expect(harnessStore.state.tracePanelMode).toBe("open");

    fireEvent.click(screen.getByRole("menuitem", { name: /Trace panel:/ }));
    await Promise.resolve();
    expect(harnessStore.state.tracePanelMode).toBe("closed");
    expect(readBrowserUiSession().tracePanelMode).toBe("closed");

    fireEvent.click(actions);
    fireEvent.click(screen.getByRole("menuitem", { name: /Trace panel:/ }));
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

    fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
    expect(screen.queryByRole("menuitem", { name: /Trace panel:/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Help and tutorials" })).not.toBeNull();
    expect(document.querySelector("[data-test-main-panel-grid]")?.getAttribute("data-main-panel-mode")).toBe("closed");
    expect(harnessStore.state.tracePanelMode).toBe("open");
  });

  it("renders trace peek rail when session mode is peek", () => {
    harnessStore.setTracePanelMode("peek");

    render(() => <App />);

    expect(document.querySelector("[data-test-trace-peek-rail]")).not.toBeNull();
    expect(document.querySelector<HTMLElement>('[data-panel-group-panel="run-details"]')?.style.width).toBe("240px");
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

  it("keeps the current surface in task navigation without navbar subtext", () => {
    harnessStore.setActiveLeftTab("runs");
    render(() => <App />);
    expect(document.querySelector('[data-ui-navbar] [data-test-mobile-surface-label]')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Runs' }).getAttribute('aria-selected')).toBe('true');
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
    render(() => <App />);
    getHotkeyCall("Mod+I")[0].find((definition) => definition.hotkey === "Mod+I")?.callback();
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
    render(() => <App />);
    getHotkeyCall("Mod+I")[0].find((definition) => definition.hotkey === "Mod+I")?.callback();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.querySelector("[data-test-ide-virtual-window]")).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(harnessStore.state.activeSurface).toBe("chat");
  });

  it("closes only the project switcher when Escape is pressed over the IDE", async () => {
    render(() => <App />);
    getHotkeyCall("Mod+I")[0].find((definition) => definition.hotkey === "Mod+I")?.callback();
    harnessStore.openProjectSwitcher();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(harnessStore.state.projectSwitcherOpen).toBe(false);
    expect(harnessStore.state.activeSurface).toBe("ide");
  });

  it("closes IDE overlays before Escape closes the virtual window", async () => {
    render(() => <App />);
    getHotkeyCall("Mod+I")[0].find((definition) => definition.hotkey === "Mod+I")?.callback();
    ideStore.setCommandPalette(true);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const escape = () => fireEvent.keyDown(window, { key: 'Escape' });

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
