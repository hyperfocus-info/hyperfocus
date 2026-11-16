import { detailStyles } from "./assistant-detail.styles";
import { formatFailureCategory } from "./assistant-panel-model";
import { useAssistantsPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import type { Assistant } from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { RefreshCcw } from "lucide-solid";
import { For,Show } from "solid-js";
import { harnessStore } from "../../harness-store";
import { formatShortTimestamp } from "../../lib/time-format";
import { ActionButton } from "../action-button";
import { assistantUtilityStyles } from "../assistants-panel.styles";
import { FileLinkedText } from "../file-linked-text";
import { Dialog } from "../primitives/dialog";


export function AssistantCircuitBreakerDialog() {
  const controller = useAssistantsPanel();
  const {
    circuitBreakerAssistant, circuitBreakerFileLinks, executionPauseReason, executionPaused,
    openCircuitBreakerJobs, retryCircuitBreaker, selectedCircuitBreakerAssistantId,
    setSelectedCircuitBreakerAssistantId,
  } = controller;
  return (
    <Show when={selectedCircuitBreakerAssistantId()}>
      <Dialog
        open
        title="Circuit breaker"
        eyebrow="Assistant recovery"
        description="Inspect latest failure context, then retry recovery when ready."
        onClose={() => setSelectedCircuitBreakerAssistantId(undefined)}
        footer={
          <Show when={circuitBreakerAssistant()}>
            {(assistant) => (
              <>
                <ActionButton
                  tooltip="Keep assistant paused and close this dialog"
                  variant="secondary"
                  onClick={() =>
                    setSelectedCircuitBreakerAssistantId(undefined)
                  }
                >
                  Keep paused
                </ActionButton>
                <ActionButton
                  tooltip="Open assistant-owned background jobs"
                  variant="secondary"
                  onClick={openCircuitBreakerJobs}
                >
                  Open jobs
                </ActionButton>
                <ActionButton
                  tooltip="Focus this assistant in the Assistants surface"
                  variant="secondary"
                  onClick={() => {
                    harnessStore.setSelectedAssistantId(assistant().id);
                    setSelectedCircuitBreakerAssistantId(undefined);
                  }}
                >
                  Open assistant
                </ActionButton>
                <ActionButton
                  tooltip={
                    executionPaused()
                      ? executionPauseReason
                      : "Clear circuit breaker, resume assistant, and retry recovery"
                  }
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
                  ariaLabel="Retry"
                  onClick={() => retryCircuitBreaker(assistant())}
                >
                  Retry
                </ActionButton>
              </>
            )}
          </Show>
        }
      >
        <Show when={circuitBreakerAssistant()}>
          {(assistant) => (
            <div
              class={
                stylex.attrs(
                  assistantUtilityStyles.flex,
                  assistantUtilityStyles.flexCol, detailStyles.readable,
                  assistantUtilityStyles.gap4,
                ).class
              }
            >

              <section
                class={
                  stylex.attrs(
                    assistantUtilityStyles.rounded2xl,
                    assistantUtilityStyles.border,
                    assistantUtilityStyles.borderBorder,
                    assistantUtilityStyles.bgWhite70,
                    assistantUtilityStyles.p3,
                  ).class
                }
              >
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.mb2,
                      assistantUtilityStyles.text0585,
                      assistantUtilityStyles.fontSemibold,
                      assistantUtilityStyles.uppercase,
                      assistantUtilityStyles.tracking018,
                      assistantUtilityStyles.textMuted,
                    ).class
                  }
                >
                  Reason
                </div>
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.text075,
                      assistantUtilityStyles.leading5,
                      assistantUtilityStyles.textForeground,
                    ).class
                  }
                >
                  <FileLinkedText
                    text={
                      assistant().circuitBreakerReason ??
                      "No failure reason recorded."
                    }
                    fileLinks={circuitBreakerFileLinks()}
                  />
                </div>
              </section>
              <details {...stylex.attrs(detailStyles.disclosure)}><summary {...stylex.attrs(detailStyles.disclosureTrigger)}>Assistant state</summary><AssistantRecoverySummary assistant={assistant} /></details>
        <AssistantRecoveryLogs />
        <AssistantRecoveryRuns />
        <AssistantRecoveryQuestions />
            </div>
          )}
        </Show>
      </Dialog>
    </Show>
  );
}

function AssistantRecoverySummary(props: { assistant: () => Assistant }) {
  const { assistant } = props;
  return (
    <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.grid,
                        assistantUtilityStyles.gap2,
                        assistantUtilityStyles.text0675,
                        assistantUtilityStyles.textMuted,
                        detailStyles.columns,
                      ).class
                    }
                  >
                    <div>
                      <span
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        Assistant:
                      </span>{" "}
                      {assistant().name}
                    </div>
                    <div>
                      <span
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        Scope:
                      </span>{" "}
                      {assistant().scope}
                    </div>
                    <div>
                      <span
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        Run state:
                      </span>{" "}
                      {assistant().runState}
                    </div>
                    <div>
                      <span
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        Bootstrap:
                      </span>{" "}
                      {assistant().bootstrapState}
                    </div>
                    <div>
                      <span
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        Failure streak:
                      </span>{" "}
                      {assistant().failureStreakCount}
                    </div>
                    <div>
                      <span
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                          ).class
                        }
                      >
                        Breaker:
                      </span>{" "}
                      {assistant().circuitBreakerState}
                    </div>
                  </div>
  );
}

