import { For, Match, Show, Switch, createEffect, createMemo, createSignal, getOwner, onCleanup, onMount, runWithOwner, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  createRequestId,
  type AssistantActionMessageMetadata,
  type AgentRunState,
  type AgentRunSummary,
  type ChatAttachment,
  type ChatMessage,
  type ProviderBrand,
  type SetupAction
} from "../../../shared/protocol";
import {
  detectSupportedChatAttachment,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_COUNT
} from "../../../shared/chat-attachments";
import {
  canSelectProviderBrand,
  COMPOSER_REASONING_STRENGTHS,
  getEffectiveProviderBrandForAgent,
  getActiveMode,
  getCapabilityTags,
  getBlockingSetupCheck,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getFallbackExecutionModelIdForAgent,
  getModelCapability,
  getResolvedModes,
  harnessStore,
  hasUsableApiKeyForProvider,
  persistMergedLocalPreferences,
  resolveUsablePiProviderBrand,
  shouldShowSetupChecklist,
  type ChatPaneTab,
  type ViewProjectState
} from "../harness-store";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import { findChatFileReferenceAtPosition, findChatFileReferences, resolveChatFileTarget, type ChatFileLinkContext, type ChatFileTarget } from "../lib/chat-file-links";
import { tooltipWithPrimaryHotkey } from "../lib/hotkey-hints";
import { openIdeWindow } from "../lib/ide-window";
import { uploadFiles } from "../lib/uploadthing";
import { buildChatTimelineRows, type ChatTimelineRow, type TimelineLiveMessage } from "../lib/chat-timeline-model";
import { formatShortTimestamp, resolveBrowserTimezone } from "../lib/time-format";
import { formatProviderModelName } from "../lib/utils";
import { pushToast } from "../toast-store";
import { openBackgroundRunInJobsPane } from "../background-run-navigation";
import { ActionButton } from "./action-button";
import { CliSessionPanel } from "./cli-session-panel";
import { MarkdownContent } from "./markdown-content";
import { ModeEditorPanel } from "./mode-editor-panel";
import { SetupChecklistCard } from "./setup-checklist-card";
import { StreamedToolBlock } from "./streamed-tool-block";
import { TerminalHistoryDialog } from "../terminal/terminal-history-dialog";
import { ChatComposer } from "./primitives/chat-composer";
import { Dialog } from "./primitives/dialog";
import { CopyTextButton } from "./primitives/copy-text-button";
import { DropdownControl } from "./primitives/dropdown";
import { getAgentDropdownIcon, getModeDropdownIcon } from "./primitives/dropdown-option-icons";
import { Input } from "./primitives/input";
import { Popover } from "./primitives/popover";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import { VirtualList } from "./primitives/virtual-list";
import { Button } from "./primitives/button";
import {
  Activity,
  AlertTriangle,
  Brain,
  Bot,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Clipboard,
  Cpu,
  Edit3,
  FolderOpen,
  Folder,
  Gauge,
  LoaderCircle,
  MessageSquareMore,
  Orbit,
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  ArrowDown,
  ArrowUp,
  Check,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  SendHorizontal,
  Settings,
  Terminal,
  WandSparkles,
  X,
  Split
} from "lucide-solid";
import { chatPanelStyles as styles } from "./chat-panel.styles";
import { chatUtilityStyles } from "./chat-panel.utilities";

function getReasoningStrengthDescription(strength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
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

function getFastModeDescription(enabled: boolean) {
  return enabled
    ? "Prefer lower-latency responses when current runtime and model support it."
    : "Use standard response path with default latency and reasoning behavior.";
}

function isHarnessTranscriptMessage(message: ChatMessage) {
  return message.role === "assistant" || message.role === "system";
}

function getTranscriptRoleLabel(role: ChatMessage["role"]) {
  return role === "user" ? "user" : "harness";
}

function getCopyAriaLabel(message: ChatMessage) {
  return `Copy ${isHarnessTranscriptMessage(message) ? "harness" : message.role} message`;
}

function getPlanFromMessage(message: ChatMessage) {
  return message.metadata?.type === "plan-summary" ? message.metadata.plan : undefined;
}

function getProviderBrandLabel(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "Gemini";
  }
  if (providerBrand === "claude") {
    return "Claude";
  }
  return "GPT";
}

function getProviderBrandDescription(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "Google-hosted model family.";
  }
  if (providerBrand === "claude") {
    return "Anthropic-hosted model family.";
  }
  return "OpenAI-hosted model family.";
}

function renderMessageActionRow(timestamp: string | number | Date | undefined, copyButton: JSX.Element) {
  return (
    <div {...stylex.attrs(styles.messageActionRow)}>
      <div {...stylex.attrs(styles.messageTimestamp)}>
        {formatShortTimestamp(timestamp)}
      </div>
      {copyButton}
    </div>
  );
}

function reactiveArraySnapshot<T>(items: readonly T[] | undefined) {
  if (!items) {
    return [];
  }
  const snapshot: T[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item !== undefined) {
      snapshot.push(item);
    }
  }
  return snapshot;
}

type ComposerReferenceBadge = {
  key: string;
  kind: "skill" | "file";
  label: string;
  target: ChatFileTarget;
};

