import { For, Match, Show, Switch } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Bell, Bot, CheckCheck, CircleAlert, Download, LoaderCircle, SendHorizontal } from "lucide-solid";
import type { NotificationInboxItem } from "@hyperfocus/ai-core/protocol";
import { formatApprovalInvocationDescription } from "../../lib/tool-activity-format";
import { ActionButton } from "../action-button";
import { miscellaneousSurfaceStyles as styles } from "../miscellaneous-surfaces.styles";
import { Popover } from "../primitives/popover";
import type { NotificationInboxController } from "./contracts";
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

function notificationSummary(notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status": return notification.summary;
    case "planning-question": return notification.placeholder;
    case "planning-question-batch": return notification.questions.map((question) => question.prompt).join(" ");
    case "assistant-question": return notification.answerText;
    case "assistant-question-batch": return notification.questions.map((question) => question.prompt).join(" ");
    case "browser-approval":
      return formatApprovalInvocationDescription(notification.label, notification.inputSummary);
    case "cli-update": return `${notification.currentVersion} -> ${notification.latestVersion}. Click to update.`;
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

function NotificationCard(props: {
  notification: NotificationInboxItem;
  controller: NotificationInboxController;
}) {
  return (
    <div
      {...stylex.attrs(styles.notificationCard)}
      onClick={(event) => {
        if (props.notification.kind === "background-run-status" && event.target === event.currentTarget) {
          props.controller.openItem(props.notification);
        }
      }}
    >
      <button
        type="button"
        {...stylex.attrs(styles.notificationButton)}
        onClick={() => props.controller.openItem(props.notification)}
      >
        <div {...stylex.attrs(styles.notificationCopy)}>
          <div {...stylex.attrs(styles.notificationMeta)}>
            <NotificationKindIcon notification={props.notification} />
            <span>{props.notification.kind.replaceAll("-", " ")}</span>
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
      <Show when={props.controller.expandedId() === props.notification.id && props.notification.interactive}>
        <div {...stylex.attrs(styles.notificationExpansion)}>
          <NotificationResponse notification={props.notification} controller={props.controller} />
        </div>
      </Show>
    </div>
  );
}

function InboxContent(props: { controller: NotificationInboxController }) {
  return (
    <div {...stylex.attrs(styles.inboxShell)}>
      <div {...stylex.attrs(styles.inboxHeader)}>
        <div {...stylex.attrs(styles.notificationEyebrow)}>Notifications</div>
        <ActionButton
          tooltip="Mark all passive notifications as read"
          icon={<CheckCheck {...stylex.attrs(styles.iconMd)} />}
          size="icon"
          variant="ghost"
          ariaLabel="Mark all passive notifications as read"
          onClick={props.controller.markAllRead}
        />
      </div>
      <div {...stylex.attrs(styles.inboxList)}>
        <Show
          when={props.controller.items().length > 0}
          fallback={<div {...stylex.attrs(styles.inboxEmpty)}>Inbox empty.</div>}
        >
          <For each={props.controller.items()}>
            {(notification) => <NotificationCard notification={notification} controller={props.controller} />}
          </For>
        </Show>
      </div>
    </div>
  );
}

export function NotificationInboxView(props: { controller: NotificationInboxController }) {
  return (
    <Popover
      open={props.controller.open()}
      onClose={props.controller.close}
      contentClass={stylex.attrs(styles.popoverContent).class}
      content={<InboxContent controller={props.controller} />}
    >
      <ActionButton
        tooltip="Open notification inbox"
        icon={<Bell {...stylex.attrs(styles.iconMd)} />}
        variant="secondary"
        size="icon"
        ariaLabel="Open notification inbox"
        onClick={props.controller.toggle}
      />
      <Show when={props.controller.unreadCount() > 0}>
        <div {...stylex.attrs(styles.unreadCount)}>
          {props.controller.unreadCount() > 99 ? "99+" : props.controller.unreadCount()}
        </div>
      </Show>
    </Popover>
  );
}
