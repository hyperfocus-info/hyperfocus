/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { render as renderSolidRoot } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import { createRequestId, type ComposerReasoningStrength, type ProviderBrand, type RunModelPreference, type TerminalPreferences } from "@hyperfocus/ai-core/protocol";
import {
  AlertTriangle,
  Archive,
  Bell,
  BriefcaseBusiness,
  CirclePause,
  Download,
  FileJson,
  FolderOpen,
  HelpCircle,
  Import,
  Keyboard,
  LayoutPanelLeft,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sun,
  Trash2,
  Type,
  X
} from "lucide-solid";
import {
  harnessStore,
  persistMergedLocalPreferences,
  type PreferencesActiveSectionId,
  type ProviderConnectionProvider
} from "../harness-store";
import {
  appHotkeySettings,
  DEFAULT_APP_HOTKEY_PREFERENCES,
  isValidAppHotkey,
  normalizeAppHotkey,
  normalizeAppHotkeyPreferences,
  type AppHotkeyId
} from "../lib/app-hotkeys";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { formatShortTimestamp } from "../lib/time-format";
import {
  BUILT_IN_THEMES,
  CUSTOM_THEME_COLOR_VARIABLES,
  CUSTOM_THEME_FONT_VARIABLES,
  DEFAULT_CUSTOM_BASE_THEME_ID,
  THEME_OPTIONS,
  createDefaultCustomTheme,
  getCustomThemeFontOptions,
  isBuiltInThemeId,
  normalizeHexColor,
  normalizeThemeColorInput,
  normalizeThemeFontInput,
  normalizeThemePreference,
  resolveThemeMode,
  resolveThemeTokens,
  validateThemeContrast,
  withCustomThemeToken,
  type CustomThemeDefinition,
  type ThemeCssVariable,
  type ThemeId,
  type ThemeModePreference
} from "../theme/theme-model";
import { DEFAULT_IDE_EDITOR_SETTINGS, ideStore, type IdeAutoSaveMode, type IdeEditorSettings, type IdeIndentStyle, type IdeTabSize, type IdeWordWrapMode } from "../ide/ide-store";
import { terminalStore } from "../terminal/terminal-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { ModeEditorPanel } from "./mode-editor-panel";
import { Dialog } from "./primitives/dialog";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { LeftPaneSearchInput } from "./primitives/left-pane";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import {
  AdvancedDisclosure,
  PasswordKeyInput,
  PreferenceRow,
  PreferenceSection,
  RangeControl,
  SegmentedControl
} from "./preferences/preferences-controls";
import { preferenceStyles } from "./preferences/preferences.styles";
import { parsePreferencesImport } from "./preferences/preferences-import";
import {
  createPreferencesOperationalActions,
  createPreferencesPersistenceActions,
} from "./preferences/preferences-actions";
import { createPreferencesHotkeyActions } from "./preferences/preferences-hotkey-actions";
import { PreferencesKeybinds } from "./preferences/preferences-keybinds";
import { PreferencesIdeSettings } from "./preferences/preferences-ide-settings";
import { PreferencesAiProviders } from "./preferences/preferences-ai-providers";
import { PreferencesSafety } from "./preferences/preferences-safety";
import { PreferencesBackgroundJobs } from "./preferences/preferences-background-jobs";
import { PreferencesDeveloper } from "./preferences/preferences-developer";
import { PreferencesGeneral } from "./preferences/preferences-general";
import { PreferencesSearchResults } from "./preferences/preferences-search-results";
import { PreferencesUsage } from "./preferences/preferences-usage";
import { PreferencesWorkspace } from "./preferences/preferences-workspace";
import {
  chordsMatch,
  formatHotkeyForDisplay,
  formatRecordedChord,
  keybindRowElementId,
} from "./preferences/preferences-hotkey-utils";
import { createPreferencesThemeActions, PreferencesCustomThemeEditor, PreferencesThemePreview } from "./preferences/preferences-theme-actions";
import {
  getPreferencesSection,
  preferencesSections,
  preferencesSettings,
  type PreferencesSettingMeta
} from "./preferences/preferences-model";

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
  const {
    handleSave, updateSavedPreference, handleClearApiKey, handleExportPreferences,
    handleImportPreferences,
  } = persistenceActions;
  const operationalActions = createPreferencesOperationalActions(model);
  const hotkeyActions = createPreferencesHotkeyActions(model, updateSavedPreference);

  function openSearchResult(setting: PreferencesSearchResult) {
    const sectionId = setting.sectionId;
    const keybindQuery = setting.kind === "keybind" ? searchQuery().trim() : "";
    setKeybindSearchQuery(keybindQuery);
    setSelectedSectionId(sectionId);
    setSearchQuery("");
    const searchInput = document.querySelector<HTMLInputElement>('[aria-label="Search settings"]');
    if (searchInput) {
      searchInput.value = "";
    }
    store.setPreferencesActiveSectionId(sectionId);
    emitPreferencesSectionChange(sectionId);
    renderDetailRoot();
    queueMicrotask(() => scrollToPreferenceTarget(setting.targetId));
  }

  const themeActions = createPreferencesThemeActions(model, updateSavedPreference, () => renderDetailRoot());

  function renderSelectedSection() {
    if (searchQuery().trim()) {
      return <PreferencesSearchResults model={model} onOpen={openSearchResult} />;
    }

    switch (selectedSectionId()) {
      case "keybinds":
        return <PreferencesKeybinds model={model} actions={hotkeyActions} handleSave={handleSave} />;
      case "ide-settings":
        return <PreferencesIdeSettings updateSavedPreference={updateSavedPreference} />;
      case "general-ui":
        return <PreferencesGeneral model={model} actions={operationalActions} themeActions={themeActions} updateSavedPreference={updateSavedPreference} rerender={renderDetailRoot} />;
      case "safety-guardrails":
        return <PreferencesSafety model={model} actions={operationalActions} updateSavedPreference={updateSavedPreference} />;
      case "workspace-memory":
        return <PreferencesWorkspace model={model} actions={operationalActions} updateSavedPreference={updateSavedPreference} />;
      case "usage":
        return <PreferencesUsage model={model} rerender={renderDetailRoot} />;
      case "background-jobs":
        return <PreferencesBackgroundJobs model={model} actions={operationalActions} updateSavedPreference={updateSavedPreference} />;
      case "developer-advanced":
        return <PreferencesDeveloper model={model} updateSavedPreference={updateSavedPreference} onClearApiKey={handleClearApiKey} onExport={handleExportPreferences} onResetPanelSizes={operationalActions.handleResetPanelSizes} />;
      default:
        return <PreferencesAiProviders model={model} actions={operationalActions} updateSavedPreference={updateSavedPreference} />;
    }
  }

  function renderDetailRoot() {
    if (!runtime.detailContainer) {
      return;
    }
    runtime.disposeDetailRoot?.();
    runtime.detailContainer.replaceChildren();
    runtime.disposeDetailRoot = renderSolidRoot(() => renderSelectedSection(), runtime.detailContainer);
  }

  onMount(renderDetailRoot);

  return (
    <section data-test-preferences-panel="" class={stylex.attrs(preferenceStyles.panelShell, preferenceStyles.flex, preferenceStyles.minHeight0, preferenceStyles.flexColumn, preferenceStyles.overflowVisible, preferenceStyles.rounded2xl, preferenceStyles.backgroundPanel, preferenceStyles.lgHeightFull, preferenceStyles.lgOverflowHidden).class}>
      <input ref={(element) => { runtime.importInput = element; }} type="file" accept="application/json" class={stylex.attrs(preferenceStyles.hidden).class} onChange={handleImportPreferences} />
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minHeight0, preferenceStyles.flex1, preferenceStyles.overflowVisible, preferenceStyles.lgOverflowHidden).class}>
        <main class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flex1, preferenceStyles.flexColumn, preferenceStyles.backgroundPanel).class}>
          <div ref={(element) => { runtime.detailContainer = element; }} class={stylex.attrs(preferenceStyles.minHeight0, preferenceStyles.flex1, preferenceStyles.overflowVisible, preferenceStyles.padding4, preferenceStyles.lgOverflowAuto).class}>
            <PreferencesAiProviders model={model} actions={operationalActions} updateSavedPreference={updateSavedPreference} />
          </div>
        </main>
      </div>
      <Dialog
        open={() => Boolean(pendingDuplicateHotkey())}
        title="Duplicate keybind"
        description={`This keybind is already assigned to ${pendingDuplicateHotkey()?.conflictLabel ?? "another command"}.`}
        onClose={() => setPendingDuplicateHotkey(undefined)}
        footer={
          <>
            <ActionButton tooltip="Cancel duplicate keybind save" variant="ghost" onClick={() => setPendingDuplicateHotkey(undefined)}>
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
      <footer class={stylex.attrs(preferenceStyles.flex, preferenceStyles.widthFull, preferenceStyles.shrink0, preferenceStyles.flexWrap, preferenceStyles.justifyEnd, preferenceStyles.gap2, preferenceStyles.borderTop, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.paddingInline5, preferenceStyles.paddingBlock4).class}>
          <ActionButton tooltip="Close preferences" ariaLabel="Dismiss" variant="ghost" onClick={() => store.closePreferencesModal()}>
            Dismiss
          </ActionButton>
          <ActionButton tooltip="Export preferences JSON" ariaLabel="Export" variant="ghost" icon={<FileJson class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={handleExportPreferences}>
            Export
          </ActionButton>
          <ActionButton tooltip="Import preferences JSON" ariaLabel="Import" variant="ghost" icon={<Import class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={() => runtime.importInput?.click()}>
            Import
          </ActionButton>
          <ActionButton tooltip="Clear all provider keys" ariaLabel="Clear keys" variant="secondary" icon={<Trash2 class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={handleClearApiKey}>
            Clear keys
          </ActionButton>
      </footer>
    </section>
  );
}

export const PreferencesModal = PreferencesPanel;

export function PreferenceSectionNav(props: { onNavigate?: () => void } = {}) {
  const store = harnessStore;
  const state = store.state;
  const [activeSectionId, setActiveSectionId] = createSignal(state.preferencesActiveSectionId);
  const navigationButtonClass = stylex.attrs(
    preferenceStyles.flex,
    preferenceStyles.widthFull,
    preferenceStyles.cursorPointer,
    preferenceStyles.itemsCenter,
    preferenceStyles.gap2,
    preferenceStyles.overflowHidden,
    preferenceStyles.rounded2xl,
    preferenceStyles.paddingInline3,
    preferenceStyles.paddingBlock2,
    preferenceStyles.textLeft,
    preferenceStyles.textXs,
    preferenceStyles.fontMedium,
    preferenceStyles.colorMuted,
    preferenceStyles.transition,
    preferenceStyles.hoverBackgroundWhite60,
    preferenceStyles.hoverColorForeground
  ).class;
  const selectedNavigationButtonClass = stylex.attrs(
    preferenceStyles.flex,
    preferenceStyles.widthFull,
    preferenceStyles.cursorPointer,
    preferenceStyles.itemsCenter,
    preferenceStyles.gap2,
    preferenceStyles.overflowHidden,
    preferenceStyles.rounded2xl,
    preferenceStyles.paddingInline3,
    preferenceStyles.paddingBlock2,
    preferenceStyles.textLeft,
    preferenceStyles.textXs,
    preferenceStyles.fontMedium,
    preferenceStyles.colorMuted,
    preferenceStyles.transition,
    preferenceStyles.hoverBackgroundWhite60,
    preferenceStyles.hoverColorForeground,
    preferenceStyles.navigationSelected
  ).class;

  const handleSectionChange = (event: Event) => {
    if (!isPreferencesSectionEvent(event)) {
      return;
    }
    setActiveSectionId(event.detail.sectionId);
  };
  window.addEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
  const selectSection = (sectionId: PreferencesActiveSectionId) => {
    setActiveSectionId(sectionId);
    store.setPreferencesSearchQuery("");
    store.setPreferencesActiveSectionId(sectionId);
    emitPreferencesSearchChange();
    emitPreferencesSectionChange(sectionId);
    props.onNavigate?.();
  };
  const unregisterItemSelector = registerCurrentTabItemSelector("preferences", (index) => {
    const section = preferencesSections[index];
    if (!section) {
      return false;
    }
    selectSection(section.id);
    return true;
  });
  onCleanup(() => {
    unregisterItemSelector();
    window.removeEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
  });

  return (
    <nav class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3, preferenceStyles.padding3).class} aria-label="Preference sections">
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3, preferenceStyles.borderBottom, preferenceStyles.borderDefault, preferenceStyles.paddingBottom3).class}>
        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
          <div class={stylex.attrs(preferenceStyles.text065, preferenceStyles.fontSemibold, preferenceStyles.uppercase, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>Preferences</div>
          <Tooltip content="Manage provider keys and workspace defaults.">
            <span class={stylex.attrs(preferenceStyles.inlineFlex, preferenceStyles.height6, preferenceStyles.width6, preferenceStyles.itemsCenter, preferenceStyles.justifyCenter, preferenceStyles.roundedLg, preferenceStyles.colorMuted).class}>
              <HelpCircle class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />
            </span>
          </Tooltip>
        </div>
        <LeftPaneSearchInput
          aria-label="Search settings"
          value={state.preferencesSearchQuery}
          placeholder="Search settings..."
          onInput={(event) => {
            store.setPreferencesSearchQuery(event.currentTarget.value);
            emitPreferencesSearchChange();
          }}
        />
      </div>
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap1).class}>
      <For each={preferencesSections}>
        {(section) => {
          const Icon = section.icon;
          const active = () => !state.preferencesSearchQuery.trim() && activeSectionId() === section.id;
          return (
            <Tooltip content={`${section.label}\n${section.description}`} triggerClass={stylex.attrs(preferenceStyles.block, preferenceStyles.minWidth0).class}>
              <button
                type="button"
                class={active() ? selectedNavigationButtonClass : navigationButtonClass}
                aria-label={section.label}
                aria-current={active() ? "page" : undefined}
                onClick={() => {
                  selectSection(section.id);
                }}
              >
                <Icon class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4, preferenceStyles.shrink0).class} />
                <span class={stylex.attrs(preferenceStyles.minWidth0, preferenceStyles.flex1, preferenceStyles.overflowHidden).class}>
                  <span class={stylex.attrs(preferenceStyles.block, preferenceStyles.truncate).class}>{section.label}</span>
                  <span class={stylex.attrs(preferenceStyles.marginTop05, preferenceStyles.block, preferenceStyles.truncate, preferenceStyles.text065, preferenceStyles.fontNormal, preferenceStyles.colorMuted).class}>{section.description}</span>
                </span>
              </button>
            </Tooltip>
          );
        }}
      </For>
      </div>
    </nav>
  );
}
