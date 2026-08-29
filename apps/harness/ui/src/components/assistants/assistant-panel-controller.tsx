import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type JSX, type Setter } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, ArrowUpRight, Brain, Bot, Calendar, Check, CheckSquare2, CircleAlert, CirclePause,
  CircleHelp, CirclePlay, ClipboardList, CopyPlus, Cpu, FlaskConical, Folder, Gauge, Globe, ListFilter, ListChecks,
  Logs, MessageSquare, Plus, RefreshCcw, Save, Split, Square, SquarePen, Trash2 } from "lucide-solid";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import {
  createAssistantTodoId,
  type BackgroundJob,
  type BackgroundJobRun,
  createRequestId,
  type Assistant,
  type AssistantLearning,
  type AssistantQuestion,
  type AssistantTodo,
  type BulkOperationAction,
  type BulkOperationTarget,
  type ComposerReasoningStrength,
} from "@hyperfocus/ai-core/protocol";
import { resolveModeCatalog } from "@hyperfocus/ai-core/modes";
import { getAssistantQuestionDefaultChoices } from "../../assistant-question-defaults";
import { formatShortTimestamp, resolveBrowserTimezone } from "../../lib/time-format";
import { cn, toProperCase } from "../../lib/utils";
import { normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import { findChatFileReferenceAtPosition, type ChatFileLinkContext, type ChatFileTarget } from "../../lib/chat-file-links";
import { registerCurrentTabItemSelector } from "../../lib/current-tab-item-hotkeys";
import { openIdeWindow } from "../../lib/ide-window";
import { openAssistantLogEntrySource } from "../../source-navigation";
import { submitOnEnter } from "../../textarea-submit";
import { type AssistantEditorDraft, type AssistantDetailTab, type BackgroundJobEditorDraft, COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH, type AssistantRosterSort, getComposerControlState, getExecutionModelOptionsForAgent,
  getSelectedAssistant, getVisibleAssistants, harnessStore } from "../../harness-store";
import { pushToast } from "../../toast-store";
import { ActionButton } from "../action-button";
import { FileLinkedText, type FileLinkConfig } from "../file-linked-text";
import { MarkdownContent } from "../markdown-content";
import { Button } from "../primitives/button";
import { ChatComposer } from "../primitives/chat-composer";
import { ContextMenu, type ContextMenuAction } from "../primitives/context-menu";
import { CopyTextButton } from "../primitives/copy-text-button";
import { Dialog } from "../primitives/dialog";
import { ExecutionLog, type ExecutionLogEntry } from "../primitives/execution-log";
import { DetailEmptyState, LeftPaneEmptyState, LeftPaneFilterBlock, LeftPaneHeader, LeftPaneListSection,
  LeftPaneSearchInput, LeftPaneSearchMenu, LeftPaneShell, type LeftPaneSearchMenuItem } from "../primitives/left-pane";
import { DropdownControl } from "../primitives/dropdown";
import { Input } from "../primitives/input";
import { StatusChip, type StatusChipTone } from "../primitives/status-chip";
import { ScrollArea } from "../primitives/scroll-area";
import { Textarea } from "../primitives/textarea";
import { VirtualList } from "../primitives/virtual-list";
import { rightAlignedNumbersEnabled } from "../../lib/visual-flags";
import { assistantPanelStyles, assistantUtilityStyles } from "../assistants-panel.styles";
import { createAssistantWorkloadController, type AssistantWorkloadCollectionState } from "../../assistant-workload-state";
import { ASSISTANT_DETAIL_CACHE_LIMIT, assistantDetailCollectionForTab, createAssistantDetailPageCommand } from "../../store/assistant-detail-state";
import {
  createAssistantRosterPaginationController,
  createFilteredAssistantRoster,
} from "./roster-pagination";
import {
  assistantRunStateTone,
  assistantSearchHaystack,
  assistantWorkloadEmptyMessage,
  compareAssistantLearnings,
  compareAssistants,
  formatAssistantBulkActionLabel,
  formatReasoningOptionLabel,
  fuzzyMatches,
  getReasoningStrengthDescription,
  matchesAssistantFilters,
  mergeAssistantRangeSelection,
  splitAssistantStreamingText,
  toggleAssistantSelectionId,
} from "./assistant-panel-model";
import { createAssistantDetailSelectors } from "./assistant-detail-selectors";
import { useHarnessStore } from "../../store-providers";

export type AssistantsPanelProps = {
  initialCircuitBreakerAssistantId?: string;
  variant?: "full" | "roster" | "detail";
};

type HarnessState = typeof harnessStore.state;
type SendCommand = typeof harnessStore.actions.sendCommand;
type WorkspaceProject = HarnessState["workspace"]["projects"][number];

function createAssistantFileActions(options: {
  state: HarnessState;
  assistantFileProject: Accessor<WorkspaceProject | undefined>;
  assistantChatFileLinkContext: () => ChatFileLinkContext;
}) {
  const { state, assistantFileProject, assistantChatFileLinkContext } = options;
  function handleOpenAssistantProjectFile(project: WorkspaceProject | undefined, target: ChatFileTarget) {
    if (!project) return;
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }
  function handleOpenAssistantChatFile(target: ChatFileTarget) {
    handleOpenAssistantProjectFile(assistantFileProject(), target);
  }
  function handleAssistantComposerClick(event: MouseEvent & { currentTarget: HTMLTextAreaElement }) {
    if (!event.ctrlKey && !event.metaKey) return;
    const reference = findChatFileReferenceAtPosition(
      event.currentTarget.value, event.currentTarget.selectionStart, assistantChatFileLinkContext(),
    );
    if (!reference) return;
    event.preventDefault();
    event.stopPropagation();
    handleOpenAssistantChatFile(reference.target);
  }
  function getAssistantProjectFileLinks(project: WorkspaceProject | undefined): FileLinkConfig {
    return {
      rootPath: project?.rootPath,
      filePaths: project?.filePaths ?? [],
      onOpenFile: (target) => handleOpenAssistantProjectFile(project, target),
    };
  }
  function getAssistantFileLinks(assistant: Assistant | undefined): FileLinkConfig {
    const project = state.workspace.projects.find((entry) => entry.id === assistant?.projectId) ?? assistantFileProject();
    return getAssistantProjectFileLinks(project);
  }
  function handleAssistantRosterKeyDown(event: KeyboardEvent, assistantId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    harnessStore.setSelectedAssistantId(assistantId);
  }
  return {
    getAssistantFileLinks, getAssistantProjectFileLinks, handleAssistantComposerClick,
    handleAssistantRosterKeyDown, handleOpenAssistantChatFile,
  };
}

function createAssistantLifecycleActions(options: {
  state: HarnessState;
  sendCommand: SendCommand;
  selectedAssistant: Accessor<Assistant | undefined>;
  setSelectedCircuitBreakerAssistantId: Setter<string | undefined>;
  executionPaused: Accessor<boolean>;
}) {
  const { state, sendCommand, selectedAssistant, setSelectedCircuitBreakerAssistantId, executionPaused } = options;
  function openAssistantJobEditor() {
    const assistant = selectedAssistant();
    if (!assistant) return;
    const resolvedProjectId = assistant.projectId ?? state.workspace.activeProjectId;
    if (!resolvedProjectId) {
      pushToast("Project required", "Clone global assistant to project before scheduling project work.", "error");
      return;
    }
    const draft: BackgroundJobEditorDraft = {
      source: "create", projectId: resolvedProjectId, assistantId: assistant.id,
      kind: "ai-routine", name: `${assistant.name} routine`, description: "", scheduleInput: "",
      timezone: resolveBrowserTimezone(), aiPrompt: assistant.jobPrompt, aiModeId: assistant.modeId,
      aiExecutionModelId: assistant.executionModelId, aiReasoningStrength: assistant.reasoningStrength,
      aiFastMode: assistant.fastMode, aiPlanExecutionMode: state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy: state.subagentWorktreeStrategyDefault,
      shellExecutable: "", shellArgsText: "", shellCwd: "", shellEnvRefsText: "",
      shellTimeoutSeconds: 600, shellNetworkAccess: false,
    };
    harnessStore.openBackgroundJobEditor(draft);
  }
  function handleDeleteAssistant(assistant: Assistant) {
    if (!window.confirm(`Delete assistant "${assistant.name}"?\n\nPending or active assistant jobs will be cancelled and purged.`)) return;
    sendCommand({ type: "assistant.delete", requestId: createRequestId(), payload: { assistantId: assistant.id } });
  }
  function retryCircuitBreaker(assistant: Assistant) {
    if (executionPaused()) return;
    sendCommand({ type: "assistant.circuit-breaker.retry", requestId: createRequestId(), payload: { assistantId: assistant.id } });
    setSelectedCircuitBreakerAssistantId(undefined);
  }
  function openCircuitBreakerJobs() {
    setSelectedCircuitBreakerAssistantId(undefined);
    harnessStore.setActiveSurface("background-jobs");
  }
  return { handleDeleteAssistant, openAssistantJobEditor, openCircuitBreakerJobs, retryCircuitBreaker };
}

function createAssistantEditorChatActions(options: {
  state: HarnessState; sendCommand: SendCommand; executionPaused: Accessor<boolean>;
  selectedAssistant: Accessor<Assistant | undefined>; chatDraft: Accessor<string>;
  setChatDraft: Setter<string>; assistantChatModeId: Accessor<string>;
  assistantChatExecutionModelId: Accessor<string>;
  assistantChatReasoningStrength: Accessor<ComposerReasoningStrength>;
  assistantChatFastMode: Accessor<boolean>; refs: { chatTextarea?: HTMLTextAreaElement };
}) {
  const { state, sendCommand, executionPaused, selectedAssistant, chatDraft, setChatDraft,
    assistantChatModeId, assistantChatExecutionModelId, assistantChatReasoningStrength,
    assistantChatFastMode, refs } = options;
  function openCreateAssistant(scope: Assistant["scope"]) {
    const draft: AssistantEditorDraft = {
      source: "create", name: "", scope,
      projectId: scope === "project" ? (state.workspace.activeProjectId ?? state.workspace.projects[0]?.id) : undefined,
      description: "", personalityPrompt: "", jobPrompt: "", agentId: state.selectedAgentId,
      providerBrand: state.providerBrand, modeId: "", executionModelId: state.selectedExecutionModelId,
      reasoningStrength: state.selectedReasoningStrength, fastMode: state.selectedFastMode,
      runState: "active", bootstrapState: "pending", assetRefsText: "",
    };
    harnessStore.openAssistantEditor(draft);
  }
  function openEditAssistant(assistant: Assistant) {
    const assetRefsText = state.assistants.assetRefs.filter((item) => item.assistantId === assistant.id)
      .map((item) => `${item.kind} | ${item.label} | ${item.value}`).join("\n");
    harnessStore.openAssistantEditor({
      source: "edit", assistantId: assistant.id, name: assistant.name, scope: assistant.scope,
      projectId: assistant.projectId, description: assistant.description ?? "",
      personalityPrompt: assistant.personalityPrompt, jobPrompt: assistant.jobPrompt,
      agentId: assistant.agentId, providerBrand: assistant.providerBrand, modeId: assistant.modeId,
      executionModelId: assistant.executionModelId, reasoningStrength: assistant.reasoningStrength,
      fastMode: assistant.fastMode, runState: assistant.runState,
      bootstrapState: assistant.bootstrapState, assetRefsText,
    });
  }
  function handleSendChat() {
    const assistant = selectedAssistant();
    const content = chatDraft().trim();
    if (executionPaused() || !assistant || !content) return;
    const sent = sendCommand({
      type: "assistant.chat.send", requestId: createRequestId(),
      payload: {
        assistantId: assistant.id, content, modeId: assistantChatModeId().trim() || undefined,
        executionModelId: assistantChatExecutionModelId().trim() || undefined,
        reasoningStrength: assistantChatReasoningStrength(), fastMode: assistantChatFastMode(),
      },
    });
    if (!sent) return;
    setChatDraft("");
    if (refs.chatTextarea) refs.chatTextarea.value = "";
  }
  return { handleSendChat, openCreateAssistant, openEditAssistant };
}

function createAssistantRecordActions(options: {
  sendCommand: SendCommand; selectedAssistant: Accessor<Assistant | undefined>;
  newTodoTitle: Accessor<string>; setNewTodoTitle: Setter<string>;
  selectedTodos: Accessor<AssistantTodo[]>; selectedLearnings: Accessor<AssistantLearning[]>;
  executionPaused: Accessor<boolean>; questionAnswers: Accessor<Record<string, string>>;
  setQuestionAnswers: Setter<Record<string, string>>;
}) {
  const { sendCommand, selectedAssistant, newTodoTitle, setNewTodoTitle, selectedTodos,
    selectedLearnings, executionPaused, questionAnswers, setQuestionAnswers } = options;
  function handleAddTodo() {
    const assistant = selectedAssistant();
    const title = newTodoTitle().trim();
    if (!assistant || !title) return;
    sendCommand({ type: "assistant.todo.update", requestId: createRequestId(), payload: {
      assistantId: assistant.id, todoId: createAssistantTodoId(),
      patch: { title, state: "pending", workKind: "app-code" },
    } });
    setNewTodoTitle("");
  }
  function updateTodo(todo: AssistantTodo, patch: Partial<AssistantTodo>) {
    sendCommand({ type: "assistant.todo.update", requestId: createRequestId(), payload: {
      assistantId: todo.assistantId, todoId: todo.id, patch: {
        title: patch.title, description: patch.description, state: patch.state,
        blockerReason: patch.blockerReason, workKind: patch.workKind, workTarget: patch.workTarget,
      },
    } });
  }
  function deleteTodo(todo: AssistantTodo) {
    if (!window.confirm(`Delete todo "${todo.title}"?`)) return;
    sendCommand({ type: "assistant.todo.delete", requestId: createRequestId(),
      payload: { assistantId: todo.assistantId, todoId: todo.id } });
  }
  function reorderTodo(todo: AssistantTodo, direction: -1 | 1) {
    const ordered = selectedTodos();
    const currentIndex = ordered.findIndex((entry) => entry.id === todo.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const next = [...ordered];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex]!, next[currentIndex]!];
    sendCommand({ type: "assistant.todo.reorder", requestId: createRequestId(),
      payload: { assistantId: todo.assistantId, todoIds: next.map((entry) => entry.id) } });
  }
  function deleteLearning(learning: AssistantLearning) {
    if (!window.confirm("Delete this assistant learning?")) return;
    sendCommand({ type: "assistant.learning.delete", requestId: createRequestId(),
      payload: { assistantId: learning.assistantId, learningId: learning.id } });
  }
  function reorderLearning(learning: AssistantLearning, direction: -1 | 1) {
    const ordered = selectedLearnings();
    const currentIndex = ordered.findIndex((entry) => entry.id === learning.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const next = [...ordered];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex]!, next[currentIndex]!];
    sendCommand({ type: "assistant.learning.reorder", requestId: createRequestId(),
      payload: { assistantId: learning.assistantId, learningIds: next.map((entry) => entry.id) } });
  }
  function answerQuestion(question: AssistantQuestion, answerText?: string) {
    if (executionPaused()) return;
    const content = (answerText ?? questionAnswers()[question.id])?.trim();
    if (!content) {
      pushToast("Answer required", "Write answer before sending.", "error");
      return;
    }
    sendCommand({ type: "assistant.question.answer", requestId: createRequestId(),
      payload: { assistantId: question.assistantId, questionId: question.id, content } });
    setQuestionAnswers((current) => ({ ...current, [question.id]: "" }));
  }
  return { answerQuestion, deleteLearning, deleteTodo, handleAddTodo, reorderLearning, reorderTodo, updateTodo };
}

