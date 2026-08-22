import * as stylex from "@stylexjs/stylex";
import { Button, WorkbenchShell } from "@hyperfocus/ui";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { tokens } from "@hyperfocus/ui/tokens.stylex";

export type EditorMode = "edit" | "play" | "profile" | "build";
export type EditorCenterTab = "project" | "learn" | "settings" | "build" | "profile" | "history";

type ShellViewState = {
  mode: EditorMode;
  centerTab: EditorCenterTab;
  centerOpen: boolean;
  centerHtml: string;
  consoleOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarSize: number;
};

export type EditorShellView = {
  readonly body: HTMLElement;
  readonly sidebar: HTMLElement;
  readonly center: HTMLElement;
  readonly consoleDrawer: HTMLElement;
  update(patch: Partial<ShellViewState>): void;
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

/**
 * Solid owns the editor chrome and its visibility state. The existing canvas and
 * engine workspaces are moved into the workbench's main slot and remain
 * framework-neutral, so high-frequency render loops never pass through Solid.
 */
export function mountEditorShellView(options: {
  app: HTMLElement;
  workspaceHost: HTMLElement;
  resourceNav: HTMLElement;
}): EditorShellView {
  const initial: ShellViewState = {
    mode: "edit",
    centerTab: "project",
    centerOpen: false,
    centerHtml: "",
    consoleOpen: false,
    sidebarCollapsed: false,
    sidebarSize: 280,
  };
  const [mode, setMode] = createSignal(initial.mode);
  const [centerState, setCenterState] = createSignal({
    centerTab: initial.centerTab,
    centerOpen: initial.centerOpen,
    centerHtml: initial.centerHtml,
  });
  const [consoleOpen, setConsoleOpen] = createSignal(initial.consoleOpen);
  const [layoutState, setLayoutState] = createSignal({ sidebarCollapsed: initial.sidebarCollapsed, sidebarSize: initial.sidebarSize });
  const disposers: Array<() => void> = [];

  options.resourceNav.classList.add("resource-nav");
  options.resourceNav.setAttribute("aria-label", "Project resource editors");
  options.resourceNav.setAttribute("role", "tablist");

  const modeRoot = document.createElement("div");
  modeRoot.dataset.solidOwner = "editor-modes";
  options.resourceNav.replaceWith(modeRoot);
  disposers.push(render(() => <ModeNavigation mode={mode} />, modeRoot));

  const body = document.createElement("div");
  body.className = stylex.attrs(styles.bodyHost).class ?? "";
  body.dataset.solidOwner = "editor-workbench";
  options.workspaceHost.before(body);
  let sidebar!: HTMLElement;
  let mainSlot!: HTMLDivElement;
  disposers.push(render(() => (
    <EditorWorkbench
      resourceNav={options.resourceNav}
      sidebarRef={(element) => { sidebar = element; }}
      mainSlot={(element) => { mainSlot = element; }}
    />
  ), body));
  mainSlot.append(options.workspaceHost);
  const syncWorkbenchLayout = () => {
    const layout = layoutState();
    const shell = body.querySelector<HTMLElement>('[data-test-workbench-shell]');
    if (!shell) return;
    shell.style.gridTemplateColumns = `${layout.sidebarCollapsed ? "" : `${layout.sidebarSize}px `}minmax(0,1fr)`;
    sidebar.hidden = layout.sidebarCollapsed;
    sidebar.setAttribute("aria-hidden", String(layout.sidebarCollapsed));
  };
  syncWorkbenchLayout();

  const overlayRoot = document.createElement("div");
  overlayRoot.dataset.solidOwner = "editor-overlays";
  options.app.append(overlayRoot);
  let center!: HTMLElement;
  let consoleDrawer!: HTMLElement;
  disposers.push(render(() => (
    <>
      <section
        {...stylex.attrs(styles.center, !centerState().centerOpen && styles.hidden)}
        classList={{ "editor-center": true }}
        id="editor-center"
        hidden={!centerState().centerOpen}
        ref={center}
        data-solid-state="center"
      >
        <div {...stylex.attrs(styles.centerDialog)} classList={{ "editor-center-dialog": true }} role="dialog" aria-modal="true" aria-labelledby="editor-center-title">
          <header {...stylex.attrs(styles.centerHeader)}>
            <div {...stylex.attrs(styles.headerIdentity)}><span {...stylex.attrs(styles.eyebrow)}>HYPERFOCUS ENGINE</span><strong id="editor-center-title">Make a game</strong></div>
            <Button as="button" variant="ghost" size="icon" tooltip="Close project center" data-editor-action="close-center" aria-label="Close project center">×</Button>
          </header>
          <nav {...stylex.attrs(styles.centerTabs)} role="tablist" aria-label="Project center">
            {centerTabs.map((tab) => (
              <Button
                variant="ghost"
                size="small"
                tooltip={`Open ${tab.label}`}
                role="tab"
                data-center-tab={tab.id}
                class={`${stylex.attrs(styles.centerTab, centerState().centerTab === tab.id && styles.activeTab).class ?? ""}${centerState().centerTab === tab.id ? " is-active" : ""}`}
                aria-selected={centerState().centerTab === tab.id}
              >{tab.label}</Button>
            ))}
          </nav>
          <main {...stylex.attrs(styles.centerContent)} id="editor-center-content" innerHTML={centerState().centerHtml} />
        </div>
      </section>
      <section
        {...stylex.attrs(styles.console, !consoleOpen() && styles.hidden)}
        id="editor-console"
        hidden={!consoleOpen()}
        ref={consoleDrawer}
        data-solid-state="console"
      >
        <header {...stylex.attrs(styles.consoleHeader)}>
          <strong>Console &amp; build output</strong>
          <Button as="button" variant="ghost" size="icon" tooltip="Close console" data-editor-action="close-console" aria-label="Close console">×</Button>
        </header>
        <div {...stylex.attrs(styles.consoleOutput)} id="editor-console-output" role="log" aria-live="polite" />
      </section>
    </>
  ), overlayRoot));

  return {
    body,
    sidebar,
    center,
    consoleDrawer,
    update(patch) {
      if (patch.mode !== undefined) setMode(patch.mode);
      if (patch.centerTab !== undefined || patch.centerOpen !== undefined || patch.centerHtml !== undefined) {
        setCenterState((current) => ({
          centerTab: patch.centerTab ?? current.centerTab,
          centerOpen: patch.centerOpen ?? current.centerOpen,
          centerHtml: patch.centerHtml ?? current.centerHtml,
        }));
      }
      if (patch.consoleOpen !== undefined) setConsoleOpen(patch.consoleOpen);
      if (patch.sidebarCollapsed !== undefined || patch.sidebarSize !== undefined) {
        setLayoutState((current) => ({
          sidebarCollapsed: patch.sidebarCollapsed ?? current.sidebarCollapsed,
          sidebarSize: patch.sidebarSize ?? current.sidebarSize,
        }));
        syncWorkbenchLayout();
      }
    },
    dispose() {
      for (const dispose of disposers.reverse()) dispose();
      modeRoot.remove();
      body.remove();
      overlayRoot.remove();
    },
  };
}

function EditorWorkbench(props: {
  resourceNav: HTMLElement;
  sidebarRef: (element: HTMLElement) => void;
  mainSlot: (element: HTMLDivElement) => void;
}) {
  const sidebar = <ProjectSidebar ref={props.sidebarRef} resourceNav={props.resourceNav} />;
  const main = <div {...stylex.attrs(styles.runtimeSlot)} ref={props.mainSlot} data-runtime-owner="engine" />;
  return <div {...stylex.attrs(styles.workbenchFrame)}><WorkbenchShell layout={{ sidebarSize: 280, inspectorCollapsed: true, bottomCollapsed: true }} sidebar={sidebar} main={main} /></div>;
}

function ModeNavigation(props: { mode: () => EditorMode }) {
  return (
    <nav {...stylex.attrs(styles.modeNav)} aria-label="Editor modes" data-solid-state="modes">
      {modes.map((mode) => (
        <Button
          variant="ghost"
          size="small"
          tooltip={`${mode.label} mode (${mode.shortcut})`}
          data-editor-mode={mode.id}
          class={`${stylex.attrs(styles.modeButton, props.mode() === mode.id && styles.activeMode).class ?? ""}${props.mode() === mode.id ? " is-active" : ""}`}
          aria-pressed={props.mode() === mode.id}
        >
          <span>{mode.label}</span><kbd {...stylex.attrs(styles.shortcut)}>{mode.shortcut}</kbd>
        </Button>
      ))}
    </nav>
  );
}

function ProjectSidebar(props: {
  ref: (element: HTMLElement) => void;
  resourceNav: HTMLElement;
}) {
  return (
    <aside {...stylex.attrs(styles.sidebar)} classList={{ "project-sidebar": true }} aria-label="Project browser" ref={props.ref} data-solid-state="project-browser">
      <header {...stylex.attrs(styles.projectHeader)} classList={{ "project-header": true }}>
        <div {...stylex.attrs(styles.headerIdentity)}><span {...stylex.attrs(styles.eyebrow)}>PROJECT</span><strong id="editor-project-name">Loading…</strong><small {...stylex.attrs(styles.projectState)} id="editor-project-state">Recovered locally</small></div>
        <Button variant="ghost" size="icon" tooltip="Collapse project browser" data-editor-action="toggle-sidebar" aria-label="Collapse project browser">☰</Button>
      </header>
      <div {...stylex.attrs(styles.quickActions)} classList={{ "project-quick-actions": true }}>
        <Button variant="secondary" size="small" tooltip="Create a new game" data-editor-action="new">New</Button>
        <Button variant="secondary" size="small" tooltip="Open a .hyperfocus project" data-editor-action="open">Open</Button>
        <Button variant="secondary" size="small" tooltip="Save portable project files (Ctrl/Cmd+S)" data-editor-action="save">Save</Button>
        <Button variant="ghost" size="small" tooltip="Undo (Ctrl/Cmd+Z)" data-editor-action="undo">↶</Button>
        <Button variant="ghost" size="small" tooltip="Redo (Ctrl/Cmd+Y)" data-editor-action="redo">↷</Button>
      </div>
      <SidebarSection label="Scenes" action="create-scene" actionLabel="Create scene"><div id="project-scenes" /></SidebarSection>
      <SidebarSection label="Entities" action="create-entity" actionLabel="Create entity"><div id="project-entities" /></SidebarSection>
      <SidebarSection label="Editors" action="fullscreen" actionLabel="Toggle viewport fullscreen" class="resource-section"><div id="resource-nav-slot">{props.resourceNav as never}</div></SidebarSection>
      <SidebarSection label="Assets" action="import-assets" actionLabel="Import assets" class="assets-section"><div id="project-assets" /><small {...stylex.attrs(styles.hint)} class="drop-hint">Drop files to import · packed into assets.hfp when saved</small></SidebarSection>
      <SidebarSection label="Components" action="settings" actionLabel="Project settings" class="inspector-section"><div id="project-selection-inspector" /></SidebarSection>
      <nav {...stylex.attrs(styles.footerActions)} classList={{ "sidebar-footer-actions": true }} aria-label="Project tools">
        <Button variant="ghost" size="small" tooltip="Open learning path" data-editor-action="learn">Learn</Button>
        <Button variant="ghost" size="small" tooltip="Open project settings" data-editor-action="settings">Settings</Button>
        <Button variant="ghost" size="small" tooltip="Build project" data-editor-action="build">Build</Button>
        <Button variant="ghost" size="small" tooltip="View project history" data-editor-action="history">History</Button>
      </nav>
    </aside>
  );
}

function SidebarSection(props: { label: string; action: string; actionLabel: string; class?: string; children: unknown }) {
  return (
    <section {...stylex.attrs(styles.sidebarSection)} classList={{ "project-section": true, [props.class ?? ""]: Boolean(props.class) }}>
      <header {...stylex.attrs(styles.sectionHeader)}>
        <span>{props.label}</span>
        <Button variant="ghost" size="icon" tooltip={props.actionLabel} data-editor-action={props.action} aria-label={props.actionLabel}>＋</Button>
      </header>
      {props.children as never}
    </section>
  );
}

const styles = stylex.create({
  bodyHost: { overflow: "hidden", height: "100%", minHeight: 0, minWidth: 0, },
  workbenchFrame: { overflow: "hidden", height: "100%", minHeight: 0, minWidth: 0, },
  runtimeSlot: { overflow: "hidden", height: "100%", minHeight: 0, minWidth: 0, },
  modeNav: { alignItems: "stretch", display: "flex", justifyContent: "center", height: "100%", minWidth: 0, },
  modeButton: { borderRadius: 0, gap: "0.65rem", position: "relative", minWidth: "7rem", },
  activeMode: { backgroundColor: "rgb(48 214 200 / 10%)", color: tokens.accent },
  shortcut: { color: tokens.muted, fontFamily: "ui-monospace, monospace", fontSize: "0.55rem" },
  sidebar: { overflow: "auto", backgroundColor: tokens.panel, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, },
  projectHeader: { paddingBlock: "0.55rem", paddingInline: "0.7rem", alignItems: "center", display: "flex", justifyContent: "space-between", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", minHeight: "3.9rem", },
  headerIdentity: { gap: "0.15rem", display: "grid", minWidth: 0, },
  eyebrow: { color: tokens.accent, fontFamily: "ui-monospace, monospace", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.12em" },
  projectState: { color: tokens.muted, fontSize: "0.6rem" },
  quickActions: { padding: "0.45rem", gap: "0.25rem", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  sidebarSection: { borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px" },
  sectionHeader: { alignItems: "center", backgroundColor: tokens.panelRaised, color: tokens.muted, display: "flex", fontSize: "0.6rem", fontWeight: 750, justifyContent: "space-between", letterSpacing: "0.08em", paddingInlineStart: "0.8rem", textTransform: "uppercase", minHeight: "2.2rem", },
  hint: { paddingBlock: "0.45rem", paddingInline: "0.7rem", color: tokens.muted, display: "block", fontSize: "0.55rem", },
  footerActions: { padding: "0.4rem", gap: "0.2rem", backgroundColor: tokens.panel, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", position: "sticky", borderTopColor: tokens.border, borderTopStyle: "solid", borderTopWidth: "1px", bottom: 0, marginTop: "auto", },
  center: { inset: 0, padding: "1.5rem", alignItems: "center", backdropFilter: "blur(10px)", backgroundColor: "rgb(3 7 11 / 78%)", display: "grid", justifyItems: "center", position: "fixed", zIndex: 20, },
  hidden: { display: "none" },
  centerDialog: { borderColor: tokens.accentStrong, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", overflow: "hidden", backgroundColor: tokens.panel, boxShadow: tokens.shadow, display: "grid", gridTemplateRows: "3.9rem 2.9rem minmax(0, 1fr)", height: "min(45rem, 92vh)", width: "min(61rem, 96vw)", },
  centerHeader: { paddingInline: "1.1rem", alignItems: "center", display: "flex", justifyContent: "space-between", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  centerTabs: { paddingInline: "0.8rem", alignItems: "stretch", display: "flex", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  centerTab: { borderRadius: 0, minWidth: "6.2rem" },
  activeTab: { color: tokens.accent },
  centerContent: { padding: "1.35rem", overflow: "auto", minHeight: 0, },
  console: { backgroundColor: tokens.background, boxShadow: tokens.shadow, position: "fixed", zIndex: 18, borderTopColor: tokens.accentStrong, borderTopStyle: "solid", borderTopWidth: "1px", bottom: "1.75rem", height: "11.9rem", left: "var(--project-sidebar-width)", right: 0, },
  consoleHeader: { paddingInline: "0.75rem", alignItems: "center", display: "flex", fontSize: "0.65rem", justifyContent: "space-between", textTransform: "uppercase", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", height: "2.2rem", },
  consoleOutput: { overflow: "auto", paddingBlock: "0.5rem", paddingInline: "0.75rem", color: tokens.muted, fontFamily: "ui-monospace, monospace", fontSize: "0.6rem", lineHeight: 1.7, height: "calc(100% - 2.2rem)", },
});
