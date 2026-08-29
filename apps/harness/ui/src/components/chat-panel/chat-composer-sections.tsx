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
  MoreHorizontal,
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
  Terminal,
  WandSparkles,
  X,
  Split
} from "lucide-solid";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import { chatUtilityStyles } from "../chat-panel.utilities";
import {
  formatCapabilityTag,
  formatTokenCount,
  getComposerLookupOptionId,
} from "./chat-panel-model";
import { getFileTypeIcon } from "./chat-composer-icons";
import type { ChatPanelController } from "../chat-panel";

export function ChatPendingQuestion(props: { controller: ChatPanelController }) {
  const {
    executionPauseReason, executionPaused, handleQuestionChoice, pendingQuestion,
  } = props.controller;
  return <Show when={pendingQuestion()}>
                {(question) => (
                  <div class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.overflowHidden, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgVariablePanelStrong, chatUtilityStyles.p3, chatUtilityStyles.shadowSm).class}>
                    <div class={stylex.attrs(chatUtilityStyles.absolute, chatUtilityStyles.insetY0, chatUtilityStyles.left0, chatUtilityStyles.w1, chatUtilityStyles.bgVariableWarning).class} />
                    <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.pl2, chatUtilityStyles.text0625rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking014em, chatUtilityStyles.textVariableWarningStrong).class}>
                      <MessageSquareMore class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35, chatUtilityStyles.shrink0).class} />
                      <span class={stylex.attrs(chatUtilityStyles.truncate).class}>
                        {question().intent?.type === "assistant-create-intent" && question().responseKind === "freeform" ? "Assistant setup" : "Planner question"}
                      </span>
                    </div>
                    <div class={stylex.attrs(chatUtilityStyles.pl2, chatUtilityStyles.textSm, chatUtilityStyles.fontMedium, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>{question().prompt}</div>
                    <Show when={question().placeholder}>
                      <div class={stylex.attrs(chatUtilityStyles.pl2, chatUtilityStyles.text07rem, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>Example: {question().placeholder}</div>
                    </Show>
                    <Show when={question().responseKind !== "freeform"}>
                      <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.gap2, chatUtilityStyles.smGridCols2, chatUtilityStyles.lgGridCols3).class}>
                        <For each={question().choices ?? []}>
                          {(choice) => (
                            <Button
                              tooltip={executionPaused() ? executionPauseReason() : choice.description}
                              type="button"
                              variant="secondary"
                              disabled={executionPaused()}
                              tooltipTriggerClass={stylex.attrs(styles.plannerChoiceTooltip).class}
                              class={stylex.attrs(
                                chatUtilityStyles.hAuto,
                                chatUtilityStyles.minH18,
                                chatUtilityStyles.wFull,
                                chatUtilityStyles.itemsStart,
                                chatUtilityStyles.justifyStart,
                                chatUtilityStyles.whitespaceNormal,
                                chatUtilityStyles.roundedLg,
                                chatUtilityStyles.px3,
                                chatUtilityStyles.py2,
                                chatUtilityStyles.textLeft,
                                chatUtilityStyles.transition,
                                chatUtilityStyles.hoverBorderVariableAccent,
                                choice.recommended ? styles.plannerChoiceRecommended : styles.plannerChoiceDefault
                              ).class}
                              aria-label={`Choose planner answer: ${choice.label}`}
                              onClick={() => handleQuestionChoice(choice.answerText)}
                            >
                              <span
                                class={stylex.attrs(
                                  chatUtilityStyles.flex,
                                  chatUtilityStyles.h5,
                                  chatUtilityStyles.w5,
                                  chatUtilityStyles.shrink0,
                                  chatUtilityStyles.itemsCenter,
                                  chatUtilityStyles.justifyCenter,
                                  chatUtilityStyles.roundedMd,
                                  chatUtilityStyles.border,
                                  chatUtilityStyles.text06rem,
                                  choice.recommended ? styles.plannerChoiceMarkerRecommended : styles.plannerChoiceMarkerDefault
                                ).class}
                              >
                                <Show when={choice.recommended} fallback={String((question().choices ?? []).findIndex((entry) => entry.id === choice.id) + 1)}>
                                  <Check class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />
                                </Show>
                              </span>
                              <span class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.flex1, chatUtilityStyles.flexCol, chatUtilityStyles.gap1).class}>
                                <span class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minW0, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2).class}>
                                  <span class={stylex.attrs(chatUtilityStyles.truncate, chatUtilityStyles.textXs, chatUtilityStyles.fontSemibold).class}>{choice.label}</span>
                                  <Show when={choice.recommended}>
                                    <span class={stylex.attrs(chatUtilityStyles.rounded, chatUtilityStyles.border, chatUtilityStyles.borderVariableWarning, chatUtilityStyles.px15, chatUtilityStyles.py05, chatUtilityStyles.text052rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking01em, chatUtilityStyles.textVariableWarningStrong).class}>
                                      Rec
                                    </span>
                                  </Show>
                                </span>
                                <span class={stylex.attrs(chatUtilityStyles.lineClamp3, chatUtilityStyles.text0675rem, chatUtilityStyles.fontNormal, chatUtilityStyles.leading5, chatUtilityStyles.textVariableMuted).class}>{choice.description}</span>
                              </span>
                            </Button>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={executionPaused()}>
                      <div class={stylex.attrs(chatUtilityStyles.pl2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableWarningStrong).class}>
                        Global pause active. Send answer after resume.
                      </div>
                    </Show>
                  </div>
                )}
              </Show>;
}