export function ChatPanel() {
  let messageViewport: HTMLDivElement | undefined;
  let attachmentInput: HTMLInputElement | undefined;
  let composerTextarea: HTMLTextAreaElement | undefined;
  let composerLookupMenu: HTMLDivElement | undefined;
  let countdownTimer: number | undefined;
  let waitingTimer: number | undefined;
  const owner = getOwner();
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeProjectIndex = createMemo(() =>
    state.workspace.projects.findIndex((project) => project.id === state.workspace.activeProjectId)
  );
  const activeProject = () => {
    const index = activeProjectIndex();
    return index >= 0 ? state.workspace.projects[index] : undefined;
  };
  const project = () => activeProject()!;
  const chatFileLinkContext = (): ChatFileLinkContext => ({
    rootPath: activeProject()?.rootPath,
    filePaths: activeProject()?.filePaths ?? []
  });
  const chatFileLinks = () => ({
    ...chatFileLinkContext(),
    onOpenFile: handleOpenChatFile
  });
  const [stickToBottom, setStickToBottom] = createSignal(true);
  const [editingThreadTitle, setEditingThreadTitle] = createSignal(false);
  const [threadTitleDraft, setThreadTitleDraft] = createSignal("");
  const [countdownRunId, setCountdownRunId] = createSignal<string>();
  const [countdownRemainingMs, setCountdownRemainingMs] = createSignal(0);
  const [countdownPaused, setCountdownPaused] = createSignal(false);
  const [countdownFrozenByExecutionPause, setCountdownFrozenByExecutionPause] = createSignal(false);
  const [elapsedNowMs, setElapsedNowMs] = createSignal(Date.now());
  const [autoExecutedRunId, setAutoExecutedRunId] = createSignal<string>();
  const currentTab = createMemo(() => state.chatPaneTab);
  const [experimentDialogOpen, setExperimentDialogOpen] = createSignal(false);
  const [selectedExperimentFilePath, setSelectedExperimentFilePath] = createSignal<string>();
  const [projectRulesDraft, setProjectRulesDraft] = createSignal("");
  const [threadMemoryDraft, setThreadMemoryDraft] = createSignal("");
  const [deleteArmedMemoryId, setDeleteArmedMemoryId] = createSignal<string>();
  const [draftAttachments, setDraftAttachments] = createSignal<ChatAttachment[]>(readPersistedDraftAttachments(undefined));
  const [uploadingAttachments, setUploadingAttachments] = createSignal(false);
  const [draggingAttachments, setDraggingAttachments] = createSignal(false);
  const [attachmentDraftHydrated, setAttachmentDraftHydrated] = createSignal(false);
  const [composerSettingsOpen, setComposerSettingsOpen] = createSignal(false);
  const [desktopReasoningMenuOpen, setDesktopReasoningMenuOpen] = createSignal(false);
  const [mobileReasoningMenuOpen, setMobileReasoningMenuOpen] = createSignal(false);
  const [composerLookupIndex, setComposerLookupIndex] = createSignal(0);
  const [composerLookupForcedClosed, setComposerLookupForcedClosed] = createSignal(false);
  const [composerCaret, setComposerCaret] = createSignal<number | undefined>();
  const [dismissedComposerLookupKey, setDismissedComposerLookupKey] = createSignal<string | undefined>();
  const [terminalHistoryOpen, setTerminalHistoryOpen] = createSignal(false);
  const pendingQuestion = () => activeProject()?.activeRun?.questions.find((question) => question.status === "pending");
  const resumableRun = () => (activeProject()?.activeRun?.resumable ? activeProject()?.activeRun : undefined);
  const retryableRun = () => (activeProject()?.lastRun?.retryable ? activeProject()?.lastRun : undefined);
  const readyRun = () => (activeProject()?.activeRun?.status === "ready" ? activeProject()?.activeRun : undefined);
  const workingRun = () => {
    const project = activeProject();
    return project?.session.isStreaming && project.activeRun && isBlockingRunStatus(project.activeRun.status)
      ? project.activeRun
      : undefined;
  };
  const activeThreadIsStreaming = () => Boolean(workingRun());
  const attachmentDraftKey = () => {
    const project = activeProject();
    return project ? `ai-harness:chat-draft:v2:${project.id}:${project.activeThreadId}` : undefined;
  };
  const activeThread = () => activeProject()?.threads.find((thread) => thread.id === activeProject()?.activeThreadId);
  const currentExecutionPlan = () => activeProject()?.latestPlan?.executionPlan ?? readyRun()?.plan;
  const resolvedModes = () => getResolvedModes(state, activeProject());
  const activeMode = () => getActiveMode(state, activeProject());
  const isAutoModeSelected = () => harnessStore.state.hasGlobalSelectedModeId && harnessStore.state.selectedModeId === "auto";
  const selectedModeValue = createMemo(() => (isAutoModeSelected() ? "auto" : activeMode()?.id ?? "implement"));
  const capabilityTags = () => getCapabilityTags(state, getEffectiveExecutionModelId());
  const selectedAgentId = () => state.selectedAgentId;
  const selectedProviderBrand = () => getEffectiveProviderBrandForAgent(selectedAgentId(), state.providerBrand);
  const availableExecutionModels = () => getExecutionModelOptionsForAgent(state, selectedAgentId(), state.providerBrand);
  const selectedAgentRuntime = () => state.agentRuntimes.find((runtime) => runtime.agentId === selectedAgentId());
  const composerControlState = () => getComposerControlState(state, selectedAgentId(), getEffectiveExecutionModelId());
  const selectedReasoningStrength = () => composerControlState().selectedReasoningStrength;
  const selectedFastMode = () => composerControlState().selectedFastMode;
  const composerReasoningLabel = () => formatReasoningStrengthLabel(selectedReasoningStrength());
  const composerSettingsLabel = () => (selectedFastMode() ? `${composerReasoningLabel()} · Fast` : composerReasoningLabel());
  const selectedAgentLabel = () => state.availableAgents.find((agent) => agent.id === selectedAgentId())?.label ?? "selected agent";
  const composerTimerState = () => {
    const run = workingRun();
    if (run) {
      const startedAtMs = Date.parse(run.createdAt);
      return {
        kind: "working" as const,
        label: Number.isNaN(startedAtMs) ? "Working" : `Working for ${formatElapsedDuration(elapsedNowMs() - startedAtMs)}`
      };
    }

    const lastRun = activeProject()?.lastRun;
    const finishedAt = lastRun?.completedAt ?? lastRun?.updatedAt;
    if (!lastRun || !finishedAt) {
      return undefined;
    }

    const startedAtMs = Date.parse(lastRun.createdAt);
    const finishedAtMs = Date.parse(finishedAt);
    if (Number.isNaN(startedAtMs) || Number.isNaN(finishedAtMs)) {
      return undefined;
    }

    return {
      kind: "complete" as const,
      label: `${formatResponseTime(finishedAtMs)} • ${formatElapsedDuration(finishedAtMs - startedAtMs)}`
    };
  };
  const modeDropdownOptions = () =>
    [
      {
        value: "auto",
        label: "Choose automatically",
        description: "Interpret each prompt and choose the best implementation mode.",
        icon: getModeDropdownIcon("auto")
      },
      ...resolvedModes().map((mode) => ({
        value: mode.id,
        label: formatModeIntentLabel(mode.id, mode.label),
        description: mode.description,
        icon: getModeDropdownIcon(mode.id)
      }))
    ];
  const agentDropdownOptions = () =>
    state.availableAgents.map((agent) => {
      const runtime = state.agentRuntimes.find((entry) => entry.agentId === agent.id);
      const availability = runtime
        ? runtime.installed && runtime.authenticated
          ? "Ready on this computer."
          : runtime.healthMessage ?? "Setup required before this runtime can send."
        : agent.id === "pi"
          ? "Requires a configured provider key."
          : "Availability has not been checked.";
      return {
        value: agent.id,
        label: agent.label,
        description: `${agent.description} ${availability}`,
        icon: getAgentDropdownIcon(agent.id)
      };
    });
  const providerDropdownOptions = () => {
    if (selectedAgentId() === "pi") {
      return [
        { value: "gpt", label: "GPT", description: "OpenAI-hosted model family." },
        { value: "gemini", label: "Gemini", description: "Google-hosted model family." },
        { value: "claude", label: "Claude", description: "Anthropic-hosted model family." }
      ];
    }

    const providerBrand = selectedProviderBrand();
    return providerBrand
      ? [
          {
            value: providerBrand,
            label: getProviderBrandLabel(providerBrand),
            description: getProviderBrandDescription(providerBrand)
          }
        ]
      : [];
  };
  const modelDropdownOptions = () =>
    availableExecutionModels().map((model) => ({
      value: model.modelId,
      label: formatProviderModelName(model.modelId),
      description: getModelCapability(state, model.modelId)?.summary ?? model.modelId
    }));
  const selectedAgentHealthMessage = () => {
    const runtime = selectedAgentRuntime();
    if (!runtime || runtime.agentId === "pi") {
      return undefined;
    }

    if (!runtime.installed || !runtime.authenticated) {
      return runtime.healthMessage ?? `${runtime.label} unavailable`;
    }

    return runtime.healthMessage;
  };
  const hasVisionCapability = () => selectedAgentId() === "codex-cli" || capabilityTags().includes("vision");
  const hasImageDraftAttachments = () => draftAttachments().some((attachment) => attachment.kind === "image");
  const blockingSetupCheck = () => getBlockingSetupCheck(state);
  const visibleTabs = () =>
    [
      { id: "chat", label: "Chat", icon: <MessageSquareMore class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open transcript and plan cards" },
      { id: "plan", label: "Plan", icon: <ClipboardList class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open planning context and saved plan tools" },
      { id: "run", label: "Run", icon: <Play class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open run status, subtasks, and experiment actions" },
      { id: "memory", label: "Memory", icon: <Brain class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open shared memory entries" },
      { id: "events", label: "Model events", icon: <Activity class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open model trace events; tool activity remains in Run" }
    ] satisfies Array<{ id: ChatPaneTab; label: string; icon: JSX.Element; tooltip: string }>;
  const experimentRun = () => activeProject()?.activeRun?.experiment ?? activeProject()?.lastRun?.experiment;
  const liveHarnessMessages = () => {
    const project = activeProject();
    return project ? getStreamingLiveMessages(project) : [];
  };
  const projectTraces = createMemo(() => reactiveArraySnapshot(activeProject()?.traces));
  const hasBranchfsSizeWarning = createMemo(() => projectTraces().some((trace) => trace.stage === "branchfs-size-warning"));
  const projectMemoryEntries = createMemo(() => reactiveArraySnapshot(activeProject()?.memoryEntries));
  const transcriptRows = createMemo<ChatTimelineRow[]>(() => {
    const project = activeProject();
    return buildChatTimelineRows({
      messages: reactiveArraySnapshot(project?.session.messages),
      liveMessages: liveHarnessMessages(),
      toolActivities: reactiveArraySnapshot(project?.activeRun?.toolActivities ?? project?.lastRun?.toolActivities),
      activeRunId: project?.activeRun?.id ?? project?.lastRun?.id
    });
  });
  const liveHarnessMessageTimestamp = () => activeProject()?.activeRun?.updatedAt ?? activeProject()?.activeRun?.createdAt;
  const runSubtasks = createMemo(() => reactiveArraySnapshot(activeProject()?.activeRun?.subtasks ?? activeProject()?.lastRun?.subtasks));
  const currentRun = () => activeProject()?.activeRun ?? activeProject()?.lastRun;
  const currentBackgroundRun = createMemo(() => {
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    return run ? state.backgroundJobs.runs.find((entry) => entry.linkedAgentRunId === run.id) : undefined;
  });
  const liveHarnessMessageKey = () =>
    liveHarnessMessages()
      .map((message) => `${message.id}:${message.locked ? "locked" : "live"}:${message.content}`)
      .join("\n---\n");
  const failedSubtaskCount = () =>
    activeProject()?.activeRun?.subtasks.filter((task) => task.status === "failed").length ?? 0;
  const contextUsage = () => activeProject()?.contextUsage;
  const attachmentButtonDisabled = () => !state.attachmentsEnabled || activeThreadIsStreaming() || uploadingAttachments();
  const attachmentButtonReason = () =>
    !state.attachmentsEnabled
      ? "Set UPLOADTHING_TOKEN on the server to enable attachments"
      : activeThreadIsStreaming()
        ? "Project is streaming"
        : uploadingAttachments()
          ? "Attachment upload in progress"
          : undefined;
  const composerLookup = () => {
    const currentProject = activeProject();
    if (!currentProject) {
      return undefined;
    }
    const storedCaret = composerCaret();
    const rawCaret = storedCaret ?? currentProject.draft.length;
    const caret = Math.max(0, Math.min(rawCaret, currentProject.draft.length));
    return getComposerLookup(currentProject.draft, caret);
  };
  const composerLookupKey = () => {
    const lookup = composerLookup();
    return lookup ? `${lookup.kind}:${lookup.start}:${lookup.end}:${lookup.query}` : undefined;
  };
  const skillOptions = createMemo(() =>
    state.availableSkillPaths.map((skillPath) => ({
      label: getSkillName(skillPath),
      detail: skillPath,
      insertText: `/${getSkillName(skillPath)} `
    }))
  );
  const fileOptions = createMemo(() =>
    (activeProject()?.filePaths ?? []).map((filePath) => ({
      label: getFileName(filePath),
      detail: getDirectoryName(filePath),
      insertText: `@${filePath} `
    }))
  );
  const composerLookupOptions = () => {
    const lookup = composerLookup();
    if (!lookup) {
      return [];
    }
    const query = lookup.query.toLowerCase();
    const source = lookup.kind === "skill" ? skillOptions() : fileOptions();
    return source
      .filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(query))
      .slice(0, 10);
  };
  const composerLookupOpen = () => {
    if (composerLookupForcedClosed()) {
      return false;
    }
    const key = composerLookupKey();
    return Boolean(key && dismissedComposerLookupKey() !== key && composerLookupOptions().length > 0);
  };
  const composerLookupRenderedOptions = () =>
    composerLookupOptions().map((option, index) => ({
      ...option,
      index,
      selected: index === composerLookupIndex()
    }));
  const composerLookupActiveOptionId = () =>
    composerLookupOpen() ? getComposerLookupOptionId(composerLookupIndex()) : undefined;
  const composerReferenceBadges = () =>
    getComposerReferenceBadges(activeProject()?.draft ?? "", chatFileLinkContext(), state.availableSkillPaths);
  const dropState = () => {
    if (!state.attachmentsEnabled) {
      return { label: "Attachments unavailable", detail: "Set UPLOADTHING_TOKEN on the server to enable uploads." };
    }
    if (uploadingAttachments()) {
      return { label: "Uploading attachments", detail: "Wait for the current upload to finish." };
    }
    if (attachmentButtonDisabled()) {
      return { label: "Drop unavailable", detail: attachmentButtonReason() ?? "Drop is unavailable right now." };
    }
    return { label: "Drop files to attach", detail: "Images, text, PDFs, and office documents are supported." };
  };
  const requiresFreshTopLevelSend = () =>
    !pendingQuestion() && activeProject()?.activeRun?.status !== "ready" && !resumableRun();
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = () => "Global execution pause is active";
  const setupBlockedReason = () =>
    requiresFreshTopLevelSend() && blockingSetupCheck() ? blockingSetupCheck()!.summary : undefined;
  const composerSubmitState = createMemo(() => {
    const project = activeProject();
    const content = project?.draft.trim() ?? "";
    const hasAttachments = draftAttachments().length > 0;
    const question = pendingQuestion();
    const readyRunActive = project?.activeRun?.status === "ready";
    const tooltip = question
      ? "Send planner answer"
      : readyRunActive
        ? "Refine plan before execution"
        : `Send task to ${selectedAgentLabel()}`;

    if (!project) {
      return { disabled: true, disabledReason: "Open project first", tooltip };
    }

    if (executionPaused()) {
      return { disabled: true, disabledReason: executionPauseReason(), tooltip };
    }

    if (activeThreadIsStreaming()) {
      return { disabled: true, disabledReason: "Project is streaming", tooltip };
    }

    if (uploadingAttachments()) {
      return { disabled: true, disabledReason: "Attachment upload in progress", tooltip };
    }

    if ((question || readyRunActive) && hasAttachments) {
      return {
        disabled: true,
        disabledReason: "Attachments are only supported on new top-level tasks right now.",
        tooltip
      };
    }

    if (hasImageDraftAttachments() && !hasVisionCapability()) {
      return {
        disabled: true,
        disabledReason: "Current model lacks vision support for image attachments",
        tooltip
      };
    }

    if (question) {
      return content
        ? { disabled: false, disabledReason: undefined, tooltip }
        : { disabled: true, disabledReason: "Enter answer text", tooltip };
    }

    if (readyRunActive) {
      return content
        ? { disabled: false, disabledReason: undefined, tooltip }
        : { disabled: true, disabledReason: "Enter plan changes", tooltip };
    }

    if (resumableRun()) {
      return {
        disabled: true,
        disabledReason: "Use resume failed agents to continue this run",
        tooltip
      };
    }

    if (setupBlockedReason()) {
      return { disabled: true, disabledReason: setupBlockedReason(), tooltip };
    }

    if (!content) {
      return {
        disabled: true,
        disabledReason: hasAttachments ? "Describe what to do with attached files" : "Enter task text",
        tooltip
      };
    }

    if (selectedAgentId() === "pi" && !resolveUsablePiProviderBrand(state)) {
      return {
        disabled: true,
        disabledReason: "Add an OpenAI or Google API key to use Pi, or switch agents",
        tooltip
      };
    }

    const unavailableAgentReason = getSelectedAgentUnavailableReason();
    if (unavailableAgentReason) {
      return { disabled: true, disabledReason: unavailableAgentReason, tooltip };
    }

    return { disabled: false, disabledReason: undefined, tooltip };
  });
  const renderModeControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select mode"
      icon={<Split class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
      size={size}
      class={className}
      value={selectedModeValue()}
      options={modeDropdownOptions()}
      hideWhenSingleOption
      onChange={handleModeSelect}
      dataAttributes={{ "data-test-mode-select": "" }}
    />
  );
  const renderAgentControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select agent"
      icon={<Bot class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
      size={size}
      class={className}
      value={selectedAgentId()}
      options={agentDropdownOptions()}
      hideWhenSingleOption
      onChange={(value) => handleSelectAgent(value as "pi" | "copilot-cli" | "codex-cli")}
      dataAttributes={{ "data-test-agent-select": "", "data-tour-id": "agent-select" }}
    />
  );
  const renderProviderControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select provider"
      icon={<Orbit class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
      size={size}
      class={className}
      value={selectedProviderBrand() ?? "gpt"}
      options={providerDropdownOptions()}
      disabled={selectedAgentId() === "codex-cli"}
      hideWhenSingleOption
      onChange={(value) => handleProviderBrandSelect(value as ProviderBrand)}
      dataAttributes={{ "data-test-provider-select": "" }}
    />
  );
  const renderModelControl = (size: "sm" | "md" = "sm", className?: string) => (
    <DropdownControl
      kind="select"
      ariaLabel="Select model"
      icon={<Cpu class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
      size={size}
      class={className}
      value={getEffectiveExecutionModelId()}
      options={modelDropdownOptions()}
      hideWhenSingleOption
      onChange={handleExecutionModelSelect}
      dataAttributes={{ "data-test-model-select": "" }}
    />
  );
  const renderEffortControl = (
    onToggle: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>,
    className?: string
  ) => (
    <Tooltip content={`${getReasoningStrengthDescription(selectedReasoningStrength())}${selectedFastMode() ? "\nFast mode on for lower latency." : "\nFast mode off for default response pacing."}`}>
      <DropdownControl
        kind="trigger"
        ariaLabel="Open effort options"
        icon={<Gauge class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
        class={className}
        label={composerSettingsLabel()}
        onClick={onToggle}
        dataAttributes={{ "data-test-effort-trigger": "" }}
      />
    </Tooltip>
  );

  const scrollToBottom = (force: boolean = false) => {
    if (!messageViewport || (!force && !stickToBottom())) {
      return;
    }

    queueMicrotask(() => {
      if (!messageViewport) {
        return;
      }

      messageViewport.scrollTop = messageViewport.scrollHeight;
    });
  };

  const updateScrollLock = () => {
    if (!messageViewport) {
      setStickToBottom(true);
      return;
    }

    const distanceFromBottom =
      messageViewport.scrollHeight - messageViewport.scrollTop - messageViewport.clientHeight;
    setStickToBottom(distanceFromBottom <= 32);
  };

  onMount(() => {
    scrollToBottom(true);
    waitingTimer = window.setInterval(() => setElapsedNowMs(Date.now()), 1000);
  });

  onCleanup(() => {
    clearCountdown();
    if (waitingTimer !== undefined) {
      window.clearInterval(waitingTimer);
      waitingTimer = undefined;
    }
  });

  createEffect(() => {
    activeProject()?.activeThreadId;
    scrollToBottom(true);
  });

  createEffect(() => {
    activeProject()?.session.messages.length;
    liveHarnessMessageKey();
    scrollToBottom();
  });

  createEffect(() => {
    const thread = activeThread();
    setThreadTitleDraft(thread?.title ?? "");
    setEditingThreadTitle(false);
    setProjectRulesDraft(activeProject()?.projectRuleSource?.content ?? "");
    setThreadMemoryDraft(activeProject()?.threadMemorySummary?.content ?? "");
    setDraftAttachments([]);
    setUploadingAttachments(false);
  });

  createEffect(() => {
    activeProject()?.draft;
    queueMicrotask(() => {
      resizeComposer();
    });
  });

  createEffect(() => {
    const optionCount = composerLookupOptions().length;
    if (optionCount === 0) {
      setComposerLookupActiveIndex(0);
      return;
    }
    if (composerLookupIndex() >= optionCount) {
      setComposerLookupActiveIndex(optionCount - 1);
    }
  });

  createEffect(() => {
    const open = composerLookupOpen();
    queueMicrotask(() => {
      if (open && composerLookupOpen()) {
        syncComposerLookupDomVisibility();
      } else {
        setComposerLookupMenuHidden(true);
      }
    });
  });

  onMount(() => {
    const closeOnOutsidePointer = (event: MouseEvent | PointerEvent) => {
      if (!composerLookupOpen()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (composerLookupMenu?.contains(target) || composerTextarea?.contains(target)) {
        return;
      }
      dismissComposerLookup();
    };
    const handleLookupWindowKeyDown = (event: KeyboardEvent) => {
      if (!composerLookupOpen()) {
        return;
      }
      if (event.key === "Escape") {
        runWithChatPanelOwner(() => handleComposerLookupKeyDown(event));
        return;
      }
      const target = event.target;
      if (target instanceof Node && (composerLookupMenu?.contains(target) || composerTextarea?.contains(target))) {
        runWithChatPanelOwner(() => handleComposerLookupKeyDown(event));
      }
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("mousedown", closeOnOutsidePointer);
    window.addEventListener("click", closeOnOutsidePointer);
    window.addEventListener("keydown", handleLookupWindowKeyDown);
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("mousedown", closeOnOutsidePointer, true);
    document.addEventListener("click", closeOnOutsidePointer, true);
    document.addEventListener("keydown", handleLookupWindowKeyDown, true);
    document.body.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.body.addEventListener("mousedown", closeOnOutsidePointer, true);
    document.body.addEventListener("click", closeOnOutsidePointer, true);
    onCleanup(() => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("mousedown", closeOnOutsidePointer);
      window.removeEventListener("click", closeOnOutsidePointer);
      window.removeEventListener("keydown", handleLookupWindowKeyDown);
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("mousedown", closeOnOutsidePointer, true);
      document.removeEventListener("click", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", handleLookupWindowKeyDown, true);
      document.body.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.body.removeEventListener("mousedown", closeOnOutsidePointer, true);
      document.body.removeEventListener("click", closeOnOutsidePointer, true);
    });
  });

  createEffect(() => {
    if (currentTab() === "memory" && activeProject() && state.connectionState === "connected") {
      handleLoadMemoryEntries();
    }
  });

  createEffect(() => {
    activeProject()?.id;
    currentTab();
    setDeleteArmedMemoryId(undefined);
  });

  createEffect(() => {
    const run = readyRun();
    const executionPlan = currentExecutionPlan();
    if (!run || !executionPlan) {
      clearCountdown();
      return;
    }

    if (executionPlan.gating.mode === "immediate") {
      clearCountdown();
      if (!executionPaused() && autoExecutedRunId() !== run.id) {
        handleExecuteRun(run.id);
        setAutoExecutedRunId(run.id);
      }
      return;
    }

    if (executionPlan.gating.mode !== "countdown") {
      clearCountdown();
      return;
    }

    if (countdownRunId() === run.id) {
      if (!executionPaused() && countdownTimer === undefined && !countdownPaused() && countdownRemainingMs() > 0) {
        startCountdown(run.id);
      }
      return;
    }

    clearCountdown();
    setCountdownRunId(run.id);
    setCountdownPaused(false);
    setCountdownFrozenByExecutionPause(false);
    setCountdownRemainingMs(executionPlan.gating.delaySeconds * 1000);
    if (!executionPaused()) {
      startCountdown(run.id);
    }
  });

  createEffect(() => {
    const run = readyRun();
    if (!run || countdownRunId() !== run.id) {
      setCountdownFrozenByExecutionPause(false);
      return;
    }

    if (executionPaused()) {
      if (countdownTimer !== undefined) {
        window.clearInterval(countdownTimer);
        countdownTimer = undefined;
      }
      setCountdownFrozenByExecutionPause(true);
      return;
    }

    if (countdownFrozenByExecutionPause() && countdownTimer === undefined && !countdownPaused() && countdownRemainingMs() > 0) {
      setCountdownFrozenByExecutionPause(false);
      startCountdown(run.id);
    }
  });

  function startCountdown(runId: string) {
    if (countdownTimer !== undefined) {
      window.clearInterval(countdownTimer);
    }

    countdownTimer = window.setInterval(() => {
      setCountdownRemainingMs((value) => {
        const next = Math.max(0, value - 100);
        if (next === 0 && readyRun()?.id === runId && autoExecutedRunId() !== runId && !executionPaused()) {
          clearCountdown();
          handleExecuteRun(runId);
          setAutoExecutedRunId(runId);
        }
        return next;
      });
    }, 100);
  }

  async function handleSetupAction(action: SetupAction) {
    switch (action.kind) {
      case "open-project-switcher":
        harnessStore.openProjectSwitcher();
        return;
      case "open-preferences":
        harnessStore.openPreferencesModal();
        return;
      case "refresh-runtime-health":
        sendCommand({
          type: "agent.runtime.refresh",
          requestId: createRequestId()
        });
        return;
      case "copy-command":
        if (!action.value) {
          return;
        }

        try {
          await navigator.clipboard.writeText(action.value);
          pushToast("Command copied", action.value);
        } catch {
          pushToast("Clipboard blocked", action.value, "error");
        }
        return;
      case "open-url":
        if (action.value) {
          window.open(action.value, "_blank", "noopener,noreferrer");
        }
        return;
      case "start-tutorial":
        if (action.value) {
          harnessStore.startTutorial(action.value);
        }
        return;
      case "init-git-baseline":
        handleInitGitBaseline();
        return;
      case "disable-dirty-git-check":
        handleDisableDirtyGitCheck();
        return;
    }
  }

  function handleInitGitBaseline() {
    const project = activeProject();
    if (!project) {
      return;
    }

    harnessStore.prepareNonGitPreflightRepair("git-init");
    sendCommand({
      type: "project.git.initBaseline",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleDisableDirtyGitCheck() {
    harnessStore.prepareNonGitPreflightRepair("disable-check");
    harnessStore.setBlockChatOnDirtyGitDefault(false);
    savePreferences({ blockChatOnDirtyGitDefault: false });
  }

  function handleCancelNonGitPreflight() {
    harnessStore.clearBlockingNonGitPreflight();
  }

  function clearCountdown() {
    if (countdownTimer !== undefined) {
      window.clearInterval(countdownTimer);
      countdownTimer = undefined;
    }
    setCountdownRunId(undefined);
    setCountdownRemainingMs(0);
    setCountdownPaused(false);
    setCountdownFrozenByExecutionPause(false);
  }

  function handleQuestionChoice(answerText: string) {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const question = pendingQuestion();
    if (!project || !question || !project.activeRun) {
      return;
    }

    const sent = sendCommand({
      type: "planning.answer",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: project.activeRun.id,
        questionId: question.id,
        content: answerText,
        ...getComposerControlPayload()
      }
    });

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
    }
  }

  let lastAttachmentDraftKey: string | undefined;
  onMount(() => {
    const key = attachmentDraftKey();
    lastAttachmentDraftKey = key;
    setDraftAttachments(readPersistedDraftAttachments(key, activeProject()?.activeThreadId));
    setAttachmentDraftHydrated(true);
  });

  createEffect(() => {
    const key = attachmentDraftKey();
    if (key === lastAttachmentDraftKey) {
      return;
    }
    setAttachmentDraftHydrated(false);
    lastAttachmentDraftKey = key;
    setDraftAttachments(readPersistedDraftAttachments(key, activeProject()?.activeThreadId));
    setAttachmentDraftHydrated(true);
  });

  createEffect(() => {
    const key = attachmentDraftKey();
    if (!key || !attachmentDraftHydrated()) {
      return;
    }
    persistDraftAttachments(key, draftAttachments());
  });

  async function uploadAttachmentFiles(files: File[]) {
    const project = activeProject();
    if (!project || files.length === 0) {
      return;
    }

    if (!state.attachmentsEnabled) {
      pushToast("Attachments unavailable", "Set UPLOADTHING_TOKEN on the server to enable uploads.", "error");
      return;
    }

    if (draftAttachments().length + files.length > MAX_CHAT_ATTACHMENT_COUNT) {
      pushToast("Too many attachments", `Attach at most ${MAX_CHAT_ATTACHMENT_COUNT} files per message.`, "error");
      return;
    }

    for (const file of files) {
      const validation = isSupportedChatAttachment({
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size
      });
      if (!validation.ok) {
        pushToast("Attachment rejected", `${file.name}: ${validation.reason}`, "error");
        return;
      }
      if (validation.kind === "image" && !hasVisionCapability()) {
        pushToast("Image blocked", "Current model lacks vision support for image attachments.", "error");
        return;
      }
    }

    setUploadingAttachments(true);
    try {
      const uploadedFiles = await uploadFiles("chatAttachment", {
        files,
        input: {
          projectId: project.id,
          threadId: project.activeThreadId
        }
      });

      const nextAttachments = uploadedFiles.flatMap((file) => {
        const detectedAttachment = detectSupportedChatAttachment({ name: file.name, mimeType: file.type });
        if (!detectedAttachment) {
          return [];
        }

        return [
          {
            id: `${file.key}-${file.lastModified ?? Date.now()}`,
            kind: detectedAttachment.kind,
            documentType: detectedAttachment.kind === "document" ? detectedAttachment.documentType : undefined,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            url: file.serverData?.url ?? file.ufsUrl ?? file.url,
            key: file.serverData?.key ?? file.key,
            uploadedAt: file.serverData?.uploadedAt ?? new Date().toISOString()
          } satisfies ChatAttachment
        ];
      });

      setDraftAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      pushToast(
        "Attachment upload failed",
        error instanceof Error ? error.message : "UploadThing could not upload the selected files.",
        "error"
      );
    } finally {
      setUploadingAttachments(false);
    }
  }

  async function handleSelectAttachments(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files ? [...input.files] : [];
    input.value = "";

    await uploadAttachmentFiles(files);
  }

  function handleRemoveAttachment(attachmentId: string) {
    setDraftAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function syncComposerCaret() {
    if (composerTextarea) {
      setComposerCaret(composerTextarea.selectionStart);
    }
  }

  function runWithChatPanelOwner(callback: () => void) {
    if (owner) {
      runWithOwner(owner, callback);
      return;
    }
    callback();
  }

  function dismissComposerLookup(options: { focusComposer?: boolean } = {}) {
    setDismissedComposerLookupKey(composerLookupKey());
    setComposerLookupForcedClosed(true);
    setComposerLookupActiveIndex(0);
    setComposerLookupMenuHidden(true);
    queueMicrotask(() => syncComposerLookupDomVisibility());
    if (options.focusComposer) {
      queueMicrotask(() => composerTextarea?.focus());
    }
  }

  function updateComposerLookupDomSelection(activeIndex: number) {
    composerLookupMenu?.querySelectorAll<HTMLElement>("[data-composer-lookup-option]").forEach((element) => {
      const selected = element.dataset.composerLookupIndex === String(activeIndex);
      element.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function syncComposerLookupDomVisibility(options: { focusMenu?: boolean } = {}) {
    if (!composerLookupMenu) {
      return;
    }
    const open = composerLookupOpen();
    setComposerLookupMenuHidden(!open);
    if (open) {
      updateComposerLookupDomSelection(composerLookupIndex());
      if (options.focusMenu) {
        composerLookupMenu.focus();
      }
    }
  }

  function setComposerLookupMenuHidden(hidden: boolean) {
    if (!composerLookupMenu) {
      return;
    }
    composerLookupMenu.hidden = hidden;
    composerLookupMenu.setAttribute("aria-hidden", hidden ? "true" : "false");
    if (hidden) {
      composerLookupMenu.removeAttribute("role");
      composerLookupMenu.removeAttribute("aria-label");
    } else {
      composerLookupMenu.setAttribute("role", "listbox");
      composerLookupMenu.setAttribute("aria-label", "Composer lookup");
    }
    composerLookupMenu.querySelectorAll<HTMLElement>("[data-composer-lookup-option]").forEach((element) => {
      if (hidden) {
        element.removeAttribute("role");
      } else {
        element.setAttribute("role", "option");
      }
    });
    composerLookupMenu.style.display = hidden ? "none" : "";
  }

  function setComposerLookupActiveIndex(index: number) {
    setComposerLookupIndex(index);
    updateComposerLookupDomSelection(index);
  }

  function applyComposerLookupOption(index = composerLookupIndex()) {
    const lookup = composerLookup();
    const option = composerLookupOptions()[index];
    if (!lookup || !option) {
      return;
    }
    const draft = project().draft;
    const nextDraft = `${draft.slice(0, lookup.start)}${option.insertText}${draft.slice(lookup.end)}`;
    const nextCaret = lookup.start + option.insertText.length;
    setComposerCaret(nextCaret);
    setDismissedComposerLookupKey(composerLookupKey());
    setComposerLookupForcedClosed(true);
    setComposerLookupActiveIndex(0);
    setComposerLookupMenuHidden(true);
    queueMicrotask(() => syncComposerLookupDomVisibility());
    harnessStore.setProjectDraft(project().id, nextDraft);
    queueMicrotask(() => {
      composerTextarea?.setSelectionRange(nextCaret, nextCaret);
      composerTextarea?.focus();
      setComposerCaret(nextCaret);
      resizeComposer();
    });
  }

  function handleComposerLookupKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      if (!composerLookupOpen()) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      setComposerLookupActiveIndex((composerLookupIndex() + 1) % composerLookupOptions().length);
      return true;
    }
    if (event.key === "ArrowUp") {
      if (!composerLookupOpen()) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      setComposerLookupActiveIndex((composerLookupIndex() + composerLookupOptions().length - 1) % composerLookupOptions().length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (!composerLookupOpen()) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      applyComposerLookupOption();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissComposerLookup({ focusComposer: true });
      return true;
    }
    return false;
  }

  function handleComposerKeyDown(event: KeyboardEvent) {
    if (handleComposerLookupKeyDown(event)) {
      return;
    }
    queueMicrotask(syncComposerCaret);
  }

  function handleComposerClick(event: MouseEvent & { currentTarget: HTMLTextAreaElement }) {
    syncComposerCaret();
    if (!event.ctrlKey && !event.metaKey) {
      if (composerLookupOpen()) {
        dismissComposerLookup({ focusComposer: true });
      } else {
        setComposerLookupForcedClosed(false);
        setDismissedComposerLookupKey(undefined);
      }
      return;
    }
    const reference = findChatFileReferenceAtPosition(event.currentTarget.value, event.currentTarget.selectionStart, chatFileLinkContext());
    if (!reference) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handleOpenChatFile(reference.target);
  }

  function handleOpenChatFile(target: ChatFileTarget) {
    const currentProject = activeProject();
    if (!currentProject) {
      return;
    }
    openIdeWindow({ projectId: currentProject.id, threadId: currentProject.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  function handleComposerBadgeClick(event: MouseEvent, badge: ComposerReferenceBadge) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    handleOpenChatFile(badge.target);
  }

  function handleAttachmentDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    setDraggingAttachments(true);
  }

  function handleAttachmentDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDraggingAttachments(false);
  }

  async function handleAttachmentDrop(event: DragEvent) {
    if (!event.dataTransfer?.files.length) {
      return;
    }
    event.preventDefault();
    setDraggingAttachments(false);
    await uploadAttachmentFiles([...event.dataTransfer.files]);
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const submitState = composerSubmitState();
    if (submitState.disabled) {
      if (submitState.disabledReason) {
        pushToast("Cannot send yet", submitState.disabledReason, "error");
      }
      return;
    }

    const project = activeProject();
    if (!project) {
      return;
    }
    const content = project.draft.trim();
    if (!content && draftAttachments().length === 0) {
      return;
    }
    if (!content && draftAttachments().length > 0) {
      pushToast("Task text required", "Describe what pi should do with the attached files.", "error");
      return;
    }

    if (uploadingAttachments()) {
      pushToast("Upload in progress", "Wait for attachments to finish uploading before sending.", "error");
      return;
    }

    if (hasImageDraftAttachments() && !hasVisionCapability()) {
      pushToast(
        "Vision model required",
        "Current model cannot inspect attached images. Switch to a vision-capable model before sending.",
        "error"
      );
      return;
    }

    const question = pendingQuestion();
    if (question && project.activeRun) {
      const sent = sendCommand({
        type: "planning.answer",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          questionId: question.id,
          content,
          attachments: draftAttachments(),
          ...getComposerControlPayload()
        }
      });

      if (sent) {
        harnessStore.setProjectDraft(project.id, "");
        setDraftAttachments([]);
      }
      return;
    }

    if (project.activeRun?.status === "ready") {
      const sent = sendCommand({
        type: "planning.refine",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          runId: project.activeRun.id,
          content,
          attachments: draftAttachments(),
          ...getComposerControlPayload()
        }
      });

      if (sent) {
        harnessStore.setProjectDraft(project.id, "");
        setDraftAttachments([]);
        clearCountdown();
      }
      return;
    }

    if (resumableRun()) {
      pushToast(
        "Resume required",
        "Use the resume action to rerun failed or pending subagents. Draft text is optional guidance for resume.",
        "error"
      );
      return;
    }

    if (selectedAgentId() === "pi" && !hasUsableApiKeyForProvider(state, state.providerBrand)) {
      const fallbackProviderBrand = resolveUsablePiProviderBrand(state);
      if (fallbackProviderBrand) {
        harnessStore.setProviderBrand(fallbackProviderBrand);
        persistProviderPreferences(fallbackProviderBrand);
      } else {
        pushToast(
          `${getProviderBrandLabel(state.providerBrand)} API key required`,
          "Open preferences and add an OpenAI, Google, or Anthropic key before sending chat.",
          "error"
        );
        harnessStore.openPreferencesModal();
        return;
      }
    }

    if (selectedAgentId() !== "pi") {
      const unavailableAgentReason = getSelectedAgentUnavailableReason();
      if (unavailableAgentReason) {
        pushToast("CLI runtime unavailable", unavailableAgentReason, "error");
        return;
      }
    }

    const executionModelId = getEffectiveExecutionModelId();
    const selectedModeId = isAutoModeSelected() ? "auto" : activeMode()?.id;

    const sent = sendCommand({
      type: "chat.send",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        agentId: selectedAgentId(),
        content,
        attachments: draftAttachments(),
        modeId: selectedModeId,
        modeLocked: state.hasGlobalSelectedModeId && selectedModeId !== "auto",
        executionModelId,
        ...getComposerControlPayload(),
        debug: state.debugEnabled
      }
    });

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
      setDraftAttachments([]);
    }
  }

  function handleSelectAgent(agentId: "pi" | "copilot-cli" | "codex-cli") {
    harnessStore.setSelectedAgentId(agentId);
  }

  function resizeComposer() {
    if (!composerTextarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(composerTextarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 18;
    const minHeight = lineHeight * 2;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxHeight = Math.max(lineHeight * 6, Math.floor(viewportHeight * 0.5));
    composerTextarea.style.height = "auto";
    composerTextarea.style.maxHeight = `${maxHeight}px`;
    const nextHeight = Math.max(minHeight, Math.min(composerTextarea.scrollHeight, maxHeight));
    composerTextarea.style.height = `${nextHeight}px`;
  }

  function getSelectedAgentUnavailableReason() {
    if (selectedAgentId() === "pi") {
      return undefined;
    }

    const runtime = selectedAgentRuntime();
    if (!runtime) {
      return "Refresh runtime health before using selected runtime";
    }

    if (!runtime.installed || !runtime.authenticated) {
      return runtime.healthMessage ?? `Install and authenticate ${runtime.label} before sending.`;
    }

    if (!runtime.supportsProgrammatic) {
      return runtime.healthMessage ?? `${runtime.label} cannot send tasks from harness yet.`;
    }

    return undefined;
  }

  function handleStartLiveSession() {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const runtime = selectedAgentRuntime();
    if (!project || !runtime || runtime.agentId === "pi") {
      return;
    }

    sendCommand({
      type: "cli-session.start",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        agentId: runtime.agentId,
        cols: 120,
        rows: 32,
        prompt: project.draft.trim() || undefined,
        runId: project.activeRun?.id
      }
    });
  }

  function handleExecuteRun(runId: string) {
    handleExecuteRunTarget(runId, "current-project");
  }

  function handleExecuteRunTarget(runId: string, target: "current-project" | "ephemeral-experiment") {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "run.execute",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId,
        target,
        ...getComposerControlPayload()
      }
    });
  }

  function handleResumeRun(runId: string) {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    if (!project) {
      return;
    }

    const sent = sendCommand({
      type: "run.resume",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId,
        guidanceText: project.draft.trim() || undefined,
        ...getComposerControlPayload()
      }
    });

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
    }
  }

  function handleRetryRun(runId: string) {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId,
        ...getComposerControlPayload()
      }
    });
  }

  function resolvePlanRun(runId?: string) {
    const project = activeProject();
    if (!project) {
      return;
    }

    return [project.activeRun, project.lastRun].find((entry) => entry?.id === runId) ?? (runId ? undefined : project.activeRun ?? project.lastRun);
  }

  function getPlanRunState(runId: string): AgentRunState | AgentRunSummary | undefined {
    const project = activeProject();
    return [project?.activeRun, project?.lastRun].find((entry) => entry?.id === runId) ?? project?.runSummaries.find((run) => run.id === runId);
  }

  function getPlanRunAction(runId: string) {
    const run = getPlanRunState(runId);
    if (!run) {
      return {
        kind: "unavailable" as const,
        label: "Unavailable",
        tooltip: "This persisted run is not available",
        disabled: true,
        disabledReason: "This run is not available"
      };
    }

    if (["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"].includes(run.status)) {
      return {
        kind: "in-progress" as const,
        label: "In progress",
        tooltip: "This plan is already in progress",
        disabled: true,
        disabledReason: "This plan is already in progress"
      };
    }

    if (run.status === "completed") {
      return {
        kind: "completed" as const,
        label: "Completed",
        tooltip: "This plan has completed",
        disabled: true,
        disabledReason: "This plan has completed"
      };
    }

    if (run.status === "ready") {
      return {
        kind: "execute" as const,
        label: "Build now",
        tooltip: "Build this persisted plan now",
        disabled: executionPaused(),
        disabledReason: executionPauseReason()
      };
    }

    if ((run.status === "partial-complete" || run.status === "stopped") && run.resumable) {
      return {
        kind: "resume" as const,
        label: "Resume",
        tooltip: "Resume this persisted run",
        disabled: executionPaused(),
        disabledReason: executionPauseReason()
      };
    }

    if ((run.status === "failed" || run.status === "partial-complete" || run.status === "stopped") && run.retryable) {
      return {
        kind: "retry" as const,
        label: "Retry",
        tooltip: "Retry this persisted run",
        disabled: executionPaused(),
        disabledReason: executionPauseReason()
      };
    }

    return {
      kind: "unavailable" as const,
      label: "Unavailable",
      tooltip: "This plan cannot be run from its current state",
      disabled: true,
      disabledReason: "This plan cannot be run from its current state"
    };
  }

  function handlePlanRunAction(runId: string) {
    const action = getPlanRunAction(runId);
    if (action.disabled) {
      return;
    }

    if (action.kind === "execute") {
      handleExecuteRun(runId);
      return;
    }

    if (action.kind === "resume") {
      handleResumeRun(runId);
      return;
    }

    if (action.kind === "retry") {
      handleRetryRun(runId);
    }
  }

  function renderPlanRunAction(runId: string) {
    const action = () => getPlanRunAction(runId);
    return (
      <ActionButton
        tooltip={action().tooltip}
        disabledReason={action().disabledReason}
        disabled={action().disabled}
        icon={action().kind === "completed" ? <Check class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} /> : action().kind === "retry" ? <RefreshCcw class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} /> : <Play class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
        size="sm"
        dataTourId={action().kind === "execute" ? "plan-start" : undefined}
        onClick={() => handlePlanRunAction(runId)}
      >
        {action().label}
      </ActionButton>
    );
  }

  function renderTranscriptRow(row: ChatTimelineRow, index: number, project: ViewProjectState) {
    if (row.kind === "tool-block") {
      return <StreamedToolBlock block={row.block} fileLinks={chatFileLinks()} />;
    }

    if (row.kind === "live") {
      return (
        <article
          {...stylex.attrs(
            styles.transcriptCard,
            styles.transcriptCardLive,
            row.message.kind === "status" ? styles.transcriptStatus : styles.transcriptAssistant
          )}
        >
          <div {...stylex.attrs(styles.transcriptRole, styles.transcriptRoleHarness)}>harness</div>
          <MarkdownContent content={() => row.message.content} size="compact" live={!row.message.locked && row.liveIndex === liveHarnessMessages().length - 1} fileLinks={chatFileLinks()} />
          {renderMessageActionRow(
            liveHarnessMessageTimestamp(),
            <CopyTextButton
              value={row.message.content}
              tooltip="Copy harness message"
              copiedTitle="Message copied"
              copiedDescription="Message copied to clipboard."
              size="sm"
              variant="ghost"
              ariaLabel="Copy harness message"
            >
              Copy
            </CopyTextButton>
          )}
        </article>
      );
    }

    const message = row.message;
    if (shouldHidePersistedStreamingAssistantMessage(project, message)) {
      return null;
    }

    return (
      <Show
        when={message.kind === "plan-summary" && message.metadata?.type === "plan-summary"}
        fallback={
          <article
            {...stylex.attrs(
              styles.transcriptCard,
              isHarnessTranscriptMessage(message)
                ? message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open"
                  ? styles.transcriptMilestones
                  : styles.transcriptAssistant
                : styles.transcriptUser
            )}
          >
            <div {...stylex.attrs(styles.transcriptContents)}>
              <div {...stylex.attrs(styles.inlineRow)}>
                <div
                  {...stylex.attrs(
                    styles.transcriptRole,
                    isHarnessTranscriptMessage(message) ? styles.transcriptRoleHarness : styles.transcriptRoleUser
                  )}
                >
                  {getTranscriptRoleLabel(message.role)}
                </div>
                <Show when={message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open"}>
                  <span {...stylex.attrs(styles.progressChip)}>
                    In progress
                  </span>
                </Show>
              </div>
              <MarkdownContent content={() => message.content} size="compact" fileLinks={chatFileLinks()} />
              <Show when={message.metadata?.type === "assistant-action"}>
                {renderAssistantActionCard(message.metadata as AssistantActionMessageMetadata)}
              </Show>
              <Show when={message.attachments?.length}>
                <div {...stylex.attrs(styles.attachmentList)}>
                  <For each={message.attachments}>
                    {(attachment) => (
                      <a
                        {...stylex.attrs(styles.attachmentLink)}
                        href={attachment.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {attachment.kind} | {attachment.name}
                      </a>
                    )}
                  </For>
                </div>
              </Show>
              {renderMessageActionRow(
                message.createdAt,
                <CopyTextButton
                  value={getCopyableMessageText(message)}
                  tooltip="Copy message"
                  copiedTitle="Message copied"
                  copiedDescription="Message copied to clipboard."
                  size="sm"
                  variant="ghost"
                  ariaLabel={getCopyAriaLabel(message)}
                >
                  Copy
                </CopyTextButton>
              )}
            </div>
          </article>
        }
      >
        <article class={stylex.attrs(chatUtilityStyles.themeSelectedSurface, chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded3xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.p4, chatUtilityStyles.shadowSm).class}>
          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking02em, chatUtilityStyles.textVariableAccentStrong).class}>
            <Clipboard class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
            Plan summary
          </div>
          <MarkdownContent content={() => getPlanFromMessage(message)?.summary ?? ""} fileLinks={chatFileLinks()} />
          <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted, chatUtilityStyles.mdGridCols2).class}>
            <div>Route: {getPlanFromMessage(message)?.route}</div>
            <div>Difficulty: {getPlanFromMessage(message)?.difficultyScore}%</div>
            <div>Parallel slots: {getPlanFromMessage(message)?.actualSubagentCount}</div>
            <div>Prereqs: {getPlanFromMessage(message)?.prerequisites.length}</div>
            <div>Contracts: {getPlanFromMessage(message)?.contracts.length}</div>
            <div>Isolation: {getPlanFromMessage(message)?.subagentWorktreeStrategy}</div>
            <div>Correctness: {getPlanFromMessage(message)?.correctnessPolicy}</div>
          </div>
          <Show when={hasBranchfsSizeWarning()}>
            <div class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.wFit, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap1, chatUtilityStyles.rounded, chatUtilityStyles.border, chatUtilityStyles.borderAmber300, chatUtilityStyles.bgAmber50, chatUtilityStyles.px2, chatUtilityStyles.py1, chatUtilityStyles.text0625rem, chatUtilityStyles.fontMedium, chatUtilityStyles.textAmber800).class}>
              <AlertTriangle class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />
              BranchFS large
            </div>
          </Show>
          <div class={stylex.attrs(chatUtilityStyles.mt3, chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
            <div class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.text0575rem, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
              {formatShortTimestamp(message.createdAt)}
            </div>
            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.justifyEnd, chatUtilityStyles.gap2).class}>
              <ActionButton
                tooltip="Open full execution plan"
                icon={<Clipboard class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                size="sm"
                variant="secondary"
                onClick={() => {
                  const plan = getPlanFromMessage(message);
                  if (plan) {
                    harnessStore.openExecutionPlanDialog(plan);
                  }
                }}
              >
                Open plan
              </ActionButton>
              <ActionButton
                tooltip="Promote this run into scheduled task"
                icon={<CalendarClock class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                size="sm"
                variant="secondary"
                onClick={() => handlePromoteScheduledRun((message.metadata as { runId: string }).runId)}
              >
                Schedule
              </ActionButton>
              {renderPlanRunAction((message.metadata as { runId: string }).runId)}
              <Show when={getPlanFromMessage(message)?.gating.mode === "approve"}>
                <ActionButton
                  tooltip="Run this plan in isolated virtual branch"
                  disabledReason={
                    getPlanRunAction((message.metadata as { runId: string }).runId).kind === "execute"
                      ? executionPauseReason()
                      : "This plan is not ready to build"
                  }
                  disabled={getPlanRunAction((message.metadata as { runId: string }).runId).kind !== "execute" || executionPaused()}
                  size="sm"
                  variant="secondary"
                  onClick={() => handleExecuteRunTarget((message.metadata as { runId: string }).runId, "ephemeral-experiment")}
                >
                  Try experiment
                </ActionButton>
              </Show>
              <Show when={getPlanFromMessage(message)?.gating.mode === "countdown" && readyRun()?.id === (message.metadata as { runId: string }).runId}>
                <ActionButton
                  tooltip={
                    executionPaused()
                      ? "Global pause freezes automatic execution countdown"
                      : countdownPaused()
                        ? "Resume automatic execution countdown"
                        : "Pause automatic execution countdown"
                  }
                  disabled={executionPaused()}
                  disabledReason={executionPauseReason()}
                  icon={countdownPaused() ? <Play class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} /> : <Pause class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                  size="sm"
                  variant="secondary"
                  onClick={() => (countdownPaused() ? handleResumeAutoRun() : handlePauseAutoRun())}
                >
                  {countdownPaused() ? "Resume auto-run" : "Pause auto-run"}
                </ActionButton>
              </Show>
              <CopyTextButton
                value={getCopyableMessageText(message)}
                tooltip="Copy plan summary"
                copiedTitle="Plan summary copied"
                copiedDescription="Plan summary copied to clipboard."
                size="sm"
                variant="secondary"
                ariaLabel="Copy plan summary"
              >
                Copy
              </CopyTextButton>
            </div>
          </div>
        </article>
      </Show>
    );
  }

  function handleInspectExperiment() {
    const project = activeProject();
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    if (!project || !run?.experiment) {
      return;
    }

    setExperimentDialogOpen(true);
    sendCommand({
      type: "experiment.inspect",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id
      }
    });
  }

  function handlePromoteExperiment() {
    const project = activeProject();
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    if (!project || !run?.experiment) {
      return;
    }

    sendCommand({
      type: "experiment.promote",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id
      }
    });
  }

  function handleDiscardExperiment() {
    const project = activeProject();
    const run = activeProject()?.activeRun ?? activeProject()?.lastRun;
    if (!project || !run?.experiment) {
      return;
    }

    sendCommand({
      type: "experiment.discard",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        runId: run.id
      }
    });
  }

  function handleLoadMemoryEntries() {
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "memory.list",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleSelectPaneTab(tab: ChatPaneTab) {
    harnessStore.setChatPaneTab(tab);
    if (tab === "memory" && state.connectionState === "connected") {
      queueMicrotask(handleLoadMemoryEntries);
    }
  }

  function handleUpdateMemory(entryId: string, patch: { pinned?: boolean; status?: "active" | "archived" }) {
    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.update",
      requestId: createRequestId(),
      payload: {
        memoryEntryId: entryId,
        ...patch
      }
    });
  }

  function handleReorderMemory(entryId: string, direction: "up" | "down") {
    const project = activeProject();
    if (!project) {
      return;
    }

    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.reorder",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        memoryEntryId: entryId,
        direction
      }
    });
  }

  function handleDeleteMemory(entryId: string) {
    if (deleteArmedMemoryId() !== entryId) {
      setDeleteArmedMemoryId(entryId);
      return;
    }

    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.delete",
      requestId: createRequestId(),
      payload: {
        memoryEntryId: entryId
      }
    });
  }

  function handleResume() {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const run = resumableRun();
    if (!project || !run) {
      return;
    }

    const sent = sendCommand({
      type: "run.resume",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        guidanceText: project.draft.trim() || undefined,
        ...getComposerControlPayload()
      }
    });

    if (sent) {
      harnessStore.setProjectDraft(project.id, "");
    }
  }

  function handleReset() {
    const project = activeProject();
    if (!project) {
      return;
    }
    sendCommand({
      type: "thread.create",
      requestId: createRequestId(),
      payload: {
        projectId: project.id
      }
    });
  }

  function handleForkThread() {
    const project = activeProject();
    if (!project) {
      return;
    }
    sendCommand({
      type: "thread.fork",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        sourceThreadId: project.activeThreadId
      }
    });
  }

  function handleStop() {
    const project = activeProject();
    if (!project?.activeRun) {
      return;
    }
    sendCommand({
      type: "chat.stop",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: project.activeRun.id
      }
    });
  }

  function handleRetry() {
    if (executionPaused()) {
      return;
    }
    const project = activeProject();
    const run = retryableRun();
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        ...getComposerControlPayload()
      }
    });
  }

  function handlePauseAutoRun() {
    if (countdownRunId() === undefined || executionPaused()) {
      return;
    }

    if (countdownTimer !== undefined) {
      window.clearInterval(countdownTimer);
      countdownTimer = undefined;
    }
    setCountdownPaused(true);
  }

  function handleResumeAutoRun() {
    const runId = countdownRunId();
    const run = readyRun();
    if (!runId || !run || run.id !== runId || countdownRemainingMs() <= 0 || executionPaused()) {
      return;
    }

    setCountdownPaused(false);
    startCountdown(run.id);
  }

  function handleStartRenameThread() {
    const thread = activeThread();
    if (!thread) {
      return;
    }

    setThreadTitleDraft(thread.title);
    setEditingThreadTitle(true);
  }

  function handleCommitRenameThread() {
    const project = activeProject();
    const thread = activeThread();
    const title = threadTitleDraft().trim();
    if (!project || !thread || !title) {
      setEditingThreadTitle(false);
      return;
    }

    sendCommand({
      type: "thread.rename",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: thread.id,
        title
      }
    });
    setEditingThreadTitle(false);
  }

  function getCopyableMessageText(message: ChatMessage) {
    if (message.kind !== "plan-summary" || message.metadata?.type !== "plan-summary") {
      return message.content;
    }

    const { plan } = message.metadata;
    return [
      "Plan summary",
      plan.summary,
      `Route: ${plan.route}`,
      `Difficulty: ${plan.difficultyScore}%`,
      `Prereqs: ${plan.prerequisites.length}`,
      `Contracts: ${plan.contracts.length}`,
      `Isolation: ${plan.subagentWorktreeStrategy}`,
      `Correctness: ${plan.correctnessPolicy}`
    ].join("\n");
  }

  function getEffectiveExecutionModelId() {
    return state.selectedExecutionModelId ?? getFallbackExecutionModelIdForAgent(state, selectedAgentId(), state.providerBrand);
  }

  function getContextUsageTooltip() {
    const usage = contextUsage();
    if (!usage) {
      return undefined;
    }

    const summary = `${Math.round(usage.usagePercent ?? 0)}% · ${formatTokenCount(usage.tokens)} / ${formatTokenCount(usage.contextWindow)} context used`;
    const cacheHitPercent = getCacheHitPercent(usage);
    const cacheLine =
      cacheHitPercent === undefined
        ? undefined
        : `Cache hit: ${cacheHitPercent}% (${formatTokenCount(usage.cachedInputTokens)} tokens)`;
    const totalProcessedLine =
      usage.totalProcessedTokens === undefined ? undefined : `Total processed: ${formatTokenCount(usage.totalProcessedTokens)} tokens`;
    return [summary, cacheLine, totalProcessedLine, "Automatically compacts its context when needed."].filter(Boolean).join("\n");
  }

  function getCacheHitPercent(usage: { tokens?: number; cachedInputTokens?: number }) {
    const cachedInputTokens = usage.cachedInputTokens ?? 0;
    const totalInputTokens = (usage.tokens ?? 0) + cachedInputTokens;
    if (cachedInputTokens <= 0 || totalInputTokens <= 0) {
      return undefined;
    }

    return Math.round((cachedInputTokens / totalInputTokens) * 100);
  }

  function handleProviderBrandSelect(providerBrand: ProviderBrand) {
    if (!canSelectProviderBrand(state, providerBrand)) {
      pushToast("Provider key required", `Saved ${getProviderBrandLabel(providerBrand)} key required.`, "error");
      return;
    }

    harnessStore.setProviderBrand(providerBrand);
    persistProviderPreferences(providerBrand);
  }

  function persistProviderPreferences(providerBrand: ProviderBrand) {
    savePreferences({ providerBrand });
  }

  function savePreferences(overrides: { providerBrand?: ProviderBrand; blockChatOnDirtyGitDefault?: boolean } = {}) {
    const providerBrand = overrides.providerBrand ?? state.providerBrand;
    const blockChatOnDirtyGitDefault = overrides.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault;
    persistMergedLocalPreferences({
      openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
      googleApiKey: state.googleApiKeyDraft.trim() || undefined,
      anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
      providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
      maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault
    });

    sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
        providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
        maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
        memoryBankEnabledDefault: state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: state.checkCliUpdatesDefault
      }
    });
  }

  function handleExecutionModelSelect(modelId: string) {
    harnessStore.setSelectedExecutionModelId(modelId);
  }

  function handleReasoningStrengthSelect(reasoningStrength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
    harnessStore.setSelectedReasoningStrength(reasoningStrength);
  }

  function handleFastModeSelect(enabled: boolean) {
    harnessStore.setSelectedFastMode(enabled);
  }

  function getComposerControlPayload() {
    return {
      reasoningStrength: selectedReasoningStrength(),
      fastMode: selectedFastMode()
    };
  }

  function renderComposerControlMenu() {
    const disabledHint =
      COMPOSER_REASONING_STRENGTHS.some((strength) => !composerControlState().availableStrengths.includes(strength)) ||
      !composerControlState().supportsFastMode
        ? "Unavailable for current runtime/model."
        : undefined;

    return (
      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap05).class}>
          <span class={stylex.attrs(chatUtilityStyles.px1, chatUtilityStyles.text0375rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>Effort</span>
          <For each={COMPOSER_REASONING_STRENGTHS}>
            {(strength) => {
              const enabled = composerControlState().availableStrengths.includes(strength);
              const selected = selectedReasoningStrength() === strength;
              return (
            <Tooltip content={getReasoningStrengthDescription(strength)} triggerClass={stylex.attrs(styles.tooltipBlock).class} side="right">
                  <button
                    type="button"
                    disabled={!enabled}
                    class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.wFull, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.roundedLg, chatUtilityStyles.px15, chatUtilityStyles.py1, chatUtilityStyles.textLeft, chatUtilityStyles.text0525rem, chatUtilityStyles.textVariableForeground, chatUtilityStyles.transition, chatUtilityStyles.hoverBgBlack5, chatUtilityStyles.disabledCursorNotAllowed, chatUtilityStyles.disabledOpacity50).class}
                    onClick={() => {
                      if (!enabled) {
                        return;
                      }
                      handleReasoningStrengthSelect(strength);
                    }}
                  >
                    <span>{formatReasoningOptionLabel(strength)}</span>
                    <Show when={selected}>
                      <Check class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />
                    </Show>
                  </button>
                </Tooltip>
              );
            }}
          </For>
        </div>
        <div class={stylex.attrs(chatUtilityStyles.hPx, chatUtilityStyles.bgBlack10).class} />
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap05).class}>
          <span class={stylex.attrs(chatUtilityStyles.px1, chatUtilityStyles.text0375rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>Fast mode</span>
          <For each={[false, true] as const}>
            {(enabled) => {
              const supported = !enabled || composerControlState().supportsFastMode;
              const selected = selectedFastMode() === enabled;
              return (
            <Tooltip content={getFastModeDescription(enabled)} triggerClass={stylex.attrs(styles.tooltipBlock).class} side="right">
                  <button
                    type="button"
                    disabled={!supported}
                    class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.wFull, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.roundedLg, chatUtilityStyles.px15, chatUtilityStyles.py1, chatUtilityStyles.textLeft, chatUtilityStyles.text0525rem, chatUtilityStyles.textVariableForeground, chatUtilityStyles.transition, chatUtilityStyles.hoverBgBlack5, chatUtilityStyles.disabledCursorNotAllowed, chatUtilityStyles.disabledOpacity50).class}
                    onClick={() => {
                      if (!supported) {
                        return;
                      }
                      handleFastModeSelect(enabled);
                    }}
                  >
                    <span>{enabled ? "On" : "Off"}</span>
                    <Show when={selected}>
                      <Check class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />
                    </Show>
                  </button>
                </Tooltip>
              );
            }}
          </For>
        </div>
        <Show when={disabledHint}>
          <div class={stylex.attrs(chatUtilityStyles.px1, chatUtilityStyles.text045rem, chatUtilityStyles.textVariableMuted).class}>{disabledHint}</div>
        </Show>
      </div>
    );
  }

  function getComposerPlaceholder() {
    const project = activeProject();
    if (!project) {
      return "Add project path or browse for folder to start.";
    }

    if (pendingQuestion()) {
      return "Answer planner question...";
    }

    if (resumableRun()) {
      return "Optional guidance for resume...";
    }

    if (project.activeRun?.status === "ready") {
      return "Refine plan before execution...";
    }

    return `Ask ${selectedAgentId()} to work inside ${project.rootPath}...`;
  }

  function handleBrowseProject() {
    sendCommand({
      type: "project.browse",
      requestId: createRequestId()
    });
  }

  function handleModeSelect(modeId: string) {
    harnessStore.setSelectedModeId(modeId);
  }

  function handleSaveProjectContext() {
    const project = activeProject();
    if (!project) {
      return;
    }

    sendCommand({
      type: "project.context.save",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        rulesContent: projectRulesDraft().trim() || undefined,
        threadMemorySummaryContent: threadMemoryDraft().trim() || undefined
      }
    });
  }

  function handlePromoteScheduledRun(runId?: string) {
    const project = activeProject();
    if (!project) {
      return;
    }

    const run = resolvePlanRun(runId);
    if (!run) {
      pushToast("Run required", "No AI run available to promote.", "error");
      return;
    }

    const suggestedName =
      run.summary?.split(".")[0]?.trim() ||
      run.latestUserPrompt.replace(/\s+/g, " ").trim().slice(0, 64) ||
      "Scheduled task";

    harnessStore.openBackgroundJobEditor({
      source: "promote",
      projectId: project.id,
      createdFromRunId: run.id,
      kind: "ai-routine",
      name: suggestedName,
      description: "",
      scheduleInput: "",
      timezone: resolveBrowserTimezone(),
      aiPrompt: run.latestUserPrompt,
      aiModeId: activeMode()?.id,
      aiExecutionModelId: run.executionModelId ?? getEffectiveExecutionModelId(),
      aiReasoningStrength: selectedReasoningStrength(),
      aiFastMode: selectedFastMode(),
      aiPlanExecutionMode: run.plan?.gating.mode ?? state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy: run.plan?.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault,
      shellExecutable: "",
      shellArgsText: "",
      shellCwd: "",
      shellEnvRefsText: "",
      shellTimeoutSeconds: 600,
      shellNetworkAccess: false
    });
  }

  function handleOpenCurrentRunJob() {
    const backgroundRun = currentBackgroundRun();
    if (!backgroundRun) {
      return;
    }

    openBackgroundRunInJobsPane(state, backgroundRun.id, backgroundRun.jobId);
  }

  function handleOpenThreadTerminalHistory() {
    const project = activeProject();
    if (!project) {
      return;
    }
    sendCommand({
      type: "terminal.history.list",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId
      }
    });
    setTerminalHistoryOpen(true);
  }

  function handleAssistantActionCardAction(metadata: AssistantActionMessageMetadata, actionKind: AssistantActionMessageMetadata["actions"][number]["kind"]) {
    const project = activeProject();
    if (actionKind === "open-assistant") {
      harnessStore.setSelectedAssistantId(metadata.assistantId);
      harnessStore.setActiveSurface("assistants");
      return;
    }
    if (actionKind === "open-jobs") {
      harnessStore.setActiveSurface("background-jobs");
      return;
    }
    if (actionKind === "schedule-job") {
      harnessStore.setSelectedAssistantId(metadata.assistantId);
      harnessStore.setActiveSurface("background-jobs");
      return;
    }
    if (actionKind === "retry-bootstrap") {
      sendCommand({
        type: "assistant.bootstrap.retry",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId
        }
      });
      return;
    }
    if (actionKind === "pause" || actionKind === "resume") {
      sendCommand({
        type: actionKind === "pause" ? "assistant.pause" : "assistant.resume",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId
        }
      });
      return;
    }
    if (actionKind === "recover") {
      sendCommand({
        type: "assistant.circuit-breaker.retry",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId
        }
      });
      return;
    }
    if (actionKind === "run-job" && project && metadata.jobId) {
      sendCommand({
        type: "background-job.run-now",
        requestId: createRequestId(),
        payload: {
          projectId: project.id,
          jobId: metadata.jobId
        }
      });
      return;
    }
    if (actionKind === "answer-question" && metadata.questionId) {
      sendCommand({
        type: "assistant.question.answer",
        requestId: createRequestId(),
        payload: {
          assistantId: metadata.assistantId,
          questionId: metadata.questionId,
          content: "Acknowledged from project chat."
        }
      });
    }
  }

  function renderAssistantActionCard(metadata: AssistantActionMessageMetadata) {
    return (
      <div data-test-assistant-action-card="" class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderTeal70020, chatUtilityStyles.bgWhite75, chatUtilityStyles.p3).class}>
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking02em, chatUtilityStyles.textVariableAccentStrong).class}>
          <Bot class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
          Assistant action
        </div>
        <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted, chatUtilityStyles.mdGridCols2).class}>
          <For each={metadata.summaryRows}>
            {(row) => (
              <div class={stylex.attrs(chatUtilityStyles.minW0).class}>
                <span class={stylex.attrs(chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{row.label}: </span>
                <span class={stylex.attrs(chatUtilityStyles.wrapBreakWords).class}>{row.value}</span>
              </div>
            )}
          </For>
        </div>
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
          <For each={metadata.actions}>
            {(action) => (
              <ActionButton
                tooltip={action.disabled ? action.disabledReason ?? action.label : action.label}
                disabled={action.disabled}
                disabledReason={action.disabledReason}
                icon={
                  action.kind === "open-jobs" || action.kind === "run-job" ? (
                    <Briefcase class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                  ) : action.kind === "schedule-job" ? (
                    <CalendarClock class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                  ) : action.kind === "pause" ? (
                    <Pause class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                  ) : action.kind === "resume" ? (
                    <Play class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                  ) : action.kind === "recover" || action.kind === "retry-bootstrap" ? (
                    <RefreshCcw class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                  ) : (
                    <Bot class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                  )
                }
                size="sm"
                variant="secondary"
                onClick={() => handleAssistantActionCardAction(metadata, action.kind)}
              >
                {action.label}
              </ActionButton>
            )}
          </For>
        </div>
      </div>
    );
  }

  return (
    <>
    <section data-test-chat-panel="" class={stylex.attrs(chatUtilityStyles.panelShell, chatUtilityStyles.flex, chatUtilityStyles.hFull, chatUtilityStyles.minH0, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded2xl, chatUtilityStyles.borderT0, chatUtilityStyles.p08rem).class}>
      <Dialog
        open={Boolean(state.blockingNonGitPreflight)}
        title="Git setup required"
        eyebrow="Preflight"
        description="Dirty-git protection cannot verify this folder because it is not a git repository."
        onClose={handleCancelNonGitPreflight}
        footer={
          <>
            <ActionButton tooltip="Initialize git and commit the current folder baseline" type="button" onClick={handleInitGitBaseline}>
              Init Git
            </ActionButton>
            <ActionButton tooltip="Disable dirty-git protection and retry this run" type="button" variant="secondary" onClick={handleDisableDirtyGitCheck}>
              Disable check and continue
            </ActionButton>
            <ActionButton tooltip="Cancel this run" type="button" variant="ghost" onClick={handleCancelNonGitPreflight}>
              Cancel
            </ActionButton>
          </>
        }
      >
        <div class={stylex.attrs(chatUtilityStyles.spaceY2, chatUtilityStyles.textXs, chatUtilityStyles.leading6, chatUtilityStyles.textVariableMuted).class}>
          <p>{state.blockingNonGitPreflight?.preflight.repairSummary}</p>
          <p>{state.blockingNonGitPreflight?.preflight.repairDetail}</p>
        </div>
      </Dialog>
      <Show when={shouldShowSetupChecklist(state)}>
        <SetupChecklistCard
          checks={state.setup.checks}
          readyRequiredCount={state.setup.readyRequiredCount}
          totalRequiredCount={state.setup.totalRequiredCount}
          onAction={handleSetupAction}
          onOpenHelp={() => harnessStore.openHelpDialog()}
          onDismiss={() => harnessStore.closeSetupChecklist()}
        />
      </Show>
      <Show
        when={activeProject()}
        fallback={
          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flex1, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter).class}>
            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.wFull, chatUtilityStyles.maxW2xl, chatUtilityStyles.flexCol, chatUtilityStyles.gap4, chatUtilityStyles.rounded175rem, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite45, chatUtilityStyles.p6, chatUtilityStyles.shadowSm, chatUtilityStyles.mdP8).class}>
              <div class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.roundedFull, chatUtilityStyles.bgWhite65, chatUtilityStyles.px3, chatUtilityStyles.py1, chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking02em, chatUtilityStyles.textVariableMuted).class}>
                First run
              </div>
              <h1 class={stylex.attrs(chatUtilityStyles.fontDisplay, chatUtilityStyles.text175rem, chatUtilityStyles.tracking006em, chatUtilityStyles.textVariableForeground, chatUtilityStyles.mdText21rem).class}>
                Start with repo, import, or pasted spec
              </h1>
              <p class={stylex.attrs(chatUtilityStyles.maxW2xl, chatUtilityStyles.text075rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableMuted).class}>
                Task-first flow: open codebase, optionally import local defaults, then ask for plan or implementation. No API-key wall.
              </p>
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite60, chatUtilityStyles.p4).class}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                  <ActionButton
                    tooltip="Open project switcher"
                    icon={<Folder class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                    dataTourId="open-project"
                    onClick={() => harnessStore.openProjectSwitcher()}
                  >
                    Open project
                  </ActionButton>
                  <ActionButton
                    tooltip="Browse for project folder"
                    icon={<FolderOpen class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                    variant="secondary"
                    onClick={handleBrowseProject}
                  >
                    Browse folder
                  </ActionButton>
                  <ActionButton
                    tooltip="Open import and workspace setup"
                    icon={<Edit3 class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                    variant="secondary"
                    dataTourId="help-preferences"
                    onClick={() => harnessStore.openPreferencesModal()}
                  >
                    Import config
                  </ActionButton>
                </div>
                <div class={stylex.attrs(chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite70, chatUtilityStyles.p3, chatUtilityStyles.text0675rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableMuted).class}>
                  Sample task: “Inspect recent auth changes, plan fix for flaky login, then implement with tests.”
                </div>
                <div class={stylex.attrs(chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite70, chatUtilityStyles.p3, chatUtilityStyles.text0675rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableMuted).class}>
                  Open repo, attach screenshots, PDFs, or office docs, then ask for a plan. Images route to vision-capable models; text and document files get folded into prompt context.
                </div>
              </div>
            </div>
          </div>
        }
      >
          <>
          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.borderB, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.pb3, chatUtilityStyles.lgFlexRow, chatUtilityStyles.lgItemsStart, chatUtilityStyles.lgJustifyBetween).class}>
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flex1, chatUtilityStyles.flexCol, chatUtilityStyles.gap15).class}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>
                  <Folder class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35, chatUtilityStyles.shrink0, chatUtilityStyles.textVariableAccent).class} />
                <Tooltip content={project().rootPath} triggerClass={stylex.attrs(styles.tooltipMinWidth).class}>
                    <span class={stylex.attrs(chatUtilityStyles.block, chatUtilityStyles.minW0, chatUtilityStyles.truncate).class}>{project().name}</span>
                  </Tooltip>
                </div>
                <div class={stylex.attrs(chatUtilityStyles.minW0).class}>
                  <div class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.minW0, chatUtilityStyles.maxWFull, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap15).class}>
                    <Show
                      when={editingThreadTitle()}
                      fallback={
                    <Tooltip content={activeThread()?.title ?? "Thread"} triggerClass={stylex.attrs(styles.tooltipThreadTitle).class}>
                          <h3 class={stylex.attrs(chatUtilityStyles.maxWFull, chatUtilityStyles.truncate, chatUtilityStyles.fontDisplay, chatUtilityStyles.text135rem, chatUtilityStyles.textVariableForeground, chatUtilityStyles.mdText165rem).class}>
                            {activeThread()?.title ?? "Thread"}
                          </h3>
                        </Tooltip>
                      }
                    >
                      <Input
                        class={stylex.attrs(chatUtilityStyles.maxW2xl).class}
                        value={threadTitleDraft()}
                        onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
                          setThreadTitleDraft(event.currentTarget.value)
                        }
                        onBlur={handleCommitRenameThread}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitRenameThread();
                          }
                          if (event.key === "Escape") {
                            setEditingThreadTitle(false);
                          }
                        }}
                      />
                    </Show>
                    <ActionButton
                      tooltip="Rename this thread"
                      icon={<Edit3 class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                      size="icon"
                      variant="ghost"
                      ariaLabel="Rename this thread"
                      onClick={handleStartRenameThread}
                    />
                  </div>
                  <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.text0625rem, chatUtilityStyles.textVariableMuted).class}>
                    <span>{activeThread()?.messageCount ?? 0} msgs</span>
                    <span class={stylex.attrs(chatUtilityStyles.h1, chatUtilityStyles.w1, chatUtilityStyles.roundedFull, chatUtilityStyles.bgVariableBorder).class} />
                    <span>thread</span>
                    <span class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.maxWFull, chatUtilityStyles.breakAll, chatUtilityStyles.fontMono, chatUtilityStyles.text06rem).class}>{activeThread()?.id}</span>
                    <CopyTextButton
                      value={activeThread()?.id ?? ""}
                      tooltip="Copy thread id"
                      copiedTitle="Thread id copied"
                      copiedDescription={activeThread()?.id}
                      size="icon"
                      variant="ghost"
                      ariaLabel="Copy thread id"
                    />
                  </div>
                </div>
              </div>

              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.shrink0, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2, chatUtilityStyles.lgJustifyEnd).class}>
                <ActionButton
                  tooltip={tooltipWithPrimaryHotkey(
                    "Create a new thread in this project",
                    normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).createProjectChat[0]
                  )}
                  icon={<Plus class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                  variant="secondary"
                  onClick={handleReset}
                />
                <ActionButton
                  tooltip="Fork current thread into a new thread"
                  icon={<Split class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                  variant="secondary"
                  onClick={handleForkThread}
                />
                <ActionButton
                  tooltip="Open terminal history for this thread"
                  ariaLabel="Open thread terminal history"
                  icon={<Terminal class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                  variant="secondary"
                  onClick={handleOpenThreadTerminalHistory}
                />
                <ActionButton
                  tooltip="Stop active run"
                  disabledReason="No running task"
                  disabled={!activeThreadIsStreaming()}
                  icon={<Pause class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                  variant="secondary"
                  onClick={handleStop}
                >
                  Stop
                </ActionButton>
                    <Show when={retryableRun()}>
                      <ActionButton
                        tooltip="Retry last run"
                        disabledReason="Project is streaming"
                        disabled={activeThreadIsStreaming()}
                        icon={<RefreshCcw class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                        variant="secondary"
                        onClick={handleRetry}
                  />
                </Show>
              </div>
            </div>

            <div {...stylex.attrs(styles.paneBody)}>
            <Show when={currentTab()} keyed>
              {(selectedTab) => (
                <div {...stylex.attrs(styles.paneColumn)}>
                  <div data-test-chat-pane-nav="" role="tablist" aria-label="Project panes" {...stylex.attrs(styles.paneTabs)}>
                    <div {...stylex.attrs(styles.paneTabList)}>
                      <For each={visibleTabs()}>
                        {(tab) => {
                          const pressed = selectedTab === tab.id;

                          return (
                            <Button
                              tooltip={tab.tooltip}
                              type="button"
                              role="tab"
                              variant="ghost"
                              class={stylex.attrs(styles.paneTab, pressed ? styles.paneTabSelected : styles.paneTabIdle).class}
                              aria-label={tab.label}
                              attr:aria-selected={pressed ? "true" : "false"}
                              tabIndex={pressed ? 0 : -1}
                              data-test-chat-pane-tab={tab.id}
                              onClick={() => handleSelectPaneTab(tab.id)}
                            >
                              {tab.icon}
                              <span>{tab.label}</span>
                            </Button>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                  <Show when={resumableRun()}>
                    {(run) => (
                      <div {...stylex.attrs(styles.resumableBanner)}>
                        <div {...stylex.attrs(styles.minWidthZero)}>
                          <div {...stylex.attrs(styles.resumableHeading)}>
                            <AlertTriangle {...stylex.attrs(styles.iconSmall)} />
                            Resumable run
                          </div>
                          <div {...stylex.attrs(styles.resumableStatus)}>
                            Status: {run().status}. Failed subtasks: {failedSubtaskCount()}.
                          </div>
                          <div {...stylex.attrs(styles.resumableDetail)}>
                            Resume reruns failed or pending subtasks only. Composer text becomes extra guidance.
                          </div>
                        </div>
                        <ActionButton
                          tooltip="Resume failed or pending subagents"
                          disabledReason={
                            executionPaused()
                              ? executionPauseReason()
                              : activeThreadIsStreaming()
                                ? "Project is streaming"
                                : "No resumable run"
                          }
                          disabled={executionPaused() || !resumableRun() || activeThreadIsStreaming()}
                          icon={<RefreshCcw class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                          type="button"
                          onClick={handleResume}
                        >
                          Resume failed agents
                        </ActionButton>
                      </div>
                    )}
                  </Show>

                  <Switch>
                    <Match when={selectedTab === "chat"}>
                      <div class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.flex, chatUtilityStyles.minH0, chatUtilityStyles.flex1, chatUtilityStyles.flexCol).class}>
                        <VirtualList
                          viewportRef={(element) => {
                            messageViewport = element;
                          }}
                          class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}
                    contentClass={stylex.attrs(styles.virtualContent).class}
                    itemClass={stylex.attrs(styles.virtualItem).class}
                          dataTest="project-chat-transcript"
                          items={transcriptRows()}
                          getKey={(row, index) => row.kind === "persisted" ? row.message.id : row.kind === "tool-block" ? row.block.id : `live-${row.message.id}-${index}`}
                          estimateSize={estimateTranscriptRowSize}
                          pagination={{ kind: "reverse", initialCount: CHAT_TRANSCRIPT_LIMIT, batchSize: CHAT_TRANSCRIPT_LIMIT, thresholdPx: 1000 }}
                          overscan={20}
                          stickToEnd
                          onScroll={updateScrollLock}
                          empty={
                            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minH44, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite38, chatUtilityStyles.p6, chatUtilityStyles.textCenter, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                              No messages in this thread yet. Send a task from the composer.
                            </div>
                          }
                        >
                          {(row, index) => renderTranscriptRow(row, index, project())}
                        </VirtualList>
                        <Show when={!stickToBottom()}>
                          <div class={stylex.attrs(chatUtilityStyles.pointerEventsNone, chatUtilityStyles.absolute, chatUtilityStyles.insetX0, chatUtilityStyles.bottom3, chatUtilityStyles.flex, chatUtilityStyles.justifyCenter).class}>
                            <div class={stylex.attrs(chatUtilityStyles.pointerEventsAuto).class}>
                              <ActionButton
                                tooltip="Scroll to latest message"
                                icon={<ArrowDown class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                                variant="secondary"
                                onClick={() => scrollToBottom(true)}
                              >
                                Scroll to latest
                              </ActionButton>
                            </div>
                          </div>
                        </Show>
                      </div>
                    </Match>
                    <Match when={selectedTab === "plan"}>
                <ScrollArea class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}>
                  <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap4).class}>
                    <Show
                      when={currentExecutionPlan()}
                      fallback={
                        <div class={stylex.attrs(chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite45, chatUtilityStyles.p5, chatUtilityStyles.text0675rem, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>
                          No saved execution plan yet. Ask for a plan from Chat, then review it here before files change.
                        </div>
                      }
                    >
                      {(plan) => (
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderVariableAccent35, chatUtilityStyles.bgWhite70, chatUtilityStyles.p4, chatUtilityStyles.text0675rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
                            <div>
                              <div class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableAccentStrong).class}>Plan ready for review</div>
                              <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.textVariableMuted).class}>Confirm scope and verification before execution.</div>
                            </div>
                            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                              <ActionButton tooltip="Open full execution plan" size="sm" variant="secondary" onClick={() => harnessStore.openExecutionPlanDialog(plan())}>
                                Review full plan
                              </ActionButton>
                              {renderPlanRunAction(plan().runId)}
                            </div>
                          </div>
                          <MarkdownContent content={() => plan().summary} size="compact" fileLinks={chatFileLinks()} />
                        </div>
                      )}
                    </Show>

                    <div class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
                      <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap3, chatUtilityStyles.mdGridCols2).class}>
                        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
                          <span class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Active mode</span>
                          <DropdownControl
                            kind="select"
                            ariaLabel="Select active mode"
                            icon={<Split class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                            size="md"
                            class={stylex.attrs(chatUtilityStyles.wFull).class}
                            value={selectedModeValue()}
                            options={modeDropdownOptions()}
                            onChange={handleModeSelect}
                          />
                        </label>
                        <div class={stylex.attrs(chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite70, chatUtilityStyles.p3, chatUtilityStyles.text0675rem, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>
                          {isAutoModeSelected()
                            ? "Interpret each prompt and choose the best implementation mode."
                            : activeMode()?.description ?? "Default implementation mode."}
                        </div>
                      </div>
                    </div>

                    <div class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
                      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap1).class}>
                          <div class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Project context</div>
                          <div class={stylex.attrs(chatUtilityStyles.text0675rem, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>
                            Rules and working memory flow into planner and execution prompts.
                          </div>
                        </div>
                        <ActionButton tooltip="Save project rules and thread memory" size="sm" onClick={handleSaveProjectContext}>
                          Save context
                        </ActionButton>
                      </div>
                      <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap3, chatUtilityStyles.pt4, chatUtilityStyles.mdGridCols2).class}>
                        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
                          <span class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Project rules</span>
                          <Textarea rows="8" value={projectRulesDraft()} onInput={(event) => setProjectRulesDraft(event.currentTarget.value)} />
                        </label>
                        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
                          <span class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Thread memory</span>
                          <Textarea rows="8" value={threadMemoryDraft()} onInput={(event) => setThreadMemoryDraft(event.currentTarget.value)} />
                        </label>
                      </div>
                    </div>

                    <ModeEditorPanel
                      title="Project custom modes"
                      scope="project"
                      modes={project().projectModes ?? []}
                      onSave={(mode) =>
                        sendCommand({
                          type: "mode.save",
                          requestId: createRequestId(),
                          payload: {
                            scope: "project",
                            projectId: project().id,
                            mode
                          }
                        })
                      }
                      onDelete={(modeId) =>
                        sendCommand({
                          type: "mode.delete",
                          requestId: createRequestId(),
                          payload: {
                            scope: "project",
                            projectId: project().id,
                            modeId
                          }
                        })
                      }
                    />

                  </div>
                </ScrollArea>
                    </Match>
                    <Match when={selectedTab === "run"}>
                <ScrollArea class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}>
                  <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap4).class}>
                    <CliSessionPanel />
                    <div class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4, chatUtilityStyles.text0675rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
                        <div class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Run summary</div>
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2).class}>
                          <Show when={currentBackgroundRun()}>
                            <ActionButton
                              tooltip="Open background job for this run"
                              icon={<Briefcase class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                              size="sm"
                              variant="secondary"
                              onClick={handleOpenCurrentRunJob}
                            >
                              Job
                            </ActionButton>
                          </Show>
                          <ActionButton
                            tooltip="Promote latest run into scheduled task"
                            icon={<CalendarClock class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePromoteScheduledRun()}
                          >
                            Schedule
                          </ActionButton>
                          <Show when={currentExecutionPlan()}>
                            {(plan) => renderPlanRunAction(plan().runId)}
                          </Show>
                          <Show when={experimentRun()}>
                            <ActionButton tooltip="Review virtual branch diff" size="sm" variant="secondary" onClick={handleInspectExperiment}>
                              Review experiment
                            </ActionButton>
                            <ActionButton tooltip="Flush experiment changes into project and commit" size="sm" onClick={handlePromoteExperiment}>
                              Promote
                            </ActionButton>
                            <ActionButton tooltip="Discard virtual branch changes" size="sm" variant="secondary" onClick={handleDiscardExperiment}>
                              Discard
                            </ActionButton>
                          </Show>
                        </div>
                      </div>
                      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flexCol, chatUtilityStyles.gap1, chatUtilityStyles.pt2).class}>
                        <div>Status: {currentRun()?.status ?? "idle"}</div>
                        <div>Retryable: {currentRun()?.retryable ? "yes" : "no"}</div>
                        <div>Resumable: {currentRun()?.resumable ? "yes" : "no"}</div>
                        <Show when={currentRun()?.failureMessage}>
                          {(failure) => <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderRose300, chatUtilityStyles.bgRose50, chatUtilityStyles.p3, chatUtilityStyles.fontMedium, chatUtilityStyles.textRose800).class}>Failure: {failure()}</div>}
                        </Show>
                        <Show when={currentRun()?.status === "completed" || currentRun()?.status === "failed"}>
                          <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p3).class}>
                            <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>Outcome</div>
                            <Show when={currentRun()?.summary ?? currentRun()?.finalExecutionBrief}>
                              {(summary) => <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>{summary()}</div>}
                            </Show>
                            <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>
                              Evidence: {currentRun()?.toolActivities?.filter((activity) => activity.status === "completed").length ?? 0} completed tool steps; {currentRun()?.subtasks.filter((task) => task.status === "completed").length ?? 0} completed subtasks.
                            </div>
                          </div>
                        </Show>
                        <RunLedgerCompact run={currentRun()} />
                        <RunProofBundleCompact run={currentRun()} />
                        <Tooltip
                          content={currentRun()?.latestUserPrompt}
                              triggerClass={stylex.attrs(styles.tooltipThreadTitle).class}
                        >
                          <div class={stylex.attrs(chatUtilityStyles.truncate).class}>
                            Prompt: {currentRun()?.latestUserPrompt ?? "n/a"}
                          </div>
                        </Tooltip>
                      </div>
                      <Show when={experimentRun()}>
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flexCol, chatUtilityStyles.gap1, chatUtilityStyles.pt2).class}>
                          <div>Virtual branch: {experimentRun()!.virtualBranchName}</div>
                          <div class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.breakAll).class}>Mount: {experimentRun()!.projectMountPath}</div>
                          <div>
                            Diff: {experimentRun()!.filesChanged} files, +{experimentRun()!.insertions} / -{experimentRun()!.deletions}
                          </div>
                        </div>
                      </Show>
                    </div>
                    <VirtualList
                      class={stylex.attrs(chatUtilityStyles.minH80, chatUtilityStyles.pr2).class}
                      contentClass={stylex.attrs(styles.virtualContent).class}
                      itemClass={stylex.attrs(styles.virtualItem).class}
                      items={runSubtasks()}
                      getKey={(task, index) => `${task.id ?? task.title}-${index}`}
                      estimateSize={150}
                      pagination={{ kind: "reverse", initialCount: CHAT_RUN_SUBTASK_LIMIT, batchSize: CHAT_RUN_SUBTASK_LIMIT }}
                      empty={<div class={stylex.attrs(chatUtilityStyles.rounded12rem, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>No subtasks yet.</div>}
                    >
                      {(task) => (
                        <div class={stylex.attrs(chatUtilityStyles.rounded12rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite60, chatUtilityStyles.p4, chatUtilityStyles.text0675rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                          <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>{task.title}</div>
                          <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>Status: {task.status} | Attempts: {task.attemptCount}</div>
                          <Show when={task.output}>
                            <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                              <MarkdownContent content={() => task.output ?? ""} size="compact" fileLinks={chatFileLinks()} />
                            </div>
                          </Show>
                          <Show when={task.errorMessage}>
                            <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                              <MarkdownContent content={() => task.errorMessage ?? ""} size="compact" tone="danger" fileLinks={chatFileLinks()} />
                            </div>
                          </Show>
                        </div>
                      )}
                    </VirtualList>
                  </div>
                </ScrollArea>
                    </Match>
                    <Match when={selectedTab === "events"}>
                <VirtualList
                  class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}
                  contentClass={stylex.attrs(styles.virtualContent).class}
                  itemClass={stylex.attrs(styles.virtualItem).class}
                  items={projectTraces()}
                  getKey={(trace, index) => `${trace.stage}-${index}`}
                  estimateSize={145}
                  pagination={{ kind: "reverse", initialCount: CHAT_EVENT_LIMIT, batchSize: CHAT_EVENT_LIMIT }}
                  empty={
                    <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minH56, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.rounded3xl, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite40, chatUtilityStyles.p8, chatUtilityStyles.textCenter, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                      No model trace events yet. Tool commands and subtask activity appear in Run and Developer trace.
                    </div>
                  }
                >
                  {(trace) => (
                    <article class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
                      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3, chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableAccentStrong).class}>
                        <span>{trace.stage}</span>
                        <span>{trace.modelId ?? "n/a"}</span>
                      </div>
                      <MarkdownContent content={() => trace.message} size="compact" fileLinks={chatFileLinks()} />
                      <Show when={trace.detail}>
                        <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                          <MarkdownContent content={() => trace.detail ?? ""} size="compact" tone="muted" fileLinks={chatFileLinks()} />
                        </div>
                      </Show>
                    </article>
                  )}
                </VirtualList>
                    </Match>
                    <Match when={selectedTab === "memory"}>
                <Show
                  when={projectMemoryEntries().length > 0}
                  fallback={
                    <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minH56, chatUtilityStyles.flex1, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite40, chatUtilityStyles.p8, chatUtilityStyles.textCenter, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                      No shared memory yet. Memories appear here after they are recorded for this project.
                    </div>
                  }
                >
                <VirtualList
                  class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}
                  contentClass={stylex.attrs(styles.virtualContent).class}
                  itemClass={stylex.attrs(styles.virtualItem).class}
                  items={projectMemoryEntries()}
                  getKey={(entry) => entry.id}
                  estimateSize={190}
                  pagination={{ kind: "reverse", initialCount: CHAT_MEMORY_LIMIT, batchSize: CHAT_MEMORY_LIMIT }}
                >
                  {(entry, index) => (
                    <article class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
                      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
                        <div>
                          <div class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableAccentStrong).class}>{entry.kind}</div>
                          <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>{entry.title}</div>
                        </div>
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2).class}>
                          <ActionButton
                            tooltip="Move memory earlier in retrieval priority"
                            disabled={index === 0}
                            disabledReason="Already highest priority memory"
                            icon={<ArrowUp class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                            size="icon"
                            variant="secondary"
                            ariaLabel="Move memory up"
                            onClick={() => handleReorderMemory(entry.id, "up")}
                          />
                          <ActionButton
                            tooltip="Move memory later in retrieval priority"
                            disabled={index === projectMemoryEntries().length - 1}
                            disabledReason="Already lowest priority memory"
                            icon={<ArrowDown class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                            size="icon"
                            variant="secondary"
                            ariaLabel="Move memory down"
                            onClick={() => handleReorderMemory(entry.id, "down")}
                          />
                          <ActionButton tooltip={entry.pinned ? "Unpin memory entry" : "Pin memory entry"} size="sm" variant="secondary" onClick={() => handleUpdateMemory(entry.id, { pinned: !entry.pinned })}>
                            {entry.pinned ? "Unpin" : "Pin"}
                          </ActionButton>
                          <ActionButton
                            tooltip={entry.status === "active" ? "Archive memory entry" : "Restore memory entry"}
                            size="sm"
                            variant="secondary"
                            onClick={() => handleUpdateMemory(entry.id, { status: entry.status === "active" ? "archived" : "active" })}
                          >
                            {entry.status === "active" ? "Archive" : "Restore"}
                          </ActionButton>
                          <ActionButton tooltip="Permanently delete this memory entry" size="sm" variant="secondary" onClick={() => handleDeleteMemory(entry.id)}>
                            {deleteArmedMemoryId() === entry.id ? "Confirm delete" : "Delete"}
                          </ActionButton>
                        </div>
                      </div>
                      <div class={stylex.attrs(chatUtilityStyles.pt2, chatUtilityStyles.textVariableMuted).class}>priority {entry.priority} | {entry.confidence} | {entry.freshness} | hits {entry.hitCount}</div>
                      <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                        <MarkdownContent content={() => entry.summary} size="compact" fileLinks={chatFileLinks()} />
                      </div>
                      <Show when={entry.evidence}>
                        <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                          <MarkdownContent content={() => entry.evidence ?? ""} size="compact" tone="muted" fileLinks={chatFileLinks()} />
                        </div>
                      </Show>
                    </article>
                  )}
                </VirtualList>
                </Show>
                    </Match>
                  </Switch>
                </div>
              )}
            </Show>
            </div>

            <Show when={readyRun() && currentExecutionPlan()?.gating.mode === "countdown" && countdownRunId() === readyRun()!.id}>
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded125rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p3).class}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                  <span>
                    Auto-run {countdownPaused() ? "paused" : "in progress"} for {currentExecutionPlan()?.gating.delaySeconds}s gate.
                  </span>
                  <ActionButton
                    tooltip={
                      executionPaused()
                        ? "Global pause freezes automatic execution countdown"
                        : countdownPaused()
                          ? "Resume automatic execution countdown"
                          : "Pause automatic execution countdown"
                    }
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason()}
                    icon={countdownPaused() ? <Play class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} /> : <Pause class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                    size="sm"
                    variant="secondary"
                    onClick={() => (countdownPaused() ? handleResumeAutoRun() : handlePauseAutoRun())}
                  >
                    {countdownPaused() ? "Resume auto-run" : "Pause auto-run"}
                  </ActionButton>
                </div>
                <div class={stylex.attrs(chatUtilityStyles.h2, chatUtilityStyles.overflowHidden, chatUtilityStyles.roundedFull, chatUtilityStyles.bgVariableBorder).class}>
                  <div
                    class={stylex.attrs(chatUtilityStyles.hFull, chatUtilityStyles.roundedFull, chatUtilityStyles.bgVariableAccent, chatUtilityStyles.transitionWidth).class}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          100 -
                          (countdownRemainingMs() /
                            Math.max(1, (currentExecutionPlan()?.gating.delaySeconds ?? 1) * 1000)) *
                          100
                        )
                      )}%`
                    }}
                  />
                </div>
              </div>
            </Show>

            <form
              data-test-chat-composer=""
              class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.shrink0, chatUtilityStyles.spaceY3).class}
              onSubmit={handleSubmit}
              onDragOver={handleAttachmentDragOver}
              onDragLeave={handleAttachmentDragLeave}
              onDrop={handleAttachmentDrop}
            >
              <Show when={draggingAttachments()}>
                <div class={stylex.attrs(chatUtilityStyles.pointerEventsNone, chatUtilityStyles.absolute, chatUtilityStyles.inset0, chatUtilityStyles.z10, chatUtilityStyles.grid, chatUtilityStyles.placeItemsCenter, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableAccent, chatUtilityStyles.bgWhite85, chatUtilityStyles.p4, chatUtilityStyles.textCenter, chatUtilityStyles.shadowLg).class}>
                  <div>
                    <div class={stylex.attrs(chatUtilityStyles.text075rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{dropState().label}</div>
                    <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>{dropState().detail}</div>
                  </div>
                </div>
              </Show>
              <Show when={pendingQuestion()}>
                {(question) => (
                  <div class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.overflowHidden, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgVariablePanelStrong, chatUtilityStyles.p3, chatUtilityStyles.shadowSm).class}>
                    <div class={stylex.attrs(chatUtilityStyles.absolute, chatUtilityStyles.insetY0, chatUtilityStyles.left0, chatUtilityStyles.w1, chatUtilityStyles.bgVariableWarning).class} />
                    <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.pl2, chatUtilityStyles.text0625rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking014em, chatUtilityStyles.textVariableWarningStrong).class}>
                      <MessageSquareMore class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35, chatUtilityStyles.shrink0).class} />
                      <span class={stylex.attrs(chatUtilityStyles.truncate).class}>
                        {question().intent?.type === "assistant-create-intent" && question().responseKind === "freeform" ? "Assistant setup" : "Planner question"}
                      </span>
                    </div>
                    <div class={stylex.attrs(chatUtilityStyles.pl2, chatUtilityStyles.textSm, chatUtilityStyles.fontMedium, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>{question().prompt}</div>
                    <Show when={question().placeholder}>
                      <div class={stylex.attrs(chatUtilityStyles.pl2, chatUtilityStyles.text07rem, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>Example: {question().placeholder}</div>
                    </Show>
                    <Show when={question().responseKind !== "freeform"}>
                      <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap2, chatUtilityStyles.smGridCols2, chatUtilityStyles.lgGridCols3).class}>
                        <For each={question().choices ?? []}>
                          {(choice) => (
                            <Button
                              tooltip={executionPaused() ? executionPauseReason() : choice.description}
                              type="button"
                              variant="secondary"
                              disabled={executionPaused()}
                              tooltipTriggerClass={stylex.attrs(styles.plannerChoiceTooltip).class}
                              class={stylex.attrs(
                                chatUtilityStyles.hAuto,
                                chatUtilityStyles.minH18,
                                chatUtilityStyles.wFull,
                                chatUtilityStyles.itemsStart,
                                chatUtilityStyles.justifyStart,
                                chatUtilityStyles.whitespaceNormal,
                                chatUtilityStyles.roundedLg,
                                chatUtilityStyles.px3,
                                chatUtilityStyles.py2,
                                chatUtilityStyles.textLeft,
                                chatUtilityStyles.transition,
                                chatUtilityStyles.hoverBorderVariableAccent,
                                choice.recommended ? styles.plannerChoiceRecommended : styles.plannerChoiceDefault
                              ).class}
                              aria-label={`Choose planner answer: ${choice.label}`}
                              onClick={() => handleQuestionChoice(choice.answerText)}
                            >
                              <span
                                class={stylex.attrs(
                                  chatUtilityStyles.flex,
                                  chatUtilityStyles.h5,
                                  chatUtilityStyles.w5,
                                  chatUtilityStyles.shrink0,
                                  chatUtilityStyles.itemsCenter,
                                  chatUtilityStyles.justifyCenter,
                                  chatUtilityStyles.roundedMd,
                                  chatUtilityStyles.border,
                                  chatUtilityStyles.text06rem,
                                  choice.recommended ? styles.plannerChoiceMarkerRecommended : styles.plannerChoiceMarkerDefault
                                ).class}
                              >
                                <Show when={choice.recommended} fallback={String((question().choices ?? []).findIndex((entry) => entry.id === choice.id) + 1)}>
                                  <Check class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                                </Show>
                              </span>
                              <span class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flex1, chatUtilityStyles.flexCol, chatUtilityStyles.gap1).class}>
                                <span class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2).class}>
                                  <span class={stylex.attrs(chatUtilityStyles.truncate, chatUtilityStyles.textXs, chatUtilityStyles.fontSemibold).class}>{choice.label}</span>
                                  <Show when={choice.recommended}>
                                    <span class={stylex.attrs(chatUtilityStyles.rounded, chatUtilityStyles.border, chatUtilityStyles.borderVariableWarning, chatUtilityStyles.px15, chatUtilityStyles.py05, chatUtilityStyles.text052rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking01em, chatUtilityStyles.textVariableWarningStrong).class}>
                                      Rec
                                    </span>
                                  </Show>
                                </span>
                                <span class={stylex.attrs(chatUtilityStyles.lineClamp3, chatUtilityStyles.text0675rem, chatUtilityStyles.fontNormal, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>{choice.description}</span>
                              </span>
                            </Button>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={executionPaused()}>
                      <div class={stylex.attrs(chatUtilityStyles.pl2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableWarningStrong).class}>
                        Global pause active. Send answer after resume.
                      </div>
                    </Show>
                  </div>
                )}
              </Show>

              <Show when={selectedAgentHealthMessage()}>
                {(message) => (
                  <div class={stylex.attrs(chatUtilityStyles.rounded12rem, chatUtilityStyles.border, chatUtilityStyles.borderSky200, chatUtilityStyles.bgSky5080, chatUtilityStyles.p3, chatUtilityStyles.text0675rem, chatUtilityStyles.leading6, chatUtilityStyles.textSky950).class}>
                    {message()}
                  </div>
                )}
              </Show>

              <Show when={composerTimerState()}>
                {(timer) => (
                  <div
                    aria-live="polite"
                    data-test-waiting-timer=""
                    role="status"
                    class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.px1, chatUtilityStyles.text0675rem, chatUtilityStyles.fontMedium, chatUtilityStyles.textVariableMuted).class}
                  >
                    <Show when={timer().kind === "working"}>
                      <span aria-hidden="true" class={stylex.attrs(chatUtilityStyles.agentWaitingDots).class}>
                        <span data-test-agent-waiting-dot="" data-delay-index="0" class={stylex.attrs(chatUtilityStyles.agentWaitingDot).class} />
                        <span data-test-agent-waiting-dot="" data-delay-index="1" class={stylex.attrs(chatUtilityStyles.agentWaitingDot, chatUtilityStyles.agentWaitingDot2).class} />
                        <span data-test-agent-waiting-dot="" data-delay-index="2" class={stylex.attrs(chatUtilityStyles.agentWaitingDot, chatUtilityStyles.agentWaitingDot3).class} />
                      </span>
                    </Show>
                    <span>{timer().label}</span>
                  </div>
                )}
              </Show>

              <ChatComposer
                dataTourId="chat-composer"
                textareaRef={(element) => {
                  composerTextarea = element;
                }}
                rows="2"
                value={project().draft}
                placeholder={getComposerPlaceholder()}
                disabled={executionPaused()}
                disabledReason={executionPauseReason()}
                onSubmit={() => composerTextarea?.form?.requestSubmit()}
                onKeyDown={handleComposerKeyDown}
                onKeyUp={syncComposerCaret}
                onClick={handleComposerClick}
                onSelect={syncComposerCaret}
                onFocus={() => queueMicrotask(syncComposerCaret)}
                ariaControls={composerLookupOpen() ? "chat-composer-lookup" : undefined}
                ariaExpanded={composerLookupOpen()}
                ariaActiveDescendant={composerLookupActiveOptionId()}
                onInput={(value) => {
                  syncComposerCaret();
                  harnessStore.setProjectDraft(project().id, value);
                  setComposerLookupForcedClosed(false);
                  setDismissedComposerLookupKey(undefined);
                  setComposerLookupActiveIndex(0);
                  queueMicrotask(() => syncComposerLookupDomVisibility());
                  resizeComposer();
                }}
                rightActions={
                  <>
                    <ActionButton
                      tooltip="Attach screenshots, PDFs, or office docs"
                      disabledReason={executionPaused() ? executionPauseReason() : attachmentButtonReason()}
                      disabled={executionPaused() || attachmentButtonDisabled()}
                      icon={<Paperclip class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                      type="button"
                      variant="ghost"
                      size="icon"
                      class={stylex.attrs(chatUtilityStyles.pointerEventsAuto, chatUtilityStyles.h8, chatUtilityStyles.w8, chatUtilityStyles.roundedLg).class}
                      onClick={() => attachmentInput?.click()}
                    />
                    <ActionButton
                      tooltip={composerSubmitState().tooltip}
                      disabledReason={composerSubmitState().disabledReason}
                      disabled={composerSubmitState().disabled}
                      icon={<SendHorizontal class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                      type="submit"
                      variant="ghost"
                      size="icon"
                      class={stylex.attrs(chatUtilityStyles.pointerEventsAuto, chatUtilityStyles.h8, chatUtilityStyles.w8, chatUtilityStyles.roundedLg).class}
                      dataTourId="chat-send"
                    />
                  </>
                }
                leftControls={
                  <>
                    <div data-test-composer-control-row="" class={stylex.attrs(chatUtilityStyles.hidden, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap1, chatUtilityStyles.lgFlex).class}>
                      {renderModeControl()}
                      {renderAgentControl()}
                      {renderProviderControl()}
                      {renderModelControl()}
                      <Popover
                        open={desktopReasoningMenuOpen()}
                        onClose={() => setDesktopReasoningMenuOpen(false)}
                        align="start"
                        side="top"
                            contentClass={stylex.attrs(styles.compactPopover).class}
                        content={renderComposerControlMenu()}
                      >
                        {renderEffortControl(() => setDesktopReasoningMenuOpen((current) => !current))}
                      </Popover>
                    </div>
                    <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2).class}>
                      <Popover
                        open={mobileReasoningMenuOpen()}
                        onClose={() => setMobileReasoningMenuOpen(false)}
                        align="start"
                        side="top"
                            contentClass={stylex.attrs(styles.compactPopover).class}
                        content={renderComposerControlMenu()}
                      >
                        {renderEffortControl(() => setMobileReasoningMenuOpen((current) => !current), "lg:hidden")}
                      </Popover>
                      <div class={stylex.attrs(chatUtilityStyles.lgHidden).class}>
                        <Popover
                          open={composerSettingsOpen()}
                          onClose={() => setComposerSettingsOpen(false)}
                          align="start"
                          side="top"
                            contentClass={stylex.attrs(styles.mobileSettingsPopover).class}
                          content={
                            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
                              {renderModeControl("md", "w-full")}
                              {renderAgentControl("md", "w-full")}
                              {renderProviderControl("md", "w-full")}
                              {renderModelControl("md", "w-full")}
                            </div>
                          }
                        >
                          <ActionButton
                            tooltip="Open composer settings"
                            icon={<Settings class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                            type="button"
                            variant="ghost"
                            size="icon"
                            class={stylex.attrs(chatUtilityStyles.h7, chatUtilityStyles.w7, chatUtilityStyles.roundedLg).class}
                            onClick={() => setComposerSettingsOpen((current) => !current)}
                          />
                        </Popover>
                      </div>
                    </div>
                  </>
                }
              />
              <div
                ref={(element) => {
                  composerLookupMenu = element;
                  queueMicrotask(() => {
                    if (composerLookupOpen() && composerLookupMenu === element) {
                      syncComposerLookupDomVisibility();
                    } else {
                      setComposerLookupMenuHidden(true);
                    }
                  });
                }}
                id="chat-composer-lookup"
                data-test-composer-lookup=""
                hidden={!composerLookupOpen()}
                role={composerLookupOpen() ? "listbox" : undefined}
                aria-label={composerLookupOpen() ? "Composer lookup" : undefined}
                aria-hidden={composerLookupOpen() ? "false" : "true"}
                tabIndex={-1}
                class={stylex.attrs(chatUtilityStyles.absolute, chatUtilityStyles.bottom775rem, chatUtilityStyles.left8, chatUtilityStyles.right8, chatUtilityStyles.z20, chatUtilityStyles.maxH64, chatUtilityStyles.overflowAuto, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgVariablePanel, chatUtilityStyles.p1, chatUtilityStyles.shadowXl).class}
                onKeyDown={(event) => runWithChatPanelOwner(() => handleComposerLookupKeyDown(event))}
              >
                <For each={composerLookupRenderedOptions()}>
                  {(option) => (
                    <button
                      id={getComposerLookupOptionId(option.index)}
                      data-composer-lookup-option=""
                      data-composer-lookup-index={option.index}
                      type="button"
                      role={composerLookupOpen() ? "option" : undefined}
                      aria-selected={option.selected}
                      class={stylex.attrs(styles.composerLookupOption, option.selected && styles.composerLookupOptionSelected).class}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setComposerLookupActiveIndex(option.index);
                        applyComposerLookupOption(option.index);
                      }}
                      onMouseEnter={() => {
                        setComposerLookupActiveIndex(option.index);
                      }}
                    >
                      <Show when={composerLookup()?.kind === "skill"} fallback={getFileTypeIcon(option.insertText.slice(1).trim(), "sm")}>
                        <WandSparkles class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35, chatUtilityStyles.textVariableMuted).class} />
                      </Show>
                      <span class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.flex1).class}>
                        <span class={stylex.attrs(chatUtilityStyles.block, chatUtilityStyles.truncate, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{option.label}</span>
                        <span class={stylex.attrs(chatUtilityStyles.block, chatUtilityStyles.truncate, chatUtilityStyles.text05625rem, chatUtilityStyles.textVariableMuted).class}>{option.detail}</span>
                      </span>
                    </button>
                  )}
                </For>
              </div>
              <input
                ref={attachmentInput}
                class={stylex.attrs(chatUtilityStyles.hidden).class}
                type="file"
                multiple
                accept="image/*,.pdf,.docx,.xlsx,.pptx,.odt,.txt,.md,.markdown,.json,.yml,.yaml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.swift,.sql,.sh,.bash,.zsh,.ini,.toml,.env,.csv,.log"
                onChange={handleSelectAttachments}
              />

              <Show when={draftAttachments().length > 0 || uploadingAttachments()}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                  <For each={draftAttachments()}>
                    {(attachment) => (
                      <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite75, chatUtilityStyles.px3, chatUtilityStyles.py1, chatUtilityStyles.text06rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
                        <span>{attachment.kind}</span>
                        <span class={stylex.attrs(chatUtilityStyles.maxW56, chatUtilityStyles.truncate, chatUtilityStyles.normalCase, chatUtilityStyles.trackingNormal).class}>{attachment.name}</span>
                        <ActionButton
                          tooltip="Remove attachment"
                          icon={<X class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />}
                          size="icon"
                          variant="ghost"
                          ariaLabel={`Remove ${attachment.name}`}
                          onClick={() => handleRemoveAttachment(attachment.id)}
                        />
                      </span>
                    )}
                  </For>
                  <Show when={uploadingAttachments()}>
                    <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite75, chatUtilityStyles.px3, chatUtilityStyles.py1, chatUtilityStyles.text06rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
                      <LoaderCircle class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3, chatUtilityStyles.animateSpin).class} />
                      Uploading attachments
                    </span>
                  </Show>
                </div>
              </Show>
              <Show when={composerReferenceBadges().length > 0}>
                <div {...stylex.attrs(styles.attachmentList)}>
                  <For each={composerReferenceBadges()}>
                    {(badge) => (
                      <Button
                        data-test-composer-reference-badge=""
                        tooltip={`Ctrl/Meta-click to open ${badge.label} in the IDE`}
                        aria-label={`Open ${badge.label} in IDE`}
                        variant="secondary"
                        size="sm"
                        class={stylex.attrs(chatUtilityStyles.h7, chatUtilityStyles.maxWFull, chatUtilityStyles.roundedFull, chatUtilityStyles.px25, chatUtilityStyles.py1, chatUtilityStyles.text05625rem, chatUtilityStyles.fontSemibold).class}
                        onClick={(event) => handleComposerBadgeClick(event, badge)}
                      >
                        <Show when={badge.kind === "skill"} fallback={getFileTypeIcon(badge.target.path, "xs")}>
                          <WandSparkles class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3, chatUtilityStyles.textVariableMuted).class} />
                        </Show>
                        <span class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.truncate).class}>{badge.label}</span>
                      </Button>
                    )}
                  </For>
                </div>
              </Show>

              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.lgFlexRow, chatUtilityStyles.lgItemsCenter, chatUtilityStyles.lgJustifyBetween).class}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                  <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                    <For each={capabilityTags()}>
                      {(tag) => (
                        <span class={stylex.attrs(chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite70, chatUtilityStyles.px2, chatUtilityStyles.py05, chatUtilityStyles.text055rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={contextUsage()}>
                    {(usage) => (
                      <Tooltip content={getContextUsageTooltip()}>
                        <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap3, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite75, chatUtilityStyles.px25, chatUtilityStyles.py15, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableForeground).class}>
                          <span
                            class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.flex, chatUtilityStyles.h9, chatUtilityStyles.w9, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedFull).class}
                            style={{
                              background: `conic-gradient(var(--accent) ${Math.max(
                                0,
                                Math.min(100, Math.round(usage().usagePercent ?? 0))
                              )}%, rgba(38, 22, 15, 0.12) 0%)`
                            }}
                          >
                            <span class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.h7, chatUtilityStyles.w7, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedFull, chatUtilityStyles.bgVariablePanel, chatUtilityStyles.text05rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>
                              {Math.round(usage().usagePercent ?? 0)}%
                            </span>
                          </span>
                          <span>{`${Math.round(usage().usagePercent ?? 0)}% · ${formatTokenCount(usage().tokens)}/${formatTokenCount(
                            usage().contextWindow
                          )} context used`}</span>
                          <Show when={getCacheHitPercent(usage())}>
                            {(cacheHitPercent) => (
                              <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderEmerald50030, chatUtilityStyles.bgEmerald50, chatUtilityStyles.px2, chatUtilityStyles.py05, chatUtilityStyles.text055rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textEmerald700).class}>
                                ⚡ Cache Hit {cacheHitPercent()}%
                              </span>
                            )}
                          </Show>
                        </span>
                      </Tooltip>
                    )}
                  </Show>
                </div>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                  {/*
                    Open live session is intentionally hidden for MVP.
                    This is unneeded at the moment, but can be reintroduced post-MVP.
                  */}
                  {/* <Show when={selectedAgentRuntime()?.agentId !== "pi"}>
                    <ActionButton
                      tooltip="Open live pipe-based CLI session"
                      disabledReason={
                        executionPaused()
                          ? executionPauseReason()
                          : !selectedAgentRuntime()?.installed
                            ? selectedAgentRuntime()?.healthMessage ?? "Runtime not installed"
                            : !selectedAgentRuntime()?.authenticated
                              ? selectedAgentRuntime()?.healthMessage ?? "Runtime not authenticated"
                              : !selectedAgentRuntime()?.interactivePipeCompatible
                                ? selectedAgentRuntime()?.healthMessage ?? "Interactive mode unavailable"
                                : undefined
                      }
                      disabled={
                        executionPaused() ||
                        !selectedAgentRuntime()?.installed ||
                        !selectedAgentRuntime()?.authenticated ||
                        !selectedAgentRuntime()?.interactivePipeCompatible
                      }
                      type="button"
                      variant="secondary"
                      onClick={handleStartLiveSession}
                    >
                      Open live session
                    </ActionButton>
                  </Show> */}
                </div>
              </div>
            </form>
            <Dialog open={experimentDialogOpen()} onClose={() => setExperimentDialogOpen(false)} title="Experiment review">
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.text07rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                <Show when={experimentRun()}>
                  <div>
                    <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>{experimentRun()!.virtualBranchName}</div>
                    <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>
                      {experimentRun()!.filesChanged} files | +{experimentRun()!.insertions} / -{experimentRun()!.deletions}
                    </div>
                  </div>
                </Show>
                <Show
                  when={activeProject()?.experimentInspection}
                  fallback={<div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>Loading experiment diff...</div>}
                >
                  {(inspection) => {
                    const files = () => inspection().files ?? [];
                    const selectedFile = () => files().find((file) => file.path === selectedExperimentFilePath()) ?? files()[0];
                    return (
                      <Show when={files().length > 0} fallback={<MarkdownContent content={() => `\`\`\`diff\n${inspection().diffText}\n\`\`\``} size="compact" />}>
                        <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.minH0, chatUtilityStyles.gap3, chatUtilityStyles.lgGridColsMinmax12rem18remMinmax01fr).class}>
                          <div class={stylex.attrs(chatUtilityStyles.minH0, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p2).class}>
                            <div class={stylex.attrs(chatUtilityStyles.px2, chatUtilityStyles.pb2, chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>
                              {files().length} changed paths
                            </div>
                            <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.maxH72, chatUtilityStyles.gap1, chatUtilityStyles.overflowAuto).class}>
                              <For each={files()}>
                                {(file) => (
                                  <button
                                    type="button"
                                    class={stylex.attrs(
                                      chatUtilityStyles.minW0,
                                      chatUtilityStyles.roundedXl,
                                      chatUtilityStyles.px2,
                                      chatUtilityStyles.py2,
                                      chatUtilityStyles.textLeft,
                                      chatUtilityStyles.transition,
                                      selectedFile()?.path === file.path ? styles.experimentFileSelected : styles.experimentFileDefault
                                    ).class}
                                    onClick={() => setSelectedExperimentFilePath(file.path)}
                                  >
                                    <div class={stylex.attrs(chatUtilityStyles.truncate, chatUtilityStyles.text07rem, chatUtilityStyles.fontSemibold).class}>{file.path}</div>
                                    <div class={stylex.attrs(chatUtilityStyles.text06rem, chatUtilityStyles.opacity75).class}>+{file.additions} / -{file.deletions}</div>
                                  </button>
                                )}
                              </For>
                            </div>
                          </div>
                          <div class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p3).class}>
                            <Show when={inspection().staleReason}>
                              {(reason) => <div class={stylex.attrs(chatUtilityStyles.mb3, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderAmber300, chatUtilityStyles.bgAmber50, chatUtilityStyles.px3, chatUtilityStyles.py2, chatUtilityStyles.text0675rem, chatUtilityStyles.textAmber900).class}>{reason()}</div>}
                            </Show>
                            <div class={stylex.attrs(chatUtilityStyles.mb2, chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                              <span class={stylex.attrs(chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{selectedFile()?.path}</span>
                              <span>+{selectedFile()?.additions ?? 0} / -{selectedFile()?.deletions ?? 0}</span>
                            </div>
                            <MarkdownContent content={() => `\`\`\`diff\n${selectedFile()?.hunksPreview || inspection().diffText}\n\`\`\``} size="compact" />
                          </div>
                        </div>
                      </Show>
                    );
                  }}
                </Show>
              </div>
            </Dialog>
          </>
      </Show>
    </section>
    <TerminalHistoryDialog
      open={terminalHistoryOpen()}
      title="Thread Terminal History"
      scope={activeProject() ? { projectId: activeProject()!.id, threadId: activeProject()!.activeThreadId } : undefined}
      onClose={() => setTerminalHistoryOpen(false)}
    />
    </>
  );
}

