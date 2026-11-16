/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import type { ClientCommand, ModeDefinition } from "@hyperfocus/ai-core/protocol";
import { harnessStore } from "../../../harness-store";
import { createUiTest } from "../../../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../../../utils/tests/test-fixtures";
import { ModeEditorPanel } from "../../mode-editor-panel";
import { BackgroundJobEditorDialog } from "../../background-job-editor-dialog";

const mode: ModeDefinition = { id: "review", label: "Review", description: "Review accessibility", plannerPrompt: "Read", executionPrompt: "Inspect", scope: "project", toolPolicy: "review-only", executionAccess: "read-only", updatedAt: "2026-09-22T12:00:00Z" };
createUiTest("Mode host lifecycle and scheduled task acknowledgement", () => {
  beforeEach(clearBrowserStateForTests);
  it("restores drafts only for their store and project, clears explicit discard and warns on open-draft unload", () => {
    const owner = {}; const [key, setKey] = createSignal("one"); const [open, setOpen] = createSignal(true);
    render(() => <Show when={open()}><Show when={key()} keyed>{id => <ModeEditorPanel title="Modes" scope="project" modes={[mode]} draftOwner={owner} draftKey={id} onSave={async () => {}} onDelete={() => {}} />}</Show></Show>);
    fireEvent.input(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Retained" } });
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    setOpen(false); const awayUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(awayUnload); expect(awayUnload.defaultPrevented).toBe(true);
    setOpen(true); expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Retained");
    setKey("two"); expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Review");
    setKey("one"); expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Retained");
    fireEvent.click(screen.getByRole("button", { name: "Discard retained draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard draft and continue" }));
    setOpen(false); setOpen(true); expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Review");
  });
  it("requires explicit recreation after external removal without losing prompts", () => {
    const [modes, setModes] = createSignal([mode]);
    render(() => <ModeEditorPanel title="Modes" scope="project" modes={modes()} onSave={async () => {}} onDelete={() => {}} />);
    fireEvent.input(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Retained" } }); setModes([]);
    expect(screen.getByRole("alert").textContent).toContain("removed elsewhere");
    expect(screen.getByRole("button", { name: "Save project mode" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Recreate removed mode" }));
    expect(screen.getByRole("textbox", { name: "Planner prompt" })).toHaveProperty("value", "Read");
    expect(screen.getByRole("button", { name: "Save project mode" }).hasAttribute("disabled")).toBe(false);
  });
  it("retains an in-flight mode request across unmount and settles the restored editor", async () => {
    let accept!: () => void; const pending = new Promise<void>(resolve => { accept = resolve; }); const [open, setOpen] = createSignal(true); const owner = {};
    render(() => <Show when={open()}><ModeEditorPanel title="Modes" scope="project" modes={[mode]} draftOwner={owner} draftKey="one" onSave={() => pending} onDelete={() => {}} /></Show>);
    fireEvent.input(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Retained" } });
    fireEvent.click(screen.getByRole("button", { name: "Save project mode" })); setOpen(false); setOpen(true);
    expect(screen.getByRole("button", { name: "Save project mode" }).hasAttribute("disabled")).toBe(true);
    accept(); await screen.findByText("Mode saved."); expect(screen.queryByText(/unsaved draft was restored/)).toBeNull();
  });
  for (const source of ["create", "edit", "promote"] as const) it(`${source}: keeps exact draft and stable identity through rejection, ignores unrelated events, closes only after acknowledgement`, async () => {
    const project = createViewProjectFixture({ id: "target" });
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { projects: [project], activeProjectId: project.id } }));
    const commands: Extract<ClientCommand, { type: "background-job.save" }>[] = [];
    harnessStore.actions.setCommandDispatcher(command => {
      if (command.type === "background-job.save") commands.push(command);
      if (command.type === "background-job.schedule.preview") harnessStore.applyServerEvent({ type: "background-job-schedule.preview", requestId: command.requestId, payload: { input: "1h", schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: "2026-09-23T12:00:00Z", sourceText: "1h" } } });
    });
    harnessStore.openBackgroundJobEditor({ source, projectId: project.id, jobId: source === "edit" ? "existing-job" : undefined, createdFromRunId: source === "promote" ? "successful-run" : undefined, kind: source === "promote" ? "ai-routine" : "shell", name: "Checks", description: "", scheduleInput: "1h", timezone: "UTC", aiPrompt: "Repeat the completed customer accessibility review", shellExecutable: "bun", shellArgsText: "run\ntest", shellCwd: "", shellEnvRefsText: "", shellTimeoutSeconds: 600, shellNetworkAccess: false });
    render(() => <BackgroundJobEditorDialog />);
    const originalDraft = harnessStore.state.backgroundJobEditorDraft!;
    await waitFor(() => expect(screen.getByRole("button", { name: "Save task" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    expect(harnessStore.state.backgroundJobEditorOpen).toBe(true);
    expect(screen.getByRole("group", { name: "Task fields" }).hasAttribute("disabled")).toBe(true);
    harnessStore.applyServerEvent({ type: "background-jobs.updated", requestId: "unrelated", payload: { backgroundJobs: harnessStore.state.backgroundJobs } });
    expect(harnessStore.state.backgroundJobEditorOpen).toBe(true);
    harnessStore.applyServerEvent({ type: "command.rejected", requestId: commands[0]!.requestId, payload: { message: "Read-only workspace" } });
    await screen.findByRole("alert"); expect(screen.getByLabelText("Name")).toHaveProperty("value", "Checks");
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    expect(commands).toHaveLength(2); expect(commands[1]!.payload.job.id).toBe(commands[0]!.payload.job.id);
    expect(commands[1]!.payload.job.createdFromRunId).toBe(source === "promote" ? "successful-run" : undefined);
    if (source === "promote") expect(commands[1]!.payload.job.definition).toMatchObject({ kind: "ai-routine", prompt: "Repeat the completed customer accessibility review" });
    if (source === "edit") expect(commands[1]!.payload.job.id).toBe("existing-job");
    harnessStore.applyServerEvent({ type: "background-jobs.updated", requestId: commands[1]!.requestId, payload: { backgroundJobs: { ...harnessStore.state.backgroundJobs, jobs: [commands[1]!.payload.job] } } });
    await waitFor(() => expect(harnessStore.state.backgroundJobEditorOpen).toBe(false));
    if (source === "create") {
      harnessStore.openBackgroundJobEditor({ ...originalDraft, name: "Earlier draft" });
      await waitFor(() => expect(screen.getByRole("button", { name: "Save task" }).hasAttribute("disabled")).toBe(false));
      fireEvent.click(screen.getByRole("button", { name: "Save task" }));
      harnessStore.openBackgroundJobEditor({ ...originalDraft, name: "Replacement draft" });
      harnessStore.applyServerEvent({ type: "command.rejected", requestId: commands[2]!.requestId, payload: { message: "Earlier request failed" } });
      await waitFor(() => expect(screen.getByRole("button", { name: "Save task" }).hasAttribute("disabled")).toBe(false));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "Replacement draft");
    }
  });
});
