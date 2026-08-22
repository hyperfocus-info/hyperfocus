import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import { createHotkeys, formatForDisplay } from "@tanstack/solid-hotkeys";
import type { CreateHotkeyDefinition } from "@tanstack/solid-hotkeys";
import * as stylex from "@stylexjs/stylex";
import { Bot, BriefcaseBusiness, Clock3, Cog, ExternalLink, FolderKanban, Maximize2, Menu, Minimize2, Pause, Play, PanelsTopLeft, Workflow, CircleQuestionMark, X } from "lucide-solid";
import { createRequestId } from "../../shared/protocol";
import { AssistantEditorDialog } from "./components/assistant-editor-dialog";
import { AssistantsPanel } from "./components/assistants-panel";
import { BackgroundJobEditorDialog } from "./components/background-job-editor-dialog";
import { BackgroundJobsPanel } from "./components/background-jobs-panel";
import { ChatPanel } from "./components/chat-panel";
import { ConnectionBanner } from "./components/connection-banner";
import { ExecutionPlanDialog } from "./components/execution-plan-dialog";
import { HelpTutorialDialog } from "./components/help-tutorial-dialog";
import { NotificationInbox } from "./components/notification-inbox";
import { PreferenceSectionNav, PreferencesPanel } from "./components/preferences-modal";
import { ProjectSidebar } from "./components/project-sidebar";
import { ProjectSwitcherDialog } from "./components/project-switcher-dialog";
import { Toaster } from "./components/toaster";
import { TracePanel, TracePeekRail } from "./components/trace-panel";
import { getTutorialDefinition } from "./components/tutorial-definitions";
import { TutorialOverlay } from "./components/tutorial-overlay";
import { ActionButton } from "./components/action-button";
import { LeftPaneShell } from "./components/primitives/left-pane";
import { SheetContent, SheetRoot, SheetTrigger } from "./components/primitives/sheet";
import { Button } from "./components/primitives/button";
import { connectHarnessWebSocket } from "./harness-websocket";
import { harnessStore, type AssistantEditorDraft, type BackgroundJobEditorDraft, type HarnessLeftTab, type MainPanelSizes } from "./harness-store";
import { IdeWorkbench } from "./ide/ide-workbench";
import { ideStore } from "./ide/ide-store";
import { resolveBrowserTimezone } from "./lib/time-format";
import { appHotkeySettings, currentTabItemHotkeyIds, normalizeAppHotkeyPreferences, type AppHotkeyId } from "./lib/app-hotkeys";
import { selectCurrentTabItem } from "./lib/current-tab-item-hotkeys";
import { createIdeWindowUrl, IDE_POP_IN_EVENT, OPEN_IDE_WINDOW_EVENT, type OpenIdeWindowInput } from "./lib/ide-window";
import { createCurrentToastSourceNavigation } from "./source-navigation";
import { TerminalDrawer } from "./terminal/terminal-drawer";
import { toggleTerminalSearch } from "./terminal/terminal-search-actions";
import { terminalStore } from "./terminal/terminal-store";
import { reportUiError, setDefaultToastSourceResolver } from "./toast-store";

type IdeWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const IDE_WINDOW_STORAGE_KEY = "pi-harness:ide-window-state:v1";

