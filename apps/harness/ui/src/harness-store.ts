import { getModelCapability, getAvailableReasoningStrengthsForSelection, getSupportsFastModeForSelection, isModelIdForProvider } from "./store/preferences/model-capabilities";
export { getModelCapability, getAvailableReasoningStrengthsForSelection, getSupportsFastModeForSelection, getCapabilityTags } from "./store/preferences/model-capabilities";
import { defaultAgentCatalog } from "@hyperfocus/ai-core/agent-catalog";
import { defaultProviderCapabilities } from "@hyperfocus/ai-core/capabilities";
import { DEFAULT_MODE_ID,resolveModeById,resolveModeCatalog } from "@hyperfocus/ai-core/modes";
import {
createRequestId,executionModelIdSchema,hasUniqueAgentRunChildren,hasValidAgentRunOwnership,
hasValidBrowserApprovalIntegrity,parseClientCommand,
type AgentId,
type AgentOption,
type AgentPlan,
type AgentRuntimeCapability,
type AgentTrace,
type Assistant,
type AssistantDetail,
type BackgroundJob,
type BackgroundJobApprovalPolicy,
type BackgroundJobSchedulePreview,
type BackgroundJobSchedulerStatus,
type BackgroundJobsState,
type BranchfsCleanupSummary,
type ClientCommand,
type CliSession,
type ComposerReasoningStrength,
type ConnectionState,
type ExecutionControlState,
type ExecutionModelId,
type ExecutionPlan,
type ExperimentInspection,
type MemoryEntry,
type MemorySummary,
type ModeDefinition,
type NotificationInboxState,
type PreferencesState,
type ProjectContextUsage,
type ProjectSearchResult,
type ProjectThreadSummary,
type ProviderBrand,
type ProviderCapability,
type RunDiagnosticsWindowDays,
type RunModelPreference,
type RunPreflight,
type ServerEvent,
type SetupState,
type StreamingTailSegment,
type TokenUsageState,
type TokenUsageTotals,
type WorkspaceProjectState,
type WorkspaceRuleSource,
type WorkspaceState
} from "@hyperfocus/ai-core/protocol";
import { isObject as isRecord } from "@hyperfocus/utilities/records";
import { createStore,reconcile,unwrap } from "solid-js/store";
import { getBackgroundJobSourcePatch,getClearPendingBackgroundJobSourcePatch,type PendingBackgroundJobSource } from "./background-job-source-state";
import {
normalizeAppHotkeyPreferences,
type AppHotkeyPreferences
} from "./lib/app-hotkeys";
import { isTutorialGoalSatisfied } from "./lib/tutorial-progress";
import { upsertProjectMemoryEntry } from "./memory/memory-model";
import * as assistantDetails from "./store/assistant-detail-state";
import { shouldAcceptRunLifecycle,shouldAcceptRunPatch,toRunSummary,upsertRunSummary } from "./store/assistant-event-order";
import {
applyAssistantSummaryDelta,hydrateAssistants,hydrateAssistantsForReconnect,rejectAssistantRequests,
resolveMissingReconnectAssistant,resolveReconnectAssistants
} from "./store/assistant-hydration";
import * as assistantRoster from "./store/assistant-roster-state";
import type {
AssistantDetailTab,AssistantRosterSort,AssistantScopeFilter,
ViewAssistantsState
} from "./store/assistant-view-state";
import * as assistantWorkloads from "./store/assistant-workload-pages";
import type { JobsRunFilter } from "./store/background-jobs-pane-state";
import { createJobSaveRequests } from "./store/background-jobs/job-save-requests";
import { boundBackgroundRuns,createBackgroundJobDeletionTombstones,filterDeletedAssistantWorkloadPage,getBackgroundJobsDeletedViewPatch,getBackgroundJobsUpdatedPatch,isDeletedBackgroundRun,type BackgroundJobDeletionTombstones } from "./store/background-workload-cache";
import {
createDefaultMainPanelSizes,
createEmptyBackgroundJobsState,createEmptyNotificationInboxState,createInitialExecutionControlState,
createInitialRunDiagnosticsState,
createInitialSetupState,
type MainPanelSizes,type RunDiagnosticsViewState
} from "./store/initial-runtime-state";
import { createModeSaveRequests } from "./store/modes/mode-save-requests";
import { createPagingUnavailableCallbacks,retryUnavailablePagingItems,type PagingUnavailableItem } from "./store/paging-unavailable-state";
import { createHarnessVisualPreferenceActions } from "./store/preferences/harness-visual-actions";
import {
clampPanelSize,EXPERIENCE_MODE_STORAGE_KEY,isComposerReasoningStrength,parseBooleanStorageValue,parseBoundedDecimalStorageValue,parseBoundedIntegerStorageValue,parseExperienceModeStorageValue,parseProviderBrandStorageValue,parseReasoningStrengthStorageValue,
type HarnessExperienceMode
} from "./store/preferences/local-preference-values";
import { createProviderKeySaves } from "./store/preferences/provider-key-saves";
import { createReadyContinuationRequests,mergeBackgroundJobPage,mergeNotificationPage } from "./store/ready-continuation-state";
import {
applyWorkspacePageEvent,createWorkspacePageRequests,emptyWorkspacePagingStatus,hydratePagedWorkspace,
mergePagedWorkspace,prepareWorkspaceForPageEvent,retainWorkspaceMessageWindow,
type WorkspacePagingStatus
} from "./store/workspace-page-state";
import { applyThemePreference } from "./theme/theme-apply";
import {
DEFAULT_THEME_PREFERENCE,
normalizeThemePreference,
type ThemePreference
} from "./theme/theme-model";
import { pushToast,reportUiError } from "./toast-store";
export { getSelectedAssistant,getVisibleAssistants } from "./assistant-view-selectors";
export type {
AssistantDetailTab,AssistantRosterSort,AssistantScopeFilter,
ViewAssistantsState
} from "./store/assistant-view-state";
export type { AssistantWorkloadPageState } from "./store/assistant-workload-pages";
export {
createDefaultMainPanelSizes,createEmptyBackgroundJobsState,createEmptyNotificationInboxState,createInitialExecutionControlState,
createInitialRunDiagnosticsState,createInitialSetupState,
type MainPanelSizes,type RunDiagnosticsViewState
} from "./store/initial-runtime-state";
export type { HarnessExperienceMode } from "./store/preferences/local-preference-values";
export const OPENAI_API_KEY_STORAGE_KEY = "openai_api_key";
export const GOOGLE_API_KEY_STORAGE_KEY = "google_api_key";
export const ANTHROPIC_API_KEY_STORAGE_KEY = "anthropic_api_key";
export const PROVIDER_BRAND_STORAGE_KEY = "provider_brand";
export const DEBUG_ENABLED_STORAGE_KEY = "debug_enabled";
export const TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY = "trace_panel_default_open";
export const SUBAGENT_WORKTREE_STRATEGY_DEFAULT_STORAGE_KEY = "subagent_worktree_strategy_default";
export const BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_STORAGE_KEY = "block_chat_on_dirty_git_default";
export const DIRTY_GIT_CHANGE_LIMIT_DEFAULT_STORAGE_KEY = "dirty_git_change_limit_default";
export const AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_STORAGE_KEY = "auto_compact_context_threshold_percent_default";
export const PLAN_EXECUTION_MODE_DEFAULT_STORAGE_KEY = "plan_execution_mode_default";
export const PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_STORAGE_KEY = "plan_execution_delay_seconds_default";
export const SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY = "single_agent_model_preference_default";
export const SUBAGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY = "subagent_model_preference_default";
export const CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY = "correctness_iteration_mode_default";
export const BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY = "background_job_approval_policy_default";
export const ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_STORAGE_KEY =
  "assistant_auto_approve_non_blocking_questions_default";
export const ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_STORAGE_KEY = "assistant_congestion_control_enabled_default";
export const ASSISTANT_MAX_CONGESTION_DEFAULT_STORAGE_KEY = "assistant_max_congestion_default";
export const MAX_BACKGROUND_JOBS_DEFAULT_STORAGE_KEY = "max_background_jobs_default";
const AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_STORAGE_KEY = "pi-harness:auto-archive-completed-threads-default:v1";
export const BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY = "background_job_notifications_enabled";
export const MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY = "memory_bank_enabled_default";
export const MEMORY_BANK_RECORD_RUNS_DEFAULT_STORAGE_KEY = "memory_bank_record_runs_default";
export const CHECK_CLI_UPDATES_DEFAULT_STORAGE_KEY = "check_cli_updates_default";
export const COMPOSER_REASONING_STRENGTH_STORAGE_KEY = "composer_reasoning_strength";
export const COMPOSER_FAST_MODE_STORAGE_KEY = "composer_fast_mode";
export const APP_HOTKEY_PREFERENCES_STORAGE_KEY = "pi-harness:app-hotkeys:v1";
export const THEME_PREFERENCE_STORAGE_KEY = "pi-harness:theme-preference:v1";
export const NUMERIC_RIGHT_ALIGNMENT_ENABLED_STORAGE_KEY = "pi-harness:numeric-right-alignment:v1";
export const PREFERENCES_ACTIVE_SECTION_STORAGE_KEY = "pi-harness:preferences-active-section:v1";
export const THREAD_DRAFT_STORAGE_KEY_PREFIX = "pi-harness:thread-draft:v1";
export const TUTORIAL_PROGRESS_STORAGE_KEY = "pi-harness:tutorial-progress:v1";
export const BROWSER_UI_SESSION_STORAGE_KEY = "pi-harness:browser-ui-session:v1";
export const PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY = "pi-harness:project-sidebar-preferences:v1";
export const COMPOSER_REASONING_STRENGTHS = ["low", "medium", "high", "extra-high"] as const;
export const DEFAULT_COMPOSER_REASONING_STRENGTH = COMPOSER_REASONING_STRENGTHS[2];
const MAX_STREAMING_MESSAGE_HEARTBEATS = 2;
const MAX_LIVE_TRACE_HISTORY = 500;
export type HarnessActiveSurface = "chat" | "background-jobs" | "assistants" | "preferences" | "ide";
export type HarnessLeftTab = "projects" | "assistants" | "jobs" | "runs" | "preferences";
export type ChatPaneTab = "chat" | "plan" | "run" | "events" | "memory";
export type ProjectSidebarProjectSort = "last-user-message" | "created-at" | "manual";
export type ProjectSidebarThreadSort = "last-user-message" | "created-at";
export type ProjectSidebarGrouping = "repository" | "repository-path" | "separate";
export type JobsPaneSegment = "jobs" | "inbox" | "health";
export type JobsPaneJobSort = "next-run" | "updated" | "created" | "status" | "risk";
export type JobsPaneRunSort = "urgency" | "updated" | "queued" | "status";
export type JobsJobStateFilter = "all" | BackgroundJobSchedulerStatus | "backoff";
export type TracePanelMode = "closed" | "peek" | "open";

export type ProjectSidebarPreferences = {
  projectSort: ProjectSidebarProjectSort;
  threadSort: ProjectSidebarThreadSort;
  grouping: ProjectSidebarGrouping;
  manualProjectOrder: string[];
  collapsedProjectIds: string[];
};

export type JobsPanePreferences = {
  segment: JobsPaneSegment;
  search: string;
  jobSearch?: string;
  runSearch?: string;
  jobSort: JobsPaneJobSort;
  runSort?: JobsPaneRunSort;
  kind?: BackgroundJob["kind"];
  status?: BackgroundJob["status"];
  jobState?: JobsJobStateFilter;
  risk?: BackgroundJob["riskLevel"];
  selectedJobId?: string;
  selectedRunId?: string;
  selectedNotificationId?: string;
};

export type ProviderConnectionProvider = "openai" | "google" | "anthropic";
export type ProviderConnectionTestState = {
  status: "idle" | "pending" | "ready" | "failed";
  message?: string;
  modelCount?: number;
};
export type PreferencesActiveSectionId =
  | "general-ui"
  | "keybinds"
  | "ide-settings"
  | "ai-providers"
  | "safety-guardrails"
  | "workspace-memory"
  | "usage"
  | "background-jobs"
  | "developer-advanced";

export type BrowserUiSessionState = {
  selectedModeId?: string;
  selectedAgentId?: AgentId;
  selectedExecutionModelId?: ExecutionModelId;
  selectedReasoningStrength?: ComposerReasoningStrength;
  selectedFastMode?: boolean;
  tracePanelMode?: TracePanelMode;
  tracePanelOpen?: boolean;
  activeLeftTab?: HarnessLeftTab;
  mainPanelSizes?: MainPanelSizes;
  lastActiveProjectId?: string;
  lastActiveThreadByProjectId?: Record<string, string>;
  chatPaneTab?: ChatPaneTab;
  assistantPane?: {
    scopeFilter?: AssistantScopeFilter;
    rosterSearch?: string;
    detailSearch?: string;
    runState?: Assistant["runState"];
    bootstrapState?: Assistant["bootstrapState"];
    providerBrand?: Assistant["providerBrand"];
    projectId?: string;
    selectedAssistantId?: string;
    rosterSort?: AssistantRosterSort;
    selectedTab?: AssistantDetailTab;
    selectedLogDetailsId?: string;
  };
  jobsPane?: Partial<JobsPanePreferences> & {
    runFilter?: JobsRunFilter;
  };
};

export type AssistantEditorDraft = {
  source: "create" | "edit";
  assistantId?: string;
  name: string;
  scope: Assistant["scope"];
  projectId?: string;
  description: string;
  personalityPrompt: string;
  jobPrompt: string;
  agentId: Assistant["agentId"];
  providerBrand?: Assistant["providerBrand"];
  modeId?: string;
  executionModelId?: string;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  runState: Assistant["runState"];
  bootstrapState: Assistant["bootstrapState"];
  assetRefsText: string;
};

export type BackgroundJobEditorDraft = {
  source: "create" | "edit" | "promote";
  jobId?: string;
  projectId?: string;
  assistantId?: string;
  automationThreadId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastRunAt?: string;
  lastEnqueuedAt?: string;
  createdFromRunId?: string;
  templateId?: string;
  status?: BackgroundJob["status"];
  lane?: BackgroundJob["lane"];
  kind: BackgroundJob["kind"];
  name: string;
  description: string;
  scheduleInput: string;
  timezone: string;
  aiPrompt: string;
  aiModeId?: string;
  aiExecutionModelId?: string;
  aiReasoningStrength?: ComposerReasoningStrength;
  aiFastMode?: boolean;
  aiPlanExecutionMode?: "countdown" | "approve" | "immediate";
  aiSubagentWorktreeStrategy?: "same-worktree" | "separate-worktrees";
  shellExecutable: string;
  shellArgsText: string;
  shellArgs?: string[];
  shellCwd: string;
  shellEnvRefsText: string;
  shellTimeoutSeconds: number;
  shellNetworkAccess: boolean;
};
export type StreamingHeartbeatMessage = {
  id: string;
  content: string;
  heartbeatCount: number;
  locked: boolean;
  updatedAt: string;
};

export type ThreadLiveTranscriptState = {
  isStreaming: boolean;
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
  streamingHeartbeatMessages: StreamingHeartbeatMessage[];
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  activeRun?: WorkspaceProjectState["activeRun"];
  lastRun?: WorkspaceProjectState["lastRun"];
  runSummaries: WorkspaceProjectState["runSummaries"];
  lastError?: string;
};

export type ViewProjectState = WorkspaceProjectState & {
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
  streamingHeartbeatMessages: StreamingHeartbeatMessage[];
  threadLiveTranscriptById: Record<string, ThreadLiveTranscriptState>;
  draft: string;
  lastError?: string;
  experimentInspection?: ExperimentInspection;
  memoryEntries: MemoryEntry[];
};

export type ViewWorkspaceState = {
  activeProjectId?: string;
  projects: ViewProjectState[];
  projectsNextCursor?: string;
  workspaceModes?: ModeDefinition[];
  workspaceRuleSource?: WorkspaceRuleSource;
  workspaceMemorySummary?: MemorySummary;
};

export type HarnessViewState = {
  sharedAiPreferences?: PreferencesState["sharedAiPreferences"];
  connectionState: ConnectionState;
  connectionError?: string;
  availableAgents: AgentOption[];
  availableSkillPaths: string[];
  agentRuntimes: AgentRuntimeCapability[];
  setup: SetupState;
  workspace: ViewWorkspaceState;
  workspacePaging: WorkspacePagingStatus;
  activeSurface: HarnessActiveSurface;
  activeLeftTab: HarnessLeftTab;
  chatPaneTab: ChatPaneTab;
  projectSidebarPreferences: ProjectSidebarPreferences;
  jobsPanePreferences: JobsPanePreferences;
  jobsRunFilter: JobsRunFilter;
  assistants: ViewAssistantsState;
  backgroundJobs: BackgroundJobsState; backgroundJobDeletionTombstones: BackgroundJobDeletionTombstones; pendingBackgroundJobSource?: PendingBackgroundJobSource;
  runDiagnostics: RunDiagnosticsViewState;
  diagnosticsRefreshVersion: number;
  tokenUsage: TokenUsageState;
  tokenUsageResetDialogOpen: boolean;
  usageDialogOpen?: boolean;
  usageRefreshRequestId?: string;
  usageResetRequestId?: string;
  usageRefreshError?: string;
  usageResetError?: string;
  notifications: NotificationInboxState;
  pagingUnavailableItems: PagingUnavailableItem[];
  executionControl: ExecutionControlState;
  backgroundJobSchedulePreview?: {
    requestId: string;
    preview: BackgroundJobSchedulePreview;
  };
  backgroundJobEditorOpen: boolean;
  backgroundJobEditorDraft?: BackgroundJobEditorDraft;
  backgroundJobDetailsRunId?: string;
  assistantEditorOpen: boolean;
  assistantEditorDraft?: AssistantEditorDraft;
  backgroundJobNotificationsEnabled: boolean;
  projectSwitcherOpen: boolean;
  projectSearchQuery: string;
  projectSearchLoading: boolean;
  projectSearchPendingRequestId?: string;
  projectSearchFilesystemResults: ProjectSearchResult[];
  pendingExecutionModelIds: Record<string, string | undefined>;
  debugEnabled: boolean;
  selectedModeId: string;
  hasGlobalSelectedModeId: boolean;
  selectedAgentId: AgentId;
  hasGlobalSelectedAgentId: boolean;
  selectedExecutionModelId?: ExecutionModelId;
  hasGlobalSelectedExecutionModelId: boolean;
  selectedReasoningStrength: ComposerReasoningStrength;
  hasGlobalSelectedReasoningStrength: boolean;
  selectedFastMode: boolean;
  hasGlobalSelectedFastMode: boolean;
  tracePanelMode: TracePanelMode;
  tracePanelOpen: boolean;
  tracePanelDefaultOpen: boolean;
  hasPersistedTracePanelOpen: boolean;
  mainPanelSizes: MainPanelSizes;
  executionPlanDialogOpen: boolean;
  selectedExecutionPlan?: ExecutionPlan;
  subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees";
  blockChatOnDirtyGitDefault: boolean;
  dirtyGitChangeLimitDefault: number;
  autoCompactContextThresholdPercentDefault: number;
  planExecutionModeDefault: "countdown" | "approve" | "immediate";
  planExecutionDelaySecondsDefault: number;
  singleAgentModelPreferenceDefault: RunModelPreference;
  subagentModelPreferenceDefault: RunModelPreference;
  correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean";
  backgroundJobApprovalPolicyDefault: BackgroundJobApprovalPolicy;
  assistantAutoApproveNonBlockingQuestionsDefault: boolean;
  assistantCongestionControlEnabledDefault: boolean;
  assistantMaxCongestionDefault: number;
  maxBackgroundJobsDefault: number;
  autoArchiveCompletedThreadsDefault: boolean;
  memoryBankEnabledDefault: boolean;
  memoryBankRecordRunsDefault: boolean;
  checkCliUpdatesDefault: boolean;
  appHotkeyPreferences: AppHotkeyPreferences;
  themePreference: ThemePreference;
  numericRightAlignmentEnabled: boolean;
  experienceMode: HarnessExperienceMode;
  attachmentsEnabled: boolean;
  capabilities: ProviderCapability[];
  preferencesModalOpen: boolean;
  preferencesActiveSectionId: PreferencesActiveSectionId;
  preferencesSearchQuery: string;
  helpDialogOpen: boolean;
  ideFileOpenRequest?: {
    id: string;
    path: string;
    line?: number;
    column?: number;
  };
  setupChecklistOpen: boolean;
  activeTutorialId?: string;
  activeTutorialStepIndex: number;
  completedTutorialIds: string[];
  dismissedTutorialIds: string[];
  hasUsableApiKey: boolean;
  hasStoredApiKey: boolean;
  hasUsableOpenAiApiKey: boolean;
  hasStoredOpenAiApiKey: boolean;
  hasUsableGoogleApiKey: boolean;
  hasStoredGoogleApiKey: boolean;
  hasUsableAnthropicApiKey: boolean;
  hasStoredAnthropicApiKey: boolean;
  providerConnectionTests: Record<ProviderConnectionProvider, ProviderConnectionTestState>;
  providerBrand: ProviderBrand;
  openAiApiKeyDraft: string;
  googleApiKeyDraft: string;
  anthropicApiKeyDraft: string;
  apiKeyDirty: boolean;
  hasLocalOpenAiApiKey: boolean;
  hasLocalGoogleApiKey: boolean;
  hasLocalAnthropicApiKey: boolean;
  hasLocalProviderBrandPreference: boolean;
  hasLocalDebugPreference: boolean;
  hasLocalTracePreference: boolean;
  hasLocalSubagentWorktreeStrategyPreference: boolean;
  hasLocalBlockChatOnDirtyGitPreference: boolean;
  hasLocalDirtyGitChangeLimitPreference: boolean;
  hasLocalAutoCompactContextThresholdPercentPreference: boolean;
  hasLocalPlanExecutionModePreference: boolean;
  hasLocalPlanExecutionDelaySecondsPreference: boolean;
  hasLocalSingleAgentModelPreference: boolean;
  hasLocalSubagentModelPreference: boolean;
  hasLocalCorrectnessIterationModePreference: boolean;
  hasLocalBackgroundJobApprovalPolicyPreference: boolean;
  hasLocalAssistantAutoApproveNonBlockingQuestionsPreference: boolean;
  hasLocalAssistantCongestionControlPreference: boolean;
  hasLocalMaxBackgroundJobsPreference: boolean;
  hasLocalAutoArchiveCompletedThreadsPreference: boolean;
  hasLocalMemoryBankEnabledPreference: boolean;
  hasLocalMemoryBankRecordRunsPreference: boolean;
  hasLocalCheckCliUpdatesPreference: boolean;
  lastActiveProjectId?: string;
  lastActiveThreadByProjectId: Record<string, string>;
  projectPreflights: Record<string, { requestId: string; preflight: RunPreflight } | undefined>;
  pendingPreflightCommands: Record<string, ClientCommand | undefined>;
  blockingNonGitPreflight?: {
    requestId: string;
    projectId: string;
    threadId: string;
    preflight: Extract<RunPreflight, { kind: "git-not-repo" }>;
    command?: ClientCommand;
  };
  pendingPreflightRepairKind?: "git-init" | "disable-check";
  cliSessionTerminal: Record<
    string,
    {
      stdout: string;
      stderr: string;
      connected: boolean;
    }
  >;
  branchfsCleanupSummary?: BranchfsCleanupSummary;
};

