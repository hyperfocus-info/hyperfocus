import { createRequestId,type CliSession,type TerminalSession } from "@hyperfocus/ai-core/protocol";
import { Input } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown,ClipboardCheck,Copy,Plus,RotateCw,Search,Settings2,Square,TerminalSquare } from "lucide-solid";
import { Match,Show,Switch,createEffect,createMemo,createSignal,onMount } from "solid-js";
import { lazySurface } from "../app/lazy-surface";
import { ActionButton } from "../components/action-button";
import { Dialog } from "../components/primitives/dialog";
import { DropdownControl } from "../components/primitives/dropdown";
import { Textarea } from "../components/primitives/textarea";
import { getActiveProject,harnessStore,type ViewProjectState } from "../harness-store";
import { sendCliSessionInput } from "../harness-websocket";
import { parseEnvText } from "./environment-fields";
import { SolidTerminalRendererPrototype } from "./renderers/solid-renderer-prototype";
import type { XtermRendererHandle } from "./renderers/xterm-renderer";
import { resolveTerminalKeyboardAction } from "./terminal-keybindings";
import { normalizeTerminalGlyphSpacing } from "./terminal-output-format";
import { shouldUseSolidTerminalRenderer } from "./terminal-renderer-mode";
import { TerminalSearch } from "./terminal-search";
import { closeTerminalSearch,openTerminalSearch,toggleTerminalSearch } from "./terminal-search-actions";
import { TerminalSplitLayout,createDefaultTerminalLayout } from "./terminal-split-layout";
import { terminalStore } from "./terminal-store";
import { TerminalTabs,type TerminalTabItem } from "./terminal-tabs";
import { ownTerminalCreatingAttachRequest,prepareManualTerminalReconnect,requestCliAttach,requestTerminalAttach } from "./terminal-transport";
import { terminalStyles as styles,terminalUtilities as utilities } from "./terminal.styles";

const XtermRenderer = lazySurface("terminal renderer", async () => ({ default: (await import("./renderers/xterm-renderer")).XtermRenderer }));

type DrawerSession =
  | {
      kind: "terminal";
      id: string;
      name: string;
      status: TerminalSession["status"];
      startedAt: string;
      session: TerminalSession;
    }
  | {
      kind: "cli";
      id: string;
      name: string;
      status: CliSession["status"];
      startedAt: string;
      session: CliSession;
    };