function createAssistantSelectionActions(options: {
  visibleAssistants: Accessor<Assistant[]>; selectedAssistantIds: Accessor<string[]>;
  setSelectedAssistantIds: Setter<string[]>; assistantSelectionAnchorId: Accessor<string | undefined>;
  setAssistantSelectionAnchorId: Setter<string | undefined>;
}) {
  const { visibleAssistants, selectedAssistantIds, setSelectedAssistantIds,
    assistantSelectionAnchorId, setAssistantSelectionAnchorId } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingId: string | undefined;
  let consumed = false;
  function clearAssistantSelectionTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!consumed) pendingId = undefined;
  }
  function isInteractiveTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button,a,input,textarea,select,[role='menuitem']"));
  }
  function scheduleAssistantDelayedSelection(assistantId: string, event: PointerEvent) {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || isInteractiveTarget(event.target)) return;
    clearAssistantSelectionTimer();
    pendingId = assistantId;
    timer = setTimeout(() => {
      timer = undefined;
      consumed = true;
      setSelectedAssistantIds((ids) => ids.includes(assistantId) ? ids : [...ids, assistantId]);
      setAssistantSelectionAnchorId(assistantId);
    }, 250);
  }
  function consumeDelayedSelection(assistantId: string) {
    if (!consumed || pendingId !== assistantId) return false;
    consumed = false;
    pendingId = undefined;
    return true;
  }
  function selectAssistantWithMouse(assistant: Assistant, event: MouseEvent) {
    const visibleIds = visibleAssistants().map((entry) => entry.id);
    if (event.shiftKey) {
      const anchorId = assistantSelectionAnchorId() ?? assistant.id;
      setSelectedAssistantIds((ids) => mergeAssistantRangeSelection(ids, visibleIds, anchorId, assistant.id));
      setAssistantSelectionAnchorId(anchorId);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedAssistantIds((ids) => toggleAssistantSelectionId(ids, assistant.id));
      setAssistantSelectionAnchorId(assistant.id);
      return;
    }
    setSelectedAssistantIds([assistant.id]);
    setAssistantSelectionAnchorId(assistant.id);
  }
  function handleAssistantCardClick(assistant: Assistant, event: MouseEvent) {
    if (consumeDelayedSelection(assistant.id)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      selectAssistantWithMouse(assistant, event);
      return;
    }
    harnessStore.setSelectedAssistantId(assistant.id);
  }
  return { clearAssistantSelectionTimer, handleAssistantCardClick, scheduleAssistantDelayedSelection };
}

