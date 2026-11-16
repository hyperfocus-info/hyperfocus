import { SettingsWorkspace } from "@hyperfocus/ui/preferences";
import { PreferencesPanelProvider } from "./preferences/state/panel-context";
/** @jsxImportSource solid-js */
import * as stylex from "@stylexjs/stylex";
import {
AlertTriangle,
} from "lucide-solid";
import { createMemo,createSignal,onCleanup,onMount,Show } from "solid-js";
import { render as renderSolidRoot } from "solid-js/web";
import {
harnessStore,
type PreferencesActiveSectionId
} from "../harness-store";
import {
appHotkeySettings,
normalizeAppHotkeyPreferences,
type AppHotkeyId
} from "../lib/app-hotkeys";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { ActionButton } from "./action-button";
import {
createPreferencesOperationalActions,
createPreferencesPersistenceActions,
} from "./preferences/preferences-actions";
import { PreferencesAiProviders } from "./preferences/preferences-ai-providers";
import { PreferencesBackgroundJobs } from "./preferences/preferences-background-jobs";
import { PreferencesDeveloper } from "./preferences/preferences-developer";
import { PreferencesGeneral } from "./preferences/preferences-general";
import { createPreferencesHotkeyActions } from "./preferences/preferences-hotkey-actions";
import {
formatHotkeyForDisplay,
keybindRowElementId,
} from "./preferences/preferences-hotkey-utils";
import { PreferencesIdeSettings } from "./preferences/preferences-ide-settings";
import { PreferencesKeybinds } from "./preferences/preferences-keybinds";
import {
getPreferencesSection,
preferencesSections,
preferencesSettings,
type PreferencesSettingMeta
} from "./preferences/preferences-model";
import { PreferencesSafety } from "./preferences/preferences-safety";
import { PreferencesSearchResults } from "./preferences/preferences-search-results";
import { createPreferencesThemeActions } from "./preferences/preferences-theme-actions";
import { PreferencesUsage } from "./preferences/preferences-usage";
import { PreferencesWorkspace } from "./preferences/preferences-workspace";
import { preferenceStyles } from "./preferences/preferences.styles";
import { Dialog } from "./primitives/dialog";

const PREFERENCES_SECTION_EVENT = "preferences-section-change";
const PREFERENCES_SEARCH_EVENT = "preferences-search-change";

function emitPreferencesSectionChange(sectionId: PreferencesActiveSectionId) {
  window.dispatchEvent(new CustomEvent(PREFERENCES_SECTION_EVENT, { detail: { sectionId } }));
}

function emitPreferencesSearchChange() {
  window.dispatchEvent(new CustomEvent(PREFERENCES_SEARCH_EVENT));
}

function isPreferencesSectionEvent(event: Event): event is CustomEvent<{ sectionId: PreferencesActiveSectionId }> {
  return event instanceof CustomEvent && typeof event.detail?.sectionId === "string";
}

type PreferencesSearchResult = {
  id: string;
  sectionId: PreferencesActiveSectionId;
  title: string;
  description: string;
  keywords: string[];
  targetId: string;
  kind: "setting" | "keybind";
  keybindId?: AppHotkeyId;
};

function scrollToPreferenceTarget(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }
  target.scrollIntoView?.({ block: "center", inline: "nearest" });
  target.focus({ preventScroll: true });
}

function settingSearchResult(setting: PreferencesSettingMeta): PreferencesSearchResult {
  return {
    id: setting.id,
    sectionId: setting.sectionId,
    title: setting.title,
    description: setting.description,
    keywords: setting.keywords,
    targetId: setting.id,
    kind: "setting"
  };
}

