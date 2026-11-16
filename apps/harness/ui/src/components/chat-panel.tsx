import { typography } from "@hyperfocus/ui";
import { ProjectChatLayout } from "@hyperfocus/ui/composer";
import {
detectSupportedChatAttachment,
isSupportedChatAttachment,
MAX_CHAT_ATTACHMENT_COUNT
} from "@hyperfocus/ai-core/chat-attachments";
import {
createRequestId,
type AgentRunState,
type AgentRunSummary,
type AssistantActionMessageMetadata,
type ChatAttachment,
type ChatMessage,
type ProviderBrand,
type SetupAction
} from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import {
Activity,
AlertTriangle,
Bot,
Brain,
Briefcase,
CalendarClock,
Check,
Clipboard,
ClipboardList,
Cpu,
File,
Folder,
FolderOpen,
Gauge,
MessageSquareMore,
Orbit,
Pause,
Play,
RefreshCcw,
Split
} from "lucide-solid";
import { createEffect,createMemo,createSignal,For,getOwner,onCleanup,onMount,runWithOwner,Show,type Accessor,type JSX,type Setter } from "solid-js";
import {
canSelectProviderBrand,
COMPOSER_REASONING_STRENGTHS,
getActiveMode,
getBlockingSetupCheck,
getCapabilityTags,
getComposerControlState,
getEffectiveProviderBrandForAgent,
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
type HarnessViewState,
type ViewProjectState
} from "../harness-store";
import { findChatFileReferenceAtPosition,findChatFileReferences,resolveChatFileTarget,type ChatFileLinkContext,type ChatFileTarget } from "../lib/chat-file-links";
import { buildExperienceTimelineRows,type ChatTimelineRow,type TimelineLiveMessage } from "../lib/chat-timeline-model";
import { openIdeWindow } from "../lib/ide-window";
import { getCompleteRun } from "../lib/run-status";
import { formatShortTimestamp,resolveBrowserTimezone } from "../lib/time-format";
import { uploadFiles } from "../lib/uploadthing";
import { formatProviderModelName } from "../lib/utils";
import { openBackgroundRunInJobsPane } from "../source-navigation";
import { runDetailRecoveries } from "../store/run-detail-state";
import { TerminalHistoryDialog } from "../terminal/terminal-history-dialog";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { chatPanelStyles as styles } from "./chat-panel.styles";
import { chatUtilityStyles } from "./chat-panel.utilities";
import { ChatComposerSurface } from "./chat-panel/chat-composer-surface";
import { ChatExperimentDialog } from "./chat-panel/chat-experiment-dialog";
import { ChatPanelHeader } from "./chat-panel/chat-panel-header";
import { formatElapsedDuration,formatModeIntentLabel,formatTokenCount,getComposerLookup,getComposerLookupOptionId,getDirectoryName,getFastModeDescription,getFileName,getIdentityInitial,getSkillName } from "./chat-panel/chat-panel-model";
import { ChatProjectSetupNotice } from "./chat-panel/chat-project-setup-notice";
import { ChatSetupDialog } from "./chat-panel/chat-setup-dialog";
import { ChatTranscriptSurface } from "./chat-panel/chat-transcript-surface";
import { getCacheHitPercent } from "./chat-panel/context-usage";
import { ChatPanelProvider,useChatPanel } from "./chat-panel/state/panel-context";
import { TransientTranscriptRow } from "./chat-panel/transient-transcript-row";
import { persistDraftAttachments,readPersistedDraftAttachments } from "./chat/chat-draft-persistence";
import { MarkdownContent } from "./markdown-content";
import { ModelSelect } from "./models/model-select";
import { CopyTextButton } from "./primitives/copy-text-button";
import { DropdownControl } from "./primitives/dropdown";
import { getAgentDropdownIcon,getModeDropdownIcon } from "./primitives/dropdown-option-icons";
import { SetupChecklistCard } from "./setup-checklist-card";
export { formatCapabilityTag } from "./chat-panel/chat-panel-model";

export { getReasoningStrengthDescription } from "./chat-panel/chat-panel-model";
import { getReasoningStrengthDescription } from "./chat-panel/chat-panel-model";

function isHarnessTranscriptMessage(message: ChatMessage) {
  return message.role === "assistant" || message.role === "system";
}

function getTranscriptRoleLabel(role: ChatMessage["role"]) {
  return role === "user" ? "You" : "Assistant";
}


function getCopyAriaLabel(message: ChatMessage) {
  return `Copy ${isHarnessTranscriptMessage(message) ? "harness" : message.role} message`;
}

function getPlanFromMessage(message: ChatMessage) {
  return message.metadata?.type === "plan-summary" ? message.metadata.plan : undefined;
}

function requirePlanRunId(message: ChatMessage) {
  if (message.metadata?.type !== "plan-summary") throw new Error("Expected plan summary metadata");
  return message.metadata.runId;
}

