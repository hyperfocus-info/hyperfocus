import { For, Match, Show, Switch } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Check, CircleX, SendHorizontal } from "lucide-solid";
import type { NotificationInboxItem } from "@hyperfocus/ai-core/protocol";
import { getAssistantQuestionDefaultChoices } from "../../assistant-question-defaults";
import { submitOnEnter } from "../../textarea-submit";
import { ActionButton } from "../action-button";
import { miscellaneousSurfaceStyles as styles } from "../miscellaneous-surfaces.styles";
import { Textarea } from "../primitives/textarea";
import {
  ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX,
  type AssistantQuestionBatchNotification,
  type AssistantQuestionNotification,
  type BrowserApprovalNotification,
  type NotificationInboxController,
  type PlanningQuestionBatchNotification,
  type PlanningQuestionNotification
} from "./contracts";

function PlanningQuestionForm(props: {
  notification: PlanningQuestionNotification;
  controller: NotificationInboxController;
}) {
  return (
    <div {...stylex.attrs(styles.gridCompact)}>
      <For each={props.notification.choices}>
        {(choice) => (
          <ActionButton
            tooltip={choice.description}
            icon={choice.recommended ? <Check {...stylex.attrs(styles.iconSm)} /> : undefined}
            variant={choice.recommended ? "default" : "secondary"}
            class={stylex.attrs(styles.alignStart).class}
            onClick={() => props.controller.answerPlanningQuestion(props.notification, choice.answerText)}
          >
            {choice.label}
          </ActionButton>
        )}
      </For>
      <Textarea
        rows="3"
        value={props.controller.readDraft(props.notification.id)}
        placeholder={props.notification.placeholder ?? "Type answer"}
        onKeyDown={submitOnEnter(() =>
          props.controller.answerPlanningQuestion(
            props.notification,
            props.controller.readDraft(props.notification.id).trim()
          ))}
        onInput={(event) => props.controller.writeDraft(props.notification.id, event.currentTarget.value)}
      />
      <ActionButton
        tooltip="Send custom planning answer"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() =>
          props.controller.answerPlanningQuestion(
            props.notification,
            props.controller.readDraft(props.notification.id).trim()
          )}
      >
        Send answer
      </ActionButton>
    </div>
  );
}

function PlanningQuestionBatchForm(props: {
  notification: PlanningQuestionBatchNotification;
  controller: NotificationInboxController;
}) {
  return (
    <div {...stylex.attrs(styles.gridRelaxed)}>
      <For each={props.notification.questions}>
        {(question) => (
          <div {...stylex.attrs(styles.questionCard)}>
            <div {...stylex.attrs(styles.questionPrompt)}>{question.prompt}</div>
            <Textarea
              rows="3"
              value={props.controller.readDraft(props.notification.id, question.questionId)}
              placeholder={question.placeholder ?? "Answer this question"}
              onInput={(event) =>
                props.controller.writeDraft(props.notification.id, event.currentTarget.value, question.questionId)}
            />
          </div>
        )}
      </For>
      <ActionButton
        tooltip="Send all planning answers"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() => props.controller.answerPlanningQuestionBatch(props.notification)}
      >
        Send all answers
      </ActionButton>
    </div>
  );
}

