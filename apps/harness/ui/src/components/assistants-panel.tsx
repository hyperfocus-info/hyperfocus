import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type JSX, type Setter } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, ArrowUpRight, Brain, Bot, Calendar, Check, CheckSquare2, CircleAlert, CirclePause,
  CircleHelp, CirclePlay, ClipboardList, CopyPlus, Cpu, FlaskConical, Folder, Gauge, Globe, ListFilter, ListChecks,
  Logs, MessageSquare, Plus, RefreshCcw, Save, Split, Square, SquarePen, Trash2 } from "lucide-solid";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import {
  createAssistantTodoId,
  type BackgroundJob,
  type BackgroundJobRun,
  createRequestId,
  type Assistant,
  type AssistantLearning,
  type AssistantQuestion,
  type AssistantTodo,
  type BulkOperationAction,
  type BulkOperationTarget,
  type ComposerReasoningStrength,
} from "@hyperfocus/ai-core/protocol";
import { resolveModeCatalog } from "@hyperfocus/ai-core/modes";
import { getAssistantQuestionDefaultChoices } from "../assistant-question-defaults";
import { formatShortTimestamp, resolveBrowserTimezone } from "../lib/time-format";
import { cn, toProperCase } from "../lib/utils";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import { findChatFileReferenceAtPosition, type ChatFileLinkContext, type ChatFileTarget } from "../lib/chat-file-links";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { openIdeWindow } from "../lib/ide-window";
import { openAssistantLogEntrySource } from "../source-navigation";
import { submitOnEnter } from "../textarea-submit";
import { type AssistantEditorDraft, type AssistantDetailTab, type BackgroundJobEditorDraft, COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH, type AssistantRosterSort, getComposerControlState, getExecutionModelOptionsForAgent,
  getSelectedAssistant, getVisibleAssistants, harnessStore } from "../harness-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { MarkdownContent } from "./markdown-content";
import { Button } from "./primitives/button";
import { ChatComposer } from "./primitives/chat-composer";
import { ContextMenu, type ContextMenuAction } from "./primitives/context-menu";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Dialog } from "./primitives/dialog";
import { ExecutionLog, type ExecutionLogEntry } from "./primitives/execution-log";
import { DetailEmptyState, LeftPaneEmptyState, LeftPaneFilterBlock, LeftPaneHeader, LeftPaneListSection,
  LeftPaneSearchInput, LeftPaneSearchMenu, LeftPaneShell, type LeftPaneSearchMenuItem } from "./primitives/left-pane";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { StatusChip, type StatusChipTone } from "./primitives/status-chip";
import { ScrollArea } from "./primitives/scroll-area";
import { Textarea } from "./primitives/textarea";
import { VirtualList } from "./primitives/virtual-list";
import { rightAlignedNumbersEnabled } from "../lib/visual-flags";
import { assistantPanelStyles, assistantUtilityStyles } from "./assistants-panel.styles";
import { createAssistantWorkloadController, type AssistantWorkloadCollectionState } from "../assistant-workload-state";
import { ASSISTANT_DETAIL_CACHE_LIMIT, assistantDetailCollectionForTab, createAssistantDetailPageCommand } from "../store/assistant-detail-state";
import { AssistantRosterPagination, createAssistantRosterPaginationController, createFilteredAssistantRoster } from "./assistants/roster-pagination";
import { QuestionColumn } from "./assistants/question-column";
import { AssistantDetailHeader } from "./assistants/assistant-detail-header";
import { AssistantCircuitBreakerDialog } from "./assistants/assistant-recovery-dialog";
import {
  AssistantConfigTab,
  AssistantDetailNavigation,
  AssistantLogTab,
  AssistantQuestionsTab,
} from "./assistants/assistant-detail-secondary-tabs";
import { useHarnessStore } from "../store-providers";
import {
  assistantRunStateTone,
  summarizePrompt,
  tooltipWithPrimaryHotkey,
  toggleAssistantSelectionId,
} from "./assistants/assistant-panel-model";
export { assistantWorkloadEmptyMessage } from "./assistants/assistant-panel-model";
import { AssistantJobsTab } from "./assistants/assistant-jobs-tab";
import { AssistantDetailPageControl } from "./assistants/assistant-detail-page-control";
import { AssistantTodosTab } from "./assistants/assistant-todos-tab";


import { AssistantChatTab } from "./assistants/assistant-chat-tab";













