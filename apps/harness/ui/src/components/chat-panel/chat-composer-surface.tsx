import { typography } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { Show } from "solid-js";
import { chatUtilityStyles } from "../chat-panel.utilities";
import { ChatComposerControl,ChatComposerFooter,ChatComposerLookupMenu,ChatComposerReferences,ChatComposerSetupStatus,ChatPendingQuestion } from "./chat-composer-sections";
import { useChatPanel } from "./state/panel-context";

export function ChatComposerSurface() {
  const controller = useChatPanel();
  const {
    composerTimerState, draggingAttachments, dropState, handleAttachmentDragLeave,
    handleAttachmentDragOver, handleAttachmentDrop, handleSelectAttachments, handleSubmit, refs,
    selectedAgentHealthMessage,
  } = controller;
  return <form
              data-test-chat-composer=""
              class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.shrink0, chatUtilityStyles.spaceY3).class}
              onSubmit={handleSubmit}
              onDragOver={handleAttachmentDragOver}
              onDragLeave={handleAttachmentDragLeave}
              onDrop={handleAttachmentDrop}
            >
              <Show when={draggingAttachments()}>
                <div class={stylex.attrs(chatUtilityStyles.pointerEventsNone, chatUtilityStyles.absolute, chatUtilityStyles.inset0, chatUtilityStyles.z10, chatUtilityStyles.grid, chatUtilityStyles.placeItemsCenter, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableAccent, chatUtilityStyles.bgWhite85, chatUtilityStyles.p4, chatUtilityStyles.textCenter, chatUtilityStyles.shadowLg).class}>
                  <div>
                    <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{dropState().label}</div>
                    <div class={stylex.attrs(chatUtilityStyles.mt1, typography.body, chatUtilityStyles.textVariableMuted).class}>{dropState().detail}</div>
                  </div>
                </div>
              </Show>
<ChatPendingQuestion />

              <Show when={selectedAgentHealthMessage()}>
                {(message) => (
                  <div class={stylex.attrs(chatUtilityStyles.rounded12rem, chatUtilityStyles.border, chatUtilityStyles.borderSky200, chatUtilityStyles.bgSky5080, chatUtilityStyles.p3, typography.body, chatUtilityStyles.leading6, chatUtilityStyles.textSky950).class}>
                    {message()}
                  </div>
                )}
              </Show>

              <Show when={composerTimerState()}>
                {(timer) => (
                  <div
                    aria-live="polite"
                    data-test-waiting-timer=""
                    role="status"
                    class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.px1, typography.body, chatUtilityStyles.fontMedium, chatUtilityStyles.textVariableMuted).class}
                  >
                    <Show when={timer().kind === "working"}>
                      <span aria-hidden="true" class={stylex.attrs(chatUtilityStyles.agentWaitingDots).class}>
                        <span data-test-agent-waiting-dot="" data-delay-index="0" class={stylex.attrs(chatUtilityStyles.agentWaitingDot).class} />
                        <span data-test-agent-waiting-dot="" data-delay-index="1" class={stylex.attrs(chatUtilityStyles.agentWaitingDot, chatUtilityStyles.agentWaitingDot2).class} />
                        <span data-test-agent-waiting-dot="" data-delay-index="2" class={stylex.attrs(chatUtilityStyles.agentWaitingDot, chatUtilityStyles.agentWaitingDot3).class} />
                      </span>
                    </Show>
                    <span>{timer().label}</span>
                  </div>
                )}
              </Show>

<ChatComposerControl />
<ChatComposerLookupMenu />
              <input
                ref={refs.attachmentInput}
                class={stylex.attrs(chatUtilityStyles.hidden).class}
                type="file"
                multiple
                accept="image/*,.pdf,.docx,.xlsx,.pptx,.odt,.txt,.md,.markdown,.json,.yml,.yaml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.swift,.sql,.sh,.bash,.zsh,.ini,.toml,.env,.csv,.log"
                onChange={handleSelectAttachments}
              />

<ChatComposerReferences />
<ChatComposerSetupStatus />

<ChatComposerFooter />
            </form>;
}
