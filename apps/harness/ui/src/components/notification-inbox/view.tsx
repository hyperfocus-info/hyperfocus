import type { NotificationInboxItem } from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { Bell,Bot,CheckCheck,CircleAlert,Download,LoaderCircle,SendHorizontal } from "lucide-solid";
import { For,Match,Show,Switch } from "solid-js";
import { formatApprovalInvocationDescription } from "../../lib/tool-activity-format";
import { ActionButton } from "../action-button";
import { miscellaneousSurfaceStyles as styles } from "../miscellaneous-surfaces.styles";
import { Popover } from "../primitives/popover";
import { requiresLauncherUpdate } from "./controller";
import { useNotificationInbox } from "./panel-context";
import { NotificationResponse } from "./response-forms";

function notificationTitle(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status": return notification.title;
    case "planning-question": return notification.prompt;
    case "planning-question-batch": return `${notification.questions.length} planning questions`;
    case "assistant-question": return notification.prompt;
    case "assistant-question-batch": return `${notification.questions.length} assistant questions`;
    case "browser-approval": return notification.label;
    case "cli-update": return `${notification.label} update available`;
  }
}

function notificationLabel(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "planning-question":
    case "planning-question-batch": return "Planning question";
    case "assistant-question":
    case "assistant-question-batch": return "Assistant question";
    case "browser-approval": return "Approval needed";
    case "cli-update": return "Runtime update";
    case "background-run-status": return notification.severity === "error" ? "Run failed" : notification.severity === "warning" ? "Run warning" : "Run update";
  }
}

function notificationSummary(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status": return notification.summary;
    case "planning-question": return notification.placeholder;
    case "planning-question-batch": return notification.questions.map((question) => question.prompt).join(" ");
    case "assistant-question": return notification.answerText;
    case "assistant-question-batch": return notification.questions.map((question) => question.prompt).join(" ");
    case "browser-approval":
      return formatApprovalInvocationDescription(notification.label, notification.inputSummary);
    case "cli-update": return `${notification.currentVersion} -> ${notification.latestVersion}. ${requiresLauncherUpdate(notification)
      ? "Download a new Harness release and restart with its launcher to update this bundled runtime."
      : "Click to update."}`;
  }
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

function NotificationCard(props: { notification: NotificationInboxItem; }) {
  const controller = useNotificationInbox();
  return (
    <div
      {...stylex.attrs(styles.notificationCard)}
      onClick={(event) => {
        if (props.notification.kind === "background-run-status" && event.target === event.currentTarget) {
          controller.openItem(props.notification);
        }
      }}
    >
      <button
        type="button"
        {...stylex.attrs(styles.notificationButton)}
        aria-expanded={props.notification.interactive ? controller.expandedId() === props.notification.id : undefined}
        aria-controls={props.notification.interactive && controller.expandedId() === props.notification.id ? `notification-response-${props.notification.id}` : undefined}
        onClick={() => controller.openItem(props.notification)}
      >
        <div {...stylex.attrs(styles.notificationCopy)}>
          <div {...stylex.attrs(styles.notificationMeta)}>
            <NotificationKindIcon notification={props.notification} />
            <span>{notificationLabel(props.notification)}</span>
            <Show when={!props.notification.readAt}>
              <span {...stylex.attrs(styles.unreadPill)}>Unread</span>
            </Show>
          </div>
          <div {...stylex.attrs(styles.notificationTitle)}>{notificationTitle(props.notification)}</div>
          <Show when={notificationSummary(props.notification)}>
            {(summary) => <div {...stylex.attrs(styles.notificationSummary)}>{summary()}</div>}
          </Show>
        </div>
      </button>
      <Show when={controller.expandedId() === props.notification.id && props.notification.interactive}>
        <div id={`notification-response-${props.notification.id}`} {...stylex.attrs(styles.notificationExpansion)}>
          <NotificationResponse notification={props.notification} />
        </div>
      </Show>
    </div>
  );
}

function InboxContent() {
  const controller = useNotificationInbox();
  return (
    <div {...stylex.attrs(styles.inboxShell)}>
      <div {...stylex.attrs(styles.inboxHeader)}>
        <div>
          <div {...stylex.attrs(styles.notificationEyebrow)}>Notifications</div>
          <div {...stylex.attrs(styles.notificationSummary)}>{controller.items().filter(item => item.interactive).length} awaiting a response</div>
        </div>
        <ActionButton
          tooltip="Mark all passive notifications as read"
          icon={<CheckCheck {...stylex.attrs(styles.iconMd)} />}
          size="sm"
          variant="ghost"
          ariaLabel="Mark all passive notifications as read"
          onClick={controller.markAllRead}
          disabled={!controller.items().some(item => !item.interactive && !item.readAt)}
        >Mark updates read</ActionButton>
      </div>
      <div {...stylex.attrs(styles.inboxList)}>
        <Show
          when={controller.items().length > 0}
          fallback={<div {...stylex.attrs(styles.inboxEmpty)}>You're caught up. Questions and run updates will appear here.</div>}
        >
          <For each={[true, false]}>{interactive => (
            <Show when={controller.items().some(item => item.interactive === interactive)}>
              <div {...stylex.attrs(styles.notificationMeta)}>{interactive ? "Needs your response" : "Run and runtime updates"}</div>
              <For each={controller.items().filter(item => item.interactive === interactive)}>
                {(notification) => <NotificationCard notification={notification} />}
              </For>
            </Show>
          )}</For>
        </Show>
      </div>
    </div>
  );
}

export function NotificationInboxView() {
  const controller = useNotificationInbox();
  return (
    <Popover
      open={controller.open()}
      onClose={controller.close}
      contentClass={stylex.attrs(styles.popoverContent).class}
      content={<InboxContent />}
    >
      <ActionButton
        tooltip="Open notification inbox"
        icon={<Bell {...stylex.attrs(styles.iconMd)} />}
        variant="secondary"
        size="icon"
        ariaLabel="Open notification inbox"
        onClick={controller.toggle}
      />
      <Show when={controller.unreadCount() > 0}>
        <div {...stylex.attrs(styles.unreadCount)}>
          {controller.unreadCount() > 99 ? "99+" : controller.unreadCount()}
        </div>
      </Show>
    </Popover>
  );
}
