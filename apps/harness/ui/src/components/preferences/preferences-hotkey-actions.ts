import { appHotkeySettings, normalizeAppHotkey, normalizeAppHotkeyPreferences, type AppHotkeyId } from "../../lib/app-hotkeys";
import type { PreferencesPanelModel } from "../preferences-modal";
import { chordsMatch } from "./preferences-hotkey-utils";

export function createPreferencesHotkeyActions(
  model: PreferencesPanelModel,
  updateSavedPreference: (update: () => void) => void,
) {
  const { state, store, hotkeyDrafts, setHotkeyDrafts, setPendingDuplicateHotkey } = model;
  function saveHotkeyPreference(id: AppHotkeyId, index: number, value: string, allowDuplicate = false) {
    const normalized = normalizeAppHotkey(value, "");
    if (!normalized) {
      return false;
    }
    const duplicate = appHotkeySettings.find((setting) => {
      const existingHotkeys = normalizeAppHotkeyPreferences(state.appHotkeyPreferences)[setting.id];
      return existingHotkeys.some((existing, existingIndex) => {
        if (setting.id === id && existingIndex === index) {
          return false;
        }
        return chordsMatch(existing, normalized);
      });
    });

    if (duplicate && !allowDuplicate) {
      setPendingDuplicateHotkey({ id, index, value: normalized, conflictLabel: duplicate.label });
      return false;
    }

    const currentHotkeys = hotkeyDrafts()[id];
    const nextHotkeys = currentHotkeys.map((hotkey, hotkeyIndex) => (hotkeyIndex === index ? normalized : hotkey));
    updateSavedPreference(() => store.setAppHotkeyPreference(id, nextHotkeys));
    setHotkeyDrafts((drafts) => ({ ...drafts, [id]: nextHotkeys }));
    setPendingDuplicateHotkey(undefined);
    return true;
  }

  function addHotkeyDraft(id: AppHotkeyId) {
    setHotkeyDrafts((drafts) => ({ ...drafts, [id]: [...drafts[id], ""] }));
  }

  function updateHotkeyDraft(id: AppHotkeyId, index: number, value: string) {
    setHotkeyDrafts((drafts) => ({
      ...drafts,
      [id]: drafts[id].map((hotkey, hotkeyIndex) => (hotkeyIndex === index ? value : hotkey))
    }));
  }

  function deleteHotkeyPreference(id: AppHotkeyId, index: number) {
    const nextHotkeys = hotkeyDrafts()[id].filter((_, hotkeyIndex) => hotkeyIndex !== index);
    setHotkeyDrafts((drafts) => ({ ...drafts, [id]: nextHotkeys }));
    updateSavedPreference(() => store.setAppHotkeyPreference(id, nextHotkeys));
  }

  return { saveHotkeyPreference, addHotkeyDraft, updateHotkeyDraft, deleteHotkeyPreference };
}

export type PreferencesHotkeyActions = ReturnType<typeof createPreferencesHotkeyActions>;
