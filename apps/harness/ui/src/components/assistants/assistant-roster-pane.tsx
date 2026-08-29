import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type JSX, type Setter } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, ArrowUpRight, Brain, Bot, Calendar, Check, CheckSquare2, CircleAlert, CirclePause,
  CircleHelp, CirclePlay, ClipboardList, CopyPlus, Cpu, FlaskConical, Folder, Gauge, Globe, ListFilter, ListChecks,
  Logs, MessageSquare, Plus, RefreshCcw, Save, Split, Square, SquarePen, Trash2 } from "lucide-solid";
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
import { formatShortTimestamp, resolveBrowserTimezone } from "../../lib/time-format";
import { cn, toProperCase } from "../../lib/utils";
import { normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import { type AssistantEditorDraft, type AssistantDetailTab, type BackgroundJobEditorDraft, COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH, type AssistantRosterSort, getComposerControlState, getExecutionModelOptionsForAgent,
  getSelectedAssistant, getVisibleAssistants, harnessStore } from "../../harness-store";
import { ActionButton } from "../action-button";
import { FileLinkedText, type FileLinkConfig } from "../file-linked-text";
import { DetailEmptyState, LeftPaneEmptyState, LeftPaneFilterBlock, LeftPaneHeader, LeftPaneListSection,
  LeftPaneSearchInput, LeftPaneSearchMenu, LeftPaneShell, type LeftPaneSearchMenuItem } from "../primitives/left-pane";
import { StatusChip, type StatusChipTone } from "../primitives/status-chip";
import { VirtualList } from "../primitives/virtual-list";
import { rightAlignedNumbersEnabled } from "../../lib/visual-flags";
import { assistantPanelStyles, assistantUtilityStyles } from "../assistants-panel.styles";
import { AssistantRosterPagination, createAssistantRosterPaginationController, createFilteredAssistantRoster } from "./roster-pagination";
import {
  assistantRunStateTone,
  summarizePrompt,
  tooltipWithPrimaryHotkey,
  toggleAssistantSelectionId,
} from "./assistant-panel-model";
import { createAssistantsPanelController, type AssistantsPanelController, type AssistantsPanelProps } from "./assistant-panel-controller";
import { activeAssistantRosterFilterCount, assistantRosterMenuItems } from "./assistant-roster-menu";

export function AssistantRosterPane(props: { controller: AssistantsPanelController }) {
  const {
    clearAssistantSelectionTimer, createScope, executionPauseReason, executionPaused,
    getAssistantFileLinks, handleAssistantCardClick, handleAssistantRosterKeyDown,
    openAssistantBulkContextMenu, openCreateAssistant, requestAssistantRosterPage,
    scheduleAssistantDelayedSelection, selectedAssistantIdSet, selectedAssistantIds,
    selectedAssistants, sendAssistantBulkOperation, setAssistantSelectionAnchorId,
    setSelectedAssistantIds, showRoster, state, variant, visibleAssistants,
  } = props.controller;
  return (
    <Show when={showRoster()}>
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.flex,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.maxWFull,
            assistantUtilityStyles.flexCol,
            assistantUtilityStyles.gap1,
          ).class
        }
      >
        <LeftPaneFilterBlock>
          <LeftPaneSearchInput
            value={state.assistants.rosterSearch}
            aria-label="Search assistants"
            placeholder="Search assistants..."
            menu={
              <LeftPaneSearchMenu
                ariaLabel="Filter and sort assistants"
                tooltip="Filter and sort assistants"
                activeFilterCount={activeAssistantRosterFilterCount(state)}
                items={assistantRosterMenuItems(state)}
              />
            }
            onInput={(event) =>
              harnessStore.setAssistantPaneFilters({
                rosterSearch: event.currentTarget.value,
              })
            }
          />
        </LeftPaneFilterBlock>
        <LeftPaneListSection
          title="Roster"
          count={`${visibleAssistants().length} total`}
          class={
            stylex.attrs(
              assistantUtilityStyles.border0,
              assistantUtilityStyles.bgTransparent,
              assistantUtilityStyles.p0,
            ).class
          }
        >
          <AssistantRosterBulkControls controller={props.controller} />
          <VirtualList
            class={
              stylex.attrs(
                assistantUtilityStyles.minH0,
                assistantUtilityStyles.flex1,
                assistantUtilityStyles.pr2,
              ).class
            }
            contentClass={stylex.attrs(assistantUtilityStyles.wFull).class}
            itemClass={stylex.attrs(assistantUtilityStyles.pb3).class}
            items={visibleAssistants()}
            getKey={(assistant) => assistant.id}
            estimateSize={140}
            pagination={{
              kind: "forward",
              initialCount: 60,
              batchSize: 60,
            }}
            empty={
              <LeftPaneEmptyState>
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.grid,
                      assistantUtilityStyles.gap3,
                    ).class
                  }
                >
                  <div>No assistants match current search or filters.</div>
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.flex,
                        assistantUtilityStyles.flexWrap,
                        assistantUtilityStyles.gap2,
                      ).class
                    }
                  >
                    <ActionButton
                      tooltip={tooltipWithPrimaryHotkey(
                        "Create assistant",
                        normalizeAppHotkeyPreferences(
                          state.appHotkeyPreferences,
                        ).createAssistant[0],
                      )}
                      ariaLabel="New assistant"
                      size="sm"
                      icon={
                        <Plus
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h35,
                              assistantUtilityStyles.w35,
                            ).class
                          }
                        />
                      }
                      onClick={() => openCreateAssistant(createScope())}
                    >
                      New assistant
                    </ActionButton>
                    <ActionButton
                      tooltip={
                        state.workspace.activeProjectId
                          ? "Create from current thread"
                          : "Open a project first"
                      }
                      ariaLabel="Create from current thread"
                      size="sm"
                      variant="secondary"
                      disabled={!state.workspace.activeProjectId}
                      disabledReason={
                        !state.workspace.activeProjectId
                          ? "Open a project first"
                          : undefined
                      }
                      icon={
                        <MessageSquare
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.h35,
                              assistantUtilityStyles.w35,
                            ).class
                          }
                        />
                      }
                      onClick={() => openCreateAssistant("project")}
                    >
                      Create from current thread
                    </ActionButton>
                  </div>
                </div>
              </LeftPaneEmptyState>
            }
          >
            {(assistant) => <AssistantRosterCard assistant={assistant} controller={props.controller} />}
          </VirtualList>
          <AssistantRosterPagination page={state.assistants.rosterPage} onRequest={requestAssistantRosterPage} />
        </LeftPaneListSection>
      </div>
    </Show>
  );
}

