/** @jsxImportSource solid-js */
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { createProjectThreadSummary, type TerminalSession } from "@hyperfocus/ai-core/protocol";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../../toast-store";
import { createAgentPlanFixture, createHarnessStateFixture, createRunFixture, createSubtaskFixture, createTraceFixture, createViewProjectFixture } from "../../../utils/tests/test-fixtures";
import { terminalStore } from "../../../terminal/terminal-store";
import { TerminalHistoryDialog } from "../../../terminal/terminal-history-dialog";
import { ChatPanel } from "../../chat-panel";
import { TracePanel } from "../../trace-panel";
import { ExecutionPlanDialog } from "../../execution-plan-dialog";
import { ThreadCleanupDialog } from "../../thread-cleanup-dialog";
import { HelpTutorialDialog } from "../../help-tutorial-dialog";
import { tutorialDefinitions } from "../../tutorial-definitions";
import "../../../global-styles";

const surface = new URLSearchParams(location.search).get("surface") ?? "events";
const now = "2026-09-21T12:00:00.000Z";
const thread = createProjectThreadSummary({ id: "thread-1", title: "Verify retained customer workspace before retrying the import", titleSource: "custom", updatedAt: now });
const plan = createAgentPlanFixture({ planningModelId: "openai/customer-workspace-verification-model-with-extended-context", executionModelId: "openai/customer-workspace-execution-model-with-extended-context" });
const run = createRunFixture({ status: "failed", retryable: true, summary: "Verification needs another attempt.", subtasks: surface === "subtasks" ? [createSubtaskFixture({ title: "Verify retained customer workspace before retrying the interrupted import", status: "failed", attemptCount: 2, errorMessage: "The selected project changed. Restore its original selection before retrying." })] : [] });
const project = createViewProjectFixture({ name: "Customer workspace recovery and import verification", activeThreadId: thread.id, threads: [thread, createProjectThreadSummary({ id: "old-thread", title: "Old investigation", titleSource: "custom", updatedAt: "2020-01-01T00:00:00.000Z", lastUserMessageAt: "2020-01-01T00:00:00.000Z" })],
  lastRun: surface === "subtasks" ? run : undefined, latestPlan: surface === "plan" ? plan : undefined,
  traces: surface === "events" ? [createTraceFixture({ stage: "subagent-start", modelId: "openai/customer-workspace-verification-model-with-extended-context", message: "Verification started for the preserved workspace.", detail: "Review the original selection before retrying." })] : [] });
setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());
harnessStore.replaceStateForTests(createHarnessStateFixture({ connectionState: "connected", chatPaneTab: "chat", experienceMode: "simple", workspace: { activeProjectId: project.id, projects: [project] } }));
const terminal: TerminalSession = { id: "terminal-1", projectId: project.id, name: "Customer workspace import verification terminal", shellId: "powershell", cwd: "C:/owned-fixture/customer-workspace/import-verification", status: "running", cols: 80, rows: 24, startedAt: now, updatedAt: now };
terminalStore.resetForTests({ history: { sessions: [terminal] }, sessions: [terminal], open: false });

function Fixture() {
  const [result, setResult] = createSignal("");
  const [open, setOpen] = createSignal(true);
  harnessStore.actions.setCommandDispatcher(command => setResult(command.type));
  return <main data-test-fixture-ready="1" style={{ padding: "16px", width: "100%", "max-width": "900px", "box-sizing": "border-box", "min-height": "100vh" }}>
    <output aria-label="Fixture action">{result()}</output>
    {surface === "header" && <div style={{ height: "850px", display: "flex" }}><ChatPanel /></div>}
    {["events", "plan", "subtasks"].includes(surface) && <div style={{ height: "850px", width: "100%" }}><TracePanel /></div>}
    <ExecutionPlanDialog executionPlan={plan.executionPlan} />
    {surface === "terminal" && <><TerminalHistoryDialog open={open()} title="Thread terminal history" scope={{ projectId: project.id }} onClose={() => setOpen(false)} /><Show when={terminalStore.state.open}><section aria-label="Selected terminal"><h2>{terminal.name}</h2><p>Terminal selected for review.</p></section></Show></>}
    {surface === "cleanup" && <ThreadCleanupDialog open={open()} projects={[project]} activeProjectId={project.id} onClose={() => setOpen(false)} onSubmit={input => setResult(`archive:${input.projectIds?.join(",") ?? "all"}`)} />}
    {surface === "help" && <><HelpTutorialDialog open={open()} setup={{ launchMode: "source", updatedAt: now, readyRequiredCount: 1, totalRequiredCount: 4, checks: [] }} completedTutorialIds={["open-project"]} dismissedTutorialIds={[]} satisfiedTutorialIds={[]} onClose={() => setOpen(false)} onStartTutorial={id => { setResult(id); setOpen(false); }} /><Show when={result()}><section aria-label="Selected walkthrough"><h2>{tutorialDefinitions.find(item => item.id === result())?.title}</h2><p>{tutorialDefinitions.find(item => item.id === result())?.steps[0]?.body}</p></section></Show></>}
  </main>;
}
render(() => <Fixture />, document.getElementById("root")!);