export function ChatComposerControl(props: { controller: ChatPanelController }) {
  const {
    attachmentButtonDisabled, attachmentButtonReason, composerLookupActiveOptionId, composerLookupOpen, composerSettingsOpen,
    composerSubmitState, desktopReasoningMenuOpen, executionPauseReason, executionPaused, getComposerPlaceholder,
    handleComposerClick, handleComposerKeyDown, project, refs,
    renderAgentControl, renderComposerControlMenu, renderEffortControl, renderModeControl, renderModelControl,
    renderProviderControl, resizeComposer, setComposerLookupActiveIndex, setComposerLookupForcedClosed, setComposerSettingsOpen,
    setDesktopReasoningMenuOpen, setDismissedComposerLookupKey, syncComposerCaret, syncComposerLookupDomVisibility,
    state,
  } = props.controller;
  const renderCompactControlRow = (advanced: boolean) => (
    <div
      data-test-composer-control-row=""
      class={stylex.attrs(styles.compactComposerControls, advanced ? styles.advancedCompactComposerControls : undefined).class}
    >
      {renderModelControl("sm", stylex.attrs(styles.compactModelControl).class, false)}
      <Popover
        open={composerSettingsOpen()}
        onClose={() => setComposerSettingsOpen(false)}
        align="start"
        side="top"
        contentClass={stylex.attrs(styles.compactSettingsPopover).class}
        content={
          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2).class}>
            {renderModeControl("md", stylex.attrs(styles.composerSettingsControl).class)}
            {renderAgentControl("md", stylex.attrs(styles.composerSettingsControl).class)}
            {renderProviderControl("md", stylex.attrs(styles.composerSettingsControl).class)}
            {renderComposerControlMenu()}
          </div>
        }
      >
        <ActionButton
          tooltip="More task settings"
          tooltipDisabled={composerSettingsOpen()}
          icon={<MoreHorizontal class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
          type="button"
          variant="ghost"
          size="icon"
          class={stylex.attrs(styles.composerOverflowButton).class}
          onClick={() => setComposerSettingsOpen((current) => !current)}
        />
      </Popover>
    </div>
  );
  return <ChatComposer
                dataTourId="chat-composer"
                textareaRef={(element) => {
                  refs.composerTextarea = element;
                }}
                rows="2"
                value={project().draft}
                placeholder={getComposerPlaceholder()}
                disabled={executionPaused()}
                disabledReason={executionPauseReason()}
                onSubmit={() => refs.composerTextarea?.form?.requestSubmit()}
                onKeyDown={handleComposerKeyDown}
                onKeyUp={syncComposerCaret}
                onClick={handleComposerClick}
                onSelect={syncComposerCaret}
                onFocus={() => queueMicrotask(syncComposerCaret)}
                ariaControls={composerLookupOpen() ? "chat-composer-lookup" : undefined}
                ariaExpanded={composerLookupOpen()}
                ariaActiveDescendant={composerLookupActiveOptionId()}
                onInput={(value) => {
                  syncComposerCaret();
                  harnessStore.setProjectDraft(project().id, value);
                  setComposerLookupForcedClosed(false);
                  setDismissedComposerLookupKey(undefined);
                  setComposerLookupActiveIndex(0);
                  queueMicrotask(() => syncComposerLookupDomVisibility());
                  resizeComposer();
                }}
                rightActions={
                  <>
                    <ActionButton
                      tooltip="Attach screenshots, PDFs, or office docs"
                      disabledReason={executionPaused() ? executionPauseReason() : attachmentButtonReason()}
                      disabled={executionPaused() || attachmentButtonDisabled()}
                      icon={<Paperclip class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                      type="button"
                      variant="ghost"
                      size="icon"
                      class={stylex.attrs(chatUtilityStyles.pointerEventsAuto, chatUtilityStyles.h8, chatUtilityStyles.w8, chatUtilityStyles.roundedLg).class}
                      onClick={() => refs.attachmentInput?.click()}
                    />
                    <ActionButton
                      tooltip={composerSubmitState().tooltip}
                      disabledReason={composerSubmitState().disabledReason}
                      disabled={composerSubmitState().disabled}
                      icon={<SendHorizontal class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                      type="submit"
                      variant="ghost"
                      size="icon"
                      class={stylex.attrs(chatUtilityStyles.pointerEventsAuto, chatUtilityStyles.h8, chatUtilityStyles.w8, chatUtilityStyles.roundedLg).class}
                      dataTourId="chat-send"
                    />
                  </>
                }
                leftControls={
                  <Show
                    when={state.experienceMode === "advanced"}
                    fallback={renderCompactControlRow(false)}
                  >
                  <>
                    <div data-test-composer-control-row="" class={stylex.attrs(styles.desktopComposerControls).class}>
                      {renderModeControl()}
                      {renderAgentControl()}
                      {renderProviderControl()}
                      {renderModelControl()}
                      <Popover
                        open={desktopReasoningMenuOpen()}
                        onClose={() => setDesktopReasoningMenuOpen(false)}
                        align="start"
                        side="top"
                            contentClass={stylex.attrs(styles.compactPopover).class}
                        content={renderComposerControlMenu()}
                      >
                        {renderEffortControl(() => setDesktopReasoningMenuOpen((current) => !current))}
                      </Popover>
                    </div>
                    {renderCompactControlRow(true)}
                  </>
                  </Show>
                }
              />;
}

export function ChatComposerLookupMenu(props: { controller: ChatPanelController }) {
  const {
    applyComposerLookupOption, composerLookup, composerLookupOpen, composerLookupRenderedOptions, handleComposerLookupKeyDown,
    refs, runWithChatPanelOwner, setComposerLookupActiveIndex, setComposerLookupMenuHidden, syncComposerLookupDomVisibility,
  } = props.controller;
  return <div
                ref={(element) => {
                  refs.composerLookupMenu = element;
                  queueMicrotask(() => {
                    if (composerLookupOpen() && refs.composerLookupMenu === element) {
                      syncComposerLookupDomVisibility();
                    } else {
                      setComposerLookupMenuHidden(true);
                    }
                  });
                }}
                id="chat-composer-lookup"
                data-test-composer-lookup=""
                hidden={!composerLookupOpen()}
                role={composerLookupOpen() ? "listbox" : undefined}
                aria-label={composerLookupOpen() ? "Composer lookup" : undefined}
                aria-hidden={composerLookupOpen() ? "false" : "true"}
                tabIndex={-1}
                class={stylex.attrs(chatUtilityStyles.absolute, chatUtilityStyles.bottom775rem, chatUtilityStyles.left8, chatUtilityStyles.right8, chatUtilityStyles.z20, chatUtilityStyles.maxH64, chatUtilityStyles.overflowAuto, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgVariablePanel, chatUtilityStyles.p1, chatUtilityStyles.shadowXl).class}
                onKeyDown={(event) => runWithChatPanelOwner(() => handleComposerLookupKeyDown(event))}
              >
                <For each={composerLookupRenderedOptions()}>
                  {(option) => (
                    <button
                      id={getComposerLookupOptionId(option.index)}
                      data-composer-lookup-option=""
                      data-composer-lookup-index={option.index}
                      type="button"
                      role={composerLookupOpen() ? "option" : undefined}
                      aria-selected={option.selected}
                      class={stylex.attrs(styles.composerLookupOption, option.selected && styles.composerLookupOptionSelected).class}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setComposerLookupActiveIndex(option.index);
                        applyComposerLookupOption(option.index);
                      }}
                      onMouseEnter={() => {
                        setComposerLookupActiveIndex(option.index);
                      }}
                    >
                      <Show when={composerLookup()?.kind === "skill"} fallback={getFileTypeIcon(option.insertText.slice(1).trim(), "sm")}>
                        <WandSparkles class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35, chatUtilityStyles.textVariableMuted).class} />
                      </Show>
                      <span class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.flex1).class}>
                        <span class={stylex.attrs(chatUtilityStyles.block, chatUtilityStyles.truncate, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{option.label}</span>
                        <span class={stylex.attrs(chatUtilityStyles.block, chatUtilityStyles.truncate, chatUtilityStyles.text05625rem, chatUtilityStyles.textVariableMuted).class}>{option.detail}</span>
                      </span>
                    </button>
                  )}
                </For>
              </div>;
}

