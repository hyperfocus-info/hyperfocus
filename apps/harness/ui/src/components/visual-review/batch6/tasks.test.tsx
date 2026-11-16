/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import type { ModeDefinition, ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createUiTest } from "../../../utils/tests/test-harness";
import { createHarnessStateFixture } from "../../../utils/tests/test-fixtures";
import { createHarnessStore } from "../../../harness-store";
import { ModeEditorPanel } from "../../mode-editor-panel";

const mode: ModeDefinition = { id: "review", label: "Review application", description: "Review accessibility", plannerPrompt: "Read requirements", executionPrompt: "Inspect UI", scope: "workspace", toolPolicy: "review-only", executionAccess: "read-only", updatedAt: "2026-09-22T12:00:00Z" };
createUiTest("Mode save lifecycle", () => {
  function setup() {
    const store = createHarnessStore(); store.replaceStateForTests(createHarnessStateFixture());
    const [modes, setModes] = createSignal([mode, { ...mode, id: "second", label: "Second mode" }]);
    const commands: Extract<ClientCommand, { type: "mode.save" }>[] = [];
    store.actions.setCommandDispatcher(command => { if (command.type === "mode.save") commands.push(command); });
    render(() => <ModeEditorPanel title="Modes" scope="workspace" modes={modes()} onSave={value => store.actions.saveMode({ type: "mode.save", requestId: `save-${commands.length}`, payload: { scope: "workspace", mode: value } })} onDelete={() => {}} />);
    const edit = () => fireEvent.input(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Draft name" } });
    const save = () => fireEvent.click(screen.getByRole("button", { name: "Save workspace mode" }));
    return { store, commands, setModes, edit, save };
  }
  it("waits for the matching persisted acknowledgement, disables duplicate saves and preserves accepted content", async () => {
    const { store, commands, edit, save, setModes } = setup(); edit(); save(); save();
    expect(commands).toHaveLength(1); expect(screen.getByRole("status").textContent).toContain("Waiting");
    expect(screen.getByRole("button", { name: "Save workspace mode" })).toHaveProperty("disabled", true);
    store.applyServerEvent({ type: "workspace.updated", requestId: "unrelated", payload: { workspace: store.state.workspace } });
    expect(screen.getByRole("status").textContent).toContain("Waiting");
    const accepted = commands[0]!.payload.mode; setModes([accepted]);
    store.applyServerEvent({ type: "workspace.updated", requestId: commands[0]!.requestId, payload: { workspace: { ...store.state.workspace, workspaceModes: [accepted] } } });
    await screen.findByText("Mode saved.");
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Draft name");
  });
  it("retains a rejected draft and retries under a fresh request", async () => {
    const { store, commands, edit, save } = setup(); edit(); save();
    store.applyServerEvent({ type: "command.rejected", requestId: commands[0]!.requestId, payload: { message: "Read-only workspace" } });
    await screen.findByRole("alert"); expect(screen.getByRole("alert").textContent).toContain("Read-only");
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Draft name");
    save(); expect(commands).toHaveLength(2); expect(commands[1]!.requestId).not.toBe(commands[0]!.requestId);
    store.setConnectionState("disconnected"); await screen.findByRole("alert");
  });
  it("retains dirty saved edits through a collection refresh and explicitly reloads latest saved values", () => {
    const { edit, setModes } = setup(); edit();
    setModes([{ ...mode, label: "Updated elsewhere" }]);
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Draft name");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes and reload saved mode" }));
    expect(screen.getByRole("dialog").textContent).toContain("Reload");
    fireEvent.click(screen.getByRole("button", { name: "Discard draft and continue" }));
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Updated elsewhere");
  });
  it("guards a new-mode transition, permits keep editing, then discards explicitly", () => {
    const { edit } = setup(); edit();
    const newMode = screen.getByRole("button", { name: "Create new workspace mode" });
    fireEvent.click(newMode); fireEvent.click(screen.getByRole("button", { name: "Keep editing this mode" }));
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Draft name");
    fireEvent.click(newMode); fireEvent.click(screen.getByRole("button", { name: "Discard draft and continue" }));
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "");
  });
});
