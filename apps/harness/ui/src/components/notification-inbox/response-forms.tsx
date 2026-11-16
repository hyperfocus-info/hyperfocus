import type { NotificationInboxItem } from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { Check,CircleX,SendHorizontal } from "lucide-solid";
import { For,Match,Show,Switch } from "solid-js";
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
type PlanningQuestionBatchNotification,
type PlanningQuestionNotification
} from "./contracts";
import { useNotificationInbox } from "./panel-context";

function PlanningQuestionForm(props: { notification: PlanningQuestionNotification; }) {
  const controller = useNotificationInbox();
  return (
    <div {...stylex.attrs(styles.gridCompact)}>
      <For each={props.notification.choices}>
        {(choice) => (
          <ActionButton
            tooltip={choice.description}
            icon={choice.recommended ? <Check {...stylex.attrs(styles.iconSm)} /> : undefined}
            variant={choice.recommended ? "default" : "secondary"}
            class={stylex.attrs(styles.alignStart).class}
            onClick={() => controller.answerPlanningQuestion(props.notification, choice.answerText)}
          >
            {choice.label}
          </ActionButton>
        )}
      </For>
      <Textarea
        rows="3"
        value={controller.readDraft(props.notification.id)}
        aria-label="Custom planning answer"
        placeholder={props.notification.placeholder ?? "Type answer"}
        onKeyDown={submitOnEnter(() =>
          controller.answerPlanningQuestion(
            props.notification,
            controller.readDraft(props.notification.id).trim()
          ))}
        onInput={(event) => controller.writeDraft(props.notification.id, event.currentTarget.value)}
      />
      <ActionButton
        tooltip="Send custom planning answer"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() =>
          controller.answerPlanningQuestion(
            props.notification,
            controller.readDraft(props.notification.id).trim()
          )}
      >
        Send answer
      </ActionButton>
    </div>
  );
}

function PlanningQuestionBatchForm(props: { notification: PlanningQuestionBatchNotification; }) {
  const controller = useNotificationInbox();
  return (
    <div {...stylex.attrs(styles.gridRelaxed)}>
      <For each={props.notification.questions}>
        {(question) => (
          <div {...stylex.attrs(styles.questionCard)}>
            <div {...stylex.attrs(styles.questionPrompt)}>{question.prompt}</div>
            <Textarea
              rows="3"
              value={controller.readDraft(props.notification.id, question.questionId)}
              aria-label={question.prompt}
              placeholder={question.placeholder ?? "Answer this question"}
              onInput={(event) =>
                controller.writeDraft(props.notification.id, event.currentTarget.value, question.questionId)}
            />
          </div>
        )}
      </For>
      <ActionButton
        tooltip="Send all planning answers"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() => controller.answerPlanningQuestionBatch(props.notification)}
      >
        Send all answers
      </ActionButton>
    </div>
  );
}

function AssistantQuestionForm(props: { notification: AssistantQuestionNotification; }) {
  const controller = useNotificationInbox();
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
                  onClick={() => controller.answerAssistantQuestion(props.notification, choice.answerText)}
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
            disabled={!controller.canBootstrapAssistantJob(props.notification)}
            disabledReason="Open a project first"
            onClick={() => controller.bootstrapAssistantJobs(props.notification, true)}
          >
            Yes, create jobs
          </ActionButton>
          <ActionButton
            tooltip="Do not create default assistant jobs now"
            icon={<CircleX {...stylex.attrs(styles.iconSm)} />}
            variant="secondary"
            class={stylex.attrs(styles.alignStart).class}
            onClick={() => controller.bootstrapAssistantJobs(props.notification, false)}
          >
            Not now
          </ActionButton>
        </div>
      </Show>
      <Textarea
        rows="3"
        value={controller.readDraft(props.notification.id)}
        aria-label="Answer to assistant"
        placeholder="Answer this question"
        onKeyDown={submitOnEnter(() => controller.answerAssistantQuestion(props.notification))}
        onInput={(event) => controller.writeDraft(props.notification.id, event.currentTarget.value)}
      />
      <ActionButton
        tooltip="Send answer to assistant"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() => controller.answerAssistantQuestion(props.notification)}
      >
        Send answer
      </ActionButton>
    </div>
  );
}

function AssistantQuestionBatchForm(props: { notification: AssistantQuestionBatchNotification; }) {
  const controller = useNotificationInbox();
  return (
    <div {...stylex.attrs(styles.gridRelaxed)}>
      <For each={props.notification.questions}>
        {(question) => (
          <div {...stylex.attrs(styles.questionCard)}>
            <div {...stylex.attrs(styles.questionPrompt)}>{question.prompt}</div>
            <Textarea
              rows="3"
              value={controller.readDraft(props.notification.id, question.questionId)}
              aria-label={question.prompt}
              placeholder="Answer this question"
              onInput={(event) =>
                controller.writeDraft(props.notification.id, event.currentTarget.value, question.questionId)}
            />
          </div>
        )}
      </For>
      <ActionButton
        tooltip="Send all assistant answers"
        icon={<SendHorizontal {...stylex.attrs(styles.iconMd)} />}
        onClick={() => controller.answerAssistantQuestionBatch(props.notification)}
      >
        Send all answers
      </ActionButton>
    </div>
  );
}

function BrowserApprovalForm(props: { notification: BrowserApprovalNotification; }) {
  const controller = useNotificationInbox();
  return (
    <Show
      when={!controller.isBrowserApprovalTerminal(props.notification)}
      fallback={<div {...stylex.attrs(styles.notificationMeta)}>Approval unavailable because this run has ended.</div>}
    >
      <div {...stylex.attrs(styles.wrapActions)}>
        <ActionButton
          tooltip="Approve this browser action"
          icon={<Check {...stylex.attrs(styles.iconMd)} />}
          onClick={() => controller.resolveBrowserApproval(props.notification, true)}
        >
          Approve
        </ActionButton>
        <ActionButton
          tooltip="Reject this browser action"
          icon={<CircleX {...stylex.attrs(styles.iconMd)} />}
          variant="secondary"
          onClick={() => controller.resolveBrowserApproval(props.notification, false)}
        >
          Reject
        </ActionButton>
      </div>
    </Show>
  );
}

export function NotificationResponse(props: { notification: NotificationInboxItem; }) {
  return (
    <Switch>
      <Match when={props.notification.kind === "planning-question" ? props.notification : undefined}>
        {(notification) => <PlanningQuestionForm notification={notification()} />}
      </Match>
      <Match when={props.notification.kind === "planning-question-batch" ? props.notification : undefined}>
        {(notification) => <PlanningQuestionBatchForm notification={notification()} />}
      </Match>
      <Match when={props.notification.kind === "assistant-question" ? props.notification : undefined}>
        {(notification) => <AssistantQuestionForm notification={notification()} />}
      </Match>
      <Match when={props.notification.kind === "assistant-question-batch" ? props.notification : undefined}>
        {(notification) => <AssistantQuestionBatchForm notification={notification()} />}
      </Match>
      <Match when={props.notification.kind === "browser-approval" ? props.notification : undefined}>
        {(notification) => <BrowserApprovalForm notification={notification()} />}
      </Match>
    </Switch>
  );
}