function createTerminalDrawerModel() {
  const activeProject = () => getActiveProject(harnessStore.state);
  const projectTerminalSessions = createMemo(() => {
    const project = activeProject();
    return project ? terminalStore.state.sessions.filter((session) => session.projectId === project.id) : [];
  });
  const drawerSessions = createMemo<DrawerSession[]>(() => {
    const project = activeProject();
    if (!project) return [];
    return [
      ...projectTerminalSessions().map((session): DrawerSession => ({
        kind: "terminal",
        id: session.id,
        name: session.name,
        status: session.status,
        startedAt: session.startedAt,
        session
      })),
      ...(project.cliSessions ?? []).map((session): DrawerSession => ({
        kind: "cli",
        id: session.id,
        name: formatCliSessionName(session, project),
        status: session.status,
        startedAt: session.startedAt,
        session
      }))
    ].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  });
  const tabItems = createMemo<TerminalTabItem[]>(() =>
    drawerSessions().map((session) => ({
      id: session.id,
      name: session.name,
      status: session.status,
      renamable: session.kind === "terminal" && session.session.source?.kind !== "agent",
      category: session.kind === "cli" || session.session.source?.kind === "agent" ? "spawned" : "terminal"
    }))
  );
  const activeEntry = () =>
    drawerSessions().find((session) => session.id === terminalStore.state.focusedSessionId) ?? drawerSessions()[0];
  const activeCliEntry = () => {
    const entry = activeEntry();
    return entry?.kind === "cli" ? entry : undefined;
  };
  const activeTerminalEntry = () => {
    const entry = activeEntry();
    return entry?.kind === "terminal" ? entry : undefined;
  };
  const activeTerminalSession = () => {
    const entry = activeEntry();
    return entry?.kind === "terminal" ? entry.session : undefined;
  };
  const retryTerminalTransport = (sessionId: string) => {
    const session = projectTerminalSessions().find((entry) => entry.id === sessionId);
    if (!session) return;
    const requestId = createRequestId();
    try {
      if (!requestTerminalAttach(harnessStore.actions.sendCommand, {
        requestId,
        projectId: session.projectId,
        sessionId
      })) throw new Error("Terminal attach was not accepted");
      prepareManualTerminalReconnect(sessionId);
    } catch {
      terminalStore.setTransportStatus(sessionId, "replay-exhausted");
    }
  };
  onMount(() => {
    harnessStore.actions.sendCommand({ type: "terminal.shells.list", requestId: createRequestId() });
  });
  createEffect(() => {
    const sessions = drawerSessions();
    if (!sessions.length) {
      terminalStore.focusSession(undefined);
      return;
    }
    if (!terminalStore.state.focusedSessionId || !sessions.some((session) => session.id === terminalStore.state.focusedSessionId)) {
      terminalStore.focusSession(sessions[0].id);
    }
  });
  createEffect(() => {
    const entry = activeEntry();
    if (!entry) return;
    if (entry.kind === "terminal") {
      if ((terminalStore.state.transportStatusBySessionId[entry.id] ?? "disconnected") !== "disconnected") return;
      terminalStore.setTransportStatus(entry.id, "connecting");
      const requestId = createRequestId();
      try {
        if (!requestTerminalAttach(harnessStore.actions.sendCommand, {
          requestId,
          projectId: entry.session.projectId,
          sessionId: entry.session.id
        })) throw new Error("Terminal attach was not accepted");
      } catch {
        terminalStore.setTransportStatus(entry.id, "replay-exhausted");
      }
      return;
    }
    if (
      (entry.session.status === "running" || entry.session.status === "starting") &&
      !harnessStore.state.cliSessionTerminal[entry.id]?.connected
    ) {
      requestCliAttach(harnessStore.actions.sendCommand, {
        requestId: createRequestId(),
        projectId: entry.session.projectId,
        threadId: entry.session.threadId,
        sessionId: entry.session.id
      });
    }
  });
  return {
    activeProject,
    projectTerminalSessions,
    drawerSessions,
    tabItems,
    activeEntry,
    activeCliEntry,
    activeTerminalEntry,
    activeTerminalSession,
    retryTerminalTransport
  };
}

