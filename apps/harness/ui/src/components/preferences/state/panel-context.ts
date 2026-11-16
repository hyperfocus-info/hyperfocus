import { createContext,useContext } from "solid-js";
import type { PreferencesPanelModel,PreferencesSearchResult } from "../../preferences-modal";
import type { createPreferencesOperationalActions,createPreferencesPersistenceActions } from "../preferences-actions";
import type { createPreferencesHotkeyActions } from "../preferences-hotkey-actions";
import type { PreferencesThemeActions } from "../preferences-theme-actions";

// Detached preference detail roots install this same mount-owned scope explicitly.
const PreferencesPanelContext = createContext<{
  model: PreferencesPanelModel;
  persistence: ReturnType<typeof createPreferencesPersistenceActions>;
  operational: ReturnType<typeof createPreferencesOperationalActions>;
  hotkeys: ReturnType<typeof createPreferencesHotkeyActions>;
  theme: PreferencesThemeActions;
  rerender: () => void;
  onOpen: (result: PreferencesSearchResult) => void;
  onClearApiKey: () => void;
}>();
export const PreferencesPanelProvider = PreferencesPanelContext.Provider;
export function usePreferencesPanel() {
  const panel = useContext(PreferencesPanelContext);
  if (!panel) throw new Error("Preferences require their panel provider.");
  return panel;
}
