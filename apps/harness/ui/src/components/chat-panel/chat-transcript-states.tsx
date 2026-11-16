import { typography } from "@hyperfocus/ui";
import {
createRequestId
} from "@hyperfocus/ai-core/protocol";
import { Disclosure } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import {
ArrowDown,
Briefcase,
CalendarClock,
Split
} from "lucide-solid";
import { Match,Show } from "solid-js";
import {
harnessStore
} from "../../harness-store";
import { ActionButton,ActionStatus } from "../action-button";
import type { ChatPanelController } from "../chat-panel";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import { chatUtilityStyles } from "../chat-panel.utilities";
import { CliSessionPanel } from "../cli-session-panel";
import { MarkdownContent } from "../markdown-content";
import { ModeEditorPanel } from "../mode-editor-panel";
import { DropdownControl } from "../primitives/dropdown";
import { ScrollArea } from "../primitives/scroll-area";
import { Textarea } from "../primitives/textarea";
import { Tooltip } from "../primitives/tooltip";
import { VirtualList } from "../primitives/virtual-list";
import { chatTaskStyles as taskStyles } from "./chat-task.styles";
import { CHAT_EVENT_LIMIT,CHAT_RUN_SUBTASK_LIMIT,CHAT_TRANSCRIPT_LIMIT,RunLedgerCompact,RunProofBundleCompact,estimateTranscriptRowSize } from "./chat-transcript-helpers";
import { useChatPanel } from "./state/panel-context";

export function ChatTranscriptMessages(props: { selectedTab: ReturnType<ChatPanelController["currentTab"]> }) {
  const controller = useChatPanel();
  const {
    project, refs, renderTranscriptRow, scrollToBottom, stickToBottom,
    transcriptRows, updateScrollLock,
  } = controller;
  return <Match when={props.selectedTab === "chat"}>
                      <div class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.flex, chatUtilityStyles.minH0, chatUtilityStyles.flex1, chatUtilityStyles.flexCol).class}>
                        <Show when={project().messagesNextCursor}>
                          <ActionButton
                            tooltip="Load an older transcript page"
                            size="sm"
                            variant="secondary"
                            onClick={() => harnessStore.actions.requestEarlierProjectMessages(project().id)}
                          >
                            {project().messagesNextCursor === "__start__" ? "Load saved messages" : "Load earlier messages"}
                          </ActionButton>
                        </Show>
                        <VirtualList
                          viewportRef={(element) => {
                            refs.messageViewport = element;
                          }}
                          class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}
                    contentClass={stylex.attrs(styles.virtualContent).class}
                    itemClass={stylex.attrs(styles.virtualItem).class}
                          dataTest="project-chat-transcript"
                          items={transcriptRows()}
                          getKey={(row, index) => row.kind === "persisted" ? row.message.id : row.kind === "tool-block" ? row.block.id : `live-${row.message.id}-${index}`}
                          estimateSize={estimateTranscriptRowSize}
                          pagination={{ kind: "reverse", initialCount: CHAT_TRANSCRIPT_LIMIT, batchSize: CHAT_TRANSCRIPT_LIMIT, thresholdPx: 1000 }}
                          overscan={20}
                          stickToEnd
                          onScroll={updateScrollLock}
                          empty={
                            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minH44, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite38, chatUtilityStyles.p6, chatUtilityStyles.textCenter, typography.body, chatUtilityStyles.textVariableMuted).class}>
                              {project().messagesNextCursor
                                ? "Saved messages are not loaded yet. Use Load saved messages to retry."
                                : "No messages in this thread yet. Send a task from the composer."}
                            </div>
                          }
                        >
                          {(row) => renderTranscriptRow(row, project())}
                        </VirtualList>
                        <Show when={!stickToBottom()}>
                          <div class={stylex.attrs(chatUtilityStyles.pointerEventsNone, chatUtilityStyles.absolute, chatUtilityStyles.insetX0, chatUtilityStyles.bottom3, chatUtilityStyles.flex, chatUtilityStyles.justifyCenter).class}>
                            <div class={stylex.attrs(chatUtilityStyles.pointerEventsAuto).class}>
                              <ActionButton
                                tooltip="Scroll to latest message"
                                icon={<ArrowDown class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                                variant="secondary"
                                onClick={() => scrollToBottom(true)}
                              >
                                Scroll to latest
                              </ActionButton>
                            </div>
                          </div>
                        </Show>
                      </div>
                    </Match>;
}

