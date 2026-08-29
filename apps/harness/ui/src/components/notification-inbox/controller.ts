import { createMemo, createSignal } from "solid-js";
import {
  createRequestId,
  isTerminalAgentRunStatus,
  type ClientCommand,
  type NotificationInboxItem
} from "@hyperfocus/ai-core/protocol";
import { harnessStore, type HarnessViewState } from "../../harness-store";
import { activateProjectThread } from "../../project-thread-navigation";
import { openAssistantSource, openNotificationSource, openPreferencesSectionSource } from "../../source-navigation";
import type {
  AssistantQuestionBatchNotification,
  AssistantQuestionNotification,
  BrowserApprovalNotification,
  NotificationInboxController,
  PlanningQuestionBatchNotification,
  PlanningQuestionNotification
} from "./contracts";

export function activateProjectThreadFromInbox(
  state: HarnessViewState,
  projectId: string,
  threadId: string,
  sendCommand: (command: ClientCommand) => void
) {
  activateProjectThread(state, projectId, threadId, sendCommand);
}

export function createAssistantJobBootstrapCommandFromInbox(
  state: HarnessViewState,
  notification: AssistantQuestionNotification
): ClientCommand | undefined {
  const assistant = state.assistants.assistants.find((entry) => entry.id === notification.assistantId);
  const projectId = assistant?.projectId ?? state.workspace.activeProjectId;
  if (!projectId) return undefined;
  return {
    type: "assistant.jobs.bootstrap",
    requestId: createRequestId(),
    payload: { assistantId: notification.assistantId, projectId }
  };
}

export function openBackgroundRunNotificationFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "background-run-status" }>,
  sendCommand: (command: ClientCommand) => boolean = harnessStore.actions.sendCommand
) {
  return openNotificationSource(state, notification, sendCommand);
}

export function openAssistantQuestionNotificationFromInbox(
  state: HarnessViewState,
  notification: AssistantQuestionNotification | AssistantQuestionBatchNotification
) {
  openAssistantSource(state, notification.assistantId, "questions");
}

export function openCliUpdateNotificationFromInbox() {
  openPreferencesSectionSource("developer-advanced");
}

export function isCachedBrowserApprovalTerminal(
  state: HarnessViewState,
  notification: NotificationInboxItem
) {
  if (notification.kind !== "browser-approval") return false;
  const project = state.workspace.projects.find(({ id }) => id === notification.projectId);
  const transcript = project?.threadLiveTranscriptById[notification.threadId];
  const runs = [
    ...(transcript
      ? [transcript.activeRun, transcript.lastRun]
      : project?.activeThreadId === notification.threadId
        ? [project.activeRun, project.lastRun]
        : []),
    ...(project?.runSummaries.filter(({ threadId }) => threadId === notification.threadId) ?? [])
  ];
  const run = runs.find((candidate) => candidate?.id === notification.runId);
  return run ? isTerminalAgentRunStatus(run.status) : false;
}

interface ResponseActionsOptions {
  readonly state: HarnessViewState;
  readonly sendCommand: (command: ClientCommand) => boolean;
  readonly readDraft: (notificationId: string, questionId?: string) => string;
  readonly close: () => void;
}

