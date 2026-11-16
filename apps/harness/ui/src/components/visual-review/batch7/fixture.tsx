/** @jsxImportSource solid-js */
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { createHarnessStore, setActiveHarnessStore } from "../../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../../toast-store";
import { createHarnessStateFixture, createViewProjectFixture } from "../../../utils/tests/test-fixtures";
import { BackgroundJobEditorDialog } from "../../background-job-editor-dialog";
import "../../../global-styles";

const store = createHarnessStore();
setActiveHarnessStore(store); setActiveToastStore(createToastStoreForProvider());
const project = createViewProjectFixture({ id: "review-project", name: "Customer portal", projectModes: [{ id: "custom-review", label: "Customer review", description: "Review customer flows", scope: "project", plannerPrompt: "Plan", executionPrompt: "Review", toolPolicy: "review-only", executionAccess: "read-only", updatedAt: "2026-09-22T12:00:00Z" }] });
store.replaceStateForTests(createHarnessStateFixture({ workspace: { projects: [project], activeProjectId: project.id } }));
store.replaceStateForTests({ ...store.state, backgroundJobs: { ...store.state.backgroundJobs, templates: [{ id: "checks", label: "Build checks", description: "Replace command with build verification", kind: "shell", definition: { kind: "shell", executable: "bun", args: ["run", "build"], timeoutSeconds: 300 } }] } });
window.addEventListener("fixture-project-arrived", () => store.replaceStateForTests({ ...store.state, workspace: { ...store.state.workspace, projects: [createViewProjectFixture({ id: "replacement", name: "Replacement workspace" })] } }));
function Fixture() {
  const [commands, setCommands] = createSignal("No task submitted");
  store.actions.setCommandDispatcher(command => {
    if (command.type === "background-job.schedule.preview") store.applyServerEvent({ type: "background-job-schedule.preview", requestId: command.requestId, payload: { input: command.payload.input, schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: "2026-09-23T12:00:00Z", sourceText: command.payload.input } } });
    if (command.type === "background-job.save") setCommands(JSON.stringify(command.payload.job.definition));
  });
  const open = (ai = false) => store.openBackgroundJobEditor({ source: "create", projectId: project.id, kind: ai ? "ai-routine" : "shell", name: "Customer portal smoke checks", description: "", scheduleInput: "1h", timezone: "UTC", aiPrompt: "Check customer flows", aiModeId: "custom-review", shellExecutable: "bun", shellArgsText: "run\ntest", shellCwd: "", shellEnvRefsText: "", shellTimeoutSeconds: 600, shellNetworkAccess: false });
  return <main data-test-fixture-ready="1" style={{ padding: "16px" }}>
    <h1>Scheduled task review</h1>
    <button onClick={() => open()}>Open shell task</button><button onClick={() => open(true)}>Open AI task</button>
    <button onClick={() => store.replaceStateForTests({ ...store.state, workspace: { ...store.state.workspace, projects: [] } })}>Remove project</button>
    <button onClick={() => store.replaceStateForTests({ ...store.state, workspace: { ...store.state.workspace, projects: [{ ...project, projectModes: [] }] } })}>Remove mode</button>
    <output data-test-commands>{commands()}</output><BackgroundJobEditorDialog />
  </main>;
}
render(() => <Fixture />, document.getElementById("root")!);
