/** @jsxImportSource solid-js */
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import type { ClientCommand, ModeDefinition } from "@hyperfocus/ai-core/protocol";
import { createRequestId } from "@hyperfocus/ai-core/protocol";
import { createHarnessStore, setActiveHarnessStore } from "../../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../../toast-store";
import { createHarnessStateFixture } from "../../../utils/tests/test-fixtures";
import { ModeEditorPanel } from "../../mode-editor-panel";
import "../../../global-styles";

const store = createHarnessStore();
setActiveHarnessStore(store); setActiveToastStore(createToastStoreForProvider());
const initial: ModeDefinition[] = [1, 2].map(index => ({ id: `review-${index}`, label: `Customer accessibility review ${index}`, description: "Review customer recovery and accessible controls.", plannerPrompt: "Read the requirements and identify affected screens.", executionPrompt: "Inspect keyboard access and explain failures.", scope: "workspace", toolPolicy: "review-only", executionAccess: "read-only", updatedAt: "2026-09-22T12:00:00Z" }));
store.replaceStateForTests(createHarnessStateFixture());
function Fixture() {
  const [modes, setModes] = createSignal(initial);
  const [pending, setPending] = createSignal<Extract<ClientCommand, { type: "mode.save" }>>();
  store.actions.setCommandDispatcher(command => { if (command.type === "mode.save") setPending(command); });
  const respond = (reject: boolean) => {
    const command = pending(); if (!command) return;
    if (reject) store.applyServerEvent({ type: "command.rejected", requestId: command.requestId, payload: { message: "Mode was not saved: workspace is read-only." } });
    else {
      const next = [...modes().filter(mode => mode.id !== command.payload.mode.id), command.payload.mode];
      setModes(next);
      store.applyServerEvent({ type: "workspace.updated", requestId: command.requestId, payload: { workspace: { ...store.state.workspace, workspaceModes: next } } });
    }
    setPending(undefined);
  };
  return <main data-test-fixture-ready="1" style={{ padding: "16px", width: "100%", "max-width": "1000px", "box-sizing": "border-box" }}>
    <aside aria-label="Disposable command fixture"><button onClick={() => respond(false)}>Server accepts save</button><button onClick={() => respond(true)}>Server rejects save</button><button onClick={() => setModes(modes().map(mode => ({ ...mode, description: "Refreshed server description" })))}>Refresh saved modes</button></aside>
    <ModeEditorPanel title="Workspace custom modes" scope="workspace" modes={modes()} onSave={mode => store.actions.saveMode({ type: "mode.save", requestId: createRequestId(), payload: { scope: "workspace", mode } })} onDelete={() => {}} />
  </main>;
}
render(() => <Fixture />, document.getElementById("root")!);
