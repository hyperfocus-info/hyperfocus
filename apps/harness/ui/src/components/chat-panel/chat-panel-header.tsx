import { Show, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Copy, Edit3, MessageSquareMore, MoreHorizontal, Play, Plus, RefreshCcw, Split, Square, Terminal } from "lucide-solid";
import { harnessStore } from "../../harness-store";
import { normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import { tooltipWithPrimaryHotkey } from "../../lib/hotkey-hints";
import { pushToast } from "../../toast-store";
import { ActionButton } from "../action-button";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Tooltip } from "../primitives/tooltip";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import type { ChatPanelController } from "../chat-panel";

export function ChatPanelHeader(props: { controller: ChatPanelController }) {
  const {
    activeThread, activeThreadIsStreaming, currentRun, currentTab, editingThreadTitle,
    handleCommitRenameThread, handleForkThread, handleOpenThreadTerminalHistory, handleReset,
    handleRetry, handleSelectPaneTab, handleStartRenameThread, handleStop, project, retryableRun,
    selectedAgentLabel, setEditingThreadTitle, setThreadTitleDraft, state, threadTitleDraft,
  } = props.controller;
  const simple = () => state.experienceMode === "simple";
  const newThreadHotkey = () => normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).createProjectChat[0];
  const newThreadLabel = () => tooltipWithPrimaryHotkey("Create a new thread in this project", newThreadHotkey());
  const statusLabel = () => activeThreadIsStreaming() ? "Working" : "Ready";
  const agentInitial = () => selectedAgentLabel().trim().slice(0, 1).toUpperCase() || "A";

  return (
    <header {...stylex.attrs(styles.chatHeader, simple() ? styles.chatHeaderSimple : undefined)}>
      <div {...stylex.attrs(styles.chatIdentity)}>
        <div {...stylex.attrs(styles.agentAvatar)} aria-hidden="true">{agentInitial()}</div>
        <div {...stylex.attrs(styles.chatIdentityCopy)}>
          <div {...stylex.attrs(styles.agentPresence)}>
            <span {...stylex.attrs(styles.agentName)}>{selectedAgentLabel()}</span>
            <span {...stylex.attrs(styles.presenceDot, activeThreadIsStreaming() ? styles.presenceDotWorking : styles.presenceDotReady)} />
            <span {...stylex.attrs(styles.presenceLabel)}>{statusLabel()}</span>
            <span {...stylex.attrs(styles.projectName)}>in {project().name}</span>
          </div>
          <div {...stylex.attrs(styles.threadTitleRow)}>
            <Show
              when={editingThreadTitle()}
              fallback={
                <Tooltip content={activeThread()?.title ?? "Thread"} triggerClass={stylex.attrs(styles.tooltipThreadTitle).class}>
                  <h2 {...stylex.attrs(styles.chatThreadTitle)}>{activeThread()?.title ?? "Thread"}</h2>
                </Tooltip>
              }
            >
              <Input
                class={stylex.attrs(styles.threadTitleInput).class}
                value={threadTitleDraft()}
                onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => setThreadTitleDraft(event.currentTarget.value)}
                onBlur={handleCommitRenameThread}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCommitRenameThread();
                  }
                  if (event.key === "Escape") setEditingThreadTitle(false);
                }}
              />
            </Show>
            <Show when={!simple()}>
              <ActionButton
                tooltip="Rename this thread"
                icon={<Edit3 {...stylex.attrs(styles.headerIcon)} />}
                size="icon"
                variant="ghost"
                ariaLabel="Rename this thread"
                class={stylex.attrs(styles.headerIconButton).class}
                onClick={handleStartRenameThread}
              />
            </Show>
          </div>
        </div>
      </div>

      <div {...stylex.attrs(styles.chatHeaderActions)}>
        <Show when={simple() && currentRun()}>
          <Button
            tooltip={currentTab() === "run" ? "Return to conversation" : "Review the current run"}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleSelectPaneTab(currentTab() === "run" ? "chat" : "run")}
          >
            {currentTab() === "run" ? <MessageSquareMore {...stylex.attrs(styles.headerIcon)} /> : <Play {...stylex.attrs(styles.headerIcon)} />}
            <span {...stylex.attrs(styles.headerActionLabel)}>{currentTab() === "run" ? "Chat" : "Run"}</span>
          </Button>
        </Show>
        <Show when={activeThreadIsStreaming()}>
          <ActionButton
            tooltip="Stop active run"
            icon={<Square {...stylex.attrs(styles.headerIcon)} />}
            variant="ghost"
            size="icon"
            ariaLabel="Stop active run"
            class={stylex.attrs(styles.headerStopButton).class}
            onClick={handleStop}
          />
        </Show>
        <details {...stylex.attrs(styles.headerMenuDetails)}>
          <summary role="button" aria-label="More thread actions" title="More thread actions" {...stylex.attrs(styles.headerMenuSummary)}>
            <MoreHorizontal {...stylex.attrs(styles.headerIcon)} />
          </summary>
          <div role="menu" aria-label="Thread actions" {...stylex.attrs(styles.headerMenu, styles.headerMenuItems)}>
              <HeaderMenuItem ariaLabel={newThreadLabel()} icon={<Plus {...stylex.attrs(styles.headerIcon)} />} shortcut={newThreadHotkey()} onSelect={handleReset}>New thread</HeaderMenuItem>
              <HeaderMenuItem icon={<Edit3 {...stylex.attrs(styles.headerIcon)} />} onSelect={handleStartRenameThread}>Rename thread</HeaderMenuItem>
              <HeaderMenuItem icon={<Split {...stylex.attrs(styles.headerIcon)} />} onSelect={handleForkThread}>Fork thread</HeaderMenuItem>
              <HeaderMenuItem icon={<Terminal {...stylex.attrs(styles.headerIcon)} />} onSelect={handleOpenThreadTerminalHistory}>Terminal history</HeaderMenuItem>
              <Show when={retryableRun()}>
                <HeaderMenuItem disabled={activeThreadIsStreaming()} icon={<RefreshCcw {...stylex.attrs(styles.headerIcon)} />} onSelect={handleRetry}>Retry last run</HeaderMenuItem>
              </Show>
              <HeaderMenuItem
                icon={<Copy {...stylex.attrs(styles.headerIcon)} />}
                onSelect={() => {
                  const threadId = activeThread()?.id ?? "";
                  void navigator.clipboard.writeText(threadId).then(() => pushToast("Thread id copied", threadId));
                }}
              >Copy thread ID</HeaderMenuItem>
          </div>
        </details>
      </div>
    </header>
  );
}

function HeaderMenuItem(props: { children: JSX.Element; icon: JSX.Element; ariaLabel?: string; shortcut?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      {...stylex.attrs(styles.headerMenuItem)}
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        if (!props.disabled) props.onSelect();
      }}
    >
      {props.icon}<span>{props.children}</span><Show when={props.shortcut}>{(shortcut) => <kbd {...stylex.attrs(styles.headerMenuShortcut)}>{shortcut()}</kbd>}</Show>
    </button>
  );
}
