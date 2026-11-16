import { createRequestId } from "@hyperfocus/ai-core/protocol";
import { PanelGroup,type PanelDescriptor,type PanelGroupLayout } from "@hyperfocus/ui";
import { HomeButton, registerOverlay } from "@hyperfocus/ui/primitives";
import * as stylex from "@stylexjs/stylex";
import type { CreateHotkeyDefinition } from "@tanstack/solid-hotkeys";
import { createHotkeys,formatForDisplay } from "@tanstack/solid-hotkeys";
import { ExternalLink,Maximize2,Menu,Minimize2,X } from "lucide-solid";
import { createEffect,createMemo,createSignal,For,onCleanup,onMount,Show } from "solid-js";
import { styles } from "./app/app.styles";
import { HeaderActions } from "./app/header-actions";
import {
persistIdeWindowState,
readPersistedIdeWindowState,
type IdeWindowBounds,
} from "./app/ide-window-state";
import {
isProjectSwitcherInputFocused,
isResizeObserverLoopError,
measureTabStripMinimumWidth,
shouldCollapseTabStrip,
} from "./app/layout-measurement";
import { lazySurface } from "./app/lazy-surface";
import { leftPaneTabs } from "./app/left-pane-tabs";
import { PaneNavigationProvider } from "./app/pane-navigation";
import { AssistantEditorDialog } from "./components/assistant-editor-dialog";
import { AssistantsPanel } from "./components/assistants-panel";
import { BackgroundJobEditorDialog } from "./components/background-job-editor-dialog";
import { BackgroundJobsPanel } from "./components/background-jobs-panel";
import { ChatPanel } from "./components/chat-panel";
import { ConnectionBanner } from "./components/connection-banner";
import { ExecutionPlanDialog } from "./components/execution-plan-dialog";
import { HelpTutorialDialog } from "./components/help-tutorial-dialog";
import { PreferencesPanel } from "./components/preferences-modal";
import { Button } from "./components/primitives/button";
import { SheetContent,SheetRoot,SheetTrigger } from "./components/primitives/sheet";
import { ProjectSidebar } from "./components/project-sidebar/project-sidebar";
import { ProjectSwitcherDialog } from "./components/project-switcher-dialog";
import { Toaster } from "./components/toaster";
import { TracePanel,TracePeekRail } from "./components/trace-panel";
import { getTutorialDefinition,tutorialDefinitions } from "./components/tutorial-definitions";
import { TutorialOverlay } from "./components/tutorial-overlay";
import { harnessStore,type AssistantEditorDraft,type BackgroundJobEditorDraft,type HarnessLeftTab } from "./harness-store";
import { connectHarnessWebSocket } from "./harness-websocket";
import { ideStore } from "./ide/ide-store";
import type { IdeWorkbenchProps } from "./ide/ide-workbench";
import { appHotkeySettings,currentTabItemHotkeyIds,normalizeAppHotkeyPreferences,type AppHotkeyId } from "./lib/app-hotkeys";
import { selectCurrentTabItem } from "./lib/current-tab-item-hotkeys";
import { createIdeWindowUrl,IDE_POP_IN_EVENT,OPEN_IDE_WINDOW_EVENT,readOpenIdeWindowInput,type OpenIdeWindowInput } from "./lib/ide-window";
import { resolveBrowserTimezone } from "./lib/time-format";
import { resolveTracePanelEntity } from "./lib/trace-panel-model";
import { isTutorialGoalSatisfied } from "./lib/tutorial-progress";
import { createCurrentToastSourceNavigation } from "./source-navigation";
import { toggleTerminalSearch } from "./terminal/terminal-search-actions";
import { terminalStore } from "./terminal/terminal-store";
import { reportUiError,setDefaultToastSourceResolver } from "./toast-store";

export { createDefaultIdeWindowBounds } from "./app/ide-window-state";
export { shouldCollapseTabStrip } from "./app/layout-measurement";

const IdeWorkbench = lazySurface<IdeWorkbenchProps>("IDE", async () => ({ default: (await import("./ide/ide-workbench")).IdeWorkbench }));
const TerminalDrawer = lazySurface("terminal", async () => ({ default: (await import("./terminal/terminal-drawer")).TerminalDrawer }));

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
      hotkeys[setting.id].flatMap(hotkey => setting.id === "openPreferences" && hotkey === "Mod+," ? ["Meta+," as const, "Control+," as const] : [hotkey]).map((hotkey) => ({
        hotkey,
        callback: () => handleAppHotkey(setting.id, { openIde: options.openIde }),
        options: { meta: { name: setting.label, description: setting.description } }
      }))
    );
  };
  const projectSwitcherHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return (['openProjectSwitcher', 'openPreferences'] as const).flatMap(id => hotkeys[id].flatMap(hotkey => id === 'openPreferences' && hotkey === 'Mod+,' ? ['Meta+,' as const, 'Control+,' as const] : [hotkey]).map((hotkey) => ({
      hotkey,
      callback: () => { if (id === 'openPreferences') options.closeIde(); handleAppHotkey(id); },
      options: {
        conflictBehavior: "allow" as const,
        meta: { name: id === 'openPreferences' ? 'Workspace preferences' : 'Project switcher', description: id === 'openPreferences' ? 'Open workspace preferences.' : 'Open projects and active threads.' }
      }
    })));
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
  const tracePanelMode = createMemo(() => state.experienceMode === "simple" || state.activeLeftTab === "preferences" || !resolveTracePanelEntity(state) ? "closed" : state.tracePanelMode);
  const executionControlTooltip = () => !state.executionControl.isPaused
    ? "Pause new executions"
    : `Resume new executions | queued ${state.executionControl.deferredPlanningQuestionCount} planner, ${state.executionControl.deferredAssistantQuestionCount} assistant, ${state.executionControl.deferredBrowserApprovalCount} browser`;
  return { state, activeLeftTab, activeLeftTabDefinition, tracePanelMode, executionControlTooltip };
}

