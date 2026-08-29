import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import { createHotkeys, formatForDisplay } from "@tanstack/solid-hotkeys";
import type { CreateHotkeyDefinition } from "@tanstack/solid-hotkeys";
import * as stylex from "@stylexjs/stylex";
import { Bot, BriefcaseBusiness, Clock3, Cog, ExternalLink, FolderKanban, Maximize2, Menu, Minimize2, Pause, Play, PanelsTopLeft, Workflow, CircleQuestionMark, X } from "lucide-solid";
import { createRequestId } from "@hyperfocus/ai-core/protocol";
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
import { ProjectSidebar } from "./components/project-sidebar/project-sidebar";
import { ProjectSwitcherDialog } from "./components/project-switcher-dialog";
import { Toaster } from "./components/toaster";
import { TracePanel, TracePeekRail } from "./components/trace-panel";
import { getTutorialDefinition, tutorialDefinitions } from "./components/tutorial-definitions";
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
import { createIdeWindowUrl, IDE_POP_IN_EVENT, OPEN_IDE_WINDOW_EVENT, readOpenIdeWindowInput, type OpenIdeWindowInput } from "./lib/ide-window";
import { createCurrentToastSourceNavigation } from "./source-navigation";
import { TerminalDrawer } from "./terminal/terminal-drawer";
import { toggleTerminalSearch } from "./terminal/terminal-search-actions";
import { terminalStore } from "./terminal/terminal-store";
import { reportUiError, setDefaultToastSourceResolver } from "./toast-store";
import { isTutorialGoalSatisfied } from "./lib/tutorial-progress";
import { styles } from "./app/app.styles";
import {
  createDefaultIdeWindowBounds,
  persistIdeWindowState,
  readPersistedIdeWindowState,
  type IdeWindowBounds,
} from "./app/ide-window-state";
import { leftPaneTabs } from "./app/left-pane-tabs";
import {
  isProjectSwitcherInputFocused,
  isResizeObserverLoopError,
  measureTabStripMinimumWidth,
  shouldCollapseTabStrip,
} from "./app/layout-measurement";

export { createDefaultIdeWindowBounds } from "./app/ide-window-state";
export { shouldCollapseTabStrip } from "./app/layout-measurement";

function createIdeWindowController() {
  const persisted = readPersistedIdeWindowState();
  const [open, setOpen] = createSignal(persisted.open);
  const [maximized, setMaximized] = createSignal(persisted.maximized);
  const [bounds, setBounds] = createSignal<IdeWindowBounds>(persisted.bounds);
  const openVirtualWindow = () => {
    setOpen(true);
    harnessStore.setActiveSurface("ide");
  };
  const closeVirtualWindow = () => {
    setOpen(false);
    setMaximized(false);
    if (harnessStore.state.activeSurface === "ide") harnessStore.setActiveSurface("chat");
  };
  const popOutWindow = () => {
    const projectId = harnessStore.state.workspace.activeProjectId ?? undefined;
    const child = window.open(createIdeWindowUrl({ projectId }), "pi-harness-ide", "popup=yes,width=1280,height=860");
    child?.focus();
    closeVirtualWindow();
  };
  createEffect(() => {
    persistIdeWindowState({ open: open(), maximized: maximized(), bounds: bounds() });
  });
  return { open, setOpen, maximized, setMaximized, bounds, setBounds, openVirtualWindow, closeVirtualWindow, popOutWindow };
}