function AssistantRosterBulkControls(props: { controller: AssistantsPanelController }) {
  const {
    executionPauseReason, executionPaused, selectedAssistants,
    sendAssistantBulkOperation, setSelectedAssistantIds, variant,
  } = props.controller;
  return (
    <Show when={selectedAssistants().length > 0}>
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.mb3,
                      assistantUtilityStyles.flex,
                      assistantUtilityStyles.flexWrap,
                      assistantUtilityStyles.itemsCenter,
                      assistantUtilityStyles.gap2,
                      assistantUtilityStyles.roundedLg,
                      assistantUtilityStyles.border,
                      assistantUtilityStyles.borderBorder,
                      assistantUtilityStyles.bgPanelStrong,
                      assistantUtilityStyles.p2,
                      assistantUtilityStyles.text0675,
                      assistantUtilityStyles.textForeground,
                    ).class
                  }
                >
                  <span
                    class={
                      stylex.attrs(assistantUtilityStyles.fontSemibold).class
                    }
                  >
                    {selectedAssistants().length} selected
                  </span>
                  <ActionButton
                    tooltip="Pause selected assistants"
                    size="sm"
                    icon={
                      <CirclePause
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation("pause", selectedAssistants())
                    }
                  >
                    Pause
                  </ActionButton>
                  <ActionButton
                    tooltip="Resume selected assistants"
                    size="sm"
                    variant="secondary"
                    icon={
                      <CirclePlay
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation("resume", selectedAssistants())
                    }
                  >
                    Resume
                  </ActionButton>
                  <ActionButton
                    tooltip="Retry selected assistant bootstraps"
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason}
                    size="sm"
                    variant="secondary"
                    icon={
                      <RefreshCcw
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation(
                        "bootstrap-retry",
                        selectedAssistants(),
                      )
                    }
                  >
                    Bootstrap
                  </ActionButton>
                  <ActionButton
                    tooltip="Delete selected assistants"
                    size="sm"
                    variant="secondary"
                    icon={
                      <Trash2
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() =>
                      sendAssistantBulkOperation("delete", selectedAssistants())
                    }
                  >
                    Delete
                  </ActionButton>
                  <ActionButton
                    tooltip="Clear selection"
                    size="sm"
                    variant="ghost"
                    icon={
                      <Square
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h35,
                            assistantUtilityStyles.w35,
                          ).class
                        }
                      />
                    }
                    onClick={() => setSelectedAssistantIds([])}
                  >
                    Clear
                  </ActionButton>
                </div>
              </Show>
  );
}