export type LocalPreferencesState = {
  openAiApiKey?: string;
  googleApiKey?: string;
  anthropicApiKey?: string;
  providerBrand?: ProviderBrand;
  debugEnabled?: boolean;
  tracePanelDefaultOpen?: boolean;
  subagentWorktreeStrategyDefault?: "same-worktree" | "separate-worktrees";
  blockChatOnDirtyGitDefault?: boolean;
  dirtyGitChangeLimitDefault?: number;
  autoCompactContextThresholdPercentDefault?: number;
  planExecutionModeDefault?: "countdown" | "approve" | "immediate";
  planExecutionDelaySecondsDefault?: number;
  singleAgentModelPreferenceDefault?: RunModelPreference;
  subagentModelPreferenceDefault?: RunModelPreference;
  correctnessIterationModeDefault?: "ask-before-iterate" | "auto-once" | "auto-until-clean";
  backgroundJobApprovalPolicyDefault?: BackgroundJobApprovalPolicy;
  assistantAutoApproveNonBlockingQuestionsDefault?: boolean;
  assistantCongestionControlEnabledDefault?: boolean;
  assistantMaxCongestionDefault?: number;
  maxBackgroundJobsDefault?: number;
  autoArchiveCompletedThreadsDefault?: boolean;
  memoryBankEnabledDefault?: boolean;
  memoryBankRecordRunsDefault?: boolean;
  checkCliUpdatesDefault?: boolean;
  backgroundJobNotificationsEnabled?: boolean;
  selectedReasoningStrength?: ComposerReasoningStrength;
  selectedFastMode?: boolean;
  appHotkeyPreferences?: AppHotkeyPreferences;
  themePreference?: ThemePreference;
  numericRightAlignmentEnabled?: boolean;
  experienceMode?: HarnessExperienceMode;
  preferencesActiveSectionId?: PreferencesActiveSectionId;
};

export function createInitialWorkspaceState(): ViewWorkspaceState {
  return {
    activeProjectId: undefined,
    projects: [],
    workspaceModes: [],
    workspaceRuleSource: undefined,
    workspaceMemorySummary: undefined
  };
}

export function createDefaultProjectSidebarPreferences(): ProjectSidebarPreferences {
  return {
    projectSort: "last-user-message",
    threadSort: "last-user-message",
    grouping: "repository",
    manualProjectOrder: [],
    collapsedProjectIds: []
  };
}

export function createDefaultJobsPanePreferences(): JobsPanePreferences {
  return {
    segment: "inbox",
    search: "",
    jobSearch: "",
    runSearch: "",
    jobSort: "next-run",
    runSort: "urgency",
    kind: undefined,
    status: undefined,
    jobState: "all",
    risk: undefined,
    selectedJobId: undefined,
    selectedRunId: undefined,
    selectedNotificationId: undefined
  };
}

export function createEmptyAssistantsState(): ViewAssistantsState {
  return {
    assistants: [],
    threads: [],
    todos: [],
    learnings: [],
    questions: [],
    logs: [],
    assetRefs: [],
    ...assistantWorkloads.createEmptyAssistantWorkloadState(),
    selectedAssistantId: undefined,
    selectedTab: "chat",
    selectedLogDetailsId: undefined,
    scopeFilter: "project",
    rosterSearch: "",
    detailSearch: "",
    runStateFilter: undefined,
    bootstrapStateFilter: undefined,
    providerBrandFilter: undefined,
    projectIdFilter: undefined,
    rosterSort: "updated",
    streamingByAssistantId: {}, provisionalReconnectAssistantIds: [], rosterPage: assistantRoster.createAssistantRosterPageState(),
    ...assistantDetails.createAssistantDetailRequestState()
  };
}

export function createEmptyTokenUsageTotals(overrides: Partial<TokenUsageTotals> = {}): TokenUsageTotals {
  const inputTokens = Math.max(0, Math.round(overrides.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(overrides.outputTokens ?? 0));
  const totalProcessedTokens = Math.max(0, Math.round(overrides.totalProcessedTokens ?? inputTokens + outputTokens));
  const cachedInputTokens = Math.max(0, Math.round(overrides.cachedInputTokens ?? 0));
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalProcessedTokens,
    totalTokensIncludingCached: Math.max(
      0,
      Math.round(overrides.totalTokensIncludingCached ?? totalProcessedTokens + cachedInputTokens)
    ),
    events: Math.max(0, Math.round(overrides.events ?? 0)),
    updatedAt: typeof overrides.updatedAt === "string" && overrides.updatedAt.trim() ? overrides.updatedAt : undefined
  };
}

export function createEmptyTokenUsageState(overrides: Partial<TokenUsageState> = {}): TokenUsageState {
  return {
    session: createEmptyTokenUsageTotals(overrides.session ?? {}),
    lifetime: createEmptyTokenUsageTotals(overrides.lifetime ?? {}),
    codexLimits: overrides.codexLimits,
    sources: overrides.sources,
    resetAt: typeof overrides.resetAt === "string" && overrides.resetAt.trim() ? overrides.resetAt : undefined
  };
}

export function createInitialViewState(): HarnessViewState {
  return {
    connectionState: "disconnected",
    connectionError: undefined,
    availableAgents: [...defaultAgentCatalog],
    availableSkillPaths: [],
    agentRuntimes: [],
    setup: createInitialSetupState(),
    workspace: createInitialWorkspaceState(),
    workspacePaging: emptyWorkspacePagingStatus(),
    activeSurface: "chat",
    activeLeftTab: "projects",
    chatPaneTab: "chat",
    projectSidebarPreferences: createDefaultProjectSidebarPreferences(),
    jobsPanePreferences: createDefaultJobsPanePreferences(),
    jobsRunFilter: "all",
    assistants: createEmptyAssistantsState(),
    backgroundJobs: createEmptyBackgroundJobsState(), backgroundJobDeletionTombstones: createBackgroundJobDeletionTombstones(), pendingBackgroundJobSource: undefined,
    runDiagnostics: createInitialRunDiagnosticsState(),
    diagnosticsRefreshVersion: 0,
    tokenUsage: createEmptyTokenUsageState(),
    tokenUsageResetDialogOpen: false,
    notifications: createEmptyNotificationInboxState(),
    pagingUnavailableItems: [],
    executionControl: createInitialExecutionControlState(),
    backgroundJobSchedulePreview: undefined,
    backgroundJobEditorOpen: false,
    backgroundJobEditorDraft: undefined,
    backgroundJobDetailsRunId: undefined,
    assistantEditorOpen: false,
    assistantEditorDraft: undefined,
    backgroundJobNotificationsEnabled: false,
    projectSwitcherOpen: false,
    projectSearchQuery: "",
    projectSearchLoading: false,
    projectSearchPendingRequestId: undefined,
    projectSearchFilesystemResults: [],
    pendingExecutionModelIds: {},
    debugEnabled: false,
    selectedModeId: DEFAULT_MODE_ID,
    hasGlobalSelectedModeId: false,
    selectedAgentId: "pi",
    hasGlobalSelectedAgentId: false,
    selectedExecutionModelId: undefined,
    hasGlobalSelectedExecutionModelId: false,
    selectedReasoningStrength: DEFAULT_COMPOSER_REASONING_STRENGTH,
    hasGlobalSelectedReasoningStrength: false,
    selectedFastMode: false,
    hasGlobalSelectedFastMode: false,
    tracePanelMode: "open",
    tracePanelOpen: true,
    tracePanelDefaultOpen: true,
    hasPersistedTracePanelOpen: false,
    mainPanelSizes: createDefaultMainPanelSizes(),
    executionPlanDialogOpen: false,
    selectedExecutionPlan: undefined,
    subagentWorktreeStrategyDefault: "same-worktree",
    blockChatOnDirtyGitDefault: true,
    dirtyGitChangeLimitDefault: 20,
    autoCompactContextThresholdPercentDefault: 40,
    planExecutionModeDefault: "countdown",
    planExecutionDelaySecondsDefault: 10,
    singleAgentModelPreferenceDefault: "intelligence",
    subagentModelPreferenceDefault: "inference",
    correctnessIterationModeDefault: "ask-before-iterate",
    backgroundJobApprovalPolicyDefault: "ask-risky",
    assistantAutoApproveNonBlockingQuestionsDefault: true,
    assistantCongestionControlEnabledDefault: true,
    assistantMaxCongestionDefault: 1,
    maxBackgroundJobsDefault: 10,
    autoArchiveCompletedThreadsDefault: false,
    memoryBankEnabledDefault: true,
    memoryBankRecordRunsDefault: false,
    checkCliUpdatesDefault: true,
    appHotkeyPreferences: normalizeAppHotkeyPreferences(undefined),
    themePreference: DEFAULT_THEME_PREFERENCE,
    numericRightAlignmentEnabled: true,
    experienceMode: "advanced",
    attachmentsEnabled: false,
    capabilities: [...defaultProviderCapabilities],
    preferencesModalOpen: false,
    preferencesActiveSectionId: "ai-providers",
    preferencesSearchQuery: "",
    helpDialogOpen: false,
    ideFileOpenRequest: undefined,
    setupChecklistOpen: false,
    activeTutorialId: undefined,
    activeTutorialStepIndex: 0,
    completedTutorialIds: [],
    dismissedTutorialIds: [],
    hasUsableApiKey: false,
    hasStoredApiKey: false,
    hasUsableOpenAiApiKey: false,
    hasStoredOpenAiApiKey: false,
    hasUsableGoogleApiKey: false,
    hasStoredGoogleApiKey: false,
    hasUsableAnthropicApiKey: false,
    hasStoredAnthropicApiKey: false,
    providerConnectionTests: {
      openai: { status: "idle" },
      google: { status: "idle" },
      anthropic: { status: "idle" }
    },
    providerBrand: "gpt",
    openAiApiKeyDraft: "",
    googleApiKeyDraft: "",
    anthropicApiKeyDraft: "",
    apiKeyDirty: false,
    hasLocalOpenAiApiKey: false,
    hasLocalGoogleApiKey: false,
    hasLocalAnthropicApiKey: false,
    hasLocalProviderBrandPreference: false,
    hasLocalDebugPreference: false,
    hasLocalTracePreference: false,
    hasLocalSubagentWorktreeStrategyPreference: false,
    hasLocalBlockChatOnDirtyGitPreference: false,
    hasLocalDirtyGitChangeLimitPreference: false,
    hasLocalAutoCompactContextThresholdPercentPreference: false,
    hasLocalPlanExecutionModePreference: false,
    hasLocalPlanExecutionDelaySecondsPreference: false,
    hasLocalSingleAgentModelPreference: false,
    hasLocalSubagentModelPreference: false,
    hasLocalCorrectnessIterationModePreference: false,
    hasLocalBackgroundJobApprovalPolicyPreference: false,
    hasLocalAssistantAutoApproveNonBlockingQuestionsPreference: false,
    hasLocalAssistantCongestionControlPreference: false,
    hasLocalMaxBackgroundJobsPreference: false,
    hasLocalAutoArchiveCompletedThreadsPreference: false,
    hasLocalMemoryBankEnabledPreference: false,
    hasLocalMemoryBankRecordRunsPreference: false,
    hasLocalCheckCliUpdatesPreference: false,
    lastActiveProjectId: undefined,
    lastActiveThreadByProjectId: {},
    projectPreflights: {},
    pendingPreflightCommands: {},
    blockingNonGitPreflight: undefined,
    pendingPreflightRepairKind: undefined,
    cliSessionTerminal: {},
    branchfsCleanupSummary: undefined
  };
}

export function getActiveProject(state: HarnessViewState) {
  return state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId);
}

export function reduceServerEvent(state: HarnessViewState, event: ServerEvent): HarnessViewState {
  return reduceWorkspaceServerEvent(state, event)
    ?? reduceChatStreamServerEvent(state, event)
    ?? reduceThreadMessageServerEvent(state, event)
    ?? reduceRunAndWorkloadServerEvent(state, event)
    ?? reduceAssistantAndControlServerEvent(state, event)
    ?? state;
}

function reduceWorkspaceServerEvent(
  state: HarnessViewState,
  event: ServerEvent,
): HarnessViewState | undefined {
  switch (event.type) {
    case "connection.ready": {
      const workspace = hydrateWorkspace(event.payload.workspace);
      const assistants = { ...hydrateAssistantsForReconnect(state.assistants, event.payload.assistants),
        jobs: [], runs: [], workloadPagesByAssistantId: {} };
      const backgroundJobs = event.payload.backgroundJobs;
      const notifications = event.payload.notifications;
      const readyState = {
        ...state,
        availableAgents: [...event.payload.agents],
        availableSkillPaths: event.payload.availableSkillPaths ?? [],
        setup: event.payload.setup,
        workspace,
        assistants,
        backgroundJobs,
        backgroundJobDeletionTombstones: createBackgroundJobDeletionTombstones(),
        pendingBackgroundJobSource: undefined,
        notifications,
        executionControl: event.payload.executionControl,
        tokenUsage: event.payload.tokenUsage,
        projectPreflights: {},
        pendingPreflightCommands: {},
        blockingNonGitPreflight: undefined,
        pendingPreflightRepairKind: undefined,
        ...applyReadyPreferencesState(state, event.payload.preferences)
      };
      return {
        ...readyState,
        jobsPanePreferences: normalizeJobsPanePreferences({ ...readyState.jobsPanePreferences,
          selectedJobId: undefined, selectedRunId: undefined }, readyState, true),
        backgroundJobDetailsRunId: undefined
      };
    }
    case "notifications.updated":
    case "cli-updates.checked":
      return {
        ...state,
        notifications: event.payload.notifications
      };
    case "notifications.page.listed":
      return { ...state, notifications: mergeNotificationPage(state.notifications, event) };
    case "usage.updated":
      return {
        ...state,
        tokenUsage: event.payload.tokenUsage,
        tokenUsageResetDialogOpen: state.usageResetRequestId === event.requestId ? false : state.tokenUsageResetDialogOpen,
        usageResetRequestId: state.usageResetRequestId === event.requestId ? undefined : state.usageResetRequestId,
        usageRefreshRequestId: state.usageRefreshRequestId === event.requestId ? undefined : state.usageRefreshRequestId
      };
    case "agent.list":
      return {
        ...state,
        availableAgents: [...event.payload.agents]
      };
    case "agent.runtime.updated":
      return {
        ...state,
        agentRuntimes: [...event.payload.agentRuntimes]
      };
    case "project.opened":
      return {
        ...state,
        availableSkillPaths: event.payload.availableSkillPaths ?? state.availableSkillPaths,
        projectSwitcherOpen: false,
        projectSearchQuery: "",
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: [],
        workspace: {
          ...state.workspace,
          activeProjectId: event.payload.activeProjectId,
          projects: upsertProject(state.workspace.projects, toViewProject(event.payload.project))
        }
      };
    case "project.removed": {
      const deletedAssistantIds = state.assistants.assistants
        .filter((assistant) => assistant.projectId === event.payload.projectId).map((assistant) => assistant.id);
      return {
        ...state,
        workspace: {
          ...state.workspace,
          activeProjectId: event.payload.activeProjectId,
          projects: state.workspace.projects.filter((project) => project.id !== event.payload.projectId)
        },
        assistants: assistantDetails.invalidateAssistantDetails(hydrateAssistants(state.assistants, {
          assistants: assistantRoster.mergeAssistantSummaryDelta(state.assistants.assistants, [], deletedAssistantIds),
          threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: []
        }), deletedAssistantIds)
      };
    }
    case "project.activated":
      return {
        ...state,
        availableSkillPaths: event.payload.availableSkillPaths ?? state.availableSkillPaths,
        projectSwitcherOpen: false,
        projectSearchQuery: "",
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: [],
        workspace: {
          ...state.workspace,
          activeProjectId: event.payload.projectId,
          projects: moveProjectToFront(state.workspace.projects, event.payload.projectId)
        }
      };
    case "project.search.results":
      return applyProjectSearchResultsState(state, event.requestId, event.payload.query, event.payload.results);
    case "workspace.projects.listed":
    case "workspace.projectChildren.listed":
      return { ...state, workspace: applyWorkspacePageEvent(state.workspace, event, toViewProject) };
    case "workspace.updated":
      return {
        ...state,
        workspace: mergeIncomingWorkspace(state.workspace, hydrateWorkspace(event.payload.workspace))
      };
    case "project.updated":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: upsertProject(
            state.workspace.projects,
            mergeIncomingProject(
              state.workspace.projects.find((project) => project.id === event.payload.projectId) ?? toViewProject(event.payload.project),
              toViewProject(event.payload.project)
            )
          )
        }
      };
    case "thread.cleanupArchived": {
      if (event.payload.archivedCount > 0) {
        pushToast("Threads archived", `Archived ${event.payload.archivedCount} old thread${event.payload.archivedCount === 1 ? "" : "s"}.`);
      } else {
        pushToast("No old threads matched", "No old threads matched this cleanup.", "info");
      }
      const incomingById = new Map(event.payload.projects.map((project) => [project.projectId, toViewProject(project.project)]));
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects.map((project) => {
            const incoming = incomingById.get(project.id);
            return incoming ? mergeIncomingProject(project, incoming) : project;
          })
        }
      };
    }
    case "thread.created":
    case "thread.activated":
      return {
        ...updateProjectState(state, event.payload.projectId, (project) =>
          mergeIncomingProject(project, toViewProject(event.payload.project))
        ),
        executionPlanDialogOpen: false,
        selectedExecutionPlan: undefined
      };
    case "thread.renamed":
    case "thread.pinned":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        threads: project.threads.map((thread) => (thread.id === event.payload.thread.id ? event.payload.thread : thread))
      }));
    case "agent.plan":
      return updateProjectState(state, event.payload.projectId, (project) =>
        applyThreadLiveTranscriptState(
          {
            ...project,
            latestPlan: project.activeThreadId === event.payload.threadId ? event.payload.plan : project.latestPlan,
            threads: setThreadBadge(project.threads, event.payload.threadId, "planning")
          },
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...(project.threadLiveTranscriptById[event.payload.threadId] ??
              (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined)),
            latestPlan: event.payload.plan,
            isStreaming: project.activeThreadId === event.payload.threadId ? project.session.isStreaming : false
          })
        )
      );
    case "agent.trace":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          project,
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            traces: [...(priorLiveTranscript?.traces ?? []), event.payload.trace]
          })
        );
      });
    default:
      return undefined;
  }
}

function reduceChatStreamServerEvent(
  state: HarnessViewState,
  event: ServerEvent,
): HarnessViewState | undefined {
  switch (event.type) {
    case "chat.delta":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const targetThreadId = event.payload.sessionId;
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, targetThreadId, "executing")
          },
          targetThreadId,
          createThreadLiveTranscriptState({
            ...(project.threadLiveTranscriptById[targetThreadId] ??
              (project.activeThreadId === targetThreadId
                ? getActiveThreadLiveTranscriptState(project)
                : undefined)),
            isStreaming: true,
            streamingAssistantText: `${
              (project.threadLiveTranscriptById[targetThreadId]?.streamingAssistantText ??
                (project.activeThreadId === targetThreadId ? project.streamingAssistantText : ""))
            }${event.payload.delta}`,
            lastError: undefined
          })
        );
      });
    case "chat.streaming-tail-updated":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, event.payload.threadId, "executing"),
            session:
              project.activeThreadId === event.payload.threadId
                ? {
                  ...(event.payload.state ?? project.session),
                  isStreaming: true,
                  lastError: undefined
                }
                : project.session
          },
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            isStreaming: true,
            streamingTailSegments: event.payload.segments,
            streamingHeartbeatMessages: rolloverStreamingHeartbeatMessages(
              priorLiveTranscript?.streamingHeartbeatMessages ?? [],
              event.payload.runId,
              renderStreamingStatusTailSegments(event.payload.segments),
              getLatestStreamingTailTimestamp(event.payload.segments)
            ),
            lastError: undefined
          })
        );
      });
    case "chat.complete":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: updateThreadSummaryFromMessage(
              setThreadBadge(project.threads, event.payload.threadId, "done"),
              event.payload.threadId,
              event.payload.assistantMessage
            ),
            session:
              project.activeThreadId === event.payload.threadId
                ? {
                  ...event.payload.state,
                  isStreaming: false,
                  lastError: undefined
                }
                : project.session
          },
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            isStreaming: false,
            streamingAssistantText: "",
            streamingTailSegments: [],
            streamingHeartbeatMessages: [],
            lastError: undefined
          })
        );
      });
    case "chat.message-appended":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        lastError: project.activeThreadId === event.payload.threadId ? undefined : project.lastError,
        threads: updateThreadSummaryFromAppendedEvent(
          project.threads,
          event.payload.threadId,
          event.payload.message,
          event.payload.thread
        ),
        session:
          project.activeThreadId === event.payload.threadId
            ? {
              ...event.payload.state,
              lastError: event.payload.state.lastError
            }
            : project.session
      }));
    case "chat.message-updated":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        lastError: project.activeThreadId === event.payload.threadId ? undefined : project.lastError,
        threads: updateThreadSummaryFromUpdatedMessage(project.threads, event.payload.threadId, event.payload.message),
        session:
          project.activeThreadId === event.payload.threadId
            ? {
              ...event.payload.state,
              lastError: event.payload.state.lastError
            }
            : project.session
      }));
    default:
      return undefined;
  }
}

function reduceThreadMessageServerEvent(
  state: HarnessViewState,
  event: ServerEvent,
): HarnessViewState | undefined {
  switch (event.type) {
    case "thread.message-appended":
      return updateProjectState(state, event.payload.projectId, (project) =>
        applyThreadLiveTranscriptState(
          {
            ...project,
            lastError: project.activeThreadId === event.payload.threadId ? undefined : project.lastError,
            threads: updateThreadSummaryFromAppendedEvent(
              project.threads,
              event.payload.threadId,
              event.payload.message,
              event.payload.thread
            ),
            session:
              project.activeThreadId === event.payload.threadId
                ? {
                  ...event.payload.state,
                  lastError: event.payload.state.lastError
                }
                : project.session
          },
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...(project.threadLiveTranscriptById[event.payload.threadId] ??
              (project.activeThreadId === event.payload.threadId
                ? getActiveThreadLiveTranscriptState(project)
                : undefined)),
            isStreaming: event.payload.state.isStreaming,
            streamingAssistantText: event.payload.state.isStreaming
              ? (project.threadLiveTranscriptById[event.payload.threadId]?.streamingAssistantText ??
                (project.activeThreadId === event.payload.threadId ? project.streamingAssistantText : ""))
              : "",
            streamingTailSegments: event.payload.state.isStreaming
              ? (project.threadLiveTranscriptById[event.payload.threadId]?.streamingTailSegments ??
                (project.activeThreadId === event.payload.threadId ? project.streamingTailSegments : []))
              : [],
            streamingHeartbeatMessages: event.payload.state.isStreaming
              ? (project.threadLiveTranscriptById[event.payload.threadId]?.streamingHeartbeatMessages ??
                (project.activeThreadId === event.payload.threadId ? project.streamingHeartbeatMessages : []))
              : [],
            lastError: event.payload.state.lastError
          })
        )
      );
    case "thread.message-updated":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        threads: updateThreadSummaryFromUpdatedMessage(project.threads, event.payload.threadId, event.payload.message),
        session:
          project.activeThreadId === event.payload.threadId
            ? {
              ...project.session,
              messages: project.session.messages.map((message) =>
                message.id === event.payload.message.id ? event.payload.message : message
              )
            }
            : project.session
      }));
    case "chat.error":
      if (!event.payload.projectId) {
        return state;
      }

      if (!event.payload.threadId) {
        return updateProjectState(state, event.payload.projectId, (project) => ({
          ...project,
          lastError: event.payload.detail ?? event.payload.message,
          session: {
            ...project.session,
            isStreaming: false,
            lastError: event.payload.detail ?? event.payload.message
          }
        }));
      }

      const errorThreadId = event.payload.threadId;
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[errorThreadId] ??
          (project.activeThreadId === errorThreadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, errorThreadId, "error"),
            session:
              project.activeThreadId === errorThreadId
                ? {
                  ...project.session,
                  isStreaming: false,
                  lastError: event.payload.detail ?? event.payload.message
                }
                : project.session
          },
          errorThreadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            isStreaming: false,
            streamingAssistantText: "",
            streamingTailSegments: [],
            streamingHeartbeatMessages: [],
            lastError: event.payload.detail ?? event.payload.message
          })
        );
      });
    case "session.reset":
      return {
        ...updateProjectState(state, event.payload.projectId, (project) => ({
          ...project,
          activeThreadId: event.payload.threadId,
          latestPlan: undefined,
          activeRun: undefined,
          lastRun: undefined,
          contextUsage: undefined,
          traces: [],
          streamingAssistantText: "",
          streamingTailSegments: [],
          streamingHeartbeatMessages: [],
          threadLiveTranscriptById: {
            ...filterThreadLiveTranscriptByKnownThreads(project.threadLiveTranscriptById, project.threads),
            [event.payload.threadId]: createThreadLiveTranscriptState()
          },
          lastError: undefined,
          draft: readThreadDraft(event.payload.projectId, event.payload.threadId),
          session: {
            ...event.payload.state,
            isStreaming: false,
            lastError: undefined
          }
        })),
        executionPlanDialogOpen: false,
        selectedExecutionPlan: undefined
      };
    default:
      return undefined;
  }
}