export function ChatTranscriptPlan(props: { selectedTab: ReturnType<ChatPanelController["currentTab"]> }) {
  const controller = useChatPanel();
  const {
    activeMode, chatFileLinks, currentExecutionPlan, handleModeSelect, handleSaveProjectContext,
    isAutoModeSelected, modeDropdownOptions, project, projectRulesDraft, renderPlanRunAction,
    selectedModeValue, sendCommand, setProjectRulesDraft,
  } = controller;
  return <Match when={props.selectedTab === "plan"}>
                <ScrollArea class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}>
                  <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap4).class}>
                    <Show
                      when={currentExecutionPlan()}
                      fallback={
                        <div class={stylex.attrs(chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite45, chatUtilityStyles.p5, typography.body, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>
                          No saved execution plan yet. Ask for a plan from Chat, then review it here before files change.
                        </div>
                      }
                    >
                      {(plan) => (
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderVariableAccent35, chatUtilityStyles.bgWhite70, chatUtilityStyles.p4, typography.body, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
                            <div>
                              <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableAccentStrong).class}>Plan ready for review</div>
                              <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.textVariableMuted).class}>Confirm scope and verification before execution.</div>
                            </div>
                            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                              <ActionButton tooltip="Open full execution plan" size="sm" variant="secondary" onClick={() => harnessStore.openExecutionPlanDialog(plan())}>
                                Review full plan
                              </ActionButton>
                              {renderPlanRunAction(plan().runId)}
                            </div>
                          </div>
                          <MarkdownContent content={() => plan().summary} size="compact" fileLinks={chatFileLinks()} />
                        </div>
                      )}
                    </Show>

                    <div class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
                      <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap3, chatUtilityStyles.mdGridCols2).class}>
                        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
                          <span class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Active mode</span>
                          <DropdownControl
                            kind="select"
                            ariaLabel="Select active mode"
                            icon={<Split class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                            size="md"
                            class={stylex.attrs(chatUtilityStyles.wFull).class}
                            value={selectedModeValue()}
                            options={modeDropdownOptions()}
                            onChange={handleModeSelect}
                          />
                        </label>
                        <div class={stylex.attrs(chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite70, chatUtilityStyles.p3, typography.body, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>
                          {isAutoModeSelected()
                            ? "Interpret each prompt and choose the best implementation mode."
                            : activeMode()?.description ?? "Default implementation mode."}
                        </div>
                      </div>
                    </div>

                    <div class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
                      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap1).class}>
                          <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Project context</div>
                          <div class={stylex.attrs(typography.body, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>
                            Prefer the project AGENTS.md for durable direction. These explicit rules are the typed override sent to planning and execution.
                          </div>
                        </div>
                        <ActionButton tooltip="Save explicit project rules" size="sm" onClick={handleSaveProjectContext}>
                          Save rules
                        </ActionButton>
                      </div>
                      <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap3, chatUtilityStyles.pt4).class}>
                        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
                          <span class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Project rules</span>
                          <Textarea rows="8" value={projectRulesDraft()} onInput={(event) => setProjectRulesDraft(event.currentTarget.value)} />
                        </label>
                      </div>
                    </div>

                    <Show when={project().id} keyed>{projectId => <ModeEditorPanel
                      title="Project custom modes"
                      scope="project"
                      modes={project().projectModes ?? []}
                      draftOwner={harnessStore}
                      draftKey={projectId}
                      onSave={(mode) =>
                        harnessStore.actions.saveMode({
                          type: "mode.save",
                          requestId: createRequestId(),
                          payload: {
                            scope: "project",
                            projectId,
                            mode
                          }
                        })
                      }
                      onDelete={(modeId) =>
                        sendCommand({
                          type: "mode.delete",
                          requestId: createRequestId(),
                          payload: {
                            scope: "project",
                            projectId,
                            modeId
                          }
                        })
                      }
                    />}</Show>

                  </div>
                </ScrollArea>
                    </Match>;
}

