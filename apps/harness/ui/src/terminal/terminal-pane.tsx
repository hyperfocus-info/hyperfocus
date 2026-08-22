import { Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { AlertTriangle, Maximize2, Search, SplitSquareHorizontal, SplitSquareVertical, Square } from "lucide-solid";
import { createRequestId, type TerminalSession } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { ActionButton } from "../components/action-button";
import { terminalStore } from "./terminal-store";
import { XtermRenderer, type XtermRendererHandle } from "./renderers/xterm-renderer";
import { SolidTerminalRendererPrototype } from "./renderers/solid-renderer-prototype";
import { TerminalSearch } from "./terminal-search";
import { shouldUseSolidTerminalRenderer } from "./terminal-renderer-mode";
import { openTerminalSearch } from "./terminal-search-actions";
import { sendTerminalInput } from "./terminal-transport";
import { terminalStyles as styles, terminalUtilities as utilities } from "./terminal.styles";

export function TerminalPane(props: {
  session: TerminalSession;
  output: string;
  connected: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
}) {
  const [renderer, setRenderer] = createSignal<XtermRendererHandle>();
  const activeProject = () => getActiveProject(harnessStore.state);
  const source = () => props.session.source ?? { kind: "user" as const };
  const agentSource = () => {
    const current = source();
    return current.kind === "agent" ? current : undefined;
  };
  const readOnly = () => props.session.inputMode === "read-only" && props.session.inputOverride !== true;
  const connectionState = () => (props.connected ? "attached" : "detached");
  const pipeWarningLabel = () => props.session.transportMode === "pipe" ? "pipe mode" : props.session.transportWarning ? "degraded" : undefined;
  const lockReason = () => props.session.inputLockReason ?? "This terminal is locked while an agent or CLI run owns input.";
  const backspaceInput = () => props.session.transportMode === "pipe" ? "\b" : undefined;

  const resize = (cols: number, rows: number) => {
    if (cols === props.session.cols && rows === props.session.rows) {
      return;
    }
    harnessStore.actions.sendCommand({
      type: "terminal.session.resize",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        sessionId: props.session.id,
        cols,
        rows
      }
    });
  };

  const setInputOverride = (allowInput: boolean) => {
    harnessStore.actions.sendCommand({
      type: "terminal.session.set-input-override",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        sessionId: props.session.id,
        allowInput
      }
    });
  };

  return (
    <section class={stylex.attrs(styles.surface, utilities.flex, utilities.hFull, utilities.minH0, utilities.minW0, utilities.flex1, utilities.flexCol, utilities.border).class} data-test-terminal-pane={props.session.id}>
      <div class={stylex.attrs(utilities.flex, utilities.minH11, utilities.shrink0, utilities.itemsCenter, utilities.justifyBetween, utilities.gap2, utilities.borderB, utilities.borderDefault, utilities.px3, utilities.py15).class}>
        <div class={stylex.attrs(utilities.minW0).class}>
          <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.gapX2, utilities.gapY05, utilities.fontMono, utilities.text072, utilities.leading4, styles.muted).class}>
            <span class={stylex.attrs(utilities.truncate, utilities.fontSemibold, styles.foreground).class}>{props.session.name}</span>
            <span>{"\u2022"}</span>
            <span>{connectionState()}</span>
            <span>{"\u2022"}</span>
            <span>{props.session.cols}x{props.session.rows}</span>
          </div>
          <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.gap2, utilities.text062, utilities.leading4, styles.muted).class}>
            <Show when={agentSource()}>{(agent) => <span class={stylex.attrs(utilities.truncate).class}>{agent().label}</span>}</Show>
            <span class={stylex.attrs(utilities.uppercase, utilities.tracking008).class}>{props.session.status}</span>
          </div>
        </div>
        <div class={stylex.attrs(utilities.flex, utilities.shrink0, utilities.itemsCenter, utilities.gap1).class}>
          <Show when={readOnly()}>
            <TerminalBadge tone="warning">read-only</TerminalBadge>
          </Show>
          <Show when={agentSource() && props.session.inputOverride === true}>
            <TerminalBadge tone="success">override on</TerminalBadge>
            <ActionButton tooltip="Return input control to the agent" ariaLabel="Release terminal input override" variant="ghost" class={stylex.attrs(styles.action, utilities.h7, utilities.roundedMd, utilities.px2, utilities.text068).class} onClick={() => setInputOverride(false)}>
              Release Override
            </ActionButton>
          </Show>
          <Show when={pipeWarningLabel()}>
            {(label) => <WarningBadge label={label()} />}
          </Show>
          {terminalStore.state.searchOpen && (
            <TerminalSearch
              onNext={() => renderer()?.findNext(terminalStore.state.searchQuery)}
              onPrevious={() => renderer()?.findPrevious(terminalStore.state.searchQuery)}
            />
          )}
          <ActionButton tooltip="Search terminal" ariaLabel="Search terminal" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<Search class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={openTerminalSearch} />
          <ActionButton tooltip="Split terminal right" ariaLabel="Split terminal right" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<SplitSquareVertical class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={props.onSplitVertical} />
          <ActionButton tooltip="Split terminal down" ariaLabel="Split terminal down" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<SplitSquareHorizontal class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={props.onSplitHorizontal} />
          <ActionButton tooltip="Restart terminal" ariaLabel="Restart terminal" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<Maximize2 class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={() => harnessStore.actions.sendCommand({
            type: "terminal.session.restart",
            requestId: createRequestId(),
            payload: {
              projectId: props.session.projectId,
              sessionId: props.session.id,
              cols: props.session.cols,
              rows: props.session.rows
            }
          })} />
          <ActionButton tooltip="Stop terminal" ariaLabel="Stop terminal" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<Square class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={() => harnessStore.actions.sendCommand({
            type: "terminal.session.stop",
            requestId: createRequestId(),
            payload: {
              projectId: props.session.projectId,
              sessionId: props.session.id
            }
          })} />
        </div>
      </div>
      <Show when={readOnly()}>
        <div class={stylex.attrs(styles.warningSurface, utilities.flex, utilities.shrink0, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.borderB, utilities.px3, utilities.py2, utilities.text072).class}>
          <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2).class}>
            <AlertTriangle class={stylex.attrs(utilities.h35, utilities.w35, utilities.shrink0).class} />
            <span class={stylex.attrs(utilities.truncate).class}>Caution: {lockReason()}</span>
          </div>
          <ActionButton tooltip="Override terminal input lock" ariaLabel="Override terminal input lock" variant="secondary" class={stylex.attrs(styles.warningAction, utilities.h7, utilities.shrink0, utilities.roundedMd, utilities.px3, utilities.text068).class} onClick={() => setInputOverride(true)}>
            Override Lock
          </ActionButton>
        </div>
      </Show>
      <div class={stylex.attrs(styles.surface, utilities.minH0, utilities.flex1).class}>
        {shouldUseSolidTerminalRenderer(terminalStore.state.preferences.rendererMode) ? (
          <SolidTerminalRendererPrototype
            output={props.output}
            readOnly={readOnly()}
            backspaceInput={backspaceInput()}
            onInput={(input) => sendTerminalInput(props.session.id, input)}
          />
        ) : (
          <XtermRenderer
            sessionId={props.session.id}
            output={props.output}
            outputDelta={terminalStore.state.outputDeltaBySessionId[props.session.id]}
            outputVersion={terminalStore.state.outputVersionBySessionId[props.session.id]}
            outputResetVersion={terminalStore.state.outputResetVersionBySessionId[props.session.id]}
            searchQuery={terminalStore.state.searchQuery}
            copyOnSelect={terminalStore.state.preferences.copyOnSelect}
            ctrlCMode={terminalStore.state.preferences.ctrlCMode}
            sessionCwd={props.session.cwd}
            projectRoot={activeProject()?.rootPath ?? props.session.cwd}
            onOpenFile={(path, line, column) => harnessStore.openIdeFile(path, line, column)}
            onReady={setRenderer}
            onResize={resize}
            readOnly={readOnly()}
            backspaceInput={backspaceInput()}
          />
        )}
      </div>
    </section>
  );
}