export function App() {
  let connection: ReturnType<typeof connectHarnessWebSocket> | undefined;
  const persistedIdeWindow = readPersistedIdeWindowState();
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [ideWindowOpen, setIdeWindowOpen] = createSignal(persistedIdeWindow.open);
  const [ideWindowMaximized, setIdeWindowMaximized] = createSignal(persistedIdeWindow.maximized);
  const [ideWindowBounds, setIdeWindowBounds] = createSignal<IdeWindowBounds>(persistedIdeWindow.bounds);

  const openIdeVirtualWindow = () => {
    setIdeWindowOpen(true);
    harnessStore.setActiveSurface("ide");
  };
  const popOutIdeWindow = () => {
    const projectId = harnessStore.state.workspace.activeProjectId ?? undefined;
    const child = window.open(createIdeWindowUrl({ projectId }), "pi-harness-ide", "popup=yes,width=1280,height=860");
    child?.focus();
    closeIdeVirtualWindow();
  };
  const closeIdeVirtualWindow = () => {
    setIdeWindowOpen(false);
    setIdeWindowMaximized(false);
    if (harnessStore.state.activeSurface === "ide") {
      harnessStore.setActiveSurface("chat");
    }
  };

  const appHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return appHotkeySettings.filter((setting) => setting.id !== "focusCurrentSearch" && setting.scope !== "ide").flatMap((setting) =>
      hotkeys[setting.id].map((hotkey) => ({
        hotkey: hotkey as CreateHotkeyDefinition["hotkey"],
        callback: () => handleAppHotkey(setting.id, { openIde: openIdeVirtualWindow }),
        options: {
          meta: {
            name: setting.label,
            description: setting.description
          }
        }
      }))
    );
  };
  const projectSwitcherHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return hotkeys.openProjectSwitcher.map((hotkey) => ({
      hotkey: hotkey as CreateHotkeyDefinition["hotkey"],
      callback: () => handleAppHotkey("openProjectSwitcher"),
      options: {
        conflictBehavior: "allow",
        meta: {
          name: "Project switcher",
          description: "Open projects and active threads."
        }
      }
    }));
  };
  const searchHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return hotkeys.focusCurrentSearch.map((hotkey) => ({
      hotkey: hotkey as CreateHotkeyDefinition["hotkey"],
      callback: () => focusCurrentTabSearch(),
      options: {
        conflictBehavior: "allow",
        meta: {
          name: "Focus search",
          description: "Focus search for the current sidepanel"
        }
      }
    }));
  };

  createHotkeys(
    appHotkeys,
    () => ({
      enabled: harnessStore.state.activeSurface !== "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );
  createHotkeys(
    projectSwitcherHotkeys,
    () => ({
      enabled: harnessStore.state.activeSurface === "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );

  createEffect(() => {
    persistIdeWindowState({
      open: ideWindowOpen(),
      maximized: ideWindowMaximized(),
      bounds: ideWindowBounds()
    });
  });
  createHotkeys(
    searchHotkeys,
    () => ({
      enabled: harnessStore.state.activeSurface !== "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );
  createHotkeys(
    () => [
      {
        hotkey: "Escape",
        callback: () => {
          if (harnessStore.state.projectSwitcherOpen) {
            harnessStore.closeProjectSwitcher();
            return;
          }
          if (closeIdeOverlay()) {
            return;
          }
          closeIdeVirtualWindow();
        },
        options: {
          meta: {
            name: "Close IDE",
            description: "Close the IDE window"
          }
        }
      }
    ],
    () => ({
      enabled: harnessStore.state.activeSurface === "ide",
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );

  onMount(() => {
    harnessStore.hydrateLocalPreferences();
    harnessStore.actions.hydrateBrowserUiSession();
    harnessStore.hydrateTutorialProgress();
    setDefaultToastSourceResolver(() => createCurrentToastSourceNavigation(harnessStore.state));
    connection = connectHarnessWebSocket();
    harnessStore.actions.setCommandDispatcher((command) => connection?.sendCommand(command));
    if (window.location.pathname === "/ide") {
      harnessStore.setActiveSurface("ide");
      applyIdeRouteSelection();
    } else if (ideWindowOpen()) {
      harnessStore.setActiveSurface("ide");
    }
    const onOpenIdeWindow = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as OpenIdeWindowInput : {};
      openIdeVirtualWindow();
      applyIdeSelection(detail);
    };

    const onWindowError = (event: ErrorEvent) => {
      if (isResizeObserverLoopError(event.message)) {
        event.preventDefault();
        return;
      }
      console.error("Unexpected UI error", event.error ?? event.message);
      reportUiError(event.error ?? event.message, "Unexpected UI error", { rethrow: "never" });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection", event.reason);
      reportUiError(event.reason, "Unhandled promise rejection", { rethrow: "never" });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener(OPEN_IDE_WINDOW_EVENT, onOpenIdeWindow);
    window.addEventListener(IDE_POP_IN_EVENT, onOpenIdeWindow);

    onCleanup(() => {
      setDefaultToastSourceResolver(undefined);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener(OPEN_IDE_WINDOW_EVENT, onOpenIdeWindow);
      window.removeEventListener(IDE_POP_IN_EVENT, onOpenIdeWindow);
    });
  });

  onCleanup(() => {
    harnessStore.actions.setCommandDispatcher(undefined);
    connection?.dispose();
  });

  const state = harnessStore.state;
  const activeLeftTab = createMemo(() => state.activeLeftTab);
  const activeLeftTabDefinition = createMemo(() => leftPaneTabs.find((tab) => tab.id === activeLeftTab()) ?? leftPaneTabs[0]);
  const isIdeFullPage = () => window.location.pathname === "/ide";
  const mainPanelGridStyle = () => ({
    "--left-panel-size": `${state.mainPanelSizes.left}fr`,
    "--center-panel-size": `${state.mainPanelSizes.center}fr`,
    "--right-panel-size": `${state.mainPanelSizes.right}fr`
  });
  const startPanelResize = (divider: "left" | "right", event: PointerEvent) => {
    if (window.innerWidth < 1024) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startSizes = { ...state.mainPanelSizes };
    const total = state.tracePanelMode === "open"
      ? startSizes.left + startSizes.center + startSizes.right
      : startSizes.left + startSizes.center;
    const pixelsPerFr = Math.max(80, window.innerWidth / total);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaFr = (moveEvent.clientX - startX) / pixelsPerFr;
      const nextSizes: MainPanelSizes = { ...startSizes };
      if (divider === "left") {
        nextSizes.left = startSizes.left + deltaFr;
        nextSizes.center = startSizes.center - deltaFr;
      } else {
        nextSizes.center = startSizes.center + deltaFr;
        nextSizes.right = startSizes.right - deltaFr;
      }
      harnessStore.setMainPanelSizes(nextSizes);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };
  const executionControlTooltip = () => {
    if (!state.executionControl.isPaused) {
      return "Pause new executions";
    }

    return `Resume new executions | queued ${state.executionControl.deferredPlanningQuestionCount} planner, ${state.executionControl.deferredAssistantQuestionCount} assistant, ${state.executionControl.deferredBrowserApprovalCount} browser`;
  };
  if (isIdeFullPage()) {
    const popInIdeWindow = () => {
      const opener = window.opener as Window | null;
      if (opener && !opener.closed) {
        opener.dispatchEvent(new CustomEvent(IDE_POP_IN_EVENT, { detail: { projectId: harnessStore.state.workspace.activeProjectId ?? undefined } }));
        opener.focus();
        window.close();
        return;
      }
      window.location.href = "/";
    };
    return (
      <main data-test-ide-page="" {...stylex.attrs(styles.idePage)}>
        <IdeWorkbench windowMode="popped-out" onToggleWindowMode={popInIdeWindow} />
        <Toaster />
      </main>
    );
  }

  return (
    <main data-test-app-shell="" {...stylex.attrs(styles.appShell)}>
      <div {...stylex.attrs(styles.appBackground)} />
      <div {...stylex.attrs(styles.appContent)}>
        <header data-test-app-header="" {...stylex.attrs(styles.commandBar)}>
          <div {...stylex.attrs(styles.headerIdentity)}>
            <SheetRoot open={sidebarOpen()} onOpenChange={setSidebarOpen}>
              <div {...stylex.attrs(styles.mobileOnly)}>
                <SheetTrigger
                  class={stylex.attrs(styles.mobileMenuButton).class}
                  aria-label="Open projects"
                  data-tour-id="project-sidebar"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu {...stylex.attrs(styles.icon16)} />
                </SheetTrigger>
                <SheetContent open={sidebarOpen()} onClose={() => setSidebarOpen(false)} title="Workspace" class={stylex.attrs(styles.fullViewportHeight).class}>
                  <TabbedLeftPane compact onNavigate={() => setSidebarOpen(false)} />
                </SheetContent>
              </div>
            </SheetRoot>

            <div {...stylex.attrs(styles.minWidthZero)}>
              <div {...stylex.attrs(styles.workspaceLabel)}>
                <Workflow {...stylex.attrs(styles.icon14)} />
                <span {...stylex.attrs(styles.truncate)}>AI harness workspace</span>
              </div>
              <div data-test-mobile-surface-label="" {...stylex.attrs(styles.mobileSurfaceLabel)}>
                {(() => {
                  const Icon = activeLeftTabDefinition().icon;
                  return <Icon class={stylex.attrs(styles.icon14).class} />;
                })()}
                {activeLeftTabDefinition().label}
              </div>
            </div>
          </div>

          <div {...stylex.attrs(styles.headerActions)}>
            <ConnectionBanner />
            <NotificationInbox />
            <ActionButton
              tooltip={executionControlTooltip()}
              icon={state.executionControl.isPaused ? <Play {...stylex.attrs(styles.icon16)} /> : <Pause {...stylex.attrs(styles.icon16)} />}
              variant="ghost"
              size="sm"
              class={stylex.attrs(styles.executionControl, state.executionControl.isPaused ? styles.executionPaused : styles.executionRunning).class}
              onClick={() =>
                harnessStore.actions.sendCommand({
                  type: state.executionControl.isPaused ? "execution.resume-all" : "execution.pause-all",
                  requestId: createRequestId()
                })
              }
            >
              {state.executionControl.isPaused ? "Resume" : "Pause"}
            </ActionButton>
            <ActionButton
              tooltip="Open guided help and tutorials"
              icon={<CircleQuestionMark {...stylex.attrs(styles.icon16)} />}
              variant="secondary"
              dataTourId="help-button"
              onClick={() => harnessStore.openHelpDialog()}
            >
            </ActionButton>
            <ActionButton
              tooltip={withPrimaryHotkey(`Trace panel: ${state.tracePanelMode}. Click to cycle closed, peek, open.`, "toggleTracePanel")}
              icon={<PanelsTopLeft {...stylex.attrs(styles.icon16)} />}
              variant="secondary"
              dataTourId="trace-panel-toggle"
              onClick={() => harnessStore.toggleTracePanel()}
            >
              <span {...stylex.attrs(styles.traceButtonLabel)}>{state.tracePanelMode === "closed" ? "Trace" : state.tracePanelMode}</span>
            </ActionButton>
          </div>
        </header>

        <div
          data-test-main-panel-grid=""
          data-main-panel-mode={state.tracePanelMode}
          {...stylex.attrs(
            styles.mainPanelGrid,
            state.tracePanelMode === "open" && styles.mainPanelOpen,
            state.tracePanelMode === "peek" && styles.mainPanelPeek,
            state.tracePanelMode === "closed" && styles.mainPanelClosed
          )}
          style={mainPanelGridStyle()}
        >
          <div {...stylex.attrs(styles.desktopSidebar)}>
            <div data-tour-id="project-sidebar" {...stylex.attrs(styles.fullHeight)}>
              <TabbedLeftPane />
            </div>
          </div>
          <PanelResizeHandle label="Resize left and center panels" onPointerDown={(event) => startPanelResize("left", event)} />
          <div {...stylex.attrs(styles.mainPanelSurface)}>
            <Show
              when={activeLeftTab() === "jobs" || activeLeftTab() === "runs"}
              fallback={
                <Show
                  when={activeLeftTab() === "preferences"}
                  fallback={
                    <Show when={activeLeftTab() === "assistants"} fallback={<ChatPanel />}>
                      <AssistantsPanel variant="detail" />
                    </Show>
                  }
                >
                  <PreferencesPanel />
                </Show>
              }
            >
              <BackgroundJobsPanel variant="detail" segment={activeLeftTab() === "jobs" ? "jobs" : "runs"} />
            </Show>
          </div>
          <Show when={state.tracePanelMode !== "closed"}>
            <>
              <Show when={state.tracePanelMode === "open"} fallback={<div {...stylex.attrs(styles.desktopOnly)} />}>
                <PanelResizeHandle label="Resize center and trace panels" onPointerDown={(event) => startPanelResize("right", event)} />
              </Show>
              <div {...stylex.attrs(styles.shrinkablePanel)}>
                <Show when={state.tracePanelMode === "open"} fallback={<TracePeekRail />}>
                  <TracePanel />
                </Show>
              </div>
            </>
          </Show>
        </div>
      </div>

      <HelpTutorialDialog
        open={state.helpDialogOpen}
        setup={state.setup}
        completedTutorialIds={state.completedTutorialIds}
        dismissedTutorialIds={state.dismissedTutorialIds}
        onClose={() => harnessStore.closeHelpDialog()}
        onStartTutorial={(tutorialId) => harnessStore.startTutorial(tutorialId)}
      />
      <TutorialOverlay
        tutorialId={state.activeTutorialId}
        stepIndex={state.activeTutorialStepIndex}
        onBack={() => harnessStore.setActiveTutorialStepIndex(state.activeTutorialStepIndex - 1)}
        onNext={() => {
          const tutorial = getTutorialDefinition(state.activeTutorialId);
          if (!tutorial) {
            return;
          }

          if (state.activeTutorialStepIndex >= tutorial.steps.length - 1) {
            harnessStore.finishTutorial(tutorial.id);
            return;
          }

          harnessStore.setActiveTutorialStepIndex(state.activeTutorialStepIndex + 1);
        }}
        onClose={() => harnessStore.dismissTutorial()}
      />
      <AssistantEditorDialog />
      <BackgroundJobEditorDialog />
      <ProjectSwitcherDialog />
      <ExecutionPlanDialog executionPlan={state.selectedExecutionPlan} />
      <Show when={ideWindowOpen() || state.activeSurface === "ide"}>
        <IdeVirtualWindow
          bounds={ideWindowBounds()}
          maximized={ideWindowMaximized()}
          onBoundsChange={setIdeWindowBounds}
          onClose={closeIdeVirtualWindow}
          onPopOut={popOutIdeWindow}
          onToggleMaximized={() => setIdeWindowMaximized((value) => !value)}
        />
      </Show>
      <TerminalDrawer />
      <Toaster />
    </main>
  );
}

export function createDefaultIdeWindowBounds(): IdeWindowBounds {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.min(1120, Math.max(240, viewportWidth - (viewportWidth < 640 ? 16 : 160)));
  const height = Math.min(720, Math.max(320, viewportHeight - (viewportWidth < 640 ? 16 : 140)));
  return {
    x: viewportWidth < 640 ? 8 : 72,
    y: viewportWidth < 640 ? 8 : 64,
    width,
    height
  };
}

function readPersistedIdeWindowState() {
  const fallback = { open: false, maximized: false, bounds: createDefaultIdeWindowBounds() };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IDE_WINDOW_STORAGE_KEY) ?? "{}");
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : fallback.open,
      maximized: typeof parsed.maximized === "boolean" ? parsed.maximized : fallback.maximized,
      bounds: normalizeIdeWindowBounds(parsed.bounds, fallback.bounds)
    };
  } catch {
    return fallback;
  }
}

function persistIdeWindowState(state: { open: boolean; maximized: boolean; bounds: IdeWindowBounds }) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(IDE_WINDOW_STORAGE_KEY, JSON.stringify(state));
}

function normalizeIdeWindowBounds(value: unknown, fallback: IdeWindowBounds): IdeWindowBounds {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const bounds = value as Partial<IdeWindowBounds>;
  const maximumWidth = Math.max(240, window.innerWidth - 16);
  const maximumHeight = Math.max(320, window.innerHeight - 16);
  return {
    x: clampWindowNumber(bounds.x, 8, Math.max(8, window.innerWidth - 160), fallback.x),
    y: clampWindowNumber(bounds.y, 8, Math.max(8, window.innerHeight - 80), fallback.y),
    width: clampWindowNumber(bounds.width, Math.min(640, maximumWidth), maximumWidth, fallback.width),
    height: clampWindowNumber(bounds.height, Math.min(420, maximumHeight), maximumHeight, fallback.height)
  };
}

function clampWindowNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function IdeVirtualWindow(props: {
  bounds: IdeWindowBounds;
  maximized: boolean;
  onBoundsChange: (bounds: IdeWindowBounds) => void;
  onClose: () => void;
  onPopOut: () => void;
  onToggleMaximized: () => void;
}) {
  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || harnessStore.state.activeSurface !== "ide") {
        return;
      }
      if (harnessStore.state.projectSwitcherOpen) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (closeIdeOverlay()) {
        return;
      }
      props.onClose();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    });
  });

  const windowStyle = () =>
    props.maximized
      ? { top: "0.75rem", left: "0.75rem", right: "0.75rem", bottom: "0.75rem" }
      : {
          left: `${props.bounds.x}px`,
          top: `${props.bounds.y}px`,
          width: `${props.bounds.width}px`,
          height: `${props.bounds.height}px`
        };

  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0 || props.maximized) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = props.bounds;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      props.onBoundsChange({
        ...startBounds,
        x: Math.max(8, Math.min(window.innerWidth - 160, startBounds.x + deltaX)),
        y: Math.max(8, Math.min(window.innerHeight - 80, startBounds.y + deltaY))
      });
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const startResize = (event: PointerEvent) => {
    if (event.button !== 0 || props.maximized) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = props.bounds;
    const onPointerMove = (moveEvent: PointerEvent) => {
      props.onBoundsChange({
        ...startBounds,
        width: Math.max(640, Math.min(window.innerWidth - startBounds.x - 8, startBounds.width + moveEvent.clientX - startX)),
        height: Math.max(420, Math.min(window.innerHeight - startBounds.y - 8, startBounds.height + moveEvent.clientY - startY))
      });
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  return (
    <section
      data-test-ide-virtual-window=""
      data-maximized={props.maximized ? "true" : "false"}
      {...stylex.attrs(styles.ideWindow, !props.maximized && styles.ideWindowRestored)}
      style={windowStyle()}
    >
      <div
        data-test-ide-titlebar=""
        {...stylex.attrs(styles.ideTitlebar)}
        role="button"
        tabIndex={0}
        aria-label={props.maximized ? "Restore IDE window" : "Maximize IDE window"}
        onPointerDown={startDrag}
        onDblClick={props.onToggleMaximized}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onToggleMaximized();
          }
        }}
      >
        <span {...stylex.attrs(styles.ideTitle)}>Pi Harness IDE</span>
        <div {...stylex.attrs(styles.ideWindowControls)}>
          <Button
            tooltip="Pop out IDE to a new window"
            variant="ghost"
            size="icon"
            class={stylex.attrs(styles.ideWindowControl).class}
            aria-label="Pop out IDE to new window"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.onPopOut}
          >
            <ExternalLink {...stylex.attrs(styles.icon14)} />
          </Button>
          <Button
            tooltip={props.maximized ? "Restore IDE window" : "Maximize IDE window"}
            variant="ghost"
            size="icon"
            class={stylex.attrs(styles.ideWindowControl).class}
            aria-label={props.maximized ? "Restore IDE window" : "Maximize IDE window"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.onToggleMaximized}
          >
            {props.maximized ? <Minimize2 {...stylex.attrs(styles.icon14)} /> : <Maximize2 {...stylex.attrs(styles.icon14)} />}
          </Button>
          <Button
            tooltip="Close IDE window"
            variant="ghost"
            size="icon"
            class={stylex.attrs(styles.ideWindowControl).class}
            aria-label="Close IDE window"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.onClose}
          >
            <X {...stylex.attrs(styles.icon14)} />
          </Button>
        </div>
      </div>
      <div {...stylex.attrs(styles.ideWindowBody)}>
        <IdeWorkbench windowMode="docked" onToggleWindowMode={props.onPopOut} onRequestClose={props.onClose} />
      </div>
      <Button
        tooltip="Resize IDE window"
        variant="ghost"
        size="icon"
        class={stylex.attrs(styles.ideResizeHandle).class}
        tooltipTriggerClass={stylex.attrs(styles.ideResizeTrigger).class}
        data-test-ide-window-resize=""
        aria-label="Resize IDE window"
        onPointerDown={startResize}
      />
    </section>
  );
}

