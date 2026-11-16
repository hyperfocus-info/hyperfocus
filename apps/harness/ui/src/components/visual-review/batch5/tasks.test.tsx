/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import type { ModeDefinition } from "@hyperfocus/ai-core/protocol";
import { createUiTest } from "../../../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../../utils/tests/store-test-utils";
import { createHarnessStateFixture } from "../../../utils/tests/test-fixtures";
import { harnessStore } from "../../../harness-store";
import { PreferencesModal } from "../../preferences-modal";
import { ModeEditorPanel } from "../../mode-editor-panel";
import { parsePreferencesImport } from "../../preferences/preferences-import";

const mode: ModeDefinition = { id: "review", label: "Review application", description: "Review accessibility", plannerPrompt: "Read requirements", executionPrompt: "Inspect UI", scope: "workspace", toolPolicy: "review-only", executionAccess: "read-only", updatedAt: "2026-09-22T12:00:00Z" };
createUiTest("Batch five custom modes and preference imports", () => {
  function setup(modes = [mode], scope: "workspace" | "project" = "workspace") {
    const saved: unknown[] = []; const deleted: string[] = [];
    render(() => <ModeEditorPanel title="Custom modes" scope={scope} modes={modes} onSave={async value => { saved.push(value); }} onDelete={id => deleted.push(id)} />);
    return { saved, deleted };
  }
  it("keeps a new draft instead of reselecting the first saved mode", () => {
    const { saved } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Create new workspace mode" }));
    const label = screen.getByRole("textbox", { name: "Label" });
    if (!(label instanceof HTMLInputElement)) throw new Error("Expected HTMLInputElement fixture");
    expect(label.value).toBe("");
    expect(document.activeElement).toBe(label);
    for (const [name, value] of [["Label", "New review"], ["Description", "Description"], ["Planner prompt", "Plan"], ["Execution prompt", "Execute"]]) fireEvent.input(screen.getByRole("textbox", { name }), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save workspace mode" }));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ label: "New review", scope: "workspace" });
    expect(label.value).toBe("New review");
  });
  it("associates rejected required fields and keeps the same focused control", () => {
    const { saved } = setup();
    const label = screen.getByRole("textbox", { name: "Label" });
    fireEvent.input(label, { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save workspace mode" }));
    expect(saved).toHaveLength(0);
    expect(document.activeElement).toBe(label);
    expect(label.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(label.getAttribute("aria-describedby")!)?.textContent).toContain("draft is retained");
    fireEvent.input(label, { target: { value: "Corrected review" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workspace mode" }));
    expect(saved).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("retains new-mode editing when the host refreshes its saved collection", () => {
    const [modes, setModes] = createSignal([mode]);
    render(() => <ModeEditorPanel title="Custom modes" scope="workspace" modes={modes()} onSave={async () => {}} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Create new workspace mode" }));
    const label = screen.getByRole("textbox", { name: "Label" });
    if (!(label instanceof HTMLInputElement)) throw new Error("Expected HTMLInputElement fixture");
    fireEvent.input(label, { target: { value: "Draft in progress" } });
    setModes([{ ...mode, description: "Updated elsewhere" }]);
    expect(label.value).toBe("Draft in progress");
    expect(screen.getByRole("button", { name: "Delete selected workspace mode" })).toHaveProperty("disabled", true);
  });
  it("confirms the saved name and permits cancellation before deleting", () => {
    const { deleted } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete selected workspace mode" }));
    expect(screen.getByRole("dialog").textContent).toContain("Review application");
    expect(deleted).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Keep saved mode" }));
    expect(deleted).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected workspace mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm mode deletion" }));
    expect(deleted).toEqual(["review"]);
  });
  it("does not expose another scope as an editable selected mode", () => {
    setup([mode], "project");
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "");
    expect(screen.getByRole("button", { name: "Delete selected project mode" })).toHaveProperty("disabled", true);
  });
  it("rejects empty or unknown-only imports, accepts recognized partial payloads", () => {
    expect(() => parsePreferencesImport("{}")).toThrow("No recognized preferences");
    expect(() => parsePreferencesImport('{"other":true}')).toThrow("No recognized preferences");
    expect(parsePreferencesImport('{"debugEnabled":false}')).toEqual({ debugEnabled: false });
  });
  it("imports one field without resetting accepted custom shortcuts", async () => {
    clearBrowserStateForTests();
    seedHarnessStoreForTests(createHarnessStateFixture({ activeSurface: "preferences", preferencesActiveSectionId: "developer-advanced", appHotkeyPreferences: { ...harnessStore.state.appHotkeyPreferences, openProjectSwitcher: ["Alt+9"] } }));
    render(() => <PreferencesModal />);
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("Expected HTMLInputElement fixture");
    fireEvent.change(input, { target: { files: [{ text: async () => '{"debugEnabled":true}' }] } });
    await screen.findByText("Preferences imported. Local defaults updated; provider keys were not imported.");
    expect(harnessStore.state.appHotkeyPreferences.openProjectSwitcher).toEqual(["Alt+9"]);
    expect(harnessStore.state.debugEnabled).toBe(true);
  });
});