function keybindSearchResult(
  setting: (typeof appHotkeySettings)[number],
  hotkeys: string[]
): PreferencesSearchResult {
  const scopeLabel = setting.scope === "ide" ? "IDE keybind" : "App keybind";
  return {
    id: `keybind-${setting.id}`,
    sectionId: "keybinds",
    title: setting.label,
    description: `${scopeLabel}: ${setting.description}`,
    keywords: [
      "keybind",
      "keybinding",
      "hotkey",
      "shortcut",
      scopeLabel,
      setting.scope ?? "app",
      ...hotkeys,
      ...hotkeys.map(formatHotkeyForDisplay)
    ],
    targetId: keybindRowElementId(setting.id),
    kind: "keybind",
    keybindId: setting.id
  };
}

function matchesPreferencesSearchResult(result: PreferencesSearchResult, query: string) {
  const section = getPreferencesSection(result.sectionId);
  const searchableValues =
    result.kind === "setting"
      ? [result.title, result.description, section.label, ...result.keywords]
      : [result.title, result.description, ...result.keywords];
  const searchableText = searchableValues.join(" ").toLowerCase();
  const queryTokens = query.split(/\s+/).filter(Boolean);
  return queryTokens.every((token) => searchableText.includes(token));
}

function createPreferencesPanelModel() {
  const store = harnessStore;
  const state = store.state;
  const sendCommand = store.actions.sendCommand;
  const runtime: {
    importInput?: HTMLInputElement;
    detailContainer?: HTMLDivElement;
    disposeDetailRoot?: () => void;
  } = {};
  const [selectedSectionId, setSelectedSectionId] = createSignal<PreferencesActiveSectionId>(state.preferencesActiveSectionId);
  const [searchQuery, setSearchQuery] = createSignal(state.preferencesSearchQuery);
  const [hotkeyDrafts, setHotkeyDrafts] = createSignal<Record<AppHotkeyId, string[]>>(
    normalizeAppHotkeyPreferences(state.appHotkeyPreferences),
  );
  const [keybindSearchQuery, setKeybindSearchQuery] = createSignal("");
  const [pendingDuplicateHotkey, setPendingDuplicateHotkey] = createSignal<{
    id: AppHotkeyId;
    index: number;
    value: string;
    conflictLabel: string;
  }>();
  const workspaceModes = () => state.workspace.workspaceModes ?? [];
  const workspaceRuleDraft = () => state.workspace.workspaceRuleSource?.content ?? "";
  const workspaceMemoryDraft = () => state.workspace.workspaceMemorySummary?.content ?? "";
  const enabledAssistantBackgroundJobCount = createMemo(
    () => state.backgroundJobs.jobs.filter((job) => job.assistantId && job.status === "enabled").length,
  );
  const searchResults = () => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) return [];
    const hotkeys = normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    return [
      ...preferencesSettings.map(settingSearchResult),
      ...appHotkeySettings.map((setting) => keybindSearchResult(setting, hotkeys[setting.id])),
    ].filter((setting) => matchesPreferencesSearchResult(setting, query));
  };
  const groupedSearchResults = () => preferencesSections
    .map((section) => ({ section, results: searchResults().filter((setting) => setting.sectionId === section.id) }))
    .filter((entry) => entry.results.length > 0);
  return {
    store, state, sendCommand, runtime, selectedSectionId, setSelectedSectionId,
    searchQuery, setSearchQuery, hotkeyDrafts, setHotkeyDrafts, keybindSearchQuery,
    setKeybindSearchQuery, pendingDuplicateHotkey, setPendingDuplicateHotkey,
    workspaceModes, workspaceRuleDraft, workspaceMemoryDraft,
    enabledAssistantBackgroundJobCount, searchResults, groupedSearchResults,
  };
}

export type PreferencesPanelModel = ReturnType<typeof createPreferencesPanelModel>;
export type { PreferencesSearchResult };

