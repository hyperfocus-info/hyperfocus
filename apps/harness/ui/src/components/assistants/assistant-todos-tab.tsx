import {
type AssistantTodo,
} from "@hyperfocus/ai-core/protocol";
import { Input } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown,ArrowUp,ClipboardList,Plus,Trash2 } from "lucide-solid";
import { Show } from "solid-js";
import { rightAlignedNumbersEnabled } from "../../lib/visual-flags";
import { ActionButton } from "../action-button";
import { assistantPanelStyles,assistantUtilityStyles } from "../assistants-panel.styles";
import { FileLinkedText } from "../file-linked-text";
import { DropdownControl } from "../primitives/dropdown";
import { StatusChip,type StatusChipTone } from "../primitives/status-chip";
import { Textarea } from "../primitives/textarea";
import { VirtualList } from "../primitives/virtual-list";
import { detailStyles } from "./assistant-detail.styles";
import { isAssistantTodoState,isAssistantTodoWorkKind } from "./assistant-panel-model";
import { useAssistantsPanel } from "./state/panel-context";

const assistantTodoStateOptions = [
  {
    value: "pending",
    label: "pending",
    description: "Queued but not started yet.",
  },
  {
    value: "in-progress",
    label: "in-progress",
    description: "Actively being worked right now.",
  },
  {
    value: "blocked",
    label: "blocked",
    description: "Paused by dependency, approval, or external blocker.",
  },
  {
    value: "completed",
    label: "completed",
    description: "Finished successfully.",
  },
  {
    value: "failed",
    label: "failed",
    description: "Attempt finished with failure.",
  },
  {
    value: "cancelled",
    label: "cancelled",
    description: "Work was intentionally stopped.",
  },
];

const assistantTodoWorkKindOptions = [
  {
    value: "app-code",
    label: "app-code",
    description: "Product, UI, backend, API, database, or test implementation.",
  },
  {
    value: "automation-code",
    label: "automation-code",
    description: "Scripts, skills, checks, generators, or workflow automation.",
  },
  {
    value: "documentation",
    label: "documentation",
    description: "Docs-only update.",
  },
  {
    value: "research",
    label: "research",
    description: "Investigation before implementation.",
  },
  {
    value: "blocked",
    label: "blocked",
    description: "Known work that cannot start yet.",
  },
  {
    value: "unspecified",
    label: "unspecified",
    description: "No work category set.",
  },
];



export function AssistantTodosTab() {
  const controller = useAssistantsPanel();
  const { activeTab, handleAddTodo, newTodoTitle, setNewTodoTitle, state, visibleTodos } = controller;
  return (
    <Show when={activeTab() === "todos"}>
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
        <div
          class={
            stylex.attrs(
              assistantUtilityStyles.mb4,
              assistantUtilityStyles.flex,
              assistantUtilityStyles.gap2,
            ).class
          }
        >
          <label class={stylex.attrs(detailStyles.field).class}>New todo
          <Textarea
            aria-label="New todo"
            rows="2"
            value={newTodoTitle()}
            onInput={(event) =>
              setNewTodoTitle(event.currentTarget.value)
            }
            placeholder="Describe the next task"
          /></label>
          <ActionButton
            tooltip="Add todo to assistant list"
            disabled={!newTodoTitle().trim()}
            disabledReason="Enter a task first"
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
            onClick={handleAddTodo}
          >
            Add
          </ActionButton>
        </div>
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
          dataTest="assistant-todos"
          empty={<p class={stylex.attrs(detailStyles.caption).class}>{state.assistants.detailSearch.trim() ? "No todos match your search. Clear search to see all tasks." : "No todos yet. Add a task above to give this assistant a next step."}</p>}
          items={visibleTodos()}
          getKey={(todo) => todo.id}
          estimateSize={128}
          pagination={{
            kind: "forward",
            initialCount: 60,
            batchSize: 60,
          }}
        >
        {(todo) => <AssistantTodoCard todo={todo} />}
        </VirtualList>
      </section>
    </Show>
  );
}

function AssistantTodoCard(props: { todo: AssistantTodo }) {
  const controller = useAssistantsPanel();
  const { assistantChatFileLinks } = controller;
  const { todo } = props;
  return (
    <article
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.borderL2,
                      assistantUtilityStyles.py3,
                      assistantUtilityStyles.pl4,
                      assistantUtilityStyles.pr2,
                      todo.state === "completed"
                        ? assistantPanelStyles.borderEmerald
                        : todo.state === "failed" ||
                            todo.state === "cancelled"
                          ? assistantPanelStyles.borderRose
                          : todo.state === "blocked"
                            ? assistantPanelStyles.borderAmber
                            : todo.state === "in-progress"
                              ? assistantPanelStyles.borderSky
                              : assistantUtilityStyles.borderBorder,
                    ).class
                  }
                >
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.flex,
                        assistantUtilityStyles.flexWrap,
                        assistantUtilityStyles.itemsStart,
                        assistantUtilityStyles.justifyBetween,
                        assistantUtilityStyles.gap3,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          detailStyles.summary,
                        ).class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            detailStyles.summary,
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        <FileLinkedText
                          text={todo.title}
                          fileLinks={assistantChatFileLinks()}
                        />
                      </div>
                      <Show when={todo.description}>
                        {(description) => (
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.mt1,
                                assistantUtilityStyles.text0675,
                                assistantUtilityStyles.leading5,
                                assistantUtilityStyles.textMuted,
                              ).class
                            }
                          >
                            <FileLinkedText
                              text={description()}
                              fileLinks={assistantChatFileLinks()}
                            />
                          </div>
                        )}
                      </Show>
                      <Show when={todo.blockerReason}>
                        {(reason) => (
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.mt1,
                                assistantUtilityStyles.text0625,
                                assistantUtilityStyles.textAmber900,
                              ).class
                            }
                          >
                            <FileLinkedText
                              text={`Blocker: ${reason()}`}
                              fileLinks={assistantChatFileLinks()}
                            />
                          </div>
                        )}
                      </Show>
                      <Show when={todo.workTarget}>
                        {(target) => (
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.mt1,
                                assistantUtilityStyles.text0625,
                                assistantUtilityStyles.textMuted,
                              ).class
                            }
                          >
                            <FileLinkedText
                              text={`Target: ${target()}`}
                              fileLinks={assistantChatFileLinks()}
                            />
                          </div>
                        )}
                      </Show>
                    </div>
                    <AssistantTodoActions todo={todo} />
                  </div>
                    <AssistantTodoMetadata todo={todo} />
                </article>
  );
}

