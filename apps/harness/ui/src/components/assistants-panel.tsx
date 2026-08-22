import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Bot,
  Calendar,
  Check,
  CheckSquare2,
  CircleAlert,
  CirclePause,
  CircleHelp,
  CirclePlay,
  ClipboardList,
  CopyPlus,
  Cpu,
  FlaskConical,
  Folder,
  Gauge,
  Globe,
  ListFilter,
  ListChecks,
  Logs,
  MessageSquare,
  Plus,
  RefreshCcw,
  Save,
  Split,
  Square,
  SquarePen,
  Trash2,
} from "lucide-solid";
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
} from "../../../shared/protocol";
import { resolveModeCatalog } from "../../../shared/modes";
import { getAssistantQuestionDefaultChoices } from "../assistant-question-defaults";
import {
  formatShortTimestamp,
  resolveBrowserTimezone,
} from "../lib/time-format";
import { cn, toProperCase } from "../lib/utils";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import {
  findChatFileReferenceAtPosition,
  type ChatFileLinkContext,
  type ChatFileTarget,
} from "../lib/chat-file-links";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { openIdeWindow } from "../lib/ide-window";
import {
  openBackgroundJobInJobsPane,
  openBackgroundRunInJobsPane,
} from "../background-run-navigation";
import { openAssistantLogEntrySource } from "../source-navigation";
import { submitOnEnter } from "../textarea-submit";
import {
  type AssistantEditorDraft,
  type AssistantDetailTab,
  type BackgroundJobEditorDraft,
  COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH,
  type AssistantRosterSort,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getSelectedAssistant,
  getVisibleAssistants,
  harnessStore,
} from "../harness-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { MarkdownContent } from "./markdown-content";
import { Button } from "./primitives/button";
import { ChatComposer } from "./primitives/chat-composer";
import { ContextMenu, type ContextMenuAction } from "./primitives/context-menu";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Dialog } from "./primitives/dialog";
import {
  ExecutionLog,
  type ExecutionLogEntry,
} from "./primitives/execution-log";
import {
  DetailEmptyState,
  LeftPaneEmptyState,
  LeftPaneFilterBlock,
  LeftPaneHeader,
  LeftPaneListSection,
  LeftPaneSearchInput,
  LeftPaneSearchMenu,
  LeftPaneShell,
  type LeftPaneSearchMenuItem,
} from "./primitives/left-pane";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { StatusChip, type StatusChipTone } from "./primitives/status-chip";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { VirtualList } from "./primitives/virtual-list";
import { rightAlignedNumbersEnabled } from "../lib/visual-flags";
import {
  assistantPanelStyles,
  assistantUtilityStyles,
} from "./assistants-panel.styles";

const assistantTodoStateOptions = [
  {
    value: "pending",
    label: "pending",
    description: "Queued but not started yet.",
  },
  {
    value: "in-progress",
    label: "in-progress",
    description: "Actively being worked right now.",
  },
  {
    value: "blocked",
    label: "blocked",
    description: "Paused by dependency, approval, or external blocker.",
  },
  {
    value: "completed",
    label: "completed",
    description: "Finished successfully.",
  },
  {
    value: "failed",
    label: "failed",
    description: "Attempt finished with failure.",
  },
  {
    value: "cancelled",
    label: "cancelled",
    description: "Work was intentionally stopped.",
  },
] satisfies Array<{
  value: AssistantTodo["state"];
  label: string;
  description: string;
}>;

const assistantTodoWorkKindOptions = [
  {
    value: "app-code",
    label: "app-code",
    description: "Product, UI, backend, API, database, or test implementation.",
  },
  {
    value: "automation-code",
    label: "automation-code",
    description: "Scripts, skills, checks, generators, or workflow automation.",
  },
  {
    value: "documentation",
    label: "documentation",
    description: "Docs-only update.",
  },
  {
    value: "research",
    label: "research",
    description: "Investigation before implementation.",
  },
  {
    value: "blocked",
    label: "blocked",
    description: "Known work that cannot start yet.",
  },
  {
    value: "unspecified",
    label: "unspecified",
    description: "No work category set.",
  },
] satisfies Array<{
  value: AssistantTodo["workKind"];
  label: string;
  description: string;
}>;