function registerAppHotkeys(options: { openIde: () => void; closeIde: () => void }) {
  const appHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return appHotkeySettings.filter((setting) => setting.id !== "focusCurrentSearch" && setting.scope !== "ide").flatMap((setting) =>
      hotkeys[setting.id].map((hotkey) => ({
        hotkey,
        callback: () => handleAppHotkey(setting.id, { openIde: options.openIde }),
        options: { meta: { name: setting.label, description: setting.description } }
      }))
    );
  };
  const projectSwitcherHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return hotkeys.openProjectSwitcher.map((hotkey) => ({
      hotkey,
      callback: () => handleAppHotkey("openProjectSwitcher"),
      options: {
        conflictBehavior: "allow" as const,
        meta: { name: "Project switcher", description: "Open projects and active threads." }
      }
    }));
  };
  const searchHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return hotkeys.focusCurrentSearch.map((hotkey) => ({
      hotkey,
      callback: () => focusCurrentTabSearch(),
      options: {
        conflictBehavior: "allow" as const,
        meta: { name: "Focus search", description: "Focus search for the current sidepanel" }
      }
    }));
  };
  const standardOptions = () => ({
    enabled: harnessStore.state.activeSurface !== "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true
  });
  createHotkeys(appHotkeys, standardOptions);
  createHotkeys(projectSwitcherHotkeys, () => ({
    enabled: harnessStore.state.activeSurface === "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true
  }));
  createHotkeys(searchHotkeys, standardOptions);
  createHotkeys(
    () => [{
      hotkey: "Escape",
      callback: () => {
        if (harnessStore.state.projectSwitcherOpen) {
          harnessStore.closeProjectSwitcher();
          return;
        }
        if (!closeIdeOverlay()) options.closeIde();
      },
      options: { meta: { name: "Close IDE", description: "Close the IDE window" } }
    }],
    () => ({
      enabled: harnessStore.state.activeSurface === "ide",
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );
}

function registerAppLifecycle(options: { openIde: () => void; ideWindowOpen: () => boolean }) {
  let connection: ReturnType<typeof connectHarnessWebSocket> | undefined;
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
    } else if (options.ideWindowOpen()) {
      harnessStore.setActiveSurface("ide");
    }
    const onOpenIdeWindow = (event: Event) => {
      const detail = readOpenIdeWindowInput(event);
      options.openIde();
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
}

function createAppViewModel() {
  const state = harnessStore.state;
  const activeLeftTab = createMemo(() => state.activeLeftTab);
  const activeLeftTabDefinition = createMemo(() => leftPaneTabs.find((tab) => tab.id === activeLeftTab()) ?? leftPaneTabs[0]);
  const tracePanelMode = createMemo(() => state.experienceMode === "simple" ? "closed" : state.tracePanelMode);
  const mainPanelGridStyle = () => ({
    "--left-panel-size": `${state.mainPanelSizes.left}fr`,
    "--center-panel-size": `${state.mainPanelSizes.center}fr`,
    "--right-panel-size": `${state.mainPanelSizes.right}fr`
  });
  const startPanelResize = (divider: "left" | "right", event: PointerEvent) => {
    if (window.innerWidth < 1180) return;
    event.preventDefault();
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    target.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startSizes = { ...state.mainPanelSizes };
    const total = tracePanelMode() === "open"
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
    const onPointerUp = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
  };
  const resizePanelFromKeyboard = (divider: "left" | "right", direction: -1 | 1, largeStep: boolean) => {
    const step = largeStep ? 0.5 : 0.1;
    const nextSizes: MainPanelSizes = { ...state.mainPanelSizes };
    if (divider === "left") {
      nextSizes.left += direction * step;
      nextSizes.center -= direction * step;
    } else {
      nextSizes.center += direction * step;
      nextSizes.right -= direction * step;
    }
    harnessStore.setMainPanelSizes(nextSizes);
  };
  const executionControlTooltip = () => !state.executionControl.isPaused
    ? "Pause new executions"
    : `Resume new executions | queued ${state.executionControl.deferredPlanningQuestionCount} planner, ${state.executionControl.deferredAssistantQuestionCount} assistant, ${state.executionControl.deferredBrowserApprovalCount} browser`;
  return { state, activeLeftTab, activeLeftTabDefinition, tracePanelMode, mainPanelGridStyle, startPanelResize, resizePanelFromKeyboard, executionControlTooltip };
}

function IdeFullPage() {
  const popInIdeWindow = () => {
    const opener = window.opener;
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

function advanceActiveTutorial(state: typeof harnessStore.state) {
  const tutorial = getTutorialDefinition(state.activeTutorialId);
  if (!tutorial) return;
  if (state.activeTutorialStepIndex >= tutorial.steps.length - 1) {
    harnessStore.finishTutorial(tutorial.id);
    return;
  }
  harnessStore.setActiveTutorialStepIndex(state.activeTutorialStepIndex + 1);
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const ideWindow = createIdeWindowController();
  const {
    open: ideWindowOpen,
    maximized: ideWindowMaximized,
    setMaximized: setIdeWindowMaximized,
    bounds: ideWindowBounds,
    setBounds: setIdeWindowBounds,
    openVirtualWindow: openIdeVirtualWindow,
    closeVirtualWindow: closeIdeVirtualWindow,
    popOutWindow: popOutIdeWindow
  } = ideWindow;

  registerAppHotkeys({ openIde: openIdeVirtualWindow, closeIde: closeIdeVirtualWindow });

  registerAppLifecycle({ openIde: openIdeVirtualWindow, ideWindowOpen });

  const {
    state,
    activeLeftTab,
    activeLeftTabDefinition,
    tracePanelMode,
    mainPanelGridStyle,
    startPanelResize,
    resizePanelFromKeyboard,
    executionControlTooltip
  } = createAppViewModel();
  if (window.location.pathname === "/ide") return <IdeFullPage />;

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
            <Show when={state.experienceMode === "advanced"}>
              <ActionButton
                tooltip={withPrimaryHotkey(`Trace panel: ${state.tracePanelMode}. Click to cycle closed, peek, open.`, "toggleTracePanel")}
                icon={<PanelsTopLeft {...stylex.attrs(styles.icon16)} />}
                variant="secondary"
                dataTourId="trace-panel-toggle"
                onClick={() => harnessStore.toggleTracePanel()}
              >
                <span {...stylex.attrs(styles.traceButtonLabel)}>{state.tracePanelMode === "closed" ? "Trace" : state.tracePanelMode}</span>
              </ActionButton>
            </Show>
          </div>
        </header>

        <div
          data-test-main-panel-grid=""
          data-main-panel-mode={tracePanelMode()}
          {...stylex.attrs(
            styles.mainPanelGrid,
            tracePanelMode() === "open" && styles.mainPanelOpen,
            tracePanelMode() === "peek" && styles.mainPanelPeek,
            tracePanelMode() === "closed" && styles.mainPanelClosed
          )}
          style={mainPanelGridStyle()}
        >
          <div {...stylex.attrs(styles.desktopSidebar)}>
            <div data-tour-id="project-sidebar" {...stylex.attrs(styles.fullHeight)}>
              <TabbedLeftPane />
            </div>
          </div>
          <PanelResizeHandle label="Resize left and center panels" value={state.mainPanelSizes.left} onPointerDown={(event) => startPanelResize("left", event)} onKeyboardResize={(direction, largeStep) => resizePanelFromKeyboard("left", direction, largeStep)} onReset={() => harnessStore.resetMainPanelSizes()} />
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
          <Show when={tracePanelMode() !== "closed"}>
            <>
              <Show when={tracePanelMode() === "open"} fallback={<div {...stylex.attrs(styles.desktopOnly)} />}>
                <PanelResizeHandle label="Resize center and trace panels" value={state.mainPanelSizes.right} onPointerDown={(event) => startPanelResize("right", event)} onKeyboardResize={(direction, largeStep) => resizePanelFromKeyboard("right", direction, largeStep)} onReset={() => harnessStore.resetMainPanelSizes()} />
              </Show>
              <div {...stylex.attrs(styles.shrinkablePanel)}>
                <Show when={tracePanelMode() === "open"} fallback={<TracePeekRail />}>
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
        satisfiedTutorialIds={tutorialDefinitions
          .filter((tutorial) => isTutorialGoalSatisfied(tutorial.id, state))
          .map((tutorial) => tutorial.id)}
        onClose={() => harnessStore.closeHelpDialog()}
        onStartTutorial={(tutorialId) => harnessStore.startTutorial(tutorialId)}
      />
      <TutorialOverlay
        tutorialId={state.activeTutorialId}
        stepIndex={state.activeTutorialStepIndex}
        completionSatisfied={Boolean(
          state.activeTutorialId && isTutorialGoalSatisfied(state.activeTutorialId, state)
        )}
        onBack={() => harnessStore.setActiveTutorialStepIndex(state.activeTutorialStepIndex - 1)}
        onNext={() => advanceActiveTutorial(state)}
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

function PanelResizeHandle(props: { label: string; value: number; onPointerDown: (event: PointerEvent) => void; onKeyboardResize: (direction: -1 | 1, largeStep: boolean) => void; onReset: () => void }) {
  return (
    <Button
      tooltip={props.label}
      tooltipTriggerClass={stylex.attrs(styles.panelResizeTrigger).class}
      variant="ghost"
      size="icon"
      class={stylex.attrs(styles.panelResizeHandle).class}
      data-test-panel-resize-handle=""
      role="separator"
      aria-label={props.label}
      aria-orientation="vertical"
      aria-valuemin={0.75}
      aria-valuemax={5}
      aria-valuenow={props.value}
      onPointerDown={props.onPointerDown}
      onDblClick={props.onReset}
      onKeyDown={(event) => {
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          props.onReset();
          return;
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        props.onKeyboardResize(event.key === "ArrowLeft" ? -1 : 1, event.shiftKey);
      }}
    />
  );
}

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