function createAssistantBulkActions(options: {
  sendCommand: SendCommand; selectedAssistantIdSet: Accessor<Set<string>>;
  selectedAssistants: Accessor<Assistant[]>; setSelectedAssistantIds: Setter<string[]>;
  setAssistantSelectionAnchorId: Setter<string | undefined>;
  setContextMenu: Setter<{ x: number; y: number; label: string; actions: ContextMenuAction[] } | undefined>;
  executionPaused: Accessor<boolean>;
}) {
  const { sendCommand, selectedAssistantIdSet, selectedAssistants, setSelectedAssistantIds,
    setAssistantSelectionAnchorId, setContextMenu, executionPaused } = options;
  function sendAssistantBulkOperation(action: BulkOperationAction, assistants: Assistant[]) {
    if (!assistants.length) return;
    sendCommand({ type: "bulk-operation.apply", requestId: createRequestId(), payload: {
      operationId: createRequestId(), action,
      targets: assistants.map((assistant): BulkOperationTarget => ({ kind: "assistant", assistantId: assistant.id })),
    } });
    pushToast("Bulk action sent", `${assistants.length} assistant${assistants.length === 1 ? "" : "s"} queued for ${formatAssistantBulkActionLabel(action)}.`, "info");
  }
  function assistantBulkActions(assistants: Assistant[]): ContextMenuAction[] {
    return [
      { id: "pause", label: `Pause (${assistants.length})`, onSelect: () => sendAssistantBulkOperation("pause", assistants) },
      { id: "resume", label: `Resume (${assistants.length})`, onSelect: () => sendAssistantBulkOperation("resume", assistants) },
      { id: "bootstrap-retry", label: `Retry bootstrap (${assistants.length})`, disabled: executionPaused(),
        disabledReason: "Global execution pause is active", onSelect: () => sendAssistantBulkOperation("bootstrap-retry", assistants) },
      { id: "delete", label: `Delete (${assistants.length})`, onSelect: () => sendAssistantBulkOperation("delete", assistants) },
    ];
  }
  function openAssistantBulkContextMenu(assistant: Assistant, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const selected = selectedAssistantIdSet().has(assistant.id);
    const assistants = selected ? selectedAssistants() : [assistant];
    if (!selected) {
      setSelectedAssistantIds([assistant.id]);
      setAssistantSelectionAnchorId(assistant.id);
    }
    setContextMenu({ x: event.clientX, y: event.clientY,
      label: assistants.length > 1 ? "Bulk assistant actions" : "Assistant actions",
      actions: assistantBulkActions(assistants) });
  }
  return { openAssistantBulkContextMenu, sendAssistantBulkOperation };
}

