import { createContext,useContext } from "solid-js";

// Standalone panes have no containing mobile sheet to dismiss. Each application
// pane provides its own completion action; it is never stored in a global slot.
const PaneNavigationContext = createContext<() => void>(() => {});
export const PaneNavigationProvider = PaneNavigationContext.Provider;
export function usePaneNavigation() { return useContext(PaneNavigationContext); }
