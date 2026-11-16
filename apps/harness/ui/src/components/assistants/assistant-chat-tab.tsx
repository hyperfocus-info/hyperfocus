import {
type AssistantTodo
} from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown,Brain,Cpu,Gauge,MessageSquare,Split } from "lucide-solid";
import { For,Show,type JSX } from "solid-js";
import { formatShortTimestamp } from "../../lib/time-format";
import { ActionButton } from "../action-button";
import { assistantUtilityStyles } from "../assistants-panel.styles";
import { FileLinkedText } from "../file-linked-text";
import { MarkdownContent } from "../markdown-content";
import { ModelSelect } from "../models/model-select";
import { ProjectChatComposer as ChatComposer } from "@hyperfocus/ui/composer";
import { CopyTextButton } from "../primitives/copy-text-button";
import { DropdownControl } from "../primitives/dropdown";
import { VirtualList } from "../primitives/virtual-list";
import { detailStyles } from "./assistant-detail.styles";
import { isComposerReasoningStrength } from "./assistant-panel-model";
import { useAssistantsPanel } from "./state/panel-context";

function isActiveTodo(state: AssistantTodo["state"]) {
  return state === "pending" || state === "in-progress" || state === "blocked";
}


function renderMessageActionRow(
  timestamp: string | number | Date | undefined,
  copyButton: JSX.Element,
) {
  return (
    <div
      class={
        stylex.attrs(
          assistantUtilityStyles.mt3,
          assistantUtilityStyles.flex,
          assistantUtilityStyles.itemsCenter,
          assistantUtilityStyles.justifyBetween,
          assistantUtilityStyles.gap3,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.text0575,
            assistantUtilityStyles.uppercase,
            assistantUtilityStyles.tracking012,
            assistantUtilityStyles.textMuted,
          ).class
        }
      >
        {formatShortTimestamp(timestamp)}
      </div>
      {copyButton}
    </div>
  );
}

export function AssistantChatTab() {
  const controller = useAssistantsPanel();
  const { activeTab } = controller;
  return (
    <Show when={activeTab() === "chat"}>
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.flex,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.flexCol,
            assistantUtilityStyles.gap4,
            assistantUtilityStyles.overflowHidden,
            assistantUtilityStyles.pr1,
            detailStyles.chat,
          ).class
        }
      >
      <AssistantChatMain />
    
      <AssistantChatContext />
      </div>
    </Show>
  );
}

function AssistantChatMain() {
  const controller = useAssistantsPanel();
  const {
    chatDraft, executionPauseReason, executionPaused, handleAssistantComposerClick, handleSendChat,
    refs, selectedAssistant, setChatDraft,
  } = controller;
  const assistant = () => {
    const current = selectedAssistant();
    if (!current) throw new Error("Assistant chat requires a selected assistant.");
    return current;
  };
  return (
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
              <div
                class={
                  stylex.attrs(
                    assistantUtilityStyles.mb3,
                    assistantUtilityStyles.flex,
                    assistantUtilityStyles.itemsCenter,
                    assistantUtilityStyles.justifyBetween,
                    assistantUtilityStyles.gap2,
                    assistantUtilityStyles.text0585,
                    assistantUtilityStyles.fontSemibold,
                    assistantUtilityStyles.uppercase,
                    assistantUtilityStyles.tracking018,
                    assistantUtilityStyles.textMuted,
                  ).class
                }
              >
                Assistant chat
              </div>
      <AssistantChatTranscript />
              <ChatComposer
                class={stylex.attrs(assistantUtilityStyles.mt4).class}
                textareaRef={(element) => {
                  refs.chatTextarea = element;
                }}
                rows="3"
                value={chatDraft()}
                placeholder={`Ask ${assistant().name} something.`}
                textareaClass={
                  stylex.attrs(
                    assistantUtilityStyles.assistantComposerTextarea,
                  ).class
                }
                disabled={executionPaused()}
                disabledReason={executionPauseReason}
                onInput={setChatDraft}
                onSubmit={handleSendChat}
                onClick={handleAssistantComposerClick}
                leftControls={
      <AssistantChatRoutingControls />
                }
                rightActions={
                  <ActionButton
                    tooltip="Send message to assistant"
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason}
                    icon={
                      <MessageSquare
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.h4,
                            assistantUtilityStyles.w4,
                          ).class
                        }
                      />
                    }
                    variant="ghost"
                    size="icon"
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.pointerEventsAuto,
                        assistantUtilityStyles.h8,
                        assistantUtilityStyles.w8,
                        assistantUtilityStyles.roundedLg,
                      ).class
                    }
                    ariaLabel="Send message to assistant"
                    onClick={handleSendChat}
                  />
                }
              />
            </section>
  );
}