function reduceRunAndWorkloadServerEvent(
  state: HarnessViewState,
  event: ServerEvent,
): HarnessViewState | undefined {
  switch (event.type) {
    case "run.updated": if (event.payload.threadId !== event.payload.run.threadId || !hasValidAgentRunOwnership(event.payload.run) || !hasUniqueAgentRunChildren(event.payload.run) || !hasValidBrowserApprovalIntegrity(event.payload.run)) return state;
      const currentProject = state.workspace.projects.find((project) => project.id === event.payload.projectId);
      const currentThreadState =
        currentProject?.threadLiveTranscriptById[event.payload.threadId] ??
        (currentProject?.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(currentProject) : undefined);
      const latestKnownRunId = currentThreadState?.activeRun?.id ?? currentThreadState?.lastRun?.id;
      if (!shouldAcceptRunLifecycle(currentThreadState?.activeRun ?? currentThreadState?.lastRun, event.payload.run)) return state;
      const resetPlanningTransients =
        event.payload.run.status === "planning" &&
        latestKnownRunId !== undefined &&
        latestKnownRunId !== event.payload.run.id;

      return {
        ...updateProjectState(state, event.payload.projectId, (project) => {
          const appliesToActiveThread = project.activeThreadId === event.payload.threadId;
          const priorLiveTranscript =
            project.threadLiveTranscriptById[event.payload.threadId] ??
            (appliesToActiveThread ? getActiveThreadLiveTranscriptState(project) : undefined);
          const nextLiveTranscript = createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            latestPlan: resetPlanningTransients ? undefined : priorLiveTranscript?.latestPlan,
            contextUsage: resetPlanningTransients ? undefined : priorLiveTranscript?.contextUsage,
            traces: resetPlanningTransients ? [] : priorLiveTranscript?.traces,
            streamingAssistantText: resetPlanningTransients ? "" : priorLiveTranscript?.streamingAssistantText,
            streamingTailSegments: resetPlanningTransients ? [] : priorLiveTranscript?.streamingTailSegments,
            streamingHeartbeatMessages: resetPlanningTransients ? [] : priorLiveTranscript?.streamingHeartbeatMessages,
            lastError: resetPlanningTransients ? undefined : priorLiveTranscript?.lastError,
            activeRun: event.payload.run.status === "completed" ? undefined : event.payload.run,
            lastRun: event.payload.run,
            runSummaries: upsertRunSummary(priorLiveTranscript?.runSummaries ?? [], toRunSummary(event.payload.run))
          });
          return applyThreadLiveTranscriptState(
            {
              ...project,
              threads: setThreadBadge(project.threads, event.payload.threadId, badgeFromRunStatus(event.payload.run.status))
            },
            event.payload.threadId,
            nextLiveTranscript
          );
        }),
        executionPlanDialogOpen: resetPlanningTransients ? false : state.executionPlanDialogOpen,
        selectedExecutionPlan: resetPlanningTransients ? undefined : state.selectedExecutionPlan,
        projectPreflights: {
          ...state.projectPreflights,
          [event.payload.projectId]:
            event.payload.run.status === "planning"
              ? undefined
              : state.projectPreflights[event.payload.projectId]?.requestId === event.requestId
              ? state.projectPreflights[event.payload.projectId]
              : undefined
        },
        diagnosticsRefreshVersion: state.diagnosticsRefreshVersion + 1
      };
    case "run.status-patched":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const appliesToActiveThread = project.activeThreadId === event.payload.threadId;
        const patchRun = (run: typeof project.activeRun) =>
          run?.id === event.payload.runId
            ? {
              ...run,
              status: event.payload.status,
              failureMessage: event.payload.failureMessage,
              failureCategory: event.payload.failureCategory,
              resumable: event.payload.resumable ?? run.resumable,
              retryable: event.payload.retryable ?? run.retryable,
              updatedAt: event.payload.updatedAt,
              completedAt: event.payload.completedAt
            }
            : run;
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (appliesToActiveThread ? getActiveThreadLiveTranscriptState(project) : undefined);
        const current = [priorLiveTranscript?.activeRun, priorLiveTranscript?.lastRun].find((run) => run?.id === event.payload.runId);
        if (!shouldAcceptRunPatch(current, event.payload.updatedAt)) return project;
        const nextLiveTranscript = createThreadLiveTranscriptState({
          ...priorLiveTranscript,
          activeRun: patchRun(priorLiveTranscript?.activeRun),
          lastRun: patchRun(priorLiveTranscript?.lastRun),
          runSummaries: (priorLiveTranscript?.runSummaries ?? []).map((run) =>
            run.id === event.payload.runId
              ? {
                ...run,
                status: event.payload.status,
                failureMessage: event.payload.failureMessage,
                failureCategory: event.payload.failureCategory,
                resumable: event.payload.resumable ?? run.resumable,
                retryable: event.payload.retryable ?? run.retryable,
                updatedAt: event.payload.updatedAt,
                completedAt: event.payload.completedAt
              }
              : run
          )
        });
        return applyThreadLiveTranscriptState(
          {
            ...project,
            threads: setThreadBadge(project.threads, event.payload.threadId, badgeFromRunStatus(event.payload.status))
          },
          event.payload.threadId,
          nextLiveTranscript
        );
      });
    case "experiment.inspected":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        experimentInspection: project.activeThreadId === event.payload.threadId ? event.payload.inspection : project.experimentInspection
      }));
    case "memory.listed":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        memoryEntries: event.payload.entries
      }));
    case "memory.inspected":
      return state;
    case "memory.updated":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects.map((project) => upsertProjectMemoryEntry(project, event.payload.entry))
        }
      };
    case "memory.reordered":
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        memoryEntries: event.payload.entries
      }));
    case "memory.deleted":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects.map((project) => ({
            ...project,
            memoryEntries: project.memoryEntries.filter((entry) => entry.id !== event.payload.memoryEntryId)
          }))
        }
      };
    case "cli-session.started": case "cli-session.updated": case "cli-session.exited": {
      if (event.payload.projectId !== event.payload.session.projectId || event.payload.threadId !== event.payload.session.threadId) return state;
      return updateProjectState(state, event.payload.projectId, (project) => ({
        ...project,
        activeCliSession:
          project.activeThreadId === event.payload.threadId ? event.payload.session : project.activeCliSession,
        cliSessions: upsertCliSession(project.cliSessions ?? [], event.payload.session)
      }));
    }
    case "cli-session.attach-ready":
      return state;
    case "background-jobs.updated": {
      return { ...state,
        ...getBackgroundJobsUpdatedPatch(state, event.payload.backgroundJobs),
        assistants: assistantWorkloads.invalidateLoadedAssistantWorkloadPages(state.assistants),
        diagnosticsRefreshVersion: state.diagnosticsRefreshVersion + 1 };
    }
    case "background-jobs.page.listed":
      return { ...state, backgroundJobs: mergeBackgroundJobPage(state.backgroundJobs, event) };
    case "background-jobs.deleted": return { ...state, ...getBackgroundJobsDeletedViewPatch(state, event.payload) };
    case "execution-control.updated": return { ...state, executionControl: event.payload.executionControl };
    default:
      return undefined;
  }
}

function reduceAssistantAndControlServerEvent(
  state: HarnessViewState,
  event: ServerEvent,
): HarnessViewState | undefined {
  switch (event.type) {
    case "assistants.updated":
      return { ...state, assistants: applyAssistantSummaryDelta(state.assistants, event.payload) };
    case "assistant.summary.listed": {
      const merged = assistantRoster.mergeAssistantRosterPage(state.assistants.assistants,
        state.assistants.rosterPage, event.requestId, event.payload.assistants);
      return merged ? { ...state, assistants: resolveReconnectAssistants(hydrateAssistants({ ...state.assistants, rosterPage: merged.page }, {
        assistants: merged.assistants, threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: []
      }), event.payload.assistants.items.map(({ id }) => id)) } : state;
    }
    case "assistant.detail.loaded":
      if (state.assistants.pendingDetailRequestByAssistantId[event.payload.detail.assistant.id] !== event.requestId) return state;
      return { ...state, assistants: resolveReconnectAssistants(
        mergeAssistantDetail(state.assistants, event.payload.detail), [event.payload.detail.assistant.id]) };
    case "assistant.workloads.listed": return { ...state, assistants: assistantWorkloads.mergeAssistantWorkloadPage(
      state.assistants, event.requestId, filterDeletedAssistantWorkloadPage(event.payload, state.backgroundJobDeletionTombstones)) };
    case "background-job.source.loaded": return { ...state, ...getBackgroundJobSourcePatch(state, event.requestId, event.payload) };
    case "assistant.thread.messages.listed":
    case "assistant.logs.listed":
    case "assistant.todos.listed":
    case "assistant.learnings.listed":
    case "assistant.questions.listed": { const assistants = assistantDetails.reduceAssistantDetailPageEvent(state.assistants, event);
      return assistants === state.assistants ? state : { ...state, assistants }; }
    case "assistant.updated":
      if (!state.assistants.assistants.some((assistant) => assistant.id === event.payload.assistant.id)) return state;
      return {
        ...state,
        assistants: {
          ...state.assistants,
          assistants: upsertById(state.assistants.assistants, event.payload.assistant)
        }
      };
    case "assistant.chat.delta":
    case "assistant.chat.message-appended":
    case "assistant.chat.complete":
    case "assistant.chat.failed": { const assistants = assistantDetails.reduceAssistantLiveChatEvent(state.assistants, event);
      return assistants === state.assistants ? state : { ...state, assistants }; }
    case "assistant.question.updated":
      if (!state.assistants.loadedDetailAssistantIds.includes(event.payload.question.assistantId)) return state;
      return {
        ...state,
        assistants: {
          ...state.assistants,
          questions: upsertById(state.assistants.questions, event.payload.question)
        }
      };
    case "assistant.todo.updated":
      if (!state.assistants.loadedDetailAssistantIds.includes(event.payload.todo.assistantId)) return state;
      return {
        ...state,
        assistants: {
          ...state.assistants,
          todos: upsertById(state.assistants.todos, event.payload.todo)
        }
      };
    case "assistant.log.appended":
      { const assistants = assistantDetails.appendAssistantLiveLog(state.assistants, event.payload.entry);
        return assistants === state.assistants ? state : { ...state, assistants }; }
    case "assistant.created-card":
      return {
        ...state,
        assistants: {
          ...state.assistants,
          selectedAssistantId: event.payload.assistant.id,
          scopeFilter: event.payload.assistant.scope === "global" ? "global" : "project"
        }
      };
    case "background-job-run.updated":
      if (isDeletedBackgroundRun(event.payload.run, state.backgroundJobDeletionTombstones)) return state;
      return {
        ...state,
        backgroundJobs: {
          ...state.backgroundJobs,
          runs: upsertBackgroundJobRun(state.backgroundJobs.runs, event.payload.run, new Set([
            state.jobsPanePreferences.selectedRunId,
            state.backgroundJobDetailsRunId
          ].filter((id): id is string => !!id)))
        },
        assistants: assistantWorkloads.applyLiveAssistantRun(state.assistants, event.payload.run),
        diagnosticsRefreshVersion: state.diagnosticsRefreshVersion + 1
      };
    case "run-diagnostics.inspected":
      return {
        ...state,
        runDiagnostics: {
          loading: false,
          windowDays: event.payload.report.windowDays,
          report: event.payload.report
        }
      };
    case "background-job-schedule.preview":
      return {
        ...state,
        backgroundJobSchedulePreview: {
          requestId: event.requestId,
          preview: event.payload
        }
      };
    case "run.preflight":
      return {
        ...state,
        projectPreflights: {
          ...state.projectPreflights,
          [event.payload.projectId]: {
            requestId: event.requestId,
            preflight: event.payload.preflight
          }
        },
        blockingNonGitPreflight:
          event.payload.preflight.kind === "git-not-repo"
            ? {
                requestId: event.requestId,
                projectId: event.payload.projectId,
                threadId: event.payload.threadId,
                preflight: event.payload.preflight,
                command: state.pendingPreflightCommands[event.requestId]
              }
            : state.blockingNonGitPreflight
      };
    case "project.git.initialized":
      return state;
    case "run.cleared":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          project,
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            activeRun: priorLiveTranscript?.activeRun?.id === event.payload.runId ? undefined : priorLiveTranscript?.activeRun
          })
        );
      });
    case "project.context":
      return updateProjectState(state, event.payload.projectId, (project) => {
        const priorLiveTranscript =
          project.threadLiveTranscriptById[event.payload.threadId] ??
          (project.activeThreadId === event.payload.threadId ? getActiveThreadLiveTranscriptState(project) : undefined);
        return applyThreadLiveTranscriptState(
          project,
          event.payload.threadId,
          createThreadLiveTranscriptState({
            ...priorLiveTranscript,
            contextUsage: event.payload.contextUsage
          })
        );
      });
    case "command.rejected": {
      if (!event.requestId) return state;
      return {
        ...state,
        assistants: rejectAssistantRequests(resolveMissingReconnectAssistant(state.assistants, event.requestId,
          event.payload.message), event.requestId,
          event.payload.detail ?? event.payload.message, event.payload.code),
        ...getClearPendingBackgroundJobSourcePatch(state, event.requestId)
      };
    }
    case "bulk-operation.applied": return state;
    case "connection.pong":
      return state;
    case "preferences.saved":
    case "preferences.apiKeyCleared":
      return {
        ...state,
        setup: event.payload.setup,
        ...applyReadyPreferencesState(state, event.payload)
      };
    case "preferences.providerConnectionTested":
      return {
        ...state,
        providerConnectionTests: {
          ...state.providerConnectionTests,
          [event.payload.provider]: {
            status: event.payload.status,
            message: event.payload.message,
            modelCount: event.payload.modelCount
          }
        }
      };
    case "branchfs.cleaned":
      return {
        ...updateProjectState(state, event.payload.projectId, (project) => project),
        branchfsCleanupSummary: event.payload.summary
      };
    case "setup.updated":
      return {
        ...state,
        setup: event.payload.setup
      };
    default:
      return undefined;
  }
}
function applyTokenUsageEvent(
  state: HarnessViewState,
  event: Extract<ServerEvent, { type: "project.context" }>,
  recordedEventKeys: Set<string>
) {
  if (event.payload.tokenUsage) {
    return {
      ...state,
      tokenUsage: event.payload.tokenUsage
    };
  }

  const eventKey = createTokenUsageEventKey(event);
  if (recordedEventKeys.has(eventKey)) {
    return state;
  }

  recordedEventKeys.add(eventKey);
  const delta = createTokenUsageDelta(event.payload.contextUsage);
  if (delta.totalTokensIncludingCached <= 0) {
    return state;
  }

  const tokenUsage = {
    ...state.tokenUsage,
    session: addTokenUsageTotals(state.tokenUsage.session, delta),
    lifetime: addTokenUsageTotals(state.tokenUsage.lifetime, delta)
  };
  return {
    ...state,
    tokenUsage
  };
}

function createTokenUsageEventKey(event: Extract<ServerEvent, { type: "project.context" }>) {
  const usage = event.payload.contextUsage;
  return [
    event.requestId,
    event.payload.projectId,
    event.payload.threadId,
    usage.sourceKind,
    usage.sourceLabel,
    usage.modelId,
    usage.updatedAt,
    usage.tokens ?? "",
    usage.totalProcessedTokens ?? "",
    usage.cachedInputTokens ?? ""
  ].join("|");
}

function createTokenUsageDelta(usage: ProjectContextUsage) {
  const inputTokens = normalizeTokenCount(usage.tokens);
  const totalProcessedTokens = Math.max(inputTokens, normalizeTokenCount(usage.totalProcessedTokens ?? inputTokens));
  const cachedInputTokens = normalizeTokenCount(usage.cachedInputTokens);
  return createEmptyTokenUsageTotals({
    inputTokens,
    outputTokens: Math.max(0, totalProcessedTokens - inputTokens),
    cachedInputTokens,
    totalProcessedTokens,
    totalTokensIncludingCached: totalProcessedTokens + cachedInputTokens,
    events: 1,
    updatedAt: usage.updatedAt
  });
}

