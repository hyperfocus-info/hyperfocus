import { createContext, useContext } from "solid-js";
import type { NotificationInboxController } from "./contracts";

const NotificationInboxContext = createContext<NotificationInboxController>();
export const NotificationInboxProvider = NotificationInboxContext.Provider;
export function useNotificationInbox() {
  const inbox = useContext(NotificationInboxContext);
  if (!inbox) throw new Error("Notification inbox requires its provider.");
  return inbox;
}
