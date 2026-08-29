/** @jsxImportSource solid-js */
import { For, Show, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Bot, ClipboardList, FlaskConical, ListChecks, Logs, MessageSquare, SquarePen } from "lucide-solid";
import { ActionButton } from "../action-button";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { DEFAULT_COMPOSER_REASONING_STRENGTH, harnessStore, type AssistantDetailTab } from "../../harness-store";
import { FileLinkedText } from "../file-linked-text";
import { ExecutionLog } from "../primitives/execution-log";
import type { AssistantsPanelController } from "./assistant-panel-controller";
import { assistantPanelStyles, assistantUtilityStyles } from "../assistants-panel.styles";
import { QuestionColumn } from "./question-column";

function formatReasoningStrengthLabel(strength: "low" | "medium" | "high" | "extra-high") {
  if (strength === "extra-high") return "Extra High";
  if (strength === "medium") return "Medium";
  if (strength === "low") return "Low";
  return "High";
}

export function AssistantQuestionsTab(props: { controller: AssistantsPanelController }) {
  const {
    activeTab, answerQuestion, assistantChatFileLinks, executionPauseReason,
    executionPaused, questionAnswers, setQuestionAnswers, visibleQuestions,
  } = props.controller;
  return (
    <Show when={activeTab() === "questions"}>
      <section
        class={
          stylex.attrs(
            assistantUtilityStyles.grid,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.gap4,
            assistantUtilityStyles.lgGridCols2,
          ).class
        }
      >
        <QuestionColumn
          title="Pending questions"
          emptyMessage="No pending questions. This assistant continues autonomously unless its policy requires your input."
          questions={visibleQuestions().filter(
            (question) => question.status === "pending",
          )}
          disabled={executionPaused()}
          disabledReason={executionPauseReason}
          questionAnswers={questionAnswers()}
          onAnswerInput={(questionId, value) =>
            setQuestionAnswers((current) => ({
              ...current,
              [questionId]: value,
            }))
          }
          onAnswer={answerQuestion}
          fileLinks={assistantChatFileLinks()}
        />
        <QuestionColumn
          title="Resolved questions"
          emptyMessage="No resolved questions yet."
          questions={visibleQuestions().filter(
            (question) => question.status === "answered",
          )}
          disabled={false}
          disabledReason={undefined}
          questionAnswers={questionAnswers()}
          onAnswerInput={() => undefined}
          onAnswer={() => undefined}
          fileLinks={assistantChatFileLinks()}
        />
      </section>
    </Show>
  );
}

export function AssistantLogTab(props: { controller: AssistantsPanelController }) {
  const {
    activeTab, assistantChatFileLinks, openAssistantLogSource,
    selectedExecutionLogs, state,
  } = props.controller;
  return (
    <Show when={activeTab() === "log"}>
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
              assistantUtilityStyles.text0585,
              assistantUtilityStyles.fontSemibold,
              assistantUtilityStyles.uppercase,
              assistantUtilityStyles.tracking018,
              assistantUtilityStyles.textMuted,
            ).class
          }
        >
          Execution log
        </div>
        <ExecutionLog
          entries={selectedExecutionLogs()}
          emptyMessage="No execution log yet."
          detailEyebrow="Assistant log details"
          selectedEntryId={state.assistants.selectedLogDetailsId}
          onSelectedEntryIdChange={
            harnessStore.setAssistantLogDetailsId
          }
          rowVariant="flat"
          fileLinks={assistantChatFileLinks()}
          onEntrySourceClick={openAssistantLogSource}
        />
      </section>
    </Show>
  );
}

export function AssistantConfigTab(props: { controller: AssistantsPanelController }) {
  const {
    activeTab, assistantChatFileLinks, selectedAssetRefs, selectedAssistant,
  } = props.controller;
  const assistant = () => {
    const current = selectedAssistant();
    if (!current) throw new Error("Assistant configuration requires a selected assistant.");
    return current;
  };
  return (
    <Show when={activeTab() === "config"}>
      <section
        class={
          stylex.attrs(
            assistantUtilityStyles.grid,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.gap4,
            assistantUtilityStyles.lgGridCols2,
          ).class
        }
      >
        <ConfigCard title="Role">
          <FileLinkedText
            text={assistant().description ?? "No description."}
            fileLinks={assistantChatFileLinks()}
          />
        </ConfigCard>
        <ConfigCard title="Routing">
          <div>Agent: {assistant().agentId}</div>
          <div>
            Provider: {assistant().providerBrand ?? "current"}
          </div>
          <div>Mode: {assistant().modeId ?? "default"}</div>
          <div>
            Execution model:{" "}
            {assistant().executionModelId ?? "default"}
          </div>
          <div>
            Effort:{" "}
            {formatReasoningStrengthLabel(
              assistant().reasoningStrength ??
                DEFAULT_COMPOSER_REASONING_STRENGTH,
            )}
          </div>
          <div>
            Fast mode: {assistant().fastMode ? "on" : "off"}
          </div>
          <div>Scope: {assistant().scope}</div>
        </ConfigCard>
        <ConfigCard title="Personality prompt">
          <div
            class={
              stylex.attrs(
                assistantUtilityStyles.whitespacePreWrap,
              ).class
            }
          >
            <FileLinkedText
              text={assistant().personalityPrompt}
              fileLinks={assistantChatFileLinks()}
            />
          </div>
        </ConfigCard>
        <ConfigCard title="Job prompt">
          <div
            class={
              stylex.attrs(
                assistantUtilityStyles.whitespacePreWrap,
              ).class
            }
          >
            <FileLinkedText
              text={assistant().jobPrompt}
              fileLinks={assistantChatFileLinks()}
            />
          </div>
        </ConfigCard>
        <ConfigCard title="Linked assets">
          <Show
            when={selectedAssetRefs().length > 0}
            fallback={<div>No asset refs.</div>}
          >
            <div
              class={
                stylex.attrs(assistantUtilityStyles.spaceY2).class
              }
            >
              <For each={selectedAssetRefs()}>
                {(assetRef) => (
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.borderL2,
                        assistantUtilityStyles.borderBorder,
                        assistantUtilityStyles.py2,
                        assistantUtilityStyles.pl3,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.text0625,
                          assistantUtilityStyles.uppercase,
                          assistantUtilityStyles.tracking014,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      {assetRef.kind}
                    </div>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.textForeground,
                        ).class
                      }
                    >
                      {assetRef.label}
                    </div>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.breakAll,
                          assistantUtilityStyles.text0675,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      <FileLinkedText
                        text={assetRef.value}
                        fileLinks={assistantChatFileLinks()}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </ConfigCard>
      </section>
    </Show>
  );
}

