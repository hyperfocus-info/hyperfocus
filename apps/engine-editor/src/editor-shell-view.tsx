import * as stylex from "@stylexjs/stylex";
import { Button, CoachmarkTour, SegmentedControl, Tab, TabList, TabPanel, Tabs, TreeRoot, WorkbenchShell, normalizeWorkbenchLayout, type CoachmarkStep, type WorkbenchLayout, type WorkbenchLayoutChangeReason, type WorkbenchShellApi } from "@hyperfocus/ui";
import { createSignal, For, Show, type JSX } from "solid-js";
import { Portal, render } from "solid-js/web";
import { createStore } from "solid-js/store";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import type { EditorNarrowPane } from "./app/editor-preferences";
import { EditorAiPanel } from "./editor-ai-panel";
import { EditorCommandPalette, type EditorCommandPaletteApi, type EditorPaletteCommand } from "./components/editor-command-palette";
import { SelectionInspector, type SelectionInspectorSelection } from "./components/selection-inspector";
import { EditorActionMenu, type EditorActionItem } from "./components/editor-action-menu";
import { Editor3DHierarchy, Editor3DInspector, type Editor3DPanelsState } from "./components/editor-3d-panels";
import { EditorCenterContent, type EditorCenterContentState } from "./components/editor-center-content";
import type { EditorProject } from "@hyperfocus/engine/project";

export type EditorMode = "edit" | "play" | "profile" | "build";
export type EditorCenterTab = "project" | "learn" | "settings" | "build" | "profile" | "history";

export type EditorResourceMenuItem = EditorActionItem;

export type EditorProjectBrowserState = {
  projectName: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  scenes: readonly { id: string; name: string; entityCount: number; active: boolean; menu: readonly EditorResourceMenuItem[] }[];
  entities: readonly { id: string; label: string; kind: string; layer: number; depth: number; parentId?: string; selected: boolean; menu: readonly EditorResourceMenuItem[] }[];
  assets: readonly { id: string; name: string; kind: string; detail: string; icon: string; title: string; selected: boolean; draggable: boolean; menu: readonly EditorResourceMenuItem[] }[];
};

export type EditorScriptBrowserState = {
  activePath: string;
  selectedEntityId?: string;
  files: readonly { path: string; active: boolean; menu: readonly EditorResourceMenuItem[] }[];
};

type ShellViewState = {
  mode: EditorMode;
  centerTab: EditorCenterTab;
  centerOpen: boolean;
  centerContent?: EditorCenterContentState;
  consoleOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarSize: number;
  inspectorCollapsed: boolean;
  inspectorSize: number;
  narrowPane: EditorNarrowPane;
  tourOpen: boolean;
  tourStep: number;
  projectBrowser: EditorProjectBrowserState;
  selectionInspector?: { project: EditorProject; selection: SelectionInspectorSelection };
  scriptBrowser?: EditorScriptBrowserState;
  scene3dPanels?: Editor3DPanelsState;
};

type EditorShellViewPatch = Omit<Partial<ShellViewState>, "projectBrowser"> & {
  projectBrowser?: Partial<EditorProjectBrowserState>;
};

export type EditorShellView = {
  readonly body: HTMLElement;
  readonly sidebar: HTMLElement;
  readonly inspector: HTMLElement;
  readonly center: HTMLElement;
  readonly consoleDrawer: HTMLElement;
  openCommandPalette(): void;
  closeCommandPalette(): void;
  refreshCommandPalette(): void;
  commandPaletteOpen(): boolean;
  update(patch: EditorShellViewPatch): void;
  dispose(): void;
};

const modes: ReadonlyArray<{ id: EditorMode; label: string; shortcut: string }> = [
  { id: "edit", label: "Edit", shortcut: "F1" },
  { id: "play", label: "Play", shortcut: "F6" },
  { id: "profile", label: "Profile", shortcut: "F7" },
  { id: "build", label: "Build", shortcut: "F8" },
];

const centerTabs: ReadonlyArray<{ id: EditorCenterTab; label: string }> = [
  { id: "project", label: "Create / Open" },
  { id: "learn", label: "Learn" },
  { id: "settings", label: "Settings" },
  { id: "build", label: "Build" },
  { id: "profile", label: "Profile" },
  { id: "history", label: "History" },
];

const editorTourSteps: readonly CoachmarkStep[] = [
  {
    id: "project-browser",
    title: "Your project stays within reach",
    description: "Scenes, entities, assets, components, and specialized editors live in this resizable project browser. Collapse it whenever the canvas needs more room.",
    target: "[data-solid-state='project-browser']",
  },
  {
    id: "stage",
    title: "Start with the Stage",
    description: "The main workflow stays visible while specialized tools remain one click away.",
    target: "[data-workspace-tab='stage']",
    requireTargetInteraction: true,
    interactionHint: "Select Stage to continue.",
  },
  {
    id: "entity",
    title: "Select data, then edit its shape",
    description: "Choose an entity to reveal only the component controls that its data supports.",
    target: "#project-entities [data-project-entity]",
    requireTargetInteraction: true,
    interactionHint: "Select an entity to continue.",
  },
  {
    id: "play",
    title: "Test the loop early",
    description: "Play mode keeps iteration close to the edit that caused it. You can return to Edit at any time.",
    target: "[data-editor-mode='play']",
    requireTargetInteraction: true,
    interactionHint: "Enter Play mode, then finish the tour.",
  },
];