function AssistantQuestionForm(props: {
  notification: AssistantQuestionNotification;
  controller: NotificationInboxController;
}) {
  const isBootstrap = () => props.notification.questionId.startsWith(ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX);
  return (
    <div {...stylex.attrs(styles.columnRelaxed)}>
      <Show
        when={isBootstrap()}
        fallback={
          <div {...stylex.attrs(styles.gridCompact)}>
            <For each={getAssistantQuestionDefaultChoices()}>
              {(choice) => (
                <ActionButton
                  tooltip={choice.description}
                  icon={choice.recommended ? <Check {...stylex.attrs(styles.iconSm)} /> : undefined}
                  variant={choice.recommended ? "default" : "secondary"}
                  class={stylex.attrs(styles.alignStart).class}
                  onClick={() => props.controller.answerAssistantQuestion(props.notification, choice.answerText)}
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
            disabled={!props.controller.canBootstrapAssistantJob(props.notification)}
            disabledReason="Open a project first"
            onClick={() => props.controller.bootstrapAssistantJobs(props.notification, true)}
          >
            Yes, create jobs
          </ActionButton>
          <ActionButton
            tooltip="Do not create default assistant jobs now"
            icon={<CircleX {...stylex.attrs(styles.iconSm)} />}
            variant="secondary"
            class={stylex.attrs(styles.alignStart).class}
            onClick={() => props.controller.bootstrapAssistantJobs(props.notification, false)}
          >
            Not now
          </ActionButton>
        </div>
      </Show>
      <Textarea
        rows="3"
        value={props.controller.readDraft(props.notification.id)}
        placeholder="Answer this question"
        onKeyDown={submitOnEnter(() => props.controller.answerAssistantQuestion(props.notification))}
        onInput={(event) => props.controller.writeDraft(props.notification.id, event.currentTarget.value)}
      />
      <ActionButton
        tooltip="Send answer to assistant"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() => props.controller.answerAssistantQuestion(props.notification)}
      >
        Send answer
      </ActionButton>
    </div>
  );
}

function AssistantQuestionBatchForm(props: {
  notification: AssistantQuestionBatchNotification;
  controller: NotificationInboxController;
}) {
  return (
    <div {...stylex.attrs(styles.gridRelaxed)}>
      <For each={props.notification.questions}>
        {(question) => (
          <div {...stylex.attrs(styles.questionCard)}>
            <div {...stylex.attrs(styles.questionPrompt)}>{question.prompt}</div>
            <Textarea
              rows="3"
              value={props.controller.readDraft(props.notification.id, question.questionId)}
              placeholder="Answer this question"
              onInput={(event) =>
                props.controller.writeDraft(props.notification.id, event.currentTarget.value, question.questionId)}
            />
          </div>
        )}
      </For>
      <ActionButton
        tooltip="Send all assistant answers"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() => props.controller.answerAssistantQuestionBatch(props.notification)}
      >
        Send all answers
      </ActionButton>
    </div>
  );
}

function BrowserApprovalForm(props: {
  notification: BrowserApprovalNotification;
  controller: NotificationInboxController;
}) {
  return (
    <Show
      when={!props.controller.isBrowserApprovalTerminal(props.notification)}
      fallback={<div {...stylex.attrs(styles.notificationMeta)}>Approval unavailable because this run has ended.</div>}
    >
      <div {...stylex.attrs(styles.wrapActions)}>
        <ActionButton
          tooltip="Approve this browser action"
          icon={<Check {...stylex.attrs(styles.iconMd)} />}
          onClick={() => props.controller.resolveBrowserApproval(props.notification, true)}
        >
          Approve
        </ActionButton>
        <ActionButton
          tooltip="Reject this browser action"
          icon={<CircleX {...stylex.attrs(styles.iconMd)} />}
          variant="secondary"
          onClick={() => props.controller.resolveBrowserApproval(props.notification, false)}
        >
          Reject
        </ActionButton>
      </div>
    </Show>
  );
}

export function NotificationResponse(props: {
  notification: NotificationInboxItem;
  controller: NotificationInboxController;
}) {
  return (
    <Switch>
      <Match when={props.notification.kind === "planning-question" ? props.notification : undefined}>
        {(notification) => <PlanningQuestionForm notification={notification()} controller={props.controller} />}
      </Match>
      <Match when={props.notification.kind === "planning-question-batch" ? props.notification : undefined}>
        {(notification) => <PlanningQuestionBatchForm notification={notification()} controller={props.controller} />}
      </Match>
      <Match when={props.notification.kind === "assistant-question" ? props.notification : undefined}>
        {(notification) => <AssistantQuestionForm notification={notification()} controller={props.controller} />}
      </Match>
      <Match when={props.notification.kind === "assistant-question-batch" ? props.notification : undefined}>
        {(notification) => <AssistantQuestionBatchForm notification={notification()} controller={props.controller} />}
      </Match>
      <Match when={props.notification.kind === "browser-approval" ? props.notification : undefined}>
        {(notification) => <BrowserApprovalForm notification={notification()} controller={props.controller} />}
      </Match>
    </Switch>
  );
}