function AssistantRosterCard(props: { assistant: Assistant; controller: AssistantsPanelController }) {
  const { clearAssistantSelectionTimer, getAssistantFileLinks, handleAssistantCardClick,
    handleAssistantRosterKeyDown, openAssistantBulkContextMenu, scheduleAssistantDelayedSelection,
    selectedAssistantIdSet, selectedAssistantIds, setAssistantSelectionAnchorId,
    setSelectedAssistantIds, state, variant } = props.controller;
  const { assistant } = props; return (
    <div class={cn(
                      stylex.attrs(
                        assistantPanelStyles.denseCard,
                        assistantUtilityStyles.wFull,
                        assistantUtilityStyles.cursorPointer,
                        assistantUtilityStyles.borderL4,
                        assistantUtilityStyles.p3,
                        assistantUtilityStyles.textLeft,
                        assistantUtilityStyles.transition,
                        assistantUtilityStyles.hoverBorderAccentStrong,
                      ).class,
                      state.assistants.selectedAssistantId === assistant.id ||
                        selectedAssistantIds().includes(assistant.id)
                        ? stylex.attrs(assistantPanelStyles.denseCardSelected).class
                        : assistant.runState === "active"
                          ? stylex.attrs(assistantPanelStyles.borderEmerald).class
                          : stylex.attrs(assistantPanelStyles.borderAmber).class,
                    )}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(event) =>
                      scheduleAssistantDelayedSelection(assistant.id, event)
                    }
                    onPointerUp={clearAssistantSelectionTimer}
                    onPointerCancel={clearAssistantSelectionTimer}
                    onPointerLeave={clearAssistantSelectionTimer}
                    onClick={(event) =>
                      handleAssistantCardClick(assistant, event)
                    }
                    onContextMenu={(event) =>
                      openAssistantBulkContextMenu(assistant, event)
                    }
                    onKeyDown={(event) =>
                      handleAssistantRosterKeyDown(event, assistant.id)
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.itemsStart,
                          assistantUtilityStyles.justifyBetween,
                          assistantUtilityStyles.gap3,
                        ).class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.minW0,
                            assistantUtilityStyles.flex1,
                          ).class
                        }
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.text0775,
                              assistantUtilityStyles.fontSemibold,
                              assistantUtilityStyles.textForeground,
                            ).class
                          }
                        >
                          {assistant.name}
                        </div>
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt1,
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.flexWrap,
                              assistantUtilityStyles.gap1,
                            ).class
                          }
                        >
                          <StatusChip
                            tone={
                              assistant.scope === "global" ? "info" : "accent"
                            }
                          >
                            {assistant.scope}
                          </StatusChip>
                          <StatusChip
                            tone={assistantBootstrapTone(
                              assistant.bootstrapState,
                    )}>
                            {assistant.bootstrapState}
                          </StatusChip>
                        </div>
                      </div>
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.shrink0,
                            assistantUtilityStyles.flexWrap,
                            assistantUtilityStyles.justifyEnd,
                            assistantUtilityStyles.gap1,
                          ).class
                        }
                      >
                        <ActionButton
                          tooltip={
                            selectedAssistantIdSet().has(assistant.id)
                              ? "Remove from bulk selection"
                              : "Add to bulk selection"
                          }
                          icon={
                            selectedAssistantIdSet().has(assistant.id) ? (
                              <CheckSquare2
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h3,
                                    assistantUtilityStyles.w3,
                                  ).class
                                }
                              />
                            ) : (
                              <Square
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h3,
                                    assistantUtilityStyles.w3,
                                  ).class
                                }
                              />
                            )
                          }
                          size="icon"
                          variant="ghost"
                          ariaLabel={
                            selectedAssistantIdSet().has(assistant.id)
                              ? `Remove ${assistant.name} from bulk selection`
                              : `Add ${assistant.name} to bulk selection`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedAssistantIds((ids) =>
                              toggleAssistantSelectionId(ids, assistant.id),
                            );
                            setAssistantSelectionAnchorId(assistant.id);
                          }}
                        />
                        <StatusChip
                          tone={assistantRunStateTone(assistant.runState)}
                        >
                          {assistant.runState}
                        </StatusChip>
                        <Show when={assistant.unreadQuestionCount > 0}>
                          <StatusChip
                            tone="warning"
                            class={
                              stylex.attrs(
                                rightAlignedNumbersEnabled() &&
                                  assistantPanelStyles.numericFlagged,
                              ).class
                            }
                          >
                            {assistant.unreadQuestionCount} q
                          </StatusChip>
                        </Show>
                      </div>
                    </div>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.mt3,
                          assistantUtilityStyles.text0675,
                          assistantUtilityStyles.leading5,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      <div>
                        <FileLinkedText
                          text={
                            assistant.description ??
                            summarizePrompt(assistant.jobPrompt)
                          }
                          fileLinks={getAssistantFileLinks(assistant)}
                        />
                      </div>
                      <div
                        class={stylex.attrs(assistantUtilityStyles.mt1).class}
                      >
                        {assistant.circuitBreakerState === "tripped"
                          ? "Circuit breaker tripped"
                          : `Updated ${formatShortTimestamp(assistant.updatedAt)}`}
                      </div>
                    </div>
                  </div>
  );
}

function assistantBootstrapTone(
  state: Assistant["bootstrapState"],
): StatusChipTone {
  if (state === "completed") {
    return "success";
  }
  if (state === "failed") {
    return "danger";
  }
  if (state === "running") {
    return "info";
  }
  return "warning";
}

