import { For, Match, Show, Switch, createEffect, createMemo, createSignal, getOwner, onCleanup, onMount, runWithOwner, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  canSelectProviderBrand,
  COMPOSER_REASONING_STRENGTHS,
  getEffectiveProviderBrandForAgent,
  getActiveMode,
  getCapabilityTags,
  getBlockingSetupCheck,
  getComposerControlState,
  getExecutionModelOptionsForAgent,
  getFallbackExecutionModelIdForAgent,
  getModelCapability,
  getResolvedModes,
  harnessStore,
  hasUsableApiKeyForProvider,
  persistMergedLocalPreferences,
  resolveUsablePiProviderBrand,
  shouldShowSetupChecklist,
  type ChatPaneTab,
  type ViewProjectState
} from "../../harness-store";
import { ActionButton, ActionStatus } from "../action-button";
import { ChatComposer } from "../primitives/chat-composer";
import { Popover } from "../primitives/popover";
import { Tooltip } from "../primitives/tooltip";
import { Button } from "../primitives/button";
import {
  Activity,
  AlertTriangle,
  Brain,
  Bot,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Clipboard,
  Cpu,
  Edit3,
  FolderOpen,
  Folder,
  Gauge,
  LoaderCircle,
  MessageSquareMore,
  Orbit,
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  ArrowDown,
  Check,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  SendHorizontal,
  Settings,
  Terminal,
  WandSparkles,
  X,
  Split
} from "lucide-solid";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import { chatUtilityStyles } from "../chat-panel.utilities";
import type { ChatPanelController } from "../chat-panel";
import {
  formatCapabilityTag,
  formatTokenCount,
  getComposerLookupOptionId,
} from "./chat-panel-model";

export function ChatComposerSurface(props: { controller: ChatPanelController }) {
  const {
    applyComposerLookupOption, attachmentButtonDisabled, attachmentButtonReason, capabilityTags, composerLookup,
    composerLookupActiveOptionId, composerLookupOpen, composerLookupRenderedOptions, composerReferenceBadges, composerSettingsOpen,
    composerSubmitState, composerTimerState, contextUsage, desktopReasoningMenuOpen, draftAttachments,
    draggingAttachments, dropState, executionPauseReason, executionPaused, getCacheHitPercent,
    getComposerPlaceholder, getContextUsageTooltip, handleAttachmentDragLeave, handleAttachmentDragOver, handleAttachmentDrop,
    handleComposerBadgeClick, handleComposerClick, handleComposerKeyDown, handleComposerLookupKeyDown, handleQuestionChoice,
    handleRemoveAttachment, handleSelectAttachments, handleSubmit, pendingQuestion,
    project, refs, renderAgentControl, renderComposerControlMenu, renderEffortControl,
    renderModeControl, renderModelControl, renderProviderControl, resizeComposer, runWithChatPanelOwner,
    selectedAgentHealthMessage, setComposerLookupActiveIndex, setComposerLookupForcedClosed, setComposerLookupMenuHidden, setComposerSettingsOpen,
    setDesktopReasoningMenuOpen, setDismissedComposerLookupKey, syncComposerCaret, syncComposerLookupDomVisibility,
    uploadingAttachments,
  } = props.controller;
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
                    <div class={stylex.attrs(chatUtilityStyles.text075rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{dropState().label}</div>
                    <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>{dropState().detail}</div>
                  </div>
                </div>
              </Show>
<ChatPendingQuestion controller={props.controller} />

              <Show when={selectedAgentHealthMessage()}>
                {(message) => (
                  <div class={stylex.attrs(chatUtilityStyles.rounded12rem, chatUtilityStyles.border, chatUtilityStyles.borderSky200, chatUtilityStyles.bgSky5080, chatUtilityStyles.p3, chatUtilityStyles.text0675rem, chatUtilityStyles.leading6, chatUtilityStyles.textSky950).class}>
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
                    class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.px1, chatUtilityStyles.text0675rem, chatUtilityStyles.fontMedium, chatUtilityStyles.textVariableMuted).class}
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

<ChatComposerControl controller={props.controller} />
<ChatComposerLookupMenu controller={props.controller} />
              <input
                ref={refs.attachmentInput}
                class={stylex.attrs(chatUtilityStyles.hidden).class}
                type="file"
                multiple
                accept="image/*,.pdf,.docx,.xlsx,.pptx,.odt,.txt,.md,.markdown,.json,.yml,.yaml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.swift,.sql,.sh,.bash,.zsh,.ini,.toml,.env,.csv,.log"
                onChange={handleSelectAttachments}
              />

<ChatComposerReferences controller={props.controller} />
<ChatComposerSetupStatus controller={props.controller} />

<ChatComposerFooter controller={props.controller} />
            </form>;
}
import { getFileTypeIcon } from "./chat-composer-icons";
import { ChatComposerControl, ChatComposerFooter, ChatComposerLookupMenu, ChatComposerReferences, ChatComposerSetupStatus, ChatPendingQuestion } from "./chat-composer-sections";