function AssistantChatTranscript() {
  const controller = useAssistantsPanel();
  const {
    assistantChatFileLinks, assistantChatRows, assistantStickToBottom, refs,
    scrollAssistantChatToBottom, updateAssistantScrollLock,
  } = controller;
  return (
    <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.relative,
                        assistantUtilityStyles.flex,
                        assistantUtilityStyles.minH0,
                        assistantUtilityStyles.flex1,
                        assistantUtilityStyles.flexCol,
                      ).class
                    }
                  >
                    <VirtualList
                      viewportRef={(element) => {
                        refs.messageViewport = element;
                        scrollAssistantChatToBottom(true);
                      }}
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
                      data-test-assistant-chat-scroll=""
                      dataTest="assistant-chat-transcript"
                      items={assistantChatRows()}
                      getKey={(row, index) =>
                        row.kind === "message"
                          ? row.message.id
                          : `streaming-${row.index ?? index}`
                      }
                      estimateSize={150}
                      pagination={{
                        kind: "reverse",
                        initialCount: 80,
                        batchSize: 80,
                      }}
                      overscan={6}
                      stickToEnd
                      onScroll={updateAssistantScrollLock}
                    >
                      {(row) =>
                        row.kind === "message" ? (
                          <article
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.rounded2xl,
                                assistantUtilityStyles.border,
                                assistantUtilityStyles.p3,
                                row.message.role === "user"
                                  ? assistantUtilityStyles.borderBorder
                                  : assistantUtilityStyles.borderAccent,
                                row.message.role === "user"
                                  ? assistantUtilityStyles.bgWhite75
                                  : assistantUtilityStyles.bgPanel,
                              ).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mb2,
                                  assistantUtilityStyles.text0575,
                                  assistantUtilityStyles.fontSemibold,
                                  assistantUtilityStyles.uppercase,
                                  assistantUtilityStyles.tracking016,
                                  assistantUtilityStyles.textMuted,
                                ).class
                              }
                            >
                              {row.message.role}
                            </div>
                            <MarkdownContent
                              content={row.message.content}
                              fileLinks={assistantChatFileLinks()}
                            />
                            {renderMessageActionRow(
                              row.message.createdAt,
                              <CopyTextButton
                                value={row.message.content}
                                tooltip="Copy message"
                                copiedTitle="Message copied"
                                copiedDescription="Message copied to clipboard."
                                size="sm"
                                variant="ghost"
                                ariaLabel={`Copy ${row.message.role} message`}
                              >
                                Copy
                              </CopyTextButton>,
                            )}
                          </article>
                        ) : (
                          <article
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.rounded2xl,
                                assistantUtilityStyles.border,
                                assistantUtilityStyles.borderAccent,
                                assistantUtilityStyles.bgPanel,
                                assistantUtilityStyles.p3,
                              ).class
                            }
                          >
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.mb2,
                                  assistantUtilityStyles.text0575,
                                  assistantUtilityStyles.fontSemibold,
                                  assistantUtilityStyles.uppercase,
                                  assistantUtilityStyles.tracking016,
                                  assistantUtilityStyles.textMuted,
                                ).class
                              }
                            >
                              assistant
                            </div>
                            <MarkdownContent
                              content={row.content}
                              fileLinks={assistantChatFileLinks()}
                            />
                            {renderMessageActionRow(
                              row.createdAt,
                              <CopyTextButton
                                value={row.content}
                                tooltip="Copy streaming assistant message"
                                copiedTitle="Message copied"
                                copiedDescription="Message copied to clipboard."
                                size="sm"
                                variant="ghost"
                                ariaLabel="Copy streaming assistant message"
                              >
                                Copy
                              </CopyTextButton>,
                            )}
                          </article>
                        )
                      }
                    </VirtualList>
                    <Show when={!assistantStickToBottom()}>
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.pointerEventsNone,
                            assistantUtilityStyles.absolute,
                            assistantUtilityStyles.insetX0,
                            assistantUtilityStyles.bottom3,
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.justifyCenter,
                          ).class
                        }
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.pointerEventsAuto,
                            ).class
                          }
                        >
                          <ActionButton
                            tooltip="Scroll to latest message"
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
                            variant="secondary"
                            onClick={() =>
                              scrollAssistantChatToBottom(true)
                            }
                          >
                            Scroll to latest
                          </ActionButton>
                        </div>
                      </div>
                    </Show>
                  </div>
  );
}