export function PreferencesPanel() {
  const model = createPreferencesPanelModel();
  const {
    store, state, runtime, selectedSectionId, setSelectedSectionId,
    searchQuery, setSearchQuery, setKeybindSearchQuery,
    pendingDuplicateHotkey, setPendingDuplicateHotkey,
  } = model;

  const handleSectionChange = (event: Event) => {
    if (!isPreferencesSectionEvent(event)) {
      return;
    }
    setSelectedSectionId(event.detail.sectionId);
    setSearchQuery("");
    renderDetailRoot();
  };
  const handleSearchChange = () => {
    setSearchQuery(state.preferencesSearchQuery);
    renderDetailRoot();
  };
  window.addEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
  window.addEventListener(PREFERENCES_SEARCH_EVENT, handleSearchChange);
  onCleanup(() => {
    window.removeEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
    window.removeEventListener(PREFERENCES_SEARCH_EVENT, handleSearchChange);
    runtime.disposeDetailRoot?.();
  });
  const persistenceActions = createPreferencesPersistenceActions(model);
  const { updateSavedPreference, handleClearApiKey: clearApiKeys, handleImportPreferences, importFeedback } = persistenceActions;
  const [clearKeysOpen, setClearKeysOpen] = createSignal(false);
  const handleClearApiKey = () => setClearKeysOpen(true);
  const operationalActions = createPreferencesOperationalActions(model);
  const hotkeyActions = createPreferencesHotkeyActions(model, updateSavedPreference);
  function cancelDuplicateHotkey() {
    const pending = pendingDuplicateHotkey();
    if (pending) hotkeyActions.updateHotkeyDraft(pending.id, pending.index, normalizeAppHotkeyPreferences(state.appHotkeyPreferences)[pending.id][pending.index] ?? "");
    setPendingDuplicateHotkey(undefined);
  }

  function openSearchResult(setting: PreferencesSearchResult) {
    const sectionId = setting.sectionId;
    const keybindQuery = setting.kind === "keybind" ? searchQuery().trim() : "";
    setKeybindSearchQuery(keybindQuery);
    setSelectedSectionId(sectionId);
    setSearchQuery("");
    const searchInput = document.querySelector<HTMLInputElement>('[aria-label="Search preferences"]');
    if (searchInput) {
      searchInput.value = "";
    }
    store.setPreferencesActiveSectionId(sectionId);
    emitPreferencesSectionChange(sectionId);
    renderDetailRoot();
    queueMicrotask(() => scrollToPreferenceTarget(setting.targetId));
  }

  const themeActions = createPreferencesThemeActions(model, updateSavedPreference, () => renderDetailRoot());

  const selectSection = (id: string) => {
    const section = preferencesSections.find(section => section.id === id);
    if (!section) return;
    store.setPreferencesSearchQuery("");
    store.setPreferencesActiveSectionId(section.id);
    emitPreferencesSearchChange();
    emitPreferencesSectionChange(section.id);
  };
  onCleanup(registerCurrentTabItemSelector("preferences", index => {
    const section = preferencesSections[index];
    if (!section) return false;
    selectSection(section.id);
    return true;
  }));

  const scope = { model, persistence: persistenceActions, operational: operationalActions,
    hotkeys: hotkeyActions, theme: themeActions, rerender: renderDetailRoot,
    onOpen: openSearchResult, onClearApiKey: handleClearApiKey };

  function renderSelectedSection() {
    if (searchQuery().trim()) {
      return <PreferencesSearchResults />;
    }

    switch (selectedSectionId()) {
      case "keybinds":
        return <PreferencesKeybinds />;
      case "ide-settings":
        return <PreferencesIdeSettings />;
      case "general-ui":
        return <PreferencesGeneral />;
      case "safety-guardrails":
        return <PreferencesSafety />;
      case "workspace-memory":
        return <PreferencesWorkspace />;
      case "usage":
        return <PreferencesUsage />;
      case "background-jobs":
        return <PreferencesBackgroundJobs />;
      case "developer-advanced":
        return <PreferencesDeveloper />;
      default:
        return <PreferencesAiProviders />;
    }
  }

  function renderDetailRoot() {
    if (!runtime.detailContainer) {
      return;
    }
    runtime.disposeDetailRoot?.();
    runtime.detailContainer.replaceChildren();
    runtime.disposeDetailRoot = renderSolidRoot(() => <PreferencesPanelProvider value={scope}>{renderSelectedSection()}</PreferencesPanelProvider>, runtime.detailContainer);
  }

  onMount(renderDetailRoot);

  return (
    <PreferencesPanelProvider value={scope}><section data-test-preferences-panel="" class={stylex.attrs(preferenceStyles.panelShell, preferenceStyles.flex, preferenceStyles.flex1, preferenceStyles.minHeight0, preferenceStyles.flexColumn, preferenceStyles.overflowVisible, preferenceStyles.rounded2xl, preferenceStyles.backgroundPanel, preferenceStyles.lgOverflowHidden).class}>
      <input ref={(element) => { runtime.importInput = element; }} type="file" accept="application/json" class={stylex.attrs(preferenceStyles.hidden).class} onChange={handleImportPreferences} />
      <SettingsWorkspace title="Preferences" sections={preferencesSections.map(section => ({ id: section.id, label: section.label, icon: <section.icon /> }))}
        activeSection={selectedSectionId()} onSectionChange={selectSection} query={searchQuery()} onClose={() => store.closePreferencesModal()}
        onQueryChange={query => { store.setPreferencesSearchQuery(query); emitPreferencesSearchChange(); }}>
          <div ref={(element) => { runtime.detailContainer = element; }} class={stylex.attrs(preferenceStyles.minHeight0, preferenceStyles.flex1, preferenceStyles.overflowVisible, preferenceStyles.padding4, preferenceStyles.lgOverflowAuto).class}>
            <PreferencesAiProviders />
          </div>
      </SettingsWorkspace>
      <Dialog
        open={() => Boolean(pendingDuplicateHotkey())}
        title="Duplicate keybind"
        description={`This keybind is already assigned to ${pendingDuplicateHotkey()?.conflictLabel ?? "another command"}.`}
        onClose={cancelDuplicateHotkey}
        footer={
          <>
            <ActionButton tooltip="Cancel duplicate keybind save" variant="ghost" onClick={cancelDuplicateHotkey}>
              Cancel
            </ActionButton>
            <ActionButton
              tooltip="Save this duplicate keybind anyway"
              icon={<AlertTriangle class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
              onClick={() => {
                const pending = pendingDuplicateHotkey();
                if (!pending) {
                  return;
                }
                hotkeyActions.saveHotkeyPreference(pending.id, pending.index, pending.value, true);
              }}
            >
              Save both
            </ActionButton>
          </>
        }
      >
        <p class={stylex.attrs(preferenceStyles.textSm, preferenceStyles.leading6, preferenceStyles.colorMuted).class}>Both commands can keep the same keybind. The command that handles it first may win when pressed.</p>
      </Dialog>
      <Dialog open={clearKeysOpen} title="Clear all provider keys?" description="Remove saved OpenAI, Google and Anthropic keys from this Harness workspace and browser. You will need to enter keys again to use those providers." onClose={() => setClearKeysOpen(false)} footer={<><ActionButton variant="ghost" tooltip="Keep provider keys" onClick={() => setClearKeysOpen(false)}>Cancel</ActionButton><ActionButton variant="secondary" tooltip="Remove all saved provider keys" onClick={() => { clearApiKeys(); setClearKeysOpen(false); }}>Clear all keys</ActionButton></>}><p>Provider accounts and CLI sign-ins are managed separately.</p></Dialog>
      <Show when={importFeedback()}>{feedback => <p role={feedback().failed ? "alert" : "status"} class={stylex.attrs(preferenceStyles.padding4, preferenceStyles.textSm).class}>{feedback().message}</p>}</Show>

    </section></PreferencesPanelProvider>
  );
}

export const PreferencesModal = PreferencesPanel;