function formatReasoningStrengthLabel(strength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
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

function formatReasoningOptionLabel(strength: (typeof COMPOSER_REASONING_STRENGTHS)[number]) {
  const label = formatReasoningStrengthLabel(strength);
  return strength === "high" ? `${label} (default)` : label;
}

/** Translate technical mode names into the visible consequence of choosing them. */
function formatModeIntentLabel(modeId: string, fallback: string) {
  switch (modeId) {
    case "ask":
      return "Answer only";
    case "plan":
      return "Plan first";
    case "implement":
      return "Make changes";
    case "debug":
      return "Debug a problem";
    case "review":
      return "Review changes";
    default:
      return fallback;
  }
}

function RunLedgerCompact(props: { run?: AgentRunState }) {
  const ledger = () => props.run?.ledger;
  return (
    <Show when={ledger()}>
      {(entry) => (
        <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite60, chatUtilityStyles.p3).class}>
          <div class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>Run ledger</div>
          <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.grid, chatUtilityStyles.gap1).class}>
            <Show when={entry().currentPhase}>{(value) => <div>Phase: {value()}</div>}</Show>
            <Show when={entry().nextStep}>{(value) => <div>Next: {value()}</div>}</Show>
            <Show when={entry().waitingOn}>{(value) => <div>Waiting: {value()}</div>}</Show>
            <Show when={entry().failureClass}>{(value) => <div>Failure: {value()}</div>}</Show>
            <Show when={entry().lastVerifiedAt}>{(value) => <div>Verified: {formatShortTimestamp(value())}</div>}</Show>
          </div>
        </div>
      )}
    </Show>
  );
}

