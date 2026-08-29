import { For, Match, Show, Switch, createEffect, createMemo, createSignal, getOwner, onCleanup, onMount, runWithOwner, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  createRequestId,
  type AssistantActionMessageMetadata,
  type AgentRunState,
  type AgentRunSummary,
  type ChatAttachment,
  type ChatMessage,
  type ProviderBrand,
  type SetupAction
} from "@hyperfocus/ai-core/protocol";
import {
  canSelectProviderBrand,
  COMPOSER_REASONING_STRENGTHS,
  getEffectiveProviderBrandForAgent,
  getActiveMode,
  getCapabilityTags,
  getBlockingSetupCheck,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getFallbackExecutionModelIdForAgent,
  getModelCapability,
  getResolvedModes,
  harnessStore,
  hasUsableApiKeyForProvider,
  persistMergedLocalPreferences,
  resolveUsablePiProviderBrand,
  shouldShowSetupChecklist,
  type ChatPaneTab,
  type ViewProjectState
} from "../../harness-store";
import { ActionButton, ActionStatus } from "../action-button";
import { CliSessionPanel } from "../cli-session-panel";
import { MarkdownContent } from "../markdown-content";
import { MemoryPane } from "../../memory/memory-pane";
import { ModeEditorPanel } from "../mode-editor-panel";
import { DropdownControl } from "../primitives/dropdown";
import { ScrollArea } from "../primitives/scroll-area";
import { Textarea } from "../primitives/textarea";
import { Tooltip } from "../primitives/tooltip";
import { VirtualList } from "../primitives/virtual-list";
import { Button } from "../primitives/button";
import {
  Activity,
  AlertTriangle,
  Brain,
  Bot,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Clipboard,
  Cpu,
  Edit3,
  FolderOpen,
  Folder,
  Gauge,
  LoaderCircle,
  MessageSquareMore,
  Orbit,
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  ArrowDown,
  Check,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  SendHorizontal,
  Settings,
  Terminal,
  WandSparkles,
  X,
  Split
} from "lucide-solid";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import { chatUtilityStyles } from "../chat-panel.utilities";
import type { ChatPanelController } from "../chat-panel";

export function ChatTranscriptSurface(props: { controller: ChatPanelController }) {
  const {
    activeMode, activeProject, activeThreadIsStreaming, chatFileLinks, currentBackgroundRun,
    currentExecutionPlan, currentRun, currentTab, executionPauseReason, executionPaused,
    experimentRun, failedSubtaskCount, handleDiscardExperiment, handleInspectExperiment, handleModeSelect,
    handleOpenCurrentRunJob, handlePromoteExperiment, handlePromoteScheduledRun, handleResume, handleSaveProjectContext,
    handleSelectPaneTab, isAutoModeSelected, modeDropdownOptions, project, projectRulesDraft,
    projectTraces, refs, renderPlanRunAction, renderTranscriptRow, resumableRun,
    runDetailRecovery, runSubtasks, scrollToBottom, selectedModeValue, sendCommand,
    setProjectRulesDraft, state, stickToBottom, transcriptRows, updateScrollLock, visibleTabs,
  } = props.controller;
  return <div {...stylex.attrs(styles.paneBody)}>
            <Show when={currentTab()} keyed>
              {(selectedTab) => (
                <div {...stylex.attrs(styles.paneColumn)}>
                  <Show when={state.experienceMode === "advanced"}>
                  <div data-test-chat-pane-nav="" role="tablist" aria-label="Project panes" {...stylex.attrs(styles.paneTabs)}>
                    <div {...stylex.attrs(styles.paneTabList)}>
                      <For each={visibleTabs()}>
                        {(tab) => {
                          const pressed = selectedTab === tab.id;

                          return (
                            <Button
                              tooltip={tab.tooltip}
                              type="button"
                              role="tab"
                              variant="ghost"
                              class={stylex.attrs(styles.paneTab, pressed ? styles.paneTabSelected : styles.paneTabIdle).class}
                              aria-label={tab.label}
                              attr:aria-selected={pressed ? "true" : "false"}
                              tabIndex={pressed ? 0 : -1}
                              data-test-chat-pane-tab={tab.id}
                              onClick={() => handleSelectPaneTab(tab.id)}
                            >
                              {tab.icon}
                              <span {...stylex.attrs(styles.paneTabLabel)}>{tab.label}</span>
                            </Button>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                  </Show>
                  <Show when={resumableRun()}>
                    {(run) => (
                      <div {...stylex.attrs(styles.resumableBanner)}>
                        <div {...stylex.attrs(styles.minWidthZero)}>
                          <div {...stylex.attrs(styles.resumableHeading)}>
                            <AlertTriangle {...stylex.attrs(styles.iconSmall)} />
                            Resumable run
                          </div>
                          <div {...stylex.attrs(styles.resumableStatus)}>
                            Status: {run().status}. Failed subtasks: {failedSubtaskCount()}.
                          </div>
                          <div {...stylex.attrs(styles.resumableDetail)}>
                            Resume reruns failed or pending subtasks only. Composer text becomes extra guidance.
                          </div>
                        </div>
                        <ActionButton
                          tooltip="Resume failed or pending subagents"
                          disabledReason={
                            executionPaused()
                              ? executionPauseReason()
                              : activeThreadIsStreaming()
                                ? "Project is streaming"
                                : "No resumable run"
                          }
                          disabled={executionPaused() || !resumableRun() || activeThreadIsStreaming()}
                          icon={<RefreshCcw class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                          type="button"
                          onClick={handleResume}
                        >
                          Resume failed agents
                        </ActionButton>
                      </div>
                    )}
                  </Show>

                  <Switch>
<ChatTranscriptMessages controller={props.controller} selectedTab={selectedTab} />
<ChatTranscriptPlan controller={props.controller} selectedTab={selectedTab} />
<ChatTranscriptRun controller={props.controller} selectedTab={selectedTab} />
<ChatTranscriptEvents controller={props.controller} selectedTab={selectedTab} />
                    <Match when={selectedTab === "memory"}>
                      <MemoryPane
                        projectId={project().id}
                        entries={activeProject()?.memoryEntries ?? []}
                        fileLinks={chatFileLinks()}
                      />
                    </Match>
                  </Switch>
                </div>
              )}
            </Show>
            </div>;
}
import { CHAT_EVENT_LIMIT, CHAT_RUN_SUBTASK_LIMIT, CHAT_TRANSCRIPT_LIMIT, RunLedgerCompact, RunProofBundleCompact, estimateTranscriptRowSize } from "./chat-transcript-helpers";
import { ChatTranscriptEvents, ChatTranscriptMessages, ChatTranscriptPlan, ChatTranscriptRun } from "./chat-transcript-states";
