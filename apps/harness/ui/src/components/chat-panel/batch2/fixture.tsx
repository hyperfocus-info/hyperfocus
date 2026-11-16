import { ChatPanelProvider } from "../state/panel-context";
/** @jsxImportSource solid-js */
import { createSignal,Switch } from "solid-js";
import { render } from "solid-js/web";
import "../../../global-styles";
import { createHarnessStore,harnessStore,setActiveHarnessStore } from "../../../harness-store";
import { createToastStoreForProvider,setActiveToastStore } from "../../../toast-store";
import { createHarnessStateFixture,createRunFixture,createTraceFixture,createViewProjectFixture } from "../../../utils/tests/test-fixtures";
import { createChatPanelController,type ChatPanelController } from "../../chat-panel";
import { ChatComposerLookupMenu,ChatComposerReferences,ChatPendingQuestion } from "../chat-composer-sections";
import { ChatExperimentDialog } from "../chat-experiment-dialog";
import { ChatSetupDialog } from "../chat-setup-dialog";
import { ChatTranscriptEvents,ChatTranscriptRun } from "../chat-transcript-states";

setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());
const now = "2026-09-21T12:00:00.000Z";
const longPath = "src/customer-workspace/recovery/verify-retained-customer-project-before-retry.ts";
const experiment: NonNullable<ReturnType<ChatPanelController["experimentRun"]>> = {
  id: "experiment-review", runId: "run-review", status: "completed", virtualBranchName: "experiment/customer-workspace-recovery",
  repoMountPath: "C:/owned-fixture", projectMountPath: "C:/owned-fixture", baseDirtyFingerprint: "fixture", filesChanged: 2,
  insertions: 12, deletions: 3, createdAt: now, updatedAt: now,
};
const run = createRunFixture({ id: "run-review", status: "failed", failureMessage: "Verification stopped because the selected customer workspace changed. Restore its original selection before retrying.", summary: "The recovery patch is ready, but verification did not finish.", retryable: true });
const project = createViewProjectFixture({ lastRun: run, experimentInspection: {
  experiment, diffText: "- const project = activeProject();\n+ const project = requestedProject;", filesChanged: 2, insertions: 12, deletions: 3,
  changedPaths: [longPath, "src/recovery.test.ts"], files: [longPath, "src/recovery.test.ts"].map(path => ({ path, additions: 6, deletions: 1, hunksPreview: "- const project = activeProject();\n+ const project = requestedProject;" })),
} });
const state = createHarnessStateFixture({ workspace: { activeProjectId: project.id, projects: [project] } });
harnessStore.replaceStateForTests(state);
harnessStore.actions.setCommandDispatcher(() => undefined);
const surface = new URLSearchParams(location.search).get("surface") ?? "question";
function Fixture() {
  const controller = createChatPanelController();
  const [result, setResult] = createSignal("");
  const [open, setOpen] = createSignal(true);
  const [selected, setSelected] = createSignal<string | undefined>(longPath);
  const [attachments, setAttachments] = createSignal<ReturnType<ChatPanelController["draftAttachments"]>>([
    { id: "attachment-1", kind: "document", name: "Customer-workspace-recovery-acceptance-specification.pdf", url: "https://example.test/fixture.pdf", mimeType: "application/pdf", sizeBytes: 4096, key: "fixture", uploadedAt: now },
  ]);
  const noop = () => undefined;
  const lookup: Pick<ChatPanelController, "refs">["refs"] = {};
  const common = { chatFileLinks: () => ({ rootPath: project.rootPath, filePaths: [], onOpenFile: noop }), currentRun: () => run,
    currentBackgroundRun: () => undefined, currentExecutionPlan: () => undefined, experimentRun: () => undefined,
    handleDiscardExperiment: noop, handleInspectExperiment: noop, handleOpenCurrentRunJob: noop, handlePromoteExperiment: noop,
    handlePromoteScheduledRun: () => setResult("schedule"), renderPlanRunAction: () => undefined, runDetailRecovery: () => undefined, runSubtasks: () => [] };
  return <main data-test-fixture-ready="1" style={{ padding: "16px", width: "100%", "max-width": "760px", "box-sizing": "border-box", position: "relative", "min-height": "640px" }}>
    <output aria-label="Fixture action" style={{ "overflow-wrap": "anywhere" }}>{result()}</output>
    {surface === "question" && <ChatPanelProvider value={{...controller, ...{ pendingQuestion: () => ({ id: "question-1", required: true, status: "pending", askedAt: now, prompt: "How should the customer workspace recover after verification fails?", responseKind: "choice", choices: [
      { id: "preserve", label: "Preserve the current workspace and retry verification", description: "Keep the customer's edits intact, reopen the original workspace, and rerun the verification before continuing.", answerText: "preserve", recommended: true },
      { id: "inspect", label: "Inspect the failure before deciding", description: "Read the verification evidence and decide which changes need another attempt.", answerText: "inspect", recommended: false },
    ] }), executionPaused: () => false, executionPauseReason: () => "", handleQuestionChoice: text => setResult(text) }}}><ChatPendingQuestion /></ChatPanelProvider>}
    {surface === "attachments" && <ChatPanelProvider value={{...controller, ...{ draftAttachments: attachments, uploadingAttachments: () => false, handleRemoveAttachment: id => { setAttachments(items => items.filter(item => item.id !== id)); setResult("removed"); } }}}><ChatComposerReferences /></ChatPanelProvider>}
    {surface === "lookup" && <div style={{ position: "relative", height: "580px" }}><ChatPanelProvider value={{...controller, ...{ refs: lookup, composerLookup: () => ({ kind: "file", query: "recovery", start: 0, end: 9 }), composerLookupOpen: () => true,
      composerLookupRenderedOptions: () => [{ index: 0, selected: true, label: "verify-retained-customer-project-before-retry.ts", detail: longPath, insertText: `@${longPath}` }],
      applyComposerLookupOption: () => setResult(`@${longPath}`), handleComposerLookupKeyDown: event => { if (event.key === "Enter") setResult(`@${longPath}`); return true; }, runWithChatPanelOwner: callback => callback(), setComposerLookupActiveIndex: noop, setComposerLookupMenuHidden: noop, syncComposerLookupDomVisibility: noop }}}><ChatComposerLookupMenu /></ChatPanelProvider></div>}
    {surface === "experiment" && <ChatPanelProvider value={{...controller, ...{ activeProject: () => project, experimentDialogOpen: open, experimentRun: () => experiment, selectedExperimentFilePath: selected, setExperimentDialogOpen: setOpen, setSelectedExperimentFilePath: setSelected }}}><ChatExperimentDialog /></ChatPanelProvider>}
    {surface === "run" && <Switch><ChatPanelProvider value={{...controller, ...common}}><ChatTranscriptRun selectedTab="run" /></ChatPanelProvider></Switch>}
    {surface === "events" && <div style={{ height: "650px", display: "flex", "flex-direction": "column" }}><Switch><ChatPanelProvider value={{...controller, ...{ chatFileLinks: common.chatFileLinks, projectTraces: () => [createTraceFixture({ stage: "subagent-start", modelId: "openai/customer-workspace-verification-model-with-extended-context", message: "Verification started for the preserved workspace.", detail: "The source path and original project selection are retained in the request." })] }}}><ChatTranscriptEvents selectedTab="events" /></ChatPanelProvider></Switch></div>}
    {surface === "setup" && <ChatPanelProvider value={{...controller, ...{ state: { ...state, get blockingNonGitPreflight(): ChatPanelController["state"]["blockingNonGitPreflight"] { return open() ? { requestId: "preflight-1", projectId: project.id, threadId: project.activeThreadId, command: { type: "run.execute", requestId: "execute-1", payload: { projectId: project.id, threadId: project.activeThreadId, runId: run.id } }, preflight: { severity: "blocking", kind: "git-not-repo", message: "Git protection needs a repository.", changedFileCount: 0, repairSummary: "This folder does not have Git history.", repairDetail: "Create a baseline before this task changes your project files." } } : undefined; } }, handleCancelNonGitPreflight: () => { setOpen(false); setResult("cancel"); }, handleDisableDirtyGitCheck: () => setResult("disable"), handleInitGitBaseline: () => setResult("init") }}}><ChatSetupDialog /></ChatPanelProvider>}
  </main>;
}
render(() => <Fixture />, document.getElementById("root")!);