function closeIdeOverlay() {
  if (ideStore.state.commandPaletteOpen) {
    ideStore.setCommandPalette(false, "");
    return true;
  }
  if (ideStore.state.documentFindOpen) {
    ideStore.setDocumentFindOpen(false);
    return true;
  }
  return false;
}

function applyIdeRouteSelection() {
  const params = new URLSearchParams(window.location.search);
  applyIdeSelection({
    projectId: params.get("projectId") ?? undefined,
    threadId: params.get("threadId") ?? undefined
  });
}

function applyIdeSelection(input: OpenIdeWindowInput = {}) {
  const projectId = input.projectId;
  const threadId = input.threadId;
  if (!projectId) {
    return;
  }
  harnessStore.actions.sendCommand({
    type: "project.activate",
    requestId: createRequestId(),
    payload: { projectId }
  });
  if (threadId) {
    harnessStore.actions.sendCommand({
      type: "thread.activate",
      requestId: createRequestId(),
      payload: { projectId, threadId }
    });
  }
}

function handleAppHotkey(id: AppHotkeyId, actions: { openIde?: () => void } = {}) {
  const currentItemIndex = currentTabItemHotkeyIds.findIndex((hotkeyId) => hotkeyId === id);
  if (currentItemIndex >= 0) {
    selectCurrentTabItem(harnessStore.state.activeLeftTab, currentItemIndex);
    return;
  }

  const tab = appHotkeySettings.find((setting) => setting.id === id)?.tab;
  if (tab) {
    harnessStore.setActiveLeftTab(tab);
    return;
  }

  switch (id) {
    case "openProjectSwitcher":
      harnessStore.openProjectSwitcher();
      return;
    case "toggleTracePanel":
      harnessStore.toggleTracePanel();
      return;
    case "toggleTerminalDrawer":
      terminalStore.toggleOpen();
      return;
    case "createProjectChat":
      createProjectChatFromHotkey();
      return;
    case "openIde":
      actions.openIde?.();
      return;
    case "createAssistant":
      createAssistantFromHotkey();
      return;
    case "createBackgroundJob":
      createBackgroundJobFromHotkey();
      return;
    case "focusCurrentSearch":
      focusCurrentTabSearch();
      return;
  }
}

