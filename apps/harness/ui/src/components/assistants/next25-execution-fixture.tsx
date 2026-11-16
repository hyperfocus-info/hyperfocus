/** @jsxImportSource solid-js */
import { render } from "solid-js/web";
import { StreamedToolBlock } from "../streamed-tool-block";
import { TracePanel } from "../trace-panel";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../toast-store";
import { createBrowserSessionFixture, createHarnessStateFixture, createRunFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
import "../../global-styles";

setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());
const now = "2026-09-21T12:00:00.000Z";
const run = createRunFixture({ id: "run-approval", status: "running-main", browserSessions: [createBrowserSessionFixture({
  id: "session-approval", runId: "run-approval", status: "awaiting-approval", pendingApproval: {
    toolCallId: "browser-open", toolName: "playwright-browser", kind: "navigate", label: "Open customer recovery report",
    inputSummary: "https://example.test/reports/" + "customer-recovery-".repeat(18), status: "pending", requestedAt: now,
  },
})] });
const project = createViewProjectFixture({ id: "project-approval", activeRun: run, lastRun: run });
const paused = new URLSearchParams(location.search).get("paused") === "1";
harnessStore.replaceStateForTests(createHarnessStateFixture({ workspace: { activeProjectId: project.id, projects: [project] },
  executionControl: { isPaused: paused, deferredPlanningQuestionCount: 0, deferredAssistantQuestionCount: 0, deferredBrowserApprovalCount: 0 } }));
harnessStore.actions.setCommandDispatcher(() => undefined);
const execution = new URLSearchParams(location.search).get("surface") === "approval";
render(() => <main style={{ padding: "16px", width: "100%", "max-width": "760px", "box-sizing": "border-box" }} data-test-fixture-ready="1">
  {execution ? <TracePanel /> : <StreamedToolBlock block={{ id: "tool-block", runId: "run-tools", intervalId: "1", startedAt: now, updatedAt: now, live: false,
    activities: [{ id: "tool-1", runId: "run-tools", owner: "main", toolCallId: "tool-1", toolName: "shell", category: "shell",
      command: "bun run verify-customer-workspace --recovery", argsSummary: "Check customer recovery", status: "failed", exitCode: 1,
      outputPreview: "Verification failed: selected project changed during asynchronous recovery.", startedAt: now, updatedAt: now,
      stderrPreview: "WorkspacePath/".repeat(40), rawResultStatus: "final" }],
  }} />}
</main>, document.getElementById("root")!);
