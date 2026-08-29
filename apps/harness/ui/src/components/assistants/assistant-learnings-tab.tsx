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
import { ActionButton } from "../action-button";
import { FileLinkedText, type FileLinkConfig } from "../file-linked-text";
import { StatusChip, type StatusChipTone } from "../primitives/status-chip";
import { VirtualList } from "../primitives/virtual-list";
import { assistantPanelStyles, assistantUtilityStyles } from "../assistants-panel.styles";
import { createAssistantsPanelController, type AssistantsPanelController, type AssistantsPanelProps } from "./assistant-panel-controller";

export function AssistantLearningsTab(props: { controller: AssistantsPanelController }) {
  const {
    activeTab, assistantChatFileLinks, deleteLearning, filteredLearnings,
    reorderLearning, selectedLearnings, variant,
  } = props.controller;
  return (
    <Show when={activeTab() === "learnings"}>
      <section
        class={
          stylex.attrs(
            assistantUtilityStyles.flex,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.flexCol,
          ).class
        }
      >
        <VirtualList
          class={
            stylex.attrs(
              assistantUtilityStyles.minH0,
              assistantUtilityStyles.flex1,
              assistantUtilityStyles.pr2,
            ).class
          }
          contentClass={
            stylex.attrs(assistantUtilityStyles.wFull).class
          }
          itemClass={
            stylex.attrs(assistantUtilityStyles.pb3).class
          }
          items={filteredLearnings()}
          getKey={(learning) => learning.id}
          estimateSize={115}
          pagination={{
            kind: "forward",
            initialCount: 50,
            batchSize: 50,
          }}
          empty={
            <div
              class={
                stylex.attrs(
                  assistantUtilityStyles.borderL2,
                  assistantUtilityStyles.borderDashed,
                  assistantUtilityStyles.borderBorder,
                  assistantUtilityStyles.py3,
                  assistantUtilityStyles.pl4,
                  assistantUtilityStyles.text075,
                  assistantUtilityStyles.textMuted,
                ).class
              }
            >
              No learnings yet.
            </div>
          }
        >
          {(learning) => <AssistantLearningCard controller={props.controller} learning={learning} />}
        </VirtualList>
      </section>
    </Show>
  );
}

function AssistantLearningCard(props: { controller: AssistantsPanelController; learning: AssistantLearning }) {
  const { assistantChatFileLinks, deleteLearning, reorderLearning, selectedLearnings } = props.controller;
  const { learning } = props;
  return (
    <article class={stylex.attrs(
      assistantUtilityStyles.borderL2, assistantUtilityStyles.borderBorder,
      assistantUtilityStyles.py3, assistantUtilityStyles.pl4, assistantUtilityStyles.pr2,
    ).class}>
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
                        stylex.attrs(assistantUtilityStyles.minW0)
                          .class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.text075,
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.leading5,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        <FileLinkedText
                          text={learning.summary}
                          fileLinks={assistantChatFileLinks()}
                        />
                      </div>
                    </div>
                    <div
                      class={
                        stylex.attrs(
                          assistantPanelStyles.secondaryAction,
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.shrink0,
                          assistantUtilityStyles.itemsCenter,
                          assistantUtilityStyles.gap2,
                        ).class
                      }
                    >
                      <StatusChip
                        tone={
                          learning.confidence === "high"
                            ? "success"
                            : learning.confidence === "low"
                              ? "neutral"
                              : "info"
                        }
                      >
                        {learning.confidence}
                      </StatusChip>
                      <ActionButton
                        tooltip="Move assistant learning up"
                        ariaLabel={`Move learning ${learning.summary} up`}
                        icon={
                          <ArrowUp
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
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h8,
                            assistantUtilityStyles.w8,
                          ).class
                        }
                        disabled={
                          selectedLearnings()[0]?.id === learning.id
                        }
                        disabledReason="Learning is already first"
                        onClick={() => reorderLearning(learning, -1)}
                      />
                      <ActionButton
                        tooltip="Move assistant learning down"
                        ariaLabel={`Move learning ${learning.summary} down`}
                        icon={
                          <ArrowDown
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
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h8,
                            assistantUtilityStyles.w8,
                          ).class
                        }
                        disabled={
                          selectedLearnings()[
                            selectedLearnings().length - 1
                          ]?.id === learning.id
                        }
                        disabledReason="Learning is already last"
                        onClick={() => reorderLearning(learning, 1)}
                      />
                      <ActionButton
                        tooltip="Delete assistant learning"
                        ariaLabel={`Delete learning ${learning.summary}`}
                        icon={
                          <Trash2
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
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h8,
                            assistantUtilityStyles.w8,
                            assistantUtilityStyles.textDanger,
                            assistantUtilityStyles.hoverBgPanel,
                          ).class
                        }
                        onClick={() => deleteLearning(learning)}
                      />
                    </div>
                  </div>
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.mt2,
                        assistantUtilityStyles.text0675,
                        assistantUtilityStyles.leading5,
                        assistantUtilityStyles.textMuted,
                      ).class
                    }
                  >
                    <div>
                      <FileLinkedText
                        text={`Source: ${learning.source}`}
                        fileLinks={assistantChatFileLinks()}
                      />
                    </div>
                    <div>
                      {formatShortTimestamp(learning.createdAt)}
                    </div>
                  </div>
                </article>
  );
}

