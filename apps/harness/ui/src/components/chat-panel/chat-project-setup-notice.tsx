import { typography } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import {
Pause,
Play
} from "lucide-solid";
import { Show } from "solid-js";
import { ActionButton } from "../action-button";
import { chatUtilityStyles } from "../chat-panel.utilities";
import { useChatPanel } from "./state/panel-context";

export function ChatProjectSetupNotice() {
  const controller = useChatPanel();
  const {
    countdownPaused, countdownReadyRun, countdownRemainingMs, currentExecutionPlan, executionPauseReason,
    executionPaused, handlePauseAutoRun, handleResumeAutoRun,
  } = controller;
  return <Show when={countdownReadyRun()}>
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.rounded125rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p3).class}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3, typography.body, chatUtilityStyles.textVariableMuted).class}>
                  <span>
                    Auto-run {countdownPaused() ? "paused" : "in progress"} for {currentExecutionPlan()?.gating.delaySeconds}s gate.
                  </span>
                  <ActionButton
                    tooltip={
                      executionPaused()
                        ? "Global pause freezes automatic execution countdown"
                        : countdownPaused()
                          ? "Resume automatic execution countdown"
                          : "Pause automatic execution countdown"
                    }
                    disabled={executionPaused()}
                    disabledReason={executionPauseReason()}
                    icon={countdownPaused() ? <Play class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} /> : <Pause class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />}
                    size="sm"
                    variant="secondary"
                    onClick={() => (countdownPaused() ? handleResumeAutoRun() : handlePauseAutoRun())}
                  >
                    {countdownPaused() ? "Resume auto-run" : "Pause auto-run"}
                  </ActionButton>
                </div>
                <div class={stylex.attrs(chatUtilityStyles.h2, chatUtilityStyles.overflowHidden, chatUtilityStyles.roundedFull, chatUtilityStyles.bgVariableBorder).class}>
                  <div
                    class={stylex.attrs(chatUtilityStyles.hFull, chatUtilityStyles.roundedFull, chatUtilityStyles.bgVariableAccent, chatUtilityStyles.transitionWidth).class}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          100 -
                          (countdownRemainingMs() /
                            Math.max(1, (currentExecutionPlan()?.gating.delaySeconds ?? 1) * 1000)) *
                          100
                        )
                      )}%`
                    }}
                  />
                </div>
              </div>
            </Show>;
}