function AssistantTodoActions(props: { todo: AssistantTodo }) {
  const controller = useAssistantsPanel();
  const { deleteTodo, reorderTodo, selectedTodos, updateTodo } = controller;
  const { todo } = props;
  return (
    <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.flexWrap,
                              assistantUtilityStyles.maxWFull,
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.shrink0,
                              assistantUtilityStyles.itemsCenter,
                              assistantUtilityStyles.gap2,
                            ).class
                          }
                        >
                          <ActionButton
                            tooltip="Move assistant todo up"
                            ariaLabel={`Move ${todo.title} up`}
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
                            disabled={selectedTodos()[0]?.id === todo.id}
                            disabledReason="Todo is already first"
                            onClick={() => reorderTodo(todo, -1)}
                          />
                          <ActionButton
                            tooltip="Move assistant todo down"
                            ariaLabel={`Move ${todo.title} down`}
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
                              selectedTodos()[selectedTodos().length - 1]
                                ?.id === todo.id
                            }
                            disabledReason="Todo is already last"
                            onClick={() => reorderTodo(todo, 1)}
                          />
                          <DropdownControl
                            kind="select"
                            ariaLabel={`Select ${todo.title} state`}
                            icon={
                              <ClipboardList
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h35,
                                    assistantUtilityStyles.w35,
                                  ).class
                                }
                              />
                            }
                            size="md"
                            class={
                              stylex.attrs(assistantUtilityStyles.w40)
                                .class
                            }
                            value={todo.state}
                            options={assistantTodoStateOptions}
                            onChange={(value) => {
                              if (isAssistantTodoState(value)) updateTodo(todo, { state: value });
                            }}
                          />
                          <ActionButton
                            tooltip="Delete assistant todo"
                            ariaLabel={`Delete ${todo.title}`}
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
                            onClick={() => deleteTodo(todo)}
                          />
                        </div>
  );
}

function AssistantTodoMetadata(props: { todo: AssistantTodo }) {
  const controller = useAssistantsPanel();
  const { updateTodo } = controller;
  const { todo } = props;
  return (
    <>
      <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt2,
                              assistantUtilityStyles.grid,
                              assistantUtilityStyles.gap2,
                              assistantUtilityStyles.mdGridColsTodo,
                            ).class
                          }
                        >
                          <DropdownControl
                            kind="select"
                            ariaLabel={`Select ${todo.title} work kind`}
                            icon={
                              <ClipboardList
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.h35,
                                    assistantUtilityStyles.w35,
                                  ).class
                                }
                              />
                            }
                            size="md"
                            value={todo.workKind}
                            options={assistantTodoWorkKindOptions}
                            onChange={(value) => {
                              if (isAssistantTodoWorkKind(value)) updateTodo(todo, { workKind: value });
                            }}
                          />
                          <Input
                            aria-label={`Work target for ${todo.title}`}
                            value={todo.workTarget ?? ""}
                            placeholder="Work target"
                            onChange={(event) =>
                              updateTodo(todo, {
                                workTarget:
                                  event.currentTarget.value.trim() ||
                                  undefined,
                              })
                            }
                          />
                        </div>
      <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt2,
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.flexWrap,
                              assistantUtilityStyles.itemsCenter,
                              assistantUtilityStyles.gap2,
                              assistantUtilityStyles.text0575,
                              assistantUtilityStyles.uppercase,
                              assistantUtilityStyles.tracking014,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          <StatusChip tone={todoStateTone(todo.state)}>
                            {todo.state}
                          </StatusChip>
                          <StatusChip
                            tone={todoWorkKindTone(todo.workKind)}
                          >
                            {todo.workKind}
                          </StatusChip>
                          <span>
                            {todo.source ?? "assistant"} | sort{" "}
                            <span
                              class={
                                stylex.attrs(
                                  rightAlignedNumbersEnabled() &&
                                    assistantPanelStyles.numericFlagged,
                                ).class
                              }
                            >
                              {todo.sortOrder}
                            </span>
                          </span>
                        </div>
    </>
  );
}

function todoStateTone(state: AssistantTodo["state"]): StatusChipTone {
  switch (state) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "blocked":
      return "warning";
    case "in-progress":
      return "info";
    case "pending":
      return "neutral";
  }
}

function todoWorkKindTone(workKind: AssistantTodo["workKind"]): StatusChipTone {
  switch (workKind) {
    case "app-code":
      return "success";
    case "automation-code":
      return "info";
    case "documentation":
      return "accent";
    case "research":
      return "info";
    case "blocked":
      return "warning";
    case "unspecified":
      return "neutral";
  }
}