function createProjectChatFromHotkey() {
  harnessStore.setActiveLeftTab("projects");
  const projectId = harnessStore.state.workspace.activeProjectId;
  if (!projectId) {
    harnessStore.openProjectSwitcher();
    return;
  }

  harnessStore.actions.sendCommand({
    type: "thread.create",
    requestId: createRequestId(),
    payload: { projectId }
  });
}

function createAssistantFromHotkey() {
  const state = harnessStore.state;
  const scope = state.assistants.scopeFilter === "global" ? "global" : "project";
  const draft: AssistantEditorDraft = {
    source: "create",
    name: "",
    scope,
    projectId: scope === "project" ? state.workspace.activeProjectId ?? state.workspace.projects[0]?.id : undefined,
    description: "",
    personalityPrompt: "",
    jobPrompt: "",
    agentId: state.selectedAgentId,
    providerBrand: state.providerBrand,
    modeId: "",
    executionModelId: state.selectedExecutionModelId,
    reasoningStrength: state.selectedReasoningStrength,
    fastMode: state.selectedFastMode,
    runState: "active",
    bootstrapState: "pending",
    assetRefsText: ""
  };
  harnessStore.openAssistantEditor(draft);
}

function createBackgroundJobFromHotkey() {
  const state = harnessStore.state;
  const template = state.backgroundJobs.templates.find((entry) => entry.id === "scheduled-task");
  const draft: BackgroundJobEditorDraft = {
    source: "create",
    projectId: state.workspace.activeProjectId ?? state.workspace.projects[0]?.id,
    templateId: template?.id,
    kind: "ai-routine",
    name: "",
    description: "",
    scheduleInput: "",
    timezone: resolveBrowserTimezone(),
    aiPrompt: template?.definition.kind === "ai-routine" ? template.definition.prompt : "",
    aiModeId: template?.definition.kind === "ai-routine" ? template.definition.modeId : undefined,
    aiExecutionModelId: template?.definition.kind === "ai-routine" ? template.definition.executionModelId : undefined,
    aiReasoningStrength: template?.definition.kind === "ai-routine" ? template.definition.reasoningStrength : undefined,
    aiFastMode: template?.definition.kind === "ai-routine" ? template.definition.fastMode : undefined,
    aiPlanExecutionMode:
      template?.definition.kind === "ai-routine"
        ? template.definition.planExecutionMode ?? state.planExecutionModeDefault
        : state.planExecutionModeDefault,
    aiSubagentWorktreeStrategy:
      template?.definition.kind === "ai-routine"
        ? template.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault
        : state.subagentWorktreeStrategyDefault,
    shellExecutable: "",
    shellArgsText: "",
    shellCwd: "",
    shellEnvRefsText: "",
    shellTimeoutSeconds: 600,
    shellNetworkAccess: false
  };
  harnessStore.openBackgroundJobEditor(draft);
}