export function ChatTranscriptRun(props: { selectedTab: ReturnType<ChatPanelController["currentTab"]> }) {
  const controller = useChatPanel();
  const {
    chatFileLinks, currentBackgroundRun, currentExecutionPlan, currentRun, experimentRun,
    handleDiscardExperiment, handleInspectExperiment, handleOpenCurrentRunJob, handlePromoteExperiment, handlePromoteScheduledRun,
    renderPlanRunAction, runDetailRecovery, runSubtasks,
  } = controller;
  return <Match when={props.selectedTab === "run"}>
                <ScrollArea class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}>
                  <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap4).class}>
                    <CliSessionPanel />
                    <div class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4, typography.body, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                      <div class={stylex.attrs(taskStyles.row).class}>
                        <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking018em, chatUtilityStyles.textVariableMuted).class}>Run summary</div>
                        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2).class}>
                          <Show when={currentBackgroundRun()}>
                            <ActionButton
                              tooltip="Open background job for this run"
                              icon={<Briefcase class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                              size="sm"
                              variant="secondary"
                              onClick={handleOpenCurrentRunJob}
                            >
                              Job
                            </ActionButton>
                          </Show>
                          <ActionButton
                            tooltip="Promote latest run into scheduled task"
                            icon={<CalendarClock class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePromoteScheduledRun()}
                          >
                            Schedule
                          </ActionButton>
                          <Show when={currentExecutionPlan()}>
                            {(plan) => renderPlanRunAction(plan().runId)}
                          </Show>
                          <Show when={experimentRun()}>
                            <ActionButton tooltip="Review virtual branch diff" size="sm" variant="secondary" onClick={handleInspectExperiment}>
                              Review experiment
                            </ActionButton>
                            <ActionButton tooltip="Flush experiment changes into project and commit" size="sm" onClick={handlePromoteExperiment}>
                              Promote
                            </ActionButton>
                            <ActionButton tooltip="Discard virtual branch changes" size="sm" variant="secondary" onClick={handleDiscardExperiment}>
                              Discard
                            </ActionButton>
                          </Show>
                        </div>
                      </div>
                      <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flexCol, chatUtilityStyles.gap1, chatUtilityStyles.pt2).class}>
                        <Show when={runDetailRecovery()}>{(recovery) => <ActionStatus message={recovery().status === "loading" ? "Loading full run details. Run actions remain disabled." : "Full run details are unavailable. Run actions remain disabled."} actionLabel={recovery().status === "loading" ? "Loading details" : "Retry details"} tooltip="Retry loading full run details" disabled={recovery().status === "loading"} disabledReason="Run details are already loading" onAction={() => recovery().retry()} />}</Show>
                        <Show when={currentRun()?.failureMessage}>
                          {(failure) => <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderRose300, chatUtilityStyles.bgRose50, chatUtilityStyles.p3, chatUtilityStyles.fontMedium, chatUtilityStyles.textRose800).class}>Failure: {failure()}</div>}
                        </Show>
                        <Show when={currentRun()?.status === "completed" || currentRun()?.status === "failed"}>
                          <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p3).class}>
                            <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>Outcome</div>
                            <Show when={currentRun()?.summary ?? currentRun()?.finalExecutionBrief}>
                              {(summary) => <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>{summary()}</div>}
                            </Show>
                            <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>
                              Evidence: {currentRun()?.toolActivities?.filter((activity) => activity.status === "completed").length ?? 0} completed tool steps; {currentRun()?.subtasks.filter((task) => task.status === "completed").length ?? 0} completed subtasks.
                            </div>
                          </div>
                        </Show>
                        <Disclosure title="Run state">
                        <div>Status: {currentRun()?.status ?? "idle"}</div>
                        <div>Retryable: {currentRun()?.retryable ? "yes" : "no"}</div>
                        <div>Resumable: {currentRun()?.resumable ? "yes" : "no"}</div>
                        </Disclosure>
                        <RunLedgerCompact run={currentRun()} />
                        <RunProofBundleCompact run={currentRun()} />
                        <Tooltip
                          content={currentRun()?.latestUserPrompt}
                              triggerClass={stylex.attrs(styles.tooltipThreadTitle).class}
                        >
                          <div class={stylex.attrs(chatUtilityStyles.truncate).class}>
                            Prompt: {currentRun()?.latestUserPrompt ?? "n/a"}
                          </div>
                        </Tooltip>
                      </div>
                      <Show when={experimentRun()}>
                        {(experiment) => (
                          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flexCol, chatUtilityStyles.gap1, chatUtilityStyles.pt2).class}>
                            <div>Virtual branch: {experiment().virtualBranchName}</div>
                            <div class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.breakAll).class}>Mount: {experiment().projectMountPath}</div>
                            <div>
                              Diff: {experiment().filesChanged} files, +{experiment().insertions} / -{experiment().deletions}
                            </div>
                          </div>
                        )}
                      </Show>
                    </div>
                    <VirtualList
                      class={stylex.attrs(chatUtilityStyles.minH80, chatUtilityStyles.pr2).class}
                      contentClass={stylex.attrs(styles.virtualContent).class}
                      itemClass={stylex.attrs(styles.virtualItem).class}
                      items={runSubtasks()}
                      getKey={(task, index) => `${task.id ?? task.title}-${index}`}
                      estimateSize={150}
                      pagination={{ kind: "reverse", initialCount: CHAT_RUN_SUBTASK_LIMIT, batchSize: CHAT_RUN_SUBTASK_LIMIT }}
                      empty={<div class={stylex.attrs(chatUtilityStyles.rounded12rem, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4, typography.body, chatUtilityStyles.textVariableMuted).class}>No subtasks yet.</div>}
                    >
                      {(task) => (
                        <div class={stylex.attrs(chatUtilityStyles.rounded12rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite60, chatUtilityStyles.p4, typography.body, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                          <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>{task.title}</div>
                          <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>Status: {task.status} | Attempts: {task.attemptCount}</div>
                          <Show when={task.output}>
                            <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                              <MarkdownContent content={() => task.output ?? ""} size="compact" fileLinks={chatFileLinks()} />
                            </div>
                          </Show>
                          <Show when={task.errorMessage}>
                            <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                              <MarkdownContent content={() => task.errorMessage ?? ""} size="compact" tone="danger" fileLinks={chatFileLinks()} />
                            </div>
                          </Show>
                        </div>
                      )}
                    </VirtualList>
                  </div>
                </ScrollArea>
                    </Match>;
}

export function ChatTranscriptEvents(props: { selectedTab: ReturnType<ChatPanelController["currentTab"]> }) {
  const controller = useChatPanel();
  const {
    chatFileLinks, projectTraces,
  } = controller;
  return <Match when={props.selectedTab === "events"}>
                <VirtualList
                  class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}
                  contentClass={stylex.attrs(styles.virtualContent).class}
                  itemClass={stylex.attrs(styles.virtualItem).class}
                  items={projectTraces()}
                  getKey={(trace, index) => `${trace.stage}-${index}`}
                  estimateSize={145}
                  pagination={{ kind: "reverse", initialCount: CHAT_EVENT_LIMIT, batchSize: CHAT_EVENT_LIMIT }}
                  empty={
                    <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minH56, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.rounded3xl, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite40, chatUtilityStyles.p8, chatUtilityStyles.textCenter, typography.body, chatUtilityStyles.textVariableMuted).class}>
                      No model trace events yet. Tool commands and subtask activity appear in Run and Developer trace.
                    </div>
                  }
                >
                  {(trace) => (
                    <article class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
                      <div class={stylex.attrs(taskStyles.eventHeader).class}>
                        <span>{trace.stage}</span>
                        <span>{trace.modelId ?? "n/a"}</span>
                      </div>
                      <MarkdownContent content={() => trace.message} size="compact" fileLinks={chatFileLinks()} />
                      <Show when={trace.detail}>
                        <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                          <MarkdownContent content={() => trace.detail ?? ""} size="compact" tone="muted" fileLinks={chatFileLinks()} />
                        </div>
                      </Show>
                    </article>
                  )}
                </VirtualList>
                    </Match>;
}
