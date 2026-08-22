import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  Bell,
  Bot,
  Check,
  CheckCheck,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Download,
  SendHorizontal
} from "lucide-solid";
import { createRequestId, type ClientCommand, type NotificationInboxItem } from "../../../shared/protocol";
import { getAssistantQuestionDefaultChoices } from "../assistant-question-defaults";
import { harnessStore, type HarnessViewState } from "../harness-store";
import { formatApprovalInvocationDescription } from "../lib/tool-activity-format";
import { activateProjectThread } from "../project-thread-navigation";
import { openAssistantSource, openNotificationSource, openPreferencesSectionSource } from "../source-navigation";
import { submitOnEnter } from "../textarea-submit";
import { ActionButton } from "./action-button";
import { Popover } from "./primitives/popover";
import { Textarea } from "./primitives/textarea";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";

const ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX = "assistant-job-bootstrap:";

/**
 * Pure helper that activates a (project, thread) pair from the notification
 * inbox. Exported for unit testing because the inbox's popover is not
 * exercisable via fireEvent.click in the current Bun/happy-dom/solid setup.
 *
 * Always issues both commands when the client's active project differs, so
 * the server has an authoritative (projectId, threadId) pair regardless of a
 * stale local `activeThreadId` cache. `thread.activate` is idempotent on the
 * server and carries its own projectId, so ordering against an in-flight
 * `project.activate` is safe over the ordered websocket.
 */
export function activateProjectThreadFromInbox(
  state: HarnessViewState,
  projectId: string,
  threadId: string,
  sendCommand: (command: ClientCommand) => void
) {
  activateProjectThread(state, projectId, threadId, sendCommand);
}

export function openAssistantJobNotificationFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "background-run-status" }>
) {
  const run = state.backgroundJobs.runs.find((entry) => entry.id === notification.backgroundRunId);
  const job = state.backgroundJobs.jobs.find((entry) => entry.id === notification.jobId);
  const assistantId = run?.assistantId ?? job?.assistantId;
  if (!assistantId) {
    return false;
  }

  openAssistantSource(state, assistantId, "log");
  return true;
}

export function createAssistantJobBootstrapCommandFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "assistant-question" }>
): ClientCommand | undefined {
  const assistant = state.assistants.assistants.find((entry) => entry.id === notification.assistantId);
  const projectId = assistant?.projectId ?? state.workspace.activeProjectId;
  if (!projectId) {
    return undefined;
  }
  return {
    type: "assistant.jobs.bootstrap",
    requestId: createRequestId(),
    payload: {
      assistantId: notification.assistantId,
      projectId
    }
  };
}

export function openBackgroundRunNotificationFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "background-run-status" }>
) {
  openNotificationSource(state, notification);
}

export function openAssistantQuestionNotificationFromInbox(
  state: HarnessViewState,
  notification: Extract<NotificationInboxItem, { kind: "assistant-question" | "assistant-question-batch" }>
) {
  openAssistantSource(state, notification.assistantId, "questions");
}

export function openCliUpdateNotificationFromInbox() {
  openPreferencesSectionSource("developer-advanced");
}