function RunProofBundleCompact(props: { run?: AgentRunState }) {
  const bundle = () => props.run?.proofBundle;
  const evidenceCount = () => (bundle()?.commands?.length ?? 0) + (bundle()?.browserEvidenceRefs?.length ?? 0) + (bundle()?.approvals?.length ?? 0);
  return (
    <Show when={bundle()}>
      {(proof) => (
        <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite60, chatUtilityStyles.p3).class}>
          <div class={stylex.attrs(chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>Proof bundle</div>
          <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.grid, chatUtilityStyles.gap1).class}>
            <Show when={proof().diffSummary}>{(value) => <div>Diff: {value()}</div>}</Show>
            <div>Evidence refs: {evidenceCount()}</div>
            <Show when={proof().finalReviewNotes}>{(value) => <div>Review: {value()}</div>}</Show>
          </div>
        </div>
      )}
    </Show>
  );
}

function estimateTranscriptRowSize(row: ChatTimelineRow) {
  switch (row.kind) {
    case "tool-block":
      return 180;
    case "live":
      return row.message.kind === "status" ? 120 : 180;
    case "persisted":
      switch (row.message.metadata?.type ?? row.message.kind ?? "plain") {
        case "plan-summary":
          return 260;
        case "run-milestones":
          return 140;
        default:
          return row.message.attachments && row.message.attachments.length > 0 ? 220 : 180;
      }
  }
}

