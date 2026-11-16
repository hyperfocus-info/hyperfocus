import { Show, createEffect } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId } from "@hyperfocus/ai-core/protocol";
import { requestCliAttach } from "../terminal/terminal-transport";
import { getActiveProject, harnessStore } from "../harness-store";
import { sendCliSessionInput } from "../harness-websocket";
import { ActionButton } from "./action-button";
import { Input } from "@hyperfocus/ui";
import { terminalStyles as styles, terminalUtilities as utilities } from "../terminal/terminal.styles";

export function CliSessionPanel() {
  let outputRef: HTMLPreElement | undefined;
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeProject = () => getActiveProject(state);
  const activeSession = () => activeProject()?.activeCliSession;
  const terminalState = () =>
    activeSession() ? state.cliSessionTerminal[activeSession()!.id] : undefined;

  createEffect(() => {
    terminalState()?.stdout;
    terminalState()?.stderr;
    queueMicrotask(() => {
      if (outputRef) {
        outputRef.scrollTop = outputRef.scrollHeight;
      }
    });
  });

  const handleReconnect = () => {
    const project = activeProject();
    const session = activeSession();
    if (!project || !session) {
      return;
    }

    requestCliAttach(sendCommand, { requestId: createRequestId(), projectId: project.id,
      threadId: project.activeThreadId, sessionId: session.id });
  };

  const handleStop = () => {
    const project = activeProject();
    const session = activeSession();
    if (!project || !session) {
      return;
    }

    sendCommand({
      type: "cli-session.stop",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: session.id
      }
    });
  };

  const handleCapture = () => {
    const project = activeProject();
    const session = activeSession();
    const terminal = terminalState();
    if (!project || !session || !terminal) {
      return;
    }

    sendCommand({
      type: "cli-session.capture-visible-buffer",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: session.id,
        visibleBuffer: terminal.stdout.slice(-64_000),
        stderrTail: terminal.stderr.slice(-32_000)
      }
    });
  };

  return (
    <Show
      when={activeSession()}
      fallback={
        <div class={stylex.attrs(styles.emptyCard, utilities.rounded135, utilities.border, utilities.borderDashed, utilities.p4, utilities.text068).class}>
          No live CLI session.
        </div>
      }
    >
      {(session) => (
        <div class={stylex.attrs(styles.card, utilities.flex, utilities.flexCol, utilities.gap3, utilities.rounded135, utilities.border, utilities.p4).class}>
          <div class={stylex.attrs(utilities.flex, utilities.flexWrap, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.text062, utilities.uppercase, utilities.tracking014, styles.muted).class}>
            <span>{session().agentId}</span>
            <span>Status: {session().status}</span>
            <span>{terminalState()?.connected ? "Attached" : "Detached"}</span>
          </div>
          <pre
            ref={outputRef}
            class={stylex.attrs(styles.cliOutput, utilities.maxH72, utilities.overflowAuto, utilities.rounded2xl, utilities.border, utilities.p3, utilities.fontMono, utilities.text07, utilities.leading5).class}
          >
            {(terminalState()?.stdout ?? "") + (terminalState()?.stderr ?? "")}
          </pre>
          <div class={stylex.attrs(utilities.flex, utilities.flexWrap, utilities.gap2).class}>
            <Input
              placeholder="Type terminal input and press Enter"
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                const value = event.currentTarget.value;
                if (!value) {
                  return;
                }

                sendCliSessionInput(session().id, `${value}\n`);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div class={stylex.attrs(utilities.flex, utilities.flexWrap, utilities.gap2).class}>
            <ActionButton tooltip="Reconnect PTY stream" variant="secondary" onClick={handleReconnect}>
              Reconnect
            </ActionButton>
            <ActionButton tooltip="Capture current terminal state for follow-up" variant="secondary" onClick={handleCapture}>
              Capture visible state
            </ActionButton>
            <ActionButton tooltip="Stop live CLI session" variant="secondary" onClick={handleStop}>
              Stop session
            </ActionButton>
          </div>
        </div>
      )}
    </Show>
  );
}