function formatHotkeyHint(hotkey: string) {
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

function tooltipWithPrimaryHotkey(label: string, hotkey: string | undefined) {
  return hotkey ? `${label} (${formatHotkeyHint(hotkey)})` : label;
}

function toggleAssistantSelectionId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

function mergeAssistantRangeSelection(
  ids: string[],
  visibleIds: string[],
  anchorId: string,
  targetId: string,
) {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return ids.includes(targetId) ? ids : [...ids, targetId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return [...new Set([...ids, ...visibleIds.slice(start, end + 1)])];
}

function formatAssistantBulkActionLabel(action: BulkOperationAction) {
  return action === "bootstrap-retry" ? "bootstrap retry" : action;
}

function renderMessageActionRow(
  timestamp: string | number | Date | undefined,
  copyButton: JSX.Element,
) {
  return (
    <div
      class={
        stylex.attrs(
          assistantUtilityStyles.mt3,
          assistantUtilityStyles.flex,
          assistantUtilityStyles.itemsCenter,
          assistantUtilityStyles.justifyBetween,
          assistantUtilityStyles.gap3,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.text0575,
            assistantUtilityStyles.uppercase,
            assistantUtilityStyles.tracking012,
            assistantUtilityStyles.textMuted,
          ).class
        }
      >
        {formatShortTimestamp(timestamp)}
      </div>
      {copyButton}
    </div>
  );
}

function compareAssistantLearnings(
  left: AssistantLearning,
  right: AssistantLearning,
) {
  if (left.sortOrder !== undefined || right.sortOrder !== undefined) {
    if (left.sortOrder === undefined) {
      return 1;
    }
    if (right.sortOrder === undefined) {
      return -1;
    }
    return left.sortOrder - right.sortOrder;
  }
  const leftSummary = (left.kind ?? "fact") === "summary" ? 1 : 0;
  const rightSummary = (right.kind ?? "fact") === "summary" ? 1 : 0;
  return (
    rightSummary - leftSummary || right.createdAt.localeCompare(left.createdAt)
  );
}

function formatFailureCategory(value: string) {
  return value.replace(/-/g, " ");
}

function formatFailureTracking(job: BackgroundJob) {
  const streak = job.consecutiveFailureCount ?? 0;
  const lastCategory = job.lastFailureCategory
    ? formatFailureCategory(job.lastFailureCategory)
    : undefined;
  const backoffUntil = job.backoffUntil
    ? formatShortTimestamp(job.backoffUntil)
    : undefined;
  if (streak <= 0 && !lastCategory && !backoffUntil) {
    return undefined;
  }
  return [
    streak > 0 ? `Failure streak ${streak}` : undefined,
    lastCategory ? `last ${lastCategory}` : undefined,
    backoffUntil ? `backoff until ${backoffUntil}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function formatPromptStats(
  promptStats: BackgroundJobRun["promptStats"] | undefined,
) {
  if (!promptStats) {
    return undefined;
  }
  return `${promptStats.promptChars} chars, hash ${promptStats.promptHash}`;
}

function splitAssistantStreamingText(input: string) {
  const text = input.trim();
  if (!text) {
    return [];
  }
  const chunks: string[] = [];
  let buffer = "";
  for (const part of text.split(/(?<=[.!?])\s+|\n\n+/)) {
    const next = buffer ? `${buffer} ${part}` : part;
    if (next.length < 700) {
      buffer = next;
      continue;
    }
    if (buffer) {
      chunks.push(buffer);
    }
    buffer = part;
  }
  if (buffer) {
    chunks.push(buffer);
  }
  return chunks.length ? chunks : [text];
}

function getReasoningStrengthDescription(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "low":
      return "Fastest pass with minimal internal deliberation.";
    case "medium":
      return "Balanced depth for routine implementation and review.";
    case "high":
      return "Default stronger reasoning for most coding work.";
    case "extra-high":
      return "Heaviest reasoning budget for hard debugging and planning.";
  }
}

function formatReasoningStrengthLabel(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "extra-high":
      return "Extra High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "high":
    default:
      return "High";
  }
}

function formatReasoningOptionLabel(strength: ComposerReasoningStrength) {
  const label = formatReasoningStrengthLabel(strength);
  return strength === DEFAULT_COMPOSER_REASONING_STRENGTH
    ? `${label} (default)`
    : label;
}

type AssistantsPanelProps = {
  initialCircuitBreakerAssistantId?: string;
  variant?: "full" | "roster" | "detail";
};

export function AssistantsPanel(props?: AssistantsPanelProps) {
  let assistantChatTextarea: HTMLTextAreaElement | undefined;
  let assistantMessageViewport: HTMLDivElement | undefined;
  let lastRequestedDetailAssistantId: string | undefined;
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeTab = createMemo(() => state.assistants.selectedTab);
  const [chatDraft, setChatDraft] = createSignal("");
  const [assistantChatModeId, setAssistantChatModeId] = createSignal("");
  const [assistantChatExecutionModelId, setAssistantChatExecutionModelId] =
    createSignal("");
  const [assistantChatReasoningStrength, setAssistantChatReasoningStrength] =
    createSignal<ComposerReasoningStrength>(
      DEFAULT_COMPOSER_REASONING_STRENGTH,
    );
  const [assistantChatFastMode, setAssistantChatFastMode] = createSignal(false);
  const [assistantStickToBottom, setAssistantStickToBottom] =
    createSignal(true);
  const [
    assistantStreamingStartedAtByAssistantId,
    setAssistantStreamingStartedAtByAssistantId,
  ] = createSignal<Record<string, string>>({});
  const [newTodoTitle, setNewTodoTitle] = createSignal("");
  const [
    selectedCircuitBreakerAssistantId,
    setSelectedCircuitBreakerAssistantId,
  ] = createSignal<string | undefined>(props?.initialCircuitBreakerAssistantId);
  const [questionAnswers, setQuestionAnswers] = createSignal<
    Record<string, string>
  >({});
  const visibleAssistants = createMemo(() =>
    getVisibleAssistants(state)
      .filter((assistant) => matchesAssistantFilters(assistant, state))
      .filter((assistant) =>
        fuzzyMatches(
          assistantSearchHaystack(assistant, state),
          state.assistants.rosterSearch,
        ),
      )
      .sort((left, right) =>
        compareAssistants(left, right, state.assistants.rosterSort),
      ),
  );
  const [selectedAssistantIds, setSelectedAssistantIds] = createSignal<
    string[]
  >([]);
  const [assistantSelectionAnchorId, setAssistantSelectionAnchorId] =
    createSignal<string>();
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    label: string;
    actions: ContextMenuAction[];
  }>();
  let pendingAssistantSelectionTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingAssistantSelectionId: string | undefined;
  let consumedAssistantDelayedSelection = false;
  const selectedAssistantIdSet = createMemo(
    () => new Set(selectedAssistantIds()),
  );
  const selectedAssistants = createMemo(() =>
    visibleAssistants().filter((assistant) =>
      selectedAssistantIdSet().has(assistant.id),
    ),
  );
  const selectedAssistant = createMemo(() => getSelectedAssistant(state));
  createEffect(() => {
    const visibleIds = new Set(
      visibleAssistants().map((assistant) => assistant.id),
    );
    setSelectedAssistantIds((ids) => ids.filter((id) => visibleIds.has(id)));
    const anchorId = assistantSelectionAnchorId();
    if (anchorId && !visibleIds.has(anchorId)) {
      setAssistantSelectionAnchorId(undefined);
    }
  });
  onCleanup(() => clearAssistantSelectionTimer());
  createEffect(() => {
    const assistantId = selectedAssistant()?.id;
    if (!assistantId || lastRequestedDetailAssistantId === assistantId) {
      return;
    }
    const hasDetail =
      state.assistants.threads.some(
        (thread) => thread.assistantId === assistantId,
      ) ||
      state.assistants.todos.some((todo) => todo.assistantId === assistantId) ||
      state.assistants.questions.some(
        (question) => question.assistantId === assistantId,
      ) ||
      state.assistants.learnings.some(
        (learning) => learning.assistantId === assistantId,
      ) ||
      state.assistants.logs.some(
        (entry) => entry.assistantId === assistantId,
      ) ||
      state.assistants.assetRefs.some(
        (assetRef) => assetRef.assistantId === assistantId,
      );
    if (hasDetail) {
      return;
    }
    lastRequestedDetailAssistantId = assistantId;
    sendCommand({
      type: "assistant.detail.get",
      requestId: createRequestId(),
      payload: { assistantId },
    });
  });
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
  const assistantChatFileLinkContext = (): ChatFileLinkContext => ({
    rootPath: assistantFileProject()?.rootPath,
    filePaths: assistantFileProject()?.filePaths ?? [],
  });
  const assistantChatFileLinks = () => ({
    ...assistantChatFileLinkContext(),
    onOpenFile: handleOpenAssistantChatFile,
  });

  function clearAssistantSelectionTimer() {
    if (pendingAssistantSelectionTimer) {
      clearTimeout(pendingAssistantSelectionTimer);
      pendingAssistantSelectionTimer = undefined;
    }
    if (!consumedAssistantDelayedSelection) {
      pendingAssistantSelectionId = undefined;
    }
  }

  function isInteractiveAssistantSelectionTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest("button,a,input,textarea,select,[role='menuitem']"),
      )
    );
  }

  function scheduleAssistantDelayedSelection(
    assistantId: string,
    event: PointerEvent,
  ) {
    if (
      event.button !== 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      isInteractiveAssistantSelectionTarget(event.target)
    ) {
      return;
    }
    clearAssistantSelectionTimer();
    pendingAssistantSelectionId = assistantId;
    pendingAssistantSelectionTimer = setTimeout(() => {
      pendingAssistantSelectionTimer = undefined;
      consumedAssistantDelayedSelection = true;
      setSelectedAssistantIds((ids) =>
        ids.includes(assistantId) ? ids : [...ids, assistantId],
      );
      setAssistantSelectionAnchorId(assistantId);
    }, 250);
  }

  function consumeAssistantDelayedSelection(assistantId: string) {
    if (
      !consumedAssistantDelayedSelection ||
      pendingAssistantSelectionId !== assistantId
    ) {
      return false;
    }
    consumedAssistantDelayedSelection = false;
    pendingAssistantSelectionId = undefined;
    return true;
  }

  function selectAssistantWithMouse(assistant: Assistant, event: MouseEvent) {
    const visibleIds = visibleAssistants().map((entry) => entry.id);
    if (event.shiftKey) {
      const anchorId = assistantSelectionAnchorId() ?? assistant.id;
      setSelectedAssistantIds((ids) =>
        mergeAssistantRangeSelection(ids, visibleIds, anchorId, assistant.id),
      );
      setAssistantSelectionAnchorId(anchorId);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedAssistantIds((ids) =>
        toggleAssistantSelectionId(ids, assistant.id),
      );
      setAssistantSelectionAnchorId(assistant.id);
      return;
    }
    setSelectedAssistantIds([assistant.id]);
    setAssistantSelectionAnchorId(assistant.id);
  }

  function handleAssistantCardClick(assistant: Assistant, event: MouseEvent) {
    if (consumeAssistantDelayedSelection(assistant.id)) {
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

  function assistantBulkTarget(assistant: Assistant): BulkOperationTarget {
    return {
      kind: "assistant",
      assistantId: assistant.id,
    };
  }

  function sendAssistantBulkOperation(
    action: BulkOperationAction,
    assistants: Assistant[],
  ) {
    if (assistants.length === 0) {
      return;
    }
    sendCommand({
      type: "bulk-operation.apply",
      requestId: createRequestId(),
      payload: {
        operationId: createRequestId(),
        action,
        targets: assistants.map(assistantBulkTarget),
      },
    });
    pushToast(
      "Bulk action sent",
      `${assistants.length} assistant${assistants.length === 1 ? "" : "s"} queued for ${formatAssistantBulkActionLabel(action)}.`,
      "info",
    );
  }

  function assistantBulkActions(assistants: Assistant[]): ContextMenuAction[] {
    return [
      {
        id: "pause",
        label: `Pause (${assistants.length})`,
        onSelect: () => sendAssistantBulkOperation("pause", assistants),
      },
      {
        id: "resume",
        label: `Resume (${assistants.length})`,
        onSelect: () => sendAssistantBulkOperation("resume", assistants),
      },
      {
        id: "bootstrap-retry",
        label: `Retry bootstrap (${assistants.length})`,
        disabled: executionPaused(),
        disabledReason: executionPauseReason,
        onSelect: () =>
          sendAssistantBulkOperation("bootstrap-retry", assistants),
      },
      {
        id: "delete",
        label: `Delete (${assistants.length})`,
        onSelect: () => sendAssistantBulkOperation("delete", assistants),
      },
    ];
  }

  function openAssistantBulkContextMenu(
    assistant: Assistant,
    event: MouseEvent,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const assistants = selectedAssistantIdSet().has(assistant.id)
      ? selectedAssistants()
      : [assistant];
    if (!selectedAssistantIdSet().has(assistant.id)) {
      setSelectedAssistantIds([assistant.id]);
      setAssistantSelectionAnchorId(assistant.id);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      label:
        assistants.length > 1 ? "Bulk assistant actions" : "Assistant actions",
      actions: assistantBulkActions(assistants),
    });
  }

  createEffect(() => {
    const assistant = selectedAssistant();
    if (!assistant) {
      return;
    }
    setAssistantChatModeId(assistant.modeId ?? "");
    setAssistantChatExecutionModelId(assistant.executionModelId ?? "");
    setAssistantChatReasoningStrength(
      assistant.reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH,
    );
    setAssistantChatFastMode(Boolean(assistant.fastMode));
  });
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
  const selectedThread = createMemo(() =>
    state.assistants.threads.find(
      (thread) => thread.assistantId === selectedAssistant()?.id,
    ),
  );
  const visibleAssistantMessages = createMemo(() =>
    (selectedThread()?.messages ?? []).filter((message) =>
      fuzzyMatches(
        [message.role, message.content].join(" "),
        state.assistants.detailSearch,
      ),
    ),
  );
  const selectedTodos = createMemo(() =>
    [...state.assistants.todos]
      .filter((todo) => todo.assistantId === selectedAssistant()?.id)
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          right.updatedAt.localeCompare(left.updatedAt),
      ),
  );
  const visibleTodos = createMemo(() =>
    selectedTodos().filter((todo) =>
      fuzzyMatches(
        [
          todo.title,
          todo.description,
          todo.state,
          todo.blockerReason,
          todo.workKind,
          todo.workTarget,
        ]
          .filter(Boolean)
          .join(" "),
        state.assistants.detailSearch,
      ),
    ),
  );
  const selectedQuestions = createMemo(() =>
    [...state.assistants.questions]
      .filter((question) => question.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.askedAt.localeCompare(left.askedAt)),
  );
  const visibleQuestions = createMemo(() =>
    selectedQuestions().filter((question) =>
      fuzzyMatches(
        [question.prompt, question.answerText, question.status]
          .filter(Boolean)
          .join(" "),
        state.assistants.detailSearch,
      ),
    ),
  );
  const selectedLearnings = createMemo(() =>
    [...state.assistants.learnings]
      .filter((learning) => learning.assistantId === selectedAssistant()?.id)
      .sort(compareAssistantLearnings),
  );
  const filteredLearnings = createMemo(() =>
    selectedLearnings().filter((learning) =>
      fuzzyMatches(
        [learning.summary, learning.source, learning.confidence, learning.kind]
          .filter(Boolean)
          .join(" "),
        state.assistants.detailSearch,
      ),
    ),
  );
  const selectedLogs = createMemo(() =>
    [...state.assistants.logs]
      .filter((entry) => entry.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  );
  const visibleLogs = createMemo(() =>
    selectedLogs().filter((entry) =>
      fuzzyMatches(
        [entry.summary, entry.detail, entry.level, entry.detailsJson]
          .filter(Boolean)
          .join(" "),
        state.assistants.detailSearch,
      ),
    ),
  );
  const selectedExecutionLogs = createMemo(() =>
    visibleLogs()
      .slice(0, 500)
      .map((entry) => ({
        id: entry.id,
        message: entry.summary,
        rowSummary: [entry.summary, entry.detail].filter(Boolean).join(" "),
        level: entry.level,
        createdAt: entry.createdAt,
        detail: entry.detail,
        detailsJson: entry.detailsJson,
        detailsJsonSummary: entry.detailsJsonSummary,
      })),
  );
  const selectedAssetRefs = createMemo(() =>
    state.assistants.assetRefs.filter(
      (assetRef) => assetRef.assistantId === selectedAssistant()?.id,
    ),
  );
  const selectedJobs = createMemo(() =>
    [...state.backgroundJobs.jobs]
      .filter((job) => job.assistantId === selectedAssistant()?.id)
      .sort((left, right) =>
        (right.nextRunAt ?? right.updatedAt).localeCompare(
          left.nextRunAt ?? left.updatedAt,
        ),
      ),
  );
  const visibleJobs = createMemo(() =>
    selectedJobs().filter((job) =>
      fuzzyMatches(
        [job.name, job.description, job.status, job.kind, job.scheduleInput]
          .filter(Boolean)
          .join(" "),
        state.assistants.detailSearch,
      ),
    ),
  );
  const selectedRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => run.assistantId === selectedAssistant()?.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  );
  const visibleRuns = createMemo(() =>
    selectedRuns().filter((run) =>
      fuzzyMatches(
        [
          run.summary,
          run.status,
          run.failureMessage,
          run.failureCategory,
          run.triggerSource,
        ]
          .filter(Boolean)
          .join(" "),
        state.assistants.detailSearch,
      ),
    ),
  );
  const circuitBreakerAssistant = createMemo(() =>
    state.assistants.assistants.find(
      (assistant) => assistant.id === selectedCircuitBreakerAssistantId(),
    ),
  );
  const circuitBreakerFileProject = createMemo(
    () =>
      state.workspace.projects.find(
        (project) => project.id === circuitBreakerAssistant()?.projectId,
      ) ?? assistantFileProject(),
  );
  const circuitBreakerFileLinks = () =>
    getAssistantProjectFileLinks(circuitBreakerFileProject());
  const circuitBreakerLogs = createMemo(() =>
    [...state.assistants.logs]
      .filter(
        (entry) => entry.assistantId === selectedCircuitBreakerAssistantId(),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5),
  );
  const circuitBreakerRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => run.assistantId === selectedCircuitBreakerAssistantId())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5),
  );
  const circuitBreakerQuestions = createMemo(() =>
    [...state.assistants.questions]
      .filter(
        (question) =>
          question.assistantId === selectedCircuitBreakerAssistantId() &&
          question.status === "pending",
      )
      .sort((left, right) => right.askedAt.localeCompare(left.askedAt))
      .slice(0, 5),
  );
  const streamingText = createMemo(
    () =>
      state.assistants.streamingByAssistantId[selectedAssistant()?.id ?? ""] ??
      "",
  );
  const assistantChatRows = createMemo(() => [
    ...visibleAssistantMessages().map((message) => ({
      kind: "message" as const,
      message,
    })),
    ...splitAssistantStreamingText(streamingText()).map((content, index) => ({
      kind: "streaming" as const,
      content,
      createdAt:
        assistantStreamingStartedAtByAssistantId()[
          selectedAssistant()?.id ?? ""
        ],
      index,
    })),
  ]);
  const executionPaused = createMemo(() => state.executionControl.isPaused);
  const executionPauseReason = "Global execution pause is active";
  const variant = () => (props && props.variant ? props.variant : "full");

  createEffect(() => {
    const assistantId = selectedAssistant()?.id;
    if (!assistantId) {
      return;
    }
    const streaming = streamingText().trim().length > 0;
    if (streaming) {
      setAssistantStreamingStartedAtByAssistantId((current) =>
        current[assistantId]
          ? current
          : { ...current, [assistantId]: new Date().toISOString() },
      );
      return;
    }
    setAssistantStreamingStartedAtByAssistantId((current) => {
      if (!current[assistantId]) {
        return current;
      }
      const next = { ...current };
      delete next[assistantId];
      return next;
    });
  });

  const scrollAssistantChatToBottom = (force?: boolean) => {
    if (!assistantMessageViewport || (!force && !assistantStickToBottom())) {
      return;
    }

    queueMicrotask(() => {
      if (!assistantMessageViewport) {
        return;
      }

      assistantMessageViewport.scrollTop =
        assistantMessageViewport.scrollHeight;
    });
  };

  const updateAssistantScrollLock = () => {
    if (!assistantMessageViewport) {
      setAssistantStickToBottom(true);
      return;
    }

    const distanceFromBottom =
      assistantMessageViewport.scrollHeight -
      assistantMessageViewport.scrollTop -
      assistantMessageViewport.clientHeight;
    setAssistantStickToBottom(distanceFromBottom <= 32);
  };

  createEffect(() => {
    selectedAssistant()?.id;
    activeTab();
    scrollAssistantChatToBottom(true);
  });

  createEffect(() => {
    selectedThread()?.messages.length;
    streamingText();
    scrollAssistantChatToBottom();
  });
  const showRoster = () => variant() !== "detail";
  const showDetail = () => variant() !== "roster";
  const createScope = () =>
    state.assistants.scopeFilter === "global" ? "global" : "project";
  const createLabel = () =>
    state.assistants.scopeFilter === "global"
      ? "Create global assistant"
      : "Create project assistant";

  createEffect(() => {
    if (!showRoster()) {
      return;
    }
    const unregister = registerCurrentTabItemSelector("assistants", (index) => {
      const assistant = visibleAssistants()[index];
      if (!assistant) {
        return false;
      }
      harnessStore.setSelectedAssistantId(assistant.id);
      return true;
    });
    onCleanup(unregister);
  });

  createEffect(() => {
    const assistant = selectedAssistant();
    if (!assistant) {
      harnessStore.setSelectedAssistantId(undefined);
      return;
    }
    if (state.assistants.selectedAssistantId !== assistant.id) {
      harnessStore.setSelectedAssistantId(assistant.id);
    }
  });

  function openCreateAssistant(scope: Assistant["scope"]) {
    const draft: AssistantEditorDraft = {
      source: "create",
      name: "",
      scope,
      projectId:
        scope === "project"
          ? (state.workspace.activeProjectId ?? state.workspace.projects[0]?.id)
          : undefined,
      description: "",
      personalityPrompt: "",
      jobPrompt: "",
      agentId: state.selectedAgentId,
      providerBrand: state.providerBrand,
      modeId: "",
      executionModelId: state.selectedExecutionModelId,
      reasoningStrength: state.selectedReasoningStrength,
      fastMode: state.selectedFastMode,
      runState: "active",
      bootstrapState: "pending",
      assetRefsText: "",
    };
    harnessStore.openAssistantEditor(draft);
  }

  function openEditAssistant(assistant: Assistant) {
    const assetRefsText = state.assistants.assetRefs
      .filter((assetRef) => assetRef.assistantId === assistant.id)
      .map(
        (assetRef) =>
          `${assetRef.kind} | ${assetRef.label} | ${assetRef.value}`,
      )
      .join("\n");
    harnessStore.openAssistantEditor({
      source: "edit",
      assistantId: assistant.id,
      name: assistant.name,
      scope: assistant.scope,
      projectId: assistant.projectId,
      description: assistant.description ?? "",
      personalityPrompt: assistant.personalityPrompt,
      jobPrompt: assistant.jobPrompt,
      agentId: assistant.agentId,
      providerBrand: assistant.providerBrand,
      modeId: assistant.modeId,
      executionModelId: assistant.executionModelId,
      reasoningStrength: assistant.reasoningStrength,
      fastMode: assistant.fastMode,
      runState: assistant.runState,
      bootstrapState: assistant.bootstrapState,
      assetRefsText,
    });
  }

  function handleSendChat() {
    if (executionPaused()) {
      return;
    }
    const assistant = selectedAssistant();
    const trimmed = chatDraft().trim();
    if (!assistant || !trimmed) {
      return;
    }
    const sent = sendCommand({
      type: "assistant.chat.send",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
        content: trimmed,
        modeId: assistantChatModeId().trim() || undefined,
        executionModelId: assistantChatExecutionModelId().trim() || undefined,
        reasoningStrength: assistantChatReasoningStrength(),
        fastMode: assistantChatFastMode(),
      },
    });
    if (sent) {
      setChatDraft("");
      if (assistantChatTextarea) {
        assistantChatTextarea.value = "";
      }
    }
  }

  function handleAddTodo() {
    const assistant = selectedAssistant();
    const trimmedTitle = newTodoTitle().trim();
    if (!assistant || !trimmedTitle) {
      return;
    }
    sendCommand({
      type: "assistant.todo.update",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
        todoId: createAssistantTodoId(),
        patch: {
          title: trimmedTitle,
          state: "pending",
          workKind: "app-code",
        },
      },
    });
    setNewTodoTitle("");
  }

  function updateTodo(todo: AssistantTodo, patch: Partial<AssistantTodo>) {
    sendCommand({
      type: "assistant.todo.update",
      requestId: createRequestId(),
      payload: {
        assistantId: todo.assistantId,
        todoId: todo.id,
        patch: {
          title: patch.title,
          description: patch.description,
          state: patch.state,
          blockerReason: patch.blockerReason,
          workKind: patch.workKind,
          workTarget: patch.workTarget,
        },
      },
    });
  }

  function deleteTodo(todo: AssistantTodo) {
    const confirmed = window.confirm(`Delete todo "${todo.title}"?`);
    if (!confirmed) {
      return;
    }
    sendCommand({
      type: "assistant.todo.delete",
      requestId: createRequestId(),
      payload: {
        assistantId: todo.assistantId,
        todoId: todo.id,
      },
    });
  }

  function reorderTodo(todo: AssistantTodo, direction: -1 | 1) {
    const orderedTodos = selectedTodos();
    const currentIndex = orderedTodos.findIndex(
      (entry) => entry.id === todo.id,
    );
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedTodos.length) {
      return;
    }
    const nextTodos = [...orderedTodos];
    [nextTodos[currentIndex], nextTodos[nextIndex]] = [
      nextTodos[nextIndex]!,
      nextTodos[currentIndex]!,
    ];
    sendCommand({
      type: "assistant.todo.reorder",
      requestId: createRequestId(),
      payload: {
        assistantId: todo.assistantId,
        todoIds: nextTodos.map((entry) => entry.id),
      },
    });
  }

  function deleteLearning(learning: AssistantLearning) {
    const confirmed = window.confirm("Delete this assistant learning?");
    if (!confirmed) {
      return;
    }
    sendCommand({
      type: "assistant.learning.delete",
      requestId: createRequestId(),
      payload: {
        assistantId: learning.assistantId,
        learningId: learning.id,
      },
    });
  }

  function reorderLearning(learning: AssistantLearning, direction: -1 | 1) {
    const orderedLearnings = selectedLearnings();
    const currentIndex = orderedLearnings.findIndex(
      (entry) => entry.id === learning.id,
    );
    const nextIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= orderedLearnings.length
    ) {
      return;
    }
    const nextLearnings = [...orderedLearnings];
    [nextLearnings[currentIndex], nextLearnings[nextIndex]] = [
      nextLearnings[nextIndex]!,
      nextLearnings[currentIndex]!,
    ];
    sendCommand({
      type: "assistant.learning.reorder",
      requestId: createRequestId(),
      payload: {
        assistantId: learning.assistantId,
        learningIds: nextLearnings.map((entry) => entry.id),
      },
    });
  }

  function answerQuestion(question: AssistantQuestion, answerText?: string) {
    if (executionPaused()) {
      return;
    }
    const answer = (answerText ?? questionAnswers()[question.id])?.trim();
    if (!answer) {
      pushToast("Answer required", "Write answer before sending.", "error");
      return;
    }
    sendCommand({
      type: "assistant.question.answer",
      requestId: createRequestId(),
      payload: {
        assistantId: question.assistantId,
        questionId: question.id,
        content: answer,
      },
    });
    setQuestionAnswers((current) => ({ ...current, [question.id]: "" }));
  }

  function handleAssistantComposerClick(
    event: MouseEvent & { currentTarget: HTMLTextAreaElement },
  ) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    const reference = findChatFileReferenceAtPosition(
      event.currentTarget.value,
      event.currentTarget.selectionStart,
      assistantChatFileLinkContext(),
    );
    if (!reference) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handleOpenAssistantChatFile(reference.target);
  }

  function handleOpenAssistantChatFile(target: ChatFileTarget) {
    handleOpenAssistantProjectFile(assistantFileProject(), target);
  }

  function handleOpenAssistantProjectFile(
    project: (typeof state.workspace.projects)[number] | undefined,
    target: ChatFileTarget,
  ) {
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  function getAssistantProjectFileLinks(
    project: (typeof state.workspace.projects)[number] | undefined,
  ): FileLinkConfig {
    return {
      rootPath: project?.rootPath,
      filePaths: project?.filePaths ?? [],
      onOpenFile: (target) => handleOpenAssistantProjectFile(project, target),
    };
  }

  function getAssistantFileLinks(
    assistant: Assistant | undefined,
  ): FileLinkConfig {
    const project =
      state.workspace.projects.find(
        (entry) => entry.id === assistant?.projectId,
      ) ?? assistantFileProject();
    return getAssistantProjectFileLinks(project);
  }

  function handleAssistantRosterKeyDown(
    event: KeyboardEvent,
    assistantId: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    harnessStore.setSelectedAssistantId(assistantId);
  }

  function openAssistantJobEditor() {
    const assistant = selectedAssistant();
    if (!assistant) {
      return;
    }
    const resolvedProjectId =
      assistant.projectId ?? state.workspace.activeProjectId;
    if (!resolvedProjectId) {
      pushToast(
        "Project required",
        "Clone global assistant to project before scheduling project work.",
        "error",
      );
      return;
    }

    const draft: BackgroundJobEditorDraft = {
      source: "create",
      projectId: resolvedProjectId,
      assistantId: assistant.id,
      kind: "ai-routine",
      name: `${assistant.name} routine`,
      description: "",
      scheduleInput: "",
      timezone: resolveBrowserTimezone(),
      aiPrompt: assistant.jobPrompt,
      aiModeId: assistant.modeId,
      aiExecutionModelId: assistant.executionModelId,
      aiReasoningStrength: assistant.reasoningStrength,
      aiFastMode: assistant.fastMode,
      aiPlanExecutionMode: state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy: state.subagentWorktreeStrategyDefault,
      shellExecutable: "",
      shellArgsText: "",
      shellCwd: "",
      shellEnvRefsText: "",
      shellTimeoutSeconds: 600,
      shellNetworkAccess: false,
    };
    harnessStore.openBackgroundJobEditor(draft);
  }

  function bootstrapAssistantJobs() {
    const assistant = selectedAssistant();
    if (!assistant) {
      return;
    }
    const projectId = assistant.projectId ?? state.workspace.activeProjectId;
    if (!projectId) {
      pushToast(
        "Project required",
        "Open a project before bootstrapping jobs for a global assistant.",
        "error",
      );
      return;
    }
    sendCommand({
      type: "assistant.jobs.bootstrap",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
        projectId,
      },
    });
  }

  function handleDeleteAssistant(assistant: Assistant) {
    const confirmed = window.confirm(
      `Delete assistant "${assistant.name}"?\n\nPending or active assistant jobs will be cancelled and purged.`,
    );
    if (!confirmed) {
      return;
    }
    sendCommand({
      type: "assistant.delete",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
      },
    });
  }

  function retryCircuitBreaker(assistant: Assistant) {
    if (executionPaused()) {
      return;
    }
    sendCommand({
      type: "assistant.circuit-breaker.retry",
      requestId: createRequestId(),
      payload: {
        assistantId: assistant.id,
      },
    });
    setSelectedCircuitBreakerAssistantId(undefined);
  }

  function openCircuitBreakerJobs() {
    setSelectedCircuitBreakerAssistantId(undefined);
    harnessStore.setActiveSurface("background-jobs");
  }

  function openAssistantBackgroundJob(jobId: string) {
    openBackgroundJobInJobsPane(state, jobId);
  }

  function openAssistantBackgroundRun(run: BackgroundJobRun) {
    openBackgroundRunInJobsPane(state, run.id, run.jobId);
  }

  function openAssistantLogSource(entry: ExecutionLogEntry) {
    const log = visibleLogs().find((candidate) => candidate.id === entry.id);
    if (log) {
      openAssistantLogEntrySource(state, log);
    }
  }

  function handleSourceCardKeyDown(event: KeyboardEvent, open: () => void) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    open();
  }

  return (
    <LeftPaneShell
      data-test-assistants-panel=""
      kind="assistants"
      padding="comfortable"
    >
      <Show when={selectedCircuitBreakerAssistantId()}>
        <Dialog
          open
          title="Circuit breaker"
          eyebrow="Assistant recovery"
          description="Inspect latest failure context, then retry recovery when ready."
          onClose={() => setSelectedCircuitBreakerAssistantId(undefined)}
          footer={
            <Show when={circuitBreakerAssistant()}>
              {(assistant) => (
                <>
                  <ActionButton
                    tooltip="Keep assistant paused and close this dialog"
                    variant="secondary"
                    onClick={() =>
                      setSelectedCircuitBreakerAssistantId(undefined)
                    }
                  >
                    Keep paused
                  </ActionButton>
                  <ActionButton
                    tooltip="Open assistant-owned background jobs"
                    variant="secondary"
                    onClick={openCircuitBreakerJobs}
                  >
                    Open jobs
                  </ActionButton>
                  <ActionButton
                    tooltip="Focus this assistant in the Assistants surface"
                    variant="secondary"
                    onClick={() => {
                      harnessStore.setSelectedAssistantId(assistant().id);
                      setSelectedCircuitBreakerAssistantId(undefined);
                    }}
                  >
                    Open assistant
                  </ActionButton>
                  <ActionButton
                    tooltip={
                      executionPaused()
                        ? executionPauseReason
                        : "Clear circuit breaker, resume assistant, and retry recovery"
                    }
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason}
                    icon={
                      <RefreshCcw
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h4,
                            assistantUtilityStyles.w4,
                          ).class
                        }
                      />
                    }
                    ariaLabel="Retry"
                    onClick={() => retryCircuitBreaker(assistant())}
                  >
                    Retry
                  </ActionButton>
                </>
              )}
            </Show>
          }
        >
          <Show when={circuitBreakerAssistant()}>
            {(assistant) => (
              <div
                class={
                  stylex.attrs(
                    assistantUtilityStyles.flex,
                    assistantUtilityStyles.flexCol,
                    assistantUtilityStyles.gap4,
                  ).class
                }
              >
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.grid,
                      assistantUtilityStyles.gap2,
                      assistantUtilityStyles.text0675,
                      assistantUtilityStyles.textMuted,
                      assistantUtilityStyles.mdGridCols2,
                    ).class
                  }
                >
                  <div>
                    <span
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.textForeground,
                        ).class
                      }
                    >
                      Assistant:
                    </span>{" "}
                    {assistant().name}
                  </div>
                  <div>
                    <span
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.textForeground,
                        ).class
                      }
                    >
                      Scope:
                    </span>{" "}
                    {assistant().scope}
                  </div>
                  <div>
                    <span
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.textForeground,
                        ).class
                      }
                    >
                      Run state:
                    </span>{" "}
                    {assistant().runState}
                  </div>
                  <div>
                    <span
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.textForeground,
                        ).class
                      }
                    >
                      Bootstrap:
                    </span>{" "}
                    {assistant().bootstrapState}
                  </div>
                  <div>
                    <span
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.textForeground,
                        ).class
                      }
                    >
                      Failure streak:
                    </span>{" "}
                    {assistant().failureStreakCount}
                  </div>
                  <div>
                    <span
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.textForeground,
                        ).class
                      }
                    >
                      Breaker:
                    </span>{" "}
                    {assistant().circuitBreakerState}
                  </div>
                </div>
                <section
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.rounded2xl,
                      assistantUtilityStyles.border,
                      assistantUtilityStyles.borderBorder,
                      assistantUtilityStyles.bgWhite70,
                      assistantUtilityStyles.p3,
                    ).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.mb2,
                        assistantUtilityStyles.text0585,
                        assistantUtilityStyles.fontSemibold,
                        assistantUtilityStyles.uppercase,
                        assistantUtilityStyles.tracking018,
                        assistantUtilityStyles.textMuted,
                      ).class
                    }
                  >
                    Reason
                  </div>
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.text075,
                        assistantUtilityStyles.leading5,
                        assistantUtilityStyles.textForeground,
                      ).class
                    }
                  >
                    <FileLinkedText
                      text={
                        assistant().circuitBreakerReason ??
                        "No failure reason recorded."
                      }
                      fileLinks={circuitBreakerFileLinks()}
                    />
                  </div>
                </section>
                <section
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.rounded2xl,
                      assistantUtilityStyles.border,
                      assistantUtilityStyles.borderBorder,
                      assistantUtilityStyles.bgWhite70,
                      assistantUtilityStyles.p3,
                    ).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.mb2,
                        assistantUtilityStyles.text0585,
                        assistantUtilityStyles.fontSemibold,
                        assistantUtilityStyles.uppercase,
                        assistantUtilityStyles.tracking018,
                        assistantUtilityStyles.textMuted,
                      ).class
                    }
                  >
                    Latest logs
                  </div>
                  <Show
                    when={circuitBreakerLogs().length > 0}
                    fallback={
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.text0675,
                            assistantUtilityStyles.textMuted,
                          ).class
                        }
                      >
                        No recent logs.
                      </div>
                    }
                  >
                    <div
                      class={stylex.attrs(assistantUtilityStyles.spaceY2).class}
                    >
                      <For each={circuitBreakerLogs()}>
                        {(entry) => (
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.roundedXl,
                                assistantUtilityStyles.border,
                                assistantUtilityStyles.borderBorder,
                                assistantUtilityStyles.bgWhite70,
                                assistantUtilityStyles.p2,
                                assistantUtilityStyles.text0675,
                                assistantUtilityStyles.leading5,
                              ).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.fontSemibold,
                                  assistantUtilityStyles.textForeground,
                                ).class
                              }
                            >
                              <FileLinkedText
                                text={`${entry.level} | ${entry.summary}`}
                                fileLinks={circuitBreakerFileLinks()}
                              />
                            </div>
                            <div
                              class={
                                stylex.attrs(assistantUtilityStyles.textMuted)
                                  .class
                              }
                            >
                              <FileLinkedText
                                text={entry.detail ?? "No detail."}
                                fileLinks={circuitBreakerFileLinks()}
                              />
                            </div>
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt1,
                                  assistantUtilityStyles.text0575,
                                  assistantUtilityStyles.uppercase,
                                  assistantUtilityStyles.tracking012,
                                  assistantUtilityStyles.textMuted,
                                ).class
                              }
                            >
                              {formatShortTimestamp(entry.createdAt)}
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
                <section
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.rounded2xl,
                      assistantUtilityStyles.border,
                      assistantUtilityStyles.borderBorder,
                      assistantUtilityStyles.bgWhite70,
                      assistantUtilityStyles.p3,
                    ).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.mb2,
                        assistantUtilityStyles.text0585,
                        assistantUtilityStyles.fontSemibold,
                        assistantUtilityStyles.uppercase,
                        assistantUtilityStyles.tracking018,
                        assistantUtilityStyles.textMuted,
                      ).class
                    }
                  >
                    Latest runs
                  </div>
                  <Show
                    when={circuitBreakerRuns().length > 0}
                    fallback={
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.text0675,
                            assistantUtilityStyles.textMuted,
                          ).class
                        }
                      >
                        No assistant-owned job runs.
                      </div>
                    }
                  >
                    <div
                      class={stylex.attrs(assistantUtilityStyles.spaceY2).class}
                    >
                      <For each={circuitBreakerRuns()}>
                        {(run) => (
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.roundedXl,
                                assistantUtilityStyles.border,
                                assistantUtilityStyles.borderBorder,
                                assistantUtilityStyles.bgWhite70,
                                assistantUtilityStyles.p2,
                                assistantUtilityStyles.text0675,
                                assistantUtilityStyles.leading5,
                              ).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.fontSemibold,
                                  assistantUtilityStyles.textForeground,
                                ).class
                              }
                            >
                              {run.status}
                            </div>
                            <div
                              class={
                                stylex.attrs(assistantUtilityStyles.textMuted)
                                  .class
                              }
                            >
                              <FileLinkedText
                                text={
                                  run.failureMessage ?? run.summary ?? run.id
                                }
                                fileLinks={circuitBreakerFileLinks()}
                              />
                            </div>
                            <Show when={run.failureCategory}>
                              {(category) => (
                                <div
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.textMuted,
                                    ).class
                                  }
                                >
                                  Category: {formatFailureCategory(category())}
                                </div>
                              )}
                            </Show>
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt1,
                                  assistantUtilityStyles.text0575,
                                  assistantUtilityStyles.uppercase,
                                  assistantUtilityStyles.tracking012,
                                  assistantUtilityStyles.textMuted,
                                ).class
                              }
                            >
                              {formatShortTimestamp(run.updatedAt)}
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
                <section
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.rounded2xl,
                      assistantUtilityStyles.border,
                      assistantUtilityStyles.borderBorder,
                      assistantUtilityStyles.bgWhite70,
                      assistantUtilityStyles.p3,
                    ).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.mb2,
                        assistantUtilityStyles.text0585,
                        assistantUtilityStyles.fontSemibold,
                        assistantUtilityStyles.uppercase,
                        assistantUtilityStyles.tracking018,
                        assistantUtilityStyles.textMuted,
                      ).class
                    }
                  >
                    Pending questions
                  </div>
                  <Show
                    when={circuitBreakerQuestions().length > 0}
                    fallback={
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.text0675,
                            assistantUtilityStyles.textMuted,
                          ).class
                        }
                      >
                        No pending questions.
                      </div>
                    }
                  >
                    <div
                      class={stylex.attrs(assistantUtilityStyles.spaceY2).class}
                    >
                      <For each={circuitBreakerQuestions()}>
                        {(question) => (
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.roundedXl,
                                assistantUtilityStyles.border,
                                assistantUtilityStyles.borderBorder,
                                assistantUtilityStyles.bgWhite70,
                                assistantUtilityStyles.p2,
                                assistantUtilityStyles.text0675,
                                assistantUtilityStyles.leading5,
                                assistantUtilityStyles.textForeground,
                              ).class
                            }
                          >
                            <FileLinkedText
                              text={question.prompt}
                              fileLinks={circuitBreakerFileLinks()}
                            />
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              </div>
            )}
          </Show>
        </Dialog>
      </Show>
      <Show when={showRoster()}>
        <LeftPaneHeader
          title="Assistants"
          help="Named operators with chat, todo list, questions inbox, learnings, jobs, and deep logs."
          actions={
            <ActionButton
              tooltip={tooltipWithPrimaryHotkey(
                createLabel(),
                normalizeAppHotkeyPreferences(state.appHotkeyPreferences)
                  .createAssistant[0],
              )}
              icon={
                <Plus
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.h4,
                      assistantUtilityStyles.w4,
                    ).class
                  }
                />
              }
              size="icon"
              variant="ghost"
              ariaLabel={createLabel()}
              onClick={() => openCreateAssistant(createScope())}
            />
          }
        />
      </Show>

      <div
        class={cn(
          stylex.attrs(
            assistantUtilityStyles.grid,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.maxWFull,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.gap4,
          ).class,
          showRoster() && showDetail()
            ? stylex.attrs(assistantUtilityStyles.xlGridColsRoster).class
            : undefined,
        )}
      >
        <Show when={showRoster()}>
          <div
            class={
              stylex.attrs(
                assistantUtilityStyles.flex,
                assistantUtilityStyles.minH0,
                assistantUtilityStyles.minW0,
                assistantUtilityStyles.maxWFull,
                assistantUtilityStyles.flexCol,
                assistantUtilityStyles.gap1,
              ).class
            }
          >
            <LeftPaneFilterBlock>
              <LeftPaneSearchInput
                value={state.assistants.rosterSearch}
                aria-label="Search assistants"
                placeholder="Search assistants..."
                menu={
                  <LeftPaneSearchMenu
                    ariaLabel="Filter and sort assistants"
                    tooltip="Filter and sort assistants"
                    activeFilterCount={activeAssistantRosterFilterCount(state)}
                    items={assistantRosterMenuItems(state)}
                  />
                }
                onInput={(event) =>
                  harnessStore.setAssistantPaneFilters({
                    rosterSearch: (event.target as HTMLInputElement).value,
                  })
                }
              />
            </LeftPaneFilterBlock>
            <LeftPaneListSection
              title="Roster"
              count={`${visibleAssistants().length} total`}
              class={
                stylex.attrs(
                  assistantUtilityStyles.border0,
                  assistantUtilityStyles.bgTransparent,
                  assistantUtilityStyles.p0,
                ).class
              }
            >
              <Show when={selectedAssistants().length > 0}>
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.mb3,
                      assistantUtilityStyles.flex,
                      assistantUtilityStyles.flexWrap,
                      assistantUtilityStyles.itemsCenter,
                      assistantUtilityStyles.gap2,
                      assistantUtilityStyles.roundedLg,
                      assistantUtilityStyles.border,
                      assistantUtilityStyles.borderBorder,
                      assistantUtilityStyles.bgPanelStrong,
                      assistantUtilityStyles.p2,
                      assistantUtilityStyles.text0675,
                      assistantUtilityStyles.textForeground,
                    ).class
                  }
                >
                  <span
                    class={
                      stylex.attrs(assistantUtilityStyles.fontSemibold).class
                    }
                  >
                    {selectedAssistants().length} selected
                  </span>
                  <ActionButton
                    tooltip="Pause selected assistants"
                    size="sm"
                    icon={
                      <CirclePause
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation("pause", selectedAssistants())
                    }
                  >
                    Pause
                  </ActionButton>
                  <ActionButton
                    tooltip="Resume selected assistants"
                    size="sm"
                    variant="secondary"
                    icon={
                      <CirclePlay
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation("resume", selectedAssistants())
                    }
                  >
                    Resume
                  </ActionButton>
                  <ActionButton
                    tooltip="Retry selected assistant bootstraps"
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason}
                    size="sm"
                    variant="secondary"
                    icon={
                      <RefreshCcw
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation(
                        "bootstrap-retry",
                        selectedAssistants(),
                      )
                    }
                  >
                    Bootstrap
                  </ActionButton>
                  <ActionButton
                    tooltip="Delete selected assistants"
                    size="sm"
                    variant="secondary"
                    icon={
                      <Trash2
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation("delete", selectedAssistants())
                    }
                  >
                    Delete
                  </ActionButton>
                  <ActionButton
                    tooltip="Clear selection"
                    size="sm"
                    variant="ghost"
                    icon={
                      <Square
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() => setSelectedAssistantIds([])}
                  >
                    Clear
                  </ActionButton>
                </div>
              </Show>
              <VirtualList
                class={
                  stylex.attrs(
                    assistantUtilityStyles.minH0,
                    assistantUtilityStyles.flex1,
                    assistantUtilityStyles.pr2,
                  ).class
                }
                contentClass={stylex.attrs(assistantUtilityStyles.wFull).class}
                itemClass={stylex.attrs(assistantUtilityStyles.pb3).class}
                items={visibleAssistants()}
                getKey={(assistant) => assistant.id}
                estimateSize={140}
                pagination={{
                  kind: "forward",
                  initialCount: 60,
                  batchSize: 60,
                }}
                empty={
                  <LeftPaneEmptyState>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.grid,
                          assistantUtilityStyles.gap3,
                        ).class
                      }
                    >
                      <div>No assistants match current search or filters.</div>
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.flexWrap,
                            assistantUtilityStyles.gap2,
                          ).class
                        }
                      >
                        <ActionButton
                          tooltip={tooltipWithPrimaryHotkey(
                            "Create assistant",
                            normalizeAppHotkeyPreferences(
                              state.appHotkeyPreferences,
                            ).createAssistant[0],
                          )}
                          ariaLabel="New assistant"
                          size="sm"
                          icon={
                            <Plus
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h35,
                                  assistantUtilityStyles.w35,
                                ).class
                              }
                            />
                          }
                          onClick={() => openCreateAssistant(createScope())}
                        >
                          New assistant
                        </ActionButton>
                        <ActionButton
                          tooltip={
                            state.workspace.activeProjectId
                              ? "Create from current thread"
                              : "Open a project first"
                          }
                          ariaLabel="Create from current thread"
                          size="sm"
                          variant="secondary"
                          disabled={!state.workspace.activeProjectId}
                          disabledReason={
                            !state.workspace.activeProjectId
                              ? "Open a project first"
                              : undefined
                          }
                          icon={
                            <MessageSquare
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h35,
                                  assistantUtilityStyles.w35,
                                ).class
                              }
                            />
                          }
                          onClick={() => openCreateAssistant("project")}
                        >
                          Create from current thread
                        </ActionButton>
                      </div>
                    </div>
                  </LeftPaneEmptyState>
                }
              >
                {(assistant) => (
                  <div
                    class={cn(
                      stylex.attrs(
                        assistantPanelStyles.denseCard,
                        assistantUtilityStyles.wFull,
                        assistantUtilityStyles.cursorPointer,
                        assistantUtilityStyles.borderL4,
                        assistantUtilityStyles.p3,
                        assistantUtilityStyles.textLeft,
                        assistantUtilityStyles.transition,
                        assistantUtilityStyles.hoverBorderAccentStrong,
                      ).class,
                      state.assistants.selectedAssistantId === assistant.id ||
                        selectedAssistantIds().includes(assistant.id)
                        ? stylex.attrs(assistantPanelStyles.denseCardSelected).class
                        : assistant.runState === "active"
                          ? stylex.attrs(assistantPanelStyles.borderEmerald).class
                          : stylex.attrs(assistantPanelStyles.borderAmber).class,
                    )}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(event) =>
                      scheduleAssistantDelayedSelection(assistant.id, event)
                    }
                    onPointerUp={clearAssistantSelectionTimer}
                    onPointerCancel={clearAssistantSelectionTimer}
                    onPointerLeave={clearAssistantSelectionTimer}
                    onClick={(event) =>
                      handleAssistantCardClick(assistant, event)
                    }
                    onContextMenu={(event) =>
                      openAssistantBulkContextMenu(assistant, event)
                    }
                    onKeyDown={(event) =>
                      handleAssistantRosterKeyDown(event, assistant.id)
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.itemsStart,
                          assistantUtilityStyles.justifyBetween,
                          assistantUtilityStyles.gap3,
                        ).class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.minW0,
                            assistantUtilityStyles.flex1,
                          ).class
                        }
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.text0775,
                              assistantUtilityStyles.fontSemibold,
                              assistantUtilityStyles.textForeground,
                            ).class
                          }
                        >
                          {assistant.name}
                        </div>
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt1,
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.flexWrap,
                              assistantUtilityStyles.gap1,
                            ).class
                          }
                        >
                          <StatusChip
                            tone={
                              assistant.scope === "global" ? "info" : "accent"
                            }
                          >
                            {assistant.scope}
                          </StatusChip>
                          <StatusChip
                            tone={assistantBootstrapTone(
                              assistant.bootstrapState,
                            )}
                          >
                            {assistant.bootstrapState}
                          </StatusChip>
                        </div>
                      </div>
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.shrink0,
                            assistantUtilityStyles.flexWrap,
                            assistantUtilityStyles.justifyEnd,
                            assistantUtilityStyles.gap1,
                          ).class
                        }
                      >
                        <ActionButton
                          tooltip={
                            selectedAssistantIdSet().has(assistant.id)
                              ? "Remove from bulk selection"
                              : "Add to bulk selection"
                          }
                          icon={
                            selectedAssistantIdSet().has(assistant.id) ? (
                              <CheckSquare2
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h3,
                                    assistantUtilityStyles.w3,
                                  ).class
                                }
                              />
                            ) : (
                              <Square
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h3,
                                    assistantUtilityStyles.w3,
                                  ).class
                                }
                              />
                            )
                          }
                          size="icon"
                          variant="ghost"
                          ariaLabel={
                            selectedAssistantIdSet().has(assistant.id)
                              ? `Remove ${assistant.name} from bulk selection`
                              : `Add ${assistant.name} to bulk selection`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedAssistantIds((ids) =>
                              toggleAssistantSelectionId(ids, assistant.id),
                            );
                            setAssistantSelectionAnchorId(assistant.id);
                          }}
                        />
                        <StatusChip
                          tone={assistantRunStateTone(assistant.runState)}
                        >
                          {assistant.runState}
                        </StatusChip>
                        <Show when={assistant.unreadQuestionCount > 0}>
                          <StatusChip
                            tone="warning"
                            class={
                              stylex.attrs(
                                rightAlignedNumbersEnabled() &&
                                  assistantPanelStyles.numericFlagged,
                              ).class
                            }
                          >
                            {assistant.unreadQuestionCount} q
                          </StatusChip>
                        </Show>
                      </div>
                    </div>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.mt3,
                          assistantUtilityStyles.text0675,
                          assistantUtilityStyles.leading5,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      <div>
                        <FileLinkedText
                          text={
                            assistant.description ??
                            summarizePrompt(assistant.jobPrompt)
                          }
                          fileLinks={getAssistantFileLinks(assistant)}
                        />
                      </div>
                      <div
                        class={stylex.attrs(assistantUtilityStyles.mt1).class}
                      >
                        {assistant.circuitBreakerState === "tripped"
                          ? "Circuit breaker tripped"
                          : `Updated ${formatShortTimestamp(assistant.updatedAt)}`}
                      </div>
                    </div>
                  </div>
                )}
              </VirtualList>
            </LeftPaneListSection>
          </div>
        </Show>

        <Show when={showDetail()}>
          <section
            class={
              stylex.attrs(
                assistantUtilityStyles.flex,
                assistantUtilityStyles.minH0,
                assistantUtilityStyles.minW0,
                assistantUtilityStyles.maxWFull,
                assistantUtilityStyles.flex1,
                assistantUtilityStyles.flexCol,
                assistantUtilityStyles.p4,
              ).class
            }
          >
            <Show
              when={selectedAssistant()}
              fallback={
                <DetailEmptyState>
                  Select assistant to inspect config, chat, todos, and logs.
                </DetailEmptyState>
              }
            >
              {(assistant) => (
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.flex,
                      assistantUtilityStyles.hFull,
                      assistantUtilityStyles.minH0,
                      assistantUtilityStyles.flexCol,
                      assistantUtilityStyles.gap4,
                    ).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.borderB,
                        assistantUtilityStyles.borderBorder,
                        assistantUtilityStyles.pb4,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.flexWrap,
                          assistantUtilityStyles.itemsStart,
                          assistantUtilityStyles.justifyBetween,
                          assistantUtilityStyles.gap4,
                        ).class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.minW0,
                            assistantUtilityStyles.flex1,
                          ).class
                        }
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.flexWrap,
                              assistantUtilityStyles.itemsCenter,
                              assistantUtilityStyles.gap2,
                            ).class
                          }
                        >
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.text0585,
                                assistantUtilityStyles.fontSemibold,
                                assistantUtilityStyles.uppercase,
                                assistantUtilityStyles.tracking018,
                                assistantUtilityStyles.textMuted,
                              ).class
                            }
                          >
                            Inspector
                          </div>
                          <StatusChip
                            tone={assistantRunStateTone(assistant().runState)}
                          >
                            {assistant().runState}
                          </StatusChip>
                          <Show
                            when={assistant().circuitBreakerState === "tripped"}
                          >
                            <StatusChip tone="danger">
                              circuit breaker
                            </StatusChip>
                          </Show>
                        </div>
                        <h2
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt1,
                              assistantUtilityStyles.breakWords,
                              assistantUtilityStyles.text12,
                              assistantUtilityStyles.fontSemibold,
                              assistantUtilityStyles.textForeground,
                              assistantUtilityStyles.wrapAnywhere,
                            ).class
                          }
                        >
                          {assistant().name}
                        </h2>
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt3,
                              assistantUtilityStyles.grid,
                              assistantUtilityStyles.gapX5,
                              assistantUtilityStyles.gapY1,
                              assistantUtilityStyles.borderL2,
                              assistantUtilityStyles.borderBorder,
                              assistantUtilityStyles.pl4,
                              assistantUtilityStyles.text0675,
                              assistantUtilityStyles.leading5,
                              assistantUtilityStyles.textMuted,
                              assistantUtilityStyles.smGridCols2,
                              assistantUtilityStyles.xlGridCols3,
                            ).class
                          }
                        >
                          <AssistantFact label="Scope">
                            {assistant().scope}
                          </AssistantFact>
                          <AssistantFact label="Bootstrap">
                            {assistant().bootstrapState}
                          </AssistantFact>
                          <AssistantFact label="Questions">
                            <span
                              class={
                                stylex.attrs(
                                  rightAlignedNumbersEnabled() &&
                                    assistantPanelStyles.numericFlagged,
                                ).class
                              }
                            >
                              {String(assistant().unreadQuestionCount)}
                            </span>
                          </AssistantFact>
                        </div>
                        <Show when={assistant().description}>
                          {(description) => (
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt3,
                                  assistantUtilityStyles.maxW3xl,
                                  assistantUtilityStyles.borderL2,
                                  assistantUtilityStyles.borderBorder,
                                  assistantUtilityStyles.pl4,
                                  assistantUtilityStyles.text0675,
                                  assistantUtilityStyles.leading5,
                                  assistantUtilityStyles.textMuted,
                                ).class
                              }
                            >
                              <FileLinkedText
                                text={description()}
                                fileLinks={assistantChatFileLinks()}
                              />
                            </div>
                          )}
                        </Show>
                      </div>

                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.wFull,
                            assistantUtilityStyles.maxWFull,
                            assistantUtilityStyles.flexWrap,
                            assistantUtilityStyles.gap2,
                            assistantUtilityStyles.smWAuto,
                            assistantUtilityStyles.smJustifyEnd,
                          ).class
                        }
                      >
                        <Show
                          when={assistant().circuitBreakerState === "tripped"}
                        >
                          <ActionButton
                            tooltip="Inspect circuit breaker failure and retry"
                            ariaLabel="Inspect failure"
                            icon={
                              <CircleAlert
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h4,
                                    assistantUtilityStyles.w4,
                                  ).class
                                }
                              />
                            }
                            variant="secondary"
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.borderAmber300,
                                assistantUtilityStyles.textAmber900,
                                assistantUtilityStyles.hoverBgAmber50,
                              ).class
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCircuitBreakerAssistantId(
                                assistant().id,
                              );
                            }}
                          >
                            Inspect failure
                          </ActionButton>
                        </Show>
                        <ActionButton
                          tooltip="Edit assistant config"
                          icon={
                            <SquarePen
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h4,
                                  assistantUtilityStyles.w4,
                                ).class
                              }
                            />
                          }
                          variant="secondary"
                          onClick={() => openEditAssistant(assistant())}
                        >
                          Edit
                        </ActionButton>
                        <ActionButton
                          tooltip={
                            assistant().runState === "paused"
                              ? "Resume assistant background work"
                              : "Pause assistant background work"
                          }
                          icon={
                            assistant().runState === "paused" ? (
                              <CirclePlay
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h4,
                                    assistantUtilityStyles.w4,
                                  ).class
                                }
                              />
                            ) : (
                              <CirclePause
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h4,
                                    assistantUtilityStyles.w4,
                                  ).class
                                }
                              />
                            )
                          }
                          variant="secondary"
                          class={
                            assistant().runState === "paused"
                              ? "border-(--accent) text-(--accent-strong) hover:bg-(--panel)"
                              : "border-amber-300 text-amber-900 hover:bg-amber-50"
                          }
                          onClick={() =>
                            sendCommand({
                              type:
                                assistant().runState === "paused"
                                  ? "assistant.resume"
                                  : "assistant.pause",
                              requestId: createRequestId(),
                              payload: { assistantId: assistant().id },
                            })
                          }
                        >
                          {assistant().runState === "paused"
                            ? "Resume"
                            : "Pause"}
                        </ActionButton>
                        <ActionButton
                          tooltip="Retry assistant bootstrap research"
                          disabled={executionPaused()}
                          disabledReason={executionPauseReason}
                          icon={
                            <RefreshCcw
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h4,
                                  assistantUtilityStyles.w4,
                                ).class
                              }
                            />
                          }
                          variant="secondary"
                          onClick={() =>
                            sendCommand({
                              type: "assistant.bootstrap.retry",
                              requestId: createRequestId(),
                              payload: { assistantId: assistant().id },
                            })
                          }
                        >
                          Retry bootstrap
                        </ActionButton>
                        <Show when={assistant().scope === "global"}>
                          <ActionButton
                            tooltip={
                              state.workspace.activeProjectId
                                ? "Clone global assistant into current project"
                                : "Open a project before cloning"
                            }
                            disabled={!state.workspace.activeProjectId}
                            disabledReason="Open project first"
                            icon={
                              <CopyPlus
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h4,
                                    assistantUtilityStyles.w4,
                                  ).class
                                }
                              />
                            }
                            variant="secondary"
                            onClick={() =>
                              state.workspace.activeProjectId &&
                              sendCommand({
                                type: "assistant.clone-to-project",
                                requestId: createRequestId(),
                                payload: {
                                  assistantId: assistant().id,
                                  projectId: state.workspace.activeProjectId,
                                },
                              })
                            }
                          >
                            Clone to project
                          </ActionButton>
                        </Show>
                        <ActionButton
                          tooltip="Delete assistant"
                          icon={
                            <Trash2
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h4,
                                  assistantUtilityStyles.w4,
                                ).class
                              }
                            />
                          }
                          variant="secondary"
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.borderDanger,
                              assistantUtilityStyles.textDanger,
                              assistantUtilityStyles.hoverBgPanel,
                            ).class
                          }
                          onClick={() => handleDeleteAssistant(assistant())}
                        >
                          Delete
                        </ActionButton>
                      </div>
                    </div>
                  </div>

                  <div
                    role="tablist"
                    aria-label="Assistant detail sections"
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.flex,
                        assistantUtilityStyles.gap1,
                        assistantUtilityStyles.overflowXAuto,
                        assistantUtilityStyles.borderB,
                        assistantUtilityStyles.borderBorder,
                      ).class
                    }
                  >
                    <TabButton
                      icon={
                        <MessageSquare
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h4,
                              assistantUtilityStyles.w4,
                            ).class
                          }
                        />
                      }
                      label="Chat"
                      active={activeTab() === "chat"}
                      onClick={() => harnessStore.setAssistantDetailTab("chat")}
                    />
                    <TabButton
                      icon={
                        <ListChecks
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h4,
                              assistantUtilityStyles.w4,
                            ).class
                          }
                        />
                      }
                      label="Todos"
                      active={activeTab() === "todos"}
                      onClick={() =>
                        harnessStore.setAssistantDetailTab("todos")
                      }
                    />
                    <TabButton
                      icon={
                        <ClipboardList
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h4,
                              assistantUtilityStyles.w4,
                            ).class
                          }
                        />
                      }
                      label="Questions"
                      active={activeTab() === "questions"}
                      onClick={() =>
                        harnessStore.setAssistantDetailTab("questions")
                      }
                    />
                    <TabButton
                      icon={
                        <Bot
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h4,
                              assistantUtilityStyles.w4,
                            ).class
                          }
                        />
                      }
                      label="Jobs"
                      active={activeTab() === "jobs"}
                      onClick={() => harnessStore.setAssistantDetailTab("jobs")}
                    />
                    <TabButton
                      icon={
                        <Logs
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h4,
                              assistantUtilityStyles.w4,
                            ).class
                          }
                        />
                      }
                      label="Log"
                      active={activeTab() === "log"}
                      onClick={() => harnessStore.setAssistantDetailTab("log")}
                    />
                    <TabButton
                      icon={
                        <SquarePen
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h4,
                              assistantUtilityStyles.w4,
                            ).class
                          }
                        />
                      }
                      label="Config"
                      active={activeTab() === "config"}
                      onClick={() =>
                        harnessStore.setAssistantDetailTab("config")
                      }
                    />
                    <TabButton
                      icon={
                        <FlaskConical
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h4,
                              assistantUtilityStyles.w4,
                            ).class
                          }
                        />
                      }
                      label="Learnings"
                      active={activeTab() === "learnings"}
                      onClick={() =>
                        harnessStore.setAssistantDetailTab("learnings")
                      }
                    />
                  </div>
                  <Show when={activeTab() !== "config"}>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.flexCol,
                          assistantUtilityStyles.gap2,
                        ).class
                      }
                    >
                      <Input
                        value={state.assistants.detailSearch}
                        placeholder={`Search assistant ${activeTab()}`}
                        onInput={(event) =>
                          harnessStore.setAssistantPaneFilters({
                            detailSearch: (event.target as HTMLInputElement)
                              .value,
                          })
                        }
                      />
                      <Show when={state.assistants.detailSearch}>
                        <ActionButton
                          tooltip="Clear assistant detail search"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            harnessStore.setAssistantPaneFilters({
                              detailSearch: "",
                            })
                          }
                        >
                          Clear search
                        </ActionButton>
                      </Show>
                    </div>
                  </Show>

                  <Show when={activeTab() === "chat"}>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.minH0,
                          assistantUtilityStyles.flex1,
                          assistantUtilityStyles.flexCol,
                          assistantUtilityStyles.gap4,
                          assistantUtilityStyles.overflowAuto,
                          assistantUtilityStyles.pr1,
                        ).class
                      }
                    >
                      <section
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.minH0,
                            assistantUtilityStyles.flex1,
                            assistantUtilityStyles.flexCol,
                          ).class
                        }
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mb3,
                              assistantUtilityStyles.text0585,
                              assistantUtilityStyles.fontSemibold,
                              assistantUtilityStyles.uppercase,
                              assistantUtilityStyles.tracking018,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          Assistant chat
                        </div>
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.relative,
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.minH72,
                              assistantUtilityStyles.flex1,
                              assistantUtilityStyles.flexCol,
                            ).class
                          }
                        >
                          <VirtualList
                            viewportRef={(element) => {
                              assistantMessageViewport = element;
                              scrollAssistantChatToBottom(true);
                            }}
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.minH0,
                                assistantUtilityStyles.flex1,
                                assistantUtilityStyles.pr2,
                              ).class
                            }
                            contentClass={
                              stylex.attrs(assistantUtilityStyles.wFull).class
                            }
                            itemClass={
                              stylex.attrs(assistantUtilityStyles.pb3).class
                            }
                            data-test-assistant-chat-scroll=""
                            dataTest="assistant-chat-transcript"
                            items={assistantChatRows()}
                            getKey={(row, index) =>
                              row.kind === "message"
                                ? row.message.id
                                : `streaming-${row.index ?? index}`
                            }
                            estimateSize={150}
                            pagination={{
                              kind: "reverse",
                              initialCount: 80,
                              batchSize: 80,
                            }}
                            overscan={6}
                            stickToEnd
                            onScroll={updateAssistantScrollLock}
                          >
                            {(row) =>
                              row.kind === "message" ? (
                                <article
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.rounded2xl,
                                      assistantUtilityStyles.border,
                                      assistantUtilityStyles.p3,
                                      row.message.role === "user"
                                        ? assistantUtilityStyles.borderBorder
                                        : assistantUtilityStyles.borderAccent,
                                      row.message.role === "user"
                                        ? assistantUtilityStyles.bgWhite75
                                        : assistantUtilityStyles.bgPanel,
                                    ).class
                                  }
                                >
                                  <div
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.mb2,
                                        assistantUtilityStyles.text0575,
                                        assistantUtilityStyles.fontSemibold,
                                        assistantUtilityStyles.uppercase,
                                        assistantUtilityStyles.tracking016,
                                        assistantUtilityStyles.textMuted,
                                      ).class
                                    }
                                  >
                                    {row.message.role}
                                  </div>
                                  <MarkdownContent
                                    content={row.message.content}
                                    fileLinks={assistantChatFileLinks()}
                                  />
                                  {renderMessageActionRow(
                                    row.message.createdAt,
                                    <CopyTextButton
                                      value={row.message.content}
                                      tooltip="Copy message"
                                      copiedTitle="Message copied"
                                      copiedDescription="Message copied to clipboard."
                                      size="sm"
                                      variant="ghost"
                                      ariaLabel={`Copy ${row.message.role} message`}
                                    >
                                      Copy
                                    </CopyTextButton>,
                                  )}
                                </article>
                              ) : (
                                <article
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.rounded2xl,
                                      assistantUtilityStyles.border,
                                      assistantUtilityStyles.borderAccent,
                                      assistantUtilityStyles.bgPanel,
                                      assistantUtilityStyles.p3,
                                    ).class
                                  }
                                >
                                  <div
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.mb2,
                                        assistantUtilityStyles.text0575,
                                        assistantUtilityStyles.fontSemibold,
                                        assistantUtilityStyles.uppercase,
                                        assistantUtilityStyles.tracking016,
                                        assistantUtilityStyles.textMuted,
                                      ).class
                                    }
                                  >
                                    assistant
                                  </div>
                                  <MarkdownContent
                                    content={row.content}
                                    fileLinks={assistantChatFileLinks()}
                                  />
                                  {renderMessageActionRow(
                                    row.createdAt,
                                    <CopyTextButton
                                      value={row.content}
                                      tooltip="Copy streaming assistant message"
                                      copiedTitle="Message copied"
                                      copiedDescription="Message copied to clipboard."
                                      size="sm"
                                      variant="ghost"
                                      ariaLabel="Copy streaming assistant message"
                                    >
                                      Copy
                                    </CopyTextButton>,
                                  )}
                                </article>
                              )
                            }
                          </VirtualList>
                          <Show when={!assistantStickToBottom()}>
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.pointerEventsNone,
                                  assistantUtilityStyles.absolute,
                                  assistantUtilityStyles.insetX0,
                                  assistantUtilityStyles.bottom3,
                                  assistantUtilityStyles.flex,
                                  assistantUtilityStyles.justifyCenter,
                                ).class
                              }
                            >
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.pointerEventsAuto,
                                  ).class
                                }
                              >
                                <ActionButton
                                  tooltip="Scroll to latest message"
                                  icon={
                                    <ArrowDown
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h4,
                                          assistantUtilityStyles.w4,
                                        ).class
                                      }
                                    />
                                  }
                                  variant="secondary"
                                  onClick={() =>
                                    scrollAssistantChatToBottom(true)
                                  }
                                >
                                  Scroll to latest
                                </ActionButton>
                              </div>
                            </div>
                          </Show>
                        </div>
                        <ChatComposer
                          class={stylex.attrs(assistantUtilityStyles.mt4).class}
                          textareaRef={(element) => {
                            assistantChatTextarea = element;
                          }}
                          rows="3"
                          value={chatDraft()}
                          placeholder={`Ask ${assistant().name} something.`}
                          textareaClass={
                            stylex.attrs(
                              assistantUtilityStyles.assistantComposerTextarea,
                            ).class
                          }
                          disabled={executionPaused()}
                          disabledReason={executionPauseReason}
                          onInput={setChatDraft}
                          onSubmit={handleSendChat}
                          onClick={handleAssistantComposerClick}
                          leftControls={
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.pointerEventsAuto,
                                  assistantUtilityStyles.flex,
                                  assistantUtilityStyles.flexWrap,
                                  assistantUtilityStyles.itemsCenter,
                                  assistantUtilityStyles.gap1,
                                ).class
                              }
                            >
                              <DropdownControl
                                kind="select"
                                ariaLabel="Select assistant chat mode"
                                icon={
                                  <Split
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.h35,
                                        assistantUtilityStyles.w35,
                                      ).class
                                    }
                                  />
                                }
                                value={assistantChatModeId()}
                                options={assistantChatModeOptions()}
                                onChange={setAssistantChatModeId}
                              />
                              <DropdownControl
                                kind="select"
                                ariaLabel="Select assistant chat model"
                                icon={
                                  <Cpu
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.h35,
                                        assistantUtilityStyles.w35,
                                      ).class
                                    }
                                  />
                                }
                                value={assistantChatExecutionModelId()}
                                options={assistantChatModelOptions()}
                                onChange={setAssistantChatExecutionModelId}
                              />
                              <DropdownControl
                                kind="select"
                                ariaLabel="Select assistant chat reasoning effort"
                                icon={
                                  <Brain
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.h35,
                                        assistantUtilityStyles.w35,
                                      ).class
                                    }
                                  />
                                }
                                value={assistantChatReasoningStrength()}
                                options={assistantChatReasoningOptions()}
                                onChange={(value) =>
                                  setAssistantChatReasoningStrength(
                                    value as ComposerReasoningStrength,
                                  )
                                }
                              />
                              <DropdownControl
                                kind="select"
                                ariaLabel="Select assistant chat fast mode"
                                icon={
                                  <Gauge
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.h35,
                                        assistantUtilityStyles.w35,
                                      ).class
                                    }
                                  />
                                }
                                value={
                                  assistantChatFastMode() ? "true" : "false"
                                }
                                options={assistantChatFastModeOptions()}
                                onChange={(value) =>
                                  setAssistantChatFastMode(value === "true")
                                }
                              />
                            </div>
                          }
                          rightActions={
                            <ActionButton
                              tooltip="Send message to assistant"
                              disabled={executionPaused()}
                              disabledReason={executionPauseReason}
                              icon={
                                <MessageSquare
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.h4,
                                      assistantUtilityStyles.w4,
                                    ).class
                                  }
                                />
                              }
                              variant="ghost"
                              size="icon"
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.pointerEventsAuto,
                                  assistantUtilityStyles.h8,
                                  assistantUtilityStyles.w8,
                                  assistantUtilityStyles.roundedLg,
                                ).class
                              }
                              ariaLabel="Send message to assistant"
                              onClick={handleSendChat}
                            />
                          }
                        />
                      </section>

                      <section
                        class={
                          stylex.attrs(assistantUtilityStyles.shrink0).class
                        }
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.text0585,
                              assistantUtilityStyles.fontSemibold,
                              assistantUtilityStyles.uppercase,
                              assistantUtilityStyles.tracking018,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          Working memory
                        </div>
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt3,
                              assistantUtilityStyles.grid,
                              assistantUtilityStyles.maxH32,
                              assistantUtilityStyles.gap4,
                              assistantUtilityStyles.overflowAuto,
                              assistantUtilityStyles.borderL2,
                              assistantUtilityStyles.borderBorder,
                              assistantUtilityStyles.py2,
                              assistantUtilityStyles.pl4,
                              assistantUtilityStyles.text0675,
                              assistantUtilityStyles.leading5,
                              assistantUtilityStyles.textMuted,
                              assistantUtilityStyles.lgGridColsMemory,
                            ).class
                          }
                        >
                          <div
                            class={
                              stylex.attrs(assistantUtilityStyles.minW0).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.fontSemibold,
                                  assistantUtilityStyles.textForeground,
                                ).class
                              }
                            >
                              Summary
                            </div>
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt1,
                                  assistantUtilityStyles.whitespacePreWrap,
                                ).class
                              }
                            >
                              <FileLinkedText
                                text={
                                  selectedThread()?.memorySummary?.content ??
                                  "No rolled summary yet."
                                }
                                fileLinks={assistantChatFileLinks()}
                              />
                            </div>
                          </div>
                          <div
                            class={
                              stylex.attrs(assistantUtilityStyles.minW0).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.fontSemibold,
                                  assistantUtilityStyles.textForeground,
                                ).class
                              }
                            >
                              Active todos
                            </div>
                            <ul
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt1,
                                  assistantUtilityStyles.spaceY1,
                                ).class
                              }
                            >
                              <For
                                each={visibleTodos()
                                  .filter((todo) => isActiveTodo(todo.state))
                                  .slice(0, 8)}
                              >
                                {(todo) => (
                                  <li>
                                    <FileLinkedText
                                      text={`${todo.state} | ${todo.title}`}
                                      fileLinks={assistantChatFileLinks()}
                                    />
                                  </li>
                                )}
                              </For>
                            </ul>
                          </div>
                        </div>
                      </section>
                    </div>
                  </Show>

                  <Show when={activeTab() === "todos"}>
                    <section
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.minH0,
                          assistantUtilityStyles.flex1,
                          assistantUtilityStyles.flexCol,
                        ).class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.mb4,
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.gap2,
                          ).class
                        }
                      >
                        <Textarea
                          rows="2"
                          value={newTodoTitle()}
                          onInput={(event) =>
                            setNewTodoTitle(event.currentTarget.value)
                          }
                          placeholder="Add manual todo."
                        />
                        <ActionButton
                          tooltip="Add todo to assistant list"
                          icon={
                            <Plus
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h4,
                                  assistantUtilityStyles.w4,
                                ).class
                              }
                            />
                          }
                          onClick={handleAddTodo}
                        >
                          Add
                        </ActionButton>
                      </div>
                      <VirtualList
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.minH0,
                            assistantUtilityStyles.flex1,
                            assistantUtilityStyles.pr2,
                          ).class
                        }
                        contentClass={
                          stylex.attrs(assistantUtilityStyles.wFull).class
                        }
                        itemClass={
                          stylex.attrs(assistantUtilityStyles.pb3).class
                        }
                        items={visibleTodos()}
                        getKey={(todo) => todo.id}
                        estimateSize={128}
                        pagination={{
                          kind: "forward",
                          initialCount: 60,
                          batchSize: 60,
                        }}
                      >
                        {(todo) => (
                          <article
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.borderL2,
                                assistantUtilityStyles.py3,
                                assistantUtilityStyles.pl4,
                                assistantUtilityStyles.pr2,
                                todo.state === "completed"
                                  ? assistantPanelStyles.borderEmerald
                                  : todo.state === "failed" ||
                                      todo.state === "cancelled"
                                    ? assistantPanelStyles.borderRose
                                    : todo.state === "blocked"
                                      ? assistantPanelStyles.borderAmber
                                      : todo.state === "in-progress"
                                        ? assistantPanelStyles.borderSky
                                        : assistantUtilityStyles.borderBorder,
                              ).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.flex,
                                  assistantUtilityStyles.flexWrap,
                                  assistantUtilityStyles.itemsStart,
                                  assistantUtilityStyles.justifyBetween,
                                  assistantUtilityStyles.gap3,
                                ).class
                              }
                            >
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.minW0,
                                    assistantUtilityStyles.flex1,
                                  ).class
                                }
                              >
                                <div
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.text075,
                                      assistantUtilityStyles.fontSemibold,
                                      assistantUtilityStyles.textForeground,
                                    ).class
                                  }
                                >
                                  <FileLinkedText
                                    text={todo.title}
                                    fileLinks={assistantChatFileLinks()}
                                  />
                                </div>
                                <Show when={todo.description}>
                                  {(description) => (
                                    <div
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.mt1,
                                          assistantUtilityStyles.text0675,
                                          assistantUtilityStyles.leading5,
                                          assistantUtilityStyles.textMuted,
                                        ).class
                                      }
                                    >
                                      <FileLinkedText
                                        text={description()}
                                        fileLinks={assistantChatFileLinks()}
                                      />
                                    </div>
                                  )}
                                </Show>
                                <Show when={todo.blockerReason}>
                                  {(reason) => (
                                    <div
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.mt1,
                                          assistantUtilityStyles.text0625,
                                          assistantUtilityStyles.textAmber900,
                                        ).class
                                      }
                                    >
                                      <FileLinkedText
                                        text={`Blocker: ${reason()}`}
                                        fileLinks={assistantChatFileLinks()}
                                      />
                                    </div>
                                  )}
                                </Show>
                                <Show when={todo.workTarget}>
                                  {(target) => (
                                    <div
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.mt1,
                                          assistantUtilityStyles.text0625,
                                          assistantUtilityStyles.textMuted,
                                        ).class
                                      }
                                    >
                                      <FileLinkedText
                                        text={`Target: ${target()}`}
                                        fileLinks={assistantChatFileLinks()}
                                      />
                                    </div>
                                  )}
                                </Show>
                              </div>
                              <div
                                class={
                                  stylex.attrs(
                                    assistantPanelStyles.secondaryAction,
                                    assistantUtilityStyles.flex,
                                    assistantUtilityStyles.shrink0,
                                    assistantUtilityStyles.itemsCenter,
                                    assistantUtilityStyles.gap2,
                                  ).class
                                }
                              >
                                <ActionButton
                                  tooltip="Move assistant todo up"
                                  ariaLabel={`Move ${todo.title} up`}
                                  icon={
                                    <ArrowUp
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h4,
                                          assistantUtilityStyles.w4,
                                        ).class
                                      }
                                    />
                                  }
                                  size="icon"
                                  variant="ghost"
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.h8,
                                      assistantUtilityStyles.w8,
                                    ).class
                                  }
                                  disabled={selectedTodos()[0]?.id === todo.id}
                                  disabledReason="Todo is already first"
                                  onClick={() => reorderTodo(todo, -1)}
                                />
                                <ActionButton
                                  tooltip="Move assistant todo down"
                                  ariaLabel={`Move ${todo.title} down`}
                                  icon={
                                    <ArrowDown
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h4,
                                          assistantUtilityStyles.w4,
                                        ).class
                                      }
                                    />
                                  }
                                  size="icon"
                                  variant="ghost"
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.h8,
                                      assistantUtilityStyles.w8,
                                    ).class
                                  }
                                  disabled={
                                    selectedTodos()[selectedTodos().length - 1]
                                      ?.id === todo.id
                                  }
                                  disabledReason="Todo is already last"
                                  onClick={() => reorderTodo(todo, 1)}
                                />
                                <DropdownControl
                                  kind="select"
                                  ariaLabel={`Select ${todo.title} state`}
                                  icon={
                                    <ClipboardList
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h35,
                                          assistantUtilityStyles.w35,
                                        ).class
                                      }
                                    />
                                  }
                                  size="md"
                                  class={
                                    stylex.attrs(assistantUtilityStyles.w40)
                                      .class
                                  }
                                  value={todo.state}
                                  options={assistantTodoStateOptions}
                                  onChange={(value) =>
                                    updateTodo(todo, {
                                      state: value as AssistantTodo["state"],
                                    })
                                  }
                                />
                                <ActionButton
                                  tooltip="Delete assistant todo"
                                  ariaLabel={`Delete ${todo.title}`}
                                  icon={
                                    <Trash2
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h4,
                                          assistantUtilityStyles.w4,
                                        ).class
                                      }
                                    />
                                  }
                                  size="icon"
                                  variant="ghost"
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.h8,
                                      assistantUtilityStyles.w8,
                                      assistantUtilityStyles.textDanger,
                                      assistantUtilityStyles.hoverBgPanel,
                                    ).class
                                  }
                                  onClick={() => deleteTodo(todo)}
                                />
                              </div>
                            </div>
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt2,
                                  assistantUtilityStyles.grid,
                                  assistantUtilityStyles.gap2,
                                  assistantUtilityStyles.mdGridColsTodo,
                                ).class
                              }
                            >
                              <DropdownControl
                                kind="select"
                                ariaLabel={`Select ${todo.title} work kind`}
                                icon={
                                  <ClipboardList
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.h35,
                                        assistantUtilityStyles.w35,
                                      ).class
                                    }
                                  />
                                }
                                size="md"
                                value={todo.workKind}
                                options={assistantTodoWorkKindOptions}
                                onChange={(value) =>
                                  updateTodo(todo, {
                                    workKind:
                                      value as AssistantTodo["workKind"],
                                  })
                                }
                              />
                              <Input
                                value={todo.workTarget ?? ""}
                                placeholder="Work target"
                                onChange={(event) =>
                                  updateTodo(todo, {
                                    workTarget:
                                      event.currentTarget.value.trim() ||
                                      undefined,
                                  })
                                }
                              />
                            </div>
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt2,
                                  assistantUtilityStyles.flex,
                                  assistantUtilityStyles.flexWrap,
                                  assistantUtilityStyles.itemsCenter,
                                  assistantUtilityStyles.gap2,
                                  assistantUtilityStyles.text0575,
                                  assistantUtilityStyles.uppercase,
                                  assistantUtilityStyles.tracking014,
                                  assistantUtilityStyles.textMuted,
                                ).class
                              }
                            >
                              <StatusChip tone={todoStateTone(todo.state)}>
                                {todo.state}
                              </StatusChip>
                              <StatusChip
                                tone={todoWorkKindTone(todo.workKind)}
                              >
                                {todo.workKind}
                              </StatusChip>
                              <span>
                                {todo.source ?? "assistant"} | sort{" "}
                                <span
                                  class={
                                    stylex.attrs(
                                      rightAlignedNumbersEnabled() &&
                                        assistantPanelStyles.numericFlagged,
                                    ).class
                                  }
                                >
                                  {todo.sortOrder}
                                </span>
                              </span>
                            </div>
                          </article>
                        )}
                      </VirtualList>
                    </section>
                  </Show>

                  <Show when={activeTab() === "questions"}>
                    <section
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.grid,
                          assistantUtilityStyles.minH0,
                          assistantUtilityStyles.flex1,
                          assistantUtilityStyles.gap4,
                          assistantUtilityStyles.lgGridCols2,
                        ).class
                      }
                    >
                      <QuestionColumn
                        title="Pending questions"
                        emptyMessage="No pending questions. This assistant continues autonomously unless its policy requires your input."
                        questions={visibleQuestions().filter(
                          (question) => question.status === "pending",
                        )}
                        disabled={executionPaused()}
                        disabledReason={executionPauseReason}
                        questionAnswers={questionAnswers()}
                        onAnswerInput={(questionId, value) =>
                          setQuestionAnswers((current) => ({
                            ...current,
                            [questionId]: value,
                          }))
                        }
                        onAnswer={answerQuestion}
                        fileLinks={assistantChatFileLinks()}
                      />
                      <QuestionColumn
                        title="Resolved questions"
                        emptyMessage="No resolved questions yet."
                        questions={visibleQuestions().filter(
                          (question) => question.status === "answered",
                        )}
                        disabled={false}
                        disabledReason={undefined}
                        questionAnswers={questionAnswers()}
                        onAnswerInput={() => undefined}
                        onAnswer={() => undefined}
                        fileLinks={assistantChatFileLinks()}
                      />
                    </section>
                  </Show>

                  <Show when={activeTab() === "jobs"}>
                    <section
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.grid,
                          assistantUtilityStyles.minH0,
                          assistantUtilityStyles.flex1,
                          assistantUtilityStyles.gap4,
                          assistantUtilityStyles.lgGridColsSplit,
                        ).class
                      }
                    >
                      <div
                        class={stylex.attrs(assistantUtilityStyles.minW0).class}
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mb3,
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.itemsCenter,
                              assistantUtilityStyles.justifyBetween,
                              assistantUtilityStyles.gap3,
                            ).class
                          }
                        >
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.text0585,
                                assistantUtilityStyles.fontSemibold,
                                assistantUtilityStyles.uppercase,
                                assistantUtilityStyles.tracking018,
                                assistantUtilityStyles.textMuted,
                              ).class
                            }
                          >
                            Assistant jobs
                          </div>
                          <ActionButton
                            tooltip="Create background job for this assistant"
                            icon={
                              <Plus
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h4,
                                    assistantUtilityStyles.w4,
                                  ).class
                                }
                              />
                            }
                            onClick={openAssistantJobEditor}
                          >
                            New job
                          </ActionButton>
                        </div>
                        <VirtualList
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h120,
                              assistantUtilityStyles.pr2,
                              assistantUtilityStyles.lgHFull,
                            ).class
                          }
                          contentClass={
                            stylex.attrs(assistantUtilityStyles.wFull).class
                          }
                          itemClass={
                            stylex.attrs(assistantUtilityStyles.pb3).class
                          }
                          items={visibleJobs()}
                          getKey={(job) => job.id}
                          estimateSize={120}
                          pagination={{
                            kind: "forward",
                            initialCount: 60,
                            batchSize: 60,
                          }}
                          empty={
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.borderL2,
                                  assistantUtilityStyles.borderDashed,
                                  assistantUtilityStyles.borderBorder,
                                  assistantUtilityStyles.py3,
                                  assistantUtilityStyles.pl4,
                                ).class
                              }
                            >
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.text0675,
                                    assistantUtilityStyles.textMuted,
                                  ).class
                                }
                              >
                                No assistant-owned background jobs.
                              </div>
                              <ActionButton
                                tooltip="Create default research, todo maintenance, and implementation jobs"
                                icon={
                                  <Plus
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.h35,
                                        assistantUtilityStyles.w35,
                                      ).class
                                    }
                                  />
                                }
                                size="sm"
                                variant="secondary"
                                class={
                                  stylex.attrs(assistantUtilityStyles.mt3).class
                                }
                                onClick={bootstrapAssistantJobs}
                              >
                                Bootstrap jobs
                              </ActionButton>
                            </div>
                          }
                        >
                          {(job) => (
                            <article
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.cursorPointer,
                                  assistantUtilityStyles.overflowHidden,
                                  assistantUtilityStyles.borderL2,
                                  assistantUtilityStyles.py3,
                                  assistantUtilityStyles.pl4,
                                  assistantUtilityStyles.pr2,
                                  assistantUtilityStyles.transition,
                                  assistantUtilityStyles.hoverBorderAccentStrong,
                                  assistantPanelStyles.sourceCard,
                                  job.status === "enabled"
                                    ? assistantPanelStyles.borderEmerald
                                    : assistantPanelStyles.borderSlate,
                                ).class
                              }
                              role="button"
                              tabIndex={0}
                              onClick={() => openAssistantBackgroundJob(job.id)}
                              onKeyDown={(event) =>
                                handleSourceCardKeyDown(event, () =>
                                  openAssistantBackgroundJob(job.id),
                                )
                              }
                            >
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.flex,
                                    assistantUtilityStyles.itemsStart,
                                    assistantUtilityStyles.justifyBetween,
                                    assistantUtilityStyles.gap3,
                                  ).class
                                }
                              >
                                <div
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.breakWords,
                                      assistantUtilityStyles.text075,
                                      assistantUtilityStyles.fontSemibold,
                                      assistantUtilityStyles.textForeground,
                                    ).class
                                  }
                                >
                                  {job.name}
                                </div>
                                <StatusChip
                                  tone={backgroundJobStatusTone(job.status)}
                                  class={
                                    stylex.attrs(assistantUtilityStyles.shrink0)
                                      .class
                                  }
                                >
                                  {job.status}
                                </StatusChip>
                              </div>
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.mt1,
                                    assistantUtilityStyles.text0575,
                                    assistantUtilityStyles.uppercase,
                                    assistantUtilityStyles.tracking014,
                                    assistantUtilityStyles.textMuted,
                                  ).class
                                }
                              >
                                {job.kind}
                              </div>
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.mt2,
                                    assistantUtilityStyles.breakWords,
                                    assistantUtilityStyles.text0675,
                                    assistantUtilityStyles.leading5,
                                    assistantUtilityStyles.textMuted,
                                    assistantUtilityStyles.wrapAnywhere,
                                  ).class
                                }
                              >
                                <div>
                                  <FileLinkedText
                                    text={job.description ?? job.scheduleInput}
                                    fileLinks={assistantChatFileLinks()}
                                  />
                                </div>
                                <Show when={formatFailureTracking(job)}>
                                  {(line) => (
                                    <div
                                      class={
                                        stylex.attrs(assistantUtilityStyles.mt1)
                                          .class
                                      }
                                    >
                                      <FileLinkedText
                                        text={line()}
                                        fileLinks={assistantChatFileLinks()}
                                      />
                                    </div>
                                  )}
                                </Show>
                              </div>
                            </article>
                          )}
                        </VirtualList>
                      </div>
                      <div
                        class={stylex.attrs(assistantUtilityStyles.minW0).class}
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mb3,
                              assistantUtilityStyles.text0585,
                              assistantUtilityStyles.fontSemibold,
                              assistantUtilityStyles.uppercase,
                              assistantUtilityStyles.tracking018,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          Recent runs
                        </div>
                        <VirtualList
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h120,
                              assistantUtilityStyles.pr2,
                              assistantUtilityStyles.lgHFull,
                            ).class
                          }
                          contentClass={
                            stylex.attrs(assistantUtilityStyles.wFull).class
                          }
                          itemClass={
                            stylex.attrs(assistantUtilityStyles.pb3).class
                          }
                          items={visibleRuns()}
                          getKey={(run) => run.id}
                          estimateSize={145}
                          pagination={{
                            kind: "forward",
                            initialCount: 60,
                            batchSize: 60,
                          }}
                        >
                          {(run) => (
                            <article
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.cursorPointer,
                                  assistantUtilityStyles.overflowHidden,
                                  assistantUtilityStyles.borderL2,
                                  assistantUtilityStyles.py3,
                                  assistantUtilityStyles.pl4,
                                  assistantUtilityStyles.pr2,
                                  assistantUtilityStyles.transition,
                                  assistantUtilityStyles.hoverBorderAccentStrong,
                                  assistantPanelStyles.sourceCard,
                                  run.status === "succeeded"
                                    ? assistantPanelStyles.borderEmerald
                                    : run.status === "failed" ||
                                        run.status === "cancelled"
                                      ? assistantPanelStyles.borderRose
                                      : run.status === "awaiting-approval" ||
                                          run.status ===
                                            "awaiting-user-input" ||
                                          run.status === "partial-complete"
                                        ? assistantPanelStyles.borderAmber
                                        : run.status === "running"
                                          ? assistantPanelStyles.borderSky
                                          : run.status === "queued"
                                            ? assistantPanelStyles.borderSlate
                                            : assistantPanelStyles.borderStone,
                                ).class
                              }
                              role="button"
                              tabIndex={0}
                              onClick={() => openAssistantBackgroundRun(run)}
                              onKeyDown={(event) =>
                                handleSourceCardKeyDown(event, () =>
                                  openAssistantBackgroundRun(run),
                                )
                              }
                            >
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.flex,
                                    assistantUtilityStyles.itemsCenter,
                                    assistantUtilityStyles.justifyBetween,
                                    assistantUtilityStyles.gap3,
                                  ).class
                                }
                              >
                                <div
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.minW0,
                                      assistantUtilityStyles.breakWords,
                                      assistantUtilityStyles.text075,
                                      assistantUtilityStyles.fontSemibold,
                                      assistantUtilityStyles.textForeground,
                                      assistantUtilityStyles.wrapAnywhere,
                                    ).class
                                  }
                                >
                                  <FileLinkedText
                                    text={run.summary ?? run.id}
                                    fileLinks={assistantChatFileLinks()}
                                  />
                                </div>
                                <StatusChip
                                  tone={backgroundRunStatusTone(run.status)}
                                  class={
                                    stylex.attrs(assistantUtilityStyles.shrink0)
                                      .class
                                  }
                                >
                                  {run.status}
                                </StatusChip>
                              </div>
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.mt2,
                                    assistantUtilityStyles.breakWords,
                                    assistantUtilityStyles.text0675,
                                    assistantUtilityStyles.leading5,
                                    assistantUtilityStyles.textMuted,
                                    assistantUtilityStyles.wrapAnywhere,
                                  ).class
                                }
                              >
                                <div>
                                  <FileLinkedText
                                    text={
                                      run.failureMessage ??
                                      `Triggered by ${run.triggerSource}`
                                    }
                                    fileLinks={assistantChatFileLinks()}
                                  />
                                </div>
                                <Show when={run.failureCategory}>
                                  {(category) => (
                                    <div
                                      class={
                                        stylex.attrs(assistantUtilityStyles.mt1)
                                          .class
                                      }
                                    >
                                      Failure category:{" "}
                                      {formatFailureCategory(category())}
                                    </div>
                                  )}
                                </Show>
                                <Show when={formatPromptStats(run.promptStats)}>
                                  {(stats) => (
                                    <div
                                      class={
                                        stylex.attrs(assistantUtilityStyles.mt1)
                                          .class
                                      }
                                    >
                                      Prompt: {stats()}
                                    </div>
                                  )}
                                </Show>
                                <div
                                  class={
                                    stylex.attrs(assistantUtilityStyles.mt1)
                                      .class
                                  }
                                >
                                  Updated {formatShortTimestamp(run.updatedAt)}
                                </div>
                              </div>
                            </article>
                          )}
                        </VirtualList>
                      </div>
                    </section>
                  </Show>

                  <Show when={activeTab() === "log"}>
                    <section
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.minH0,
                          assistantUtilityStyles.flex1,
                          assistantUtilityStyles.flexCol,
                        ).class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.mb3,
                            assistantUtilityStyles.text0585,
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.uppercase,
                            assistantUtilityStyles.tracking018,
                            assistantUtilityStyles.textMuted,
                          ).class
                        }
                      >
                        Execution log
                      </div>
                      <ExecutionLog
                        entries={selectedExecutionLogs()}
                        emptyMessage="No execution log yet."
                        detailEyebrow="Assistant log details"
                        selectedEntryId={state.assistants.selectedLogDetailsId}
                        onSelectedEntryIdChange={
                          harnessStore.setAssistantLogDetailsId
                        }
                        rowVariant="flat"
                        fileLinks={assistantChatFileLinks()}
                        onEntrySourceClick={openAssistantLogSource}
                      />
                    </section>
                  </Show>

                  <Show when={activeTab() === "config"}>
                    <section
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.grid,
                          assistantUtilityStyles.minH0,
                          assistantUtilityStyles.flex1,
                          assistantUtilityStyles.gap4,
                          assistantUtilityStyles.lgGridCols2,
                        ).class
                      }
                    >
                      <ConfigCard title="Role">
                        <FileLinkedText
                          text={assistant().description ?? "No description."}
                          fileLinks={assistantChatFileLinks()}
                        />
                      </ConfigCard>
                      <ConfigCard title="Routing">
                        <div>Agent: {assistant().agentId}</div>
                        <div>
                          Provider: {assistant().providerBrand ?? "current"}
                        </div>
                        <div>Mode: {assistant().modeId ?? "default"}</div>
                        <div>
                          Execution model:{" "}
                          {assistant().executionModelId ?? "default"}
                        </div>
                        <div>
                          Effort:{" "}
                          {formatReasoningStrengthLabel(
                            assistant().reasoningStrength ??
                              DEFAULT_COMPOSER_REASONING_STRENGTH,
                          )}
                        </div>
                        <div>
                          Fast mode: {assistant().fastMode ? "on" : "off"}
                        </div>
                        <div>Scope: {assistant().scope}</div>
                      </ConfigCard>
                      <ConfigCard title="Personality prompt">
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.whitespacePreWrap,
                            ).class
                          }
                        >
                          <FileLinkedText
                            text={assistant().personalityPrompt}
                            fileLinks={assistantChatFileLinks()}
                          />
                        </div>
                      </ConfigCard>
                      <ConfigCard title="Job prompt">
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.whitespacePreWrap,
                            ).class
                          }
                        >
                          <FileLinkedText
                            text={assistant().jobPrompt}
                            fileLinks={assistantChatFileLinks()}
                          />
                        </div>
                      </ConfigCard>
                      <ConfigCard title="Linked assets">
                        <Show
                          when={selectedAssetRefs().length > 0}
                          fallback={<div>No asset refs.</div>}
                        >
                          <div
                            class={
                              stylex.attrs(assistantUtilityStyles.spaceY2).class
                            }
                          >
                            <For each={selectedAssetRefs()}>
                              {(assetRef) => (
                                <div
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.borderL2,
                                      assistantUtilityStyles.borderBorder,
                                      assistantUtilityStyles.py2,
                                      assistantUtilityStyles.pl3,
                                    ).class
                                  }
                                >
                                  <div
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.text0625,
                                        assistantUtilityStyles.uppercase,
                                        assistantUtilityStyles.tracking014,
                                        assistantUtilityStyles.textMuted,
                                      ).class
                                    }
                                  >
                                    {assetRef.kind}
                                  </div>
                                  <div
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.fontSemibold,
                                        assistantUtilityStyles.textForeground,
                                      ).class
                                    }
                                  >
                                    {assetRef.label}
                                  </div>
                                  <div
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.breakAll,
                                        assistantUtilityStyles.text0675,
                                        assistantUtilityStyles.textMuted,
                                      ).class
                                    }
                                  >
                                    <FileLinkedText
                                      text={assetRef.value}
                                      fileLinks={assistantChatFileLinks()}
                                    />
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </ConfigCard>
                    </section>
                  </Show>

                  <Show when={activeTab() === "learnings"}>
                    <section
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.minH0,
                          assistantUtilityStyles.flex1,
                          assistantUtilityStyles.flexCol,
                        ).class
                      }
                    >
                      <VirtualList
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.minH0,
                            assistantUtilityStyles.flex1,
                            assistantUtilityStyles.pr2,
                          ).class
                        }
                        contentClass={
                          stylex.attrs(assistantUtilityStyles.wFull).class
                        }
                        itemClass={
                          stylex.attrs(assistantUtilityStyles.pb3).class
                        }
                        items={filteredLearnings()}
                        getKey={(learning) => learning.id}
                        estimateSize={115}
                        pagination={{
                          kind: "forward",
                          initialCount: 50,
                          batchSize: 50,
                        }}
                        empty={
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.borderL2,
                                assistantUtilityStyles.borderDashed,
                                assistantUtilityStyles.borderBorder,
                                assistantUtilityStyles.py3,
                                assistantUtilityStyles.pl4,
                                assistantUtilityStyles.text075,
                                assistantUtilityStyles.textMuted,
                              ).class
                            }
                          >
                            No learnings yet.
                          </div>
                        }
                      >
                        {(learning) => (
                          <article
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.borderL2,
                                assistantUtilityStyles.borderBorder,
                                assistantUtilityStyles.py3,
                                assistantUtilityStyles.pl4,
                                assistantUtilityStyles.pr2,
                              ).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.flex,
                                  assistantUtilityStyles.itemsStart,
                                  assistantUtilityStyles.justifyBetween,
                                  assistantUtilityStyles.gap3,
                                ).class
                              }
                            >
                              <div
                                class={
                                  stylex.attrs(assistantUtilityStyles.minW0)
                                    .class
                                }
                              >
                                <div
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.text075,
                                      assistantUtilityStyles.fontSemibold,
                                      assistantUtilityStyles.leading5,
                                      assistantUtilityStyles.textForeground,
                                    ).class
                                  }
                                >
                                  <FileLinkedText
                                    text={learning.summary}
                                    fileLinks={assistantChatFileLinks()}
                                  />
                                </div>
                              </div>
                              <div
                                class={
                                  stylex.attrs(
                                    assistantPanelStyles.secondaryAction,
                                    assistantUtilityStyles.flex,
                                    assistantUtilityStyles.shrink0,
                                    assistantUtilityStyles.itemsCenter,
                                    assistantUtilityStyles.gap2,
                                  ).class
                                }
                              >
                                <StatusChip
                                  tone={
                                    learning.confidence === "high"
                                      ? "success"
                                      : learning.confidence === "low"
                                        ? "neutral"
                                        : "info"
                                  }
                                >
                                  {learning.confidence}
                                </StatusChip>
                                <ActionButton
                                  tooltip="Move assistant learning up"
                                  ariaLabel={`Move learning ${learning.summary} up`}
                                  icon={
                                    <ArrowUp
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h4,
                                          assistantUtilityStyles.w4,
                                        ).class
                                      }
                                    />
                                  }
                                  size="icon"
                                  variant="ghost"
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.h8,
                                      assistantUtilityStyles.w8,
                                    ).class
                                  }
                                  disabled={
                                    selectedLearnings()[0]?.id === learning.id
                                  }
                                  disabledReason="Learning is already first"
                                  onClick={() => reorderLearning(learning, -1)}
                                />
                                <ActionButton
                                  tooltip="Move assistant learning down"
                                  ariaLabel={`Move learning ${learning.summary} down`}
                                  icon={
                                    <ArrowDown
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h4,
                                          assistantUtilityStyles.w4,
                                        ).class
                                      }
                                    />
                                  }
                                  size="icon"
                                  variant="ghost"
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.h8,
                                      assistantUtilityStyles.w8,
                                    ).class
                                  }
                                  disabled={
                                    selectedLearnings()[
                                      selectedLearnings().length - 1
                                    ]?.id === learning.id
                                  }
                                  disabledReason="Learning is already last"
                                  onClick={() => reorderLearning(learning, 1)}
                                />
                                <ActionButton
                                  tooltip="Delete assistant learning"
                                  ariaLabel={`Delete learning ${learning.summary}`}
                                  icon={
                                    <Trash2
                                      class={
                                        stylex.attrs(
                                          assistantUtilityStyles.h4,
                                          assistantUtilityStyles.w4,
                                        ).class
                                      }
                                    />
                                  }
                                  size="icon"
                                  variant="ghost"
                                  class={
                                    stylex.attrs(
                                      assistantUtilityStyles.h8,
                                      assistantUtilityStyles.w8,
                                      assistantUtilityStyles.textDanger,
                                      assistantUtilityStyles.hoverBgPanel,
                                    ).class
                                  }
                                  onClick={() => deleteLearning(learning)}
                                />
                              </div>
                            </div>
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mt2,
                                  assistantUtilityStyles.text0675,
                                  assistantUtilityStyles.leading5,
                                  assistantUtilityStyles.textMuted,
                                ).class
                              }
                            >
                              <div>
                                <FileLinkedText
                                  text={`Source: ${learning.source}`}
                                  fileLinks={assistantChatFileLinks()}
                                />
                              </div>
                              <div>
                                {formatShortTimestamp(learning.createdAt)}
                              </div>
                            </div>
                          </article>
                        )}
                      </VirtualList>
                    </section>
                  </Show>
                </div>
              )}
            </Show>
          </section>
        </Show>
      </div>
      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            open={true}
            x={menu().x}
            y={menu().y}
            ariaLabel={menu().label}
            actions={menu().actions}
            onClose={() => setContextMenu(undefined)}
          />
        )}
      </Show>
    </LeftPaneShell>
  );
}

function TabButton(props: {
  icon: JSX.Element;
  label: Capitalize<AssistantDetailTab>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      tooltip={`Open ${props.label.toLowerCase()} tab`}
      role="tab"
      aria-selected={props.active}
      tabIndex={props.active ? 0 : -1}
      variant="ghost"
      size="sm"
      class={
        stylex.attrs(
          assistantPanelStyles.tab,
          props.active
            ? assistantPanelStyles.tabActive
            : assistantPanelStyles.tabIdle,
        ).class
      }
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </Button>
  );
}

function AssistantFact(props: { label: string; children: JSX.Element }) {
  return (
    <div
      class={
        stylex.attrs(
          assistantUtilityStyles.minW0,
          assistantUtilityStyles.breakWords,
          assistantUtilityStyles.wrapAnywhere,
        ).class
      }
    >
      <span
        class={
          stylex.attrs(
            assistantUtilityStyles.fontSemibold,
            assistantUtilityStyles.textForeground,
          ).class
        }
      >
        {props.label}:{" "}
      </span>
      <span>{props.children}</span>
    </div>
  );
}

function assistantRunStateTone(
  runState: Assistant["runState"],
): StatusChipTone {
  return runState === "active" ? "success" : "warning";
}

function assistantBootstrapTone(
  state: Assistant["bootstrapState"],
): StatusChipTone {
  if (state === "completed") {
    return "success";
  }
  if (state === "failed") {
    return "danger";
  }
  if (state === "running") {
    return "info";
  }
  return "warning";
}

function todoStateTone(state: AssistantTodo["state"]): StatusChipTone {
  switch (state) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "blocked":
      return "warning";
    case "in-progress":
      return "info";
    case "pending":
      return "neutral";
  }
}

function todoWorkKindTone(workKind: AssistantTodo["workKind"]): StatusChipTone {
  switch (workKind) {
    case "app-code":
      return "success";
    case "automation-code":
      return "info";
    case "documentation":
      return "accent";
    case "research":
      return "info";
    case "blocked":
      return "warning";
    case "unspecified":
      return "neutral";
  }
}

function questionStatusTone(
  status: AssistantQuestion["status"],
): StatusChipTone {
  switch (status) {
    case "answered":
      return "success";
    case "pending":
      return "warning";
    case "deferred":
      return "info";
    case "dismissed":
      return "neutral";
  }
}

function backgroundJobStatusTone(
  status: BackgroundJob["status"],
): StatusChipTone {
  return status === "enabled" ? "success" : "neutral";
}

function backgroundRunStatusTone(
  status: BackgroundJobRun["status"],
): StatusChipTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "partial-complete":
      return "warning";
    case "failed":
    case "cancelled":
      return "danger";
    case "awaiting-approval":
    case "awaiting-user-input":
      return "warning";
    case "running":
      return "info";
    case "queued":
      return "neutral";
    case "skipped":
      return "neutral";
  }
}

function QuestionColumn(props: {
  title: string;
  emptyMessage: string;
  questions: AssistantQuestion[];
  disabled: boolean;
  disabledReason?: string;
  questionAnswers: Record<string, string>;
  onAnswerInput: (questionId: string, value: string) => void;
  onAnswer: (question: AssistantQuestion, answerText?: string) => void;
  fileLinks?: FileLinkConfig;
}) {
  return (
    <section
      class={
        stylex.attrs(
          assistantUtilityStyles.flex,
          assistantUtilityStyles.minH0,
          assistantUtilityStyles.flexCol,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.mb3,
            assistantUtilityStyles.text0585,
            assistantUtilityStyles.fontSemibold,
            assistantUtilityStyles.uppercase,
            assistantUtilityStyles.tracking018,
            assistantUtilityStyles.textMuted,
          ).class
        }
      >
        {props.title}
      </div>
      <VirtualList
        class={
          stylex.attrs(
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.pr2,
          ).class
        }
        contentClass={stylex.attrs(assistantUtilityStyles.wFull).class}
        itemClass={stylex.attrs(assistantUtilityStyles.pb3).class}
        items={props.questions}
        getKey={(question) => question.id}
        estimateSize={220}
        pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
        empty={
          <div
            class={
              stylex.attrs(
                assistantUtilityStyles.borderL2,
                assistantUtilityStyles.borderDashed,
                assistantUtilityStyles.borderBorder,
                assistantUtilityStyles.py3,
                assistantUtilityStyles.pl4,
                assistantUtilityStyles.text0675,
                assistantUtilityStyles.leading5,
                assistantUtilityStyles.textMuted,
              ).class
            }
          >
            {props.emptyMessage}
          </div>
        }
      >
        {(question) => (
          <article
            class={
              stylex.attrs(
                assistantUtilityStyles.borderL2,
                assistantUtilityStyles.py3,
                assistantUtilityStyles.pl4,
                assistantUtilityStyles.pr2,
                question.status === "answered"
                  ? assistantPanelStyles.borderEmerald
                  : question.status === "pending"
                    ? assistantPanelStyles.borderAmber
                    : question.status === "deferred"
                      ? assistantPanelStyles.borderSky
                      : assistantPanelStyles.borderSlate,
              ).class
            }
          >
            <div
              class={
                stylex.attrs(
                  assistantUtilityStyles.text075,
                  assistantUtilityStyles.fontSemibold,
                  assistantUtilityStyles.textForeground,
                ).class
              }
            >
              <FileLinkedText
                text={question.prompt}
                fileLinks={props.fileLinks}
              />
            </div>
            <div
              class={
                stylex.attrs(
                  assistantUtilityStyles.mt1,
                  assistantUtilityStyles.flex,
                  assistantUtilityStyles.flexWrap,
                  assistantUtilityStyles.itemsCenter,
                  assistantUtilityStyles.gap2,
                  assistantUtilityStyles.text0575,
                  assistantUtilityStyles.uppercase,
                  assistantUtilityStyles.tracking014,
                  assistantUtilityStyles.textMuted,
                ).class
              }
            >
              <StatusChip tone={questionStatusTone(question.status)}>
                {question.status}
              </StatusChip>
              <span>{formatShortTimestamp(question.askedAt)}</span>
            </div>
            <Show when={question.status === "pending"}>
              <div
                class={
                  stylex.attrs(
                    assistantUtilityStyles.mt3,
                    assistantUtilityStyles.flex,
                    assistantUtilityStyles.flexCol,
                    assistantUtilityStyles.gap2,
                  ).class
                }
              >
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.grid,
                      assistantUtilityStyles.gap2,
                    ).class
                  }
                >
                  <For each={getAssistantQuestionDefaultChoices()}>
                    {(choice) => (
                      <ActionButton
                        tooltip={choice.description}
                        disabled={props.disabled}
                        disabledReason={props.disabledReason}
                        icon={
                          choice.recommended ? (
                            <Check
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h4,
                                  assistantUtilityStyles.w4,
                                ).class
                              }
                            />
                          ) : undefined
                        }
                        variant={choice.recommended ? "default" : "secondary"}
                        class={
                          stylex.attrs(assistantUtilityStyles.justifyStart)
                            .class
                        }
                        onClick={() =>
                          props.onAnswer(question, choice.answerText)
                        }
                      >
                        {choice.label}
                      </ActionButton>
                    )}
                  </For>
                </div>
                <Textarea
                  rows="3"
                  disabled={props.disabled}
                  value={props.questionAnswers[question.id] ?? ""}
                  onKeyDown={submitOnEnter(() => props.onAnswer(question))}
                  onInput={(event) =>
                    props.onAnswerInput(question.id, event.currentTarget.value)
                  }
                  placeholder="Answer this question."
                />
                <ActionButton
                  tooltip="Send answer to assistant"
                  disabled={props.disabled}
                  disabledReason={props.disabledReason}
                  icon={
                    <Save
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.h4,
                          assistantUtilityStyles.w4,
                        ).class
                      }
                    />
                  }
                  onClick={() => props.onAnswer(question)}
                >
                  Answer
                </ActionButton>
              </div>
            </Show>
            <Show when={question.answerText}>
              {(answer) => (
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.mt3,
                      assistantUtilityStyles.text0675,
                      assistantUtilityStyles.leading5,
                      assistantUtilityStyles.textMuted,
                    ).class
                  }
                >
                  <FileLinkedText text={answer()} fileLinks={props.fileLinks} />
                </div>
              )}
            </Show>
          </article>
        )}
      </VirtualList>
    </section>
  );
}
function ConfigCard(props: { title: string; children: JSX.Element }) {
  return (
    <section
      class={
        stylex.attrs(
          assistantUtilityStyles.text0675,
          assistantUtilityStyles.leading6,
          assistantUtilityStyles.textMuted,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.mb3,
            assistantUtilityStyles.text0585,
            assistantUtilityStyles.fontSemibold,
            assistantUtilityStyles.uppercase,
            assistantUtilityStyles.tracking018,
            assistantUtilityStyles.textMuted,
          ).class
        }
      >
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

function summarizePrompt(prompt: string, maxLength?: number) {
  return prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength ?? 120);
}

function matchesAssistantFilters(
  assistant: Assistant,
  state: typeof harnessStore.state,
) {
  const filters = state.assistants;
  if (filters.runStateFilter && assistant.runState !== filters.runStateFilter) {
    return false;
  }
  if (
    filters.bootstrapStateFilter &&
    assistant.bootstrapState !== filters.bootstrapStateFilter
  ) {
    return false;
  }
  if (
    filters.providerBrandFilter &&
    assistant.providerBrand !== filters.providerBrandFilter
  ) {
    return false;
  }
  if (
    filters.projectIdFilter &&
    assistant.projectId !== filters.projectIdFilter
  ) {
    return false;
  }
  return true;
}

function compareAssistants(
  left: Assistant,
  right: Assistant,
  sort: AssistantRosterSort,
) {
  if (sort === "name") {
    return (
      left.name.localeCompare(right.name) ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }
  if (sort === "created") {
    return right.createdAt.localeCompare(left.createdAt);
  }
  if (sort === "run-state") {
    return (
      left.runState.localeCompare(right.runState) ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }
  if (sort === "bootstrap-state") {
    return (
      left.bootstrapState.localeCompare(right.bootstrapState) ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

function assistantRosterMenuItems(
  state: typeof harnessStore.state,
): LeftPaneSearchMenuItem[] {
  const setFilters = harnessStore.setAssistantPaneFilters;
  const sortOption = (
    label: string,
    value: AssistantRosterSort,
    icon: JSX.Element,
  ): LeftPaneSearchMenuItem => ({
    kind: "option",
    label,
    icon,
    selected: state.assistants.rosterSort === value,
    onSelect: () => setFilters({ rosterSort: value }),
  });

  return [
    {
      kind: "submenu",
      label: "Scope",
      value: formatAssistantScopeFilterLabel(state.assistants.scopeFilter),
      icon:
        state.assistants.scopeFilter === "global" ? (
          <Globe
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />
        ) : (
          <Folder
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />
        ),
      items: [
        {
          kind: "option",
          label: "All",
          icon: (
            <ListFilter
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.scopeFilter === "all",
          onSelect: () => harnessStore.setAssistantScopeFilter("all"),
        },
        {
          kind: "option",
          label: "Current project",
          icon: (
            <Folder
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.scopeFilter === "project",
          onSelect: () => harnessStore.setAssistantScopeFilter("project"),
        },
        {
          kind: "option",
          label: "Global",
          icon: (
            <Globe
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.scopeFilter === "global",
          onSelect: () => harnessStore.setAssistantScopeFilter("global"),
        },
      ],
    },
    {
      kind: "submenu",
      label: "Sort assistants",
      value: formatAssistantRosterSortLabel(state.assistants.rosterSort),
      icon: (
        <ListFilter
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      items: [
        sortOption(
          "Updated",
          "updated",
          <ArrowDown
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Created",
          "created",
          <Calendar
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Name",
          "name",
          <ListFilter
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Run state",
          "run-state",
          <CirclePlay
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Bootstrap state",
          "bootstrap-state",
          <ListChecks
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
      ] as Array<Extract<LeftPaneSearchMenuItem, { kind: "option" }>>,
    },
    {
      kind: "submenu",
      label: "Run state",
      value: state.assistants.runStateFilter ?? "All",
      icon: (
        <CirclePlay
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      active: Boolean(state.assistants.runStateFilter),
      items: [
        {
          kind: "option",
          label: "All run states",
          icon: (
            <ListFilter
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: !state.assistants.runStateFilter,
          onSelect: () => setFilters({ runStateFilter: undefined }),
        },
        {
          kind: "option",
          label: "Active",
          icon: (
            <CirclePlay
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.runStateFilter === "active",
          active: state.assistants.runStateFilter === "active",
          onSelect: () => setFilters({ runStateFilter: "active" }),
        },
        {
          kind: "option",
          label: "Paused",
          icon: (
            <CirclePause
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.runStateFilter === "paused",
          active: state.assistants.runStateFilter === "paused",
          onSelect: () => setFilters({ runStateFilter: "paused" }),
        },
      ],
    },
    {
      kind: "submenu",
      label: "Bootstrap",
      value: state.assistants.bootstrapStateFilter
        ? toProperCase(state.assistants.bootstrapStateFilter)
        : "All",
      icon: (
        <ListChecks
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      active: Boolean(state.assistants.bootstrapStateFilter),
      items: [
        {
          kind: "option",
          label: "All bootstrap",
          icon: (
            <ListFilter
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: !state.assistants.bootstrapStateFilter,
          onSelect: () => setFilters({ bootstrapStateFilter: undefined }),
        },
        ...(["pending", "running", "completed", "failed"] as const).map(
          (value) => ({
            kind: "option" as const,
            label: toProperCase(value),
            icon: (
              <ListChecks
                class={
                  stylex.attrs(
                    assistantUtilityStyles.h35,
                    assistantUtilityStyles.w35,
                  ).class
                }
              />
            ),
            selected: state.assistants.bootstrapStateFilter === value,
            active: state.assistants.bootstrapStateFilter === value,
            onSelect: () => setFilters({ bootstrapStateFilter: value }),
          }),
        ),
      ],
    },
    {
      kind: "submenu",
      label: "Provider",
      value: state.assistants.providerBrandFilter
        ? toProperCase(state.assistants.providerBrandFilter)
        : "All",
      icon: (
        <Bot
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      active: Boolean(state.assistants.providerBrandFilter),
      items: [
        {
          kind: "option",
          label: "All providers",
          icon: (
            <Bot
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: !state.assistants.providerBrandFilter,
          onSelect: () => setFilters({ providerBrandFilter: undefined }),
        },
        ...(["gpt", "gemini", "claude"] as const).map((value) => ({
          kind: "option" as const,
          label: toProperCase(value),
          icon: (
            <Bot
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.providerBrandFilter === value,
          active: state.assistants.providerBrandFilter === value,
          onSelect: () => setFilters({ providerBrandFilter: value }),
        })),
      ],
    },
    {
      kind: "submenu",
      label: "Project",
      value:
        state.workspace.projects.find(
          (project) => project.id === state.assistants.projectIdFilter,
        )?.name ?? "All",
      icon: (
        <Folder
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      active: Boolean(state.assistants.projectIdFilter),
      items: [
        {
          kind: "option",
          label: "All projects",
          icon: (
            <Folder
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: !state.assistants.projectIdFilter,
          onSelect: () => setFilters({ projectIdFilter: undefined }),
        },
        ...state.workspace.projects.map((project) => ({
          kind: "option" as const,
          label: project.name,
          icon: (
            <Folder
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.projectIdFilter === project.id,
          active: state.assistants.projectIdFilter === project.id,
          onSelect: () => setFilters({ projectIdFilter: project.id }),
        })),
      ],
    },
    { kind: "separator" },
    {
      kind: "option",
      label: "Clear search and filters",
      icon: (
        <Trash2
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      onSelect: () =>
        setFilters({
          rosterSearch: "",
          runStateFilter: undefined,
          bootstrapStateFilter: undefined,
          providerBrandFilter: undefined,
          projectIdFilter: undefined,
        }),
    },
  ];
}

function activeAssistantRosterFilterCount(state: typeof harnessStore.state) {
  return [
    state.assistants.runStateFilter,
    state.assistants.bootstrapStateFilter,
    state.assistants.providerBrandFilter,
    state.assistants.projectIdFilter,
  ].filter(Boolean).length;
}

function formatAssistantScopeFilterLabel(
  scopeFilter: typeof harnessStore.state.assistants.scopeFilter,
) {
  if (scopeFilter === "all") {
    return "All";
  }
  if (scopeFilter === "global") {
    return "Global";
  }
  return "Current";
}

function formatAssistantRosterSortLabel(sort: AssistantRosterSort) {
  if (sort === "created") {
    return "Created";
  }
  if (sort === "name") {
    return "Name";
  }
  if (sort === "run-state") {
    return "Run state";
  }
  if (sort === "bootstrap-state") {
    return "Bootstrap";
  }
  return "Updated";
}

function assistantSearchHaystack(
  assistant: Assistant,
  state: typeof harnessStore.state,
) {
  const project = state.workspace.projects.find(
    (entry) => entry.id === assistant.projectId,
  );
  return [
    assistant.name,
    assistant.description,
    assistant.personalityPrompt,
    assistant.jobPrompt,
    assistant.scope,
    assistant.runState,
    assistant.bootstrapState,
    assistant.providerBrand,
    project?.name,
    project?.rootPath,
  ]
    .filter(Boolean)
    .join(" ");
}

function fuzzyMatches(haystack: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const normalized = haystack.toLowerCase();
  return tokens.every((token) => normalized.includes(token));
}

function isActiveTodo(state: AssistantTodo["state"]) {
  return state === "pending" || state === "in-progress" || state === "blocked";
}