function ConfigCard(props: { title: string; children: JSX.Element }) {
  return (
    <section
      class={
        stylex.attrs(
          assistantUtilityStyles.text0675,
          assistantUtilityStyles.leading6,
          assistantUtilityStyles.textMuted,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.mb3,
            assistantUtilityStyles.text0585,
            assistantUtilityStyles.fontSemibold,
            assistantUtilityStyles.uppercase,
            assistantUtilityStyles.tracking018,
            assistantUtilityStyles.textMuted,
          ).class
        }
      >
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

export function AssistantDetailNavigation(props: { controller: AssistantsPanelController }) {
  const { activateJobsTab, activeTab, state } = props.controller;
  return (
    <>
    <div
      role="tablist"
      aria-label="Assistant detail sections"
      class={
        stylex.attrs(
          assistantUtilityStyles.flex,
          assistantUtilityStyles.gap1,
          assistantUtilityStyles.overflowXAuto,
          assistantUtilityStyles.borderB,
          assistantUtilityStyles.borderBorder,
        ).class
      }
    >
      <TabButton
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
        label="Chat"
        active={activeTab() === "chat"}
        onClick={() => harnessStore.setAssistantDetailTab("chat")}
      />
      <TabButton
        icon={
          <ListChecks
            class={
              stylex.attrs(
                assistantUtilityStyles.h4,
                assistantUtilityStyles.w4,
              ).class
            }
          />
        }
        label="Todos"
        active={activeTab() === "todos"}
        onClick={() =>
          harnessStore.setAssistantDetailTab("todos")
        }
      />
      <TabButton
        icon={
          <ClipboardList
            class={
              stylex.attrs(
                assistantUtilityStyles.h4,
                assistantUtilityStyles.w4,
              ).class
            }
          />
        }
        label="Questions"
        active={activeTab() === "questions"}
        onClick={() =>
          harnessStore.setAssistantDetailTab("questions")
        }
      />
      <TabButton
        icon={
          <Bot
            class={
              stylex.attrs(
                assistantUtilityStyles.h4,
                assistantUtilityStyles.w4,
              ).class
            }
          />
        }
        label="Jobs"
        active={activeTab() === "jobs"}
        onClick={activateJobsTab}
      />
      <TabButton
        icon={
          <Logs
            class={
              stylex.attrs(
                assistantUtilityStyles.h4,
                assistantUtilityStyles.w4,
              ).class
            }
          />
        }
        label="Log"
        active={activeTab() === "log"}
        onClick={() => harnessStore.setAssistantDetailTab("log")}
      />
      <TabButton
        icon={
          <SquarePen
            class={
              stylex.attrs(
                assistantUtilityStyles.h4,
                assistantUtilityStyles.w4,
              ).class
            }
          />
        }
        label="Config"
        active={activeTab() === "config"}
        onClick={() =>
          harnessStore.setAssistantDetailTab("config")
        }
      />
      <TabButton
        icon={
          <FlaskConical
            class={
              stylex.attrs(
                assistantUtilityStyles.h4,
                assistantUtilityStyles.w4,
              ).class
            }
          />
        }
        label="Learnings"
        active={activeTab() === "learnings"}
        onClick={() =>
          harnessStore.setAssistantDetailTab("learnings")
        }
      />
    </div>
    <Show when={activeTab() !== "config"}>
      <div
        class={
          stylex.attrs(
            assistantUtilityStyles.flex,
            assistantUtilityStyles.flexCol,
            assistantUtilityStyles.gap2,
          ).class
        }
      >
        <Input
          value={state.assistants.detailSearch}
          placeholder={`Search assistant ${activeTab()}`}
          onInput={(event) =>
            harnessStore.setAssistantPaneFilters({
              detailSearch: event.currentTarget.value,
            })
          }
        />
        <Show when={state.assistants.detailSearch}>
          <ActionButton
            tooltip="Clear assistant detail search"
            size="sm"
            variant="ghost"
            onClick={() =>
              harnessStore.setAssistantPaneFilters({
                detailSearch: "",
              })
            }
          >
            Clear search
          </ActionButton>
        </Show>
      </div>
    </Show>
    </>
  );
}

function TabButton(props: {
  icon: JSX.Element;
  label: Capitalize<AssistantDetailTab>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      tooltip={`Open ${props.label.toLowerCase()} tab`}
      role="tab"
      aria-selected={props.active}
      tabIndex={props.active ? 0 : -1}
      variant="ghost"
      size="sm"
      class={
        stylex.attrs(
          assistantPanelStyles.tab,
          props.active
            ? assistantPanelStyles.tabActive
            : assistantPanelStyles.tabIdle,
        ).class
      }
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </Button>
  );
}