export function ChatComposerReferences(props: { controller: ChatPanelController }) {
  const {
    draftAttachments, handleRemoveAttachment, uploadingAttachments,
  } = props.controller;
  return <Show when={draftAttachments().length > 0 || uploadingAttachments()}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                  <For each={draftAttachments()}>
                    {(attachment) => (
                      <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite75, chatUtilityStyles.px3, chatUtilityStyles.py1, chatUtilityStyles.text06rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
                        <span>{attachment.kind}</span>
                        <span class={stylex.attrs(chatUtilityStyles.maxW56, chatUtilityStyles.truncate, chatUtilityStyles.normalCase, chatUtilityStyles.trackingNormal).class}>{attachment.name}</span>
                        <ActionButton
                          tooltip="Remove attachment"
                          icon={<X class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3).class} />}
                          size="icon"
                          variant="ghost"
                          ariaLabel={`Remove ${attachment.name}`}
                          onClick={() => handleRemoveAttachment(attachment.id)}
                        />
                      </span>
                    )}
                  </For>
                  <Show when={uploadingAttachments()}>
                    <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite75, chatUtilityStyles.px3, chatUtilityStyles.py1, chatUtilityStyles.text06rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
                      <LoaderCircle class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3, chatUtilityStyles.animateSpin).class} />
                      Uploading attachments
                    </span>
                  </Show>
                </div>
              </Show>;
}