function readPersistedDraftAttachments(key: string | undefined, threadId?: string): ChatAttachment[] {
  const effectiveKey = key ?? findAttachmentDraftKeyForThread(threadId);
  if (!effectiveKey) {
    return [];
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(effectiveKey) ?? "{}") as { attachments?: ChatAttachment[] };
    return Array.isArray(parsed.attachments)
      ? parsed.attachments.filter((attachment) => attachment && typeof attachment.id === "string" && typeof attachment.url === "string")
      : [];
  } catch {
    return [];
  }
}

function findAttachmentDraftKeyForThread(threadId?: string) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("ai-harness:chat-draft:v2:") && (!threadId || key.endsWith(`:${threadId}`))) {
      return key;
    }
  }
  return undefined;
}

function persistDraftAttachments(key: string, attachments: ChatAttachment[]) {
  try {
    const existing = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(
      key,
      JSON.stringify({
        ...existing,
        version: 2,
        attachments,
        cleanupNeeded: attachments.length === 0 ? existing.cleanupNeeded : undefined,
        updatedAt: new Date().toISOString()
      })
    );
  } catch {
    // Best-effort browser draft persistence.
  }
}

const CHAT_TRANSCRIPT_LIMIT = 120;
const CHAT_RUN_SUBTASK_LIMIT = 24;
const CHAT_EVENT_LIMIT = 80;
const CHAT_MEMORY_LIMIT = 80;