function focusCurrentTabSearch() {
  if (terminalStore.state.open) {
    toggleTerminalSearch();
    return;
  }
  const labels: Record<HarnessLeftTab, string> = {
    projects: "Search projects",
    assistants: "Search assistants",
    jobs: "Search jobs",
    runs: "Search runs",
    preferences: "Search settings",
  };
  const label = labels[harnessStore.state.activeLeftTab];
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  input?.focus();
  input?.select();
}

function PanelResizeHandle(props: { label: string; onPointerDown: (event: PointerEvent) => void }) {
  return (
    <Button
      tooltip={props.label}
      tooltipTriggerClass={stylex.attrs(styles.panelResizeTrigger).class}
      variant="ghost"
      size="icon"
      class={stylex.attrs(styles.panelResizeHandle).class}
      data-test-panel-resize-handle=""
      aria-label={props.label}
      onPointerDown={props.onPointerDown}
    />
  );
}

type LeftPaneTabDefinition = {
  id: HarnessLeftTab;
  label: string;
  tooltip: string;
  icon: Component<{ class?: string }>;
  hotkeyId?: AppHotkeyId;
};

const leftPaneTabs: LeftPaneTabDefinition[] = [
  {
    id: "projects",
    label: "Projects",
    tooltip: "Show project roots and threads",
    icon: FolderKanban,
    hotkeyId: "openProjects"
  },
  {
    id: "assistants",
    label: "Assistants",
    tooltip: "Show assistant roster",
    icon: Bot,
    hotkeyId: "openAssistants"
  },
  {
    id: "jobs",
    label: "Jobs",
    tooltip: "Show scheduled background jobs",
    icon: BriefcaseBusiness,
    hotkeyId: "openJobs"
  },
  {
    id: "runs",
    label: "Runs",
    tooltip: "Show active run info",
    icon: Clock3,
    hotkeyId: "openRuns"
  },
  {
    id: "preferences",
    label: "Settings",
    tooltip: "Show workspace settings",
    icon: Cog,
    hotkeyId: "openPreferences"
  },
];