export function ChatComposerSetupStatus(props: { controller: ChatPanelController }) {
  const {
    composerReferenceBadges, handleComposerBadgeClick,
  } = props.controller;
  return <Show when={composerReferenceBadges().length > 0}>
                <div {...stylex.attrs(styles.attachmentList)}>
                  <For each={composerReferenceBadges()}>
                    {(badge) => (
                      <Button
                        data-test-composer-reference-badge=""
                        tooltip={`Ctrl/Meta-click to open ${badge.label} in the IDE`}
                        aria-label={`Open ${badge.label} in IDE`}
                        variant="secondary"
                        size="sm"
                        class={stylex.attrs(chatUtilityStyles.h7, chatUtilityStyles.maxWFull, chatUtilityStyles.roundedFull, chatUtilityStyles.px25, chatUtilityStyles.py1, chatUtilityStyles.text05625rem, chatUtilityStyles.fontSemibold).class}
                        onClick={(event) => handleComposerBadgeClick(event, badge)}
                      >
                        <Show when={badge.kind === "skill"} fallback={getFileTypeIcon(badge.target.path, "xs")}>
                          <WandSparkles class={stylex.attrs(chatUtilityStyles.h3, chatUtilityStyles.w3, chatUtilityStyles.textVariableMuted).class} />
                        </Show>
                        <span class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.truncate).class}>{badge.label}</span>
                      </Button>
                    )}
                  </For>
                </div>
              </Show>;
}