function createTerminalDrawerActions(options: {
  shellId: () => string;
  envText: () => string;
  activeProject: ReturnType<typeof createTerminalDrawerModel>["activeProject"];
  projectTerminalSessions: ReturnType<typeof createTerminalDrawerModel>["projectTerminalSessions"];
  drawerSessions: ReturnType<typeof createTerminalDrawerModel>["drawerSessions"];
  activeEntry: ReturnType<typeof createTerminalDrawerModel>["activeEntry"];
  activeTerminalSession: ReturnType<typeof createTerminalDrawerModel>["activeTerminalSession"];
}) {
  const createSession = () => {
    const project = options.activeProject();
    if (!project) return;
    const parsedEnv = parseEnvText(options.envText());
    const requestId = createRequestId();
    if (!harnessStore.actions.sendCommand({
      type: "terminal.session.create",
      requestId,
      payload: {
        projectId: project.id,
        shellId: options.shellId() || terminalStore.state.preferences.defaultShellId,
        cols: options.activeEntry()?.session.cols ?? 100,
        rows: options.activeEntry()?.session.rows ?? 24,
        env: parsedEnv.length ? parsedEnv : undefined
      }
    })) return;
    ownTerminalCreatingAttachRequest(requestId);
  };
  const closeSession = (session: TerminalSession) => {
    const running = session.status === "running" || session.status === "starting";
    if (running && !window.confirm(`Stop and close ${session.name}?`)) return;
    harnessStore.actions.sendCommand({
      type: "terminal.session.close",
      requestId: createRequestId(),
      payload: { projectId: session.projectId, sessionId: session.id }
    });
  };
  const closeEntry = (sessionId: string) => {
    const entry = options.drawerSessions().find((session) => session.id === sessionId);
    if (!entry) return;
    if (entry.kind === "terminal") {
      closeSession(entry.session);
      return;
    }
    const running = entry.session.status === "running" || entry.session.status === "starting";
    if (running && !window.confirm(`Stop and close ${entry.name}?`)) return;
    harnessStore.actions.sendCommand({
      type: "cli-session.stop",
      requestId: createRequestId(),
      payload: {
        projectId: entry.session.projectId,
        threadId: entry.session.threadId,
        sessionId: entry.session.id
      }
    });
  };
  const savePreferences = () => {
    harnessStore.actions.sendCommand({
      type: "terminal.preferences.save",
      requestId: createRequestId(),
      payload: {
        preferences: {
          ...terminalStore.state.preferences,
          defaultShellId: options.shellId() || terminalStore.state.preferences.defaultShellId
        },
        layout: terminalStore.state.layout ?? createDefaultTerminalLayout(options.activeTerminalSession()?.id)
      }
    });
  };
  const startResize = (event: PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = terminalStore.state.height;
    let nextHeight = startHeight;
    let animationFrame: number | undefined;
    const applyHeight = () => {
      animationFrame = undefined;
      terminalStore.setHeight(nextHeight);
    };
    const onPointerMove = (moveEvent: PointerEvent) => {
      nextHeight = startHeight - (moveEvent.clientY - startY);
      if (animationFrame === undefined) animationFrame = window.requestAnimationFrame(applyHeight);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      terminalStore.setHeight(nextHeight);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };
  const copyActiveBuffer = () => {
    const entry = options.activeEntry();
    if (entry?.kind === "terminal") {
      void navigator.clipboard?.writeText(terminalStore.state.outputBySessionId[entry.id] ?? "");
    } else if (entry?.kind === "cli") {
      const terminal = harnessStore.state.cliSessionTerminal[entry.id];
      void navigator.clipboard?.writeText(`${terminal?.stdout ?? ""}${terminal?.stderr ?? ""}`);
    }
  };
  const handleDrawerKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && terminalStore.state.searchOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeTerminalSearch();
      return;
    }
    if (resolveTerminalKeyboardAction(event) === "toggle-search") {
      event.preventDefault();
      event.stopPropagation();
      toggleTerminalSearch();
    }
  };
  return { createSession, closeEntry, savePreferences, startResize, copyActiveBuffer, handleDrawerKeyDown };
}

