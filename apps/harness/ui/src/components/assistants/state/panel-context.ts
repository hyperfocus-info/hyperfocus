import { createContext, useContext } from "solid-js";
import type { AssistantsPanelController } from "../assistant-panel-controller";

// Each panel mount owns its controller and cleanup. The context transports stable
// accessors/commands; consumers subscribe only to the fields they actually read.
const AssistantsPanelContext = createContext<AssistantsPanelController>();
export const AssistantsPanelProvider = AssistantsPanelContext.Provider;

export function useAssistantsPanel() {
  const panel = useContext(AssistantsPanelContext);
  if (!panel) throw new Error("AssistantsPanel requires its panel provider.");
  return panel;
}
