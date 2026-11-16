import { ActionMenu,Input,MenuItem } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { Copy,Edit3,MessageSquareMore,MoreHorizontal,Play,Plus,RefreshCcw,Split,Square,Terminal } from "lucide-solid";
import { createSignal,Show } from "solid-js";
import { harnessStore } from "../../harness-store";
import { normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import { tooltipWithPrimaryHotkey } from "../../lib/hotkey-hints";
import { pushToast } from "../../toast-store";
import { ActionButton } from "../action-button";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import { Button } from "../primitives/button";
import { Dialog } from "../primitives/dialog";
import { HarnessSwarmLauncher } from "../swarm/swarm-launcher";
import { useChatPanel } from "./state/panel-context";
import { ThreadCollaboration } from "./thread-collaboration";

export function ChatPanelHeader() {
  const controller = useChatPanel();
  const {
    activeThread, activeThreadIsStreaming, currentRun, currentTab, editingThreadTitle,
    handleCommitRenameThread, handleForkThread, handleOpenThreadTerminalHistory, handleReset,
    handleRetry, handleSelectPaneTab, handleStartRenameThread, handleStop, project, retryableRun,
    selectedAgentLabel, setEditingThreadTitle, setThreadTitleDraft, state, threadTitleDraft,
  } = controller;
  const simple = () => state.experienceMode === "simple";
  const [contextOpen, setContextOpen] = createSignal(false);
  const [collaborationOpen, setCollaborationOpen] = createSignal(false);
  const newThreadHotkey = () => normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).createProjectChat[0];
  const newThreadLabel = () => tooltipWithPrimaryHotkey("Create a new thread in this project", newThreadHotkey());
  const statusLabel = () => {
    if (activeThread()?.lineage?.status === "running") return "Working";
    const run = project().activeRun ?? project().lastRun;
    if (!run) return activeThreadIsStreaming() ? "Working" : "Ready";
    switch (run.status) {
      case "planning": return "Planning";
      case "awaiting-user-input": return "Needs your input";
      case "ready": return "Plan ready";
      case "running-main": case "running-subagents": case "aggregating": return "Working";
      case "partial-complete": return "Partially complete";
      case "completed": return "Completed";
      case "stopped": return "Stopped";
      case "failed": return "Failed";
    }
  };
  const agentInitial = () => selectedAgentLabel().trim().slice(0, 1).toUpperCase() || "A";

  return (
    <><header {...stylex.attrs(styles.chatHeader, simple() ? styles.chatHeaderSimple : undefined)}>
      <div {...stylex.attrs(styles.chatIdentity)}>
        <div {...stylex.attrs(styles.agentAvatar)} aria-hidden="true">{agentInitial()}</div>
        <div {...stylex.attrs(styles.chatIdentityCopy)}>
          <div {...stylex.attrs(styles.agentPresence)}>
            <span {...stylex.attrs(styles.agentName)}>{selectedAgentLabel()}</span>
            <span {...stylex.attrs(styles.presenceDot, statusLabel() === "Working" || statusLabel() === "Planning" ? styles.presenceDotWorking
              : statusLabel() === "Failed" ? styles.presenceDotFailed
              : ["Ready", "Plan ready", "Completed"].includes(statusLabel()) ? styles.presenceDotReady : undefined)} />
            <span data-test-thread-run-status {...stylex.attrs(styles.presenceLabel)}>{statusLabel()}</span>
            <span {...stylex.attrs(styles.projectName)}>in {project().name}</span>
          </div>
          <Show when={activeThread()?.lineage || project().threads.some(thread => thread.lineage?.parentThreadId === project().activeThreadId)}>
            <Button tooltip="View thread lineage" variant="ghost" size="sm" onClick={() => setCollaborationOpen(true)}>
              {activeThread()?.lineage?.relationship === "subagent" ? "Subagent" : activeThread()?.lineage ? "Fork" : "Subagents and forks"}
              <Show when={activeThread()?.lineage}> of {project().threads.find(thread => thread.id === activeThread()?.lineage?.parentThreadId)?.title ?? "parent thread"}</Show>
            </Button>
          </Show>
          <div {...stylex.attrs(styles.threadTitleRow)}>
            <Show
              when={editingThreadTitle()}
              fallback={
                <button type="button" aria-label="View current project and thread" {...stylex.attrs(styles.contextTrigger)} onClick={() => setContextOpen(true)}>
                  <span {...stylex.attrs(styles.chatThreadTitle)}>{activeThread()?.title ?? "Thread"}</span>
                </button>
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
        <Show when={project().id} keyed>{projectId => <HarnessSwarmLauncher projectId={projectId} projectName={project().name} goal={project().draft} agentRecipientId={project().activeThreadId} />}</Show>
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
        <Show when={activeThreadIsStreaming() && project().activeRun}>
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
        <ActionMenu ariaLabel="Thread actions" trigger={menu => <ActionButton tooltip="More thread actions" ariaLabel="More thread actions" icon={<MoreHorizontal {...stylex.attrs(styles.headerIcon)} />} size="icon" variant="ghost" aria-expanded={menu.open()} aria-haspopup="menu" onClick={menu.toggle} />}>
              <MenuItem aria-label={newThreadLabel()} icon={<Plus {...stylex.attrs(styles.headerIcon)} />} shortcut={newThreadHotkey()} onSelect={handleReset}>New thread</MenuItem>
              <MenuItem icon={<Edit3 {...stylex.attrs(styles.headerIcon)} />} onSelect={handleStartRenameThread}>Rename thread</MenuItem>
              <MenuItem icon={<Split {...stylex.attrs(styles.headerIcon)} />} onSelect={handleForkThread}>Fork thread</MenuItem>
              <MenuItem icon={<MessageSquareMore {...stylex.attrs(styles.headerIcon)} />} onSelect={() => setCollaborationOpen(true)}>Threads and subagents</MenuItem>
              <MenuItem icon={<Terminal {...stylex.attrs(styles.headerIcon)} />} onSelect={handleOpenThreadTerminalHistory}>Terminal history</MenuItem>
              <Show when={retryableRun()}>
                <MenuItem disabled={activeThreadIsStreaming()} icon={<RefreshCcw {...stylex.attrs(styles.headerIcon)} />} onSelect={handleRetry}>Retry last run</MenuItem>
              </Show>
              <MenuItem
                icon={<Copy {...stylex.attrs(styles.headerIcon)} />}
                onSelect={() => {
                  const threadId = activeThread()?.id ?? "";
                  void navigator.clipboard.writeText(threadId).then(() => pushToast("Thread id copied", threadId));
                }}
              >Copy thread ID</MenuItem>
        </ActionMenu>
      </div>
    </header>
    <Dialog open={contextOpen()} onClose={() => setContextOpen(false)} title="Current conversation" description="This thread and its work belong to the project below.">
      <dl {...stylex.attrs(styles.contextDetails)}><dt>Project</dt><dd>{project().name}</dd><dt>Folder</dt><dd>{project().rootPath}</dd><dt>Thread</dt><dd>{activeThread()?.title ?? "Thread"}</dd></dl>
    </Dialog>
    <ThreadCollaboration open={collaborationOpen()} onClose={() => setCollaborationOpen(false)} />
    </>
  );
}