export function TerminalDrawer() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [shellId, setShellId] = createSignal("");
  const [envText, setEnvText] = createSignal("");
  const model = createTerminalDrawerModel();
  const {
    projectTerminalSessions,
    drawerSessions,
    tabItems,
    activeEntry,
    activeCliEntry,
    activeTerminalEntry,
    retryTerminalTransport
  } = model;
  const { createSession, closeEntry, savePreferences, startResize, copyActiveBuffer, handleDrawerKeyDown } =
    createTerminalDrawerActions({
      shellId,
      envText,
      activeProject: model.activeProject,
      projectTerminalSessions,
      drawerSessions,
      activeEntry,
      activeTerminalSession: model.activeTerminalSession
    });

  return (
    <>
      <section
        data-test-terminal-drawer=""
        class={terminalStore.state.open
          ? stylex.attrs(styles.drawer, utilities.fixed, utilities.insetX0, utilities.bottom0, utilities.z40, utilities.flex, utilities.minH0, utilities.flexCol, utilities.borderT, utilities.shadow2xl, utilities.transition).class
          : stylex.attrs(styles.drawer, styles.drawerClosed, utilities.fixed, utilities.insetX0, utilities.bottom0, utilities.z40, utilities.flex, utilities.minH0, utilities.flexCol, utilities.borderT, utilities.shadow2xl, utilities.transition).class}
        style={{ height: `${terminalStore.state.height}px` }}
        onKeyDown={handleDrawerKeyDown}
      >
        <button
          type="button"
          class={stylex.attrs(styles.hoverSurface, utilities.h2, utilities.cursorRowResize, utilities.borderB, utilities.borderDefault, utilities.bgTransparent, utilities.transition).class}
          aria-label="Resize terminal drawer"
          onPointerDown={startResize}
        />
        <div class={stylex.attrs(utilities.flex, utilities.minH0, utilities.flex1).class}>
          <aside class={stylex.attrs(styles.sidebar, utilities.flex, utilities.shrink0, utilities.flexCol, utilities.borderR).class}>
            <header class={stylex.attrs(utilities.flex, utilities.h12, utilities.shrink0, utilities.itemsCenter, utilities.justifyBetween, utilities.gap2, utilities.borderB, utilities.borderDefault, utilities.px3).class}>
              <div class={stylex.attrs(utilities.minW0).class}>
                <div class={stylex.attrs(utilities.text056, utilities.fontSemibold, utilities.uppercase, utilities.tracking018, styles.muted).class}>Sessions</div>
                <div class={stylex.attrs(utilities.truncate, utilities.text082, utilities.fontSemibold, styles.foreground).class}>Terminal</div>
              </div>
              <ActionButton tooltip="New terminal" ariaLabel="New terminal" variant="secondary" size="icon" class={stylex.attrs(styles.emphasizedAction, utilities.h8, utilities.w8, utilities.roundedLg).class} icon={<Plus class={stylex.attrs(utilities.h4, utilities.w4).class} />} onClick={createSession} />
            </header>
            <div class={stylex.attrs(utilities.minH0, utilities.flex1, utilities.overflowAuto, utilities.px2, utilities.py2).class}>
              <TerminalTabs
                sessions={tabItems()}
                activeSessionId={activeEntry()?.id}
                onSelect={(sessionId) => {
                  terminalStore.focusSession(sessionId);
                  if (terminalStore.state.transportStatusBySessionId[sessionId] !== "replay-exhausted") return;
                  retryTerminalTransport(sessionId);
                }}
                onRename={(sessionId, name) => {
                  const session = projectTerminalSessions().find((entry) => entry.id === sessionId);
                  if (!session) {
                    return;
                  }
                  harnessStore.actions.sendCommand({
                    type: "terminal.session.rename",
                    requestId: createRequestId(),
                    payload: {
                      projectId: session.projectId,
                      sessionId,
                      name
                    }
                  });
                }}
                onClose={closeEntry}
              />
            </div>
            <footer class={stylex.attrs(utilities.grid, utilities.shrink0, utilities.gap2, utilities.borderT, utilities.borderDefault, utilities.p2).class}>
              <DropdownControl
                kind="select"
                icon={<TerminalSquare class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                ariaLabel="Select terminal shell"
                value={shellId() || terminalStore.state.preferences.defaultShellId || ""}
                options={terminalStore.state.shells.map((shell) => ({
                  value: shell.id,
                  label: shell.label,
                  description: shell.available ? shell.executableLabel : "Unavailable",
                  disabled: !shell.available
                }))}
                onChange={(value) => setShellId(value)}
                class={stylex.attrs(utilities.wFull).class}
              />
              <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.gap1).class}>
                <ActionButton tooltip="Terminal preferences" ariaLabel="Terminal preferences" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h8, utilities.w8, utilities.roundedLg).class} icon={<Settings2 class={stylex.attrs(utilities.h4, utilities.w4).class} />} onClick={() => setSettingsOpen(true)} />
                <ActionButton tooltip="Copy terminal buffer" ariaLabel="Copy terminal buffer" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h8, utilities.w8, utilities.roundedLg).class} icon={<Copy class={stylex.attrs(utilities.h4, utilities.w4).class} />} onClick={copyActiveBuffer} />
                <ActionButton tooltip="Close terminal drawer" ariaLabel="Close terminal drawer" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.mlAuto, utilities.h8, utilities.w8, utilities.roundedLg).class} icon={<ChevronDown class={stylex.attrs(utilities.h4, utilities.w4).class} />} onClick={() => terminalStore.setOpen(false)} />
              </div>
            </footer>
          </aside>
          <main class={stylex.attrs(styles.surface, utilities.flex, utilities.minH0, utilities.minW0, utilities.flex1, utilities.flexCol, utilities.p15).class}>
            <Switch fallback={<EmptyTerminalState onCreate={createSession} />}>
              <Match when={activeCliEntry()}>
                {(entry) => (
                  <CliSessionDrawerPane
                    session={entry().session}
                    name={entry().name}
                  />
                )}
              </Match>
              <Match when={activeTerminalEntry()}>
                {(entry) => (
                  <>
                    <Show when={terminalStore.state.transportStatusBySessionId[entry().id] === "replay-exhausted"}>
                      <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap2, utilities.p2, styles.dangerText).class} role="alert" data-test-terminal-replay-error="">
                        <span>Terminal connection expired before output could be restored.</span>
                        <ActionButton tooltip="Retry terminal connection" variant="secondary" onClick={() => retryTerminalTransport(entry().id)}>Retry</ActionButton>
                      </div>
                    </Show>
                    <TerminalSplitLayout sessions={projectTerminalSessions()} />
                  </>
                )}
              </Match>
            </Switch>
          </main>
        </div>
      </section>
      <Dialog
        open={settingsOpen()}
        title="Terminal Preferences"
        description="Configure integrated terminal defaults."
        onClose={() => setSettingsOpen(false)}
        footer={
          <ActionButton tooltip="Save terminal preferences" variant="secondary" onClick={() => { savePreferences(); setSettingsOpen(false); }}>
            Save
          </ActionButton>
        }
      >
        <div class={stylex.attrs(utilities.grid, utilities.gap4).class}>
          <label class={stylex.attrs(utilities.grid, utilities.gap1, utilities.textXs, utilities.fontMedium).class}>
            Scrollback limit
            <Input
              type="number"
              min="1000"
              max="200000"
              value={terminalStore.state.preferences.scrollbackLimit}
              onInput={(event) => terminalStore.applyServerEvent({
                type: "terminal.preferences.saved",
                requestId: createRequestId(),
                payload: {
                  preferences: {
                    ...terminalStore.state.preferences,
                    scrollbackLimit: Math.max(1000, Math.min(200000, Number(event.currentTarget.value) || 10000))
                  },
                  layout: terminalStore.state.layout
                }
              })}
            />
          </label>
          <label class={stylex.attrs(utilities.grid, utilities.gap1, utilities.textXs, utilities.fontMedium).class}>
            Environment variables
            <Textarea rows="5" value={envText()} placeholder={"NAME=value\nSECRET_TOKEN=***"} onInput={(event) => setEnvText(event.currentTarget.value)} />
          </label>
        </div>
      </Dialog>
    </>
  );
}

