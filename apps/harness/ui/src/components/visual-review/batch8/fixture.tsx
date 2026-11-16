/** @jsxImportSource solid-js */
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import type { ClientCommand, ModeDefinition } from "@hyperfocus/ai-core/protocol";
import { createHarnessStore, setActiveHarnessStore } from "../../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../../toast-store";
import { createHarnessStateFixture, createViewProjectFixture } from "../../../utils/tests/test-fixtures";
import { ModeEditorPanel } from "../../mode-editor-panel";
import { PreferencesModal } from "../../preferences-modal";
import { BackgroundJobEditorDialog } from "../../background-job-editor-dialog";
import "../../../global-styles";

const store = createHarnessStore();
setActiveHarnessStore(store); setActiveToastStore(createToastStoreForProvider());
const mode: ModeDefinition = { id: "review", label: "Customer accessibility review", description: "Review customer recovery and accessible controls", plannerPrompt: "Read requirements", executionPrompt: "Inspect keyboard access", scope: "workspace", toolPolicy: "review-only", executionAccess: "read-only", updatedAt: "2026-09-22T12:00:00Z" };
const project = createViewProjectFixture({ id: "review-project", name: "Customer portal" });
store.replaceStateForTests(createHarnessStateFixture({ workspace: { projects: [project], activeProjectId: project.id, workspaceModes: [mode] } }));
function Fixture() {
  const [projectKey, setProjectKey] = createSignal("customer");
  const [visible, setVisible] = createSignal(true);
  const [modes, setModes] = createSignal([{ ...mode, scope: "project" as const }]);
  const [pending, setPending] = createSignal<Extract<ClientCommand, { type: "background-job.save" }>>();
  const [commands, setCommands] = createSignal(0);
  store.actions.setCommandDispatcher(command => {
    if (command.type === "background-job.schedule.preview") store.applyServerEvent({ type: "background-job-schedule.preview", requestId: command.requestId, payload: { input: command.payload.input, schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: "2026-09-23T12:00:00Z", sourceText: command.payload.input } } });
    if (command.type === "background-job.save") { setPending(command); setCommands(count => count + 1); }
  });
  window.addEventListener("fixture-reject", () => { const command = pending(); if (command) store.applyServerEvent({ type: "command.rejected", requestId: command.requestId, payload: { message: "Workspace is read-only. Reconnect and retry." } }); });
  window.addEventListener("fixture-accept", () => { const command = pending(); if (command) store.applyServerEvent({ type: "background-jobs.updated", requestId: command.requestId, payload: { backgroundJobs: { ...store.state.backgroundJobs, jobs: [command.payload.job] } } }); });
  window.addEventListener("fixture-remove-mode", () => setModes([]));
  const open = (source: "create" | "edit" | "promote") => store.openBackgroundJobEditor({ source, jobId: source === "edit" ? "existing-job" : undefined, createdFromRunId: source === "promote" ? "completed-run" : undefined, projectId: project.id, kind: "shell", name: source === "promote" ? "Repeat successful customer checks" : "Customer portal smoke checks", description: "", scheduleInput: "1h", timezone: "UTC", aiPrompt: "", shellExecutable: "bun", shellArgsText: "run\ntest", shellCwd: "", shellEnvRefsText: "", shellTimeoutSeconds: 600, shellNetworkAccess: false });
  return <main data-test-fixture-ready="1" style={{ padding: "16px", "max-width": "1000px", "box-sizing": "border-box" }}>
    <aside aria-label="Disposable fixture controls">
      <button onClick={() => { store.setPreferencesActiveSectionId("workspace-memory"); store.openPreferencesModal(); }}>Open preferences</button>
      <button onClick={() => { setVisible(false); setProjectKey(projectKey() === "customer" ? "billing" : "customer"); queueMicrotask(() => setVisible(true)); }}>Switch project</button>
      <button onClick={() => open("create")}>Create task</button><button onClick={() => open("edit")}>Edit task</button><button onClick={() => open("promote")}>Promote run</button>
    </aside>
    <h1>{projectKey() === "customer" ? "Customer portal" : "Billing portal"}</h1>
    <Show when={visible() && store.state.activeSurface !== "preferences"}><ModeEditorPanel title="Project custom modes" scope="project" modes={modes()} draftOwner={store} draftKey={projectKey()} onSave={async () => {}} onDelete={() => {}} /></Show>
    <output data-test-command-count>{commands()}</output><Show when={store.state.activeSurface === "preferences"}><PreferencesModal /></Show><BackgroundJobEditorDialog />
  </main>;
}
render(() => <Fixture />, document.getElementById("root")!);