function formatHotkeyHint(hotkey: string) {
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

function withPrimaryHotkey(tooltip: string, hotkeyId?: AppHotkeyId) {
  if (!hotkeyId) {
    return tooltip;
  }
  const primaryHotkey = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences)[hotkeyId][0];
  return primaryHotkey ? `${tooltip} (${formatHotkeyHint(primaryHotkey)})` : tooltip;
}

function TabbedLeftPane(props: { compact?: boolean; onNavigate?: () => void } = {}) {
  const state = harnessStore.state;
  const [iconsOnly, setIconsOnly] = createSignal(false);
  let navRef: HTMLElement | undefined;
  let expandedTabStripWidth = 0;

  onMount(() => {
    const measure = () => {
      if (!navRef) {
        return;
      }
      if (!iconsOnly()) {
        expandedTabStripWidth = Math.max(expandedTabStripWidth, measureTabStripMinimumWidth(navRef));
      }
      setIconsOnly(shouldCollapseTabStrip(navRef) || expandedTabStripWidth > navRef.clientWidth + 1);
    };
    const resizeObserver = new ResizeObserver(measure);
    if (navRef) {
      resizeObserver.observe(navRef);
    }
    queueMicrotask(measure);
    window.addEventListener("resize", measure);
    onCleanup(() => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    });
  });

  return (
    <div data-test-left-tabbed-pane="" {...stylex.attrs(styles.leftTabbedPane)}>
      <nav
          ref={navRef}
          data-test-left-tab-nav=""
          data-icons-only={iconsOnly() ? "true" : "false"}
          role="tablist"
          aria-label="Workspace panels"
          {...stylex.attrs(styles.surfaceTabStrip, iconsOnly() && styles.surfaceTabStripCollapsed)}
      >
        <For each={leftPaneTabs}>
          {(tab) => {
            const Icon = tab.icon;
            const tooltip = () => withPrimaryHotkey(tab.tooltip, tab.hotkeyId);
            return (
              <Button
                tooltip={tooltip()}
                type="button"
                role="tab"
                variant="ghost"
                size="sm"
                class={stylex.attrs(styles.surfaceTab, iconsOnly() && styles.surfaceTabCollapsed).class}
                aria-label={tab.label}
                attr:aria-selected={state.activeLeftTab === tab.id ? "true" : "false"}
                tabIndex={state.activeLeftTab === tab.id ? 0 : -1}
                onClick={() => {
                  harnessStore.setActiveLeftTab(tab.id);
                  props.onNavigate?.();
                }}
              >
                <Icon class={stylex.attrs(styles.icon16).class} />
                <span {...stylex.attrs(styles.surfaceTabLabel, iconsOnly() && styles.hidden)}>{tab.label}</span>
              </Button>
            );
          }}
        </For>
      </nav>
      <div {...stylex.attrs(styles.leftPaneBody)}>
        <Show
          when={state.activeLeftTab === "jobs" || state.activeLeftTab === "runs"}
          fallback={
            <Show
              when={state.activeLeftTab === "assistants"}
              fallback={
                <Show when={state.activeLeftTab === "preferences"} fallback={<ProjectSidebar compact={props.compact} onNavigate={props.onNavigate} />}>
                  <LeftPaneShell kind="preferences">
                    <PreferenceSectionNav onNavigate={props.onNavigate} />
                  </LeftPaneShell>
                </Show>
              }
            >
              <AssistantsPanel variant="roster" />
            </Show>
          }
        >
          <BackgroundJobsPanel variant="left" segment={state.activeLeftTab === "jobs" ? "jobs" : "runs"} />
        </Show>
      </div>
    </div>
  );
}

