/** @jsxImportSource solid-js */
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import type { ModeDefinition } from "@hyperfocus/ai-core/protocol";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../../toast-store";
import { createHarnessStateFixture } from "../../../utils/tests/test-fixtures";
import { PreferencesModal } from "../../preferences-modal";
import { ModeEditorPanel } from "../../mode-editor-panel";
import { NotificationInbox } from "../../notification-inbox";
import "../../../global-styles";

const surface = new URLSearchParams(location.search).get("surface") ?? "create";
setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());
harnessStore.replaceStateForTests(createHarnessStateFixture({ activeSurface: "preferences", preferencesActiveSectionId: "developer-advanced", appHotkeyPreferences: { ...harnessStore.state.appHotkeyPreferences, openProjectSwitcher: ["Alt+9"] } }));
if (surface === "portable") {
  harnessStore.replaceStateForTests(createHarnessStateFixture({ activeSurface: "preferences", preferencesActiveSectionId: "developer-advanced",
    setup: { ...harnessStore.state.setup, launchMode: "portable-launcher" },
    notifications: { items: [{ id: "cli-update:pi:2.0.0", kind: "cli-update", interactive: true,
      createdAt: "2026-10-23T12:00:00Z", agentId: "pi", label: "Pi", currentVersion: "1.0.0", latestVersion: "2.0.0", updateCommand: "bun add pi@latest" }],
    unreadCount: 1, interactiveUnreadCount: 1, passiveUnreadCount: 0 } }));
}
function Fixture() {
  const [result, setResult] = createSignal("");
  const [modes, setModes] = createSignal<ModeDefinition[]>(Array.from({ length: 12 }, (_, index) => ({ id: `review-${index + 1}`, label: `Customer application accessibility review ${index + 1}`, description: "Inspect the application and explain concrete recovery steps.", plannerPrompt: "Read the task and identify affected screens.", executionPrompt: "Review keyboard access and report failures.", scope: "workspace", toolPolicy: "review-only", executionAccess: "read-only", updatedAt: "2026-09-22T12:00:00Z" })));
  harnessStore.actions.setCommandDispatcher(command => setResult(command.type));
  return <main data-test-fixture-ready="1" style={{ padding: "16px", width: "100%", "max-width": "1000px", "box-sizing": "border-box" }}>
    <output aria-label="Result">{result()}</output>
    <output aria-label="Saved shortcut">{harnessStore.state.appHotkeyPreferences.openProjectSwitcher.join(",")}</output>
    {surface === "portable" && <NotificationInbox />}
    {surface === "partial" || surface === "unknown" || surface === "portable" ? <PreferencesModal /> : <ModeEditorPanel title="Workspace custom modes" scope="workspace" modes={modes()} onSave={async mode => { setResult(`Saved ${mode.label}`); setModes(previous => [...previous.filter(item => item.id !== mode.id), mode]); }} onDelete={id => { setResult(`Deleted ${id}`); setModes(previous => previous.filter(item => item.id !== id)); }} />}
  </main>;
}
render(() => <Fixture />, document.getElementById("root")!);
