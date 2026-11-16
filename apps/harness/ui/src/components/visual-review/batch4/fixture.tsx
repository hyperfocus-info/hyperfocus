/** @jsxImportSource solid-js */
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../../toast-store";
import { createHarnessStateFixture } from "../../../utils/tests/test-fixtures";
import { PreferencesModal } from "../../preferences-modal";
import { ExecutionLog } from "../../primitives/execution-log";
import "../../../global-styles";

const surface = new URLSearchParams(location.search).get("surface") ?? "log";
setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());
harnessStore.replaceStateForTests(createHarnessStateFixture({ activeSurface: "preferences", activeLeftTab: "preferences", preferencesActiveSectionId: surface === "usage" || surface === "reset" ? "usage" : surface === "import" || surface === "keys" ? "developer-advanced" : "keybinds" }));
function Fixture() {
  const [commands, setCommands] = createSignal<string[]>([]);
  harnessStore.actions.setCommandDispatcher(command => setCommands(previous => [...previous, command.type]));
  return <main data-test-fixture-ready="1" style={{ padding: "16px", width: "100%", "max-width": "900px", "box-sizing": "border-box" }}>
    <output aria-label="Dispatched commands">{commands().join(", ")}</output>
    {surface === "log" ? <div style={{ width: "100%", "max-width": "360px", height: "800px", display: "flex" }}><ExecutionLog entries={[{ id: "log-1", level: "execution-failed", createdAt: "2026-09-22T12:00:00Z", message: "Customer workspace import verification requires another attempt before shipping the restored application.", detail: "Restore the original project selection, then retry verification.", detailKind: "plain" }]} /></div> : <PreferencesModal />}
  </main>;
}
render(() => <Fixture />, document.getElementById("root")!);