function HarnessPanelGroup(props: {
  activeLeftTab: () => HarnessLeftTab;
  tracePanelMode: () => "closed" | "peek" | "open";
}) {
  const [narrowPanel, setNarrowPanel] = createSignal("work");
  const firstRun = () => props.activeLeftTab() === "projects" && harnessStore.state.workspace.projects.length === 0;
  const scale = 240;
  const mainContent = () => (
    <div {...stylex.attrs(styles.mainPanelSurface)}>
      <Show when={props.activeLeftTab() === "jobs" || props.activeLeftTab() === "runs"} fallback={
        <Show when={props.activeLeftTab() === "preferences"} fallback={
          <Show when={props.activeLeftTab() === "assistants"} fallback={<ChatPanel />}><AssistantsPanel variant="detail" /></Show>
        }><PreferencesPanel /></Show>
      }>
        <BackgroundJobsPanel variant="detail" segment={props.activeLeftTab() === "jobs" ? "jobs" : "runs"} />
      </Show>
    </div>
  );
  // Context availability changes the detail pane, not the navigation lifetime.
  const navigationContent = <div {...stylex.attrs(styles.desktopSidebar)}><div data-tour-id="project-sidebar" {...stylex.attrs(styles.fullHeight)}><TabbedLeftPane onNavigate={() => setNarrowPanel("work")} /></div></div>;
  const navigationPanel: PanelDescriptor = {
      id: "navigation", get label() { return leftPaneTabs.find((tab) => tab.id === props.activeLeftTab())?.label ?? "Projects"; },
      axis: "horizontal", minimumSize: 220, defaultSize: 276, maximumSize: 480,
      collapseMode: "hidden", persistenceScope: "app-user:harness.main-panels.v2", resizeHandle: "end", narrowMode: "mode",
      content: navigationContent,
    };
  const workPanel: PanelDescriptor = {
      id: "work", label: "Work", axis: "horizontal", minimumSize: 360, defaultSize: 720, maximumSize: 2400,
      collapseMode: "none", persistenceScope: "app-user:harness.main-panels.v2", resizeHandle: "none", narrowMode: "primary", grow: true,
      content: mainContent(),
    };
  const panels = createMemo<readonly PanelDescriptor[]>(() => [navigationPanel, workPanel,
    ...(props.tracePanelMode() === "closed" ? [] : [{
      id: "run-details", label: "Run details", axis: "horizontal" as const,
      minimumSize: props.tracePanelMode() === "peek" ? 240 : 260,
      defaultSize: props.tracePanelMode() === "peek" ? 240 : 300,
      maximumSize: props.tracePanelMode() === "peek" ? 240 : 560,
      collapseMode: props.tracePanelMode() === "peek" ? "none" as const : "hidden" as const, persistenceScope: "app-user:harness.main-panels.v2",
      resizeHandle: props.tracePanelMode() === "peek" ? "none" as const : "start" as const,
      narrowMode: "mode" as const,
      content: props.tracePanelMode() === "peek" ? <TracePeekRail /> : <TracePanel />,
    }]),
  ]);
  const layout = () => ({
    navigation: { size: harnessStore.state.mainPanelSizes.left * scale, collapsed: harnessStore.state.mainPanelSizes.leftCollapsed === true },
    work: { size: harnessStore.state.mainPanelSizes.center * scale },
    ...(props.tracePanelMode() === "closed" ? {} : { "run-details": { size: props.tracePanelMode() === "peek" ? 240 : harnessStore.state.mainPanelSizes.right * scale } }),
  });
  const onLayoutChange = (next: PanelGroupLayout) => {
    const navigation = next.navigation;
    const work = next.work;
    const details = next["run-details"];
    harnessStore.setMainPanelSizes({
      left: (navigation?.size ?? 276) / scale,
      center: (work?.size ?? 720) / scale,
      right: (details?.size ?? harnessStore.state.mainPanelSizes.right * scale) / scale,
      ...(navigation?.collapsed ? { leftCollapsed: true } : {}),
    });
  };
  return (
    <div data-test-main-panel-grid="" data-main-panel-mode={props.tracePanelMode()} {...stylex.attrs(styles.mainPanelGrid)}>
      <Show when={props.activeLeftTab() === "preferences" || firstRun()} fallback={<PanelGroup id="harness-main-panels" panels={panels()} layout={layout} onLayoutChange={onLayoutChange} ariaLabel="Harness workspace" narrowBreakpoint={820} narrowModeLabel="Workspace panes" narrowActivePanelId={narrowPanel} onNarrowActivePanelChange={setNarrowPanel} />}>
        <div {...stylex.attrs(styles.preferencesWorkspace)}><TabbedLeftPane tabsOnly />{workPanel.content}</div>
      </Show>
    </div>
  );
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
  // Preserve terminal buffers, selection and unfinished settings after first use.
  const terminalRequested = createMemo(wasRequested => wasRequested || terminalStore.state.open, false);
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
    tracePanelMode,
    executionControlTooltip
  } = createAppViewModel();
  if (window.location.pathname === "/ide") return <IdeFullPage />;

  return (
    <main data-test-app-shell="" {...stylex.attrs(styles.appShell)}>
      <div {...stylex.attrs(styles.appBackground)} />
      <div {...stylex.attrs(styles.appContent)}>
        <header data-test-app-header="" data-ui-navbar {...stylex.attrs(styles.commandBar)}>
          <div {...stylex.attrs(styles.headerIdentity)}>
            <SheetRoot open={sidebarOpen()} onOpenChange={setSidebarOpen}>
              <div {...stylex.attrs(styles.mobileOnly)}>
                <SheetTrigger
                  class={stylex.attrs(styles.mobileMenuButton).class}
                  aria-label="Open projects"
                  data-tour-id="project-sidebar"
                  onClick={() => setSidebarOpen(open => !open)}
                >
                  <Menu {...stylex.attrs(styles.icon16)} />
                </SheetTrigger>
                <SheetContent open={sidebarOpen()} onClose={() => setSidebarOpen(false)} title="Workspace" class={stylex.attrs(styles.fullViewportHeight).class}>
                  <TabbedLeftPane compact onNavigate={() => setSidebarOpen(false)} />
                </SheetContent>
              </div>
            </SheetRoot>

            <div {...stylex.attrs(styles.minWidthZero)}>
              <HomeButton name="Harness" onClick={() => { harnessStore.setActiveLeftTab("projects"); setSidebarOpen(false); }} class={stylex.attrs(styles.workspaceLabel).class}>
                <img src="/brand/logo.svg" alt="" width="24" height="24"/><span {...stylex.attrs(styles.truncate)}>Harness</span>
              </HomeButton>

            </div>
            <ConnectionBanner />
          </div>

          <HeaderActions executionTooltip={executionControlTooltip()} traceTooltip={withPrimaryHotkey(`Trace panel: ${state.tracePanelMode}. Click to cycle closed, peek, open.`, "toggleTracePanel")} />
        </header>

        <HarnessPanelGroup activeLeftTab={activeLeftTab} tracePanelMode={tracePanelMode} />
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
      <div hidden={state.activeLeftTab === "preferences"} data-test-terminal-visibility="">
        <Show when={terminalRequested()}><TerminalDrawer /></Show>
      </div>
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
  onMount(() => onCleanup(registerOverlay({ id: "harness-ide-window", close: () => {
    if (!closeIdeOverlay()) props.onClose();
  } })));


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

function TabbedLeftPane(props: { compact?: boolean; tabsOnly?: boolean; onNavigate?: () => void } = {}) {
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
    <PaneNavigationProvider value={() => props.onNavigate?.()}><div data-test-left-tabbed-pane="" {...stylex.attrs(styles.leftTabbedPane, props.tabsOnly && styles.tabsOnly)}>
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
                tooltipTriggerClass={stylex.attrs(styles.surfaceTabTrigger).class}
                class={stylex.attrs(styles.surfaceTab, iconsOnly() && styles.surfaceTabCollapsed).class}
                aria-label={tab.label}
                data-ui-action={tab.id === "preferences" ? "settings" : tab.id}
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
      <Show when={!props.tabsOnly}><div {...stylex.attrs(styles.leftPaneBody)}>
        <Show
          when={state.activeLeftTab === "jobs" || state.activeLeftTab === "runs"}
          fallback={
            <Show
              when={state.activeLeftTab === "assistants"}
              fallback={
                <Show when={state.activeLeftTab !== "preferences"}><ProjectSidebar compact={props.compact} /></Show>
              }
            >
              <AssistantsPanel variant="roster" />
            </Show>
          }
        >
          <BackgroundJobsPanel variant="left" segment={state.activeLeftTab === "jobs" ? "jobs" : "runs"} />
        </Show>
      </div></Show>
    </div></PaneNavigationProvider>
  );
}
