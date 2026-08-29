/** @jsxImportSource solid-js */
import { Show, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId, type Assistant } from "@hyperfocus/ai-core/protocol";
import { CircleAlert, CirclePause, CirclePlay, CopyPlus, RefreshCcw, SquarePen, Trash2 } from "lucide-solid";
import { rightAlignedNumbersEnabled } from "../../lib/visual-flags";
import { ActionButton } from "../action-button";
import type { AssistantsPanelController } from "./assistant-panel-controller";
import { assistantPanelStyles, assistantUtilityStyles } from "../assistants-panel.styles";
import { FileLinkedText } from "../file-linked-text";
import { StatusChip } from "../primitives/status-chip";

export function AssistantDetailHeader(props: {
  assistant: () => Assistant;
  controller: AssistantsPanelController;
}) {
  const {
    assistantChatFileLinks, assistantRunStateTone,
    handleDeleteAssistant, openEditAssistant, sendCommand,
    setSelectedCircuitBreakerAssistantId, state,
  } = props.controller;
  const { assistant } = props;
  return (
    <div
      class={
        stylex.attrs(
          assistantUtilityStyles.borderB,
          assistantUtilityStyles.borderBorder,
          assistantUtilityStyles.pb4,
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
            assistantUtilityStyles.gap4,
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
                assistantUtilityStyles.flex,
                assistantUtilityStyles.flexWrap,
                assistantUtilityStyles.itemsCenter,
                assistantUtilityStyles.gap2,
              ).class
            }
          >
            <div
              class={
                stylex.attrs(
                  assistantUtilityStyles.text0585,
                  assistantUtilityStyles.fontSemibold,
                  assistantUtilityStyles.uppercase,
                  assistantUtilityStyles.tracking018,
                  assistantUtilityStyles.textMuted,
                ).class
              }
            >
              Inspector
            </div>
            <StatusChip
              tone={assistantRunStateTone(assistant().runState)}
            >
              {assistant().runState}
            </StatusChip>
            <Show
              when={assistant().circuitBreakerState === "tripped"}
            >
              <StatusChip tone="danger">
                circuit breaker
              </StatusChip>
            </Show>
          </div>
          <h2
            class={
              stylex.attrs(
                assistantUtilityStyles.mt1,
                assistantUtilityStyles.breakWords,
                assistantUtilityStyles.text12,
                assistantUtilityStyles.fontSemibold,
                assistantUtilityStyles.textForeground,
                assistantUtilityStyles.wrapAnywhere,
              ).class
            }
          >
            {assistant().name}
          </h2>
          <div
            class={
              stylex.attrs(
                assistantUtilityStyles.mt3,
                assistantUtilityStyles.grid,
                assistantUtilityStyles.gapX5,
                assistantUtilityStyles.gapY1,
                assistantUtilityStyles.borderL2,
                assistantUtilityStyles.borderBorder,
                assistantUtilityStyles.pl4,
                assistantUtilityStyles.text0675,
                assistantUtilityStyles.leading5,
                assistantUtilityStyles.textMuted,
                assistantUtilityStyles.smGridCols2,
                assistantUtilityStyles.xlGridCols3,
              ).class
            }
          >
            <AssistantFact label="Scope">
              {assistant().scope}
            </AssistantFact>
            <AssistantFact label="Bootstrap">
              {assistant().bootstrapState}
            </AssistantFact>
            <AssistantFact label="Questions">
              <span
                class={
                  stylex.attrs(
                    rightAlignedNumbersEnabled() &&
                      assistantPanelStyles.numericFlagged,
                  ).class
                }
              >
                {String(assistant().unreadQuestionCount)}
              </span>
            </AssistantFact>
          </div>
          <Show when={assistant().description}>
            {(description) => (
              <div
                class={
                  stylex.attrs(
                    assistantUtilityStyles.mt3,
                    assistantUtilityStyles.maxW3xl,
                    assistantUtilityStyles.borderL2,
                    assistantUtilityStyles.borderBorder,
                    assistantUtilityStyles.pl4,
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
        </div>
    
        <AssistantDetailActions controller={props.controller} assistant={assistant} />
      </div>
    </div>
  );
}

function AssistantDetailActions(props: { assistant: () => Assistant; controller: AssistantsPanelController }) {
  const { executionPauseReason, executionPaused, handleDeleteAssistant, openEditAssistant,
    sendCommand, setSelectedCircuitBreakerAssistantId, state } = props.controller;
  const { assistant } = props;
  return (
    <div class={stylex.attrs(
          assistantUtilityStyles.flex,
          assistantUtilityStyles.wFull,
          assistantUtilityStyles.maxWFull,
          assistantUtilityStyles.flexWrap,
          assistantUtilityStyles.gap2,
          assistantUtilityStyles.smWAuto,
          assistantUtilityStyles.smJustifyEnd,
        ).class}>
      <Show
        when={assistant().circuitBreakerState === "tripped"}
      >
        <ActionButton
          tooltip="Inspect circuit breaker failure and retry"
          ariaLabel="Inspect failure"
          icon={
            <CircleAlert
              class={
                stylex.attrs(
                  assistantUtilityStyles.h4,
                  assistantUtilityStyles.w4,
                ).class
              }
            />
          }
          variant="secondary"
          class={
            stylex.attrs(
              assistantUtilityStyles.borderAmber300,
              assistantUtilityStyles.textAmber900,
              assistantUtilityStyles.hoverBgAmber50,
            ).class
          }
          onClick={(event) => {
            event.stopPropagation();
            setSelectedCircuitBreakerAssistantId(
              assistant().id,
            );
          }}
        >
          Inspect failure
        </ActionButton>
      </Show>
      <ActionButton
        tooltip="Edit assistant config"
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
        variant="secondary"
        onClick={() => openEditAssistant(assistant())}
      >
        Edit
      </ActionButton>
      <ActionButton
        tooltip={
          assistant().runState === "paused"
            ? "Resume assistant background work"
            : "Pause assistant background work"
        }
        icon={
          assistant().runState === "paused" ? (
            <CirclePlay
              class={
                stylex.attrs(
                  assistantUtilityStyles.h4,
                  assistantUtilityStyles.w4,
                ).class
              }
            />
          ) : (
            <CirclePause
              class={
                stylex.attrs(
                  assistantUtilityStyles.h4,
                  assistantUtilityStyles.w4,
                ).class
              }
            />
          )
        }
        variant="secondary"
        class={
          assistant().runState === "paused"
            ? "border-(--accent) text-(--accent-strong) hover:bg-(--panel)"
            : "border-amber-300 text-amber-900 hover:bg-amber-50"
        }
        onClick={() =>
          sendCommand({
            type:
              assistant().runState === "paused"
                ? "assistant.resume"
                : "assistant.pause",
            requestId: createRequestId(),
            payload: { assistantId: assistant().id },
          })
        }
      >
        {assistant().runState === "paused"
          ? "Resume"
          : "Pause"}
      </ActionButton>
      <ActionButton
        tooltip="Retry assistant bootstrap research"
        disabled={executionPaused()}
        disabledReason={executionPauseReason}
        icon={
          <RefreshCcw
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
          sendCommand({
            type: "assistant.bootstrap.retry",
            requestId: createRequestId(),
            payload: { assistantId: assistant().id },
          })
        }
      >
        Retry bootstrap
      </ActionButton>
      <Show when={assistant().scope === "global"}>
        <ActionButton
          tooltip={
            state.workspace.activeProjectId
              ? "Clone global assistant into current project"
              : "Open a project before cloning"
          }
          disabled={!state.workspace.activeProjectId}
          disabledReason="Open project first"
          icon={
            <CopyPlus
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
            state.workspace.activeProjectId &&
            sendCommand({
              type: "assistant.clone-to-project",
              requestId: createRequestId(),
              payload: {
                assistantId: assistant().id,
                projectId: state.workspace.activeProjectId,
              },
            })
          }
        >
          Clone to project
        </ActionButton>
      </Show>
      <ActionButton
        tooltip="Delete assistant"
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
        variant="secondary"
        class={
          stylex.attrs(
            assistantUtilityStyles.borderDanger,
            assistantUtilityStyles.textDanger,
            assistantUtilityStyles.hoverBgPanel,
          ).class
        }
        onClick={() => handleDeleteAssistant(assistant())}
      >
        Delete
      </ActionButton>
    </div>
  );
}

function AssistantFact(props: { label: string; children: JSX.Element }) {
  return (
    <div
      class={
        stylex.attrs(
          assistantUtilityStyles.minW0,
          assistantUtilityStyles.breakWords,
          assistantUtilityStyles.wrapAnywhere,
        ).class
      }
    >
      <span
        class={
          stylex.attrs(
            assistantUtilityStyles.fontSemibold,
            assistantUtilityStyles.textForeground,
          ).class
        }
      >
        {props.label}:{" "}
      </span>
      <span>{props.children}</span>
    </div>
  );
}