function TerminalBadge(props: { tone: "success" | "warning"; children: string }) {
  return (
    <span class={props.tone === "warning"
      ? stylex.attrs(styles.warningBadge, utilities.inlineFlex, utilities.h6, utilities.shrink0, utilities.itemsCenter, utilities.roundedMd, utilities.border, utilities.px2, utilities.text062, utilities.fontSemibold, utilities.uppercase, utilities.tracking008).class
      : stylex.attrs(styles.successBadge, utilities.inlineFlex, utilities.h6, utilities.shrink0, utilities.itemsCenter, utilities.roundedMd, utilities.border, utilities.px2, utilities.text062, utilities.fontSemibold, utilities.uppercase, utilities.tracking008).class}>
      {props.children}
    </span>
  );
}

function WarningBadge(props: { label: string }) {
  return (
    <span class={stylex.attrs(styles.warningBadge, utilities.inlineFlex, utilities.h6, utilities.shrink0, utilities.itemsCenter, utilities.gap1, utilities.roundedMd, utilities.border, utilities.px2, utilities.text062, utilities.fontSemibold, utilities.uppercase, utilities.tracking008).class}>
      <AlertTriangle class={stylex.attrs(utilities.h3, utilities.w3).class} />
      {props.label}
    </span>
  );
}