function createAssistantChatOptions(options: {
  state: HarnessState; selectedAssistant: Accessor<Assistant | undefined>;
  assistantChatModeId: Accessor<string>; assistantChatExecutionModelId: Accessor<string>;
  assistantChatReasoningStrength: Accessor<ComposerReasoningStrength>;
  assistantChatFastMode: Accessor<boolean>;
}) {
  const { state, selectedAssistant, assistantChatModeId, assistantChatExecutionModelId,
    assistantChatReasoningStrength, assistantChatFastMode } = options;
  const assistantChatModeOptions = createMemo(() => {
      const assistant = selectedAssistant();
      const project = state.workspace.projects.find(
        (entry) => entry.id === assistant?.projectId,
      );
      return [
        {
          value: "",
          label: "Default",
          description: "Use assistant or project default mode.",
          icon: (
            <Split
              class={
                stylex.attrs(assistantUtilityStyles.h3, assistantUtilityStyles.w3)
                  .class
              }
            />
          ),
        },
        ...resolveModeCatalog(
          state.workspace.workspaceModes,
          project?.projectModes ?? [],
        ).map((mode) => ({
          value: mode.id,
          label: mode.label,
          description: mode.description,
          icon: (
            <Split
              class={
                stylex.attrs(assistantUtilityStyles.h3, assistantUtilityStyles.w3)
                  .class
              }
            />
          ),
        })),
      ];
    });
  const assistantChatModelOptions = createMemo(() => {
      const assistant = selectedAssistant();
      const currentModel = assistantChatExecutionModelId().trim();
      const knownOptions = assistant
        ? getExecutionModelOptionsForAgent(
            state,
            assistant.agentId,
            assistant.providerBrand ?? state.providerBrand,
          ).map((model) => ({
            value: model.modelId,
            label: model.label,
            description: model.modelId,
            icon: (
              <Cpu
                class={
                  stylex.attrs(
                    assistantUtilityStyles.h3,
                    assistantUtilityStyles.w3,
                  ).class
                }
              />
            ),
          }))
        : [];
      return [
        {
          value: "",
          label: "Default",
          description: "Use assistant or runtime default model.",
          icon: (
            <Cpu
              class={
                stylex.attrs(assistantUtilityStyles.h3, assistantUtilityStyles.w3)
                  .class
              }
            />
          ),
        },
        ...(currentModel &&
        !knownOptions.some((option) => option.value === currentModel)
          ? [
              {
                value: currentModel,
                label: currentModel,
                description: "Saved custom model.",
                icon: (
                  <Cpu
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.h3,
                        assistantUtilityStyles.w3,
                      ).class
                    }
                  />
                ),
              },
            ]
          : []),
        ...knownOptions,
      ];
    });
  const assistantChatControlState = createMemo(() => {
      const assistant = selectedAssistant();
      return getComposerControlState(
        state,
        assistant?.agentId ?? state.selectedAgentId,
        assistantChatExecutionModelId().trim() || assistant?.executionModelId,
      );
    });
  const assistantChatReasoningOptions = createMemo(() =>
      COMPOSER_REASONING_STRENGTHS.map((strength) => ({
        value: strength,
        label: formatReasoningOptionLabel(strength),
        description: getReasoningStrengthDescription(strength),
        disabled:
          !assistantChatControlState().availableStrengths.includes(strength),
        icon: (
          <Brain
            class={
              stylex.attrs(assistantUtilityStyles.h3, assistantUtilityStyles.w3)
                .class
            }
          />
        ),
      })),
    );
  const assistantChatFastModeOptions = createMemo(() => [
      {
        value: "false",
        label: "Off",
        description: "Use standard response path.",
        icon: (
          <Gauge
            class={
              stylex.attrs(assistantUtilityStyles.h3, assistantUtilityStyles.w3)
                .class
            }
          />
        ),
      },
      {
        value: "true",
        label: "On",
        description: "Prefer lower-latency responses when supported.",
        disabled: !assistantChatControlState().supportsFastMode,
        icon: (
          <Gauge
            class={
              stylex.attrs(assistantUtilityStyles.h3, assistantUtilityStyles.w3)
                .class
            }
          />
        ),
      },
    ]);
  return {
    assistantChatFastModeOptions, assistantChatModeOptions,
    assistantChatModelOptions, assistantChatReasoningOptions,
  };
}

