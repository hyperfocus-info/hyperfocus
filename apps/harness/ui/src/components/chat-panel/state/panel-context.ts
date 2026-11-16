import { createContext, useContext } from "solid-js";
import type { ChatPanelController } from "../../chat-panel";

// Each panel mount owns its controller and cleanup. The context transports stable
// accessors/commands; consumers subscribe only to the fields they actually read.
const ChatPanelContext = createContext<ChatPanelController>();
export const ChatPanelProvider = ChatPanelContext.Provider;

export function useChatPanel() {
  const panel = useContext(ChatPanelContext);
  if (!panel) throw new Error("ChatPanel requires its panel provider.");
  return panel;
}