function getAssistantActionMetadata(message: ChatMessage) {
  return message.metadata?.type === "assistant-action" ? message.metadata : undefined;
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

function createComposerLookupDomActions(options: {
  composerLookupIndex: Accessor<number>;
  composerLookupKey: () => string | undefined;
  composerLookupOpen: () => boolean;
  owner: ReturnType<typeof getOwner>;
  refs: { messageViewport?: HTMLDivElement; attachmentInput?: HTMLInputElement; composerTextarea?: HTMLTextAreaElement; composerLookupMenu?: HTMLDivElement; };
  setComposerCaret: Setter<number | undefined>;
  setComposerLookupForcedClosed: Setter<boolean>;
  setComposerLookupIndex: Setter<number>;
  setDismissedComposerLookupKey: Setter<string | undefined>;
}) {
  const {
    composerLookupIndex, composerLookupKey, composerLookupOpen, owner, refs,
    setComposerCaret, setComposerLookupForcedClosed, setComposerLookupIndex, setDismissedComposerLookupKey,
  } = options;
  function syncComposerCaret() {
      if (refs.composerTextarea) {
        setComposerCaret(refs.composerTextarea.selectionStart);
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
        queueMicrotask(() => refs.composerTextarea?.focus());
      }
    }

  function updateComposerLookupDomSelection(activeIndex: number) {
      refs.composerLookupMenu?.querySelectorAll<HTMLElement>("[data-composer-lookup-option]").forEach((element) => {
        const selected = element.getAttribute("data-composer-lookup-index") === String(activeIndex);
        element.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

  function syncComposerLookupDomVisibility(options: { focusMenu?: boolean } = {}) {
      if (!refs.composerLookupMenu) {
        return;
      }
      const open = composerLookupOpen();
      setComposerLookupMenuHidden(!open);
      if (open) {
        updateComposerLookupDomSelection(composerLookupIndex());
        if (options.focusMenu) {
          refs.composerLookupMenu.focus();
        }
      }
    }

  function setComposerLookupMenuHidden(hidden: boolean) {
      if (!refs.composerLookupMenu) {
        return;
      }
      refs.composerLookupMenu.hidden = hidden;
      refs.composerLookupMenu.setAttribute("aria-hidden", hidden ? "true" : "false");
      if (hidden) {
        refs.composerLookupMenu.removeAttribute("role");
        refs.composerLookupMenu.removeAttribute("aria-label");
      } else {
        refs.composerLookupMenu.setAttribute("role", "listbox");
        refs.composerLookupMenu.setAttribute("aria-label", "Composer lookup");
      }
      refs.composerLookupMenu.querySelectorAll<HTMLElement>("[data-composer-lookup-option]").forEach((element) => {
        if (hidden) {
          element.removeAttribute("role");
        } else {
          element.setAttribute("role", "option");
        }
      });
      refs.composerLookupMenu.style.display = hidden ? "none" : "";
    }

  function setComposerLookupActiveIndex(index: number) {
      setComposerLookupIndex(index);
      updateComposerLookupDomSelection(index);
    }
  return { dismissComposerLookup, runWithChatPanelOwner, setComposerLookupActiveIndex, setComposerLookupMenuHidden, syncComposerCaret, syncComposerLookupDomVisibility, updateComposerLookupDomSelection };
}


function createComposerLookupActions(options: {
  activeProject: () => ViewProjectState | undefined;
  chatFileLinkContext: () => ChatFileLinkContext;
  composerLookup: () => { kind: "skill"; query: string; start: number; end: number; } | { kind: "file"; query: string; start: number; end: number; } | undefined;
  composerLookupIndex: Accessor<number>;
  composerLookupKey: () => string | undefined;
  composerLookupOpen: () => boolean;
  composerLookupOptions: () => { label: string; detail: string; insertText: string; }[];
  dismissComposerLookup: (options?: { focusComposer?: boolean; }) => void;
  project: () => ViewProjectState;
  refs: { messageViewport?: HTMLDivElement; attachmentInput?: HTMLInputElement; composerTextarea?: HTMLTextAreaElement; composerLookupMenu?: HTMLDivElement; };
  resizeComposer: () => void;
  setComposerCaret: Setter<number | undefined>;
  setComposerLookupActiveIndex: (index: number) => void;
  setComposerLookupForcedClosed: Setter<boolean>;
  setComposerLookupMenuHidden: (hidden: boolean) => void;
  setDismissedComposerLookupKey: Setter<string | undefined>;
  syncComposerCaret: () => void;
  syncComposerLookupDomVisibility: (options?: { focusMenu?: boolean; }) => void;
}) {
  const {
    activeProject, chatFileLinkContext, composerLookup, composerLookupIndex, composerLookupKey,
    composerLookupOpen, composerLookupOptions, dismissComposerLookup, project, refs,
    resizeComposer, setComposerCaret, setComposerLookupActiveIndex, setComposerLookupForcedClosed, setComposerLookupMenuHidden,
    setDismissedComposerLookupKey, syncComposerCaret, syncComposerLookupDomVisibility,
  } = options;
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
        refs.composerTextarea?.setSelectionRange(nextCaret, nextCaret);
        refs.composerTextarea?.focus();
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
      const lookupWasOpen = composerLookupOpen();
      syncComposerCaret();
      if (!event.ctrlKey && !event.metaKey) {
        if (lookupWasOpen) {
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
  return { applyComposerLookupOption, handleComposerBadgeClick, handleComposerClick, handleComposerKeyDown, handleComposerLookupKeyDown, handleOpenChatFile };
}


function createChatAttachmentActions(options: {
  activeProject: () => ViewProjectState | undefined;
  draftAttachments: Accessor<{ id: string; kind: "image" | "text" | "document"; name: string; mimeType: string; sizeBytes: number; url: string; key: string; uploadedAt: string; documentType?: "pdf" | "docx" | "xlsx" | "pptx" | "odt" | undefined; }[]>;
  hasVisionCapability: () => boolean;
  setDraftAttachments: Setter<{ id: string; kind: "image" | "text" | "document"; name: string; mimeType: string; sizeBytes: number; url: string; key: string; uploadedAt: string; documentType?: "pdf" | "docx" | "xlsx" | "pptx" | "odt" | undefined; }[]>;
  setDraggingAttachments: Setter<boolean>;
  setUploadingAttachments: Setter<boolean>;
  state: HarnessViewState;
}) {
  const {
    activeProject, draftAttachments, hasVisionCapability, setDraftAttachments, setDraggingAttachments,
    setUploadingAttachments, state,
  } = options;
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
            }
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
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement)) return;
      const files = input.files ? [...input.files] : [];
      input.value = "";

      await uploadAttachmentFiles(files);
    }

  function handleRemoveAttachment(attachmentId: string) {
      setDraftAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
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
  return { handleAttachmentDragLeave, handleAttachmentDragOver, handleAttachmentDrop, handleRemoveAttachment, handleSelectAttachments, uploadAttachmentFiles };
}


function createChatSubmitAction(options: {
  activeMode: () => { id: string; description: string; updatedAt: string; scope: "project" | "workspace" | "builtin"; label: string; plannerPrompt: string; executionPrompt: string; toolPolicy: "full-access" | "read-heavy" | "review-only"; executionAccess: "workspace-write" | "read-only"; planExecutionModeDefault?: "countdown" | "approve" | "immediate" | undefined; subagentWorktreeStrategyDefault?: "same-worktree" | "separate-worktrees" | undefined; correctnessIterationModeDefault?: "ask-before-iterate" | "auto-once" | "auto-until-clean" | undefined; };
  activeProject: () => ViewProjectState | undefined;
  clearCountdown: () => void;
  composerSubmitState: Accessor<{ disabled: boolean; disabledReason: string | undefined; tooltip: string; }>;
  draftAttachments: Accessor<{ id: string; kind: "image" | "text" | "document"; name: string; mimeType: string; sizeBytes: number; url: string; key: string; uploadedAt: string; documentType?: "pdf" | "docx" | "xlsx" | "pptx" | "odt" | undefined; }[]>;
  getComposerControlPayload: () => { reasoningStrength: "low" | "medium" | "high" | "extra-high"; fastMode: boolean; };
  getEffectiveExecutionModelId: () => string;
  getSelectedAgentUnavailableReason: () => string | undefined;
  hasImageDraftAttachments: () => boolean;
  hasVisionCapability: () => boolean;
  isAutoModeSelected: () => boolean;
  pendingQuestion: () => { status: "pending" | "deferred" | "answered"; id: string; prompt: string; required: boolean; askedAt: string; logicalQuestionId?: string | undefined; placeholder?: string | undefined; responseKind?: "choice" | "freeform" | undefined; answerText?: string | undefined; choices?: { id: string; description: string; label: string; answerText: string; recommended: boolean; }[] | undefined; intent?: { type: "assistant-create-intent"; projectId: string; threadId: string; sourcePrompt: string; suggestedName: string; defaultScope: "project" | "global"; purpose?: string | undefined; requiresPurpose?: boolean | undefined; } | { type: "assistant-action-intent"; sourcePrompt: string; actionKind: "pause" | "resume" | "create" | "chat" | "inspect" | "list-jobs" | "create-job" | "run-job" | "clone" | "answer-question" | "update-todo" | "recover"; questionId?: string | undefined; jobId?: string | undefined; jobPrompt?: string | undefined; todoId?: string | undefined; answerText?: string | undefined; assistantSelector?: string | undefined; candidateAssistantIds?: string[] | undefined; candidateJobIds?: string[] | undefined; candidateQuestionIds?: string[] | undefined; candidateTodoIds?: string[] | undefined; scheduleText?: string | undefined; } | undefined; answeredAt?: string | undefined; } | undefined;
  persistProviderPreferences: (providerBrand: ProviderBrand) => void;
  resumableRun: Accessor<AgentRunState | undefined>;
  selectedAgentId: () => "pi" | "copilot-cli" | "codex-cli";
  sendCommand: typeof harnessStore.actions.sendCommand;
  setDraftAttachments: Setter<{ id: string; kind: "image" | "text" | "document"; name: string; mimeType: string; sizeBytes: number; url: string; key: string; uploadedAt: string; documentType?: "pdf" | "docx" | "xlsx" | "pptx" | "odt" | undefined; }[]>;
  state: HarnessViewState;
  uploadingAttachments: Accessor<boolean>;
}) {
  const {
    activeMode, activeProject, clearCountdown, composerSubmitState, draftAttachments,
    getComposerControlPayload, getEffectiveExecutionModelId, getSelectedAgentUnavailableReason, hasImageDraftAttachments, hasVisionCapability,
    isAutoModeSelected, pendingQuestion, persistProviderPreferences, resumableRun, selectedAgentId,
    sendCommand, setDraftAttachments, state, uploadingAttachments,
  } = options;
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
      if ((project.session.isStreaming || project.threads.find(thread => thread.id === project.activeThreadId)?.lineage?.status === "running") && content) {
        sendCommand({ type: "thread.input", requestId: createRequestId(), payload: {
          projectId: project.id, threadId: project.activeThreadId, message: content, deliveryId: crypto.randomUUID(), mode: "queue"
        } });
        return;
      }
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
  return { handleSubmit };
}


function createChatSetupActions(options: {
  activeProject: () => ViewProjectState | undefined;
  autoExecutedRunId: Accessor<string | undefined>;
  executionPaused: () => boolean;
  getComposerControlPayload: () => { reasoningStrength: "low" | "medium" | "high" | "extra-high"; fastMode: boolean; };
  handleExecuteRun: (runId: string, useSavedControls?: boolean) => void;
  pendingQuestion: () => { status: "pending" | "deferred" | "answered"; id: string; prompt: string; required: boolean; askedAt: string; logicalQuestionId?: string | undefined; placeholder?: string | undefined; responseKind?: "choice" | "freeform" | undefined; answerText?: string | undefined; choices?: { id: string; description: string; label: string; answerText: string; recommended: boolean; }[] | undefined; intent?: { type: "assistant-create-intent"; projectId: string; threadId: string; sourcePrompt: string; suggestedName: string; defaultScope: "project" | "global"; purpose?: string | undefined; requiresPurpose?: boolean | undefined; } | { type: "assistant-action-intent"; sourcePrompt: string; actionKind: "pause" | "resume" | "create" | "chat" | "inspect" | "list-jobs" | "create-job" | "run-job" | "clone" | "answer-question" | "update-todo" | "recover"; questionId?: string | undefined; jobId?: string | undefined; jobPrompt?: string | undefined; todoId?: string | undefined; answerText?: string | undefined; assistantSelector?: string | undefined; candidateAssistantIds?: string[] | undefined; candidateJobIds?: string[] | undefined; candidateQuestionIds?: string[] | undefined; candidateTodoIds?: string[] | undefined; scheduleText?: string | undefined; } | undefined; answeredAt?: string | undefined; } | undefined;
  readyRun: Accessor<AgentRunState | undefined>;
  savePreferences: (overrides?: { providerBrand?: ProviderBrand; blockChatOnDirtyGitDefault?: boolean; }) => void;
  sendCommand: typeof harnessStore.actions.sendCommand;
  setAutoExecutedRunId: Setter<string | undefined>;
  setCountdownFrozenByExecutionPause: Setter<boolean>;
  setCountdownPaused: Setter<boolean>;
  setCountdownRemainingMs: Setter<number>;
  setCountdownRunId: Setter<string | undefined>;
  timers: { countdown?: number; waiting?: number; };
}) {
  const {
    activeProject, autoExecutedRunId, executionPaused, getComposerControlPayload, handleExecuteRun,
    pendingQuestion, readyRun, savePreferences, sendCommand, setAutoExecutedRunId,
    setCountdownFrozenByExecutionPause, setCountdownPaused, setCountdownRemainingMs, setCountdownRunId, timers,
  } = options;
  function startCountdown(runId: string) {
      if (timers.countdown !== undefined) {
        window.clearInterval(timers.countdown);
      }

      timers.countdown = window.setInterval(() => {
        setCountdownRemainingMs((value) => {
          const next = Math.max(0, value - 100);
          if (next === 0 && readyRun()?.id === runId && autoExecutedRunId() !== runId && !executionPaused()) {
            clearCountdown();
            handleExecuteRun(runId, true);
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
      if (!project) return;
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
      if (timers.countdown !== undefined) {
        window.clearInterval(timers.countdown);
        timers.countdown = undefined;
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
  return { clearCountdown, handleCancelNonGitPreflight, handleDisableDirtyGitCheck, handleInitGitBaseline, handleQuestionChoice, handleSetupAction, startCountdown };
}


export function createChatPanelController() {
  const refs: {
    messageViewport?: HTMLDivElement;
    attachmentInput?: HTMLInputElement;
    composerTextarea?: HTMLTextAreaElement;
    composerLookupMenu?: HTMLDivElement;
  } = {};
  const timers: { countdown?: number; waiting?: number } = {};
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
  const project = () => {
    const currentProject = activeProject();
    if (!currentProject) throw new Error("Expected an active project");
    return currentProject;
  };
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
  const [draftAttachments, setDraftAttachments] = createSignal<ChatAttachment[]>(readPersistedDraftAttachments(undefined));
  const [uploadingAttachments, setUploadingAttachments] = createSignal(false);
  const [draggingAttachments, setDraggingAttachments] = createSignal(false);
  const [attachmentDraftHydrated, setAttachmentDraftHydrated] = createSignal(false);
  const [composerSettingsOpen, setComposerSettingsOpen] = createSignal(false);
  const [desktopReasoningMenuOpen, setDesktopReasoningMenuOpen] = createSignal(false);
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
  const activeThreadIsStreaming = () => Boolean(workingRun()) || activeThread()?.lineage?.status === "running";
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
  const visibleTabs = () => { const tabs: Array<{ id: ChatPaneTab; label: string; icon: JSX.Element; tooltip: string }> = [
      { id: "chat", label: "Chat", icon: <MessageSquareMore class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open transcript and plan cards" },
      { id: "plan", label: "Plan", icon: <ClipboardList class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open planning context and saved plan tools" },
      { id: "run", label: "Run", icon: <Play class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open run status, subtasks, and experiment actions" },
      { id: "memory", label: "Memory", icon: <Brain class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open intentional project notes and retrieval audit" },
      { id: "events", label: "Model events", icon: <Activity class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />, tooltip: "Open model trace events; tool activity remains in Run" }
    ]; return tabs.filter((tab) => state.experienceMode === "advanced" || tab.id === "chat" || tab.id === "run"); };
  const experimentRun = () => activeProject()?.activeRun?.experiment ?? activeProject()?.lastRun?.experiment;
  const countdownReadyRun = () => {
    const run = readyRun();
    return run && currentExecutionPlan()?.gating.mode === "countdown" && countdownRunId() === run.id ? run : undefined;
  };
  const terminalHistoryScope = () => {
    const currentProject = activeProject();
    return currentProject ? { projectId: currentProject.id, threadId: currentProject.activeThreadId } : undefined;
  };
  const liveHarnessMessages = () => {
    const project = activeProject();
    return project ? getStreamingLiveMessages(project) : [];
  };
  const projectTraces = createMemo(() => reactiveArraySnapshot(activeProject()?.traces));
  const hasBranchfsSizeWarning = createMemo(() => projectTraces().some((trace) => trace.stage === "branchfs-size-warning"));
  const transcriptRows = createMemo<ChatTimelineRow[]>(() => {
    const project = activeProject();
    return buildExperienceTimelineRows(state.experienceMode, {
      messages: reactiveArraySnapshot(project?.session.messages),
      liveMessages: liveHarnessMessages(),
      toolActivities: reactiveArraySnapshot(project?.activeRun?.toolActivities ?? project?.lastRun?.toolActivities),
      activeRunId: project?.activeRun?.id ?? project?.lastRun?.id
    });
  });
  const liveHarnessMessageTimestamp = () => activeProject()?.activeRun?.updatedAt ?? activeProject()?.activeRun?.createdAt;
  const runSubtasks = createMemo(() => reactiveArraySnapshot(activeProject()?.activeRun?.subtasks ?? activeProject()?.lastRun?.subtasks));
  const currentRun = () => getCompleteRun(activeProject()?.activeRun) ?? getCompleteRun(activeProject()?.lastRun);
  const runDetailRecovery = () => runDetailRecoveries.find(({ projectId, runId }) => projectId === activeProject()?.id && runId === (activeProject()?.activeRun ?? activeProject()?.lastRun)?.id);
  const currentBackgroundRun = createMemo(() => state.backgroundJobs.runs.find((entry) => entry.linkedAgentRunId === (activeProject()?.activeRun ?? activeProject()?.lastRun)?.id));
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
  const setupBlockedReason = () => {
    const check = blockingSetupCheck();
    return requiresFreshTopLevelSend() && check ? check.summary : undefined;
  };
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
      return { disabled: !content, disabledReason: content ? undefined : "Enter a follow-up message", tooltip: "Queue message · Ctrl+Enter sends now" };
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
      onChange={handleSelectAgent}
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
      onChange={handleProviderBrandSelect}
      dataAttributes={{ "data-test-provider-select": "" }}
    />
  );
  const renderModelControl = (size: "sm" | "md" = "sm", className?: string, hideWhenSingleOption: boolean = true) => (
    <ModelSelect
      ariaLabel="Select model"
      icon={<Cpu class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
      size={size}
      class={className}
      value={getEffectiveExecutionModelId()}
      options={modelDropdownOptions()}
      hideWhenSingleOption={hideWhenSingleOption}
      onChange={handleExecutionModelSelect}
      dataAttributes={{ "data-test-model-select": "" }}
    />
  );
  const renderEffortControl = (onToggle: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>) => (
    <DropdownControl
      kind="trigger"
      ariaLabel="Open effort options"
      icon={<Gauge class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
      label={composerSettingsLabel()}
      onClick={onToggle}
      dataAttributes={{ "data-test-effort-trigger": "" }}
    />
  );

  const scrollToBottom = (force: boolean = false) => {
    if (!refs.messageViewport || (!force && !stickToBottom())) {
      return;
    }

    queueMicrotask(() => {
      if (!refs.messageViewport) {
        return;
      }

      refs.messageViewport.scrollTop = refs.messageViewport.scrollHeight;
    });
  };

  const updateScrollLock = () => {
    if (!refs.messageViewport) {
      setStickToBottom(true);
      return;
    }

    const distanceFromBottom =
      refs.messageViewport.scrollHeight - refs.messageViewport.scrollTop - refs.messageViewport.clientHeight;
    setStickToBottom(distanceFromBottom <= 32);
  };

  onMount(() => {
    scrollToBottom(true);
    timers.waiting = window.setInterval(() => setElapsedNowMs(Date.now()), 1000);
  });

  onCleanup(() => {
    clearCountdown();
    if (timers.waiting !== undefined) {
      window.clearInterval(timers.waiting);
      timers.waiting = undefined;
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
      if (refs.composerLookupMenu?.contains(target) || refs.composerTextarea?.contains(target)) {
        return;
      }
      dismissComposerLookup();
    };
    const handleLookupWindowKeyDown = (event: KeyboardEvent) => {
      if (!composerLookupOpen()) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && (refs.composerLookupMenu?.contains(target) || refs.composerTextarea?.contains(target))) {
        return;
      }
      if (event.key === "Escape") {
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
    const run = readyRun();
    const executionPlan = currentExecutionPlan();
    if (!run || !executionPlan) {
      clearCountdown();
      return;
    }

    if (executionPlan.gating.mode === "immediate") {
      clearCountdown();
      if (!executionPaused() && autoExecutedRunId() !== run.id) {
        handleExecuteRun(run.id, true);
        setAutoExecutedRunId(run.id);
      }
      return;
    }

    if (executionPlan.gating.mode !== "countdown") {
      clearCountdown();
      return;
    }

    if (countdownRunId() === run.id) {
      if (!executionPaused() && timers.countdown === undefined && !countdownPaused() && countdownRemainingMs() > 0) {
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
      if (timers.countdown !== undefined) {
        window.clearInterval(timers.countdown);
        timers.countdown = undefined;
      }
      setCountdownFrozenByExecutionPause(true);
      return;
    }

    if (countdownFrozenByExecutionPause() && timers.countdown === undefined && !countdownPaused() && countdownRemainingMs() > 0) {
      setCountdownFrozenByExecutionPause(false);
      startCountdown(run.id);
    }
  });

  const setupActions = createChatSetupActions({
    activeProject, autoExecutedRunId, executionPaused, getComposerControlPayload, handleExecuteRun,
    pendingQuestion, readyRun, savePreferences, sendCommand, setAutoExecutedRunId,
    setCountdownFrozenByExecutionPause, setCountdownPaused, setCountdownRemainingMs, setCountdownRunId, timers,
  });
  const { clearCountdown, handleCancelNonGitPreflight, handleDisableDirtyGitCheck, handleInitGitBaseline, handleQuestionChoice, handleSetupAction, startCountdown } = setupActions;

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

  const attachmentActions = createChatAttachmentActions({
    activeProject, draftAttachments, hasVisionCapability, setDraftAttachments, setDraggingAttachments,
    setUploadingAttachments, state,
  });
  const {
    handleAttachmentDragLeave, handleAttachmentDragOver, handleAttachmentDrop,
    handleRemoveAttachment, handleSelectAttachments,
  } = attachmentActions;

  const composerLookupDomActions = createComposerLookupDomActions({
    composerLookupIndex, composerLookupKey, composerLookupOpen, owner, refs,
    setComposerCaret, setComposerLookupForcedClosed, setComposerLookupIndex, setDismissedComposerLookupKey,
  });
  const {
    dismissComposerLookup, runWithChatPanelOwner, setComposerLookupActiveIndex,
    setComposerLookupMenuHidden, syncComposerCaret, syncComposerLookupDomVisibility,
  } = composerLookupDomActions;

  const composerLookupActions = createComposerLookupActions({
    activeProject, chatFileLinkContext, composerLookup, composerLookupIndex, composerLookupKey,
    composerLookupOpen, composerLookupOptions, dismissComposerLookup, project, refs,
    resizeComposer, setComposerCaret, setComposerLookupActiveIndex, setComposerLookupForcedClosed, setComposerLookupMenuHidden,
    setDismissedComposerLookupKey, syncComposerCaret, syncComposerLookupDomVisibility,
  });
  const { applyComposerLookupOption, handleComposerBadgeClick, handleComposerClick, handleComposerKeyDown, handleComposerLookupKeyDown, handleOpenChatFile } = composerLookupActions;

  const submitAction = createChatSubmitAction({
    activeMode, activeProject, clearCountdown, composerSubmitState, draftAttachments,
    getComposerControlPayload, getEffectiveExecutionModelId, getSelectedAgentUnavailableReason, hasImageDraftAttachments, hasVisionCapability,
    isAutoModeSelected, pendingQuestion, persistProviderPreferences, resumableRun, selectedAgentId,
    sendCommand, setDraftAttachments, state, uploadingAttachments,
  });
  const { handleSubmit } = submitAction;

  function handleSelectAgent(agentId: string) {
    if (agentId !== "pi" && agentId !== "copilot-cli" && agentId !== "codex-cli") return;
    harnessStore.setSelectedAgentId(agentId);
  }

  function resizeComposer() {
    if (!refs.composerTextarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(refs.composerTextarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 18;
    const minHeight = lineHeight * 2;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxHeight = Math.max(lineHeight * 6, Math.floor(viewportHeight * 0.5));
    refs.composerTextarea.style.height = "auto";
    refs.composerTextarea.style.maxHeight = `${maxHeight}px`;
    const nextHeight = Math.max(minHeight, Math.min(refs.composerTextarea.scrollHeight, maxHeight));
    refs.composerTextarea.style.height = `${nextHeight}px`;
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

  function handleExecuteRun(runId: string, useSavedControls = false) {
    handleExecuteRunTarget(runId, "current-project", useSavedControls);
  }

  function handleExecuteRunTarget(runId: string, target: "current-project" | "ephemeral-experiment", useSavedControls = false) {
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
        ...(useSavedControls ? {} : getComposerControlPayload())
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

    return [getCompleteRun(project.activeRun), getCompleteRun(project.lastRun)].find((entry) => entry?.id === runId) ??
      (runId ? undefined : getCompleteRun(project.activeRun) ?? getCompleteRun(project.lastRun));
  }

  function getPlanRunState(runId: string): AgentRunState | AgentRunSummary | undefined {
    const project = activeProject(), projected = [project?.activeRun, project?.lastRun].find((entry) => entry?.id === runId);
    return projected && !getCompleteRun(projected) ? undefined : projected ?? project?.runSummaries.find((run) => run.id === runId);
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

  function renderTranscriptRow(row: ChatTimelineRow, project: ViewProjectState) {
    if (row.kind !== "persisted") {
      return (
        <TransientTranscriptRow
          row={row}
          agentLabel={selectedAgentLabel()}
          fileLinks={chatFileLinks()}
          liveMessageCount={liveHarnessMessages().length}
          timestamp={liveHarnessMessageTimestamp()}
        />
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
          <article {...stylex.attrs(styles.transcriptMessage)}>
            <div
              {...stylex.attrs(styles.transcriptAvatar, !isHarnessTranscriptMessage(message) ? styles.transcriptAvatarUser : undefined)}
              aria-hidden="true"
            >
              {isHarnessTranscriptMessage(message) ? getIdentityInitial(selectedAgentLabel()) : "Y"}
            </div>
            <div
              {...stylex.attrs(
                styles.transcriptCard,
                styles.transcriptBubble,
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
                  {isHarnessTranscriptMessage(message) ? selectedAgentLabel() : getTranscriptRoleLabel(message.role)}
                </div>
                <Show when={message.kind === "run-milestones" && message.metadata?.type === "run-milestones" && message.metadata.status === "open"}>
                  <span {...stylex.attrs(styles.progressChip)}>
                    In progress
                  </span>
                </Show>
              </div>
              <MarkdownContent content={() => message.content} size="compact" fileLinks={chatFileLinks()} />
              <Show when={getAssistantActionMetadata(message)}>
                {(metadata) => renderAssistantActionCard(metadata())}
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
            </div>
          </article>
        }
      >
        <article class={stylex.attrs(chatUtilityStyles.themeSelectedSurface, chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded3xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.p4, chatUtilityStyles.shadowSm).class}>
          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking02em, chatUtilityStyles.textVariableAccentStrong).class}>
            <Clipboard class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
            Plan summary
          </div>
          <MarkdownContent content={() => getPlanFromMessage(message)?.summary ?? ""} fileLinks={chatFileLinks()} />
          <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap2, typography.body, chatUtilityStyles.textVariableMuted, chatUtilityStyles.mdGridCols2).class}>
            <div>Route: {getPlanFromMessage(message)?.route}</div>
            <div>Difficulty: {getPlanFromMessage(message)?.difficultyScore}%</div>
            <div>Parallel slots: {getPlanFromMessage(message)?.actualSubagentCount}</div>
            <div>Prereqs: {getPlanFromMessage(message)?.prerequisites.length}</div>
            <div>Contracts: {getPlanFromMessage(message)?.contracts.length}</div>
            <div>Isolation: {getPlanFromMessage(message)?.subagentWorktreeStrategy}</div>
            <div>Correctness: {getPlanFromMessage(message)?.correctnessPolicy}</div>
          </div>
          <Show when={hasBranchfsSizeWarning()}>
            <div class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.wFit, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap1, chatUtilityStyles.rounded, chatUtilityStyles.border, chatUtilityStyles.borderAmber300, chatUtilityStyles.bgAmber50, chatUtilityStyles.px2, chatUtilityStyles.py1, typography.caption, chatUtilityStyles.fontMedium, chatUtilityStyles.textAmber800).class}>
              <AlertTriangle class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />
              BranchFS large
            </div>
          </Show>
          <div class={stylex.attrs(chatUtilityStyles.mt3, chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
            <div class={stylex.attrs(chatUtilityStyles.minW0, typography.caption, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
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
                onClick={() => handlePromoteScheduledRun(requirePlanRunId(message))}
              >
                Schedule
              </ActionButton>
              {renderPlanRunAction(requirePlanRunId(message))}
              <Show when={getPlanFromMessage(message)?.gating.mode === "approve"}>
                <ActionButton
                  tooltip="Run this plan in isolated virtual branch"
                  disabledReason={
                    getPlanRunAction(requirePlanRunId(message)).kind === "execute"
                      ? executionPauseReason()
                      : "This plan is not ready to build"
                  }
                  disabled={getPlanRunAction(requirePlanRunId(message)).kind !== "execute" || executionPaused()}
                  size="sm"
                  variant="secondary"
                  onClick={() => handleExecuteRunTarget(requirePlanRunId(message), "ephemeral-experiment")}
                >
                  Try experiment
                </ActionButton>
              </Show>
              <Show when={getPlanFromMessage(message)?.gating.mode === "countdown" && readyRun()?.id === requirePlanRunId(message)}>
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

    if (timers.countdown !== undefined) {
      window.clearInterval(timers.countdown);
      timers.countdown = undefined;
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

    const summary = usage.usagePercent === undefined ? "Current context usage unavailable" : `${Math.round(usage.usagePercent)}% · ${formatTokenCount(usage.tokens)} / ${formatTokenCount(usage.contextWindow)} context used`;
    const cacheHitPercent = getCacheHitPercent(usage);
    const cacheLine =
      cacheHitPercent === undefined
        ? undefined
        : `Cache hit: ${cacheHitPercent}% (${formatTokenCount(usage.cachedInputTokens)} tokens)`;
    const totalProcessedLine =
      usage.totalProcessedTokens === undefined ? undefined : `Total processed: ${formatTokenCount(usage.totalProcessedTokens)} tokens`;
    return [summary, cacheLine, totalProcessedLine, "Automatically compacts its context when needed."].filter(Boolean).join("\n");
  }


  function handleProviderBrandSelect(providerBrand: string) {
    if (providerBrand !== "gpt" && providerBrand !== "gemini" && providerBrand !== "claude") return;
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
    const disabledHint = () =>
      COMPOSER_REASONING_STRENGTHS.some((strength) => !composerControlState().availableStrengths.includes(strength)) ||
      !composerControlState().supportsFastMode
        ? "Unavailable for current runtime/model."
        : undefined;

    return (
      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap05).class}>
          <span class={stylex.attrs(chatUtilityStyles.px1, typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableMuted).class}>Effort</span>
          <For each={COMPOSER_REASONING_STRENGTHS}>
            {(strength) => {
              const enabled = () => composerControlState().availableStrengths.includes(strength);
              const selected = () => selectedReasoningStrength() === strength;
              return (
                  <button
                    type="button"
                    disabled={!enabled()}
                    aria-pressed={selected()}
                    class={stylex.attrs(typography.control, styles.composerMenuOption).class}
                    onClick={() => {
                      if (!enabled()) {
                        return;
                      }
                      handleReasoningStrengthSelect(strength);
                    }}
                  >
                    <span class={stylex.attrs(styles.composerMenuOptionCopy).class}>
                      <span>{formatReasoningOptionLabel(strength)}</span>
                      <span class={stylex.attrs(styles.composerMenuOptionDescription).class}>{getReasoningStrengthDescription(strength)}</span>
                    </span>
                    <Show when={selected()}>
                      <Check class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />
                    </Show>
                  </button>
              );
            }}
          </For>
        </div>
        <div class={stylex.attrs(chatUtilityStyles.hPx, chatUtilityStyles.bgBlack10).class} />
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap05).class}>
          <span class={stylex.attrs(chatUtilityStyles.px1, typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableMuted).class}>Fast mode</span>
          <For each={[false, true] as const}>
            {(enabled) => {
              const supported = () => !enabled || composerControlState().supportsFastMode;
              const selected = () => selectedFastMode() === enabled;
              return (
                  <button
                    type="button"
                    disabled={!supported()}
                    aria-pressed={selected()}
                    class={stylex.attrs(typography.control, styles.composerMenuOption).class}
                    onClick={() => {
                      if (!supported()) {
                        return;
                      }
                      handleFastModeSelect(enabled);
                    }}
                  >
                    <span class={stylex.attrs(styles.composerMenuOptionCopy).class}>
                      <span>{enabled ? "On" : "Off"}</span>
                      <span class={stylex.attrs(styles.composerMenuOptionDescription).class}>{getFastModeDescription(enabled)}</span>
                    </span>
                    <Show when={selected()}>
                      <Check class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />
                    </Show>
                  </button>
              );
            }}
          </For>
        </div>
        <Show when={disabledHint()}>
          <div class={stylex.attrs(chatUtilityStyles.px1, typography.caption, chatUtilityStyles.textVariableMuted).class}>{disabledHint()}</div>
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
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking02em, chatUtilityStyles.textVariableAccentStrong).class}>
          <Bot class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
          Assistant action
        </div>
        <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap2, typography.body, chatUtilityStyles.textVariableMuted, chatUtilityStyles.mdGridCols2).class}>
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

  return {
    activeMode, activeProject, activeThread, activeThreadIsStreaming, applyComposerLookupOption,
    attachmentButtonDisabled, attachmentButtonReason, capabilityTags, chatFileLinks, composerLookup,
    composerLookupActiveOptionId, composerLookupOpen, composerLookupRenderedOptions, composerReferenceBadges, composerSettingsOpen,
    composerSubmitState, composerTimerState, contextUsage, countdownPaused, countdownReadyRun,
    countdownRemainingMs, currentBackgroundRun, currentExecutionPlan, currentRun, currentTab,
    desktopReasoningMenuOpen, draftAttachments, draggingAttachments, dropState, editingThreadTitle,
    executionPauseReason, executionPaused, experimentDialogOpen, experimentRun, failedSubtaskCount,
    getCacheHitPercent, getComposerPlaceholder, getContextUsageTooltip, handleAttachmentDragLeave, handleAttachmentDragOver,
    handleAttachmentDrop, handleBrowseProject, handleCancelNonGitPreflight, handleCommitRenameThread, handleComposerBadgeClick,
    handleComposerClick, handleComposerKeyDown, handleComposerLookupKeyDown, handleDisableDirtyGitCheck, handleDiscardExperiment,
    handleForkThread, handleInitGitBaseline, handleInspectExperiment, handleModeSelect, handleOpenCurrentRunJob,
    handleOpenThreadTerminalHistory, handlePauseAutoRun, handlePromoteExperiment, handlePromoteScheduledRun, handleQuestionChoice,
    handleRemoveAttachment, handleReset, handleResume, handleResumeAutoRun, handleRetry,
    handleSaveProjectContext, handleSelectAttachments, handleSelectPaneTab, handleSetupAction, handleStartRenameThread,
    handleStop, handleSubmit, isAutoModeSelected, modeDropdownOptions,
    pendingQuestion, project, projectRulesDraft, projectTraces, refs,
    renderAgentControl, renderComposerControlMenu, renderEffortControl, renderModeControl, renderModelControl,
    renderPlanRunAction, renderProviderControl, renderTranscriptRow, resizeComposer, resumableRun,
    retryableRun, runDetailRecovery, runSubtasks, runWithChatPanelOwner, scrollToBottom,
    selectedAgentHealthMessage, selectedAgentLabel, selectedExperimentFilePath, selectedModeValue, sendCommand, setComposerLookupActiveIndex,
    setComposerLookupForcedClosed, setComposerLookupMenuHidden, setComposerSettingsOpen, setDesktopReasoningMenuOpen, setDismissedComposerLookupKey,
    setEditingThreadTitle, setExperimentDialogOpen, setProjectRulesDraft, setSelectedExperimentFilePath,
    setTerminalHistoryOpen, setThreadTitleDraft, state, stickToBottom, syncComposerCaret,
    syncComposerLookupDomVisibility, terminalHistoryOpen, terminalHistoryScope, threadTitleDraft, transcriptRows,
    updateScrollLock, uploadingAttachments, visibleTabs,
  };
}
export type ChatPanelController = ReturnType<typeof createChatPanelController>;
export function ChatPanel() {
  const controller = createChatPanelController();
  return <ChatPanelProvider value={controller}><ChatPanelView /></ChatPanelProvider>;
}

function ChatPanelView() {
  const controller = useChatPanel();
  const {
    activeProject, handleBrowseProject, handleSetupAction, setTerminalHistoryOpen, state,
    terminalHistoryOpen, terminalHistoryScope,
  } = controller;
  return (
    <>
    <section data-test-chat-panel="" class={stylex.attrs(chatUtilityStyles.panelShell, styles.panelContainer, state.experienceMode === "simple" ? styles.panelSimple : undefined, chatUtilityStyles.flex, chatUtilityStyles.hFull, chatUtilityStyles.wFull, chatUtilityStyles.minH0, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded2xl, chatUtilityStyles.p08rem).class}>
<ChatSetupDialog />
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
          <div data-test-empty-project="" {...stylex.attrs(styles.emptyProject)}>
            <div {...stylex.attrs(styles.emptyProjectContent)}>
              <h1 {...stylex.attrs(styles.emptyProjectHeading)}>
                Open a project to begin
              </h1>

                <div {...stylex.attrs(styles.emptyProjectActions)}>
                  <ActionButton
                    tooltip="Open project switcher"
                    variant="default"
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
                </div>
            </div>
          </div>
        }
      >
          <>
<ProjectChatLayout compact={state.experienceMode === "simple"} header={<ChatPanelHeader />} transcript={<ChatTranscriptSurface />} status={<ChatProjectSetupNotice />} composer={<ChatComposerSurface />}/>
<ChatExperimentDialog />
          </>
      </Show>
    </section>
    <TerminalHistoryDialog
      open={terminalHistoryOpen()}
      title="Thread Terminal History"
      scope={terminalHistoryScope()}
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


function formatResponseTime(timestampMs: number) {
  return formatShortTimestamp(timestampMs);
}

export { getFastModeDescription } from "./chat-panel/chat-panel-model";
