import { Match, Switch, createEffect, createMemo, createSignal, onMount } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ClipboardCheck, ChevronDown, Copy, Plus, RotateCw, Search, Settings2, Square, TerminalSquare } from "lucide-solid";
import { createRequestId, type CliSession, type TerminalEnvVar, type TerminalSession } from "../../../shared/protocol";
import { harnessStore, getActiveProject, type ViewProjectState } from "../harness-store";
import { sendCliSessionInput } from "../harness-websocket";
import { ActionButton } from "../components/action-button";
import { DropdownControl } from "../components/primitives/dropdown";
import { Input } from "../components/primitives/input";
import { Textarea } from "../components/primitives/textarea";
import { Dialog } from "../components/primitives/dialog";
import { terminalStore } from "./terminal-store";
import { TerminalTabs, type TerminalTabItem } from "./terminal-tabs";
import { TerminalSplitLayout, createDefaultTerminalLayout } from "./terminal-split-layout";
import { TerminalSearch } from "./terminal-search";
import { XtermRenderer, type XtermRendererHandle } from "./renderers/xterm-renderer";
import { SolidTerminalRendererPrototype } from "./renderers/solid-renderer-prototype";
import { normalizeTerminalGlyphSpacing } from "./terminal-output-format";
import { shouldUseSolidTerminalRenderer } from "./terminal-renderer-mode";
import { closeTerminalSearch, openTerminalSearch, toggleTerminalSearch } from "./terminal-search-actions";
import { resolveTerminalKeyboardAction } from "./terminal-keybindings";
import { terminalStyles as styles, terminalUtilities as utilities } from "./terminal.styles";

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

export function TerminalDrawer() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [shellId, setShellId] = createSignal("");
  const [envText, setEnvText] = createSignal("");
  const activeProject = () => getActiveProject(harnessStore.state);
  const projectTerminalSessions = createMemo(() => {
    const project = activeProject();
    return project ? terminalStore.state.sessions.filter((session) => session.projectId === project.id) : [];
  });
  const drawerSessions = createMemo<DrawerSession[]>(() => {
    const project = activeProject();
    if (!project) {
      return [];
    }
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
  const activeTerminalSession = () => {
    const entry = activeEntry();
    return entry?.kind === "terminal" ? entry.session : undefined;
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
    if (!entry) {
      return;
    }
    if (entry.kind === "terminal") {
      if (terminalStore.state.connectedBySessionId[entry.id]) {
        return;
      }
      harnessStore.actions.sendCommand({
        type: "terminal.session.attach",
        requestId: createRequestId(),
        payload: {
          projectId: entry.session.projectId,
          sessionId: entry.session.id
        }
      });
      return;
    }
    if (
      (entry.session.status === "running" || entry.session.status === "starting") &&
      !harnessStore.state.cliSessionTerminal[entry.id]?.connected
    ) {
      harnessStore.actions.sendCommand({
        type: "cli-session.attach",
        requestId: createRequestId(),
        payload: {
          projectId: entry.session.projectId,
          threadId: entry.session.threadId,
          sessionId: entry.session.id
        }
      });
    }
  });

  const createSession = () => {
    const project = activeProject();
    if (!project) {
      return;
    }
    const parsedEnv = parseEnvText(envText());
    harnessStore.actions.sendCommand({
      type: "terminal.session.create",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        shellId: shellId() || terminalStore.state.preferences.defaultShellId,
        cols: activeEntry()?.session.cols ?? 100,
        rows: activeEntry()?.session.rows ?? 24,
        env: parsedEnv.length ? parsedEnv : undefined
      }
    });
  };

  const closeSession = (session: TerminalSession) => {
    const running = session.status === "running" || session.status === "starting";
    if (running && !window.confirm(`Stop and close ${session.name}?`)) {
      return;
    }
    harnessStore.actions.sendCommand({
      type: "terminal.session.close",
      requestId: createRequestId(),
      payload: {
        projectId: session.projectId,
        sessionId: session.id
      }
    });
  };

  const closeEntry = (sessionId: string) => {
    const entry = drawerSessions().find((session) => session.id === sessionId);
    if (!entry) {
      return;
    }
    if (entry.kind === "terminal") {
      closeSession(entry.session);
      return;
    }
    const running = entry.session.status === "running" || entry.session.status === "starting";
    if (running && !window.confirm(`Stop and close ${entry.name}?`)) {
      return;
    }
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
          defaultShellId: shellId() || terminalStore.state.preferences.defaultShellId
        },
        layout: terminalStore.state.layout ?? createDefaultTerminalLayout(activeTerminalSession()?.id)
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
      if (animationFrame === undefined) {
        animationFrame = window.requestAnimationFrame(applyHeight);
      }
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
      terminalStore.setHeight(nextHeight);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const copyActiveBuffer = () => {
    const entry = activeEntry();
    if (entry?.kind === "terminal") {
      void navigator.clipboard?.writeText(terminalStore.state.outputBySessionId[entry.id] ?? "");
      return;
    }
    if (entry?.kind === "cli") {
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
                onSelect={terminalStore.focusSession}
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
              <Match when={activeEntry()?.kind === "cli" ? activeEntry() : undefined}>
                {(entry) => (
                  <CliSessionDrawerPane
                    session={(entry() as Extract<DrawerSession, { kind: "cli" }>).session}
                    name={entry().name}
                  />
                )}
              </Match>
              <Match when={activeEntry()?.kind === "terminal"}>
                <TerminalSplitLayout sessions={projectTerminalSessions()} />
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

function CliSessionDrawerPane(props: { session: CliSession; name: string }) {
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
    harnessStore.actions.sendCommand({
      type: "cli-session.attach",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        threadId: props.session.threadId,
        sessionId: props.session.id
      }
    });
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

function formatCliSessionName(session: CliSession, project: ViewProjectState) {
  const agentLabel = session.agentId === "codex-cli" ? "Codex CLI" : "Copilot CLI";
  const threadTitle = project.threads.find((thread) => thread.id === session.threadId)?.title;
  const suffix = threadTitle ?? session.runId ?? session.threadId;
  return `${agentLabel} - ${suffix}`.slice(0, 128);
}

function parseEnvText(input: string): TerminalEnvVar[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 64)
    .map((line) => {
      const [name, ...valueParts] = line.split("=");
      return {
        name,
        value: valueParts.join("="),
        secret: /\b(secret|token|key|password)\b/i.test(name)
      };
    })
    .filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name));
}