function AssistantRecoveryLogs() {
  const controller = useAssistantsPanel();
  const { circuitBreakerFileLinks, circuitBreakerLogs } = controller;
  return (
    <section
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.rounded2xl,
                        assistantUtilityStyles.border,
                        assistantUtilityStyles.borderBorder,
                        assistantUtilityStyles.bgWhite70,
                        assistantUtilityStyles.p3,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.mb2,
                          assistantUtilityStyles.text0585,
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.uppercase,
                          assistantUtilityStyles.tracking018,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      Latest logs
                    </div>
                    <Show
                      when={circuitBreakerLogs().length > 0}
                      fallback={
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.text0675,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          No recent logs.
                        </div>
                      }
                    >
                      <div
                        class={stylex.attrs(assistantUtilityStyles.spaceY2).class}
                      >
                        <For each={circuitBreakerLogs()}>
                          {(entry) => (
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.roundedXl,
                                  assistantUtilityStyles.border,
                                  assistantUtilityStyles.borderBorder,
                                  assistantUtilityStyles.bgWhite70,
                                  assistantUtilityStyles.p2,
                                  assistantUtilityStyles.text0675,
                                  assistantUtilityStyles.leading5,
                                ).class
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
                                <FileLinkedText
                                  text={`${entry.level} | ${entry.summary}`}
                                  fileLinks={circuitBreakerFileLinks()}
                                />
                              </div>
                              <div
                                class={
                                  stylex.attrs(assistantUtilityStyles.textMuted)
                                    .class
                                }
                              >
                                <FileLinkedText
                                  text={entry.detail ?? "No detail."}
                                  fileLinks={circuitBreakerFileLinks()}
                                />
                              </div>
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.mt1,
                                    assistantUtilityStyles.text0575,
                                    assistantUtilityStyles.uppercase,
                                    assistantUtilityStyles.tracking012,
                                    assistantUtilityStyles.textMuted,
                                  ).class
                                }
                              >
                                {formatShortTimestamp(entry.createdAt)}
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>
  );
}

function AssistantRecoveryRuns() {
  const controller = useAssistantsPanel();
  const { circuitBreakerFileLinks, circuitBreakerRuns } = controller;
  return (
    <section
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.rounded2xl,
                        assistantUtilityStyles.border,
                        assistantUtilityStyles.borderBorder,
                        assistantUtilityStyles.bgWhite70,
                        assistantUtilityStyles.p3,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.mb2,
                          assistantUtilityStyles.text0585,
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.uppercase,
                          assistantUtilityStyles.tracking018,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      Latest runs
                    </div>
                    <Show
                      when={circuitBreakerRuns().length > 0}
                      fallback={
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.text0675,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          No assistant-owned job runs.
                        </div>
                      }
                    >
                      <div
                        class={stylex.attrs(assistantUtilityStyles.spaceY2).class}
                      >
                        <For each={circuitBreakerRuns()}>
                          {(run) => (
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.roundedXl,
                                  assistantUtilityStyles.border,
                                  assistantUtilityStyles.borderBorder,
                                  assistantUtilityStyles.bgWhite70,
                                  assistantUtilityStyles.p2,
                                  assistantUtilityStyles.text0675,
                                  assistantUtilityStyles.leading5,
                                ).class
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
                                {run.status}
                              </div>
                              <div
                                class={
                                  stylex.attrs(assistantUtilityStyles.textMuted)
                                    .class
                                }
                              >
                                <FileLinkedText
                                  text={
                                    run.failureMessage ?? run.summary ?? run.id
                                  }
                                  fileLinks={circuitBreakerFileLinks()}
                                />
                              </div>
                              <Show when={run.failureCategory}>
                                {(category) => (
                                  <div
                                    class={
                                      stylex.attrs(
                                        assistantUtilityStyles.textMuted,
                                      ).class
                                    }
                                  >
                                    Category: {formatFailureCategory(category())}
                                  </div>
                                )}
                              </Show>
                              <div
                                class={
                                  stylex.attrs(
                                    assistantUtilityStyles.mt1,
                                    assistantUtilityStyles.text0575,
                                    assistantUtilityStyles.uppercase,
                                    assistantUtilityStyles.tracking012,
                                    assistantUtilityStyles.textMuted,
                                  ).class
                                }
                              >
                                {formatShortTimestamp(run.updatedAt)}
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>
  );
}

function AssistantRecoveryQuestions() {
  const controller = useAssistantsPanel();
  const { circuitBreakerFileLinks, circuitBreakerQuestions } = controller;
  return (
    <section
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.rounded2xl,
                        assistantUtilityStyles.border,
                        assistantUtilityStyles.borderBorder,
                        assistantUtilityStyles.bgWhite70,
                        assistantUtilityStyles.p3,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.mb2,
                          assistantUtilityStyles.text0585,
                          assistantUtilityStyles.fontSemibold,
                          assistantUtilityStyles.uppercase,
                          assistantUtilityStyles.tracking018,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      Pending questions
                    </div>
                    <Show
                      when={circuitBreakerQuestions().length > 0}
                      fallback={
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.text0675,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          No pending questions.
                        </div>
                      }
                    >
                      <div
                        class={stylex.attrs(assistantUtilityStyles.spaceY2).class}
                      >
                        <For each={circuitBreakerQuestions()}>
                          {(question) => (
                            <div
                              class={
                                stylex.attrs(
                                  assistantUtilityStyles.roundedXl,
                                  assistantUtilityStyles.border,
                                  assistantUtilityStyles.borderBorder,
                                  assistantUtilityStyles.bgWhite70,
                                  assistantUtilityStyles.p2,
                                  assistantUtilityStyles.text0675,
                                  assistantUtilityStyles.leading5,
                                  assistantUtilityStyles.textForeground,
                                ).class
                              }
                            >
                              <FileLinkedText
                                text={question.prompt}
                                fileLinks={circuitBreakerFileLinks()}
                              />
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>
  );
}
