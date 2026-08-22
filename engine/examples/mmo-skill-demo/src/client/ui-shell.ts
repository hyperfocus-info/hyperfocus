import { createSingleOpenPanelState } from "@hyperfocus/engine/ui";

export type CompactPanelName = "" | "quest" | "event" | "bag" | "gear" | "skills" | "stats" | "catalog" | "journal" | "craft";

const COMPACT_PANEL_NAMES = ["quest", "event", "bag", "gear", "skills", "stats", "catalog", "journal", "craft"] as const;
const compactPanelGuard = createSingleOpenPanelState({ panels: COMPACT_PANEL_NAMES });

export function isCompactPanelName(value: string): value is CompactPanelName {
  return value === "" || compactPanelGuard.isPanel(value);
}

export function createCompactPanelState(initialPanel = "") {
  const state = createSingleOpenPanelState({ panels: COMPACT_PANEL_NAMES, initialPanel });
  return {
    get activePanel() {
      return state.activePanel as CompactPanelName;
    },
    open(name: string) {
      return state.open(name) as CompactPanelName;
    },
    toggle(name: string) {
      return state.toggle(name) as CompactPanelName;
    },
    panelIds() {
      return state.panelIds();
    }
  };
}