function createAssistantWorkloadModel(options: {
  state: HarnessState; store: ReturnType<typeof useHarnessStore>;
  activeTab: Accessor<AssistantDetailTab>; selectedAssistant: Accessor<Assistant | undefined>;
  sendCommand: SendCommand;
}) {
  const { state, store, activeTab, selectedAssistant, sendCommand } = options;
  const { activateJobsTab, bootstrapAssistantJobs, canBootstrapAssistantJobs, hasSearch, loadMoreAssistantJobs,
      loadMoreAssistantRuns, openAssistantBackgroundJob, openAssistantBackgroundRun, retryAssistantJobs,
      retryAssistantRuns, scopedJobs, scopedRuns, selectedWorkloadPage, visibleJobs, visibleRuns } = createAssistantWorkloadController({
      selectedAssistant,
      activeTab,
      workloads: state.assistants,
      activeProjectId: () => state.workspace.activeProjectId,
      sendCommand,
      startRequest: store.actions.startAssistantWorkloadRequest, rejectRequest: store.actions.rejectAssistantWorkloadRequest,
      startSourceRequest: store.actions.startBackgroundJobSourceRequest, rejectSourceRequest: store.actions.rejectBackgroundJobSourceRequest,
      setJobsTab: () => harnessStore.setAssistantDetailTab("jobs"),
      matchesSearch: fuzzyMatches,
      reportMissingProject: () => pushToast("Project required", "Open a project before bootstrapping jobs for a global assistant.", "error"),
    });
  const assistantJobsEmptyMessage = () => assistantWorkloadEmptyMessage("assistant jobs", "No assistant-owned background jobs.", selectedWorkloadPage()?.jobs, hasSearch(), scopedJobs().length > 0);
  const assistantRunsEmptyMessage = () => assistantWorkloadEmptyMessage("assistant runs", "No assistant-owned job runs.", selectedWorkloadPage()?.runs, hasSearch(), scopedRuns().length > 0);
  const selectedDetailCollection = createMemo(() => assistantDetailCollectionForTab(activeTab()));
  const selectedDetailPage = createMemo(() => {
      const assistantId = selectedAssistant()?.id;
      const collection = selectedDetailCollection();
      return assistantId && collection ? state.assistants.detailPagesByAssistantId[assistantId]?.[collection] : undefined;
    });
  const detailCollectionLabel = () => selectedDetailCollection() ?? "items";
  function requestMoreAssistantDetail() {
      const assistantId = selectedAssistant()?.id;
      const collection = selectedDetailCollection();
      const page = selectedDetailPage();
      if (!assistantId || !collection || !page || page.status === "loading" || (page.status === "loaded" && !page.hasMore)) return;
      const requestId = createRequestId();
      const cursor = page.status === "error" ? page.retryCursor : page.nextCursor;
      store.actions.startAssistantDetailPageRequest(assistantId, collection, { id: requestId, cursor });
      if (!sendCommand(createAssistantDetailPageCommand(collection, assistantId, requestId, cursor)))
        store.actions.rejectAssistantDetailPageRequest(requestId, "Connection unavailable. Retry after reconnecting.");
    }
  const pendingJobSourceId = createMemo(() => state.pendingBackgroundJobSource?.kind === "job" ? state.pendingBackgroundJobSource.jobId : undefined);
  const pendingRunSourceId = createMemo(() => state.pendingBackgroundJobSource?.kind === "run" ? state.pendingBackgroundJobSource.runId : undefined);
  const assistantFileProject = createMemo(
      () =>
        state.workspace.projects.find(
          (project) => project.id === selectedAssistant()?.projectId,
        ) ??
        state.workspace.projects.find(
          (project) => project.id === state.workspace.activeProjectId,
        ) ??
        state.workspace.projects[0],
    );
  return {
    activateJobsTab, assistantFileProject, assistantJobsEmptyMessage,
    assistantRunsEmptyMessage, bootstrapAssistantJobs, canBootstrapAssistantJobs,
    detailCollectionLabel, loadMoreAssistantJobs, loadMoreAssistantRuns,
    openAssistantBackgroundJob, openAssistantBackgroundRun, pendingJobSourceId,
    pendingRunSourceId, requestMoreAssistantDetail, retryAssistantJobs,
    retryAssistantRuns, selectedDetailCollection, selectedDetailPage,
    selectedWorkloadPage, visibleJobs, visibleRuns,
  };
}