function addTokenUsageTotals(left: TokenUsageTotals, right: TokenUsageTotals) {
  return createEmptyTokenUsageTotals({
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    totalProcessedTokens: left.totalProcessedTokens + right.totalProcessedTokens,
    totalTokensIncludingCached: left.totalTokensIncludingCached + right.totalTokensIncludingCached,
    events: left.events + right.events,
    updatedAt: [left.updatedAt, right.updatedAt].filter(Boolean).sort().at(-1)
  });
}
function createHarnessStoreContext() {
  const [state, setState] = createStore(createInitialViewState());
  const providerKeySaves = createProviderKeySaves(), modeSaves = createModeSaveRequests(), jobSaves = createJobSaveRequests();
  let commandDispatcher: ((command: ClientCommand) => void) | undefined, assistantDetailDemandCount = 0;
  const recordedTokenUsageEventKeys = new Set<string>();
  const persistBrowserUiStateIfChanged = (previousSnapshot: BrowserUiSessionState, nextState: HarnessViewState) => {
    const nextSnapshot = getBrowserUiSessionSnapshot(nextState);
    if (JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot)) persistBrowserUiSession(nextSnapshot);
  };
  const setThemePreferenceState = (themePreference: ThemePreference) => {
    const normalized = normalizeThemePreference(themePreference);
    setState({ themePreference: normalized });
    persistMergedLocalPreferences({ themePreference: normalized });
    applyThemePreference(normalized);
  };
  const commitBrowserUiState = (nextState: HarnessViewState) => {
    const previousSnapshot = getBrowserUiSessionSnapshot(state);
    const finalizedState = finalizeHarnessViewState(nextState);
    setState(reconcile(finalizedState));
    persistBrowserUiStateIfChanged(previousSnapshot, finalizedState);
  };
  const sendCommand = (command: ClientCommand) => {
    if (!commandDispatcher) {
      pushToast("Connection unavailable", "Wait for workspace connection before sending commands.", "error");
      reportUiError(new Error("Command dispatcher unavailable"), "Command send failed", { rethrow: "dev-only" });
      return false;
    }
    try {
      if (isPreflightCapableCommand(command)) setState("pendingPreflightCommands", { ...state.pendingPreflightCommands, [command.requestId]: command });
      providerKeySaves.track(command);
      commandDispatcher(command);
      return true;
    } catch (error) {
      providerKeySaves.reset();
      if (isPreflightCapableCommand(command)) setState("pendingPreflightCommands", command.requestId, undefined);
      pushToast("Command failed", error instanceof Error ? error.message : "Command send failed.", "error");
      reportUiError(error, "Command send failed", { rethrow: "dev-only" });
      return false;
    }
  };
  const pagingUnavailable = createPagingUnavailableCallbacks({
    get: () => state.pagingUnavailableItems,
    set: (items) => setState("pagingUnavailableItems", items),
    notify: (collection, count) => pushToast(
      "Hydration item unavailable",
      `${count} ${collection} item could not be loaded because its detail exceeds the transport limit.`,
      "error",
    ),
  });
  const workspacePages = createWorkspacePageRequests({
    getWorkspace: () => state.workspace,
    sendCommand,
    onStatusChange: (workspacePaging) => setState("workspacePaging", workspacePaging),
    onTerminalError: (message, retry) => pushToast("Workspace hydration incomplete", `${message} Click to retry.`, "error", retry),
    onUnavailable: pagingUnavailable.unavailable,
    onAvailable: pagingUnavailable.available,
    onReconciled: pagingUnavailable.reconciled,
  });
  const readyContinuation = createReadyContinuationRequests({
    sendCommand,
    createRequestId,
    onAssistantCursor(cursor) {
      const requestId = createRequestId();
      setState("assistants", "rosterPage", assistantRoster.startAssistantRosterRequest(
        state.assistants.rosterPage,
        { id: requestId, cursor },
      ));
      if (!sendCommand({
        type: "assistant.summary.list",
        requestId,
        payload: { cursor, limit: assistantRoster.ASSISTANT_ROSTER_PAGE_SIZE },
      })) {
        setState("assistants", "rosterPage", assistantRoster.rejectAssistantRosterRequest(
          state.assistants.rosterPage,
          requestId,
          "Could not request remaining assistants.",
        ));
      }
    },
    onTerminalError: (message, retry) => pushToast("Startup hydration incomplete", `${message} Click to retry.`, "error", retry),
    onUnavailable: pagingUnavailable.unavailableEntries,
    onAvailable: pagingUnavailable.available,
    onReconciled: pagingUnavailable.reconciled,
  });
  const requestSelectedAssistantDetail = () => {
    if (assistantDetailDemandCount === 0) return;
    const assistantId = assistantDetails.getAssistantDetailRequestId(state.assistants);
    if (!assistantId) return;
    const requestId = createRequestId();
    setState("assistants", assistantDetails.startAssistantDetailRequest(state.assistants, assistantId, requestId));
    if (!sendCommand({ type: "assistant.detail.get", requestId, payload: { assistantId } })) {
      setState("assistants", assistantDetails.rejectAssistantDetailRequest(state.assistants, assistantId, requestId));
    }
  };
  const registerAssistantDetailDemand = () => {
    assistantDetailDemandCount += 1;
    let active = true;
    return () => {
      if (active) assistantDetailDemandCount -= 1;
      active = false;
    };
  };
  return {
    state, setState, providerKeySaves, modeSaves, jobSaves, recordedTokenUsageEventKeys, persistBrowserUiStateIfChanged, setThemePreferenceState,
    commitBrowserUiState, normalizeMainPanelSizes, sendCommand, pagingUnavailable, workspacePages, readyContinuation, requestSelectedAssistantDetail, registerAssistantDetailDemand,
    setCommandDispatcher: (dispatcher?: (command: ClientCommand) => void) => { if (!dispatcher) { modeSaves.cancel(); jobSaves.cancel(); } commandDispatcher = dispatcher; },
    hasCommandDispatcher: () => Boolean(commandDispatcher),
  };
}
type HarnessStoreFactoryContext = ReturnType<typeof createHarnessStoreContext>;
function createHarnessTransportActions(context: HarnessStoreFactoryContext) {
  const {
    state, setState, persistBrowserUiStateIfChanged, sendCommand, workspacePages, readyContinuation,
    requestSelectedAssistantDetail,
  } = context;
  return {
      setCommandDispatcher(dispatcher?: (command: ClientCommand) => void) { context.setCommandDispatcher(dispatcher); },
      saveMode(command: Extract<ClientCommand, { type: "mode.save" }>) { return context.modeSaves.save(command, sendCommand); },
      saveBackgroundJob(command: Extract<ClientCommand, { type: "background-job.save" }>) { return context.jobSaves.save(command, sendCommand); },
      startAssistantWorkloadRequest(assistantId: string, collection: "jobs" | "runs", request: { id: string; cursor?: string }) {
        setState("assistants", assistantWorkloads.markAssistantWorkloadLoading(state.assistants, assistantId, collection, request));
      },
      startAssistantDetailPageRequest(assistantId: string, collection: assistantDetails.AssistantDetailCollection,
        request: { id: string; cursor?: string }) {
        setState("assistants", assistantDetails.startAssistantDetailPageRequest(state.assistants, assistantId, collection, request));
      },
      startAssistantRosterRequest(request: { id: string; cursor?: string }) {
        setState("assistants", "rosterPage", assistantRoster.startAssistantRosterRequest(state.assistants.rosterPage, request));
      },
      rejectAssistantRosterRequest(requestId: string, error: string) {
        setState("assistants", "rosterPage", assistantRoster.rejectAssistantRosterRequest(state.assistants.rosterPage, requestId, error));
      },
      rejectAssistantDetailPageRequest(requestId: string, error: string) {
        setState("assistants", assistantDetails.rejectAssistantDetailPageRequest(state.assistants, requestId, error));
      },
      rejectAssistantWorkloadRequest(requestId: string, error: string) { setState("assistants", assistantWorkloads.rejectAssistantWorkloadRequest(state.assistants, requestId, error)); },
      startBackgroundJobSourceRequest(request: PendingBackgroundJobSource) { setState("pendingBackgroundJobSource", request); },
      rejectBackgroundJobSourceRequest(requestId: string) { if (state.pendingBackgroundJobSource?.requestId === requestId) setState("pendingBackgroundJobSource", undefined); },
      markAssistantDetailRequestQueued(assistantId: string, requestId: string) { setState("assistants",
        assistantDetails.markAssistantDetailRequestQueued(state.assistants, assistantId, requestId)); },
      restoreQueuedAssistantDetailRequest(assistantId: string, requestId: string) { setState("assistants",
        assistantDetails.restoreQueuedAssistantDetailRequest(state.assistants, assistantId, requestId)); },
      registerAssistantDetailDemand() { return context.registerAssistantDetailDemand(); },
      requestSelectedAssistantDetail,
      retryWorkspaceProjects: () => workspacePages.retryProjects(),
      retryWorkspaceProjectChildren: (projectId: string) => workspacePages.retryChildren(projectId),
      requestEarlierProjectMessages: (projectId: string) => workspacePages.requestMessages(projectId),
      retryUnavailablePaging(items: PagingUnavailableItem[]) {
        retryUnavailablePagingItems(items, { ready: readyContinuation.retryUnavailable,
          workspace: workspacePages.retryUnavailable });
      },
      restoreQueuedPreflightOwnership(command: ClientCommand) { if (isPreflightCapableCommand(command)) setState("pendingPreflightCommands", command.requestId, command); },
      sendCommand,
      hydrateBrowserUiSession() {
        const browserUiSession = readBrowserUiSession();
        const previousSnapshot = browserUiSession;
        const nextState = finalizeHarnessViewState({
          ...state,
          selectedModeId: browserUiSession.selectedModeId ?? state.selectedModeId,
          hasGlobalSelectedModeId: browserUiSession.selectedModeId !== undefined,
          selectedAgentId: browserUiSession.selectedAgentId ?? state.selectedAgentId,
          hasGlobalSelectedAgentId: browserUiSession.selectedAgentId !== undefined,
          selectedExecutionModelId: browserUiSession.selectedExecutionModelId,
          hasGlobalSelectedExecutionModelId: browserUiSession.selectedExecutionModelId !== undefined,
          selectedReasoningStrength: browserUiSession.selectedReasoningStrength ?? state.selectedReasoningStrength,
          hasGlobalSelectedReasoningStrength: browserUiSession.selectedReasoningStrength !== undefined,
          selectedFastMode: browserUiSession.selectedFastMode ?? state.selectedFastMode,
          hasGlobalSelectedFastMode: browserUiSession.selectedFastMode !== undefined,
          activeLeftTab: normalizeLeftTab(browserUiSession.activeLeftTab),
          activeSurface: leftTabToActiveSurface(normalizeLeftTab(browserUiSession.activeLeftTab)),
          mainPanelSizes: normalizeMainPanelSizes(browserUiSession.mainPanelSizes),
          chatPaneTab: normalizeChatPaneTab(browserUiSession.chatPaneTab),
        assistants: {
          ...state.assistants,
          scopeFilter: normalizeAssistantScopeFilter(browserUiSession.assistantPane?.scopeFilter ?? state.assistants.scopeFilter),
          rosterSearch: normalizeSearchText(browserUiSession.assistantPane?.rosterSearch ?? state.assistants.rosterSearch),
          detailSearch: normalizeSearchText(browserUiSession.assistantPane?.detailSearch ?? state.assistants.detailSearch),
          runStateFilter: normalizeAssistantRunStateFilter(browserUiSession.assistantPane?.runState ?? state.assistants.runStateFilter),
          bootstrapStateFilter: normalizeAssistantBootstrapStateFilter(
            browserUiSession.assistantPane?.bootstrapState ?? state.assistants.bootstrapStateFilter
          ),
          providerBrandFilter: normalizeAssistantProviderBrandFilter(
            browserUiSession.assistantPane?.providerBrand ?? state.assistants.providerBrandFilter
          ),
          projectIdFilter: normalizeOptionalStorageString(browserUiSession.assistantPane?.projectId ?? state.assistants.projectIdFilter),
          rosterSort: normalizeAssistantRosterSort(browserUiSession.assistantPane?.rosterSort ?? state.assistants.rosterSort),
          selectedAssistantId: normalizeOptionalStorageString(
            browserUiSession.assistantPane?.selectedAssistantId ?? state.assistants.selectedAssistantId
          ),
            selectedTab: normalizeAssistantDetailTab(browserUiSession.assistantPane?.selectedTab ?? state.assistants.selectedTab),
            selectedLogDetailsId: normalizeOptionalStorageString(
              browserUiSession.assistantPane?.selectedLogDetailsId ?? state.assistants.selectedLogDetailsId
            )
          },
          jobsPanePreferences: normalizeJobsPanePreferences(browserUiSession.jobsPane ?? state.jobsPanePreferences),
          jobsRunFilter: normalizeJobsRunFilter(browserUiSession.jobsPane?.runFilter ?? state.jobsRunFilter),
          tracePanelMode: browserUiSession.tracePanelMode ?? state.tracePanelMode,
          tracePanelOpen: (browserUiSession.tracePanelMode ?? state.tracePanelMode) !== "closed",
          hasPersistedTracePanelOpen: browserUiSession.tracePanelMode !== undefined,
          lastActiveProjectId: browserUiSession.lastActiveProjectId,
          lastActiveThreadByProjectId: { ...(browserUiSession.lastActiveThreadByProjectId ?? {}) }
        });
        setState(reconcile(nextState));
        persistBrowserUiStateIfChanged(previousSnapshot, nextState);
        return browserUiSession;
      },
      persistBrowserUiSession() {
        persistBrowserUiSession(getBrowserUiSessionSnapshot(state));
      },
      startRunDiagnosticsRequest(windowDays: RunDiagnosticsWindowDays) {
        setState({
          runDiagnostics: {
            loading: true,
            windowDays,
            report:
              state.runDiagnostics.report?.windowDays === windowDays
                ? state.runDiagnostics.report
                : undefined
          }
        });
      }
  };
}

