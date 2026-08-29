export {
  activateProjectThreadFromInbox,
  createAssistantJobBootstrapCommandFromInbox,
  isCachedBrowserApprovalTerminal,
  openAssistantQuestionNotificationFromInbox,
  openBackgroundRunNotificationFromInbox,
  openCliUpdateNotificationFromInbox
} from "./notification-inbox/controller";
import { createNotificationInboxController } from "./notification-inbox/controller";
import { NotificationInboxView } from "./notification-inbox/view";

export function NotificationInbox() {
  return <NotificationInboxView controller={createNotificationInboxController()} />;
}
