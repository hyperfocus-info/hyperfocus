/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../../../utils/tests/store-test-utils";
import { createHarnessStateFixture } from "../../../utils/tests/test-fixtures";
import { harnessStore } from "../../../harness-store";
import { PreferencesModal } from "../../preferences-modal";

createUiTest("Batch four preference tasks", () => {
  function setup() {
    clearBrowserStateForTests();
    seedHarnessStoreForTests(createHarnessStateFixture({ activeSurface: "preferences", preferencesActiveSectionId: "keybinds" }));
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    render(() => <PreferencesModal />);
    return commands;
  }
  it("filters actual rows and recovers from no matches", () => {
    setup();
    const search = screen.getByRole("textbox", { name: "Search keybindings" });
    fireEvent.input(search, { target: { value: "no-such-command-zz" } });
    expect(document.querySelectorAll("[data-test-keybind-row]").length).toBe(0);
    expect(screen.getByRole("status").textContent).toContain("No shortcuts match");
    fireEvent.input(search, { target: { value: "Project switcher" } });
    expect(document.querySelectorAll("[data-test-keybind-row]").length).toBe(1);
  });
  it("preserves the recording input through modifiers and lets Tab leave without saving", () => {
    const commands = setup();
    const field = screen.getAllByRole("textbox", { name: "Project switcher hotkey" })[0]!;
    field.focus();
    const saved = [...harnessStore.state.appHotkeyPreferences.openProjectSwitcher];
    fireEvent.keyDown(field, { key: "Control", ctrlKey: true });
    expect(screen.getAllByRole("textbox", { name: "Project switcher hotkey" })[0]).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toContain("Escape");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    field.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(commands.length).toBe(0);
    expect(harnessStore.state.appHotkeyPreferences.openProjectSwitcher).toEqual(saved);
  });
  it("opens conflict diagnosis with the existing command name", async () => {
    setup();
    const field = screen.getByRole("textbox", { name: "Projects hotkey" });
    field.focus();
    fireEvent.keyDown(field, { key: "2", ctrlKey: true });
    expect((await screen.findByRole("dialog")).textContent).toContain("Assistants");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel duplicate keybind save" }));
    expect(harnessStore.state.appHotkeyPreferences.openProjects).toEqual(["Mod+1"]);
  });
});