function createHarnessConnectionActions(context: HarnessStoreFactoryContext) {
  const { state, setState, persistBrowserUiStateIfChanged, sendCommand, workspacePages, readyContinuation } = context;
  return {
    setConnectionState(connectionState: ConnectionState, connectionError?: string) {
      if (connectionState !== "connected") { workspacePages.reset(); readyContinuation.reset(); context.providerKeySaves.reset(); context.modeSaves.cancel(); context.jobSaves.cancel(); }
      if (connectionState !== "connected") setState({
        usageRefreshError: state.usageRefreshRequestId ? "Connection lost. Refresh after reconnecting." : state.usageRefreshError,
        usageResetError: state.usageResetRequestId ? "Reset was not acknowledged. Refresh usage before retrying." : state.usageResetError,
        usageRefreshRequestId: undefined, usageResetRequestId: undefined
      });
      setState({ connectionState, connectionError, pendingBackgroundJobSource: connectionState === "connected" ? state.pendingBackgroundJobSource : undefined, assistants: connectionState === "connected" ? state.assistants
        : assistantWorkloads.failPendingAssistantWorkloads(state.assistants, connectionError ?? "Connection lost. Retry after reconnecting.") });
    },
    openProjectSwitcher(initialQuery: string = "") {
      setState({
        projectSwitcherOpen: true,
        projectSearchQuery: initialQuery,
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: []
      });
    },
    closeProjectSwitcher() {
      setState({
        projectSwitcherOpen: false,
        projectSearchQuery: "",
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: []
      });
    },
    setProjectSearchQuery(projectSearchQuery: string) {
      setState({ projectSearchQuery });
    },
    startProjectSearch(requestId: string, query: string) {
      setState({
        projectSearchLoading: true,
        projectSearchPendingRequestId: requestId,
        projectSearchQuery: query,
        projectSearchFilesystemResults: []
      });
    },
    applyProjectSearchResults(requestId: string, query: string, results: ProjectSearchResult[]) {
      setState(reconcile(applyProjectSearchResultsState(state, requestId, query, results)));
    },
    clearProjectSearchResults() {
      setState({
        projectSearchLoading: false,
        projectSearchPendingRequestId: undefined,
        projectSearchFilesystemResults: []
      });
    },
    setActiveSurface(activeSurface: HarnessActiveSurface) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const activeLeftTab = activeSurfaceToLeftTab(activeSurface);
      const nextState = finalizeHarnessViewState({ ...state, pendingBackgroundJobSource: undefined, activeSurface, activeLeftTab });
      setState(reconcile(nextState));
      if (JSON.stringify(previousSnapshot) === JSON.stringify(getBrowserUiSessionSnapshot(nextState))) {
        persistBrowserUiSession(getBrowserUiSessionSnapshot(nextState));
      } else {
        persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      }
    },
    setActiveLeftTab(activeLeftTab: HarnessLeftTab) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const previousActiveSurface = state.activeSurface;
      const normalizedTab = normalizeLeftTab(activeLeftTab);
      const nextState = finalizeHarnessViewState({ ...state, pendingBackgroundJobSource: undefined,
        activeLeftTab: normalizedTab, activeSurface: leftTabToActiveSurface(normalizedTab) });
      setState(reconcile(nextState));
      if (JSON.stringify(previousSnapshot) === JSON.stringify(getBrowserUiSessionSnapshot(nextState))) {
        persistBrowserUiSession(getBrowserUiSessionSnapshot(nextState));
      } else {
        persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      }
      if (normalizedTab === "projects" && previousActiveSurface !== "chat" && context.hasCommandDispatcher()) {
        for (const command of getBrowserUiSessionRestoreCommands(nextState, getBrowserUiSessionSnapshot(nextState))) {
          sendCommand(command);
        }
      }
    },
    openIdeFile(path: string, line?: number, column?: number) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const isIdePage = typeof window !== "undefined" && window.location.pathname === "/ide";
      const nextState = finalizeHarnessViewState({
        ...state,
        activeSurface: isIdePage ? "ide" : state.activeSurface,
        ideFileOpenRequest: {
          id: createRequestId(),
          path,
          line,
          column
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setChatPaneTab(chatPaneTab: ChatPaneTab) {
      const currentState: HarnessViewState = unwrap(state);
      const previousSnapshot = getBrowserUiSessionSnapshot(currentState);
      const nextState = finalizeHarnessViewState({
        ...currentState,
        chatPaneTab: normalizeChatPaneTab(chatPaneTab)
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setProjectSidebarPreferences(projectSidebarPreferences: Partial<ProjectSidebarPreferences>) {
      const nextPreferences = normalizeProjectSidebarPreferences(
        {
          ...state.projectSidebarPreferences,
          ...projectSidebarPreferences,
          manualProjectOrder:
            projectSidebarPreferences.manualProjectOrder ?? state.projectSidebarPreferences.manualProjectOrder,
          collapsedProjectIds:
            projectSidebarPreferences.collapsedProjectIds ?? state.projectSidebarPreferences.collapsedProjectIds
        },
        state.workspace.projects.map((project) => project.id)
      );
      setState({ projectSidebarPreferences: nextPreferences });
      persistProjectSidebarPreferences(nextPreferences);
    },
    setJobsPanePreferences(jobsPanePreferences: Partial<JobsPanePreferences>) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        jobsPanePreferences: normalizeJobsPanePreferences({
          ...state.jobsPanePreferences,
          ...jobsPanePreferences
        })
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setJobsRunFilter(jobsRunFilter: JobsRunFilter) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        jobsRunFilter: normalizeJobsRunFilter(jobsRunFilter)
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
  };
}

function createHarnessAssistantPaneActions(context: HarnessStoreFactoryContext) {
  const { state, setState, persistBrowserUiStateIfChanged } = context;
  return {
    setAssistantScopeFilter(scopeFilter: AssistantScopeFilter) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        assistants: {
          ...state.assistants,
          scopeFilter: normalizeAssistantScopeFilter(scopeFilter)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setAssistantPaneFilters(filters: Partial<Pick<ViewAssistantsState, "rosterSearch" | "detailSearch" | "runStateFilter" | "bootstrapStateFilter" | "providerBrandFilter" | "projectIdFilter" | "rosterSort">>) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const hasFilter = (key: keyof typeof filters) => Object.prototype.hasOwnProperty.call(filters, key);
      const nextState = finalizeHarnessViewState({
        ...state, pendingBackgroundJobSource: undefined, assistants: {
          ...state.assistants,
          rosterSearch: normalizeSearchText(hasFilter("rosterSearch") ? filters.rosterSearch : state.assistants.rosterSearch),
          detailSearch: normalizeSearchText(hasFilter("detailSearch") ? filters.detailSearch : state.assistants.detailSearch),
          runStateFilter: normalizeAssistantRunStateFilter(hasFilter("runStateFilter") ? filters.runStateFilter : state.assistants.runStateFilter),
          bootstrapStateFilter: normalizeAssistantBootstrapStateFilter(hasFilter("bootstrapStateFilter") ? filters.bootstrapStateFilter : state.assistants.bootstrapStateFilter),
          providerBrandFilter: normalizeAssistantProviderBrandFilter(hasFilter("providerBrandFilter") ? filters.providerBrandFilter : state.assistants.providerBrandFilter),
          projectIdFilter: normalizeOptionalStorageString(hasFilter("projectIdFilter") ? filters.projectIdFilter : state.assistants.projectIdFilter),
          rosterSort: normalizeAssistantRosterSort(hasFilter("rosterSort") ? filters.rosterSort : state.assistants.rosterSort)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setAssistantDetailTab(selectedTab: AssistantDetailTab) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({ ...state, pendingBackgroundJobSource: undefined,
        assistants: { ...state.assistants, selectedTab: normalizeAssistantDetailTab(selectedTab) } });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setAssistantLogDetailsId(selectedLogDetailsId?: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        assistants: {
          ...state.assistants,
          selectedLogDetailsId: normalizeOptionalStorageString(selectedLogDetailsId)
        }
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedAssistantId(assistantId?: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const selectedAssistantId = normalizeOptionalStorageString(assistantId);
      const nextState = finalizeHarnessViewState({ ...state, pendingBackgroundJobSource: undefined,
        assistants: { ...(selectedAssistantId ? assistantDetails.touchAssistantDetailScope(
          assistantWorkloads.touchAssistantWorkloadScope(state.assistants, selectedAssistantId), selectedAssistantId) : state.assistants), selectedAssistantId } });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    openAssistantEditor(assistantEditorDraft: AssistantEditorDraft) {
      setState({
        assistantEditorOpen: true,
        assistantEditorDraft,
        activeSurface: "assistants",
        activeLeftTab: "assistants"
      });
    },
    closeAssistantEditor() {
      setState({
        assistantEditorOpen: false,
        assistantEditorDraft: undefined
      });
    },
    openBackgroundJobEditor(backgroundJobEditorDraft: BackgroundJobEditorDraft) {
      setState({
        backgroundJobEditorOpen: true,
        backgroundJobEditorDraft,
        activeSurface: "background-jobs",
        activeLeftTab: "jobs"
      });
    },
    closeBackgroundJobEditor() {
      setState({
        backgroundJobEditorOpen: false,
        backgroundJobEditorDraft: undefined,
        backgroundJobSchedulePreview: undefined
      });
    },
    openBackgroundJobDetailsDialog(runId: string) {
      setState({ backgroundJobDetailsRunId: runId });
    },
    closeBackgroundJobDetailsDialog() {
      setState({ backgroundJobDetailsRunId: undefined });
    },
    clearBackgroundJobSchedulePreview() {
      setState({ backgroundJobSchedulePreview: undefined });
    },
    setBackgroundJobNotificationsEnabled(backgroundJobNotificationsEnabled: boolean) {
      setState({ backgroundJobNotificationsEnabled });
    },
  };
}

function createHarnessProjectPreferenceActions(context: HarnessStoreFactoryContext) {
  const { state, setState, persistBrowserUiStateIfChanged } = context;
  return {
    setProjectDraft(projectId: string, draft: string) {
      const project = state.workspace.projects.find((entry) => entry.id === projectId);
      if (!project) {
        return;
      }

      persistThreadDraft(projectId, project.activeThreadId, draft);
      setState(
        "workspace",
        "projects",
        (project) => project.id === projectId,
        "draft",
        draft
      );
    },
    syncProjectDraft(projectId: string, threadId: string) {
      setState(
        "workspace",
        "projects",
        (project) => project.id === projectId,
        "draft",
        readThreadDraft(projectId, threadId)
      );
    },
    setPendingExecutionModelId(projectId: string, modelId?: string) {
      setState("pendingExecutionModelIds", {
        ...state.pendingExecutionModelIds,
        [projectId]: modelId?.trim() ? modelId.trim() : undefined
      });
    },
    clearPendingExecutionModelId(projectId: string) {
      setState("pendingExecutionModelIds", {
        ...state.pendingExecutionModelIds,
        [projectId]: undefined
      });
    },
    setProjectSelectedAgentId(projectId: string, selectedAgentId: AgentOption["id"]) {
      setState(
        "workspace",
        "projects",
        (project) => project.id === projectId,
        "session",
        "selectedAgentId",
        selectedAgentId
      );
    },
    setSelectedModeId(selectedModeId: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedModeId,
        hasGlobalSelectedModeId: true
      });
      setState({
        selectedModeId: nextState.selectedModeId,
        hasGlobalSelectedModeId: nextState.hasGlobalSelectedModeId
      });
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedAgentId(selectedAgentId: AgentId) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedAgentId,
        hasGlobalSelectedAgentId: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedExecutionModelId(selectedExecutionModelId?: string) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const normalizedExecutionModelId = selectedExecutionModelId?.trim();
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedExecutionModelId: parseExecutionModelId(normalizedExecutionModelId),
        hasGlobalSelectedExecutionModelId: Boolean(normalizedExecutionModelId)
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setSelectedReasoningStrength(selectedReasoningStrength: ComposerReasoningStrength) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedReasoningStrength,
        hasGlobalSelectedReasoningStrength: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      persistComposerControlPreferences(nextState);
    },
    setSelectedFastMode(selectedFastMode: boolean) {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        selectedFastMode,
        hasGlobalSelectedFastMode: true
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      persistComposerControlPreferences(nextState);
    },
    appendCliTerminalOutput(sessionId: string, stream: "stdout" | "stderr", text: string) {
      const existing = state.cliSessionTerminal[sessionId] ?? {
        stdout: "",
        stderr: "",
        connected: false
      };
      setState("cliSessionTerminal", {
        ...state.cliSessionTerminal,
        [sessionId]: {
          ...existing,
          [stream]: `${existing[stream]}${text}`.slice(-200_000)
        }
      });
    },
    setCliTerminalConnected(sessionId: string, connected: boolean) {
      const existing = state.cliSessionTerminal[sessionId] ?? {
        stdout: "",
        stderr: "",
        connected: false
      };
      setState("cliSessionTerminal", {
        ...state.cliSessionTerminal,
        [sessionId]: {
          ...existing,
          connected
        }
      });
    },
    resetCliTerminalOutput(sessionId: string) {
      setState("cliSessionTerminal", {
        ...state.cliSessionTerminal,
        [sessionId]: {
          stdout: "",
          stderr: "",
          connected: false
        }
      });
    },
  };
}

function createHarnessDialogAndTutorialActions(context: HarnessStoreFactoryContext) {
  const { state, setState, persistBrowserUiStateIfChanged, sendCommand } = context;
  return {
    openPreferencesModal() {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        activeLeftTab: "preferences",
        activeSurface: "preferences",
        preferencesModalOpen: false,
        preferencesActiveSectionId: state.preferencesActiveSectionId,
        preferencesSearchQuery: ""
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    closePreferencesModal() {
      const previousSnapshot = getBrowserUiSessionSnapshot(state);
      const nextState = finalizeHarnessViewState({
        ...state,
        activeLeftTab: "projects",
        activeSurface: "chat",
        preferencesModalOpen: false
      });
      setState(reconcile(nextState));
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
    },
    setPreferencesActiveSectionId(preferencesActiveSectionId: PreferencesActiveSectionId) {
      setState({ preferencesActiveSectionId, preferencesSearchQuery: "" });
      persistMergedLocalPreferences({ preferencesActiveSectionId });
    },
    setPreferencesSearchQuery(preferencesSearchQuery: string) {
      setState({ preferencesSearchQuery });
    },
    openHelpDialog() {
      setState({ helpDialogOpen: true, setupChecklistOpen: true });
    },
    closeHelpDialog() {
      setState({ helpDialogOpen: false });
    },
    openUsageDialog() { setState({ usageDialogOpen: true }); },
    closeUsageDialog() { setState({ usageDialogOpen: false }); },
    openTokenUsageResetDialog() {
      setState({ tokenUsageResetDialogOpen: true, usageResetError: undefined });
    },
    closeTokenUsageResetDialog() {
      setState({ tokenUsageResetDialogOpen: false });
    },
    resetTokenUsage() {
      if (state.usageResetRequestId) return;
      const requestId = createRequestId();
      setState({ usageResetRequestId: requestId, usageResetError: undefined });
      if (!sendCommand({ type: "usage.reset", requestId })) setState({ usageResetRequestId: undefined, usageResetError: "Could not send reset. Reconnect and retry." });
    },
    refreshTokenUsage() {
      if (state.usageRefreshRequestId) return;
      const requestId = createRequestId();
      setState({ usageRefreshRequestId: requestId, usageRefreshError: undefined });
      if (!sendCommand({ type: "usage.refresh", requestId })) setState({ usageRefreshRequestId: undefined, usageRefreshError: "Could not refresh usage. Reconnect and retry." });
    },
    openSetupChecklist() {
      setState({ setupChecklistOpen: true });
    },
    closeSetupChecklist() {
      setState({ setupChecklistOpen: false });
    },
    prepareNonGitPreflightRepair(kind: "git-init" | "disable-check") {
      setState({ pendingPreflightRepairKind: kind });
    },
    clearBlockingNonGitPreflight() {
      setState({
        blockingNonGitPreflight: undefined,
        pendingPreflightRepairKind: undefined
      });
    },
    startTutorial(tutorialId: string) {
      const progress = readTutorialProgress();
      const dismissedTutorialIds = progress.dismissedTutorialIds.filter((id) => id !== tutorialId);
      persistTutorialProgress({
        completedTutorialIds: progress.completedTutorialIds,
        dismissedTutorialIds
      });
      setState({
        helpDialogOpen: false,
        setupChecklistOpen: true,
        activeTutorialId: tutorialId,
        activeTutorialStepIndex: 0,
        dismissedTutorialIds
      });
    },
    setActiveTutorialStepIndex(activeTutorialStepIndex: number) {
      setState({ activeTutorialStepIndex: Math.max(0, activeTutorialStepIndex) });
    },
    finishTutorial(tutorialId: string) {
      if (!isTutorialGoalSatisfied(tutorialId, state)) {
        pushToast(
          "Tutorial goal not finished",
          "Complete the highlighted workflow before marking this tutorial complete.",
          "info"
        );
        return false;
      }

      const progress = readTutorialProgress();
      const completedTutorialIds = [...new Set([...progress.completedTutorialIds, tutorialId])];
      const dismissedTutorialIds = progress.dismissedTutorialIds.filter((id) => id !== tutorialId);
      persistTutorialProgress({ completedTutorialIds, dismissedTutorialIds });
      setState({
        activeTutorialId: undefined,
        activeTutorialStepIndex: 0,
        completedTutorialIds,
        dismissedTutorialIds
      });
      return true;
    },
    dismissTutorial(tutorialId?: string) {
      const nextTutorialId = tutorialId ?? state.activeTutorialId;
      if (!nextTutorialId) {
        setState({
          activeTutorialId: undefined,
          activeTutorialStepIndex: 0
        });
        return;
      }

      const progress = readTutorialProgress();
      const dismissedTutorialIds = [...new Set([...progress.dismissedTutorialIds, nextTutorialId])];
      persistTutorialProgress({
        completedTutorialIds: progress.completedTutorialIds,
        dismissedTutorialIds
      });
      setState({
        activeTutorialId: undefined,
        activeTutorialStepIndex: 0,
        dismissedTutorialIds
      });
    },
  };
}

function createHarnessLocalPreferenceActions(context: HarnessStoreFactoryContext) {
  const { state, setState } = context;
  return {
    setOpenAiApiKeyDraft(openAiApiKeyDraft: string) {
      setState("providerConnectionTests", "openai", { status: "idle" });
      setState({ openAiApiKeyDraft, apiKeyDirty: true });
    },
    setGoogleApiKeyDraft(googleApiKeyDraft: string) {
      setState("providerConnectionTests", "google", { status: "idle" });
      setState({ googleApiKeyDraft, apiKeyDirty: true });
    },
    setAnthropicApiKeyDraft(anthropicApiKeyDraft: string) {
      setState("providerConnectionTests", "anthropic", { status: "idle" });
      setState({ anthropicApiKeyDraft, apiKeyDirty: true });
    },
    setProviderBrand(providerBrand: ProviderBrand) {
      setState(reconcile(finalizeHarnessViewState({
        ...state,
        providerBrand,
        apiKeyDirty: true
      })));
    },
    commitLocalPreferences(localPreferences: LocalPreferencesState) {
      const themePreference = normalizeThemePreference(localPreferences.themePreference ?? state.themePreference);
      setState(reconcile(finalizeHarnessViewState({
        ...state,
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        debugEnabled: localPreferences.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        tracePanelMode:
          state.hasPersistedTracePanelOpen
            ? state.tracePanelMode
            : localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen
              ? "open"
              : "closed",
        tracePanelOpen:
          state.hasPersistedTracePanelOpen ? state.tracePanelOpen : localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault:
          localPreferences.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: localPreferences.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: localPreferences.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          localPreferences.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: localPreferences.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault:
          localPreferences.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault:
          localPreferences.singleAgentModelPreferenceDefault ?? state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault:
          localPreferences.subagentModelPreferenceDefault ?? state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault:
          localPreferences.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          localPreferences.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault ??
          state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault:
          localPreferences.assistantCongestionControlEnabledDefault ?? state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault:
          localPreferences.assistantMaxCongestionDefault ?? state.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault:
          localPreferences.maxBackgroundJobsDefault ?? state.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault:
          localPreferences.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: localPreferences.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault:
          localPreferences.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: localPreferences.checkCliUpdatesDefault ?? state.checkCliUpdatesDefault,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(
          localPreferences.appHotkeyPreferences ?? state.appHotkeyPreferences
        ),
        themePreference,
        numericRightAlignmentEnabled:
          localPreferences.numericRightAlignmentEnabled ?? state.numericRightAlignmentEnabled,
        experienceMode: localPreferences.experienceMode ?? state.experienceMode,
        backgroundJobNotificationsEnabled:
          localPreferences.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        preferencesActiveSectionId:
          localPreferences.preferencesActiveSectionId ?? state.preferencesActiveSectionId,
        projectSidebarPreferences: normalizeProjectSidebarPreferences(
          readProjectSidebarPreferences(),
          state.workspace.projects.map((project) => project.id)
        ),
        selectedReasoningStrength: localPreferences.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: localPreferences.selectedFastMode ?? state.selectedFastMode,
        hasGlobalSelectedReasoningStrength:
          localPreferences.selectedReasoningStrength !== undefined || state.hasGlobalSelectedReasoningStrength,
        hasGlobalSelectedFastMode: localPreferences.selectedFastMode !== undefined || state.hasGlobalSelectedFastMode,
        openAiApiKeyDraft: "openAiApiKey" in localPreferences ? localPreferences.openAiApiKey ?? "" : state.openAiApiKeyDraft,
        googleApiKeyDraft: "googleApiKey" in localPreferences ? localPreferences.googleApiKey ?? "" : state.googleApiKeyDraft,
        anthropicApiKeyDraft: "anthropicApiKey" in localPreferences ? localPreferences.anthropicApiKey ?? "" : state.anthropicApiKeyDraft,
        apiKeyDirty: "openAiApiKey" in localPreferences ? false : state.apiKeyDirty,
        hasLocalOpenAiApiKey: "openAiApiKey" in localPreferences ? Boolean(localPreferences.openAiApiKey) : state.hasLocalOpenAiApiKey,
        hasLocalGoogleApiKey: "googleApiKey" in localPreferences ? Boolean(localPreferences.googleApiKey) : state.hasLocalGoogleApiKey,
        hasLocalAnthropicApiKey: "anthropicApiKey" in localPreferences ? Boolean(localPreferences.anthropicApiKey) : state.hasLocalAnthropicApiKey,
        hasLocalProviderBrandPreference: localPreferences.providerBrand !== undefined,
        hasLocalDebugPreference: localPreferences.debugEnabled !== undefined,
        hasLocalTracePreference: localPreferences.tracePanelDefaultOpen !== undefined,
        hasLocalSubagentWorktreeStrategyPreference: localPreferences.subagentWorktreeStrategyDefault !== undefined,
        hasLocalBlockChatOnDirtyGitPreference: localPreferences.blockChatOnDirtyGitDefault !== undefined,
        hasLocalDirtyGitChangeLimitPreference: localPreferences.dirtyGitChangeLimitDefault !== undefined,
        hasLocalAutoCompactContextThresholdPercentPreference:
          localPreferences.autoCompactContextThresholdPercentDefault !== undefined,
        hasLocalPlanExecutionModePreference: localPreferences.planExecutionModeDefault !== undefined,
        hasLocalPlanExecutionDelaySecondsPreference: localPreferences.planExecutionDelaySecondsDefault !== undefined,
        hasLocalSingleAgentModelPreference: localPreferences.singleAgentModelPreferenceDefault !== undefined,
        hasLocalSubagentModelPreference: localPreferences.subagentModelPreferenceDefault !== undefined,
        hasLocalCorrectnessIterationModePreference: localPreferences.correctnessIterationModeDefault !== undefined,
        hasLocalBackgroundJobApprovalPolicyPreference: localPreferences.backgroundJobApprovalPolicyDefault !== undefined,
        hasLocalAssistantAutoApproveNonBlockingQuestionsPreference:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault !== undefined,
        hasLocalAssistantCongestionControlPreference:
          localPreferences.assistantCongestionControlEnabledDefault !== undefined ||
          localPreferences.assistantMaxCongestionDefault !== undefined,
        hasLocalMaxBackgroundJobsPreference: localPreferences.maxBackgroundJobsDefault !== undefined,
        hasLocalAutoArchiveCompletedThreadsPreference: localPreferences.autoArchiveCompletedThreadsDefault !== undefined,
        hasLocalMemoryBankEnabledPreference: localPreferences.memoryBankEnabledDefault !== undefined,
        hasLocalMemoryBankRecordRunsPreference: localPreferences.memoryBankRecordRunsDefault !== undefined,
        hasLocalCheckCliUpdatesPreference: localPreferences.checkCliUpdatesDefault !== undefined
      })));
      applyThemePreference(themePreference);
    },
  };
}

function createHarnessHydrationActions(context: HarnessStoreFactoryContext) {
  const { state, setState } = context;
  return {
    setHasUsableApiKey(hasUsableApiKey: boolean) {
      setState({ hasUsableApiKey });
    },
    hydrateLocalPreferences() {
      const localPreferences = readLocalPreferences();
      const themePreference = normalizeThemePreference(localPreferences.themePreference ?? state.themePreference);
      const nextState = finalizeHarnessViewState({
        ...state,
        providerBrand: localPreferences.providerBrand ?? state.providerBrand,
        debugEnabled: localPreferences.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: localPreferences.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        tracePanelMode:
          state.hasPersistedTracePanelOpen
            ? state.tracePanelMode
            : localPreferences.tracePanelDefaultOpen ?? state.tracePanelOpen
              ? "open"
              : "closed",
        tracePanelOpen:
          state.hasPersistedTracePanelOpen ? state.tracePanelOpen : localPreferences.tracePanelDefaultOpen ?? state.tracePanelOpen,
        subagentWorktreeStrategyDefault:
          localPreferences.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: localPreferences.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: localPreferences.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          localPreferences.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: localPreferences.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault:
          localPreferences.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault:
          localPreferences.singleAgentModelPreferenceDefault ?? state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault:
          localPreferences.subagentModelPreferenceDefault ?? state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault:
          localPreferences.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          localPreferences.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault ??
          state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault:
          localPreferences.assistantCongestionControlEnabledDefault ?? state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault:
          localPreferences.assistantMaxCongestionDefault ?? state.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault:
          localPreferences.maxBackgroundJobsDefault ?? state.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault:
          localPreferences.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: localPreferences.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault:
          localPreferences.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: localPreferences.checkCliUpdatesDefault ?? state.checkCliUpdatesDefault,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(
          localPreferences.appHotkeyPreferences ?? state.appHotkeyPreferences
        ),
        themePreference,
        numericRightAlignmentEnabled:
          localPreferences.numericRightAlignmentEnabled ?? state.numericRightAlignmentEnabled,
        experienceMode: localPreferences.experienceMode ?? state.experienceMode,
        backgroundJobNotificationsEnabled:
          localPreferences.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        tokenUsage: state.tokenUsage,
        preferencesActiveSectionId:
          localPreferences.preferencesActiveSectionId ?? state.preferencesActiveSectionId,
        projectSidebarPreferences: normalizeProjectSidebarPreferences(
          readProjectSidebarPreferences(),
          state.workspace.projects.map((project) => project.id)
        ),
        selectedReasoningStrength: localPreferences.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: localPreferences.selectedFastMode ?? state.selectedFastMode,
        hasGlobalSelectedReasoningStrength:
          localPreferences.selectedReasoningStrength !== undefined || state.hasGlobalSelectedReasoningStrength,
        hasGlobalSelectedFastMode: localPreferences.selectedFastMode !== undefined || state.hasGlobalSelectedFastMode,
        openAiApiKeyDraft: localPreferences.openAiApiKey ?? "",
        googleApiKeyDraft: localPreferences.googleApiKey ?? "",
        anthropicApiKeyDraft: localPreferences.anthropicApiKey ?? "",
        apiKeyDirty: false,
        hasLocalOpenAiApiKey: Boolean(localPreferences.openAiApiKey),
        hasLocalGoogleApiKey: Boolean(localPreferences.googleApiKey),
        hasLocalAnthropicApiKey: Boolean(localPreferences.anthropicApiKey),
        hasLocalProviderBrandPreference: localPreferences.providerBrand !== undefined,
        hasLocalDebugPreference: localPreferences.debugEnabled !== undefined,
        hasLocalTracePreference: localPreferences.tracePanelDefaultOpen !== undefined,
        hasLocalSubagentWorktreeStrategyPreference: localPreferences.subagentWorktreeStrategyDefault !== undefined,
        hasLocalBlockChatOnDirtyGitPreference: localPreferences.blockChatOnDirtyGitDefault !== undefined,
        hasLocalDirtyGitChangeLimitPreference: localPreferences.dirtyGitChangeLimitDefault !== undefined,
        hasLocalAutoCompactContextThresholdPercentPreference:
          localPreferences.autoCompactContextThresholdPercentDefault !== undefined,
        hasLocalPlanExecutionModePreference: localPreferences.planExecutionModeDefault !== undefined,
        hasLocalPlanExecutionDelaySecondsPreference: localPreferences.planExecutionDelaySecondsDefault !== undefined,
        hasLocalSingleAgentModelPreference: localPreferences.singleAgentModelPreferenceDefault !== undefined,
        hasLocalSubagentModelPreference: localPreferences.subagentModelPreferenceDefault !== undefined,
        hasLocalCorrectnessIterationModePreference: localPreferences.correctnessIterationModeDefault !== undefined,
        hasLocalBackgroundJobApprovalPolicyPreference: localPreferences.backgroundJobApprovalPolicyDefault !== undefined,
        hasLocalAssistantAutoApproveNonBlockingQuestionsPreference:
          localPreferences.assistantAutoApproveNonBlockingQuestionsDefault !== undefined,
        hasLocalAssistantCongestionControlPreference:
          localPreferences.assistantCongestionControlEnabledDefault !== undefined ||
          localPreferences.assistantMaxCongestionDefault !== undefined,
        hasLocalMaxBackgroundJobsPreference: localPreferences.maxBackgroundJobsDefault !== undefined,
        hasLocalAutoArchiveCompletedThreadsPreference: localPreferences.autoArchiveCompletedThreadsDefault !== undefined,
        hasLocalMemoryBankEnabledPreference: localPreferences.memoryBankEnabledDefault !== undefined,
        hasLocalMemoryBankRecordRunsPreference: localPreferences.memoryBankRecordRunsDefault !== undefined,
        hasLocalCheckCliUpdatesPreference: localPreferences.checkCliUpdatesDefault !== undefined
      });
      setState(reconcile(nextState));
      applyThemePreference(themePreference);
      return localPreferences;
    },
    hydrateTutorialProgress() {
      const progress = readTutorialProgress();
      setState({
        completedTutorialIds: progress.completedTutorialIds,
        dismissedTutorialIds: progress.dismissedTutorialIds
      });
      return progress;
    },
  };
}

function createHarnessEventActions(context: HarnessStoreFactoryContext) {
  const {
    state, setState, recordedTokenUsageEventKeys, persistBrowserUiStateIfChanged, sendCommand,
    pagingUnavailable, workspacePages, readyContinuation, requestSelectedAssistantDetail,
  } = context;
  return {
    applyServerEvent(event: ServerEvent) {
      if (event.type === "thread.inputAccepted") {
        const project = state.workspace.projects.find(item => item.id === event.payload.projectId);
        if (project?.activeThreadId === event.payload.threadId && project.draft.trim() === event.payload.content) {
          persistThreadDraft(project.id, event.payload.threadId, "");
          setState("workspace", "projects", item => item.id === project.id, "draft", "");
        }
        return;
      }
      if (event.type === "command.rejected") {
        if (event.requestId === state.usageResetRequestId && state.usageResetRequestId) setState({ usageResetRequestId: undefined, usageResetError: event.payload.message });
        if (event.requestId === state.usageRefreshRequestId && state.usageRefreshRequestId) setState({ usageRefreshRequestId: undefined, usageRefreshError: event.payload.message });
      }
      if (event.type === "usage.updated" && state.usageResetRequestId === event.requestId) {
        recordedTokenUsageEventKeys.clear();
        pushToast("Local usage reset", "Session and lifetime counters cleared. Codex account quota is unchanged.");
      }
      if (!context.providerKeySaves.accepts(event, state)) return;
      if (event.type === "workspace.projects.listed" && !workspacePages.accepts(event)) return;
      if (event.type === "workspace.projectChildren.listed" && !workspacePages.accepts(event)) return;
      if (!readyContinuation.accepts(event)) return;
      let currentState: HarnessViewState = { ...unwrap(state), ...context.providerKeySaves.apply(event, state) };
      if (event.type === "background-jobs.page.listed") currentState = { ...currentState,
        backgroundJobs: readyContinuation.prepareBackgroundJobs(currentState.backgroundJobs, event) };
      if (event.type === "notifications.page.listed") currentState = { ...currentState,
        notifications: readyContinuation.prepareNotifications(currentState.notifications, event) };
      if (event.type === "workspace.projects.listed" || event.type === "workspace.projectChildren.listed")
        currentState = { ...currentState, workspace: prepareWorkspaceForPageEvent(currentState.workspace, event,
          workspacePages.getProjectsRequest()?.cursor === "", event.type === "workspace.projectChildren.listed"
            ? workspacePages.getChildRequest(event.payload.projectId) : undefined) };
      const previousSnapshot = getBrowserUiSessionSnapshot(currentState);
      let reducedState = reduceServerEvent(currentState, event);
      if (event.type === "project.context") reducedState = applyTokenUsageEvent(reducedState, event, recordedTokenUsageEventKeys);
      const nextState = finalizeHarnessViewState(reducedState);
      setState(reconcile(nextState));
      if (event.type === "connection.ready") { requestSelectedAssistantDetail();
        readyContinuation.hydrate({ assistants: event.payload.assistants.assistantsNextCursor, jobs: event.payload.backgroundJobs.jobsNextCursor,
          runs: event.payload.backgroundJobs.runsNextCursor, notifications: event.payload.notifications.itemsNextCursor,
          firstJobIds: event.payload.backgroundJobs.jobs.map(({ id }) => id), firstRunIds: event.payload.backgroundJobs.runs.map(({ id }) => id),
          firstNotificationIds: event.payload.notifications.items.map(({ id }) => id) });
      }
      workspacePages.handle(event);
      context.modeSaves.apply(event); context.jobSaves.apply(event);
      readyContinuation.handle(event);
      if (event.type === "notifications.updated") readyContinuation.notificationsUpdated(state.notifications);
      if (event.type === "background-jobs.updated") readyContinuation.backgroundJobsUpdated(state.backgroundJobs);
      if (event.type === "background-jobs.deleted") pagingUnavailable.backgroundDeleted(event.payload.deletedJobIds, event.payload.targets.filter((target) => target.kind === "project").map(({ projectId }) => projectId));
      if (event.type === "project.removed") pagingUnavailable.projectDeleted(event.payload.projectId);
      if (event.type === "assistants.updated" && event.payload.invalidatedDetailAssistantIds?.includes(
        state.assistants.selectedAssistantId ?? "")) requestSelectedAssistantDetail();
      persistBrowserUiStateIfChanged(previousSnapshot, nextState);
      const retryCommand = getRepairedPreflightRetryCommand(nextState, event);
      if (retryCommand) {
        const nextCommand = cloneCommandWithRequestId(retryCommand, createRequestId());
        if (sendCommand(nextCommand)) setState({
          blockingNonGitPreflight: undefined,
          pendingPreflightRepairKind: undefined
        });
      }
    },
    replaceStateForTests(nextState: HarnessViewState) {
      context.setCommandDispatcher(undefined);
      setState(reconcile(nextState));
    },
    resetForTests(overrides: Partial<HarnessViewState> = {}) {
      context.setCommandDispatcher(undefined);
      recordedTokenUsageEventKeys.clear();
      setState(reconcile({ ...createInitialViewState(), ...overrides }));
    }
  };
}

export function createHarnessStore() {
  const context = createHarnessStoreContext();
  return {
    state: context.state,
    actions: createHarnessTransportActions(context),
    ...createHarnessConnectionActions(context), ...createHarnessAssistantPaneActions(context),
    ...createHarnessProjectPreferenceActions(context), ...createHarnessVisualPreferenceActions(context),
    ...createHarnessDialogAndTutorialActions(context), ...createHarnessLocalPreferenceActions(context),
    ...createHarnessHydrationActions(context), ...createHarnessEventActions(context),
  };
}
export type HarnessStoreApi = ReturnType<typeof createHarnessStore>;

let activeHarnessStore: HarnessStoreApi | undefined;

export function setActiveHarnessStore(store: HarnessStoreApi | undefined) {
  activeHarnessStore = store;
}

export function getActiveHarnessStore() {
  return activeHarnessStore;
}

export function requireHarnessStore() {
  if (!activeHarnessStore) {
    throw new Error("Harness store not initialized");
  }

  return activeHarnessStore;
}

const harnessStoreProxyTarget: HarnessStoreApi = Object.create(null);
export const harnessStore = new Proxy(harnessStoreProxyTarget, {
  get(_target, prop, receiver) {
    return Reflect.get(requireHarnessStore(), prop, receiver);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(requireHarnessStore(), prop, value, receiver);
  },
  ownKeys() {
    return Reflect.ownKeys(requireHarnessStore());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(requireHarnessStore(), prop);
  }
});

function isPreflightCapableCommand(command: ClientCommand) {
  return [
    "chat.send",
    "run.execute",
    "run.retry",
    "run.resume",
    "subagent.retry",
    "subagent.resume"
  ].includes(command.type);
}

function getRepairedPreflightRetryCommand(state: HarnessViewState, event: ServerEvent) {
  if (!state.blockingNonGitPreflight?.command || !state.pendingPreflightRepairKind) {
    return undefined;
  }

  if (state.pendingPreflightRepairKind === "git-init" && event.type === "project.git.initialized") {
    return event.payload.projectId === state.blockingNonGitPreflight.projectId
      ? state.blockingNonGitPreflight.command
      : undefined;
  }

  if (state.pendingPreflightRepairKind === "disable-check" && event.type === "preferences.saved") {
    return event.payload.blockChatOnDirtyGitDefault === false ? state.blockingNonGitPreflight.command : undefined;
  }

  return undefined;
}

function cloneCommandWithRequestId(command: ClientCommand, requestId: string): ClientCommand {
  return parseClientCommand({ ...command, requestId });
}

function mergeAssistantDetail(existing: ViewAssistantsState, detail: AssistantDetail): ViewAssistantsState {
  const selectedAssistantId =
    existing.selectedAssistantId && existing.assistants.some((assistant) => assistant.id === existing.selectedAssistantId)
      ? existing.selectedAssistantId
      : detail.assistant.id;
  const nextLogs = replaceScopedItems(existing.logs, detail.assistant.id, detail.logs.items);
  return assistantDetails.retainAssistantDetailScopes({
    ...existing,
    assistants: upsertById(existing.assistants, detail.assistant),
    threads: detail.thread ? upsertById(existing.threads, detail.thread) : existing.threads,
    todos: replaceScopedItems(existing.todos, detail.assistant.id, detail.todos.items),
    learnings: replaceScopedItems(existing.learnings, detail.assistant.id, detail.learnings.items),
    questions: replaceScopedItems(existing.questions, detail.assistant.id, detail.questions.items),
    logs: nextLogs,
    assetRefs: replaceScopedItems(existing.assetRefs, detail.assistant.id, detail.assetRefs),
    ...assistantDetails.completeAssistantDetailRequest(existing, detail),
    selectedAssistantId,
    selectedLogDetailsId:
      existing.selectedLogDetailsId && nextLogs.some((entry) => entry.id === existing.selectedLogDetailsId)
        ? existing.selectedLogDetailsId
        : undefined
  });
}

function upsertById<T extends { id: string }>(entries: T[], nextEntry: T) {
  return entries.some((entry) => entry.id === nextEntry.id)
    ? entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry))
    : [nextEntry, ...entries];
}

function replaceScopedItems<T extends { assistantId: string }>(existing: T[], assistantId: string, incoming: T[]) {
  return [...incoming, ...existing.filter((entry) => entry.assistantId !== assistantId)];
}

function upsertCliSession(sessions: CliSession[], session: CliSession) {
  const next = sessions.filter((entry) => entry.id !== session.id);
  if (session.status !== "exited" && session.status !== "failed" && session.status !== "stopped") {
    next.push(session);
  }
  return next;
}

function updateProjectState(
  state: HarnessViewState,
  projectId: string,
  updater: (project: ViewProjectState) => ViewProjectState
): HarnessViewState {
  if (!state.workspace.projects.some((project) => project.id === projectId)) return state;
  return {
    ...state,
    workspace: {
      ...state.workspace,
      projects: state.workspace.projects.map((project) => project.id === projectId
        ? retainWorkspaceMessageWindow(updater(project)) : project)
    }
  };
}

function upsertProject(projects: ViewProjectState[], nextProject: ViewProjectState) {
  if (projects.some((project) => project.id === nextProject.id)) {
    return projects.map((project) => (project.id === nextProject.id ? nextProject : project));
  }

  return [nextProject, ...projects];
}

function moveProjectToFront(projects: ViewProjectState[], projectId: string) {
  const target = projects.find((project) => project.id === projectId);
  if (!target) {
    return projects;
  }

  return [target, ...projects.filter((project) => project.id !== projectId)];
}

function renderStreamingStatusTailSegments(segments: StreamingTailSegment[]) {
  return segments
    .filter((segment) => segment.kind === "status")
    .map((segment) => segment.content)
    .join("\n\n")
    .trim();
}

function getLatestStreamingTailTimestamp(segments: StreamingTailSegment[]) {
  return segments.reduce((latest, segment) => (segment.updatedAt > latest ? segment.updatedAt : latest), new Date(0).toISOString());
}

function rolloverStreamingHeartbeatMessages(
  messages: StreamingHeartbeatMessage[],
  runId: string,
  content: string,
  updatedAt: string
) {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return [];
  }

  const current = messages.at(-1);
  if (!current) {
    return [
      {
        id: `${runId}:heartbeat:1`,
        content: normalizedContent,
        heartbeatCount: 1,
        locked: false,
        updatedAt
      }
    ];
  }

  if (current.content === normalizedContent) {
    return messages.map((message, index) => (index === messages.length - 1 ? { ...message, updatedAt } : message));
  }

  if (!current.locked && current.heartbeatCount < MAX_STREAMING_MESSAGE_HEARTBEATS) {
    return messages.map((message, index) =>
      index === messages.length - 1
        ? {
          ...message,
          content: normalizedContent,
          heartbeatCount: message.heartbeatCount + 1,
          updatedAt
        }
        : message
    );
  }

  const lockedMessages = current.locked
    ? messages
    : messages.map((message, index) => (index === messages.length - 1 ? { ...message, locked: true } : message));

  return [
    ...lockedMessages,
    {
      id: `${runId}:heartbeat:${lockedMessages.length + 1}`,
      content: normalizedContent,
      heartbeatCount: 1,
      locked: false,
      updatedAt
    }
  ];
}

function createThreadLiveTranscriptState(
  overrides: Partial<ThreadLiveTranscriptState> = {}
): ThreadLiveTranscriptState {
  return {
    isStreaming: overrides.isStreaming ?? false,
    streamingAssistantText: overrides.streamingAssistantText ?? "",
    streamingTailSegments: overrides.streamingTailSegments ?? [],
    streamingHeartbeatMessages: overrides.streamingHeartbeatMessages ?? [],
    latestPlan: overrides.latestPlan,
    contextUsage: overrides.contextUsage,
    traces: capLiveTraceHistory(overrides.traces ?? []),
    activeRun: overrides.activeRun,
    lastRun: overrides.lastRun,
    runSummaries: overrides.runSummaries ?? [],
    lastError: overrides.lastError
  };
}

function getPersistedThreadLiveTranscriptState(project: Pick<WorkspaceProjectState, "session" | "activeRun" | "lastRun" | "runSummaries">) {
  return createThreadLiveTranscriptState({
    isStreaming: project.session.isStreaming,
    streamingAssistantText: getPersistedStreamingAssistantText(project),
    activeRun: project.activeRun,
    lastRun: project.lastRun,
    runSummaries: project.runSummaries,
    lastError: project.session.lastError
  });
}

function getActiveThreadLiveTranscriptState(project: ViewProjectState) {
  return createThreadLiveTranscriptState({
    isStreaming: project.session.isStreaming,
    streamingAssistantText: project.streamingAssistantText,
    streamingTailSegments: project.streamingTailSegments,
    streamingHeartbeatMessages: project.streamingHeartbeatMessages,
    latestPlan: project.latestPlan,
    contextUsage: project.contextUsage,
    traces: project.traces,
    activeRun: project.activeRun,
    lastRun: project.lastRun,
    runSummaries: project.runSummaries,
    lastError: project.lastError ?? project.session.lastError
  });
}

function filterThreadLiveTranscriptByKnownThreads(
  liveTranscriptById: Record<string, ThreadLiveTranscriptState>,
  threads: ViewProjectState["threads"]
) {
  const knownThreadIds = new Set(threads.map((thread) => thread.id));
  return Object.fromEntries(
    Object.entries(liveTranscriptById).filter(([threadId]) => knownThreadIds.has(threadId))
  );
}

function applyThreadLiveTranscriptState(
  project: ViewProjectState,
  threadId: string,
  liveTranscript: ThreadLiveTranscriptState
) {
  const nextProject = {
    ...project,
    threadLiveTranscriptById: {
      ...project.threadLiveTranscriptById,
      [threadId]: liveTranscript
    }
  };

  if (nextProject.activeThreadId !== threadId) {
    return nextProject;
  }

  return {
    ...nextProject,
    streamingAssistantText: liveTranscript.streamingAssistantText,
    streamingTailSegments: liveTranscript.streamingTailSegments,
    streamingHeartbeatMessages: liveTranscript.streamingHeartbeatMessages,
    latestPlan: liveTranscript.latestPlan,
    contextUsage: liveTranscript.contextUsage,
    traces: liveTranscript.traces,
    activeRun: liveTranscript.activeRun,
    lastRun: liveTranscript.lastRun,
    runSummaries: liveTranscript.runSummaries,
    lastError: liveTranscript.lastError,
    session: {
      ...nextProject.session,
      isStreaming: liveTranscript.isStreaming,
      lastError: liveTranscript.lastError
    }
  };
}

function hydrateWorkspace(workspace: WorkspaceState): ViewWorkspaceState {
  return { ...hydratePagedWorkspace(workspace, toViewProject), workspaceModes: workspace.workspaceModes ?? [] };
}

function mergeIncomingWorkspace(existing: ViewWorkspaceState, incoming: ViewWorkspaceState): ViewWorkspaceState {
  return mergePagedWorkspace(existing, incoming, mergeIncomingProject);
}

function toViewProject(project: WorkspaceProjectState): ViewProjectState {
  const activeThreadLiveTranscript = getPersistedThreadLiveTranscriptState(project);
  return {
    ...project,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: activeThreadLiveTranscript.streamingAssistantText,
    streamingTailSegments: activeThreadLiveTranscript.streamingTailSegments,
    streamingHeartbeatMessages: activeThreadLiveTranscript.streamingHeartbeatMessages,
    threadLiveTranscriptById: {
      [project.activeThreadId]: activeThreadLiveTranscript
    },
    draft: readThreadDraft(project.id, project.activeThreadId),
    lastError: activeThreadLiveTranscript.lastError,
    experimentInspection: undefined,
    memoryEntries: []
  };
}

function mergeIncomingProject(existing: ViewProjectState, incoming: ViewProjectState): ViewProjectState {
  const activeThreadChanged = existing.activeThreadId !== incoming.activeThreadId;
  const rememberedThreadLiveTranscript = filterThreadLiveTranscriptByKnownThreads(
    { ...existing.threadLiveTranscriptById, [existing.activeThreadId]: getActiveThreadLiveTranscriptState(existing) }, incoming.threads
  );
  const rememberedLiveTranscript =
    rememberedThreadLiveTranscript[incoming.activeThreadId] ?? getPersistedThreadLiveTranscriptState(incoming);
  const activeThreadLiveTranscript = { ...rememberedLiveTranscript, activeRun: rememberedLiveTranscript.activeRun ?? incoming.activeRun,
    lastRun: rememberedLiveTranscript.lastRun ?? incoming.lastRun,
    runSummaries: rememberedLiveTranscript.runSummaries.length ? rememberedLiveTranscript.runSummaries : incoming.runSummaries
  };
  return {
    ...incoming,
    latestPlan: activeThreadLiveTranscript.latestPlan,
    contextUsage: activeThreadLiveTranscript.contextUsage,
    traces: activeThreadLiveTranscript.traces,
    streamingAssistantText: activeThreadLiveTranscript.streamingAssistantText,
    streamingTailSegments: activeThreadLiveTranscript.streamingTailSegments,
    streamingHeartbeatMessages: activeThreadLiveTranscript.streamingHeartbeatMessages,
    threadLiveTranscriptById: {
      ...rememberedThreadLiveTranscript,
      [incoming.activeThreadId]: activeThreadLiveTranscript
    },
    draft: readThreadDraft(incoming.id, incoming.activeThreadId),
    activeRun: activeThreadLiveTranscript.activeRun,
    lastRun: activeThreadLiveTranscript.lastRun,
    runSummaries: activeThreadLiveTranscript.runSummaries,
    lastError: activeThreadLiveTranscript.lastError,
    experimentInspection: activeThreadChanged ? undefined : existing.experimentInspection,
    memoryEntries: existing.memoryEntries,
    session: {
      ...incoming.session,
      selectedAgentId: existing.session.selectedAgentId ?? incoming.session.selectedAgentId,
      executionModelId: existing.session.executionModelId ?? incoming.session.executionModelId,
      isStreaming: activeThreadLiveTranscript.isStreaming,
      lastError: activeThreadLiveTranscript.lastError
    }
  };
}

function getPersistedStreamingAssistantText(project: Pick<WorkspaceProjectState, "session">) {
  if (!project.session.isStreaming) {
    return "";
  }

  const lastMessage = project.session.messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant" || lastMessage.kind === "run-milestones") {
    return "";
  }

  return lastMessage.content;
}

function applyProjectSearchResultsState(
  state: HarnessViewState,
  requestId: string,
  query: string,
  results: ProjectSearchResult[]
): HarnessViewState {
  if (state.projectSearchPendingRequestId !== requestId || state.projectSearchQuery.trim() !== query.trim()) {
    return state;
  }

  return {
    ...state,
    projectSearchLoading: false,
    projectSearchPendingRequestId: undefined,
    projectSearchFilesystemResults: [...results]
  };
}

function setThreadBadge(threads: ViewProjectState["threads"], threadId: string, badgeState: ViewProjectState["threads"][number]["badgeState"]) {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, badgeState } : thread));
}

function updateThreadSummaryFromMessage(
  threads: ViewProjectState["threads"],
  threadId: string,
  message: ViewProjectState["session"]["messages"][number]
) {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
        ...thread,
        messageCount: thread.messageCount + 1,
        lastMessagePreview: shouldUseMessageForThreadPreview(message) ? message.content : thread.lastMessagePreview,
        updatedAt: message.createdAt
      }
      : thread
  );
}