function installAssistantPanelEffects(options: {
  state: HarnessState; store: ReturnType<typeof useHarnessStore>;
  clearAssistantSelectionTimer: () => void; releaseAssistantDetailDemand: () => void;
  visibleAssistants: Accessor<Assistant[]>; selectedAssistantIds: Accessor<string[]>;
  setSelectedAssistantIds: Setter<string[]>; assistantSelectionAnchorId: Accessor<string | undefined>;
  setAssistantSelectionAnchorId: Setter<string | undefined>;
  selectedAssistant: Accessor<Assistant | undefined>; setAssistantChatModeId: Setter<string>;
  setAssistantChatExecutionModelId: Setter<string>;
  setAssistantChatReasoningStrength: Setter<ComposerReasoningStrength>;
  setAssistantChatFastMode: Setter<boolean>; streamingText: Accessor<string>;
  setAssistantStreamingStartedAtByAssistantId: Setter<Record<string, string>>;
  activeTab: Accessor<AssistantDetailTab>; scrollAssistantChatToBottom: (force?: boolean) => void;
  selectedThreadMessageCount: Accessor<number>; showRoster: Accessor<boolean>;
}) {
  const o = options;
  createEffect(() => {
    const visibleIds = new Set(o.visibleAssistants().map((assistant) => assistant.id));
    o.setSelectedAssistantIds((ids) => ids.filter((id) => visibleIds.has(id)));
    const anchorId = o.assistantSelectionAnchorId();
    if (anchorId && !visibleIds.has(anchorId)) o.setAssistantSelectionAnchorId(undefined);
  });
  onCleanup(() => { o.clearAssistantSelectionTimer(); o.releaseAssistantDetailDemand(); });
  createEffect(() => { o.store.actions.requestSelectedAssistantDetail(); });
  createEffect(() => {
    const assistant = o.selectedAssistant();
    if (!assistant) return;
    o.setAssistantChatModeId(assistant.modeId ?? "");
    o.setAssistantChatExecutionModelId(assistant.executionModelId ?? "");
    o.setAssistantChatReasoningStrength(assistant.reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH);
    o.setAssistantChatFastMode(Boolean(assistant.fastMode));
  });
  createEffect(() => {
    const assistantId = o.selectedAssistant()?.id;
    if (!assistantId) return;
    if (o.streamingText().trim()) {
      o.setAssistantStreamingStartedAtByAssistantId((current) =>
        current[assistantId] ? current : { ...current, [assistantId]: new Date().toISOString() });
      return;
    }
    o.setAssistantStreamingStartedAtByAssistantId((current) => {
      if (!current[assistantId]) return current;
      const next = { ...current };
      delete next[assistantId];
      return next;
    });
  });
  createEffect(() => {
    o.selectedAssistant()?.id;
    o.activeTab();
    o.scrollAssistantChatToBottom(true);
  });
  createEffect(() => {
    o.selectedThreadMessageCount();
    o.streamingText();
    o.scrollAssistantChatToBottom();
  });
  createEffect(() => {
    if (!o.showRoster()) return;
    const unregister = registerCurrentTabItemSelector("assistants", (index) => {
      const assistant = o.visibleAssistants()[index];
      if (!assistant) return false;
      harnessStore.setSelectedAssistantId(assistant.id);
      return true;
    });
    onCleanup(unregister);
  });
  createEffect(() => {
    const assistant = o.selectedAssistant();
    if (!assistant) {
      harnessStore.setSelectedAssistantId(undefined);
      return;
    }
    if (o.state.assistants.selectedAssistantId !== assistant.id) harnessStore.setSelectedAssistantId(assistant.id);
  });
}

