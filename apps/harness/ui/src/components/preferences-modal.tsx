/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { render as renderSolidRoot } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import { createRequestId, type ComposerReasoningStrength, type ProviderBrand, type RunModelPreference, type TerminalPreferences } from "../../../shared/protocol";
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
import {
  getPreferencesSection,
  preferencesSections,
  preferencesSettings,
  type PreferencesSettingMeta
} from "./preferences/preferences-model";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} bytes`;
}

function formatTokenCount(value: number) {
  const normalized = Math.max(0, Math.round(value));
  return normalized.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

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

function Highlight(props: { value: string; query: string }) {
  const normalizedQuery = () => props.query.trim();
  const parts = createMemo(() => {
    if (!normalizedQuery()) {
      return [props.value];
    }
    return props.value.split(new RegExp(`(${escapeRegExp(normalizedQuery())})`, "ig"));
  });

  return (
    <>
      <For each={parts()}>
        {(part) =>
          part.toLowerCase() === normalizedQuery().toLowerCase() ? (
            <mark class={stylex.attrs(preferenceStyles.rounded, preferenceStyles.backgroundAmber100, preferenceStyles.paddingInline05, preferenceStyles.colorForeground).class}>{part}</mark>
          ) : (
            part
          )
        }
      </For>
    </>
  );
}

const recordedModifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);

function formatRecordedChord(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }

  if (!recordedModifierKeys.has(event.key)) {
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key === " " ? "Space" : key);
  }

  return parts.join("+");
}

function chordsMatch(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase() || formatForDisplay(left).toLowerCase() === formatForDisplay(right).toLowerCase();
}

function formatHotkeyForDisplay(value: string) {
  return formatForDisplay(value)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
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

function keybindRowElementId(id: AppHotkeyId) {
  return `keybind-${id}`;
}

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

export function PreferencesPanel() {
  const store = harnessStore;
  const state = store.state;
  const sendCommand = store.actions.sendCommand;
  let importInput: HTMLInputElement | undefined;
  let detailContainer: HTMLDivElement | undefined;
  let disposeDetailRoot: (() => void) | undefined;
  const [selectedSectionId, setSelectedSectionId] = createSignal<PreferencesActiveSectionId>(
    state.preferencesActiveSectionId
  );
  const [searchQuery, setSearchQuery] = createSignal(state.preferencesSearchQuery);
  const [hotkeyDrafts, setHotkeyDrafts] = createSignal(normalizeAppHotkeyPreferences(state.appHotkeyPreferences));
  const [keybindSearchQuery, setKeybindSearchQuery] = createSignal("");
  const [pendingDuplicateHotkey, setPendingDuplicateHotkey] = createSignal<{
    id: AppHotkeyId;
    index: number;
    value: string;
    conflictLabel: string;
  }>();

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
    disposeDetailRoot?.();
  });

  const workspaceModes = () => state.workspace.workspaceModes ?? [];
  const workspaceRuleDraft = () => state.workspace.workspaceRuleSource?.content ?? "";
  const workspaceMemoryDraft = () => state.workspace.workspaceMemorySummary?.content ?? "";
  const enabledAssistantBackgroundJobCount = createMemo(
    () => state.backgroundJobs.jobs.filter((job) => job.assistantId && job.status === "enabled").length
  );

  const searchResults = () => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) {
      return [];
    }

    const hotkeys = normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    return [
      ...preferencesSettings.map(settingSearchResult),
      ...appHotkeySettings.map((setting) => keybindSearchResult(setting, hotkeys[setting.id]))
    ].filter((setting) => matchesPreferencesSearchResult(setting, query));
  };

  const groupedSearchResults = () =>
    preferencesSections
      .map((section) => ({
        section,
        results: searchResults().filter((setting) => setting.sectionId === section.id)
      }))
      .filter((entry) => entry.results.length > 0)
  ;
  const subagentWorktreeOptions = () => [
    { value: "same-worktree", label: "Same checkout", description: "Subagents edit inside current working tree." },
    {
      value: "separate-worktrees",
      label: "Isolated mounts (BranchFS)",
      description: "Subagents work in isolated BranchFS mounts before merge."
    }
  ];
  const projectSortOptions = () => [
    { value: "last-user-message", label: "Last message" },
    { value: "created-at", label: "Created" },
    { value: "manual", label: "Manual" }
  ];
  const threadSortOptions = () => [
    { value: "last-user-message", label: "Last message" },
    { value: "created-at", label: "Created" }
  ];
  const groupingOptions = () => [
    { value: "repository", label: "Repository" },
    { value: "repository-path", label: "Repository path" },
    { value: "separate", label: "Separate" }
  ];

  function handleSave() {
    const openAiApiKey = state.openAiApiKeyDraft.trim() || undefined;
    const googleApiKey = state.googleApiKeyDraft.trim() || undefined;
    const anthropicApiKey = state.anthropicApiKeyDraft.trim() || undefined;

    const localPreferences = {
      openAiApiKey,
      googleApiKey,
      anthropicApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences,
      themePreference: state.themePreference,
      numericRightAlignmentEnabled: state.numericRightAlignmentEnabled
    };

    persistMergedLocalPreferences(localPreferences);
    store.commitLocalPreferences(localPreferences);

    sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey,
        googleApiKey,
        anthropicApiKey,
        providerBrand: state.providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: state.checkCliUpdatesDefault
      }
    });

  }

  function updateSavedPreference(update: () => void) {
    update();
    handleSave();
  }

  function handleBranchfsCleanup() {
    const projectId = state.workspace.activeProjectId;
    if (!projectId) {
      pushToast("No active project", "Open a project before cleaning BranchFS.", "error");
      return;
    }
    sendCommand({
      type: "branchfs.cleanup",
      requestId: createRequestId(),
      payload: {
        projectId,
        mode: "all"
      }
    });
  }

  function handlePauseAssistantBackgroundJobs() {
    sendCommand({
      type: "background-job.pause-assistant-jobs",
      requestId: createRequestId()
    });
  }

  function handleClearApiKey() {
    persistMergedLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      anthropicApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences,
      themePreference: state.themePreference,
      numericRightAlignmentEnabled: state.numericRightAlignmentEnabled
    });
    store.commitLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      anthropicApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences,
      themePreference: state.themePreference,
      numericRightAlignmentEnabled: state.numericRightAlignmentEnabled
    });

    sendCommand({
      type: "preferences.clearApiKey",
      requestId: createRequestId()
    });
  }

  function handleExportPreferences() {
    const payload = {
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences,
      themePreference: state.themePreference,
      numericRightAlignmentEnabled: state.numericRightAlignmentEnabled
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pi-harness-preferences.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportPreferences(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<{
        providerBrand: ProviderBrand;
        debugEnabled: boolean;
        tracePanelDefaultOpen: boolean;
        subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees";
        blockChatOnDirtyGitDefault: boolean;
        dirtyGitChangeLimitDefault: number;
        autoCompactContextThresholdPercentDefault: number;
        planExecutionModeDefault: "countdown" | "approve" | "immediate";
        planExecutionDelaySecondsDefault: number;
        singleAgentModelPreferenceDefault: RunModelPreference;
        subagentModelPreferenceDefault: RunModelPreference;
        correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean";
        backgroundJobApprovalPolicyDefault: "allow-all" | "allow-safe" | "ask-risky" | "always-ask";
        assistantAutoApproveNonBlockingQuestionsDefault: boolean;
        assistantCongestionControlEnabledDefault: boolean;
        assistantMaxCongestionDefault: number;
        maxBackgroundJobsDefault: number;
        autoArchiveCompletedThreadsDefault: boolean;
        backgroundJobNotificationsEnabled: boolean;
        memoryBankEnabledDefault: boolean;
        memoryBankRecordRunsDefault: boolean;
        checkCliUpdatesDefault: boolean;
        selectedReasoningStrength: ComposerReasoningStrength;
        selectedFastMode: boolean;
        appHotkeyPreferences: unknown;
        themePreference: unknown;
        numericRightAlignmentEnabled: boolean;
      }>;
      const importedThemePreference = parsed.themePreference === undefined
        ? state.themePreference
        : normalizeThemePreference(parsed.themePreference);

      store.commitLocalPreferences({
        providerBrand: parsed.providerBrand,
        debugEnabled: parsed.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: parsed.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault: parsed.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: parsed.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: parsed.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault: parsed.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault: parsed.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault: parsed.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault: parsed.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault: parsed.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: parsed.checkCliUpdatesDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(parsed.appHotkeyPreferences),
        themePreference: importedThemePreference,
        numericRightAlignmentEnabled: parsed.numericRightAlignmentEnabled
      });
      persistMergedLocalPreferences({
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
        providerBrand: parsed.providerBrand ?? state.providerBrand,
        debugEnabled: parsed.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          parsed.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault:
          parsed.singleAgentModelPreferenceDefault ?? state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: parsed.subagentModelPreferenceDefault ?? state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          parsed.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault:
          parsed.assistantAutoApproveNonBlockingQuestionsDefault ??
          state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault:
          parsed.assistantCongestionControlEnabledDefault ?? state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault:
          parsed.assistantMaxCongestionDefault ?? state.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault:
          parsed.maxBackgroundJobsDefault ?? state.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault:
          parsed.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: parsed.checkCliUpdatesDefault ?? state.checkCliUpdatesDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode ?? state.selectedFastMode,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(parsed.appHotkeyPreferences ?? state.appHotkeyPreferences),
        themePreference: importedThemePreference,
        numericRightAlignmentEnabled: parsed.numericRightAlignmentEnabled ?? state.numericRightAlignmentEnabled
      });
      pushToast("Preferences imported", "Local defaults updated.");
    } catch (error) {
      pushToast("Import failed", error instanceof Error ? error.message : "Invalid JSON file.", "error");
    } finally {
      input.value = "";
    }
  }

  function handleSaveWorkspaceContext() {
    sendCommand({
      type: "workspace.context.save",
      requestId: createRequestId(),
      payload: {
        rulesContent: workspaceRuleDraft() || undefined,
        memorySummaryContent: workspaceMemoryDraft() || undefined
      }
    });
    pushToast("Workspace context saved", "Rules and workspace memory updated.");
  }

  function handleResetPanelSizes() {
    store.resetMainPanelSizes();
    pushToast("Panel sizes reset", "Main panel widths restored to defaults.");
  }

  function handleTestProvider(provider: ProviderConnectionProvider, apiKey: string) {
    store.beginProviderConnectionTest(provider);
    sendCommand({
      type: "preferences.testProviderConnection",
      requestId: createRequestId(),
      payload: {
        provider,
        apiKey: apiKey.trim() || undefined
      }
    });
  }

  function keyStatus(provider: ProviderConnectionProvider) {
    const test = state.providerConnectionTests[provider];
    if (test.status === "pending") {
      return "Testing";
    }
    if (test.status === "ready") {
      return "Ready";
    }
    if (test.status === "failed") {
      return "Failed";
    }
    if (provider === "openai" && state.openAiApiKeyDraft.trim()) {
      return state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "google" && state.googleApiKeyDraft.trim()) {
      return state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "anthropic" && state.anthropicApiKeyDraft.trim()) {
      return state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey ? "Stored + draft" : "Draft only";
    }
    if (
      (provider === "openai" && (state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey)) ||
      (provider === "google" && (state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey)) ||
      (provider === "anthropic" && (state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey))
    ) {
      return "Stored";
    }
    return "No key";
  }

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

  function renderToggle(checked: boolean, onInput: (checked: boolean) => void, label: string) {
    return (
      <label class={stylex.attrs(preferenceStyles.inlineFlex, preferenceStyles.minHeight9, preferenceStyles.cursorPointer, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2, preferenceStyles.transition, preferenceStyles.hoverBackgroundSoftAccent).class}>
        <span class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontMedium, preferenceStyles.colorForeground).class}>{label}</span>
        <input
          class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4, preferenceStyles.accentColor).class}
          type="checkbox"
          checked={checked}
          onInput={(event) => updateSavedPreference(() => onInput(event.currentTarget.checked))}
        />
      </label>
    );
  }

  function saveTerminalRendererMode(rendererMode: TerminalPreferences["rendererMode"]) {
    const requestId = createRequestId();
    const preferences = {
      ...terminalStore.state.preferences,
      rendererMode
    };
    terminalStore.applyServerEvent({
      type: "terminal.preferences.saved",
      requestId,
      payload: {
        preferences,
        layout: terminalStore.state.layout
      }
    });
    sendCommand({
      type: "terminal.preferences.save",
      requestId,
      payload: {
        preferences,
        layout: terminalStore.state.layout
      }
    });
  }

  function renderSettingControl(title: string, description: string, control: JSX.Element) {
    return (
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap2, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite45, preferenceStyles.padding3, preferenceStyles.mdGridColumnsSetting, preferenceStyles.mdItemsCenter).class}>
        <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
          <div class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{title}</div>
          <div class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.text07, preferenceStyles.leading4, preferenceStyles.colorMuted).class}>{description}</div>
        </div>
        <div class={stylex.attrs(preferenceStyles.minWidth0).class}>{control}</div>
      </div>
    );
  }

  function renderModelPreferenceControl(
    ariaLabel: string,
    value: RunModelPreference,
    onChange: (value: RunModelPreference) => void,
    tooltip: string
  ) {
    return (
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.gap2, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>
          <span class={stylex.attrs(preferenceStyles.truncate).class}>{ariaLabel}</span>
          <Tooltip content={tooltip} side="right">
            <span tabIndex={0} aria-label={`${ariaLabel} help`} class={stylex.attrs(preferenceStyles.inlineFlex, preferenceStyles.cursorHelp, preferenceStyles.colorMuted).class}>
              <HelpCircle class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />
            </span>
          </Tooltip>
        </div>
        <SegmentedControl
          ariaLabel={ariaLabel}
          value={value}
          options={[
            { value: "inference", label: "Inference" },
            { value: "intelligence", label: "Intelligence" }
          ]}
          onChange={(nextValue) => updateSavedPreference(() => onChange(nextValue))}
        />
      </div>
    );
  }

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

  function renderKeybinds() {
    const preferences = () => normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    const filteredSettings = () => {
      const query = keybindSearchQuery().trim().toLowerCase();
      if (!query) {
        return appHotkeySettings;
      }
      return appHotkeySettings.filter((setting) =>
        [setting.label, setting.description, preferences()[setting.id].join(" ")].some((value) =>
          value.toLowerCase().includes(query)
        )
      );
    };

    return (
      <PreferenceSection title="Keybinds" description="Customize app and IDE hotkeys for this browser.">
        <div id="keyboard-shortcuts" tabIndex={-1} class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3, preferenceStyles.borderBottom, preferenceStyles.borderDefault, preferenceStyles.paddingBottom3).class}>
            <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{filteredSettings().length} keybindings</div>
            <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
              <label class={stylex.attrs(preferenceStyles.relative, preferenceStyles.minWidth48, preferenceStyles.flex1).class}>
                <Search class={stylex.attrs(preferenceStyles.pointerEventsNone, preferenceStyles.absolute, preferenceStyles.left3, preferenceStyles.topHalf, preferenceStyles.height35, preferenceStyles.width35, preferenceStyles.translateYHalfNegative, preferenceStyles.colorMuted).class} />
                <Input
                  class={stylex.attrs(preferenceStyles.height9, preferenceStyles.paddingLeft8).class}
                  aria-label="Search keybindings"
                  value={keybindSearchQuery()}
                  placeholder="Search keybindings..."
                  onInput={(event) => setKeybindSearchQuery(event.currentTarget.value)}
                />
              </label>
            </div>
          </div>

          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
            {renderHotkeyGroup("App keybinds", filteredSettings().filter((setting) => setting.scope !== "ide"))}
            {renderHotkeyGroup("IDE keybinds", filteredSettings().filter((setting) => setting.scope === "ide"))}
          </div>

          <div>
            <ActionButton
              tooltip="Restore default keyboard shortcuts"
              variant="secondary"
              icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
              onClick={() => {
                setHotkeyDrafts({ ...DEFAULT_APP_HOTKEY_PREFERENCES });
                for (const setting of appHotkeySettings) {
                  store.setAppHotkeyPreference(setting.id, DEFAULT_APP_HOTKEY_PREFERENCES[setting.id]);
                }
                handleSave();
              }}
            >
              Restore shortcuts
            </ActionButton>
          </div>
        </div>
      </PreferenceSection>
    );
  }

  function renderHotkeyGroup(title: string, settings: typeof appHotkeySettings) {
    const preferences = () => normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    return (
      <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class} data-test-keybind-group={title.toLowerCase().replace(/\s+/g, "-")}>
        <div class={stylex.attrs(preferenceStyles.text062, preferenceStyles.fontSemibold, preferenceStyles.uppercase, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>{title}</div>
        <For each={settings}>
              {(setting) => {
                const draftValue = () => hotkeyDrafts()[setting.id];
                const duplicate = () =>
                  preferences()[setting.id].some((hotkey, hotkeyIndex) =>
                    appHotkeySettings.some((candidate) =>
                      preferences()[candidate.id].some((candidateHotkey, candidateIndex) => {
                        if (candidate.id === setting.id && candidateIndex === hotkeyIndex) {
                          return false;
                        }
                        return chordsMatch(candidateHotkey, hotkey);
                      })
                    )
                  );
                return (
                  <div
                    id={keybindRowElementId(setting.id)}
                    data-test-keybind-row={setting.id}
                    tabIndex={-1}
                    class={stylex.attrs(preferenceStyles.rounded2xl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline4, preferenceStyles.paddingBlock3, preferenceStyles.shadowSm, preferenceStyles.transition, preferenceStyles.hoverBackgroundWhite70).class}
                  >
                    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.itemsCenter, preferenceStyles.gap4, preferenceStyles.mdGridColumnsKeybind).class}>
                      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
                        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
                          <Keyboard class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35, preferenceStyles.shrink0, preferenceStyles.colorMuted).class} />
                          <h4 class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text062, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>{setting.label}</h4>
                          <ActionButton
                            tooltip={setting.description}
                            ariaLabel={`${setting.label} description`}
                            variant="ghost"
                            size="icon"
                            class={stylex.attrs(preferenceStyles.height6, preferenceStyles.width6, preferenceStyles.roundedLg, preferenceStyles.colorMuted).class}
                            icon={<HelpCircle class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                          />
                        </div>
                      </div>
                      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
                        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap25).class}>
                          <For each={draftValue()}>
                            {(hotkey, index) => (
                              <label class={stylex.attrs(preferenceStyles.relative, preferenceStyles.inlineFlex, preferenceStyles.minWidth0, preferenceStyles.roundedXl).class}>
                                <Input
                                  aria-label={`${setting.label} hotkey`}
                                  value={formatHotkeyForDisplay(hotkey)}
                                  placeholder="Press keys..."
                                  class={stylex.attrs(preferenceStyles.height10, preferenceStyles.roundedXl, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite, preferenceStyles.paddingInline4, preferenceStyles.paddingRight8, preferenceStyles.textCenter, preferenceStyles.text072, preferenceStyles.fontSemibold, preferenceStyles.shadowMd).class}
                                  style={{ width: `${Math.max(9, formatHotkeyForDisplay(hotkey).length + 4)}ch`, "min-width": "7.5rem" }}
                                  onKeyDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const chord = formatRecordedChord(event);
                                    updateHotkeyDraft(setting.id, index(), chord);
                                    saveHotkeyPreference(setting.id, index(), chord);
                                  }}
                                  onInput={(event) => updateHotkeyDraft(setting.id, index(), event.currentTarget.value)}
                                  onBlur={(event) => {
                                    if (isValidAppHotkey(event.currentTarget.value)) {
                                      saveHotkeyPreference(setting.id, index(), event.currentTarget.value);
                                    }
                                  }}
                                />
                                <ActionButton
                                  tooltip="Delete keybinding"
                                  ariaLabel={`Delete ${setting.label} keybinding`}
                                  variant="ghost"
                                  size="icon"
                                  class={stylex.attrs(preferenceStyles.absolute, preferenceStyles.rightNegative2, preferenceStyles.topNegative2, preferenceStyles.height5, preferenceStyles.width5, preferenceStyles.roundedFull, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanel, preferenceStyles.padding0, preferenceStyles.shadowSm).class}
                                  icon={<X class={stylex.attrs(preferenceStyles.height3, preferenceStyles.width3).class} />}
                                  onClick={() => deleteHotkeyPreference(setting.id, index())}
                                />
                              </label>
                            )}
                          </For>
                          <ActionButton
                            tooltip={`Add ${setting.label} keybinding`}
                            ariaLabel={`Add ${setting.label} keybinding`}
                            variant="secondary"
                            size="icon"
                            class={stylex.attrs(preferenceStyles.height10, preferenceStyles.width10, preferenceStyles.roundedXl, preferenceStyles.shadowSm).class}
                            icon={<Plus class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                            onClick={() => addHotkeyDraft(setting.id)}
                          />
                        </div>
                      </div>
                      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.justifyEnd, preferenceStyles.gap2).class}>
                        <Show when={duplicate()}>
                          <AlertTriangle class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4, preferenceStyles.colorAmber600).class} />
                        </Show>
                        <div class={stylex.attrs(preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite60, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2, preferenceStyles.text0675, preferenceStyles.fontMedium, preferenceStyles.colorMuted).class}>Always</div>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
      </section>
    );
  }

  function renderIdeSettings() {
    const settings = () => ideStore.state.editorSettings;
    const setSetting = <K extends keyof IdeEditorSettings>(key: K, value: IdeEditorSettings[K]) => {
      ideStore.setEditorSetting(key, value);
    };
    return (
      <PreferenceSection title="IDE Settings" description="IDE behavior and formatting defaults for this browser.">
        <PreferenceRow
          id="ide-editor-settings"
          title="IDE behavior"
          description="Each IDE default is labeled with its effect."
          layout="wide-label"
        >
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
            {renderSettingControl(
              "Auto save",
              "Choose when dirty IDE files save without pressing the save command.",
              <SegmentedControl<IdeAutoSaveMode>
                ariaLabel="Auto save"
                value={settings().autoSave}
                options={[
                  { value: "off", label: "Off" },
                  { value: "afterDelay", label: "After delay" },
                  { value: "onFocusChange", label: "On focus change" }
                ]}
                onChange={(value) => setSetting("autoSave", value)}
              />
            )}
            {renderSettingControl(
              "Word wrap",
              "Wrap long lines in the IDE viewport instead of scrolling horizontally.",
              <SegmentedControl<IdeWordWrapMode>
                ariaLabel="Word wrap"
                value={settings().wordWrap}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" }
                ]}
                onChange={(value) => setSetting("wordWrap", value)}
              />
            )}
            {renderSettingControl(
              "Indent style",
              "Pick whether Tab inserts spaces or tab characters.",
              <SegmentedControl<IdeIndentStyle>
                ariaLabel="Indent style"
                value={settings().insertSpaces}
                options={[
                  { value: "spaces", label: "Spaces" },
                  { value: "tabs", label: "Tabs" }
                ]}
                onChange={(value) => setSetting("insertSpaces", value)}
              />
            )}
            {renderSettingControl(
              "Tab size",
              "Set indentation width for tab stops and inserted spaces.",
              <SegmentedControl<IdeTabSize>
                ariaLabel="Tab size"
                value={settings().tabSize}
                options={[
                  { value: 2, label: "2" },
                  { value: 4, label: "4" }
                ]}
                onChange={(value) => setSetting("tabSize", value)}
              />
            )}
            {renderSettingControl(
              "Format on save",
              "Run available formatting when an editable file is saved.",
              renderToggle(settings().formatOnSave, (value) => setSetting("formatOnSave", value), "Enabled")
            )}
            {renderSettingControl(
              "Breadcrumbs",
              "Show the current file path above the IDE.",
              renderToggle(settings().breadcrumbsEnabled, (value) => setSetting("breadcrumbsEnabled", value), "Enabled")
            )}
            {renderSettingControl(
              "Bracket pair colorization",
              "Use matching colors for nested brackets in code.",
              renderToggle(settings().bracketPairColorization, (value) => setSetting("bracketPairColorization", value), "Enabled")
            )}
            <ActionButton
              tooltip="Restore IDE defaults"
              variant="secondary"
              class={stylex.attrs(preferenceStyles.justifySelfStart).class}
              icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
              onClick={() => {
                for (const [key, value] of Object.entries(DEFAULT_IDE_EDITOR_SETTINGS)) {
                  ideStore.setEditorSetting(key as keyof typeof DEFAULT_IDE_EDITOR_SETTINGS, value as never);
                }
              }}
            >
              Restore IDE defaults
            </ActionButton>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function systemPrefersDark() {
    return typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolvedThemeMode() {
    return resolveThemeMode(state.themePreference, systemPrefersDark());
  }

  function resolvedThemeTokens() {
    return resolveThemeTokens(state.themePreference, systemPrefersDark());
  }

  function customThemeDefinition(): CustomThemeDefinition {
    return state.themePreference.custom ?? createDefaultCustomTheme();
  }

  function themeOptions() {
    return THEME_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description
    }));
  }

  function customBaseThemeOptions() {
    return BUILT_IN_THEMES.map((theme) => ({
      value: theme.id,
      label: theme.label,
      description: theme.description
    }));
  }

  function updateCustomThemeBase(value: string) {
    if (!isBuiltInThemeId(value)) {
      return;
    }
    store.setCustomTheme({
      ...customThemeDefinition(),
      baseThemeId: value
    });
  }

  function updateCustomThemeVariable(variable: ThemeCssVariable, value: string) {
    const currentTokens = resolvedThemeTokens();
    const fontVariable = CUSTOM_THEME_FONT_VARIABLES.some((entry) => entry.variable === variable);
    if (!fontVariable && !normalizeHexColor(value)) {
      pushToast("Invalid theme color", "Use a 3- or 6-digit hex color.", "error");
      return;
    }
    const normalizedValue = fontVariable
      ? normalizeThemeFontInput(variable, value, currentTokens[variable])
      : normalizeThemeColorInput(value, currentTokens[variable]);
    const nextPreference = withCustomThemeToken(
      state.themePreference,
      resolvedThemeMode(),
      variable,
      normalizedValue
    );
    const contrastFailures = validateThemeContrast(resolveThemeTokens(nextPreference, systemPrefersDark()));
    if (contrastFailures.length > 0) {
      const firstFailure = contrastFailures[0];
      pushToast(
        "Theme contrast too low",
        `${firstFailure.label} must stay at least ${firstFailure.minimum}:1.`,
        "error"
      );
      return;
    }
    store.setCustomTheme(nextPreference.custom ?? createDefaultCustomTheme());
  }

  function colorInputValue(variable: ThemeCssVariable) {
    return normalizeThemeColorInput(resolvedThemeTokens()[variable], "#000000");
  }

  const themeModeCycle: ThemeModePreference[] = ["system", "light", "dark"];

  function themeModeLabel(mode: ThemeModePreference) {
    switch (mode) {
      case "system":
        return "System";
      case "light":
        return "Light";
      case "dark":
        return "Dark";
    }
  }

  function nextThemeMode(mode: ThemeModePreference = state.themePreference.mode) {
    const currentIndex = themeModeCycle.indexOf(mode);
    return themeModeCycle[(currentIndex + 1) % themeModeCycle.length] ?? "system";
  }

  function themeModeIcon() {
    switch (state.themePreference.mode) {
      case "system":
        return <Monitor class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />;
      case "light":
        return <Sun class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />;
      case "dark":
        return <Moon class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />;
    }
  }

  function themeModeTooltip() {
    return `Theme mode: ${themeModeLabel(state.themePreference.mode)}. Click for ${themeModeLabel(nextThemeMode()).toLowerCase()} mode.`;
  }

  function cycleThemeMode() {
    store.setThemeMode(nextThemeMode());
    renderDetailRoot();
  }

  function renderThemePreview() {
    const tokens = () => resolvedThemeTokens();
    const swatches = () => [
      { label: "Accent", value: tokens()["--accent"] },
      { label: "Info", value: tokens()["--info"] },
      { label: "Success", value: tokens()["--success"] },
      { label: "Warning", value: tokens()["--warning"] },
      { label: "Danger", value: tokens()["--danger"] }
    ];
    return (
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.padding3, preferenceStyles.textXs).class}>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap2, preferenceStyles.smFlex, preferenceStyles.smItemsCenter, preferenceStyles.smJustifyBetween, preferenceStyles.smGap3).class}>
          <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
            <div class={stylex.attrs(preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>Preview</div>
            <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading4, preferenceStyles.colorMuted).class}>Resolved {resolvedThemeMode()} tokens and theme fonts.</div>
          </div>
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.shrink0, preferenceStyles.itemsCenter, preferenceStyles.gap15).class}>
            <For each={swatches()}>
              {(swatch) => (
                <Tooltip content={swatch.label}>
                  <span
                    class={stylex.attrs(preferenceStyles.height5, preferenceStyles.width5, preferenceStyles.roundedMd, preferenceStyles.border, preferenceStyles.borderDefault).class}
                    style={{ background: swatch.value }}
                  />
                </Tooltip>
              )}
            </For>
          </div>
        </div>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanel, preferenceStyles.padding3).class}>
          <div class={stylex.attrs(preferenceStyles.fontDisplay, preferenceStyles.textSm, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>Workspace typography</div>
          <div class={stylex.attrs(preferenceStyles.text07, preferenceStyles.leading4, preferenceStyles.colorMuted).class}>Panel text, muted metadata, and accent controls stay readable.</div>
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.gap2).class}>
            <span class={stylex.attrs(preferenceStyles.roundedLg, preferenceStyles.backgroundAccent, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.text0675, preferenceStyles.fontSemibold, preferenceStyles.colorAccentForeground).class}>Build</span>
            <span class={stylex.attrs(preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundRow, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.text0675, preferenceStyles.colorForeground).class}>Row surface</span>
          </div>
        </div>
      </div>
    );
  }

  function renderCustomThemeEditor() {
    const custom = () => customThemeDefinition();
    const baseThemeId = () => custom().baseThemeId ?? DEFAULT_CUSTOM_BASE_THEME_ID;
    return (
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanel, preferenceStyles.padding3).class} data-test-custom-theme-editor="">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumnsControl, preferenceStyles.smItemsCenter).class}>
          <DropdownControl
            kind="select"
            ariaLabel="Custom theme base"
            icon={<Palette class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
            size="md"
            class={stylex.attrs(preferenceStyles.widthFull).class}
            value={baseThemeId()}
            options={customBaseThemeOptions()}
            onChange={updateCustomThemeBase}
          />
          <ActionButton
            tooltip="Reset custom theme"
            ariaLabel="Reset custom theme"
            variant="secondary"
            icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
            onClick={() => store.resetCustomTheme()}
          >
            Reset
          </ActionButton>
        </div>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumns2, preferenceStyles.xlGridColumns3).class}>
          <For each={CUSTOM_THEME_COLOR_VARIABLES}>
            {(entry) => (
              <label class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap1, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.padding2).class}>
                <span class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>{entry.label}</span>
                <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
                  <input
                    aria-label={`${entry.label} color`}
                    class={stylex.attrs(preferenceStyles.height8, preferenceStyles.width10, preferenceStyles.shrink0, preferenceStyles.cursorPointer, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundTransparent, preferenceStyles.padding05).class}
                    type="color"
                    value={colorInputValue(entry.variable)}
                    onInput={(event) => updateCustomThemeVariable(entry.variable, event.currentTarget.value)}
                  />
                  <Input
                    aria-label={`${entry.label} hex`}
                    class={stylex.attrs(preferenceStyles.height8, preferenceStyles.minWidth0, preferenceStyles.fontMono, preferenceStyles.text0675).class}
                    value={colorInputValue(entry.variable).toUpperCase()}
                    onChange={(event) => updateCustomThemeVariable(entry.variable, event.currentTarget.value)}
                  />
                </div>
              </label>
            )}
          </For>
        </div>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
          <For each={CUSTOM_THEME_FONT_VARIABLES}>
            {(entry) => (
              <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap1, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.padding2).class}>
                <span class={stylex.attrs(preferenceStyles.flex, preferenceStyles.itemsCenter, preferenceStyles.gap15, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>
                  <Type class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />
                  {entry.label}
                </span>
                <DropdownControl
                  kind="select"
                  ariaLabel={entry.label}
                  icon={<Type class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                  size="md"
                  class={stylex.attrs(preferenceStyles.widthFull).class}
                  value={normalizeThemeFontInput(entry.variable, resolvedThemeTokens()[entry.variable], resolvedThemeTokens()[entry.variable])}
                  options={getCustomThemeFontOptions(entry.variable)}
                  onChange={(value) => updateCustomThemeVariable(entry.variable, value)}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    );
  }

  function renderGeneralUi() {
    return (
      <PreferenceSection title="General & UI" description="Compact workspace defaults with theme and density controls.">
        <PreferenceRow id="appearance-density" title="Appearance and density" description="Pick a theme, mode, fonts, and optional custom colors.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumnsControl, preferenceStyles.smItemsCenter).class}>
              <DropdownControl
                kind="select"
                ariaLabel="Theme"
                icon={<Palette class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                size="md"
                class={stylex.attrs(preferenceStyles.widthFull).class}
                value={state.themePreference.themeId}
                options={themeOptions()}
                onChange={(value) => {
                  store.setThemeId(value as ThemeId);
                  renderDetailRoot();
                }}
              />
              <ActionButton
                tooltip={themeModeTooltip()}
                ariaLabel={`Theme mode: ${themeModeLabel(state.themePreference.mode)}`}
                variant="secondary"
                class={stylex.attrs(preferenceStyles.height9, preferenceStyles.justifyStart, preferenceStyles.roundedLg, preferenceStyles.paddingInline3).class}
                icon={themeModeIcon()}
                onClick={cycleThemeMode}
              >
                <span class={stylex.attrs(preferenceStyles.minWidth11, preferenceStyles.textLeft).class}>{themeModeLabel(state.themePreference.mode)}</span>
              </ActionButton>
            </div>
            {renderThemePreview()}
            <Show when={state.themePreference.themeId === "custom"}>
              {renderCustomThemeEditor()}
            </Show>
          </div>
        </PreferenceRow>
        <PreferenceRow id="terminal-display" title="Terminal and numeric display" description="Choose terminal rendering and dense numeric alignment defaults.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            {renderSettingControl(
              "Terminal renderer",
              "Solid is the default lightweight renderer; xterm keeps the full emulator path available.",
              <SegmentedControl
                ariaLabel="Terminal renderer"
                value={terminalStore.state.preferences.rendererMode === "solid-prototype" ? "solid" : "xterm"}
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "xterm", label: "xterm" }
                ]}
                onChange={(value) => saveTerminalRendererMode(value === "solid" ? "solid-prototype" : "xterm-webgl")}
              />
            )}
            {renderSettingControl(
              "Numeric alignment",
              "Right-align dense counts and numeric badges for easier scanning.",
              renderToggle(state.numericRightAlignmentEnabled, store.setNumericRightAlignmentEnabled, "Right-align numbers")
            )}
          </div>
        </PreferenceRow>
        <PreferenceRow id="navigation-sidebar" title="Sidebar and layout" description="Restore main panel sizes and choose project sidebar sorting/grouping.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<LayoutPanelLeft class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={handleResetPanelSizes}>
              Restore panel sizes
            </ActionButton>
            <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumns3).class}>
              <DropdownControl
                kind="select"
                ariaLabel="Project sort"
                icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                size="md"
                value={state.projectSidebarPreferences.projectSort}
                options={projectSortOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ projectSort: value as never })}
              />
              <DropdownControl
                kind="select"
                ariaLabel="Thread sort"
                icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                size="md"
                value={state.projectSidebarPreferences.threadSort}
                options={threadSortOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ threadSort: value as never })}
              />
              <DropdownControl
                kind="select"
                ariaLabel="Project grouping"
                icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                size="md"
                value={state.projectSidebarPreferences.grouping}
                options={groupingOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ grouping: value as never })}
              />
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="notifications" title="Notifications" description="Background job alerts and CLI update checks.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
            {renderToggle(state.backgroundJobNotificationsEnabled, store.setBackgroundJobNotificationsEnabled, "Background job notifications")}
            {renderToggle(state.checkCliUpdatesDefault, store.setCheckCliUpdatesDefault, "Check CLI updates")}
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderAiProviders() {
    return (
      <PreferenceSection title="AI & Providers" description="Credentials and composer defaults for AI runs.">
        <PreferenceRow id="provider-keys" title="Provider API keys" description="Keys stay local to this machine; test checks provider model-list access without saving drafts.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
            <PasswordKeyInput
              label="OpenAI API key"
              value={state.openAiApiKeyDraft}
              placeholder="sk-..."
              status={keyStatus("openai")}
              testStatus={state.providerConnectionTests.openai.status}
              testMessage={state.providerConnectionTests.openai.message}
              testMessageId="openai"
              onInput={(value) => updateSavedPreference(() => store.setOpenAiApiKeyDraft(value))}
              onTest={() => handleTestProvider("openai", state.openAiApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Google API key"
              value={state.googleApiKeyDraft}
              placeholder="AIza..."
              status={keyStatus("google")}
              testStatus={state.providerConnectionTests.google.status}
              testMessage={state.providerConnectionTests.google.message}
              testMessageId="google"
              onInput={(value) => updateSavedPreference(() => store.setGoogleApiKeyDraft(value))}
              onTest={() => handleTestProvider("google", state.googleApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Anthropic API key"
              value={state.anthropicApiKeyDraft}
              placeholder="sk-ant-..."
              status={keyStatus("anthropic")}
              testStatus={state.providerConnectionTests.anthropic.status}
              testMessage={state.providerConnectionTests.anthropic.message}
              testMessageId="anthropic"
              onInput={(value) => updateSavedPreference(() => store.setAnthropicApiKeyDraft(value))}
              onTest={() => handleTestProvider("anthropic", state.anthropicApiKeyDraft)}
            />
          </div>
        </PreferenceRow>
        <PreferenceRow id="provider-brand" title="Active provider" description="Provider preference for new chat and model defaults.">
          <SegmentedControl
            ariaLabel="Active provider"
            value={state.providerBrand}
            options={[
              { value: "gpt", label: "GPT" },
              { value: "gemini", label: "Gemini" },
              { value: "claude", label: "Claude" }
            ]}
            onChange={(value) => updateSavedPreference(() => store.setProviderBrand(value))}
          />
        </PreferenceRow>
        <PreferenceRow id="composer-defaults" title="Composer defaults" description="Browser-local defaults for reasoning effort and fast mode.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <SegmentedControl
              ariaLabel="Reasoning effort"
              value={state.selectedReasoningStrength}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setSelectedReasoningStrength(value))}
            />
            {renderToggle(state.selectedFastMode, store.setSelectedFastMode, "Fast mode")}
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderSafetyGuardrails() {
    return (
      <PreferenceSection title="Safety & Guardrails" description="Execution gates, worktree strategy, and run-risk defaults.">
        <PreferenceRow id="plan-gate" title="Planning and approval" description="Choose what happens after an execution plan is ready.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <SegmentedControl
              ariaLabel="Plan gate mode"
              value={state.planExecutionModeDefault}
              options={[
                { value: "countdown", label: "Countdown" },
                { value: "approve", label: "Approve" },
                { value: "immediate", label: "Immediate" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setPlanExecutionModeDefault(value))}
            />
            <Show when={state.planExecutionModeDefault === "countdown"}>
              <RangeControl
                label="Countdown delay"
                min={0}
                max={300}
                suffix="s"
                value={state.planExecutionDelaySecondsDefault}
                onChange={(value) => updateSavedPreference(() => store.setPlanExecutionDelaySecondsDefault(value))}
              />
            </Show>
          </div>
        </PreferenceRow>
        <PreferenceRow id="worktree-git" title="Worktree and git safety" description="Control subagent isolation and dirty working tree guardrails.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <DropdownControl
              kind="select"
              ariaLabel="Select subagent worktree strategy"
              icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
              size="md"
              class={stylex.attrs(preferenceStyles.widthFull).class}
              value={state.subagentWorktreeStrategyDefault}
              options={subagentWorktreeOptions()}
              onChange={(value) =>
                updateSavedPreference(() => store.setSubagentWorktreeStrategyDefault(value as "same-worktree" | "separate-worktrees"))
              }
            />
            {renderToggle(state.blockChatOnDirtyGitDefault, store.setBlockChatOnDirtyGitDefault, "Restrict chat on dirty git")}
            <AdvancedDisclosure title="Advanced git guard" description="Dirty git change limit before chat-triggered runs are refused.">
              <Input
                aria-label="Dirty git change limit"
                type="number"
                min="0"
                max="10000"
                disabled={!state.blockChatOnDirtyGitDefault}
                value={String(state.dirtyGitChangeLimitDefault)}
                onInput={(event) =>
                  updateSavedPreference(() => store.setDirtyGitChangeLimitDefault(Number(event.currentTarget.value) || 0))
                }
              />
            </AdvancedDisclosure>
            <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
              <ActionButton
                tooltip="Delete retained BranchFS workspaces and stop stale interrupted runs"
                icon={<Trash2 class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                size="sm"
                variant="secondary"
                onClick={handleBranchfsCleanup}
              >
                Clean BranchFS
              </ActionButton>
              <Show when={state.branchfsCleanupSummary}>
                {(summary) => (
                  <span class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.colorMuted).class}>
                    {summary().rootsDeleted} roots deleted | {formatBytes(summary().bytesDeleted)} freed
                    {summary().staleRunsStopped ? ` | ${summary().staleRunsStopped} stale runs stopped` : ""}
                  </span>
                )}
              </Show>
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="run-safety" title="Run safety" description="Context compaction and correctness follow-up defaults.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <RangeControl
              label="Auto-compact threshold"
              min={10}
              max={95}
              suffix="%"
              value={state.autoCompactContextThresholdPercentDefault}
              onChange={(value) => updateSavedPreference(() => store.setAutoCompactContextThresholdPercentDefault(value))}
            />
            {renderModelPreferenceControl(
              "Single agent",
              state.singleAgentModelPreferenceDefault,
              store.setSingleAgentModelPreferenceDefault,
              "Controls the main executor when a plan runs without subagents. Inference will cost less and be faster, while Intelligence will be more precise."
            )}
            {renderModelPreferenceControl(
              "Sub agents",
              state.subagentModelPreferenceDefault,
              store.setSubagentModelPreferenceDefault,
              "Controls spawned parallel subagents. Inference will cost less and be faster, while Intelligence will keep subagents closer to the selected execution model and be more precise."
            )}
            <SegmentedControl
              ariaLabel="Correctness iteration"
              value={state.correctnessIterationModeDefault}
              options={[
                { value: "ask-before-iterate", label: "Ask" },
                { value: "auto-once", label: "Auto once" },
                { value: "auto-until-clean", label: "Until clean" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setCorrectnessIterationModeDefault(value))}
            />
            <AdvancedDisclosure title="Context compaction details" description="Pi compacts session context after threshold crossing, then continues with reduced history.">
              <p class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>Lower values compact sooner. Higher values preserve more transcript before compaction.</p>
            </AdvancedDisclosure>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderWorkspaceMemory() {
    return (
      <PreferenceSection title="Workspace & Memory" description="Shared context, memory bank defaults, and archive behavior.">
        <PreferenceRow id="workspace-context" title="Workspace rules and context" description="Shared rules and memory apply before project-specific context.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <label class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
              <span class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontMedium, preferenceStyles.colorForeground).class}>Workspace rules</span>
              <Textarea rows="5" value={workspaceRuleDraft()} onInput={(event) => updateWorkspaceDraft("rules", event.currentTarget.value)} />
            </label>
            <label class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
              <span class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontMedium, preferenceStyles.colorForeground).class}>Workspace memory</span>
              <Textarea rows="5" value={workspaceMemoryDraft()} onInput={(event) => updateWorkspaceDraft("memory", event.currentTarget.value)} />
            </label>
            <ActionButton tooltip="Save workspace context" variant="secondary" icon={<Save class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={handleSaveWorkspaceContext}>
              Save workspace context
            </ActionButton>
          </div>
        </PreferenceRow>
        <PreferenceRow id="memory-bank" title="Memory bank settings" description="Inject active memories and record compact run memories.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
            {renderToggle(state.memoryBankEnabledDefault, store.setMemoryBankEnabledDefault, "Use memory bank in runs")}
            {renderToggle(state.memoryBankRecordRunsDefault, store.setMemoryBankRecordRunsDefault, "Record run memories")}
          </div>
        </PreferenceRow>
        <PreferenceRow id="auto-archive" title="Auto-archive preferences" description="Default behavior for completed threads.">
          {renderToggle(state.autoArchiveCompletedThreadsDefault, store.setAutoArchiveCompletedThreadsDefault, "Auto-archive completed threads")}
        </PreferenceRow>
        <ModeEditorPanel
          title="Workspace custom modes"
          scope="workspace"
          modes={workspaceModes()}
          onSave={(mode) =>
            sendCommand({
              type: "mode.save",
              requestId: createRequestId(),
              payload: {
                scope: "workspace",
                mode
              }
            })
          }
          onDelete={(modeId) =>
            sendCommand({
              type: "mode.delete",
              requestId: createRequestId(),
              payload: {
                scope: "workspace",
                modeId
              }
            })
          }
        />
      </PreferenceSection>
    );
  }

  function updateWorkspaceDraft(kind: "rules" | "memory", value: string) {
    store.applyServerEvent({
      type: "workspace.updated",
      requestId: kind === "rules" ? "local-workspace-rules" : "local-workspace-memory",
      payload: {
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects,
          workspaceModes: state.workspace.workspaceModes ?? [],
          workspaceRuleSource:
            kind === "rules"
              ? value.trim()
                ? {
                    id: "workspace-rules",
                    scope: "workspace",
                    label: "Workspace rules",
                    content: value,
                    updatedAt: new Date().toISOString()
                  }
                : undefined
              : state.workspace.workspaceRuleSource,
          workspaceMemorySummary:
            kind === "memory"
              ? value.trim()
                ? {
                    id: "workspace-memory",
                    scope: "workspace",
                    label: "Workspace memory",
                    content: value,
                    updatedAt: new Date().toISOString(),
                    source: "user"
                  }
                : undefined
              : state.workspace.workspaceMemorySummary,
          activeProjectId: state.workspace.activeProjectId
        }
      }
    });
  }

  function renderBackgroundJobs() {
    return (
      <PreferenceSection title="Background Jobs" description="Approval policy, capacity, notifications, and current jobs pane defaults.">
        <PreferenceRow id="job-defaults" title="Background job defaults" description="Choose approval posture and concurrent capacity for background work.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <SegmentedControl
              ariaLabel="Background approval policy"
              value={state.backgroundJobApprovalPolicyDefault}
              options={[
                { value: "allow-all", label: "Allow all" },
                { value: "allow-safe", label: "Allow safe" },
                { value: "ask-risky", label: "Ask risky" },
                { value: "always-ask", label: "Always ask" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setBackgroundJobApprovalPolicyDefault(value))}
            />
            {renderToggle(
              state.assistantAutoApproveNonBlockingQuestionsDefault,
              store.setAssistantAutoApproveNonBlockingQuestionsDefault,
              "Auto-approve non-blocking questions"
            )}
            {renderToggle(state.backgroundJobNotificationsEnabled, store.setBackgroundJobNotificationsEnabled, "Desktop notifications")}
            <RangeControl
              label="Assistant max congestion"
              value={state.assistantMaxCongestionDefault}
              min={0.25}
              max={3}
              step={0.25}
              suffix="x"
              tooltip="Higher values allow more assistant job load before congestion delays apply, which can lead to jobs running over each other."
              formatValue={(value) => value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
              onChange={(value) => updateSavedPreference(() => store.setAssistantMaxCongestionDefault(value))}
            />
            <RangeControl
              label="Max background jobs"
              value={state.maxBackgroundJobsDefault}
              min={5}
              max={100}
              step={1}
              suffix=" jobs"
              tooltip="Caps concurrently running or queued scheduled background jobs."
              formatValue={(value) => Math.round(value).toString()}
              onChange={(value) => updateSavedPreference(() => store.setMaxBackgroundJobsDefault(value))}
            />
          </div>
        </PreferenceRow>
        <PreferenceRow id="assistant-job-controls" title="Assistant job controls" description="Pause enabled jobs owned by assistants across projects.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
            <ActionButton
              tooltip="Pause every enabled assistant-owned background job"
              disabled={enabledAssistantBackgroundJobCount() === 0}
              disabledReason="No enabled assistant-owned background jobs"
              variant="secondary"
              icon={<CirclePause class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
              ariaLabel="Pause assistant jobs"
              onClick={handlePauseAssistantBackgroundJobs}
            >
              Pause assistant jobs
            </ActionButton>
            <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>
              Enabled assistant jobs: {enabledAssistantBackgroundJobCount()}
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="jobs-view" title="Jobs view and sync state" description="Current jobs pane view preferences saved in this browser.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.textXs, preferenceStyles.colorMuted).class}>
            <div class={stylex.attrs(preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite60, preferenceStyles.padding3, preferenceStyles.colorForeground).class}>Segment: {state.jobsPanePreferences.segment}</div>
            <div>Sort: {state.jobsPanePreferences.jobSort}</div>
            <div>Search: {state.jobsPanePreferences.search || "None"}</div>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderTokenUsageTotal(label: string, value: number, description: string) {
    return (
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap1, preferenceStyles.roundedLg, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2).class}>
        <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>{label}</div>
        <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.textBase, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{formatTokenCount(value)}</div>
        <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text065, preferenceStyles.colorMuted).class}>{description}</div>
      </div>
    );
  }

  function renderTokenUsageScope(label: string, description: string, totals: typeof state.tokenUsage.session) {
    return (
      <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3).class}>
          <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
            <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.textXs, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{label}</div>
            <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{description}</div>
          </div>
          <div class={stylex.attrs(preferenceStyles.shrink0, preferenceStyles.roundedLg, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.text065, preferenceStyles.fontMedium, preferenceStyles.colorMuted).class}>
            {formatTokenCount(totals.events)} updates
          </div>
        </div>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumns2, preferenceStyles.xlGridColumns4).class}>
          {renderTokenUsageTotal("Total", totals.totalTokensIncludingCached, "processed + cached")}
          {renderTokenUsageTotal("Input", totals.inputTokens, "prompt context")}
          {renderTokenUsageTotal("Output", totals.outputTokens, "model response")}
          {renderTokenUsageTotal("Cached", totals.cachedInputTokens, "cache read")}
        </div>
      </section>
    );
  }

  function TokenUsageSection() {
    return (
      <>
        <PreferenceSection title="Usage" description="App session and lifetime token totals, including cached input.">
          <PreferenceRow id="token-usage" title="Token usage" description="Counters update from observed model context events.">
            <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
              {renderTokenUsageScope("Current session", "Since the app server started or usage was reset.", state.tokenUsage.session)}
              {renderTokenUsageScope("Lifetime", "Persisted on the app server until reset.", state.tokenUsage.lifetime)}
              <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
                <ActionButton
                  tooltip="Reset current session and lifetime token usage"
                  variant="secondary"
                  icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
                  ariaLabel="Reset token usage"
                  onClick={() => {
                    store.openTokenUsageResetDialog();
                    renderDetailRoot();
                  }}
                >
                  Reset usage
                </ActionButton>
                <Show when={state.tokenUsage.resetAt}>
                  {(resetAt) => <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>Last reset: {formatShortTimestamp(resetAt())}</div>}
                </Show>
              </div>
            </div>
          </PreferenceRow>
        </PreferenceSection>
        <Dialog
          open={state.tokenUsageResetDialogOpen}
          title="Reset token usage"
          description="This clears current session and lifetime token counters stored by the app server."
          onClose={() => {
            store.closeTokenUsageResetDialog();
            renderDetailRoot();
          }}
          footer={
            <>
              <ActionButton
                tooltip="Cancel token usage reset"
                variant="ghost"
                onClick={() => {
                  store.closeTokenUsageResetDialog();
                  renderDetailRoot();
                }}
              >
                Cancel
              </ActionButton>
              <ActionButton
                tooltip="Confirm token usage reset"
                icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
                onClick={() => {
                  store.resetTokenUsage();
                  pushToast("Token usage reset", "Session and lifetime counters cleared.");
                  renderDetailRoot();
                }}
              >
                Reset usage
              </ActionButton>
            </>
          }
        >
          <p class={stylex.attrs(preferenceStyles.textSm, preferenceStyles.leading6, preferenceStyles.colorMuted).class}>Token counters will start again from the next observed model usage event.</p>
        </Dialog>
      </>
    );
  }

  function renderUsage() {
    return <TokenUsageSection />;
  }

  function renderDeveloperAdvanced() {
    return (
      <PreferenceSection title="Developer & Advanced" description="Developer logging, trace defaults, portability, and reset controls.">
        <PreferenceRow id="logging-trace" title="Logging and trace UI" description="Defaults for developer visibility in new sessions.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
            {renderToggle(state.debugEnabled, store.setDebugEnabled, "Verbose developer logging")}
            {renderToggle(state.tracePanelDefaultOpen, store.setTracePanelDefaultOpen, "Open trace panel by default")}
          </div>
        </PreferenceRow>
        <PreferenceRow id="portable-json" title="Import and export JSON" description="Portable preferences exclude API keys.">
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.gap2).class}>
            <ActionButton tooltip="Export preferences JSON" variant="secondary" icon={<Download class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={handleExportPreferences}>
              Export prefs
            </ActionButton>
            <ActionButton tooltip="Import preferences JSON" variant="secondary" icon={<Import class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={() => importInput?.click()}>
              Import prefs
            </ActionButton>
          </div>
        </PreferenceRow>
        <PreferenceRow id="advanced-reset" title="Advanced reset controls" description="Clear provider keys or reset local layout state.">
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.gap2).class}>
            <ActionButton tooltip="Clear all provider keys" variant="secondary" icon={<Trash2 class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={handleClearApiKey}>
              Clear keys
            </ActionButton>
            <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={handleResetPanelSizes}>
              Reset layout
            </ActionButton>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderSearchResults() {
    return (
      <PreferenceSection title="Search results" description={`${searchResults().length} matching settings`}>
        <Show when={searchResults().length > 0} fallback={<div class={stylex.attrs(preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDashed, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite45, preferenceStyles.padding4, preferenceStyles.textXs, preferenceStyles.colorMuted).class}>No matching settings.</div>}>
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
            <For each={groupedSearchResults()}>
              {(group) => (
                <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
                  <div class={stylex.attrs(preferenceStyles.text07, preferenceStyles.fontSemibold, preferenceStyles.tracking014, preferenceStyles.colorMuted).class}>{group.section.label}</div>
                  <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
                    <For each={group.results}>
                      {(setting) => (
                        <button
                          type="button"
                          class={stylex.attrs(preferenceStyles.cursorPointer, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite60, preferenceStyles.padding3, preferenceStyles.textLeft, preferenceStyles.transition, preferenceStyles.hoverBackgroundWhite80).class}
                          onClick={() => openSearchResult(setting)}
                        >
                          <div class={stylex.attrs(preferenceStyles.textSm, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>
                            <Highlight value={setting.title} query={searchQuery()} />
                          </div>
                          <div class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.textXs, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>
                            <Highlight value={setting.description} query={searchQuery()} />
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        </Show>
      </PreferenceSection>
    );
  }

  function renderSelectedSection() {
    if (searchQuery().trim()) {
      return renderSearchResults();
    }

    switch (selectedSectionId()) {
      case "keybinds":
        return renderKeybinds();
      case "ide-settings":
        return renderIdeSettings();
      case "general-ui":
        return renderGeneralUi();
      case "safety-guardrails":
        return renderSafetyGuardrails();
      case "workspace-memory":
        return renderWorkspaceMemory();
      case "usage":
        return renderUsage();
      case "background-jobs":
        return renderBackgroundJobs();
      case "developer-advanced":
        return renderDeveloperAdvanced();
      default:
        return renderAiProviders();
    }
  }

  function renderDetailRoot() {
    if (!detailContainer) {
      return;
    }
    disposeDetailRoot?.();
    detailContainer.replaceChildren();
    disposeDetailRoot = renderSolidRoot(() => renderSelectedSection(), detailContainer);
  }

  onMount(renderDetailRoot);

  return (
    <section data-test-preferences-panel="" class={stylex.attrs(preferenceStyles.panelShell, preferenceStyles.flex, preferenceStyles.minHeight0, preferenceStyles.flexColumn, preferenceStyles.overflowVisible, preferenceStyles.rounded2xl, preferenceStyles.backgroundPanel, preferenceStyles.lgHeightFull, preferenceStyles.lgOverflowHidden).class}>
      <input ref={importInput} type="file" accept="application/json" class={stylex.attrs(preferenceStyles.hidden).class} onChange={handleImportPreferences} />
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minHeight0, preferenceStyles.flex1, preferenceStyles.overflowVisible, preferenceStyles.lgOverflowHidden).class}>
        <main class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flex1, preferenceStyles.flexColumn, preferenceStyles.backgroundPanel).class}>
          <div ref={detailContainer} class={stylex.attrs(preferenceStyles.minHeight0, preferenceStyles.flex1, preferenceStyles.overflowVisible, preferenceStyles.padding4, preferenceStyles.lgOverflowAuto).class}>
            {renderAiProviders()}
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
                saveHotkeyPreference(pending.id, pending.index, pending.value, true);
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
          <ActionButton tooltip="Import preferences JSON" ariaLabel="Import" variant="ghost" icon={<Import class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={() => importInput?.click()}>
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
    selectSection(section.id as PreferencesActiveSectionId);
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
                  selectSection(section.id as PreferencesActiveSectionId);
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