function updateThreadSummaryFromAppendedEvent(
  threads: ViewProjectState["threads"],
  threadId: string,
  message: ViewProjectState["session"]["messages"][number],
  serverThread: ProjectThreadSummary | undefined
) {
  if (serverThread?.id === threadId) {
    return threads.map((thread) => (thread.id === threadId ? serverThread : thread));
  }

  return updateThreadSummaryFromMessage(threads, threadId, message);
}

function updateThreadSummaryFromUpdatedMessage(
  threads: ViewProjectState["threads"],
  threadId: string,
  message: ViewProjectState["session"]["messages"][number]
) {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
        ...thread,
        lastMessagePreview: shouldUseMessageForThreadPreview(message) ? message.content : thread.lastMessagePreview,
        updatedAt: message.createdAt
      }
      : thread
  );
}

function shouldUseMessageForThreadPreview(message: ViewProjectState["session"]["messages"][number]) {
  return message.role !== "system" && message.kind !== "run-milestones";
}

function upsertBackgroundJobRun(
  runs: BackgroundJobsState["runs"],
  nextRun: BackgroundJobsState["runs"][number],
  retainedIds: ReadonlySet<string>
) {
  return boundBackgroundRuns(runs, nextRun, retainedIds);
}

function badgeFromRunStatus(status: NonNullable<ViewProjectState["lastRun"]>["status"]): ViewProjectState["threads"][number]["badgeState"] {
  if (status === "failed" || status === "partial-complete") {
    return "error";
  }
  if (status === "awaiting-user-input") {
    return "needs-input";
  }
  if (status === "planning" || status === "ready") {
    return "planning";
  }
  if (status === "running-main" || status === "running-subagents" || status === "aggregating") {
    return "executing";
  }
  if (status === "completed") {
    return "done";
  }
  return "idle";
}

function applyReadyPreferencesState(state: HarnessViewState, preferences: PreferencesState) {
  const providerBrand = resolveProviderBrand(state, preferences);
  const tracePanelDefaultOpen = state.hasLocalTracePreference
    ? state.tracePanelDefaultOpen
    : preferences.tracePanelDefaultOpen;

  return {
    sharedAiPreferences: preferences.sharedAiPreferences,
    hasUsableApiKey: preferences.hasUsableApiKey,
    hasStoredApiKey: preferences.hasStoredApiKey,
    hasUsableOpenAiApiKey: preferences.hasUsableOpenAiApiKey,
    hasStoredOpenAiApiKey: preferences.hasStoredOpenAiApiKey,
    hasUsableGoogleApiKey: preferences.hasUsableGoogleApiKey,
    hasStoredGoogleApiKey: preferences.hasStoredGoogleApiKey,
    hasUsableAnthropicApiKey: preferences.hasUsableAnthropicApiKey,
    hasStoredAnthropicApiKey: preferences.hasStoredAnthropicApiKey,
    providerBrand,
    debugEnabled: state.hasLocalDebugPreference ? state.debugEnabled : preferences.debugEnabledDefault,
    tracePanelDefaultOpen,
    tracePanelMode:
      state.hasPersistedTracePanelOpen || state.hasLocalTracePreference
        ? state.tracePanelMode
        : tracePanelDefaultOpen
          ? "open"
          : "closed",
    tracePanelOpen:
      state.hasPersistedTracePanelOpen || state.hasLocalTracePreference ? state.tracePanelOpen : tracePanelDefaultOpen,
    subagentWorktreeStrategyDefault: state.hasLocalSubagentWorktreeStrategyPreference
      ? state.subagentWorktreeStrategyDefault
      : preferences.subagentWorktreeStrategyDefault,
    blockChatOnDirtyGitDefault: state.hasLocalBlockChatOnDirtyGitPreference
      ? state.blockChatOnDirtyGitDefault
      : preferences.blockChatOnDirtyGitDefault,
    dirtyGitChangeLimitDefault: state.hasLocalDirtyGitChangeLimitPreference
      ? state.dirtyGitChangeLimitDefault
      : preferences.dirtyGitChangeLimitDefault,
    autoCompactContextThresholdPercentDefault: state.hasLocalAutoCompactContextThresholdPercentPreference
      ? state.autoCompactContextThresholdPercentDefault
      : preferences.autoCompactContextThresholdPercentDefault,
    planExecutionModeDefault: state.hasLocalPlanExecutionModePreference
      ? state.planExecutionModeDefault
      : preferences.planExecutionModeDefault,
    planExecutionDelaySecondsDefault: state.hasLocalPlanExecutionDelaySecondsPreference
      ? state.planExecutionDelaySecondsDefault
      : preferences.planExecutionDelaySecondsDefault,
    singleAgentModelPreferenceDefault: state.hasLocalSingleAgentModelPreference
      ? state.singleAgentModelPreferenceDefault
      : preferences.singleAgentModelPreferenceDefault,
    subagentModelPreferenceDefault: state.hasLocalSubagentModelPreference
      ? state.subagentModelPreferenceDefault
      : preferences.subagentModelPreferenceDefault,
    correctnessIterationModeDefault: state.hasLocalCorrectnessIterationModePreference
      ? state.correctnessIterationModeDefault
      : preferences.correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault: state.hasLocalBackgroundJobApprovalPolicyPreference
      ? state.backgroundJobApprovalPolicyDefault
      : preferences.backgroundJobApprovalPolicyDefault,
    assistantAutoApproveNonBlockingQuestionsDefault: state.hasLocalAssistantAutoApproveNonBlockingQuestionsPreference
      ? state.assistantAutoApproveNonBlockingQuestionsDefault
      : (preferences.assistantAutoApproveNonBlockingQuestionsDefault ?? true),
    assistantCongestionControlEnabledDefault: state.hasLocalAssistantCongestionControlPreference
      ? state.assistantCongestionControlEnabledDefault
      : (preferences.assistantCongestionControlEnabledDefault ?? true),
    assistantMaxCongestionDefault: state.hasLocalAssistantCongestionControlPreference
      ? state.assistantMaxCongestionDefault
      : (preferences.assistantMaxCongestionDefault ?? 1),
    maxBackgroundJobsDefault: state.hasLocalMaxBackgroundJobsPreference
      ? state.maxBackgroundJobsDefault
      : preferences.maxBackgroundJobsDefault,
    autoArchiveCompletedThreadsDefault: state.hasLocalAutoArchiveCompletedThreadsPreference
      ? state.autoArchiveCompletedThreadsDefault
      : (preferences.autoArchiveCompletedThreadsDefault ?? false),
    memoryBankEnabledDefault: state.hasLocalMemoryBankEnabledPreference
      ? state.memoryBankEnabledDefault
      : preferences.memoryBankEnabledDefault,
    memoryBankRecordRunsDefault: state.hasLocalMemoryBankRecordRunsPreference
      ? state.memoryBankRecordRunsDefault
      : preferences.memoryBankRecordRunsDefault,
    checkCliUpdatesDefault: state.hasLocalCheckCliUpdatesPreference
      ? state.checkCliUpdatesDefault
      : preferences.checkCliUpdatesDefault,
    attachmentsEnabled: preferences.attachmentsEnabled,
    capabilities: preferences.capabilities,
    agentRuntimes: preferences.agentRuntimes
  };
}

export function readLocalPreferences(): LocalPreferencesState {
  if (typeof window === "undefined") {
    return {};
  }

  const { openAiApiKey, googleApiKey, anthropicApiKey } = readAndScrubLegacyProviderApiKeys();
  const providerBrand = parseProviderBrandStorageValue(window.localStorage.getItem(PROVIDER_BRAND_STORAGE_KEY));
  const debugEnabled = parseBooleanStorageValue(window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY));
  const tracePanelDefaultOpen = parseBooleanStorageValue(
    window.localStorage.getItem(TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY)
  );
  const subagentWorktreeStrategyDefault = parseSubagentWorktreeStrategyStorageValue(
    window.localStorage.getItem(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_STORAGE_KEY)
  );
  const blockChatOnDirtyGitDefault = parseBooleanStorageValue(
    window.localStorage.getItem(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_STORAGE_KEY)
  );
  const dirtyGitChangeLimitDefault = parseBoundedIntegerStorageValue(
    window.localStorage.getItem(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_STORAGE_KEY),
    0,
    10000
  );
  const autoCompactContextThresholdPercentDefault = parseBoundedIntegerStorageValue(
    window.localStorage.getItem(AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_STORAGE_KEY),
    10,
    95
  );
  const planExecutionModeDefault = parsePlanExecutionModeStorageValue(
    window.localStorage.getItem(PLAN_EXECUTION_MODE_DEFAULT_STORAGE_KEY)
  );
  const planExecutionDelaySecondsDefault = parseBoundedIntegerStorageValue(
    window.localStorage.getItem(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_STORAGE_KEY),
    0,
    300
  );
  const correctnessIterationModeDefault = parseCorrectnessIterationModeStorageValue(
    window.localStorage.getItem(CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY)
  );
  const singleAgentModelPreferenceDefault = parseRunModelPreferenceStorageValue(
    window.localStorage.getItem(SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY)
  );
  const subagentModelPreferenceDefault = parseRunModelPreferenceStorageValue(
    window.localStorage.getItem(SUBAGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY)
  );
  const backgroundJobApprovalPolicyDefault = parseBackgroundJobApprovalPolicyStorageValue(
    window.localStorage.getItem(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY)
  );
  const assistantAutoApproveNonBlockingQuestionsDefault = parseBooleanStorageValue(
    window.localStorage.getItem(ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_STORAGE_KEY)
  );
  const assistantCongestionControlEnabledDefault = parseBooleanStorageValue(
    window.localStorage.getItem(ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_STORAGE_KEY)
  );
  const assistantMaxCongestionDefault = parseBoundedDecimalStorageValue(
    window.localStorage.getItem(ASSISTANT_MAX_CONGESTION_DEFAULT_STORAGE_KEY),
    0.25,
    3,
    0.25
  );
  const maxBackgroundJobsDefault = parseBoundedIntegerStorageValue(
    window.localStorage.getItem(MAX_BACKGROUND_JOBS_DEFAULT_STORAGE_KEY),
    5,
    100
  );
  const autoArchiveCompletedThreadsDefault = parseBooleanStorageValue(
    window.localStorage.getItem(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_STORAGE_KEY)
  );
  const memoryBankEnabledDefault = parseBooleanStorageValue(
    window.localStorage.getItem(MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY)
  );
  const memoryBankRecordRunsDefault = parseBooleanStorageValue(
    window.localStorage.getItem(MEMORY_BANK_RECORD_RUNS_DEFAULT_STORAGE_KEY)
  );
  const checkCliUpdatesDefault = parseBooleanStorageValue(
    window.localStorage.getItem(CHECK_CLI_UPDATES_DEFAULT_STORAGE_KEY)
  );
  const backgroundJobNotificationsEnabled = parseBooleanStorageValue(
    window.localStorage.getItem(BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY)
  );
  const selectedReasoningStrength = parseReasoningStrengthStorageValue(
    window.localStorage.getItem(COMPOSER_REASONING_STRENGTH_STORAGE_KEY)
  );
  const selectedFastMode = parseBooleanStorageValue(window.localStorage.getItem(COMPOSER_FAST_MODE_STORAGE_KEY));
  const appHotkeyPreferences = readAppHotkeyPreferences();
  const themePreference = parseThemePreferenceStorageValue(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY));
  const numericRightAlignmentEnabled = parseBooleanStorageValue(
    window.localStorage.getItem(NUMERIC_RIGHT_ALIGNMENT_ENABLED_STORAGE_KEY)
  );
  const experienceMode = parseExperienceModeStorageValue(window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY));
  const preferencesActiveSectionId = parsePreferencesActiveSectionStorageValue(
    window.localStorage.getItem(PREFERENCES_ACTIVE_SECTION_STORAGE_KEY)
  );

  return {
    openAiApiKey,
    googleApiKey,
    anthropicApiKey,
    providerBrand,
    debugEnabled,
    tracePanelDefaultOpen,
    subagentWorktreeStrategyDefault,
    blockChatOnDirtyGitDefault,
    dirtyGitChangeLimitDefault,
    autoCompactContextThresholdPercentDefault,
    planExecutionModeDefault,
    planExecutionDelaySecondsDefault,
    singleAgentModelPreferenceDefault,
    subagentModelPreferenceDefault,
    correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault,
    assistantAutoApproveNonBlockingQuestionsDefault,
    assistantCongestionControlEnabledDefault,
    assistantMaxCongestionDefault,
    maxBackgroundJobsDefault,
    autoArchiveCompletedThreadsDefault,
    memoryBankEnabledDefault,
    memoryBankRecordRunsDefault,
    checkCliUpdatesDefault,
    backgroundJobNotificationsEnabled,
    selectedReasoningStrength,
    selectedFastMode,
    appHotkeyPreferences,
    themePreference,
    numericRightAlignmentEnabled,
    experienceMode,
    preferencesActiveSectionId
  };
}