function createAssistantPanelSignals(props?: AssistantsPanelProps) {
  const refs: { chatTextarea?: HTMLTextAreaElement; messageViewport?: HTMLDivElement } = {};
  const [chatDraft, setChatDraft] = createSignal("");
  const [assistantChatModeId, setAssistantChatModeId] = createSignal("");
  const [assistantChatExecutionModelId, setAssistantChatExecutionModelId] = createSignal("");
  const [assistantChatReasoningStrength, setAssistantChatReasoningStrength] =
    createSignal<ComposerReasoningStrength>(DEFAULT_COMPOSER_REASONING_STRENGTH);
  const [assistantChatFastMode, setAssistantChatFastMode] = createSignal(false);
  const [assistantStickToBottom, setAssistantStickToBottom] = createSignal(true);
  const [assistantStreamingStartedAtByAssistantId, setAssistantStreamingStartedAtByAssistantId] =
    createSignal<Record<string, string>>({});
  const [newTodoTitle, setNewTodoTitle] = createSignal("");
  const [selectedCircuitBreakerAssistantId, setSelectedCircuitBreakerAssistantId] =
    createSignal<string | undefined>(props?.initialCircuitBreakerAssistantId);
  const [questionAnswers, setQuestionAnswers] = createSignal<Record<string, string>>({});
  const [selectedAssistantIds, setSelectedAssistantIds] = createSignal<string[]>([]);
  const [assistantSelectionAnchorId, setAssistantSelectionAnchorId] = createSignal<string>();
  const [contextMenu, setContextMenu] = createSignal<{
    x: number; y: number; label: string; actions: ContextMenuAction[];
  }>();
  return {
    assistantChatExecutionModelId, assistantChatFastMode, assistantChatModeId,
    assistantChatReasoningStrength, assistantSelectionAnchorId,
    assistantStickToBottom, assistantStreamingStartedAtByAssistantId, chatDraft,
    contextMenu, newTodoTitle, questionAnswers, refs, selectedAssistantIds,
    selectedCircuitBreakerAssistantId, setAssistantChatExecutionModelId,
    setAssistantChatFastMode, setAssistantChatModeId,
    setAssistantChatReasoningStrength, setAssistantSelectionAnchorId,
    setAssistantStickToBottom, setAssistantStreamingStartedAtByAssistantId,
    setChatDraft, setContextMenu, setNewTodoTitle, setQuestionAnswers,
    setSelectedAssistantIds, setSelectedCircuitBreakerAssistantId,
  };
}

function createAssistantScrollController(options: {
  refs: { messageViewport?: HTMLDivElement };
  stickToBottom: Accessor<boolean>;
  setStickToBottom: Setter<boolean>;
}) {
  const { refs, stickToBottom, setStickToBottom } = options;
  const scrollAssistantChatToBottom = (force?: boolean) => {
    if (!refs.messageViewport || (!force && !stickToBottom())) return;
    queueMicrotask(() => {
      if (refs.messageViewport) refs.messageViewport.scrollTop = refs.messageViewport.scrollHeight;
    });
  };
  const updateAssistantScrollLock = () => {
    if (!refs.messageViewport) {
      setStickToBottom(true);
      return;
    }
    const distanceFromBottom = refs.messageViewport.scrollHeight
      - refs.messageViewport.scrollTop - refs.messageViewport.clientHeight;
    setStickToBottom(distanceFromBottom <= 32);
  };
  return { scrollAssistantChatToBottom, updateAssistantScrollLock };
}