export function shouldCollapseTabStrip(navElement: HTMLElement) {
  const tabItems = Array.from(navElement.children);
  const firstTabTop = tabItems[0]?.getBoundingClientRect().top ?? 0;
  const hasWrappedTabs = tabItems.some((tabItem) => tabItem.getBoundingClientRect().top > firstTabTop + 1);

  return hasWrappedTabs || navElement.scrollWidth > navElement.clientWidth + 1;
}

/** Measures the expanded tab strip without depending on legacy descendant classes. */
function measureTabStripMinimumWidth(navElement: HTMLElement) {
  const tabWidths = Array.from(navElement.children).reduce((total, tabItem) => total + tabItem.getBoundingClientRect().width, 0);
  const computedStyle = window.getComputedStyle(navElement);
  const gap = Number.parseFloat(computedStyle.columnGap || computedStyle.gap) || 0;
  const padding = (Number.parseFloat(computedStyle.paddingLeft) || 0) + (Number.parseFloat(computedStyle.paddingRight) || 0);
  return tabWidths + Math.max(0, navElement.children.length - 1) * gap + padding;
}

function isProjectSwitcherInputFocused() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && activeElement.dataset.projectSwitcherInput === "true";
}

function isResizeObserverLoopError(message: string) {
  return message === "ResizeObserver loop completed with undelivered notifications." || message === "ResizeObserver loop limit exceeded";
}