export function readAppHotkeyPreferences(): AppHotkeyPreferences {
  if (typeof window === "undefined") {
    return normalizeAppHotkeyPreferences(undefined);
  }

  try {
    const raw = window.localStorage.getItem(APP_HOTKEY_PREFERENCES_STORAGE_KEY);
    return normalizeAppHotkeyPreferences(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizeAppHotkeyPreferences(undefined);
  }
}

export function readTutorialProgress(): { completedTutorialIds: string[]; dismissedTutorialIds: string[] } {
  if (typeof window === "undefined") {
    return {
      completedTutorialIds: [],
      dismissedTutorialIds: []
    };
  }

  try {
    const raw = window.localStorage.getItem(TUTORIAL_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return {
        completedTutorialIds: [],
        dismissedTutorialIds: []
      };
    }

    const decoded: unknown = JSON.parse(raw);
    const parsed = isRecord(decoded) ? decoded : {};
    return {
      completedTutorialIds: Array.isArray(parsed.completedTutorialIds)
        ? parsed.completedTutorialIds.filter((value): value is string => typeof value === "string")
        : [],
      dismissedTutorialIds: Array.isArray(parsed.dismissedTutorialIds)
        ? parsed.dismissedTutorialIds.filter((value): value is string => typeof value === "string")
        : []
    };
  } catch {
    return {
      completedTutorialIds: [],
      dismissedTutorialIds: []
    };
  }
}

export function getThreadDraftStorageKey(projectId: string, threadId: string) {
  return `${THREAD_DRAFT_STORAGE_KEY_PREFIX}:${projectId}:${threadId}`;
}

export function readThreadDraft(projectId: string, threadId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(getThreadDraftStorageKey(projectId, threadId)) ?? "";
}

export function persistThreadDraft(projectId: string, threadId: string, draft: string) {
  if (typeof window === "undefined") {
    return;
  }

  const key = getThreadDraftStorageKey(projectId, threadId);
  if (!draft) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, draft);
}

export function persistLocalPreferences(input: LocalPreferencesState) {
  if (typeof window === "undefined") {
    return;
  }

  // Provider credentials belong to the CLI credential store. Never mirror a
  // draft into browser storage, and scrub keys left by older releases.
  window.localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
  window.localStorage.removeItem(GOOGLE_API_KEY_STORAGE_KEY);
  window.localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE_KEY);
  persistProviderBrandStorageValue(PROVIDER_BRAND_STORAGE_KEY, input.providerBrand);
  persistBooleanStorageValue(DEBUG_ENABLED_STORAGE_KEY, input.debugEnabled);
  persistBooleanStorageValue(TRACE_PANEL_DEFAULT_OPEN_STORAGE_KEY, input.tracePanelDefaultOpen);
  persistStorageValue(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_STORAGE_KEY, input.subagentWorktreeStrategyDefault);
  persistBooleanStorageValue(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_STORAGE_KEY, input.blockChatOnDirtyGitDefault);
  persistIntegerStorageValue(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_STORAGE_KEY, input.dirtyGitChangeLimitDefault, 0, 10000);
  persistIntegerStorageValue(
    AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_STORAGE_KEY,
    input.autoCompactContextThresholdPercentDefault,
    10,
    95
  );
  persistStorageValue(PLAN_EXECUTION_MODE_DEFAULT_STORAGE_KEY, input.planExecutionModeDefault);
  persistIntegerStorageValue(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_STORAGE_KEY, input.planExecutionDelaySecondsDefault, 0, 300);
  persistStorageValue(SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY, input.singleAgentModelPreferenceDefault);
  persistStorageValue(SUBAGENT_MODEL_PREFERENCE_DEFAULT_STORAGE_KEY, input.subagentModelPreferenceDefault);
  persistStorageValue(CORRECTNESS_ITERATION_MODE_DEFAULT_STORAGE_KEY, input.correctnessIterationModeDefault);
  persistStorageValue(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_STORAGE_KEY, input.backgroundJobApprovalPolicyDefault);
  persistBooleanStorageValue(
    ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_STORAGE_KEY,
    input.assistantAutoApproveNonBlockingQuestionsDefault
  );
  persistBooleanStorageValue(
    ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_STORAGE_KEY,
    input.assistantCongestionControlEnabledDefault
  );
  persistDecimalStorageValue(ASSISTANT_MAX_CONGESTION_DEFAULT_STORAGE_KEY, input.assistantMaxCongestionDefault, 0.25, 3, 0.25);
  persistIntegerStorageValue(MAX_BACKGROUND_JOBS_DEFAULT_STORAGE_KEY, input.maxBackgroundJobsDefault, 5, 100);
  persistBooleanStorageValue(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_STORAGE_KEY, input.autoArchiveCompletedThreadsDefault);
  persistBooleanStorageValue(MEMORY_BANK_ENABLED_DEFAULT_STORAGE_KEY, input.memoryBankEnabledDefault);
  persistBooleanStorageValue(MEMORY_BANK_RECORD_RUNS_DEFAULT_STORAGE_KEY, input.memoryBankRecordRunsDefault);
  persistBooleanStorageValue(CHECK_CLI_UPDATES_DEFAULT_STORAGE_KEY, input.checkCliUpdatesDefault);
  persistBooleanStorageValue(BACKGROUND_JOB_NOTIFICATIONS_ENABLED_STORAGE_KEY, input.backgroundJobNotificationsEnabled);
  persistStorageValue(COMPOSER_REASONING_STRENGTH_STORAGE_KEY, input.selectedReasoningStrength);
  persistBooleanStorageValue(COMPOSER_FAST_MODE_STORAGE_KEY, input.selectedFastMode);
  persistAppHotkeyPreferences(input.appHotkeyPreferences);
  persistThemePreference(input.themePreference);
  persistBooleanStorageValue(NUMERIC_RIGHT_ALIGNMENT_ENABLED_STORAGE_KEY, input.numericRightAlignmentEnabled);
  persistStorageValue(EXPERIENCE_MODE_STORAGE_KEY, input.experienceMode);
  persistStorageValue(PREFERENCES_ACTIVE_SECTION_STORAGE_KEY, input.preferencesActiveSectionId);
}

function persistAppHotkeyPreferences(input: AppHotkeyPreferences | undefined) {
  if (!input) {
    window.localStorage.removeItem(APP_HOTKEY_PREFERENCES_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(APP_HOTKEY_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeAppHotkeyPreferences(input)));
}

function readAndScrubLegacyProviderApiKeys() {
  const openAiApiKey = window.localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)?.trim() || undefined;
  const googleApiKey = window.localStorage.getItem(GOOGLE_API_KEY_STORAGE_KEY)?.trim() || undefined;
  const anthropicApiKey = window.localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY)?.trim() || undefined;
  window.localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
  window.localStorage.removeItem(GOOGLE_API_KEY_STORAGE_KEY);
  window.localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE_KEY);
  return { openAiApiKey, googleApiKey, anthropicApiKey };
}

function persistThemePreference(input: ThemePreference | undefined) {
  if (!input) {
    window.localStorage.removeItem(THEME_PREFERENCE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, JSON.stringify(normalizeThemePreference(input)));
}

export function persistMergedLocalPreferences(input: LocalPreferencesState) {
  persistLocalPreferences({
    ...readLocalPreferences(),
    ...input
  });
}

function persistComposerControlPreferences(state: HarnessViewState) {
  persistLocalPreferences({
    ...readLocalPreferences(),
    selectedReasoningStrength: state.hasGlobalSelectedReasoningStrength ? state.selectedReasoningStrength : undefined,
    selectedFastMode: state.hasGlobalSelectedFastMode ? state.selectedFastMode : undefined
  });
}

export function persistTutorialProgress(input: { completedTutorialIds: string[]; dismissedTutorialIds: string[] }) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    TUTORIAL_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      completedTutorialIds: [...new Set(input.completedTutorialIds)],
      dismissedTutorialIds: [...new Set(input.dismissedTutorialIds)]
    })
  );
}

export function readBrowserUiSession(): BrowserUiSessionState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_UI_SESSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const decoded: unknown = JSON.parse(raw);
    const parsed = isRecord(decoded) ? decoded : {};
    const lastActiveThreadByProjectId =
      parsed.lastActiveThreadByProjectId && typeof parsed.lastActiveThreadByProjectId === "object"
        ? Object.fromEntries(
            Object.entries(parsed.lastActiveThreadByProjectId).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
            )
          )
        : undefined;

    const result: BrowserUiSessionState = {};
    if (typeof parsed.selectedModeId === "string") {
      result.selectedModeId = parsed.selectedModeId;
    }
    if (parsed.selectedAgentId === "pi" || parsed.selectedAgentId === "copilot-cli" || parsed.selectedAgentId === "codex-cli") {
      result.selectedAgentId = parsed.selectedAgentId;
    }
    if (typeof parsed.selectedExecutionModelId === "string") {
      result.selectedExecutionModelId = parseExecutionModelId(parsed.selectedExecutionModelId);
    }
    if (isComposerReasoningStrength(parsed.selectedReasoningStrength)) {
      result.selectedReasoningStrength = parsed.selectedReasoningStrength;
    }
    if (typeof parsed.selectedFastMode === "boolean") {
      result.selectedFastMode = parsed.selectedFastMode;
    }
    if (isTracePanelMode(parsed.tracePanelMode)) {
      result.tracePanelMode = parsed.tracePanelMode;
    } else if (typeof parsed.tracePanelOpen === "boolean") {
      result.tracePanelMode = parsed.tracePanelOpen ? "open" : "closed";
    }
    if (typeof parsed.tracePanelOpen === "boolean") {
      result.tracePanelOpen = parsed.tracePanelOpen;
    }
    if (typeof parsed.activeLeftTab === "string") {
      result.activeLeftTab = normalizeLeftTab(parsed.activeLeftTab);
    }
    if (isRecord(parsed.mainPanelSizes)) {
      result.mainPanelSizes = normalizeMainPanelSizes(parsed.mainPanelSizes);
    }
    if (typeof parsed.chatPaneTab === "string") {
      result.chatPaneTab = normalizeChatPaneTab(parsed.chatPaneTab);
    }
    if (isRecord(parsed.assistantPane)) {
      result.assistantPane = {
        scopeFilter: normalizeAssistantScopeFilter(parsed.assistantPane.scopeFilter),
        rosterSearch: normalizeSearchText(parsed.assistantPane.rosterSearch),
        detailSearch: normalizeSearchText(parsed.assistantPane.detailSearch),
        runState: normalizeAssistantRunStateFilter(parsed.assistantPane.runState),
        bootstrapState: normalizeAssistantBootstrapStateFilter(parsed.assistantPane.bootstrapState),
        providerBrand: normalizeAssistantProviderBrandFilter(parsed.assistantPane.providerBrand),
        projectId: normalizeOptionalStorageString(parsed.assistantPane.projectId),
        rosterSort: normalizeAssistantRosterSort(parsed.assistantPane.rosterSort),
        selectedAssistantId: normalizeOptionalStorageString(parsed.assistantPane.selectedAssistantId),
        selectedTab: normalizeAssistantDetailTab(parsed.assistantPane.selectedTab),
        selectedLogDetailsId: normalizeOptionalStorageString(parsed.assistantPane.selectedLogDetailsId)
      };
    }
    if (isRecord(parsed.jobsPane)) {
      result.jobsPane = {
        ...normalizeJobsPanePreferences(parsed.jobsPane),
        // Exact workload records are bounded server state; stale ids cannot be
        // restored safely without their project ownership after a reconnect.
        selectedJobId: undefined,
        selectedRunId: undefined,
        runFilter: normalizeJobsRunFilter(parsed.jobsPane.runFilter)
      };
    }
    if (typeof parsed.lastActiveProjectId === "string") {
      result.lastActiveProjectId = parsed.lastActiveProjectId;
    }
    if (lastActiveThreadByProjectId) {
      result.lastActiveThreadByProjectId = lastActiveThreadByProjectId;
    }
    return result;
  } catch {
    return {};
  }
}

export function readProjectSidebarPreferences(): ProjectSidebarPreferences {
  if (typeof window === "undefined") {
    return createDefaultProjectSidebarPreferences();
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return createDefaultProjectSidebarPreferences();
    }

    return normalizeProjectSidebarPreferences(JSON.parse(raw), []);
  } catch {
    return createDefaultProjectSidebarPreferences();
  }
}

export function persistProjectSidebarPreferences(input: ProjectSidebarPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROJECT_SIDEBAR_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeProjectSidebarPreferences(input, [])));
}

