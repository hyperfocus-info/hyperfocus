import {
type AssistantLearning,
} from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown,ArrowUp,Trash2 } from "lucide-solid";
import { Show } from "solid-js";
import { formatShortTimestamp } from "../../lib/time-format";
import { ActionButton } from "../action-button";
import { assistantUtilityStyles } from "../assistants-panel.styles";
import { FileLinkedText } from "../file-linked-text";
import { StatusChip } from "../primitives/status-chip";
import { VirtualList } from "../primitives/virtual-list";
import { detailStyles } from "./assistant-detail.styles";
import { useAssistantsPanel } from "./state/panel-context";

export function AssistantLearningsTab() {
  const controller = useAssistantsPanel();
  const { activeTab, filteredLearnings, state } = controller;
  return (
    <Show when={activeTab() === "learnings"}>
      <section
        class={
          stylex.attrs(
            assistantUtilityStyles.flex,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.flexCol,
            detailStyles.collection,
          ).class
        }
      >
        <p class={stylex.attrs(detailStyles.caption).class}>Lessons retained by this assistant. Review the source and confidence before relying on them.</p>
        <VirtualList
          dataTest="assistant-learnings"
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
                  detailStyles.summary,
                  assistantUtilityStyles.textMuted,
                ).class
              }
            >
              {state.assistants.detailSearch.trim() ? "No learnings match your search. Clear search to see all lessons." : "No learnings yet. Lessons gathered during assistant work will appear here."}
            </div>
          }
        >
          {(learning) => <AssistantLearningCard learning={learning} />}
        </VirtualList>
      </section>
    </Show>
  );
}

function AssistantLearningCard(props: { learning: AssistantLearning }) {
  const controller = useAssistantsPanel();
  const { assistantChatFileLinks, deleteLearning, reorderLearning, selectedLearnings } = controller;
  const { learning } = props;
  return (
    <article class={stylex.attrs(
      assistantUtilityStyles.borderL2, assistantUtilityStyles.borderBorder,
      assistantUtilityStyles.py3, assistantUtilityStyles.pl4, assistantUtilityStyles.pr2,
    ).class}>
                  <div
                    class={
                      stylex.attrs(
                        detailStyles.row,
                        assistantUtilityStyles.itemsStart,
                        assistantUtilityStyles.justifyBetween,
                        assistantUtilityStyles.gap3,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(detailStyles.summary)
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
                          assistantUtilityStyles.flexWrap,
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
                        {learning.confidence} confidence
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