const styles = stylex.create({
  bodyHost: { overflow: "hidden", height: "100%", minHeight: 0, minWidth: 0, },
  workbenchFrame: { overflow: "hidden", height: "100%", minHeight: 0, minWidth: 0, },
  runtimeSlot: { overflow: "hidden", height: "100%", minHeight: 0, minWidth: 0, },
  modeNav: { alignItems: "stretch", display: "flex", justifyContent: "center", height: "100%", minWidth: 0, },
  modeButton: { borderRadius: 0, gap: "0.65rem", position: "relative", minWidth: "7rem", },
  activeMode: { backgroundColor: "rgb(48 214 200 / 10%)", color: tokens.accent },
  shortcut: { color: tokens.muted, fontFamily: "ui-monospace, monospace", fontSize: "0.55rem" },
  sidebar: { overflow: "auto", backgroundColor: tokens.panel, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, },
  contextualInspector: { overflow: "auto", backgroundColor: tokens.panel, height: "100%", minHeight: 0, minWidth: 0, },
  projectHeader: { paddingBlock: "0.55rem", paddingInline: "0.7rem", alignItems: "center", display: "flex", justifyContent: "space-between", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", minHeight: "3.9rem", },
  headerIdentity: { gap: "0.15rem", display: "grid", minWidth: 0, },
  eyebrow: { color: tokens.accent, fontFamily: "ui-monospace, monospace", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.12em" },
  projectState: { color: tokens.muted, fontSize: "0.6rem" },
  quickActions: { padding: "0.45rem", gap: "0.25rem", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  sidebarSection: { borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px" },
  sectionHeader: { alignItems: "center", backgroundColor: tokens.panelRaised, color: tokens.muted, display: "flex", fontSize: "0.6rem", fontWeight: 750, justifyContent: "space-between", letterSpacing: "0.08em", paddingInlineStart: "0.8rem", textTransform: "uppercase", minHeight: "2.2rem", },
  hint: { paddingBlock: "0.45rem", paddingInline: "0.7rem", color: tokens.muted, display: "block", fontSize: "0.55rem", },
  footerActions: { padding: "0.4rem", gap: "0.4rem", alignItems: "center", backgroundColor: tokens.panel, display: "flex", justifyContent: "center", position: "sticky", borderTopColor: tokens.border, borderTopStyle: "solid", borderTopWidth: "1px", bottom: 0, marginTop: "auto", },
  center: { inset: 0, padding: "1.5rem", alignItems: "center", backdropFilter: "blur(10px)", backgroundColor: "rgb(3 7 11 / 78%)", display: "grid", justifyItems: "center", position: "fixed", zIndex: 20, },
  hidden: { display: "none" },
  centerDialog: { borderColor: tokens.accentStrong, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", overflow: "hidden", backgroundColor: tokens.panel, boxShadow: tokens.shadow, display: "grid", gridTemplateRows: "3.9rem minmax(0, 1fr)", height: "min(45rem, 92vh)", width: "min(61rem, 96vw)", },
  centerHeader: { paddingInline: "1.1rem", alignItems: "center", display: "flex", justifyContent: "space-between", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  centerTabs: { paddingInline: "0.8rem", alignItems: "stretch", display: "flex", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  centerTab: { borderRadius: 0, minWidth: "6.2rem" },
  centerContent: { padding: "1.35rem", overflow: "auto", minHeight: 0, },
  console: { backgroundColor: tokens.background, height: "100%", minHeight: 0, },
  consoleHeader: { paddingInline: "0.75rem", alignItems: "center", display: "flex", fontSize: "0.65rem", justifyContent: "space-between", textTransform: "uppercase", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", height: "2.2rem", },
  consoleOutput: { overflow: "auto", paddingBlock: "0.5rem", paddingInline: "0.75rem", color: tokens.muted, fontFamily: "ui-monospace, monospace", fontSize: "0.6rem", lineHeight: 1.7, height: "calc(100% - 2.2rem)", },
});

export type MountEditorShellViewOptions = {
  app: HTMLElement;
  workspaceHost: HTMLElement;
  resourceNav: HTMLElement;
  projectBrowser?: Partial<EditorProjectBrowserState>;
  scriptBrowser?: EditorScriptBrowserState;
  scene3dPanels?: Editor3DPanelsState;
  commandPaletteCommands?: () => readonly EditorPaletteCommand[];
  onCommandPaletteOpenChange?: (open: boolean) => void;
  onCommandRun?: (command: EditorPaletteCommand) => void;
  layout?: Partial<WorkbenchLayout>;
  narrowPane?: EditorNarrowPane;
  onWorkbenchLayoutChange?: (layout: WorkbenchLayout, reason: WorkbenchLayoutChangeReason) => void;
  onNarrowPaneChange?: (pane: EditorNarrowPane) => void;
  onModeChange?: (mode: EditorMode) => void;
  onCenterTabChange?: (tab: EditorCenterTab) => void;
  onTutorialStepChange?: (step: number) => void;
  onTutorialClose?: (reason: "complete" | "dismiss" | "skip") => void;
};

type EditorShellMountRefs = {
  sidebar: HTMLElement;
  mainSlot: HTMLDivElement;
  inspector: HTMLElement;
  consoleDrawer: HTMLElement;
  workbenchApi: WorkbenchShellApi;
  commandPaletteApi: EditorCommandPaletteApi;
  center: HTMLElement;
};

function createInitialShellViewState(options: MountEditorShellViewOptions): ShellViewState {
  return {
    mode: "edit",
    centerTab: "project",
    centerOpen: false,
    centerContent: undefined,
    consoleOpen: !(options.layout?.bottomCollapsed ?? true),
    sidebarCollapsed: options.layout?.sidebarCollapsed ?? false,
    sidebarSize: options.layout?.sidebarSize ?? 280,
    inspectorCollapsed: options.layout?.inspectorCollapsed ?? false,
    inspectorSize: options.layout?.inspectorSize ?? 320,
    narrowPane: options.narrowPane ?? "main",
    tourOpen: false,
    tourStep: 0,
    projectBrowser: {
      projectName: "Loading…",
      dirty: false,
      canUndo: false,
      canRedo: false,
      scenes: [],
      entities: [],
      assets: [],
      ...options.projectBrowser
    }
  };
}

function createEditorShellMountRefRegistry() {
  const refs: Partial<EditorShellMountRefs> = {};
  const requireRefs = (): EditorShellMountRefs => {
    if (!refs.sidebar || !refs.mainSlot || !refs.inspector || !refs.consoleDrawer ||
      !refs.workbenchApi || !refs.commandPaletteApi || !refs.center) {
      throw new Error("Editor shell did not synchronously mount all required view refs");
    }
    return {
      sidebar: refs.sidebar,
      mainSlot: refs.mainSlot,
      inspector: refs.inspector,
      consoleDrawer: refs.consoleDrawer,
      workbenchApi: refs.workbenchApi,
      commandPaletteApi: refs.commandPaletteApi,
      center: refs.center
    };
  };
  return {
    sidebarRef: (value: HTMLElement) => { refs.sidebar = value; },
    mainSlotRef: (value: HTMLDivElement) => { refs.mainSlot = value; },
    inspectorRef: (value: HTMLElement) => { refs.inspector = value; },
    consoleRef: (value: HTMLElement) => { refs.consoleDrawer = value; },
    workbenchApiRef: (value: WorkbenchShellApi) => { refs.workbenchApi = value; },
    commandPaletteApiRef: (value: EditorCommandPaletteApi) => { refs.commandPaletteApi = value; },
    centerRef: (value: HTMLElement) => { refs.center = value; },
    requireRefs
  };
}

function applyResponsiveEditorWorkbench(options: {
  body: HTMLElement;
  refs: Pick<EditorShellMountRefs, "sidebar" | "mainSlot" | "inspector">;
  narrow: boolean;
  pane: EditorNarrowPane;
  layout: WorkbenchLayout;
}) {
  const { body, refs, narrow, pane, layout } = options;
  const projectPanel = refs.sidebar.closest<HTMLElement>("[data-workbench-panel='sidebar']");
  const inspectorPanel = refs.inspector.closest<HTMLElement>("[data-workbench-panel='inspector']");
  const mainPanel = refs.mainSlot.closest<HTMLElement>("main");
  body.dataset.editorNarrow = String(narrow);
  body.dataset.editorNarrowPane = pane;
  if (narrow) {
    if (projectPanel) { projectPanel.hidden = pane !== "project"; projectPanel.setAttribute("aria-hidden", String(pane !== "project")); }
    refs.sidebar.hidden = pane !== "project";
    refs.sidebar.setAttribute("aria-hidden", String(pane !== "project"));
    if (mainPanel) { mainPanel.hidden = pane !== "main"; mainPanel.setAttribute("aria-hidden", String(pane !== "main")); }
    if (inspectorPanel) { inspectorPanel.hidden = pane !== "inspector"; inspectorPanel.setAttribute("aria-hidden", String(pane !== "inspector")); }
    refs.inspector.hidden = pane !== "inspector";
    refs.inspector.setAttribute("aria-hidden", String(pane !== "inspector"));
    return;
  }
  if (projectPanel) { projectPanel.hidden = layout.sidebarCollapsed; projectPanel.setAttribute("aria-hidden", String(layout.sidebarCollapsed)); }
  refs.sidebar.hidden = layout.sidebarCollapsed;
  refs.sidebar.setAttribute("aria-hidden", String(layout.sidebarCollapsed));
  if (mainPanel) { mainPanel.hidden = false; mainPanel.setAttribute("aria-hidden", "false"); }
  if (inspectorPanel) { inspectorPanel.hidden = layout.inspectorCollapsed; inspectorPanel.setAttribute("aria-hidden", String(layout.inspectorCollapsed)); }
  refs.inspector.hidden = layout.inspectorCollapsed;
  refs.inspector.setAttribute("aria-hidden", String(layout.inspectorCollapsed));
}

/**
 * Solid owns the editor chrome and its visibility state. The existing canvas and
 * engine workspaces are moved into the workbench's main slot and remain
 * framework-neutral, so high-frequency render loops never pass through Solid.
 */
export function mountEditorShellView(options: MountEditorShellViewOptions): EditorShellView {
  const initial = createInitialShellViewState(options);
  const [mode, setMode] = createSignal(initial.mode);
  const [centerState, setCenterState] = createSignal({
    centerTab: initial.centerTab,
    centerOpen: initial.centerOpen,
    centerContent: initial.centerContent,
  });
  const [layoutState, setLayoutState] = createSignal(normalizeWorkbenchLayout({
    ...options.layout,
    sidebarCollapsed: initial.sidebarCollapsed,
    sidebarSize: initial.sidebarSize,
    inspectorCollapsed: initial.inspectorCollapsed,
    inspectorSize: initial.inspectorSize,
    bottomCollapsed: !initial.consoleOpen,
  }));
  const [narrowPane, setNarrowPane] = createSignal(initial.narrowPane);
  const [tourState, setTourState] = createSignal({ open: initial.tourOpen, step: initial.tourStep });
  const [projectBrowser, setProjectBrowser] = createStore(initial.projectBrowser);
  const [selectionInspector, setSelectionInspector] = createSignal<ShellViewState["selectionInspector"]>();
  const [scriptBrowser, setScriptBrowser] = createSignal<EditorScriptBrowserState | undefined>(options.scriptBrowser);
  const [scene3dPanels, setScene3DPanels] = createSignal<Editor3DPanelsState | undefined>(options.scene3dPanels);
  const disposers: Array<() => void> = [];

  options.resourceNav.classList.add("resource-nav");
  options.resourceNav.setAttribute("aria-label", "Project resource editors");
  options.resourceNav.setAttribute("role", "tablist");

  const modeRoot = document.createElement("div");
  modeRoot.dataset.solidOwner = "editor-modes";
  options.resourceNav.replaceWith(modeRoot);

  const body = document.createElement("div");
  body.className = stylex.attrs(styles.bodyHost).class ?? "";
  body.dataset.solidOwner = "editor-workbench";
  options.workspaceHost.before(body);
  const mountRefs = createEditorShellMountRefRegistry();
  const aiRoot = document.getElementById("editor-ai-root");
  const scriptListRoot = document.getElementById("script-file-list");
  const scene3dHierarchyRoot = document.getElementById("scene3d-entities");
  const scene3dInspectorRoot = document.getElementById("scene3d-inspector");
  scene3dHierarchyRoot?.replaceChildren();
  scene3dInspectorRoot?.replaceChildren();

  disposers.push(render(() => (
    <>
      <Portal mount={modeRoot}><ModeNavigation mode={mode} onModeChange={(next) => options.onModeChange?.(next)} /></Portal>
      <EditorWorkbench
        resourceNav={options.resourceNav}
        projectBrowser={projectBrowser}
        selectionInspector={selectionInspector}
        sidebarRef={mountRefs.sidebarRef}
        mainSlot={mountRefs.mainSlotRef}
        inspectorRef={mountRefs.inspectorRef}
        consoleRef={mountRefs.consoleRef}
        workbenchApiRef={mountRefs.workbenchApiRef}
        layout={layoutState}
        narrowPane={narrowPane}
        onNarrowPaneChange={(pane) => {
          setNarrowPane(pane);
          options.onNarrowPaneChange?.(pane);
          queueMicrotask(applyResponsiveWorkbench);
        }}
        onLayoutChange={(next, reason) => {
          const { sidebar, consoleDrawer } = mountRefs.requireRefs();
          setLayoutState(next);
          sidebar.hidden = next.sidebarCollapsed;
          sidebar.setAttribute("aria-hidden", String(next.sidebarCollapsed));
          consoleDrawer.hidden = next.bottomCollapsed;
          consoleDrawer.setAttribute("aria-hidden", String(next.bottomCollapsed));
          options.onWorkbenchLayoutChange?.(next, reason);
          queueMicrotask(applyResponsiveWorkbench);
        }}
      />
      <EditorOverlays centerState={centerState} tourState={tourState} centerRef={mountRefs.centerRef} onCenterTabChange={options.onCenterTabChange} onTutorialStepChange={options.onTutorialStepChange} onTutorialClose={options.onTutorialClose} />
      <EditorCommandPalette
        apiRef={mountRefs.commandPaletteApiRef}
        commands={() => options.commandPaletteCommands?.() ?? []}
        onOpenChange={options.onCommandPaletteOpenChange}
        onRun={options.onCommandRun}
      />
      {scriptListRoot ? <Portal mount={scriptListRoot}><Show when={scriptBrowser()}>{(state) => <EditorScriptFileList state={state()} />}</Show></Portal> : null}
      {scene3dHierarchyRoot ? <Portal mount={scene3dHierarchyRoot}><Show when={scene3dPanels()}>{(state) => <Editor3DHierarchy state={state()} />}</Show></Portal> : null}
      {scene3dInspectorRoot ? <Portal mount={scene3dInspectorRoot}><Show when={scene3dPanels()}>{(state) => <Editor3DInspector state={state()} />}</Show></Portal> : null}
      {aiRoot ? <Portal mount={aiRoot}><EditorAiPanel /></Portal> : null}
    </>
  ), body));
  const { sidebar, mainSlot, inspector, consoleDrawer, workbenchApi, commandPaletteApi, center } = mountRefs.requireRefs();
  mainSlot.append(options.workspaceHost);
  sidebar.hidden = layoutState().sidebarCollapsed;
  sidebar.setAttribute("aria-hidden", String(layoutState().sidebarCollapsed));
  consoleDrawer.hidden = layoutState().bottomCollapsed;
  consoleDrawer.setAttribute("aria-hidden", String(layoutState().bottomCollapsed));

  let observedNarrow = false;
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? body.getBoundingClientRect().width;
    const nextNarrow = width > 0 && width <= 900;
    if (nextNarrow === observedNarrow) return;
    observedNarrow = nextNarrow;
    applyResponsiveWorkbench();
  }) : undefined;
  resizeObserver?.observe(body);
  disposers.push(() => resizeObserver?.disconnect());
  if (!resizeObserver && typeof matchMedia === "function") {
    const narrowMedia = matchMedia("(max-width: 900px)");
    observedNarrow = narrowMedia.matches;
    const onNarrowMediaChange = () => {
      observedNarrow = narrowMedia.matches;
      applyResponsiveWorkbench();
    };
    narrowMedia.addEventListener("change", onNarrowMediaChange);
    disposers.push(() => narrowMedia.removeEventListener("change", onNarrowMediaChange));
  }
  applyResponsiveWorkbench();

  function applyResponsiveWorkbench() {
    if (!mainSlot.isConnected) return;
    applyResponsiveEditorWorkbench({
      body,
      refs: { sidebar, mainSlot, inspector },
      narrow: observedNarrow,
      pane: narrowPane(),
      layout: layoutState()
    });
  }

  return {
    body,
    sidebar,
    inspector,
    center,
    consoleDrawer,
    openCommandPalette: () => commandPaletteApi.open(),
    closeCommandPalette: () => commandPaletteApi.close(),
    refreshCommandPalette: () => commandPaletteApi.refresh(),
    commandPaletteOpen: () => commandPaletteApi.isOpen(),
    update(patch) {
      if (patch.mode !== undefined) setMode(patch.mode);
      if (patch.centerTab !== undefined || patch.centerOpen !== undefined || patch.centerContent !== undefined) {
        setCenterState((current) => {
          const next = {
            centerTab: patch.centerTab ?? current.centerTab,
            centerOpen: patch.centerOpen ?? current.centerOpen,
            centerContent: patch.centerContent ?? current.centerContent,
          };
          return next.centerTab === current.centerTab && next.centerOpen === current.centerOpen && next.centerContent === current.centerContent ? current : next;
        });
      }
      if (patch.tourOpen !== undefined || patch.tourStep !== undefined) {
        setTourState((current) => ({ open: patch.tourOpen ?? current.open, step: patch.tourStep ?? current.step }));
      }
      if (patch.projectBrowser !== undefined) {
        setProjectBrowser(patch.projectBrowser);
      }
      if (patch.selectionInspector !== undefined) setSelectionInspector(patch.selectionInspector);
      if (patch.scriptBrowser !== undefined) setScriptBrowser(patch.scriptBrowser);
      if (patch.scene3dPanels !== undefined) setScene3DPanels(patch.scene3dPanels);
      if (patch.narrowPane !== undefined) {
        setNarrowPane(patch.narrowPane);
        queueMicrotask(applyResponsiveWorkbench);
      }
      if (patch.consoleOpen !== undefined) {
        const next = normalizeWorkbenchLayout({ ...layoutState(), bottomCollapsed: !patch.consoleOpen });
        if (!sameWorkbenchLayout(next, layoutState())) {
          setLayoutState(next);
          workbenchApi.updateLayout(next);
        }
        consoleDrawer.hidden = !patch.consoleOpen;
        consoleDrawer.setAttribute("aria-hidden", String(!patch.consoleOpen));
      }
      if (patch.sidebarCollapsed !== undefined || patch.sidebarSize !== undefined || patch.inspectorCollapsed !== undefined || patch.inspectorSize !== undefined) {
        const next = normalizeWorkbenchLayout({ ...layoutState(),
          sidebarCollapsed: patch.sidebarCollapsed ?? layoutState().sidebarCollapsed,
          sidebarSize: patch.sidebarSize ?? layoutState().sidebarSize,
          inspectorCollapsed: patch.inspectorCollapsed ?? layoutState().inspectorCollapsed,
          inspectorSize: patch.inspectorSize ?? layoutState().inspectorSize,
        });
        if (!sameWorkbenchLayout(next, layoutState())) {
          setLayoutState(next);
          workbenchApi.updateLayout(next);
        }
        if (patch.sidebarCollapsed !== undefined) {
          sidebar.hidden = patch.sidebarCollapsed;
          sidebar.setAttribute("aria-hidden", String(patch.sidebarCollapsed));
        }
        queueMicrotask(applyResponsiveWorkbench);
      }
    },
    dispose() {
      for (const dispose of disposers.reverse()) dispose();
      modeRoot.remove();
      body.remove();
    },
  };
}

function EditorOverlays(props: {
  centerState: () => { centerTab: EditorCenterTab; centerOpen: boolean; centerContent?: EditorCenterContentState };
  tourState: () => { open: boolean; step: number };
  centerRef: (element: HTMLElement) => void;
  onCenterTabChange?: (tab: EditorCenterTab) => void;
  onTutorialStepChange?: (step: number) => void;
  onTutorialClose?: (reason: "complete" | "dismiss" | "skip") => void;
}) {
  return (
    <>
      <section
        {...stylex.attrs(styles.center, !props.centerState().centerOpen && styles.hidden)}
        classList={{ "editor-center": true }}
        id="editor-center"
        hidden={!props.centerState().centerOpen}
        ref={props.centerRef}
        data-solid-state="center"
      >
        <div {...stylex.attrs(styles.centerDialog)} classList={{ "editor-center-dialog": true }} role="dialog" aria-modal="true" aria-labelledby="editor-center-title">
          <header {...stylex.attrs(styles.centerHeader)}>
            <div {...stylex.attrs(styles.headerIdentity)}><span {...stylex.attrs(styles.eyebrow)}>HYPERFOCUS ENGINE</span><strong id="editor-center-title">Make a game</strong></div>
            <Button as="button" variant="ghost" size="icon" tooltip="Close project center" data-editor-action="close-center" aria-label="Close project center">×</Button>
          </header>
          <Tabs
            class="editor-center-tabs-root"
            id="editor-center-tabs"
            value={props.centerState().centerTab}
            onValueChange={(value) => { if (isEditorCenterTab(value)) props.onCenterTabChange?.(value); }}
          >
            <TabList class={stylex.attrs(styles.centerTabs).class} aria-label="Project center">
              {centerTabs.map((tab) => <Tab value={tab.id} data-editor-center-tab={tab.id} class={stylex.attrs(styles.centerTab).class}>{tab.label}</Tab>)}
            </TabList>
            {centerTabs.map((tab) => (
              <TabPanel value={tab.id}>
                {props.centerState().centerTab === tab.id
                  ? <main {...stylex.attrs(styles.centerContent)} id="editor-center-content"><EditorCenterContent state={props.centerState().centerContent} /></main>
                  : null}
              </TabPanel>
            ))}
          </Tabs>
        </div>
      </section>
      <CoachmarkTour
        open={props.tourState().open}
        initialStep={props.tourState().step}
        steps={editorTourSteps}
        label="Editor essentials tour"
        onStepChange={(step) => props.onTutorialStepChange?.(step)}
        onClose={(reason) => props.onTutorialClose?.(reason)}
      />
    </>
  );
}

function sameWorkbenchLayout(left: WorkbenchLayout, right: WorkbenchLayout) {
  return left.sidebarSize === right.sidebarSize
    && left.inspectorSize === right.inspectorSize
    && left.bottomSize === right.bottomSize
    && left.sidebarCollapsed === right.sidebarCollapsed
    && left.inspectorCollapsed === right.inspectorCollapsed
    && left.bottomCollapsed === right.bottomCollapsed;
}

function EditorWorkbench(props: {
  resourceNav: HTMLElement;
  projectBrowser: EditorProjectBrowserState;
  selectionInspector: () => ShellViewState["selectionInspector"];
  sidebarRef: (element: HTMLElement) => void;
  mainSlot: (element: HTMLDivElement) => void;
  inspectorRef: (element: HTMLElement) => void;
  consoleRef: (element: HTMLElement) => void;
  workbenchApiRef: (api: WorkbenchShellApi) => void;
  layout: () => WorkbenchLayout;
  narrowPane: () => EditorNarrowPane;
  onNarrowPaneChange: (pane: EditorNarrowPane) => void;
  onLayoutChange: (layout: WorkbenchLayout, reason: WorkbenchLayoutChangeReason) => void;
}) {
  const sidebar = <ProjectSidebar ref={props.sidebarRef} resourceNav={props.resourceNav} state={props.projectBrowser} hidden={() => props.layout().sidebarCollapsed} />;
  const main = <div {...stylex.attrs(styles.runtimeSlot)} ref={props.mainSlot} data-runtime-owner="engine" />;
  const inspector = <ContextualInspector ref={props.inspectorRef} state={props.selectionInspector} hidden={() => props.layout().inspectorCollapsed} />;
  const consolePanel = <ConsolePanel ref={props.consoleRef} hidden={() => props.layout().bottomCollapsed} />;
  return <div {...stylex.attrs(styles.workbenchFrame)}>
    <WorkbenchShell apiRef={props.workbenchApiRef} layout={props.layout} sidebar={sidebar} main={main} inspector={inspector} bottomPanel={consolePanel} panelLabels={{ sidebar: "project browser", inspector: "contextual inspector", bottom: "console and build output" }} onLayoutChange={(layout, reason) => props.onLayoutChange(layout, reason)} />
    <SegmentedControl
      class="editor-narrow-pane-switcher"
      ariaLabel="Editor panes"
      value={props.narrowPane()}
      options={[{ value: "project", label: "Project" }, { value: "main", label: "Canvas" }, { value: "inspector", label: "Inspector" }]}
      onValueChange={props.onNarrowPaneChange}
    />
  </div>;
}

function ContextualInspector(props: { ref: (element: HTMLElement) => void; state: () => ShellViewState["selectionInspector"]; hidden: () => boolean }) {
  return (
    <section {...stylex.attrs(styles.contextualInspector)} class="contextual-inspector" aria-label="Contextual inspector" ref={props.ref} hidden={props.hidden()} aria-hidden={props.hidden()}>
      <div class="contextual-inspector-title"><div><span>INSPECTOR</span><strong>Selection</strong></div><Button variant="ghost" size="icon" tooltip="Hide inspector" data-editor-action="toggle-inspector" aria-label="Hide inspector">×</Button></div>
      <div id="project-selection-inspector">
        <Show when={props.state()}>{(state) => <SelectionInspector project={state().project} selection={state().selection} />}</Show>
      </div>
    </section>
  );
}

function ConsolePanel(props: { ref: (element: HTMLElement) => void; hidden: () => boolean }) {
  return (
    <section {...stylex.attrs(styles.console)} id="editor-console" ref={props.ref} data-solid-state="console" hidden={props.hidden()} aria-hidden={props.hidden()}>
      <header {...stylex.attrs(styles.consoleHeader)}>
        <strong>Console &amp; build output</strong>
        <Button as="button" variant="ghost" size="icon" tooltip="Close console" data-editor-action="close-console" aria-label="Close console">×</Button>
      </header>
      <div {...stylex.attrs(styles.consoleOutput)} id="editor-console-output" role="log" aria-live="polite" />
    </section>
  );
}

function ModeNavigation(props: { mode: () => EditorMode; onModeChange: (mode: EditorMode) => void }) {
  return (
    <Tabs style={{ display: "contents" }} value={props.mode()} onValueChange={(value) => { if (isEditorMode(value)) props.onModeChange(value); }}>
      <TabList class={stylex.attrs(styles.modeNav).class} aria-label="Editor modes" data-solid-state="modes">
        {modes.map((mode) => (
          <Tab
            value={mode.id}
            data-editor-mode={mode.id}
            class={`${stylex.attrs(styles.modeButton, props.mode() === mode.id && styles.activeMode).class ?? ""}${props.mode() === mode.id ? " is-active" : ""}`}
          >
            <span>{mode.label}</span><kbd {...stylex.attrs(styles.shortcut)}>{mode.shortcut}</kbd>
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}

function ProjectSidebar(props: {
  ref: (element: HTMLElement) => void;
  resourceNav: HTMLElement;
  state: EditorProjectBrowserState;
  hidden: () => boolean;
}) {
  return (
    <aside {...stylex.attrs(styles.sidebar)} classList={{ "project-sidebar": true }} aria-label="Project browser" ref={props.ref} data-solid-state="project-browser" hidden={props.hidden()} aria-hidden={props.hidden()}>
      <header {...stylex.attrs(styles.projectHeader)} classList={{ "project-header": true }}>
        <div {...stylex.attrs(styles.headerIdentity)}><span {...stylex.attrs(styles.eyebrow)}>PROJECT</span><strong id="editor-project-name">{props.state.projectName}</strong><small {...stylex.attrs(styles.projectState)} classList={{ "is-dirty": props.state.dirty }} id="editor-project-state">{props.state.dirty ? "Unsaved changes" : "Saved"}</small></div>
        <Button variant="ghost" size="icon" tooltip="Collapse project browser" data-editor-action="toggle-sidebar" aria-label="Collapse project browser">☰</Button>
      </header>
      <div {...stylex.attrs(styles.quickActions)} classList={{ "project-quick-actions": true }}>
        <Button variant="secondary" size="small" tooltip="Create a new game" data-editor-action="new">New</Button>
        <Button variant="secondary" size="small" tooltip="Open a .hyperfocus project" data-editor-action="open">Open</Button>
        <Button variant="secondary" size="small" tooltip="Save portable project files (Ctrl/Cmd+S)" data-editor-action="save">Save</Button>
        <Button variant="ghost" size="small" tooltip="Undo (Ctrl/Cmd+Z)" data-editor-action="undo" disabled={!props.state.canUndo}>↶</Button>
        <Button variant="ghost" size="small" tooltip="Redo (Ctrl/Cmd+Y)" data-editor-action="redo" disabled={!props.state.canRedo}>↷</Button>
      </div>
      <SidebarSection label="Scenes" action="create-scene" actionLabel="Create scene"><ProjectSceneTree scenes={() => props.state.scenes} /></SidebarSection>
      <SidebarSection label="Entities" action="create-entity" actionLabel="Create entity"><ProjectEntityTree entities={() => props.state.entities} /></SidebarSection>
      <SidebarSection label="Editors" action="fullscreen" actionLabel="Toggle viewport fullscreen" class="resource-section"><div id="resource-nav-slot" ref={(host) => host.append(props.resourceNav)} /></SidebarSection>
      <SidebarSection label="Assets" action="import-assets" actionLabel="Import assets" class="assets-section"><ProjectAssetList assets={() => props.state.assets} /><small {...stylex.attrs(styles.hint)} class="drop-hint">Drop files to import · packed into assets.hfp when saved</small></SidebarSection>
      <nav {...stylex.attrs(styles.footerActions)} classList={{ "sidebar-footer-actions": true }} aria-label="Project tools">
        <div class="sidebar-tool-group" role="group" aria-label="Project guidance and settings">
          <Button class="sidebar-tool-button" variant="ghost" size="icon" tooltip="Open learning path" data-editor-action="learn" aria-label="Open learning path"><SidebarToolIcon name="learn" /></Button>
          <Button class="sidebar-tool-button" variant="ghost" size="icon" tooltip="Open project settings" data-editor-action="settings" aria-label="Open project settings"><SidebarToolIcon name="settings" /></Button>
        </div>
        <div class="sidebar-tool-group" role="group" aria-label="Project output and history">
          <Button class="sidebar-tool-button" variant="ghost" size="icon" tooltip="Build project" data-editor-action="build" aria-label="Build project"><SidebarToolIcon name="build" /></Button>
          <Button class="sidebar-tool-button" variant="ghost" size="icon" tooltip="View project history" data-editor-action="history" aria-label="View project history"><SidebarToolIcon name="history" /></Button>
        </div>
      </nav>
    </aside>
  );
}

function ProjectSceneTree(props: { scenes: () => EditorProjectBrowserState["scenes"] }) {
  return (
    <TreeRoot id="project-scenes" aria-label="Project scenes">
      <For each={props.scenes()}>{(scene) => (
        <div class="project-resource-row" role="none" data-context-resource="scene">
          <button type="button" role="treeitem" aria-selected={scene.active} tabindex={scene.active ? 0 : -1} classList={{ "project-tree-row": true, "is-active": scene.active }} data-project-scene={scene.id}>
            <span aria-hidden="true">◇</span><span>{scene.name}</span><small>{scene.entityCount}</small>
          </button>
          <EditorActionMenu label={`${scene.name} scene actions`} items={scene.menu} />
        </div>
      )}</For>
    </TreeRoot>
  );
}

function ProjectEntityTree(props: { entities: () => EditorProjectBrowserState["entities"] }) {
  return (
    <TreeRoot id="project-entities" aria-label="Active scene entities">
      <Show when={props.entities().length} fallback={<p class="empty-copy">No entities yet. Create one to begin authoring.</p>}>
        <For each={props.entities()}>{(entity, index) => {
          const depthLabel = entity.depth === 1 ? "Child · " : entity.depth > 1 ? `Depth ${entity.depth + 1} · ` : "";
          return (
          <div class="project-resource-row" role="none" data-context-resource="entity">
            <button
              type="button"
              role="treeitem"
              aria-selected={entity.selected}
              aria-level={entity.depth + 1}
              data-tree-depth={entity.depth}
              style={{ "--entity-tree-indent": `${entity.depth * 14}px` }}
              data-parent-id={entity.parentId}
              tabindex={entity.selected || !props.entities().some((item) => item.selected) && index() === 0 ? 0 : -1}
              classList={{ "project-tree-row": true, "is-active": entity.selected }}
              data-project-entity={entity.id}
            >
              <span aria-hidden="true">{entity.kind === "actor" ? "◆" : entity.kind === "hostile" ? "◈" : "✦"}</span>
              <span>{entity.label}</span>
              <small>{depthLabel}L{entity.layer}</small>
            </button>
            <EditorActionMenu label={`${entity.label} entity actions`} items={entity.menu} />
          </div>
          );
        }}</For>
      </Show>
    </TreeRoot>
  );
}

function ProjectAssetList(props: { assets: () => EditorProjectBrowserState["assets"] }) {
  return (
    <div id="project-assets" role="list">
      <Show when={props.assets().length} fallback={<p class="empty-copy">Drop images, audio, data, fonts, or glTF models here.</p>}>
        <For each={props.assets()}>{(asset) => (
        <div
          classList={{ "asset-resource-row": true, "is-active": asset.selected }}
          draggable={asset.draggable}
          data-project-asset={asset.id}
          data-context-resource="asset"
          role="listitem"
          title={asset.title}
          onDragStart={(event) => {
            event.dataTransfer?.setData("application/x-engine-asset", asset.id);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
          }}
        >
          <button type="button" class="asset-row" data-editor-action="select-asset" data-asset-id={asset.id}>
            <span aria-hidden="true">{asset.icon}</span><div><strong>{asset.name}</strong><small>{asset.detail}</small></div>
          </button>
          <EditorActionMenu label={`${asset.name} asset actions`} items={asset.menu} />
        </div>
        )}</For>
      </Show>
    </div>
  );
}

export function EditorScriptFileList(props: { state: EditorScriptBrowserState }) {
  return (
    <>
      <div class="script-authoring-actions">
        <button type="button" data-editor-action="create-script">+ Script</button>
        <button
          type="button"
          data-editor-action="attach-script"
          data-path={props.state.activePath}
          disabled={!props.state.activePath || !props.state.selectedEntityId}
        >Attach to selected</button>
      </div>
      <Show when={props.state.files.length} fallback={<p class="empty-copy">No scripts yet. Create one when you need custom behavior.</p>}>
        <For each={props.state.files}>{(file) => (
          <div class="script-resource-row" data-context-resource="script">
            <button type="button" classList={{ "is-active": file.active }} data-script-path={file.path}>{file.path}</button>
            <EditorActionMenu label={`${file.path} script actions`} items={file.menu} />
          </div>
        )}</For>
      </Show>
    </>
  );
}

function SidebarToolIcon(props: { name: "learn" | "settings" | "build" | "history" }) {
  if (props.name === "learn") return <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c2.9-.8 5.6-.3 8 1.5v12c-2.4-1.8-5.1-2.3-8-1.5zM20 5.5c-2.9-.8-5.6-.3-8 1.5v12c2.4-1.8 5.1-2.3 8-1.5z" /></svg>;
  if (props.name === "settings") return <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19 13.7 1.4 1.1-1.8 3.1-1.7-.7a7.7 7.7 0 0 1-2.3 1.4l-.2 1.8h-3.6l-.2-1.8a7.7 7.7 0 0 1-2.3-1.4l-1.7.7-1.8-3.1 1.4-1.1a7.8 7.8 0 0 1 0-2.7L4.8 9.9l1.8-3.1 1.7.7a7.7 7.7 0 0 1 2.3-1.4l.2-1.8h3.6l.2 1.8a7.7 7.7 0 0 1 2.3 1.4l1.7-.7 1.8 3.1-1.4 1.1a7.8 7.8 0 0 1 0 2.7Z" /></svg>;
  if (props.name === "build") return <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5 4.5 4.5-9.7 9.7-4.5-4.5zM13 6.5l4.5 4.5M5.5 13.8l-2 6.7 6.7-2" /></svg>;
  return <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" /><path d="M4.5 4.5V9H9M12 8v4l2.8 1.8" /></svg>;
}

function SidebarSection(props: { label: string; action: string; actionLabel: string; class?: string; children: JSX.Element }) {
  return (
    <section {...stylex.attrs(styles.sidebarSection)} classList={{ "project-section": true, [props.class ?? ""]: Boolean(props.class) }}>
      <header {...stylex.attrs(styles.sectionHeader)}>
        <span>{props.label}</span>
        <Button variant="ghost" size="icon" tooltip={props.actionLabel} data-editor-action={props.action} aria-label={props.actionLabel}>＋</Button>
      </header>
      {props.children}
    </section>
  );
}

function isEditorCenterTab(value: string): value is EditorCenterTab {
  return centerTabs.some((tab) => tab.id === value);
}

function isEditorMode(value: string): value is EditorMode {
  return modes.some((mode) => mode.id === value);
}