export function NotificationInbox() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [open, setOpen] = createSignal(false);
  const [expandedId, setExpandedId] = createSignal<string>();
  const [draftById, setDraftById] = createSignal<Record<string, string>>({});
  const unreadCount = createMemo(() => state.notifications.unreadCount);
  const items = createMemo(() => state.notifications.items.slice(0, 24));

  function markRead(notificationId: string) {
    sendCommand({
      type: "notification.mark-read",
      requestId: createRequestId(),
      payload: {
        notificationId
      }
    });
  }

  function openItem(notification: NotificationInboxItem) {
    if (!notification.readAt) {
      markRead(notification.id);
    }

    switch (notification.kind) {
      case "background-run-status":
        openBackgroundRunNotificationFromInbox(state, notification);
        setOpen(false);
        return;
      case "cli-update":
        openCliUpdateNotificationFromInbox();
        sendCommand({
          type: "cli-updates.install",
          requestId: createRequestId(),
          payload: {
            agentId: notification.agentId
          }
        });
        setOpen(false);
        return;
      case "planning-question":
        openNotificationSource(state, notification);
        break;
      case "planning-question-batch":
        openNotificationSource(state, notification);
        break;
      case "browser-approval":
        openNotificationSource(state, notification);
        break;
      case "assistant-question":
        openAssistantQuestionNotificationFromInbox(state, notification);
        break;
      case "assistant-question-batch":
        openAssistantQuestionNotificationFromInbox(state, notification);
        break;
    }

    setExpandedId((current) => (current === notification.id ? undefined : notification.id));
  }

  function activateProjectThread(projectId: string, threadId: string) {
    activateProjectThreadFromInbox(state, projectId, threadId, sendCommand);
  }

  function handlePlanningChoice(notification: Extract<NotificationInboxItem, { kind: "planning-question" }>, content: string) {
    if (!content.trim()) {
      return;
    }

    sendCommand({
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
    setExpandedId(undefined);
    setOpen(false);
  }

  function handlePlanningBatch(notification: Extract<NotificationInboxItem, { kind: "planning-question-batch" }>) {
    const answers = notification.questions.map((question) => ({
      questionId: question.questionId,
      content: (draftById()[batchDraftKey(notification.id, question.questionId)] ?? "").trim()
    }));
    if (answers.some((answer) => !answer.content)) {
      return;
    }

    sendCommand({
      type: "planning.answer-batch",
      requestId: createRequestId(),
      payload: {
        projectId: notification.projectId,
        threadId: notification.threadId,
        runId: notification.runId,
        answers
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleAssistantAnswer(notification: Extract<NotificationInboxItem, { kind: "assistant-question" }>, answerText?: string) {
    const content = (answerText ?? draftById()[notification.id])?.trim();
    if (!content) {
      return;
    }

    sendCommand({
      type: "assistant.question.answer",
      requestId: createRequestId(),
      payload: {
        assistantId: notification.assistantId,
        questionId: notification.questionId,
        content
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleAssistantJobBootstrap(notification: Extract<NotificationInboxItem, { kind: "assistant-question" }>, accepted: boolean) {
    if (!accepted) {
      handleAssistantAnswer(notification, "Not now.");
      return;
    }
    const command = createAssistantJobBootstrapCommandFromInbox(harnessStore.state, notification);
    if (!command) {
      return;
    }
    sendCommand(command);
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleAssistantBatch(notification: Extract<NotificationInboxItem, { kind: "assistant-question-batch" }>) {
    const answers = notification.questions.map((question) => ({
      questionId: question.questionId,
      content: (draftById()[batchDraftKey(notification.id, question.questionId)] ?? "").trim()
    }));
    if (answers.some((answer) => !answer.content)) {
      return;
    }

    sendCommand({
      type: "assistant.question.answer-batch",
      requestId: createRequestId(),
      payload: {
        assistantId: notification.assistantId,
        answers
      }
    });
    setExpandedId(undefined);
    setOpen(false);
  }

  function handleBrowserApproval(
    notification: Extract<NotificationInboxItem, { kind: "browser-approval" }>,
    approved: boolean
  ) {
    sendCommand({
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
    setExpandedId(undefined);
    setOpen(false);
  }

  return (
    <Popover
      open={open()}
      onClose={() => {
        setOpen(false);
        setExpandedId(undefined);
      }}
      contentClass={stylex.attrs(styles.popoverContent).class}
      content={
        <div {...stylex.attrs(styles.inboxShell)}>
          <div {...stylex.attrs(styles.inboxHeader)}>
            <div {...stylex.attrs(styles.notificationEyebrow)}>Notifications</div>
            <ActionButton
              tooltip="Mark all passive notifications as read"
              icon={<CheckCheck {...stylex.attrs(styles.iconMd)} />}
              size="icon"
              variant="ghost"
              ariaLabel="Mark all passive notifications as read"
              onClick={() =>
                sendCommand({
                  type: "notifications.mark-all-read",
                  requestId: createRequestId()
                })
              }
            />
          </div>
          <div {...stylex.attrs(styles.inboxList)}>
            <Show
              when={items().length > 0}
              fallback={<div {...stylex.attrs(styles.inboxEmpty)}>Inbox empty.</div>}
            >
              <For each={items()}>
                {(notification) => (
                  <div
                    {...stylex.attrs(styles.notificationCard)}
                    onClick={(event) => {
                      if (notification.kind === "background-run-status" && event.target === event.currentTarget) {
                        openItem(notification);
                      }
                    }}
                  >
                    <button
                      type="button"
                      {...stylex.attrs(styles.notificationButton)}
                      onClick={() => openItem(notification)}
                    >
                      <div {...stylex.attrs(styles.notificationCopy)}>
                        <div {...stylex.attrs(styles.notificationMeta)}>
                          <NotificationKindIcon notification={notification} />
                          <span>{notification.kind.replaceAll("-", " ")}</span>
                          <Show when={!notification.readAt}>
                            <span {...stylex.attrs(styles.unreadPill)}>Unread</span>
                          </Show>
                        </div>
                        <div {...stylex.attrs(styles.notificationTitle)}>{notificationTitle(notification)}</div>
                        <Show when={notificationSummary(notification)}>
                          {(summary) => <div {...stylex.attrs(styles.notificationSummary)}>{summary()}</div>}
                        </Show>
                      </div>
                    </button>
                    <Show when={expandedId() === notification.id && notification.interactive}>
                      <div {...stylex.attrs(styles.notificationExpansion)}>
                        <Switch>
                          <Match when={notification.kind === "planning-question"}>
                            <div {...stylex.attrs(styles.gridCompact)}>
                              <For each={(notification as Extract<NotificationInboxItem, { kind: "planning-question" }>).choices}>
                                {(choice) => (
                                  <ActionButton
                                    tooltip={choice.description}
                                    icon={choice.recommended ? <Check {...stylex.attrs(styles.iconSm)} /> : undefined}
                                    variant={choice.recommended ? "default" : "secondary"}
                                    class={stylex.attrs(styles.alignStart).class}
                                    onClick={() =>
                                      handlePlanningChoice(
                                        notification as Extract<NotificationInboxItem, { kind: "planning-question" }>,
                                        choice.answerText
                                      )
                                    }
                                  >
                                    {choice.label}
                                  </ActionButton>
                                )}
                              </For>
                              <Textarea
                                rows="3"
                                value={draftById()[notification.id] ?? ""}
                                placeholder={(notification as Extract<NotificationInboxItem, { kind: "planning-question" }>).placeholder ?? "Type answer"}
                                onKeyDown={submitOnEnter(() =>
                                  handlePlanningChoice(
                                    notification as Extract<NotificationInboxItem, { kind: "planning-question" }>,
                                    draftById()[notification.id]?.trim() ?? ""
                                  )
                                )}
                                onInput={(event) =>
                                  setDraftById((current) => ({ ...current, [notification.id]: event.currentTarget.value }))
                                }
                              />
                              <ActionButton
                                tooltip="Send custom planning answer"
                                icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
                                onClick={() =>
                                  handlePlanningChoice(
                                    notification as Extract<NotificationInboxItem, { kind: "planning-question" }>,
                                    draftById()[notification.id]!.trim()
                                  )
                                }
                              >
                                Send answer
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "planning-question-batch"}>
                            <div {...stylex.attrs(styles.gridRelaxed)}>
                              <For each={(notification as Extract<NotificationInboxItem, { kind: "planning-question-batch" }>).questions}>
                                {(question) => (
                                  <div {...stylex.attrs(styles.questionCard)}>
                                    <div {...stylex.attrs(styles.questionPrompt)}>{question.prompt}</div>
                                    <Textarea
                                      rows="3"
                                      value={draftById()[batchDraftKey(notification.id, question.questionId)] ?? ""}
                                      placeholder={question.placeholder ?? "Answer this question"}
                                      onInput={(event) =>
                                        setDraftById((current) => ({
                                          ...current,
                                          [batchDraftKey(notification.id, question.questionId)]: event.currentTarget.value
                                        }))
                                      }
                                    />
                                  </div>
                                )}
                              </For>
                              <ActionButton
                                tooltip="Send all planning answers"
                                icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
                                onClick={() =>
                                  handlePlanningBatch(notification as Extract<NotificationInboxItem, { kind: "planning-question-batch" }>)
                                }
                              >
                                Send all answers
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "assistant-question"}>
                            <div {...stylex.attrs(styles.columnRelaxed)}>
                              <Show
                                when={(notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>).questionId.startsWith(ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX)}
                                fallback={
                                  <div {...stylex.attrs(styles.gridCompact)}>
                                    <For each={getAssistantQuestionDefaultChoices()}>
                                      {(choice) => (
                                        <ActionButton
                                          tooltip={choice.description}
                                          icon={choice.recommended ? <Check {...stylex.attrs(styles.iconSm)} /> : undefined}
                                          variant={choice.recommended ? "default" : "secondary"}
                                          class={stylex.attrs(styles.alignStart).class}
                                          onClick={() =>
                                            handleAssistantAnswer(
                                              notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>,
                                              choice.answerText
                                            )
                                          }
                                        >
                                          {choice.label}
                                        </ActionButton>
                                      )}
                                    </For>
                                  </div>
                                }
                              >
                                <div {...stylex.attrs(styles.gridCompact)}>
                                  <ActionButton
                                    tooltip="Create research, todo maintenance, and implementation jobs"
                                    icon={<Check {...stylex.attrs(styles.iconSm)} />}
                                    class={stylex.attrs(styles.alignStart).class}
                                    disabled={!harnessStore.state.assistants.assistants.find((entry) => entry.id === (notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>).assistantId)?.projectId && !harnessStore.state.workspace.activeProjectId}
                                    disabledReason="Open a project first"
                                    onClick={() => handleAssistantJobBootstrap(notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>, true)}
                                  >
                                    Yes, create jobs
                                  </ActionButton>
                                  <ActionButton
                                    tooltip="Do not create default assistant jobs now"
                                    icon={<CircleX {...stylex.attrs(styles.iconSm)} />}
                                    variant="secondary"
                                    class={stylex.attrs(styles.alignStart).class}
                                    onClick={() => handleAssistantJobBootstrap(notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>, false)}
                                  >
                                    Not now
                                  </ActionButton>
                                </div>
                              </Show>
                              <Textarea
                                rows="3"
                                value={draftById()[notification.id] ?? ""}
                                placeholder="Answer this question"
                                onKeyDown={submitOnEnter(() =>
                                  handleAssistantAnswer(
                                    notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>
                                  )
                                )}
                                onInput={(event) =>
                                  setDraftById((current) => ({ ...current, [notification.id]: event.currentTarget.value }))
                                }
                              />
                              <ActionButton
                                tooltip="Send answer to assistant"
                                icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
                                onClick={() =>
                                  handleAssistantAnswer(
                                    notification as Extract<NotificationInboxItem, { kind: "assistant-question" }>
                                  )
                                }
                              >
                                Send answer
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "assistant-question-batch"}>
                            <div {...stylex.attrs(styles.gridRelaxed)}>
                              <For each={(notification as Extract<NotificationInboxItem, { kind: "assistant-question-batch" }>).questions}>
                                {(question) => (
                                  <div {...stylex.attrs(styles.questionCard)}>
                                    <div {...stylex.attrs(styles.questionPrompt)}>{question.prompt}</div>
                                    <Textarea
                                      rows="3"
                                      value={draftById()[batchDraftKey(notification.id, question.questionId)] ?? ""}
                                      placeholder="Answer this question"
                                      onInput={(event) =>
                                        setDraftById((current) => ({
                                          ...current,
                                          [batchDraftKey(notification.id, question.questionId)]: event.currentTarget.value
                                        }))
                                      }
                                    />
                                  </div>
                                )}
                              </For>
                              <ActionButton
                                tooltip="Send all assistant answers"
                                icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
                                onClick={() =>
                                  handleAssistantBatch(notification as Extract<NotificationInboxItem, { kind: "assistant-question-batch" }>)
                                }
                              >
                                Send all answers
                              </ActionButton>
                            </div>
                          </Match>
                          <Match when={notification.kind === "browser-approval"}>
                            <div {...stylex.attrs(styles.wrapActions)}>
                              <ActionButton
                                tooltip="Approve this browser action"
                                icon={<Check {...stylex.attrs(styles.iconMd)} />}
                                onClick={() =>
                                  handleBrowserApproval(
                                    notification as Extract<NotificationInboxItem, { kind: "browser-approval" }>,
                                    true
                                  )
                                }
                              >
                                Approve
                              </ActionButton>
                              <ActionButton
                                tooltip="Reject this browser action"
                                icon={<CircleX {...stylex.attrs(styles.iconMd)} />}
                                variant="secondary"
                                onClick={() =>
                                  handleBrowserApproval(
                                    notification as Extract<NotificationInboxItem, { kind: "browser-approval" }>,
                                    false
                                  )
                                }
                              >
                                Reject
                              </ActionButton>
                            </div>
                          </Match>
                        </Switch>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      }
    >
      <ActionButton
        tooltip="Open notification inbox"
        icon={<Bell {...stylex.attrs(styles.iconMd)} />}
        variant="secondary"
        size="icon"
        ariaLabel="Open notification inbox"
        onClick={() => setOpen((value) => !value)}
      />
      <Show when={unreadCount() > 0}>
        <div {...stylex.attrs(styles.unreadCount)}>
          {unreadCount() > 99 ? "99+" : unreadCount()}
        </div>
      </Show>
    </Popover>
  );
}

function notificationTitle(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status":
      return notification.title;
    case "planning-question":
      return notification.prompt;
    case "planning-question-batch":
      return `${notification.questions.length} planning questions`;
    case "assistant-question":
      return notification.prompt;
    case "assistant-question-batch":
      return `${notification.questions.length} assistant questions`;
    case "browser-approval":
      return notification.label;
    case "cli-update":
      return `${notification.label} update available`;
  }
}

function notificationSummary(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status":
      return notification.summary;
    case "planning-question":
      return notification.placeholder;
    case "planning-question-batch":
      return notification.questions.map((question) => question.prompt).join(" ");
    case "assistant-question":
      return notification.answerText;
    case "assistant-question-batch":
      return notification.questions.map((question) => question.prompt).join(" ");
    case "browser-approval":
      return formatApprovalInvocationDescription(notification.label, notification.inputSummary);
    case "cli-update":
      return `${notification.currentVersion} -> ${notification.latestVersion}. Click to update.`;
  }
}

function batchDraftKey(notificationId: string, questionId: string) {
  return `${notificationId}:${questionId}`;
}

function NotificationKindIcon(props: { notification: NotificationInboxItem }) {
  return (
    <Switch>
      <Match when={props.notification.kind === "assistant-question" || props.notification.kind === "assistant-question-batch"}>
        <Bot {...stylex.attrs(styles.iconSm)} />
      </Match>
      <Match when={props.notification.kind === "background-run-status"}>
        <LoaderCircle {...stylex.attrs(styles.iconSm)} />
      </Match>
      <Match when={props.notification.kind === "cli-update"}>
        <Download {...stylex.attrs(styles.iconSm)} />
      </Match>
      <Match when={props.notification.kind === "browser-approval"}>
        <CircleAlert {...stylex.attrs(styles.iconSm)} />
      </Match>
      <Match when={props.notification.kind === "planning-question" || props.notification.kind === "planning-question-batch"}>
        <SendHorizontal {...stylex.attrs(styles.iconSm)} />
      </Match>
    </Switch>
  );
}