function getStreamingLiveMessages(project: ViewProjectState): TimelineLiveMessage[] {
  const messages: TimelineLiveMessage[] = [];

  if (project.streamingHeartbeatMessages.length > 0) {
    messages.push(
      ...project.streamingHeartbeatMessages.map((message) => ({
          id: message.id,
          content: message.content,
          locked: message.locked,
          kind: "status" as const,
          updatedAt: message.updatedAt
        }))
    );
  } else {
    messages.push(
      ...project.streamingTailSegments
        .filter((segment) => segment.kind === "status")
        .map((segment) => ({
          id: segment.id,
          content: segment.content,
          locked: true,
          kind: "status" as const,
          updatedAt: segment.updatedAt
        }))
    );
  }

  const assistantFallback = [...project.streamingTailSegments].reverse().find((segment) => segment.kind === "assistant")?.content ?? "";
  const assistantContent = removePersistedAssistantPrefix(project, project.streamingAssistantText.trim() || assistantFallback.trim());
  if (assistantContent) {
    messages.push({
      id: "streaming-assistant-fallback",
      content: assistantContent,
      locked: false,
      kind: "assistant",
      updatedAt: project.activeRun?.updatedAt ?? project.activeRun?.createdAt
    });
  }

  return messages;
}

function removePersistedAssistantPrefix(project: ViewProjectState, content: string) {
  let remaining = content.trim();
  if (!remaining) {
    return "";
  }

  let lastUserIndex = -1;
  for (let index = project.session.messages.length - 1; index >= 0; index -= 1) {
    if (project.session.messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  for (const message of project.session.messages.slice(lastUserIndex + 1)) {
    if (message.role !== "assistant" || message.kind === "run-milestones") {
      continue;
    }
    const messageContent = message.content.trim();
    if (remaining.startsWith(messageContent)) {
      remaining = remaining.slice(messageContent.length).trim();
    }
  }
  return remaining;
}

function shouldHidePersistedStreamingAssistantMessage(
  project: ViewProjectState,
  message: ViewProjectState["session"]["messages"][number]
) {
  if (!isProjectRunStreaming(project) || message.role !== "assistant" || message.kind === "run-milestones") {
    return false;
  }

  const lastMessage = project.session.messages.at(-1);
  if (message.id !== lastMessage?.id) {
    return false;
  }

  return getStreamingLiveMessages(project).some((entry) => entry.kind === "assistant");
}

function isProjectRunStreaming(project: ViewProjectState) {
  return Boolean(project.session.isStreaming && project.activeRun && isBlockingRunStatus(project.activeRun.status));
}

function isBlockingRunStatus(status: AgentRunState["status"]) {
  return status === "planning" || status === "running-main" || status === "running-subagents" || status === "aggregating";
}

function getComposerLookupOptionId(index: number) {
  return `chat-composer-lookup-option-${index}`;
}

function getComposerLookup(draft: string, caret: number) {
  const tokenStart = Math.max(draft.lastIndexOf(" ", caret - 1), draft.lastIndexOf("\n", caret - 1), draft.lastIndexOf("\t", caret - 1)) + 1;
  const token = draft.slice(tokenStart, caret);
  if (token.length < 1 || token.includes(" ")) {
    return undefined;
  }
  if (token.startsWith("/") && token.length >= 1) {
    return { kind: "skill" as const, query: token.slice(1), start: tokenStart, end: caret };
  }
  if (token.startsWith("@") && token.length >= 1) {
    return { kind: "file" as const, query: token.slice(1), start: tokenStart, end: caret };
  }
  return undefined;
}

function getSkillName(skillPath: string) {
  const parts = skillPath.replace(/\\/g, "/").split("/");
  const skillMdIndex = parts.lastIndexOf("SKILL.md");
  return skillMdIndex > 0 ? parts[skillMdIndex - 1]! : parts.at(-1) ?? skillPath;
}

function getFileName(filePath: string) {
  return filePath.replace(/\\/g, "/").split("/").at(-1) ?? filePath;
}

function getDirectoryName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : ".";
}

function getComposerReferenceBadges(
  draft: string,
  fileContext: ChatFileLinkContext,
  skillPaths: readonly string[]
): ComposerReferenceBadge[] {
  const badges = new Map<string, ComposerReferenceBadge & { index: number }>();

  for (const badge of getComposerSkillBadges(draft, fileContext, skillPaths)) {
    badges.set(badge.key, badge);
  }

  for (const badge of getComposerFileBadges(draft, fileContext)) {
    if (!badges.has(badge.key)) {
      badges.set(badge.key, badge);
    }
  }

  return [...badges.values()]
    .sort((left, right) => left.index - right.index)
    .map((badge) => ({
      key: badge.key,
      kind: badge.kind,
      label: badge.label,
      target: badge.target
    }));
}

function getComposerSkillBadges(
  draft: string,
  fileContext: ChatFileLinkContext,
  skillPaths: readonly string[]
): Array<ComposerReferenceBadge & { index: number }> {
  const skillPathByName = new Map<string, string>();
  for (const skillPath of skillPaths) {
    skillPathByName.set(getSkillName(skillPath).toLowerCase(), skillPath);
  }

  const badges: Array<ComposerReferenceBadge & { index: number }> = [];
  for (const match of draft.matchAll(/(?:^|\s)\/([A-Za-z0-9_.-]+)/g)) {
    const skillName = match[1];
    if (!skillName) {
      continue;
    }
    const skillPath = skillPathByName.get(skillName.toLowerCase());
    if (!skillPath) {
      continue;
    }
    const target = resolveChatFileTarget(skillPath, fileContext) ?? { path: skillPath.replace(/\\/g, "/") };
    badges.push({
      key: `skill:${target.path}`,
      kind: "skill",
      label: `/${skillName}`,
      target,
      index: (match.index ?? 0) + match[0].indexOf("/")
    });
  }
  return badges;
}

function getComposerFileBadges(
  draft: string,
  fileContext: ChatFileLinkContext
): Array<ComposerReferenceBadge & { index: number }> {
  return findChatFileReferences(draft, fileContext)
    .filter((reference) => reference.text.startsWith("@"))
    .map((reference) => ({
      key: `file:${reference.target.path}:${reference.target.line ?? ""}:${reference.target.column ?? ""}`,
      kind: "file" as const,
      label: `@${formatChatFileTarget(reference.target)}`,
      target: reference.target,
      index: reference.index
    }));
}

function formatChatFileTarget(target: ChatFileTarget) {
  const line = target.line ? `:${target.line}` : "";
  const column = target.column ? `:${target.column}` : "";
  return `${target.path}${line}${column}`;
}

function getFileTypeIcon(filePath: string, size: "xs" | "sm") {
  const iconStyles = () => stylex.attrs(size === "sm" ? styles.iconSmall : styles.iconTiny, styles.iconMuted);
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  if (!extension || extension === filePath.toLowerCase()) {
    return <File {...iconStyles()} />;
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico"].includes(extension)) {
    return <Image {...iconStyles()} />;
  }
  if (["json", "jsonc"].includes(extension)) {
    return <FileJson {...iconStyles()} />;
  }
  if (["md", "markdown", "txt", "log", "csv"].includes(extension)) {
    return <FileText {...iconStyles()} />;
  }
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "css",
      "html",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "kt",
      "swift",
      "sql",
      "sh",
      "bash",
      "zsh"
    ].includes(extension)
  ) {
    return <FileCode {...iconStyles()} />;
  }
  return <File {...iconStyles()} />;
}

function formatTokenCount(value: number | undefined) {
  if (value === undefined) {
    return "?";
  }

  if (value < 1_000) {
    return String(value);
  }

  if (value < 1_000_000) {
    const scaled = value / 1_000;
    return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}k`;
  }

  const scaled = value / 1_000_000;
  return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}m`;
}

function formatElapsedDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${seconds}s`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${seconds}s`;
}

function formatResponseTime(timestampMs: number) {
  return formatShortTimestamp(timestampMs);
}