function AssistantChatRoutingControls() {
  const controller = useAssistantsPanel();
  const {
    assistantChatExecutionModelId, assistantChatFastMode,
    assistantChatFastModeOptions, assistantChatModeId, assistantChatModeOptions,
    assistantChatModelOptions, assistantChatReasoningOptions,
    assistantChatReasoningStrength, setAssistantChatExecutionModelId,
    setAssistantChatFastMode, setAssistantChatModeId,
    setAssistantChatReasoningStrength,
  } = controller;
  return (
    <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.pointerEventsAuto,
                            assistantUtilityStyles.flex,
                            assistantUtilityStyles.flexWrap,
                            assistantUtilityStyles.itemsCenter,
                            assistantUtilityStyles.gap1,
                          ).class
                        }
                      >
                        <DropdownControl
                          kind="select"
                          ariaLabel="Select assistant chat mode"
                          icon={
                            <Split
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h35,
                                  assistantUtilityStyles.w35,
                                ).class
                              }
                            />
                          }
                          value={assistantChatModeId()}
                          options={assistantChatModeOptions()}
                          onChange={setAssistantChatModeId}
                        />
                        <ModelSelect
                          ariaLabel="Select assistant chat model"
                          icon={
                            <Cpu
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h35,
                                  assistantUtilityStyles.w35,
                                ).class
                              }
                            />
                          }
                          value={assistantChatExecutionModelId()}
                          options={assistantChatModelOptions()}
                          onChange={setAssistantChatExecutionModelId}
                        />
                        <DropdownControl
                          kind="select"
                          ariaLabel="Select assistant chat reasoning effort"
                          icon={
                            <Brain
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h35,
                                  assistantUtilityStyles.w35,
                                ).class
                              }
                            />
                          }
                          value={assistantChatReasoningStrength()}
                          options={assistantChatReasoningOptions()}
                          onChange={(value) => {
                            if (isComposerReasoningStrength(value)) setAssistantChatReasoningStrength(value);
                          }}
                        />
                        <DropdownControl
                          kind="select"
                          ariaLabel="Select assistant chat fast mode"
                          icon={
                            <Gauge
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.h35,
                                  assistantUtilityStyles.w35,
                                ).class
                              }
                            />
                          }
                          value={
                            assistantChatFastMode() ? "true" : "false"
                          }
                          options={assistantChatFastModeOptions()}
                          onChange={(value) =>
                            setAssistantChatFastMode(value === "true")
                          }
                        />
                      </div>
  );
}

function AssistantChatContext() {
  const controller = useAssistantsPanel();
  const { assistantChatFileLinks, selectedThread, visibleTodos } = controller;
  return (
    <details
              class={
                stylex.attrs(assistantUtilityStyles.shrink0).class
              }
            >
              <summary
                class={
                  stylex.attrs(
                    detailStyles.disclosureTrigger,
                    assistantUtilityStyles.fontSemibold,
                    assistantUtilityStyles.uppercase,
                    assistantUtilityStyles.tracking018,
                    assistantUtilityStyles.textMuted,
                  ).class
                }
              >
                Working memory
              </summary>
              <div
                class={
                  stylex.attrs(
                    assistantUtilityStyles.mt3,
                    assistantUtilityStyles.grid,
                    assistantUtilityStyles.maxH32,
                    assistantUtilityStyles.gap4,
                    assistantUtilityStyles.overflowAuto,
                    assistantUtilityStyles.borderL2,
                    assistantUtilityStyles.borderBorder,
                    assistantUtilityStyles.py2,
                    assistantUtilityStyles.pl4,
                    assistantUtilityStyles.text0675,
                    assistantUtilityStyles.leading5,
                    assistantUtilityStyles.textMuted,
                    assistantUtilityStyles.lgGridColsMemory,
                  ).class
                }
              >
                <div
                  class={
                    stylex.attrs(assistantUtilityStyles.minW0).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.fontSemibold,
                        assistantUtilityStyles.textForeground,
                      ).class
                    }
                  >
                    Summary
                  </div>
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.mt1,
                        assistantUtilityStyles.whitespacePreWrap,
                      ).class
                    }
                  >
                    <FileLinkedText
                      text={
                        selectedThread()?.memorySummary?.content ??
                        "No rolled summary yet."
                      }
                      fileLinks={assistantChatFileLinks()}
                    />
                  </div>
                </div>
                <div
                  class={
                    stylex.attrs(assistantUtilityStyles.minW0).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.fontSemibold,
                        assistantUtilityStyles.textForeground,
                      ).class
                    }
                  >
                    Active todos
                  </div>
                  <ul
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.mt1,
                        assistantUtilityStyles.spaceY1,
                      ).class
                    }
                  >
                    <For
                      each={visibleTodos()
                        .filter((todo) => isActiveTodo(todo.state))
                        .slice(0, 8)}
                    >
                      {(todo) => (
                        <li>
                          <FileLinkedText
                            text={`${todo.state} | ${todo.title}`}
                            fileLinks={assistantChatFileLinks()}
                          />
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </div>
            </details>
  );
}