import { createAssistantsPanelController, type AssistantsPanelController, type AssistantsPanelProps } from "./assistants/assistant-panel-controller";
export type { AssistantsPanelController } from "./assistants/assistant-panel-controller";

export function AssistantsPanel(props?: AssistantsPanelProps) {
  return <AssistantsPanelView controller={createAssistantsPanelController(props)} />;
}

function AssistantsPanelView(props: { controller: AssistantsPanelController }) {
  const {
    activateJobsTab, activeTab, answerQuestion, assistantChatExecutionModelId,
    assistantChatFastMode, assistantChatFastModeOptions, assistantChatFileLinks,
    assistantChatModeId, assistantChatModeOptions, assistantChatModelOptions,
    assistantChatReasoningOptions, assistantChatReasoningStrength, assistantChatRows,
    assistantJobsEmptyMessage, assistantRunsEmptyMessage, assistantStickToBottom,
    bootstrapAssistantJobs, canBootstrapAssistantJobs, chatDraft,
    circuitBreakerAssistant, circuitBreakerFileLinks, circuitBreakerLogs,
    circuitBreakerQuestions, circuitBreakerRuns, clearAssistantSelectionTimer,
    contextMenu, createLabel, createScope, deleteLearning, deleteTodo,
    detailCollectionLabel, executionPauseReason, executionPaused, filteredLearnings,
    getAssistantFileLinks, handleAddTodo, handleAssistantCardClick,
    handleAssistantComposerClick, handleAssistantRosterKeyDown, handleDeleteAssistant,
    handleSendChat, loadMoreAssistantJobs, loadMoreAssistantRuns, newTodoTitle,
    openAssistantBackgroundJob, openAssistantBackgroundRun,
    openAssistantBulkContextMenu, openAssistantJobEditor, openAssistantLogSource,
    openCircuitBreakerJobs, openCreateAssistant, openEditAssistant,
    pendingJobSourceId, pendingRunSourceId, questionAnswers, refs, reorderLearning,
    reorderTodo, requestAssistantRosterPage, requestMoreAssistantDetail,
    retryAssistantJobs, retryAssistantRuns, retryCircuitBreaker,
    scheduleAssistantDelayedSelection, scrollAssistantChatToBottom, selectedAssetRefs,
    selectedAssistant, selectedAssistantIdSet, selectedAssistantIds,
    selectedAssistants, selectedCircuitBreakerAssistantId, selectedDetailCollection,
    selectedDetailPage, selectedExecutionLogs, selectedLearnings, selectedThread,
    selectedTodos, selectedWorkloadPage, sendAssistantBulkOperation, sendCommand,
    setAssistantChatExecutionModelId, setAssistantChatFastMode, setAssistantChatModeId,
    setAssistantChatReasoningStrength, setAssistantSelectionAnchorId, setChatDraft,
    setContextMenu, setNewTodoTitle, setQuestionAnswers, setSelectedAssistantIds,
    setSelectedCircuitBreakerAssistantId, showDetail, showRoster, state,
    updateAssistantScrollLock, updateTodo, variant, visibleAssistants, visibleJobs,
    visibleQuestions, visibleRuns, visibleTodos,
  } = props.controller;
  return (
    <LeftPaneShell
      data-test-assistants-panel=""
      kind="assistants"
      padding="comfortable"
    >
      <AssistantCircuitBreakerDialog controller={props.controller} />
      <Show when={showRoster()}>
        <LeftPaneHeader
          title="Assistants"
          help="Named operators with chat, todo list, questions inbox, learnings, jobs, and deep logs."
          actions={
            <ActionButton
              tooltip={tooltipWithPrimaryHotkey(
                createLabel(),
                normalizeAppHotkeyPreferences(state.appHotkeyPreferences)
                  .createAssistant[0],
              )}
              icon={
                <Plus
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.h4,
                      assistantUtilityStyles.w4,
                    ).class
                  }
                />
              }
              size="icon"
              variant="ghost"
              ariaLabel={createLabel()}
              onClick={() => openCreateAssistant(createScope())}
            />
          }
        />
      </Show>

      <div
        class={cn(
          stylex.attrs(
            assistantUtilityStyles.grid,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.maxWFull,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.gap4,
          ).class,
          showRoster() && showDetail()
            ? stylex.attrs(assistantUtilityStyles.xlGridColsRoster).class
            : undefined,
        )}
      >
        <AssistantRosterPane controller={props.controller} />

        <AssistantDetailPane controller={props.controller} />
      </div>
      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            open={true}
            x={menu().x}
            y={menu().y}
            ariaLabel={menu().label}
            actions={menu().actions}
            onClose={() => setContextMenu(undefined)}
          />
        )}
      </Show>
    </LeftPaneShell>
  );
}
function AssistantDetailPane(props: { controller: AssistantsPanelController }) {
  const {
    activateJobsTab, activeTab, answerQuestion, assistantChatExecutionModelId,
    assistantChatFastMode, assistantChatFastModeOptions, assistantChatFileLinks,
    assistantChatModeId, assistantChatModeOptions, assistantChatModelOptions,
    assistantChatReasoningOptions, assistantChatReasoningStrength, assistantChatRows,
    assistantJobsEmptyMessage, assistantRunsEmptyMessage, assistantStickToBottom,
    bootstrapAssistantJobs, canBootstrapAssistantJobs, chatDraft, deleteLearning,
    deleteTodo, detailCollectionLabel, executionPauseReason, executionPaused,
    filteredLearnings, handleAddTodo, handleAssistantComposerClick,
    handleDeleteAssistant, handleSendChat, loadMoreAssistantJobs,
    loadMoreAssistantRuns, newTodoTitle, openAssistantBackgroundJob,
    openAssistantBackgroundRun, openAssistantJobEditor, openAssistantLogSource,
    openEditAssistant, pendingJobSourceId, pendingRunSourceId, questionAnswers,
    refs, reorderLearning, reorderTodo, requestMoreAssistantDetail,
    retryAssistantJobs, retryAssistantRuns, scrollAssistantChatToBottom,
    selectedAssetRefs, selectedAssistant, selectedDetailCollection,
    selectedDetailPage, selectedExecutionLogs, selectedLearnings, selectedThread,
    selectedTodos, selectedWorkloadPage, sendCommand,
    setAssistantChatExecutionModelId, setAssistantChatFastMode,
    setAssistantChatModeId, setAssistantChatReasoningStrength, setChatDraft,
    setNewTodoTitle, setQuestionAnswers, setSelectedCircuitBreakerAssistantId,
    showDetail, state, updateAssistantScrollLock, updateTodo, variant,
    visibleJobs, visibleQuestions, visibleRuns, visibleTodos,
  } = props.controller;
  return (
    <Show when={showDetail()}>
      <section
        class={
          stylex.attrs(
            assistantUtilityStyles.flex,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.maxWFull,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.flexCol,
            assistantUtilityStyles.p4,
          ).class
        }
      >
        <Show
          when={selectedAssistant()}
          fallback={
            <DetailEmptyState>
              Select assistant to inspect config, chat, todos, and logs.
            </DetailEmptyState>
          }
        >
          {(assistant) => (
            <div
              class={
                stylex.attrs(
                  assistantUtilityStyles.flex,
                  assistantUtilityStyles.hFull,
                  assistantUtilityStyles.minH0,
                  assistantUtilityStyles.flexCol,
                  assistantUtilityStyles.gap4,
                ).class
              }
            >
              <AssistantDetailHeader controller={props.controller} assistant={assistant} />

              <AssistantDetailNavigation controller={props.controller} />

              <AssistantChatTab controller={props.controller} />

              <AssistantTodosTab controller={props.controller} />

              <AssistantQuestionsTab controller={props.controller} />

              <AssistantJobsTab controller={props.controller} />

              <AssistantLogTab controller={props.controller} />

              <AssistantConfigTab controller={props.controller} />

              <AssistantLearningsTab controller={props.controller} />
              <Show when={selectedDetailPage()}>
                {(page) => <AssistantDetailPageControl page={page()} label={detailCollectionLabel()}
                  messages={selectedDetailCollection() === "messages"} searching={!!state.assistants.detailSearch.trim()}
                  onLoadMore={requestMoreAssistantDetail} />}
              </Show>
            </div>
          )}
        </Show>
      </section>
    </Show>
  );
}














import { AssistantLearningsTab } from "./assistants/assistant-learnings-tab";








import { AssistantRosterPane } from "./assistants/assistant-roster-pane";




















import { activeAssistantRosterFilterCount, assistantRosterMenuItems } from "./assistants/assistant-roster-menu";