function createNotificationResponseActions(options: ResponseActionsOptions) {
  function answerPlanningQuestion(notification: PlanningQuestionNotification, content: string) {
    if (!content.trim()) return;
    options.sendCommand({
      type: "planning.answer",
      requestId: createRequestId(),
      payload: {
        projectId: notification.projectId,
        threadId: notification.threadId,
        runId: notification.runId,
        questionId: notification.questionId,
        content: content.trim()
      }
    });
    options.close();
  }

  function answerPlanningQuestionBatch(notification: PlanningQuestionBatchNotification) {
    const answers = notification.questions.map((question) => ({
      questionId: question.questionId,
      content: options.readDraft(notification.id, question.questionId).trim()
    }));
    if (answers.some((answer) => !answer.content)) return;
    options.sendCommand({
      type: "planning.answer-batch",
      requestId: createRequestId(),
      payload: {
        projectId: notification.projectId,
        threadId: notification.threadId,
        runId: notification.runId,
        answers
      }
    });
    options.close();
  }

  function answerAssistantQuestion(notification: AssistantQuestionNotification, answerText?: string) {
    const content = (answerText ?? options.readDraft(notification.id)).trim();
    if (!content) return;
    options.sendCommand({
      type: "assistant.question.answer",
      requestId: createRequestId(),
      payload: { assistantId: notification.assistantId, questionId: notification.questionId, content }
    });
    options.close();
  }

  function bootstrapAssistantJobs(notification: AssistantQuestionNotification, accepted: boolean) {
    if (!accepted) {
      answerAssistantQuestion(notification, "Not now.");
      return;
    }
    const command = createAssistantJobBootstrapCommandFromInbox(options.state, notification);
    if (!command) return;
    options.sendCommand(command);
    options.close();
  }

  function answerAssistantQuestionBatch(notification: AssistantQuestionBatchNotification) {
    const answers = notification.questions.map((question) => ({
      questionId: question.questionId,
      content: options.readDraft(notification.id, question.questionId).trim()
    }));
    if (answers.some((answer) => !answer.content)) return;
    options.sendCommand({
      type: "assistant.question.answer-batch",
      requestId: createRequestId(),
      payload: { assistantId: notification.assistantId, answers }
    });
    options.close();
  }

  function resolveBrowserApproval(notification: BrowserApprovalNotification, approved: boolean) {
    if (isCachedBrowserApprovalTerminal(options.state, notification)) return;
    options.sendCommand({
      type: "browser.approval.resolve",
      requestId: createRequestId(),
      payload: {
        projectId: notification.projectId,
        threadId: notification.threadId,
        runId: notification.runId,
        sessionId: notification.sessionId,
        toolCallId: notification.toolCallId,
        approved
      }
    });
    options.close();
  }

  return {
    answerPlanningQuestion,
    answerPlanningQuestionBatch,
    answerAssistantQuestion,
    bootstrapAssistantJobs,
    answerAssistantQuestionBatch,
    resolveBrowserApproval
  };
}

function draftKey(notificationId: string, questionId?: string) {
  return questionId ? `${notificationId}:${questionId}` : notificationId;
}

export function createNotificationInboxController(): NotificationInboxController {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [open, setOpen] = createSignal(false);
  const [expandedId, setExpandedId] = createSignal<string>();
  const [draftById, setDraftById] = createSignal<Record<string, string>>({});
  const unreadCount = createMemo(() => state.notifications.unreadCount);
  const items = createMemo(() => state.notifications.items.slice(0, 24));
  const close = () => {
    setExpandedId(undefined);
    setOpen(false);
  };
  const readDraft = (notificationId: string, questionId?: string) =>
    draftById()[draftKey(notificationId, questionId)] ?? "";
  const writeDraft = (notificationId: string, value: string, questionId?: string) =>
    setDraftById((current) => ({ ...current, [draftKey(notificationId, questionId)]: value }));
  const responseActions = createNotificationResponseActions({ state, sendCommand, readDraft, close });

  function openItem(notification: NotificationInboxItem) {
    if (!notification.readAt) {
      sendCommand({
        type: "notification.mark-read",
        requestId: createRequestId(),
        payload: { notificationId: notification.id }
      });
    }
    if (notification.kind === "background-run-status") {
      openBackgroundRunNotificationFromInbox(state, notification, sendCommand);
      close();
      return;
    }
    if (notification.kind === "cli-update") {
      openCliUpdateNotificationFromInbox();
      sendCommand({
        type: "cli-updates.install",
        requestId: createRequestId(),
        payload: { agentId: notification.agentId }
      });
      close();
      return;
    }
    if (notification.kind === "assistant-question" || notification.kind === "assistant-question-batch") {
      openAssistantQuestionNotificationFromInbox(state, notification);
    } else {
      openNotificationSource(state, notification);
    }
    setExpandedId((current) => (current === notification.id ? undefined : notification.id));
  }

  return {
    open,
    expandedId,
    unreadCount,
    items,
    close,
    toggle: () => setOpen((value) => !value),
    markAllRead: () => sendCommand({ type: "notifications.mark-all-read", requestId: createRequestId() }),
    openItem,
    readDraft,
    writeDraft,
    canBootstrapAssistantJob: (notification) => {
      const assistant = state.assistants.assistants.find((entry) => entry.id === notification.assistantId);
      return Boolean(assistant?.projectId ?? state.workspace.activeProjectId);
    },
    isBrowserApprovalTerminal: (notification) => isCachedBrowserApprovalTerminal(state, notification),
    ...responseActions
  };
}