export function persistBrowserUiSession(input: BrowserUiSessionState) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedInput: BrowserUiSessionState = {
    selectedModeId: input.selectedModeId?.trim() || undefined,
    selectedAgentId: input.selectedAgentId,
    selectedExecutionModelId: parseExecutionModelId(input.selectedExecutionModelId),
    selectedReasoningStrength: input.selectedReasoningStrength,
    selectedFastMode: input.selectedFastMode,
    tracePanelMode: input.tracePanelMode ? normalizeTracePanelMode(input.tracePanelMode) : undefined,
    tracePanelOpen: input.tracePanelOpen,
    activeLeftTab: input.activeLeftTab ? normalizeLeftTab(input.activeLeftTab) : undefined,
    mainPanelSizes: input.mainPanelSizes ? normalizeMainPanelSizes(input.mainPanelSizes) : undefined,
    lastActiveProjectId: input.lastActiveProjectId?.trim() || undefined,
    lastActiveThreadByProjectId: input.lastActiveThreadByProjectId
      ? Object.fromEntries(
          Object.entries(input.lastActiveThreadByProjectId).filter(
            (entry): entry is [string, string] => Boolean(entry[0]?.trim()) && Boolean(entry[1]?.trim())
          )
        )
      : undefined,
    chatPaneTab: input.chatPaneTab ? normalizeChatPaneTab(input.chatPaneTab) : undefined,
    assistantPane: input.assistantPane
      ? {
          scopeFilter: input.assistantPane.scopeFilter
            ? normalizeAssistantScopeFilter(input.assistantPane.scopeFilter)
            : undefined,
          rosterSearch: normalizeSearchText(input.assistantPane.rosterSearch),
          detailSearch: normalizeSearchText(input.assistantPane.detailSearch),
          runState: normalizeAssistantRunStateFilter(input.assistantPane.runState),
          bootstrapState: normalizeAssistantBootstrapStateFilter(input.assistantPane.bootstrapState),
          providerBrand: normalizeAssistantProviderBrandFilter(input.assistantPane.providerBrand),
          projectId: normalizeOptionalStorageString(input.assistantPane.projectId),
          rosterSort: input.assistantPane.rosterSort ? normalizeAssistantRosterSort(input.assistantPane.rosterSort) : undefined,
          selectedAssistantId: normalizeOptionalStorageString(input.assistantPane.selectedAssistantId),
          selectedTab: input.assistantPane.selectedTab ? normalizeAssistantDetailTab(input.assistantPane.selectedTab) : undefined,
          selectedLogDetailsId: normalizeOptionalStorageString(input.assistantPane.selectedLogDetailsId)
        }
      : undefined,
    jobsPane: input.jobsPane
      ? {
          ...normalizeJobsPanePreferences(input.jobsPane),
          selectedJobId: undefined,
          selectedRunId: undefined,
          runFilter: input.jobsPane.runFilter ? normalizeJobsRunFilter(input.jobsPane.runFilter) : undefined
        }
      : undefined
  };

  if (
    !normalizedInput.selectedModeId &&
    !normalizedInput.selectedAgentId &&
    !normalizedInput.selectedExecutionModelId &&
    !normalizedInput.selectedReasoningStrength &&
    normalizedInput.selectedFastMode === undefined &&
    normalizedInput.tracePanelMode === undefined &&
    normalizedInput.tracePanelOpen === undefined &&
    normalizedInput.activeLeftTab === undefined &&
    normalizedInput.mainPanelSizes === undefined &&
    normalizedInput.chatPaneTab === undefined &&
    normalizedInput.assistantPane === undefined &&
    normalizedInput.jobsPane === undefined &&
    !normalizedInput.lastActiveProjectId &&
    (!normalizedInput.lastActiveThreadByProjectId || Object.keys(normalizedInput.lastActiveThreadByProjectId).length === 0)
  ) {
    window.localStorage.removeItem(BROWSER_UI_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(BROWSER_UI_SESSION_STORAGE_KEY, JSON.stringify(normalizedInput));
}

export function getBrowserUiSessionRestoreCommands(
  state: HarnessViewState,
  browserUiSession: BrowserUiSessionState
): ClientCommand[] {
  const projects = state.workspace.projects;
  if (projects.length === 0) {
    return [];
  }

  const targetProject =
    (browserUiSession.lastActiveProjectId
      ? projects.find((project) => project.id === browserUiSession.lastActiveProjectId)
      : undefined) ?? getActiveProject(state);
  if (!targetProject) {
    return [];
  }

  const commands: ClientCommand[] = [];
  if (state.workspace.activeProjectId !== targetProject.id) {
    commands.push({
      type: "project.activate",
      requestId: crypto.randomUUID(),
      payload: {
        projectId: targetProject.id
      }
    });
  }

  const targetThreadId = resolveBrowserUiSessionTargetThreadId(
    targetProject,
    browserUiSession.lastActiveThreadByProjectId?.[targetProject.id]
  );
  if (
    targetThreadId &&
    targetThreadId !== targetProject.activeThreadId &&
    targetProject.threads.some((thread) => thread.id === targetThreadId && thread.kind === "user")
  ) {
    commands.push({
      type: "thread.activate",
      requestId: crypto.randomUUID(),
      payload: {
        projectId: targetProject.id,
        threadId: targetThreadId
      }
    });
  }

  return commands;
}

function resolveBrowserUiSessionTargetThreadId(
  project: ViewProjectState,
  rememberedThreadId: string | undefined
) {
  return (
    project.threads.find((thread) => thread.id === rememberedThreadId && thread.kind === "user" && thread.status === "active")?.id ??
    project.threads.find((thread) => thread.id === project.activeThreadId && thread.kind === "user" && thread.status === "active")?.id ??
    project.threads.find((thread) => thread.kind === "user" && thread.status === "active")?.id
  );
}

function getBrowserUiSessionSnapshot(state: HarnessViewState): BrowserUiSessionState {
  return {
    selectedModeId: state.hasGlobalSelectedModeId ? state.selectedModeId : undefined,
    selectedAgentId: state.hasGlobalSelectedAgentId ? state.selectedAgentId : undefined,
    selectedExecutionModelId: state.hasGlobalSelectedExecutionModelId ? state.selectedExecutionModelId : undefined,
    selectedReasoningStrength: state.hasGlobalSelectedReasoningStrength ? state.selectedReasoningStrength : undefined,
    selectedFastMode: state.hasGlobalSelectedFastMode ? state.selectedFastMode : undefined,
    tracePanelMode: state.hasPersistedTracePanelOpen ? state.tracePanelMode : undefined,
    activeLeftTab: state.activeLeftTab,
    mainPanelSizes: { ...state.mainPanelSizes },
    chatPaneTab: state.chatPaneTab,
    assistantPane: {
      scopeFilter: state.assistants.scopeFilter,
      rosterSearch: state.assistants.rosterSearch,
      detailSearch: state.assistants.detailSearch,
      runState: state.assistants.runStateFilter,
      bootstrapState: state.assistants.bootstrapStateFilter,
      providerBrand: state.assistants.providerBrandFilter,
      projectId: state.assistants.projectIdFilter,
      rosterSort: state.assistants.rosterSort,
      selectedAssistantId: state.assistants.selectedAssistantId,
      selectedTab: state.assistants.selectedTab,
      selectedLogDetailsId: state.assistants.selectedLogDetailsId
    },
    jobsPane: {
      ...state.jobsPanePreferences,
      selectedJobId: undefined,
      selectedRunId: undefined,
      runFilter: state.jobsRunFilter
    },
    lastActiveProjectId: state.lastActiveProjectId,
    lastActiveThreadByProjectId: { ...state.lastActiveThreadByProjectId }
  };
}

function activeSurfaceToLeftTab(activeSurface: HarnessActiveSurface): HarnessLeftTab {
  switch (activeSurface) {
    case "assistants":
      return "assistants";
    case "background-jobs":
      return "runs";
    case "preferences":
      return "preferences";
    case "ide":
      return "projects";
    case "chat":
      return "projects";
  }
}

function leftTabToActiveSurface(activeLeftTab: HarnessLeftTab): HarnessActiveSurface {
  switch (activeLeftTab) {
    case "assistants":
      return "assistants";
    case "runs":
    case "jobs":
      return "background-jobs";
    case "preferences":
      return "preferences";
    case "projects":
      return "chat";
  }
}

function normalizeLeftTab(input: unknown): HarnessLeftTab {
  return input === "assistants" || input === "jobs" || input === "runs" || input === "projects" || input === "preferences" ? input : "projects";
}

function normalizeChatPaneTab(input: unknown): ChatPaneTab {
  return input === "chat" || input === "plan" || input === "run" || input === "events" || input === "memory" ? input : "chat";
}

function isTracePanelMode(input: unknown): input is TracePanelMode {
  return input === "closed" || input === "peek" || input === "open";
}

function normalizeTracePanelMode(input: unknown): TracePanelMode {
  return isTracePanelMode(input) ? input : "closed";
}

function normalizeAssistantDetailTab(input: unknown): AssistantDetailTab {
  return input === "chat" ||
    input === "todos" ||
    input === "questions" ||
    input === "jobs" ||
    input === "log" ||
    input === "config" ||
    input === "learnings"
    ? input
    : "chat";
}

function normalizeAssistantScopeFilter(input: unknown): AssistantScopeFilter {
  return input === "all" || input === "global" || input === "project" ? input : "project";
}

function normalizeSearchText(input: unknown) {
  return typeof input === "string" ? input.slice(0, 512) : "";
}

function normalizeAssistantRunStateFilter(input: unknown): Assistant["runState"] | undefined {
  return input === "active" || input === "paused" ? input : undefined;
}

function normalizeAssistantBootstrapStateFilter(input: unknown): Assistant["bootstrapState"] | undefined {
  return input === "pending" || input === "running" || input === "completed" || input === "failed" ? input : undefined;
}

function normalizeAssistantProviderBrandFilter(input: unknown): Assistant["providerBrand"] | undefined {
  return input === "gpt" || input === "gemini" || input === "claude" ? input : undefined;
}

function normalizeAssistantRosterSort(input: unknown): AssistantRosterSort {
  return input === "updated" || input === "created" || input === "name" || input === "run-state" || input === "bootstrap-state"
    ? input
    : "updated";
}

function normalizeJobsPaneSegment(input: unknown): JobsPaneSegment {
  return input === "jobs" || input === "inbox" || input === "health" ? input : "inbox";
}

function normalizeJobsPaneJobSort(input: unknown): JobsPaneJobSort {
  return input === "next-run" || input === "updated" || input === "created" || input === "status" || input === "risk"
    ? input
    : "next-run";
}

function normalizeJobsPaneRunSort(input: unknown): JobsPaneRunSort {
  return input === "urgency" || input === "updated" || input === "queued" || input === "status" ? input : "urgency";
}

function normalizeJobsRunFilter(input: unknown): JobsRunFilter {
  return input === "all" ||
    input === "approval" ||
    input === "input" ||
    input === "queued" ||
    input === "running" ||
    input === "failed" ||
    input === "done"
    ? input
    : "all";
}

function normalizeJobsJobStateFilter(input: unknown): JobsJobStateFilter {
  return input === "all" ||
    input === "idle" ||
    input === "due" ||
    input === "queued" ||
    input === "blocked" ||
    input === "running" ||
    input === "stale" ||
    input === "backoff"
    ? input
    : "all";
}

function normalizeJobsPanePreferences(input: unknown, state?: HarnessViewState, clearMissingIds: boolean = false): JobsPanePreferences {
  const source = isRecord(input) ? input : {};
  const preferences: JobsPanePreferences = {
    segment: normalizeJobsPaneSegment(source.segment),
    search: typeof source.search === "string" ? source.search : "",
    jobSearch: normalizeSearchText(source.jobSearch ?? source.search),
    runSearch: normalizeSearchText(source.runSearch ?? source.search),
    jobSort: normalizeJobsPaneJobSort(source.jobSort),
    runSort: normalizeJobsPaneRunSort(source.runSort),
    kind: source.kind === "ai-routine" || source.kind === "shell" ? source.kind : undefined,
    status: source.status === "enabled" || source.status === "paused" || source.status === "disabled" ? source.status : undefined,
    jobState: normalizeJobsJobStateFilter(source.jobState),
    risk: source.risk === "safe" || source.risk === "slightly-unsafe" || source.risk === "unsafe" ? source.risk : undefined,
    selectedJobId: normalizeOptionalStorageString(source.selectedJobId),
    selectedRunId: normalizeOptionalStorageString(source.selectedRunId),
    selectedNotificationId: normalizeOptionalStorageString(source.selectedNotificationId)
  };

  if (!state) {
    return preferences;
  }

  const jobIds = new Set(state.backgroundJobs.jobs.map((job) => job.id));
  const runIds = new Set(state.backgroundJobs.runs.map((run) => run.id));
  const notificationIds = new Set(state.notifications.items.map((notification) => notification.id));

  return {
    ...preferences,
    selectedJobId:
      preferences.selectedJobId && (jobIds.has(preferences.selectedJobId) || (!clearMissingIds && jobIds.size === 0))
        ? preferences.selectedJobId
        : undefined,
    selectedRunId:
      preferences.selectedRunId && (runIds.has(preferences.selectedRunId) || (!clearMissingIds && runIds.size === 0))
        ? preferences.selectedRunId
        : undefined,
    selectedNotificationId:
      preferences.selectedNotificationId &&
      (notificationIds.has(preferences.selectedNotificationId) || (!clearMissingIds && notificationIds.size === 0))
        ? preferences.selectedNotificationId
        : undefined
  };
}

function normalizeOptionalStorageString(input: unknown) {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}


function normalizeAssistantsViewState(state: HarnessViewState): ViewAssistantsState {
  const scopeFilter = normalizeAssistantScopeFilter(state.assistants.scopeFilter);
  const visibleAssistants = state.assistants.assistants.filter((assistant) =>
    scopeFilter === "all"
      ? true
      : scopeFilter === "global"
      ? assistant.scope === "global"
      : assistant.scope === "project" && assistant.projectId === state.workspace.activeProjectId
  );
  const selectedAssistantId = normalizeOptionalStorageString(state.assistants.selectedAssistantId);
  const selectedLogDetailsId = normalizeOptionalStorageString(state.assistants.selectedLogDetailsId);

  return {
    ...state.assistants,
    scopeFilter,
    selectedAssistantId:
      selectedAssistantId &&
      (visibleAssistants.some((assistant) => assistant.id === selectedAssistantId) || state.assistants.assistants.length === 0)
        ? selectedAssistantId
        : visibleAssistants[0]?.id,
    selectedTab: normalizeAssistantDetailTab(state.assistants.selectedTab),
    selectedLogDetailsId:
      selectedLogDetailsId && (state.assistants.logs.some((entry) => entry.id === selectedLogDetailsId) || state.assistants.logs.length === 0)
        ? selectedLogDetailsId
        : undefined
  };
}

function finalizeHarnessViewState(state: HarnessViewState): HarnessViewState {
  const activeProject = getActiveProject(state);
  const availableModes = resolveModeCatalog(state.workspace.workspaceModes, activeProject?.projectModes ?? []);
  const fallbackModeId =
    resolveModeById(activeProject?.selectedModeId ?? DEFAULT_MODE_ID, state.workspace.workspaceModes, activeProject?.projectModes ?? [])
      ?.id ?? DEFAULT_MODE_ID;
  const selectedModeId =
    state.hasGlobalSelectedModeId && (state.selectedModeId === "auto" || availableModes.some((mode) => mode.id === state.selectedModeId))
      ? state.selectedModeId
      : fallbackModeId;
  const selectedAgentId =
    state.hasGlobalSelectedAgentId && state.availableAgents.some((agent) => agent.id === state.selectedAgentId)
      ? state.selectedAgentId
      : resolveProjectSelectedAgentId(state, activeProject);
  const selectedExecutionModelId = resolveSelectedExecutionModelId(state, activeProject, selectedAgentId);
  const composerControls = resolveComposerControlState(state, selectedAgentId, selectedExecutionModelId);
  const validProjectIds = new Set(state.workspace.projects.map((project) => project.id));
  const lastActiveThreadByProjectId = Object.fromEntries(
    Object.entries(state.lastActiveThreadByProjectId).filter(([projectId, threadId]) => {
      const project = state.workspace.projects.find((entry) => entry.id === projectId);
      return Boolean(project && project.threads.some((thread) => thread.id === threadId && thread.kind === "user"));
    })
  );
  const activeThread = activeProject?.threads.find((thread) => thread.id === activeProject.activeThreadId);
  const rememberActiveProjectThread = state.activeSurface === "chat" && activeThread?.kind === "user";
  if (activeProject && rememberActiveProjectThread) {
    lastActiveThreadByProjectId[activeProject.id] = activeProject.activeThreadId;
  }

  const nextLastActiveProjectId =
    (rememberActiveProjectThread ? activeProject?.id : undefined) ??
    (state.lastActiveProjectId && validProjectIds.has(state.lastActiveProjectId) ? state.lastActiveProjectId : undefined);
  const projectSidebarPreferences = normalizeProjectSidebarPreferences(
    state.projectSidebarPreferences,
    state.workspace.projects.map((project) => project.id)
  );
  const assistants = normalizeAssistantsViewState(state);
  const jobsPanePreferences = normalizeJobsPanePreferences(state.jobsPanePreferences, state);

  return {
    ...state,
    selectedModeId,
    selectedAgentId,
    selectedExecutionModelId,
    selectedReasoningStrength: composerControls.selectedReasoningStrength,
    selectedFastMode: state.selectedFastMode,
    chatPaneTab: normalizeChatPaneTab(state.chatPaneTab),
    assistants,
    jobsPanePreferences,
    jobsRunFilter: normalizeJobsRunFilter(state.jobsRunFilter),
    projectSidebarPreferences,
    lastActiveProjectId: nextLastActiveProjectId,
    lastActiveThreadByProjectId,
    tracePanelMode: state.hasPersistedTracePanelOpen ? state.tracePanelMode : state.tracePanelDefaultOpen ? "open" : "closed",
    tracePanelOpen:
      state.hasPersistedTracePanelOpen ? state.tracePanelMode !== "closed" : state.tracePanelDefaultOpen
  };
}


function capLiveTraceHistory(traces: AgentTrace[]) {
  return traces.length > MAX_LIVE_TRACE_HISTORY ? traces.slice(-MAX_LIVE_TRACE_HISTORY) : traces;
}

function resolveProjectSelectedAgentId(
  state: HarnessViewState,
  activeProject: Pick<ViewProjectState, "session"> | undefined
): AgentId {
  const projectAgentId = activeProject?.session.selectedAgentId;
  if (projectAgentId && projectAgentId !== "pi") {
    return projectAgentId;
  }

  const agentAvailable = state.setup.checks.find((check) => check.id === "agent-available");
  if (agentAvailable?.status === "ready" && !resolveUsablePiProviderBrand(state)) {
    const usableRuntime = state.agentRuntimes.find(
      (runtime) =>
        runtime.runtimeKind === "cli" &&
        runtime.installed &&
        runtime.authenticated &&
        runtime.supportsProgrammatic &&
        state.availableAgents.some((agent) => agent.id === runtime.agentId)
    );
    if (usableRuntime) {
      return usableRuntime.agentId;
    }
  }

  return projectAgentId ?? "pi";
}

function resolveSelectedExecutionModelId(
  state: HarnessViewState,
  project: Pick<ViewProjectState, "session"> | undefined,
  selectedAgentId: AgentId
) {
  const candidates = [
    state.hasGlobalSelectedExecutionModelId ? state.selectedExecutionModelId : undefined,
    project?.session.executionModelId,
    getFallbackExecutionModelIdForAgent(state, selectedAgentId, state.providerBrand)
  ];
  for (const modelId of candidates) {
    if (modelId && isExecutionModelIdAvailableForAgent(state, selectedAgentId, modelId, state.providerBrand)) return modelId;
  }
  return undefined;
}

function parseExecutionModelId(value: unknown): ExecutionModelId | undefined {
  const parsed = executionModelIdSchema.safeParse(typeof value === "string" ? value.trim() : value);
  return parsed.success ? parsed.data : undefined;
}

function coerceReasoningStrength(
  availableStrengths: ComposerReasoningStrength[],
  requestedStrength: ComposerReasoningStrength | undefined
) {
  const normalizedRequested = requestedStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH;
  const requestedIndex = COMPOSER_REASONING_STRENGTHS.indexOf(normalizedRequested);
  for (let index = requestedIndex; index >= 0; index -= 1) {
    const candidate = COMPOSER_REASONING_STRENGTHS[index];
    if (availableStrengths.includes(candidate)) {
      return candidate;
    }
  }

  return availableStrengths[availableStrengths.length - 1] ?? DEFAULT_COMPOSER_REASONING_STRENGTH;
}

function resolveComposerControlState(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: ExecutionModelId | undefined
) {
  const availableStrengths = getAvailableReasoningStrengthsForSelection(state, agentId, modelId);
  const requestedStrength = state.hasGlobalSelectedReasoningStrength ? state.selectedReasoningStrength : undefined;
  const selectedReasoningStrength = coerceReasoningStrength(availableStrengths, requestedStrength);
  const supportsFastMode = getSupportsFastModeForSelection(state, agentId, modelId);
  const selectedFastMode = supportsFastMode && state.hasGlobalSelectedFastMode ? state.selectedFastMode : false;

  return {
    availableStrengths,
    supportsFastMode,
    selectedReasoningStrength,
    selectedFastMode
  };
}

function normalizeTokenCount(input: unknown) {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 0;
  }
  return Math.max(0, Math.round(input));
}

function parseThemePreferenceStorageValue(value: string | null): ThemePreference | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeThemePreference(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function isProjectSidebarProjectSort(value: unknown): value is ProjectSidebarProjectSort {
  return value === "last-user-message" || value === "created-at" || value === "manual";
}

function isProjectSidebarThreadSort(value: unknown): value is ProjectSidebarThreadSort {
  return value === "last-user-message" || value === "created-at";
}

function isProjectSidebarGrouping(value: unknown): value is ProjectSidebarGrouping {
  return value === "repository" || value === "repository-path" || value === "separate";
}

function normalizeProjectSidebarPreferences(input: unknown, projectIds: string[]): ProjectSidebarPreferences {
  const defaults = createDefaultProjectSidebarPreferences();
  const parsed = isRecord(input) ? input : defaults;
  const seenProjectIds = new Set<string>();
  const manualProjectOrder = Array.isArray(parsed.manualProjectOrder)
    ? parsed.manualProjectOrder.filter((projectId): projectId is string => {
        if (typeof projectId !== "string" || !projectId.trim() || seenProjectIds.has(projectId)) {
          return false;
        }
        seenProjectIds.add(projectId);
        return projectIds.length === 0 || projectIds.includes(projectId);
      })
    : [];

  for (const projectId of projectIds) {
    if (!seenProjectIds.has(projectId)) {
      manualProjectOrder.push(projectId);
    }
  }
  const seenCollapsedProjectIds = new Set<string>();
  const collapsedProjectIds = Array.isArray(parsed.collapsedProjectIds)
    ? parsed.collapsedProjectIds.filter((projectId): projectId is string => {
        if (typeof projectId !== "string" || !projectId.trim() || seenCollapsedProjectIds.has(projectId)) {
          return false;
        }
        seenCollapsedProjectIds.add(projectId);
        return projectIds.length === 0 || projectIds.includes(projectId);
      })
    : [];

  return {
    projectSort: isProjectSidebarProjectSort(parsed.projectSort) ? parsed.projectSort : defaults.projectSort,
    threadSort: isProjectSidebarThreadSort(parsed.threadSort) ? parsed.threadSort : defaults.threadSort,
    grouping: isProjectSidebarGrouping(parsed.grouping) ? parsed.grouping : defaults.grouping,
    manualProjectOrder,
    collapsedProjectIds
  };
}

function parseSubagentWorktreeStrategyStorageValue(value: string | null) {
  return value === "same-worktree" || value === "separate-worktrees" ? value : undefined;
}

function parsePlanExecutionModeStorageValue(value: string | null) {
  return value === "countdown" || value === "approve" || value === "immediate" ? value : undefined;
}

function parseCorrectnessIterationModeStorageValue(value: string | null) {
  return value === "ask-before-iterate" || value === "auto-once" || value === "auto-until-clean" ? value : undefined;
}

function parseRunModelPreferenceStorageValue(value: string | null) {
  return value === "inference" || value === "intelligence" ? value : undefined;
}

function parseBackgroundJobApprovalPolicyStorageValue(value: string | null) {
  return value === "allow-all" || value === "allow-safe" || value === "ask-risky" || value === "always-ask"
    ? value
    : undefined;
}

function parsePreferencesActiveSectionStorageValue(value: string | null): PreferencesActiveSectionId | undefined {
  return value === "general-ui" ||
    value === "keybinds" ||
    value === "ide-settings" ||
    value === "ai-providers" ||
    value === "safety-guardrails" ||
    value === "workspace-memory" ||
    value === "usage" ||
    value === "background-jobs" ||
    value === "developer-advanced"
    ? value
    : undefined;
}

function normalizeMainPanelSizes(input: unknown): MainPanelSizes {
  const defaults = createDefaultMainPanelSizes();
  if (!isRecord(input)) {
    return defaults;
  }

  const parsed = input;
  return {
    left: clampPanelSize(parsed.left, defaults.left),
    center: clampPanelSize(parsed.center, defaults.center),
    right: clampPanelSize(parsed.right, defaults.right), ...(parsed.leftCollapsed === true ? { leftCollapsed: true } : {}),
  };
}




function persistStorageValue(key: string, value: string | undefined) {
  if (value?.trim()) {
    window.localStorage.setItem(key, value.trim());
    return;
  }

  window.localStorage.removeItem(key);
}

function persistBooleanStorageValue(key: string, value: boolean | undefined) {
  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, String(value));
}

function persistIntegerStorageValue(key: string, value: number | undefined, min: number, max: number) {
  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, String(Math.max(min, Math.min(max, Math.round(value)))));
}

function persistDecimalStorageValue(key: string, value: number | undefined, min: number, max: number, step: number) {
  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  const normalized = Math.max(min, Math.min(max, Math.round(value / step) * step));
  window.localStorage.setItem(key, normalized.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
}

function persistProviderBrandStorageValue(key: string, value: ProviderBrand | undefined) {
  if (!value) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
}

function resolveProviderBrand(state: HarnessViewState, preferences: PreferencesState): ProviderBrand {
  const preferredBrand = state.hasLocalProviderBrandPreference ? state.providerBrand : preferences.providerBrand;
  if (isProviderBrandSelectable(state, preferences, preferredBrand)) {
    return preferredBrand;
  }

  if (isProviderBrandSelectable(state, preferences, "gpt")) {
    return "gpt";
  }

  if (isProviderBrandSelectable(state, preferences, "gemini")) {
    return "gemini";
  }

  if (isProviderBrandSelectable(state, preferences, "claude")) {
    return "claude";
  }

  return preferredBrand;
}

function isProviderBrandSelectable(
  _state: Pick<
    HarnessViewState,
    | "openAiApiKeyDraft"
    | "googleApiKeyDraft"
    | "anthropicApiKeyDraft"
    | "hasLocalOpenAiApiKey"
    | "hasLocalGoogleApiKey"
    | "hasLocalAnthropicApiKey"
  >,
  _preferences: Pick<
    PreferencesState,
    | "hasUsableOpenAiApiKey"
    | "hasStoredOpenAiApiKey"
    | "hasUsableGoogleApiKey"
    | "hasStoredGoogleApiKey"
    | "hasUsableAnthropicApiKey"
    | "hasStoredAnthropicApiKey"
  >,
  _providerBrand: ProviderBrand
) {
  return true;
}

export function hasUsableApiKeyForProvider(state: HarnessViewState, providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return state.hasUsableGoogleApiKey;
  }
  if (providerBrand === "claude") {
    return state.hasUsableAnthropicApiKey;
  }
  return state.hasUsableOpenAiApiKey;
}

export function resolveUsablePiProviderBrand(state: HarnessViewState): ProviderBrand | undefined {
  if (hasUsableApiKeyForProvider(state, state.providerBrand)) {
    return state.providerBrand;
  }

  if (hasUsableApiKeyForProvider(state, "gpt")) {
    return "gpt";
  }

  if (hasUsableApiKeyForProvider(state, "gemini")) {
    return "gemini";
  }

  if (hasUsableApiKeyForProvider(state, "claude")) {
    return "claude";
  }

  return undefined;
}

export function getBlockingSetupCheck(state: HarnessViewState) {
  return state.setup.checks.find(
    (check) => check.requiredForFirstTask && (check.status === "action-required" || check.status === "warning")
  );
}

export function shouldShowSetupChecklist(state: HarnessViewState) {
  return (
    state.setupChecklistOpen ||
    state.setup.checks.some((check) => check.requiredForFirstTask && check.status !== "ready")
  );
}

export function requireActiveProject(state: HarnessViewState) {
  const project = getActiveProject(state);
  if (!project) {
    throw new Error("No active project");
  }

  return project;
}

export function canSelectProviderBrand(_state: HarnessViewState, _providerBrand: ProviderBrand) {
  return true;
}

export function getDefaultExecutionModelIdForProvider(providerBrand: ProviderBrand) {
  if (providerBrand === "gemini") {
    return "google/gemini-2.5-flash";
  }
  if (providerBrand === "claude") {
    return "anthropic/claude-sonnet-4-6";
  }
  return "openai/gpt-5.4";
}

export function getEffectiveProviderBrandForAgent(agentId: AgentId, providerBrand: ProviderBrand) {
  return agentId === "pi" ? providerBrand : agentId === "codex-cli" ? "gpt" : undefined;
}

export function getExecutionModelOptionsForAgent(
  state: HarnessViewState,
  agentId: AgentId,
  providerBrand: ProviderBrand
): Array<{ modelId: string; label: string }> {
  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
    const modelIds = [...new Set([...(runtime?.discoveredModels ?? []), ...(runtime?.activeModel ? [runtime.activeModel] : [])])];
    if (modelIds.length > 0) {
      return modelIds.map((modelId) => ({
        modelId,
        label: getModelCapability(state, modelId)?.label ?? modelId
      }));
    }

    if (agentId === "codex-cli") {
      return [];
    }
  }

  const effectiveProviderBrand = getEffectiveProviderBrandForAgent(agentId, providerBrand) ?? "gpt";
  const provider = state.capabilities.find((entry) => entry.providerBrand === effectiveProviderBrand);
  return (provider?.models ?? []).map((model) => ({
    modelId: model.modelId,
    label: model.label
  }));
}

export function isExecutionModelIdAvailableForAgent(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined,
  providerBrand: ProviderBrand
) {
  if (!modelId) {
    return false;
  }

  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
    const discovered = runtime?.activeModel === modelId || runtime?.discoveredModels.includes(modelId) || false;
    if (discovered) {
      return true;
    }

    if (agentId === "codex-cli") {
      return false;
    }
  }

  const effectiveProviderBrand = getEffectiveProviderBrandForAgent(agentId, providerBrand) ?? "gpt";
  return isModelIdForProvider(modelId, effectiveProviderBrand);
}

export function getFallbackExecutionModelIdForAgent(
  state: HarnessViewState,
  agentId: AgentId,
  providerBrand: ProviderBrand
): ExecutionModelId {
  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
    return parseExecutionModelId(runtime?.activeModel ?? runtime?.discoveredModels[0]) ??
      getDefaultExecutionModelIdForProvider("gpt");
  }

  return getDefaultExecutionModelIdForProvider(getEffectiveProviderBrandForAgent(agentId, providerBrand) ?? "gpt");
}

export function resolveExecutionModelIdForProject(
  state: HarnessViewState,
  project: Pick<ViewProjectState, "id" | "session">
) {
  return (
    resolveSelectedExecutionModelId(state, project, state.selectedAgentId) ??
    getFallbackExecutionModelIdForAgent(state, state.selectedAgentId, state.providerBrand)
  );
}

export function getResolvedModes(state: HarnessViewState, project = getActiveProject(state)) {
  return resolveModeCatalog(state.workspace.workspaceModes, project?.projectModes ?? []);
}

export function getActiveMode(state: HarnessViewState, project = getActiveProject(state)) {
  const hasValidGlobalMode =
    state.hasGlobalSelectedModeId &&
    state.selectedModeId !== "auto" &&
    Boolean(resolveModeById(state.selectedModeId, state.workspace.workspaceModes, project?.projectModes ?? []));
  const modeId = hasValidGlobalMode ? state.selectedModeId : project?.selectedModeId ?? DEFAULT_MODE_ID;
  return resolveModeById(modeId, state.workspace.workspaceModes, project?.projectModes ?? []);
}

export function getComposerControlState(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined
) {
  return resolveComposerControlState(state, agentId, parseExecutionModelId(modelId));
}

export { isModelIdForProvider } from "./store/preferences/model-capabilities";