const styles = stylex.create({
  idePage: {
    backgroundColor: "var(--background)",
    height: "100vh",
    minHeight: 0,
    overflow: "hidden"
  },
  appShell: {
    height: "100vh",
    overflow: { default: "auto", "@media (min-width: 1024px)": "hidden" },
    padding: { default: "0.5rem", "@media (min-width: 768px)": "0.75rem" },
    position: "relative",
    width: "100vw"
  },
  appBackground: {
    backgroundImage: "var(--app-background-grid)",
    backgroundSize: "56px 56px",
    inset: 0,
    maskImage: "linear-gradient(#0000008c, #0000 70%)",
    pointerEvents: "none",
    position: "absolute"
  },
  appContent: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    height: "100%",
    marginInline: "auto",
    minHeight: 0
  },
  commandBar: {
    alignItems: { default: null, "@media (min-width: 768px)": "center" },
    backdropFilter: "blur(12px)",
    backgroundColor: "var(--panel)",
    borderColor: "#0f766e85 var(--border) var(--border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: "3px 1px 1px",
    boxShadow: "0 8px 24px #0f172a0f",
    display: "flex",
    flexDirection: { default: "column", "@media (min-width: 768px)": "row" },
    gap: "0.5rem",
    justifyContent: { default: null, "@media (min-width: 768px)": "space-between" },
    overflow: "visible",
    padding: "0.5rem 0.75rem",
    position: "relative"
  },
  headerIdentity: { alignItems: "center", display: "flex", gap: "0.75rem", minWidth: 0 },
  mobileOnly: { display: { default: "block", "@media (min-width: 1024px)": "none" } },
  mobileMenuButton: {
    alignItems: "center",
    backgroundColor: "var(--row)",
    borderColor: "var(--border)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: "1px",
    color: "var(--foreground)",
    display: "inline-flex",
    height: "2.25rem",
    justifyContent: "center",
    width: "2.25rem"
  },
  fullViewportHeight: { height: "100dvh" },
  minWidthZero: { minWidth: 0 },
  workspaceLabel: {
    alignItems: "center",
    color: "var(--muted)",
    display: "flex",
    fontSize: "0.585rem",
    fontWeight: 600,
    gap: "0.5rem",
    letterSpacing: "0.16em",
    minWidth: 0,
    textTransform: "uppercase"
  },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  mobileSurfaceLabel: {
    alignItems: "center",
    backgroundColor: "var(--row)",
    borderColor: "var(--border)",
    borderRadius: "0.375rem",
    borderStyle: "solid",
    borderWidth: "1px",
    color: "var(--foreground)",
    display: { default: "inline-flex", "@media (min-width: 1024px)": "none" },
    fontSize: "0.625rem",
    fontWeight: 600,
    gap: "0.375rem",
    marginTop: "0.25rem",
    maxWidth: "100%",
    padding: "0.25rem 0.5rem"
  },
  headerActions: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem" },
  icon14: { height: "0.875rem", width: "0.875rem" },
  icon16: { height: "1rem", width: "1rem" },
  executionControl: {
    borderColor: "var(--border)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "none"
  },
  executionRunning: {
    backgroundImage: {
      default: "linear-gradient(180deg, color-mix(in srgb, var(--warning) 13%, var(--panel) 87%), color-mix(in srgb, var(--warning) 20%, var(--panel) 80%))",
      ":hover": "linear-gradient(180deg, color-mix(in srgb, var(--warning) 24%, var(--panel) 76%), color-mix(in srgb, var(--warning) 30%, var(--panel) 70%))"
    },
    borderColor: "var(--warning)",
    color: "var(--warning-strong)"
  },
  executionPaused: {
    backgroundImage: {
      default: "linear-gradient(180deg, color-mix(in srgb, var(--success) 13%, var(--panel) 87%), color-mix(in srgb, var(--success) 20%, var(--panel) 80%))",
      ":hover": "linear-gradient(180deg, color-mix(in srgb, var(--success) 20%, var(--panel) 80%), color-mix(in srgb, var(--success) 28%, var(--panel) 72%))"
    },
    borderColor: "var(--success)",
    color: "var(--success-strong)"
  },
  traceButtonLabel: { display: { default: "none", "@media (min-width: 640px)": "inline" } },
  mainPanelGrid: {
    display: "grid",
    flex: "1",
    gap: { default: "1rem", "@media (min-width: 1024px)": "0.5rem" },
    gridAutoRows: { default: "min-content", "@media (min-width: 1024px)": "minmax(0, 1fr)" },
    minHeight: 0
  },
  mainPanelOpen: {
    gridTemplateColumns: { default: null, "@media (min-width: 1024px)": "minmax(0,var(--left-panel-size)) 0.35rem minmax(0,var(--center-panel-size)) 0.35rem minmax(0,var(--right-panel-size))" }
  },
  mainPanelPeek: {
    gridTemplateColumns: { default: null, "@media (min-width: 1024px)": "minmax(0,var(--left-panel-size)) 0.35rem minmax(0,var(--center-panel-size)) 0.35rem 12rem" }
  },
  mainPanelClosed: {
    gridTemplateColumns: { default: null, "@media (min-width: 1024px)": "minmax(0,var(--left-panel-size)) 0.35rem minmax(0,var(--center-panel-size))" }
  },
  desktopSidebar: {
    display: { default: "none", "@media (min-width: 1024px)": "block" },
    minHeight: 0,
    minWidth: 0
  },
  desktopOnly: { display: { default: "none", "@media (min-width: 1024px)": "block" } },
  fullHeight: { height: "100%" },
  mainPanelSurface: {
    minHeight: 0,
    minWidth: 0,
    overflow: { default: "visible", "@media (min-width: 1024px)": "hidden" }
  },
  shrinkablePanel: { minHeight: 0, minWidth: 0 },
  ideWindow: {
    backgroundColor: "var(--panel-strong)",
    borderColor: "var(--border)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    position: "fixed",
    zIndex: 80
  },
  ideWindowRestored: {
    bottom: { default: null, "@media (max-width: 639px)": "0.5rem !important" },
    height: { default: null, "@media (max-width: 639px)": "auto !important" },
    left: { default: null, "@media (max-width: 639px)": "0.5rem !important" },
    right: { default: null, "@media (max-width: 639px)": "0.5rem !important" },
    top: { default: null, "@media (max-width: 639px)": "0.5rem !important" },
    width: { default: null, "@media (max-width: 639px)": "auto !important" }
  },
  ideTitlebar: {
    alignItems: "center",
    backgroundColor: { default: "var(--ide-surface)", ":hover": "var(--ide-row)" },
    borderBottomColor: "var(--ide-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    cursor: "default",
    display: "flex",
    flexShrink: 0,
    gap: "0.75rem",
    height: "2rem",
    justifyContent: "space-between",
    paddingInline: "0.75rem",
    textAlign: "left",
    userSelect: "none"
  },
  ideTitle: {
    color: "var(--ide-text)",
    fontSize: "0.68rem",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  ideWindowControls: { alignItems: "center", display: "flex", gap: "0.25rem" },
  ideWindowControl: {
    borderRadius: "0.35rem",
    color: { default: "var(--ide-muted)", ":hover": "var(--ide-text)" },
    height: "1.35rem !important",
    width: "1.35rem !important"
  },
  ideWindowBody: { flex: "1", minHeight: 0 },
  ideResizeTrigger: {
    bottom: 0,
    display: { default: "inline-flex", "@media (max-width: 639px)": "none" },
    height: "1rem",
    position: "absolute",
    right: 0,
    width: "1rem"
  },
  ideResizeHandle: {
    cursor: "nwse-resize",
    height: "1rem !important",
    minHeight: 0,
    padding: 0,
    width: "1rem !important"
  },
  panelResizeTrigger: {
    display: { default: "none", "@media (min-width: 1024px)": "block" },
    height: "100%",
    minHeight: 0
  },
  panelResizeHandle: {
    backgroundColor: { default: "transparent", ":hover": "var(--border)" },
    borderRadius: "9999px",
    boxShadow: { default: "none", ":focus-visible": "0 0 0 2px var(--ring)" },
    cursor: "col-resize",
    height: "100% !important",
    outline: { default: null, ":focus-visible": "none" },
    padding: 0,
    transitionDuration: "150ms",
    transitionProperty: "background-color, box-shadow",
    width: "100% !important"
  },
  leftTabbedPane: {
    containerType: "inline-size",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    height: "100%",
    minHeight: 0
  },
  surfaceTabStrip: {
    alignItems: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.25rem",
    marginBottom: 0,
    paddingInline: { default: "1rem", "@media (min-width: 1024px)": "1.25rem" },
    position: "relative",
    zIndex: 2
  },
  surfaceTabStripCollapsed: { paddingInline: "0.75rem" },
  surfaceTab: {
    backgroundColor: {
      default: "transparent",
      ':is([aria-selected="true"]):hover': "transparent",
      ':is([aria-selected="false"]):hover': "var(--panel-strong)"
    },
    borderBottomColor: {
      default: "transparent",
      ':is([aria-selected="true"])': "var(--accent)"
    },
    borderBottomStyle: "solid",
    borderBottomWidth: "2px",
    borderRadius: "0 !important",
    boxShadow: "none !important",
    color: {
      default: "var(--muted)",
      ':is([aria-selected="true"])': "var(--accent-strong)",
      ':is([aria-selected="false"]):hover': "var(--foreground)"
    },
    fontSize: "0.66rem",
    gap: "0.35rem",
    height: "2.25rem !important",
    minHeight: "2.25rem !important",
    paddingInline: "0.625rem !important",
    position: "relative"
  },
  surfaceTabCollapsed: {
    justifyContent: "center",
    paddingInline: "0 !important",
    width: "2.25rem !important"
  },
  surfaceTabLabel: { minWidth: 0 },
  hidden: { display: "none" },
  leftPaneBody: {
    borderBottomLeftRadius: "0.75rem",
    borderBottomRightRadius: "0.75rem",
    flex: "1",
    minHeight: 0,
    overflow: "hidden"
  }
});