export function createAssistantsPanelController(props?: AssistantsPanelProps) {
  const signals = createAssistantPanelSignals(props);
  const {
    assistantChatExecutionModelId, assistantChatFastMode, assistantChatModeId,
    assistantChatReasoningStrength, assistantSelectionAnchorId,
    assistantStickToBottom, assistantStreamingStartedAtByAssistantId, chatDraft,
    contextMenu, newTodoTitle, questionAnswers, refs, selectedAssistantIds,
    selectedCircuitBreakerAssistantId, setAssistantChatExecutionModelId,
    setAssistantChatFastMode, setAssistantChatModeId,
    setAssistantChatReasoningStrength, setAssistantSelectionAnchorId,
    setAssistantStickToBottom, setAssistantStreamingStartedAtByAssistantId,
    setChatDraft, setContextMenu, setNewTodoTitle, setQuestionAnswers,
    setSelectedAssistantIds, setSelectedCircuitBreakerAssistantId,
  } = signals;
  const store = useHarnessStore();
  const releaseAssistantDetailDemand = props?.variant === "roster" ? () => {} : store.actions.registerAssistantDetailDemand();
  const state = store.state;
  const sendCommand = store.actions.sendCommand;
  const activeTab = createMemo(() => state.assistants.selectedTab);
  const visibleAssistants = createFilteredAssistantRoster(() => getVisibleAssistants(state),
    (assistant) => matchesAssistantFilters(assistant, state),
    (assistant) => fuzzyMatches(assistantSearchHaystack(assistant, state), state.assistants.rosterSearch),
    (left, right) => compareAssistants(left, right, state.assistants.rosterSort));
  const requestAssistantRosterPage = createAssistantRosterPaginationController({
    page: () => state.assistants.rosterPage, connected: () => state.connectionState === "connected",
    enabled: props?.variant !== "detail", send: sendCommand, start: store.actions.startAssistantRosterRequest,
    reject: store.actions.rejectAssistantRosterRequest, createRequestId });
  const selectedAssistantIdSet = createMemo(
    () => new Set(selectedAssistantIds()),
  );
  const selectedAssistants = createMemo(() =>
    visibleAssistants().filter((assistant) =>
      selectedAssistantIdSet().has(assistant.id),
    ),
  );
  const selectionActions = createAssistantSelectionActions({
    visibleAssistants, selectedAssistantIds, setSelectedAssistantIds,
    assistantSelectionAnchorId, setAssistantSelectionAnchorId,
  });
  const {
    clearAssistantSelectionTimer, handleAssistantCardClick,
    scheduleAssistantDelayedSelection,
  } = selectionActions;
  const bulkActions = createAssistantBulkActions({
    sendCommand, selectedAssistantIdSet, selectedAssistants, setSelectedAssistantIds,
    setAssistantSelectionAnchorId, setContextMenu,
    executionPaused: () => state.executionControl.isPaused,
  });
  const { openAssistantBulkContextMenu, sendAssistantBulkOperation } = bulkActions;
  const selectedAssistant = createMemo(() => getSelectedAssistant(state));
  const workloadModel = createAssistantWorkloadModel({
    state, store, activeTab, selectedAssistant, sendCommand,
  });
  const {
    activateJobsTab, assistantFileProject, assistantJobsEmptyMessage,
    assistantRunsEmptyMessage, bootstrapAssistantJobs, canBootstrapAssistantJobs,
    detailCollectionLabel, loadMoreAssistantJobs, loadMoreAssistantRuns,
    openAssistantBackgroundJob, openAssistantBackgroundRun, pendingJobSourceId,
    pendingRunSourceId, requestMoreAssistantDetail, retryAssistantJobs,
    retryAssistantRuns, selectedDetailCollection, selectedDetailPage,
    selectedWorkloadPage, visibleJobs, visibleRuns,
  } = workloadModel;
  const assistantChatFileLinkContext = (): ChatFileLinkContext => ({
    rootPath: assistantFileProject()?.rootPath,
    filePaths: assistantFileProject()?.filePaths ?? [],
  });
  const fileActions = createAssistantFileActions({
    state, assistantFileProject, assistantChatFileLinkContext,
  });
  const {
    getAssistantFileLinks, getAssistantProjectFileLinks, handleAssistantComposerClick,
    handleAssistantRosterKeyDown, handleOpenAssistantChatFile,
  } = fileActions;
  const assistantChatFileLinks = () => ({
    ...assistantChatFileLinkContext(),
    onOpenFile: handleOpenAssistantChatFile,
  });











  const chatOptions = createAssistantChatOptions({
    state, selectedAssistant, assistantChatModeId, assistantChatExecutionModelId,
    assistantChatReasoningStrength, assistantChatFastMode,
  });
  const {
    assistantChatFastModeOptions, assistantChatModeOptions,
    assistantChatModelOptions, assistantChatReasoningOptions,
  } = chatOptions;
  const detailSelectors = createAssistantDetailSelectors({
    state, selectedAssistant, selectedCircuitBreakerAssistantId, assistantFileProject,
    getAssistantProjectFileLinks, assistantStreamingStartedAtByAssistantId,
  });
  const {
    assistantChatRows, circuitBreakerAssistant, circuitBreakerFileLinks,
    circuitBreakerLogs, circuitBreakerQuestions, circuitBreakerRuns,
    filteredLearnings, selectedAssetRefs, selectedExecutionLogs, selectedLearnings,
    selectedThread, selectedTodos, streamingText, visibleLogs, visibleQuestions, visibleTodos,
  } = detailSelectors;
  const executionPaused = createMemo(() => state.executionControl.isPaused);
  const executionPauseReason = "Global execution pause is active";
  const lifecycleActions = createAssistantLifecycleActions({
    state, sendCommand, selectedAssistant, setSelectedCircuitBreakerAssistantId,
    executionPaused,
  });
  const {
    handleDeleteAssistant, openAssistantJobEditor, openCircuitBreakerJobs,
    retryCircuitBreaker,
  } = lifecycleActions;
  const editorChatActions = createAssistantEditorChatActions({
    state, sendCommand, executionPaused, selectedAssistant, chatDraft, setChatDraft,
    assistantChatModeId, assistantChatExecutionModelId,
    assistantChatReasoningStrength, assistantChatFastMode, refs,
  });
  const { handleSendChat, openCreateAssistant, openEditAssistant } = editorChatActions;
  const recordActions = createAssistantRecordActions({
    sendCommand, selectedAssistant, newTodoTitle, setNewTodoTitle, selectedTodos,
    selectedLearnings, executionPaused, questionAnswers, setQuestionAnswers,
  });
  const {
    answerQuestion, deleteLearning, deleteTodo, handleAddTodo, reorderLearning,
    reorderTodo, updateTodo,
  } = recordActions;
  const variant = () => (props && props.variant ? props.variant : "full");


  const { scrollAssistantChatToBottom, updateAssistantScrollLock } =
    createAssistantScrollController({
      refs, stickToBottom: assistantStickToBottom,
      setStickToBottom: setAssistantStickToBottom,
    });



  const showRoster = () => variant() !== "detail";
  const showDetail = () => variant() !== "roster";
  const createScope = () =>
    state.assistants.scopeFilter === "global" ? "global" : "project";
  const createLabel = () =>
    state.assistants.scopeFilter === "global"
      ? "Create global assistant"
      : "Create project assistant";















  installAssistantPanelEffects({
    state, store, clearAssistantSelectionTimer, releaseAssistantDetailDemand,
    visibleAssistants, selectedAssistantIds, setSelectedAssistantIds,
    assistantSelectionAnchorId, setAssistantSelectionAnchorId, selectedAssistant,
    setAssistantChatModeId, setAssistantChatExecutionModelId,
    setAssistantChatReasoningStrength, setAssistantChatFastMode, streamingText,
    setAssistantStreamingStartedAtByAssistantId, activeTab,
    scrollAssistantChatToBottom,
    selectedThreadMessageCount: () => selectedThread()?.messages.length ?? 0,
    showRoster,
  });

  function openAssistantLogSource(entry: ExecutionLogEntry) {
    const log = visibleLogs().find((candidate) => candidate.id === entry.id);
    if (log) {
      openAssistantLogEntrySource(state, log);
    }
  }

  return {
    ...signals, ...selectionActions, ...bulkActions, ...workloadModel,
    ...fileActions, ...chatOptions, ...detailSelectors, ...lifecycleActions,
    ...editorChatActions, ...recordActions,
    activeTab, assistantChatFileLinks, assistantRunStateTone,
    createLabel, createScope, executionPauseReason, executionPaused,
    openAssistantLogSource, requestAssistantRosterPage,
    scrollAssistantChatToBottom, selectedAssistant, selectedAssistantIdSet,
    selectedAssistants, sendCommand, showDetail, showRoster, state,
    updateAssistantScrollLock, variant, visibleAssistants,
  };
}

export type AssistantsPanelController = ReturnType<typeof createAssistantsPanelController>;