function EmptyTerminalState(props: { onCreate: () => void }) {
  return (
    <div class={stylex.attrs(styles.surface, utilities.flex, utilities.hFull, utilities.minH0, utilities.itemsCenter, utilities.justifyCenter, utilities.border).class}>
      <div class={stylex.attrs(utilities.flex, utilities.maxWSm, utilities.flexCol, utilities.itemsCenter, utilities.gap4, utilities.textCenter).class}>
        <Plus class={stylex.attrs(utilities.h12, utilities.w12, styles.muted).class} strokeWidth={1.5} />
        <ActionButton tooltip="Create a new terminal session" ariaLabel="New terminal session" variant="secondary" class={stylex.attrs(styles.emphasizedAction, utilities.h9, utilities.roundedMd, utilities.px4, utilities.textSm).class} icon={<Plus class={stylex.attrs(utilities.h4, utilities.w4).class} />} onClick={props.onCreate}>
          New Terminal Session
        </ActionButton>
        <p class={stylex.attrs(utilities.maxWXs, utilities.textSm, utilities.leading6, styles.muted).class}>
          No active terminals. Click to create a new session or choose one from the sidebar.
        </p>
      </div>
    </div>
  );
}

// A tab slot can select a different CLI session without unmounting the drawer.
function CliSessionDrawerPane(props: { session: CliSession; name: string }) {
  const identity = createMemo(() => JSON.stringify([props.session.projectId, props.session.id]));
  return <Show keyed when={identity()}>{(key) => key && renderSession()}</Show>;

  function renderSession() {
    const [renderer, setRenderer] = createSignal<XtermRendererHandle>();
    const activeProject = () => getActiveProject(harnessStore.state);
    const terminalState = () => harnessStore.state.cliSessionTerminal[props.session.id];
    const output = () => normalizeTerminalGlyphSpacing(`${terminalState()?.stdout ?? ""}${terminalState()?.stderr ?? ""}`);
    const connectionState = () => (terminalState()?.connected ? "attached" : "detached");

    const stopSession = () => {
      harnessStore.actions.sendCommand({
        type: "cli-session.stop",
        requestId: createRequestId(),
        payload: {
          projectId: props.session.projectId,
          threadId: props.session.threadId,
          sessionId: props.session.id
        }
      });
    };

    const attachSession = () => {
      requestCliAttach(harnessStore.actions.sendCommand, { requestId: createRequestId(), projectId: props.session.projectId,
        threadId: props.session.threadId, sessionId: props.session.id });
    };

    const captureVisibleState = () => {
      const terminal = terminalState();
      if (!terminal) {
        return;
      }
      harnessStore.actions.sendCommand({
        type: "cli-session.capture-visible-buffer",
        requestId: createRequestId(),
        payload: {
          projectId: props.session.projectId,
          threadId: props.session.threadId,
          sessionId: props.session.id,
          visibleBuffer: terminal.stdout.slice(-64_000),
          stderrTail: terminal.stderr.slice(-32_000)
        }
      });
    };

    return (
      <section class={stylex.attrs(styles.surface, utilities.flex, utilities.hFull, utilities.minH0, utilities.minW0, utilities.flex1, utilities.flexCol, utilities.border).class} data-test-cli-terminal-pane={props.session.id}>
        <div class={stylex.attrs(utilities.flex, utilities.minH11, utilities.shrink0, utilities.itemsCenter, utilities.justifyBetween, utilities.gap2, utilities.borderB, utilities.borderDefault, utilities.px3, utilities.py15).class}>
          <div class={stylex.attrs(utilities.minW0).class}>
            <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.gapX2, utilities.gapY05, utilities.fontMono, utilities.text072, utilities.leading4, styles.muted).class}>
              <span class={stylex.attrs(utilities.truncate, utilities.fontSemibold, styles.foreground).class}>{props.name}</span>
              <span>{"\u2022"}</span>
              <span>{connectionState()}</span>
              <span>{"\u2022"}</span>
              <span>{props.session.cols}x{props.session.rows}</span>
            </div>
            <div class={stylex.attrs(utilities.text062, utilities.leading4, styles.muted).class}>Spawned agent/CLI-created session</div>
          </div>
          <div class={stylex.attrs(utilities.flex, utilities.shrink0, utilities.itemsCenter, utilities.gap1).class}>
            {terminalStore.state.searchOpen && (
              <TerminalSearch
                onNext={() => renderer()?.findNext(terminalStore.state.searchQuery)}
                onPrevious={() => renderer()?.findPrevious(terminalStore.state.searchQuery)}
              />
            )}
            <ActionButton tooltip="Search terminal" ariaLabel="Search terminal" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<Search class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={openTerminalSearch} />
            <ActionButton tooltip="Reconnect CLI terminal" ariaLabel="Reconnect CLI terminal" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<RotateCw class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={attachSession} />
            <ActionButton tooltip="Capture current terminal state for follow-up" ariaLabel="Capture CLI terminal state" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<ClipboardCheck class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={captureVisibleState} />
            <ActionButton tooltip="Stop CLI terminal" ariaLabel="Stop CLI terminal" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<Square class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={stopSession} />
          </div>
        </div>
        <div class={stylex.attrs(styles.surface, utilities.minH0, utilities.flex1).class}>
          {shouldUseSolidTerminalRenderer(terminalStore.state.preferences.rendererMode) ? (
            <SolidTerminalRendererPrototype output={output()} onInput={(input) => sendCliSessionInput(props.session.id, input)} />
          ) : (
            <XtermRenderer
              sessionId={props.session.id}
              projectId={props.session.projectId}
              output={output()}
              searchQuery={terminalStore.state.searchQuery}
              copyOnSelect={terminalStore.state.preferences.copyOnSelect}
              ctrlCMode={terminalStore.state.preferences.ctrlCMode}
              sessionCwd={props.session.cwd}
              projectRoot={activeProject()?.rootPath ?? props.session.cwd}
              onOpenFile={(path, line, column) => harnessStore.openIdeFile(path, line, column)}
              onInput={(input) => sendCliSessionInput(props.session.id, input)}
              onReady={setRenderer}
            />
          )}
        </div>
      </section>
    );
  }
}

function formatCliSessionName(session: CliSession, project: ViewProjectState) {
  const agentLabel = session.agentId === "codex-cli" ? "Codex CLI" : "Copilot CLI";
  const threadTitle = project.threads.find((thread) => thread.id === session.threadId)?.title;
  const suffix = threadTitle ?? session.runId ?? session.threadId;
  return `${agentLabel} - ${suffix}`.slice(0, 128);
}
