import { createNotificationInboxController } from "./notification-inbox/controller";
import { NotificationInboxProvider } from "./notification-inbox/panel-context";
import { NotificationInboxView } from "./notification-inbox/view";
export {
activateProjectThreadFromInbox,
createAssistantJobBootstrapCommandFromInbox,
isCachedBrowserApprovalTerminal,
openAssistantQuestionNotificationFromInbox,
openBackgroundRunNotificationFromInbox,
openCliUpdateNotificationFromInbox
} from "./notification-inbox/controller";

export function NotificationInbox() {
  const controller = createNotificationInboxController();
  return <NotificationInboxProvider value={controller}><NotificationInboxView /></NotificationInboxProvider>;
}