export function ChatComposerFooter(props: { controller: ChatPanelController }) {
  const {
    capabilityTags, contextUsage, getCacheHitPercent, getContextUsageTooltip,
    state,
  } = props.controller;
  return <Show when={state.experienceMode === "advanced"}><div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.lgFlexRow, chatUtilityStyles.lgItemsCenter, chatUtilityStyles.lgJustifyBetween).class}>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                  <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                    <For each={capabilityTags()}>
                      {(tag) => (
                        <span class={stylex.attrs(chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite70, chatUtilityStyles.px2, chatUtilityStyles.py05, chatUtilityStyles.text055rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textVariableMuted).class}>
                          {formatCapabilityTag(tag)}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={contextUsage()}>
                    {(usage) => (
                      <Tooltip content={getContextUsageTooltip()}>
                        <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap3, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite75, chatUtilityStyles.px25, chatUtilityStyles.py15, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableForeground).class}>
                          <span
                            class={stylex.attrs(chatUtilityStyles.relative, chatUtilityStyles.flex, chatUtilityStyles.h9, chatUtilityStyles.w9, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedFull).class}
                            style={{
                              background: `conic-gradient(var(--accent) ${Math.max(
                                0,
                                Math.min(100, Math.round(usage().usagePercent ?? 0))
                              )}%, rgba(38, 22, 15, 0.12) 0%)`
                            }}
                          >
                            <span class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.h7, chatUtilityStyles.w7, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedFull, chatUtilityStyles.bgVariablePanel, chatUtilityStyles.text05rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>
                              {Math.round(usage().usagePercent ?? 0)}%
                            </span>
                          </span>
                          <span>{`${Math.round(usage().usagePercent ?? 0)}% · ${formatTokenCount(usage().tokens)}/${formatTokenCount(
                            usage().contextWindow
                          )} context used`}</span>
                          <Show when={getCacheHitPercent(usage())}>
                            {(cacheHitPercent) => (
                              <span class={stylex.attrs(chatUtilityStyles.inlineFlex, chatUtilityStyles.itemsCenter, chatUtilityStyles.roundedFull, chatUtilityStyles.border, chatUtilityStyles.borderEmerald50030, chatUtilityStyles.bgEmerald50, chatUtilityStyles.px2, chatUtilityStyles.py05, chatUtilityStyles.text055rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking012em, chatUtilityStyles.textEmerald700).class}>
                                ⚡ Cache Hit {cacheHitPercent()}%
                              </span>
                            )}
                          </Show>
                        </span>
                      </Tooltip>
                    )}
                  </Show>
                </div>
                <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
                  {/*
                    Open live session is intentionally hidden for MVP.
                    This is unneeded at the moment, but can be reintroduced post-MVP.
                  */}
                  {/* <Show when={selectedAgentRuntime()?.agentId !== "pi"}>
                    <ActionButton
                      tooltip="Open live pipe-based CLI session"
                      disabledReason={
                        executionPaused()
                          ? executionPauseReason()
                          : !selectedAgentRuntime()?.installed
                            ? selectedAgentRuntime()?.healthMessage ?? "Runtime not installed"
                            : !selectedAgentRuntime()?.authenticated
                              ? selectedAgentRuntime()?.healthMessage ?? "Runtime not authenticated"
                              : !selectedAgentRuntime()?.interactivePipeCompatible
                                ? selectedAgentRuntime()?.healthMessage ?? "Interactive mode unavailable"
                                : undefined
                      }
                      disabled={
                        executionPaused() ||
                        !selectedAgentRuntime()?.installed ||
                        !selectedAgentRuntime()?.authenticated ||
                        !selectedAgentRuntime()?.interactivePipeCompatible
                      }
                      type="button"
                      variant="secondary"
                      onClick={handleStartLiveSession}
                    >
                      Open live session
                    </ActionButton>
                  </Show> */}
                </div>
              </div></Show>;
}
