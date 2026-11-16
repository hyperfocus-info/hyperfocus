import { DockMenuIcon } from './dock-icons';
import * as stylex from "@stylexjs/stylex";
import { createContext, createEffect, createMemo, createSignal, For, onCleanup, Show, useContext, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { ActionMenu, MenuItem } from "../primitives/action-menu";
import { Button } from "../primitives/button";
import { Input } from "../form/input";
import { Tooltip } from "../primitives/tooltip";
import { dockDropPosition } from "./dock-drop";
import { createPanelPointerResizeController } from "./panel-resize-interaction";
import {
  activateDockPanel,
  addDockPanel,
  closeDockPanel,
  dockPanelIsOpen,
  listDockPanelIds,
  listDockStacks,
  moveDockPanel,
  normalizeDockLayout,
  removeEmptyDock,
  reorderDockPanel,
  resizeDockSplit,
  showDockPanel,
  splitDockStack,
  toggleDockPanel,
  type DockDropPosition,
  type DockLayout,
  type DockNode,
  type DockSplitNode,
  type DockStackNode,
} from "./dock-layout";

export type DockPanelDescriptor = {
  id: string;
  label: string;
  content: JSX.Element;
  closeable?: boolean;
  icon?: JSX.Element;
  /** Host-owned contextual commands rendered before Close panel. */
  menuItems?: () => JSX.Element;
  onDuplicate?: () => void;
  /** Visibility follows the rendered dock, including narrow-screen selection. */
  onVisibilityChange?: (visible: boolean) => void;
  defaultPlacement?: {
    targetPanelId?: string;
    position?: DockDropPosition;
  };
};

export type DockLayoutPreset = {
  name: string;
  layout: DockLayout;
};

export type DockLayoutChangeReason =
  | "activate"
  | "add"
  | "close"
  | "move"
  | "resize"
  | "resize-commit"
  | "remove-empty"
  | "preset";

export type DockingWorkbenchApi = {
  layout(): DockLayout;
  panelOpen(panelId: string): boolean;
  showPanel(panelId: string): boolean;
  hidePanel(panelId: string): boolean;
  togglePanel(panelId: string): boolean;
  focusPanel(panelId?: string): void;
};

export type DockingWorkbenchProps = {
  panels: readonly DockPanelDescriptor[];
  layout: () => DockLayout;
  onLayoutChange: (layout: DockLayout, reason: DockLayoutChangeReason, subjectId: string) => void;
  presets?: () => readonly DockLayoutPreset[];
  onSavePreset?: (name: string, layout: DockLayout) => void;
  onApplyPreset?: (name: string) => void;
  apiRef?: (api: DockingWorkbenchApi) => void;
  ariaLabel: string;
  narrowBreakpoint?: number | false;
  showPresets?: boolean;
  activePanelId?: string;
  tabCloseButtons?: boolean;
  /** The host may resolve an already-open panel before changing its placement. */
  onAddPanel?: (stackId: string, panelId: string) => void;
};

const styles = stylex.create({
  root: {
    overflow: "hidden",
    backgroundColor: tokens.background,
    color: tokens.foreground,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
  },
  rootWithoutPresets: { gridTemplateRows: "minmax(0, 1fr)" },
  tabGroup: { alignItems: "stretch", backgroundColor: { default: "transparent", ':is([data-selected="true"])': tokens.selection, ":hover": tokens.selection }, display: "flex", flexShrink: 0, position: "relative", borderBottomColor: { default: "transparent", ':is([data-selected="true"])': tokens.accent }, borderBottomStyle: "solid", borderBottomWidth: 2, borderRightColor: tokens.border, borderRightStyle: "solid", borderRightWidth: 1, maxWidth: "100%", },
  tabTrigger: { flex: "1", minWidth: 0 },
  tabText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  tabClose: { alignSelf: "center", marginInlineEnd: tokens.space1 },
  tabIcon: { alignItems: "center", color: tokens.accentStrong, display: "inline-flex", flexShrink: 0, },
  tabInsert: { insetBlock: 0, backgroundColor: tokens.accent, pointerEvents: "none", position: "absolute", zIndex: 2, width: 2, },
  splitExplanation: { margin: 0, padding: tokens.space3, color: tokens.muted, fontSize: tokens.fontCaption, whiteSpace: "normal", maxWidth: "18rem", },
  menuSeparator: { borderColor: tokens.border, borderStyle: "solid", borderWidth: 0, marginBlock: tokens.space1, borderTopWidth: 1, width: "100%", },
  presetBar: {
    gap: tokens.space1,
    paddingBlock: tokens.space1,
    paddingInline: tokens.space2,
    alignItems: "center",
    backgroundColor: tokens.panel,
    display: "flex",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    minHeight: "2.5rem",
  },
  presetIdentity: {
    color: tokens.muted,
    fontFamily: tokens.fontMono,
    fontSize: tokens.fontCaption,
    marginInlineEnd: "auto",
  },
  presetForm: {
    gap: tokens.space1,
    alignItems: "center",
    display: "flex",
    maxWidth: "24rem",
    minWidth: 0,
  },
  tree: { overflow: "hidden", height: "100%", minHeight: 0, minWidth: 0 },
  split: { overflow: "hidden", display: "flex", height: "100%", minHeight: 0, minWidth: 0, width: "100%" },
  splitVertical: { flexDirection: "column" },
  splitChild: { overflow: "hidden", minHeight: 0, minWidth: 0 },
  separator: {
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` },
    backgroundColor: { default: tokens.background, ":hover": tokens.selection },
    cursor: "col-resize",
    flexBasis: '0.55rem',
    flexGrow: '0',
    flexShrink: '0',
    position: "relative",
    touchAction: "none",
    zIndex: 7,
  },
  separatorVertical: { cursor: "row-resize" },
  separatorLine: { insetBlock: 0, backgroundColor: tokens.border, insetInlineStart: "calc(50% - 0.5px)", position: "absolute", width: "1px", },
  separatorLineVertical: { insetInline: 0, insetBlockStart: "calc(50% - 0.5px)", height: "1px", width: "auto", },
  stack: {
    borderColor: tokens.border,
    borderStyle: "solid",
    borderWidth: "1px",
    overflow: "hidden",
    backgroundColor: tokens.panel,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    position: "relative",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
  },
  emptyStack: { gridTemplateRows: "2.5rem" },
  stackHeader: {
    gap: tokens.space1,
    alignItems: "stretch",
    backgroundColor: tokens.panel,
    display: "flex",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    minWidth: 0,
  },
  tabList: { alignItems: "stretch",
 display: "flex",
 flexBasis: 'auto',
 flexGrow: '1',
 flexShrink: '1',
 minWidth: 0,
 overflowX: "auto",
 overflowY: "hidden", },
  tab: {
    gap: tokens.space2,
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` },
    paddingInline: tokens.space3,
    alignItems: "center",
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": tokens.selection },
    color: { default: tokens.muted, ':is([aria-selected="true"])': tokens.foreground },
    cursor: "pointer",
    display: "inline-flex",
    flexBasis: 'auto',
    flexGrow: '0',
    flexShrink: '1',
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontCaption,
    fontWeight: { default: 400, ':is([aria-selected="true"])': 600 },
    whiteSpace: "nowrap",
    borderBottomColor: { default: "transparent", ':is([aria-selected="true"])': tokens.accent },
    borderBottomStyle: "solid",
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightColor: tokens.border,
    borderRightStyle: "solid",
    borderRightWidth: 0,
    borderTopWidth: 0,
    minHeight: "2.5rem",
    minWidth: 0,
    width: "100%",
  },
  emptyLabel: { paddingInline: tokens.space2,
 alignItems: "center",
 color: tokens.muted,
 display: "flex",
 flexBasis: 'auto',
 flexGrow: '1',
 flexShrink: '1',
 fontSize: tokens.fontCaption, },
  stackActions: { gap: tokens.space1,
 paddingInline: tokens.space1,
 alignItems: "center",
 display: "flex",
 flexBasis: 'auto',
 flexGrow: '0',
 flexShrink: '0', },
  panel: { overflow: "auto", height: "100%", minHeight: 0, minWidth: 0, width: "100%" },
  emptyPanel: { padding: tokens.space4, placeItems: "center", color: tokens.muted, display: "grid", fontSize: tokens.fontCaption, textAlign: "center", },
  dropOverlay: { overflow: "hidden", pointerEvents: "none", position: "absolute", zIndex: 12, },
  dropPreview: { borderColor: tokens.accent, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: 2, placeItems: "center", backgroundColor: tokens.selection, display: "grid", position: "absolute", transitionDuration: tokens.motionFast, transitionProperty: "left, top, width, height", transitionTimingFunction: "ease-out", },
  dropLabel: { padding: tokens.space2, borderRadius: tokens.radiusSmall, backgroundColor: tokens.overlay, boxShadow: tokens.shadow, color: tokens.foreground, fontFamily: tokens.fontUi, fontSize: tokens.fontCaption, },

});

function validatePanels(panels: readonly DockPanelDescriptor[]) {
  if (panels.length === 0) throw new Error("DockingWorkbench requires at least one panel");
  const ids = new Set<string>();
  for (const panel of panels) {
    if (!panel.id.trim() || !panel.label.trim()) throw new Error("Dock panels require stable ids and labels");
    if (ids.has(panel.id)) throw new Error(`Dock panel id "${panel.id}" is duplicated`);
    ids.add(panel.id);
  }
}

function createDockWorkbench(props: DockingWorkbenchProps) {
  const panelIds = createMemo(() => { validatePanels(props.panels); return props.panels.map(panel => panel.id); });
  const panelsById = createMemo(() => new Map(props.panels.map((panel) => [panel.id, panel])));
  const panel = (id: string) => {
    const value = panelsById().get(id);
    if (!value) throw new Error(`DockingWorkbench is missing panel "${id}"`);
    return value;
  };
  const [storedLayout, setLayout] = createSignal(props.layout(), { equals: false });
  const layout = createMemo(() => normalizeDockLayout(storedLayout(), panelIds()));
  const [draggingPanelId, setDraggingPanelId] = createSignal<string>();
  const [narrow, setNarrow] = createSignal(false);
  const [narrowPanelId, setNarrowPanelId] = createSignal<string>();
  const [savingPreset, setSavingPreset] = createSignal(false);
  const [focusPanelId, setFocusPanelId] = createSignal<string>();
  let resizeObserver: ResizeObserver | undefined;
  const updateLayout = (next: DockLayout) => {
    setLayout(normalizeDockLayout(next, panelIds()));
  };
  createEffect(() => updateLayout(props.layout()));

  const emit = (next: DockLayout, reason: DockLayoutChangeReason, subjectId: string) => {
    const normalized = normalizeDockLayout(next, panelIds());
    setLayout(normalized);
    props.onLayoutChange(normalized, reason, subjectId);
  };
  const defaultPlacement = (panelId: string) => panel(panelId).defaultPlacement ?? {};
  const showPanel = (panelId: string) => {
    if (!panelIds().includes(panelId)) return false;
    emit(showDockPanel(layout(), panelId, defaultPlacement(panelId)), "add", panelId);
    setNarrowPanelId(panelId);
    return true;
  };
  const hidePanel = (panelId: string) => {
    if (!dockPanelIsOpen(layout(), panelId) || panel(panelId).closeable === false) return false;
    emit(closeDockPanel(layout(), panelId), "close", panelId);
    return false;
  };
  const togglePanelVisibility = (panelId: string) => {
    const open = dockPanelIsOpen(layout(), panelId);
    if (open && panel(panelId).closeable === false) return true;
    emit(toggleDockPanel(layout(), panelId, defaultPlacement(panelId)), open ? "close" : "add", panelId);
    return !open;
  };
  const api: DockingWorkbenchApi = {
    layout,
    panelOpen: (panelId) => dockPanelIsOpen(layout(), panelId),
    showPanel,
    hidePanel,
    togglePanel: togglePanelVisibility,
    focusPanel: setFocusPanelId,
  };
  props.apiRef?.(api);

  const connectRoot = (element: HTMLDivElement) => {
    resizeObserver?.disconnect();
    const breakpoint = props.narrowBreakpoint === false ? undefined : props.narrowBreakpoint ?? 760;
    const updateNarrow = (width: number) => { if (breakpoint !== undefined && width > 0) setNarrow(width < breakpoint); };
    updateNarrow(element.getBoundingClientRect().width);
    if (breakpoint === undefined || typeof ResizeObserver === "undefined") return;
    resizeObserver = new ResizeObserver((entries) => updateNarrow(entries[0]?.contentRect.width ?? 0));
    resizeObserver.observe(element);
  };
  onCleanup(() => resizeObserver?.disconnect());

  const activatePanel = (panelId: string) => {
    const stack = listDockStacks(layout()).find((candidate) => candidate.panelIds.includes(panelId));
    if (!stack) return;
    setNarrowPanelId(panelId);
    emit(activateDockPanel(layout(), stack.id, panelId), "activate", panelId);
  };
  const narrowStack = createMemo<DockStackNode>(() => {
    const open = listDockPanelIds(layout());
    const active = props.activePanelId ?? narrowPanelId();
    const activePanelId = active && open.includes(active) ? active : open.includes("workspace") ? "workspace" : open[0];
    const target = listDockStacks(layout()).find((stack) => activePanelId && stack.panelIds.includes(activePanelId))
      ?? listDockStacks(layout())[0];
    return { kind: "stack", id: target?.id ?? "dock-root", panelIds: open, activePanelId };
  });
  const focusedStack = createMemo<DockStackNode | undefined>(() => {
    const panelId = focusPanelId();
    return panelId && dockPanelIsOpen(layout(), panelId)
      ? { kind: "stack", id: "dock-focus", panelIds: [panelId], activePanelId: panelId }
      : undefined;
  });

  return {
    get panels() { return props.panels; },
    panel, layout, draggingPanelId, setDraggingPanelId, emit,
    onActivate: activatePanel, onClose: hidePanel,
    onAdd: (stackId: string, panelId: string) => { if (props.onAddPanel) { props.onAddPanel(stackId, panelId); return; } emit(addDockPanel(layout(), stackId, panelId), "add", panelId); setNarrowPanelId(panelId); },
    onMove: (panelId: string, stackId: string, position: DockDropPosition) => emit(moveDockPanel(layout(), panelId, stackId, position), "move", panelId),
    onReorder: (panelId: string, stackId: string, before: string) => emit(reorderDockPanel(layout(), panelId, stackId, before), "move", panelId),
    onSplit: (stackId: string, panelId: string, position: Exclude<DockDropPosition, "center">) => emit(splitDockStack(layout(), stackId, panelId, position), "move", panelId),
    onRemoveEmpty: (stackId: string) => emit(removeEmptyDock(layout(), stackId), "remove-empty", stackId),
    narrow, focusedStack, narrowStack, connectRoot, savingPreset, setSavingPreset,
    focusPanelId, showPanel, get tabCloseButtons() { return props.tabCloseButtons; },
  };
}

const DockWorkbenchContext = createContext<ReturnType<typeof createDockWorkbench>>();

function useDockWorkbench() {
  const state = useContext(DockWorkbenchContext);
  if (!state) throw new Error("Dock views require their owning DockingWorkbench");
  return state;
}

export function DockingWorkbench(props: DockingWorkbenchProps) {
  const state = createDockWorkbench(props);
  const { layout, narrow, focusedStack, narrowStack, connectRoot, savingPreset, setSavingPreset, focusPanelId } = state;
  let presetInput: HTMLInputElement | undefined;
  return (
    <DockWorkbenchContext.Provider value={state}>
    <div ref={connectRoot} {...stylex.attrs(styles.root, props.showPresets === false && styles.rootWithoutPresets)} role="group" aria-label={props.ariaLabel} data-docking-workbench="" data-narrow={String(narrow())}>
      <Show when={props.showPresets !== false}>
      <div {...stylex.attrs(styles.presetBar)} data-dock-preset-bar="" hidden={Boolean(focusPanelId())}>
        <span {...stylex.attrs(styles.presetIdentity)}>LAYOUT</span>
        <Show when={!savingPreset()} fallback={
          <form
            {...stylex.attrs(styles.presetForm)}
            onSubmit={(event) => {
              event.preventDefault();
              const name = presetInput?.value.trim() ?? "";
              if (!name) { presetInput?.focus(); return; }
              props.onSavePreset?.(name, layout());
              setSavingPreset(false);
            }}
          >
            <Input ref={presetInput} size="small" aria-label="Layout preset name" placeholder="Preset name" maxlength={48} />
            <Button type="submit" variant="primary" size="small" tooltip="Save the current dock layout as a global user preset">Save</Button>
            <Button variant="ghost" size="icon" tooltip="Cancel saving layout preset" onClick={() => setSavingPreset(false)}>×</Button>
          </form>
        }>
          <ActionMenu
            ariaLabel="Apply layout preset"
            trigger={({ toggle, open, menuId }) => <Button variant="ghost" size="icon" tooltip="Apply a saved layout preset" aria-label="Apply layout preset" aria-expanded={open()} aria-controls={menuId} onClick={toggle}>▦</Button>}
          >
            <For each={props.presets?.() ?? []} fallback={<MenuItem disabled onSelect={() => undefined}>No saved presets</MenuItem>}>
              {(preset) => <MenuItem onSelect={() => props.onApplyPreset?.(preset.name)}>{preset.name}</MenuItem>}
            </For>
          </ActionMenu>
          <Button variant="ghost" size="icon" tooltip="Save current layout as a global user preset" aria-label="Save current layout as a global user preset" data-dock-save-preset="" onClick={() => { setSavingPreset(true); queueMicrotask(() => presetInput?.focus()); }}>＋</Button>
        </Show>
      </div>
      </Show>
      <div {...stylex.attrs(styles.tree)}>
        <Show when={focusedStack()} fallback={
          <Show when={!narrow()} fallback={<DockStackView stack={narrowStack} narrow />}>
            <DockNodeView node={() => layout().root} />
          </Show>
        }>
          {(stack) => <DockStackView stack={stack} focused />}
        </Show>
      </div>
    </div>
    </DockWorkbenchContext.Provider>
  );
}

function DockNodeView(props: { node: () => DockNode }) {
  const split = createMemo(() => { const node = props.node(); return node.kind === "split" ? node : undefined; });
  const stack = createMemo(() => { const node = props.node(); return node.kind === "stack" ? node : undefined; });
  return <Show when={split()} fallback={
    <Show when={stack()}>{(value) =>
    <DockStackView stack={value} />}</Show>
  }>{(value) => <DockSplitView split={value} />}</Show>;
}

function DockSplitView(props: { split: () => DockSplitNode }) {
  const state = useDockWorkbench();
  let root: HTMLDivElement | undefined;
  const resizeController = createPanelPointerResizeController();
  onCleanup(() => resizeController.dispose());
  const vertical = () => props.split().axis === "vertical";
  const childFlex = (node: DockNode, ratio: number) => node.kind === "stack" && node.panelIds.length === 0
    ? "0 0 2.6rem"
    : `1 1 ${ratio * 100}%`;
  const resize = (ratio: number, reason: "resize" | "resize-commit") => state.emit(resizeDockSplit(state.layout(), props.split().id, ratio), reason, props.split().id);
  const startResize: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    const rect = root?.getBoundingClientRect();
    const total = vertical() ? rect?.height ?? 0 : rect?.width ?? 0;
    if (total <= 0) return;
    resizeController.start({
      event,
      target: event.currentTarget,
      axis: vertical() ? "vertical" : "horizontal",
      edge: "end",
      startSize: props.split().ratio * total,
      onResize: (size) => resize(size / total, "resize"),
      onCommit: () => resize(props.split().ratio, "resize-commit"),
      onCancel: () => resize(props.split().ratio, "resize-commit"),
    });
  };
  const onKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    const forward = vertical() ? event.key === "ArrowDown" : event.key === "ArrowRight";
    const backward = vertical() ? event.key === "ArrowUp" : event.key === "ArrowLeft";
    const next = event.key === "Home" ? 0.15
      : event.key === "End" ? 0.85
      : event.key === "Enter" ? 0.5
      : forward ? props.split().ratio + (event.shiftKey ? 0.1 : 0.04)
      : backward ? props.split().ratio - (event.shiftKey ? 0.1 : 0.04)
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    resize(next, "resize-commit");
  };
  return <div ref={root} {...stylex.attrs(styles.split, vertical() && styles.splitVertical)} data-dock-split={props.split().id} data-axis={props.split().axis}>
    <div {...stylex.attrs(styles.splitChild)} style={{ flex: childFlex(props.split().first, props.split().ratio) }}><DockNodeView node={() => props.split().first} /></div>
    <div
      {...stylex.attrs(styles.separator, vertical() && styles.separatorVertical)}
      role="separator"
      tabIndex={0}
      aria-label={`Resize dock split. Use ${vertical() ? "Up and Down" : "Left and Right"} arrows; Enter resets.`}
      aria-orientation={vertical() ? "horizontal" : "vertical"}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(props.split().ratio * 100)}
      onPointerDown={startResize}
      onLostPointerCapture={(event) => resizeController.lostPointerCapture(event.pointerId)}
      onKeyDown={onKeyDown}
      onDblClick={() => resize(0.5, "resize-commit")}
      data-dock-separator={props.split().id}
    ><span {...stylex.attrs(styles.separatorLine, vertical() && styles.separatorLineVertical)} /></div>
    <div {...stylex.attrs(styles.splitChild)} style={{ flex: childFlex(props.split().second, 1 - props.split().ratio) }}><DockNodeView node={() => props.split().second} /></div>
  </div>;
}

type DockStackViewProps = {
  stack: () => DockStackNode;
  narrow?: boolean;
  focused?: boolean;
};

function DockStackView(props: DockStackViewProps) {
  const state = useDockWorkbench();
  const stackPanelIds = createMemo(() => new Set(props.stack().panelIds));
  const [tabList, setTabList] = createSignal<HTMLDivElement>();
  const [dropPosition, setDropPosition] = createSignal<DockDropPosition>();
  const [headerHeight, setHeaderHeight] = createSignal(40);
  const [insertion, setInsertion] = createSignal<{ id: string; after: boolean }>();
  createEffect(() => { if (!state.draggingPanelId()) { setDropPosition(undefined); setInsertion(undefined); } });
  const canSplit = () => props.stack().panelIds.length > 1;
  const splitReason = () => props.narrow ? 'Widen this workspace to split. You can switch tabs here.' : !canSplit() ? 'Open another tab in this dock, then split it into a new panel.' : undefined;
  const updateDrop: JSX.EventHandler<HTMLElement, DragEvent> = event => {
    const source = state.draggingPanelId();
    if (!source || props.narrow || props.focused) return;
    if (event.target instanceof Element && event.target.closest("header")) { setDropPosition(undefined); return; }
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const header = event.currentTarget.querySelector("header")?.getBoundingClientRect().height ?? 40;
    setHeaderHeight(header);
    const position = dockDropPosition(event.clientX - bounds.left, event.clientY - bounds.top - header, bounds.width, bounds.height - header);
    const noEffect = props.stack().panelIds.length === 1 && props.stack().panelIds[0] === source;
    setDropPosition(noEffect ? undefined : position);
    if (event.dataTransfer) event.dataTransfer.dropEffect = noEffect ? "none" : "move";
  };
  const activePanelId = () => props.stack().activePanelId ?? props.stack().panelIds[0];
  const activePanel = () => activePanelId() ? state.panel(activePanelId()!) : undefined;
  const availablePanels = () => state.panels.filter((panel) => !stackPanelIds().has(panel.id));
  createEffect(() => {
    activePanelId();
    const list = tabList();
    if (!list) return;
    const reveal = () => {
      const selected = list.querySelector('[aria-selected="true"]');
      if (!selected) return;
      const bounds = list.getBoundingClientRect(), tab = selected.getBoundingClientRect();
      if (tab.left < bounds.left) list.scrollLeft -= bounds.left - tab.left;
      else if (tab.right > bounds.right) list.scrollLeft += tab.right - bounds.right;
    };
    const frame = requestAnimationFrame(reveal);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(reveal) : undefined;
    observer?.observe(list);
    onCleanup(() => { cancelAnimationFrame(frame); observer?.disconnect(); });
  });
  const moveTabFocus: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute("role") !== "tab") return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = tabs.indexOf(event.target);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    const panelId = tabs[nextIndex]?.dataset.dockTab;
    if (panelId) state.onActivate(panelId);
  };
  const drop = (position: DockDropPosition, event: DragEvent) => {
    event.preventDefault();
    const panelId = state.draggingPanelId() ?? event.dataTransfer?.getData("application/x-hyperfocus-dock-panel");
    if (panelId) state.onMove(panelId, props.stack().id, position);
    state.setDraggingPanelId(undefined);
  };
  return <section
    {...stylex.attrs(styles.stack, props.stack().panelIds.length === 0 && styles.emptyStack)}
    aria-label={`${activePanel()?.label ?? "Empty"} dock`}
    data-dock-stack={props.stack().id}
    data-empty={String(props.stack().panelIds.length === 0)}
    onDragOver={updateDrop}
    onDragEnter={updateDrop}
    onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) { setDropPosition(undefined); setInsertion(undefined); } }}
    onDrop={event => { const position = dropPosition(); if (position) drop(position, event); }}
  >
    <header {...stylex.attrs(styles.stackHeader)}>
      <Show when={props.stack().panelIds.length > 0} fallback={<span {...stylex.attrs(styles.emptyLabel)}>Empty dock</span>}>
        <div ref={setTabList} {...stylex.attrs(styles.tabList)} role="tablist" aria-label="Dock panels" onKeyDown={moveTabFocus}>
          <For each={props.stack().panelIds}>{(panelId) => {
            const panel = () => state.panel(panelId);
            return <div {...stylex.attrs(styles.tabGroup)} data-hf-reveal-group data-dock-tab-cell={panelId} data-selected={String(activePanelId() === panelId)}
              onDragOver={event => {
                if (!state.draggingPanelId()) return;
                event.preventDefault(); event.stopPropagation(); setDropPosition(undefined);
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientX > rect.left + rect.width / 2;
                if (insertion()?.id !== panelId || insertion()?.after !== after) setInsertion({ id: panelId, after });
              }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setInsertion(undefined); }}
              onDrop={event => {
                const source = state.draggingPanelId(); if (!source) return;
                event.preventDefault(); event.stopPropagation();
                const next = insertion()?.after ? props.stack().panelIds[props.stack().panelIds.indexOf(panelId) + 1] ?? "" : panelId;
                state.onReorder(source, props.stack().id, next); state.setDraggingPanelId(undefined);
              }}><Tooltip content={panel().label} class={stylex.attrs(styles.tabTrigger).class}><button
              {...stylex.attrs(styles.tab)}
              type="button"
              role="tab"
              tabIndex={activePanelId() === panelId ? 0 : -1}
              aria-selected={activePanelId() === panelId}
              aria-controls={`dock-panel-${encodeURIComponent(panelId)}`}
              draggable={!props.narrow && !props.focused}
              data-dock-tab={panelId}
              onClick={() => state.onActivate(panelId)}
              onDragStart={(event) => {
                state.setDraggingPanelId(panelId);
                event.dataTransfer?.setData("application/x-hyperfocus-dock-panel", panelId);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => state.setDraggingPanelId(undefined)}
            ><Show when={panel().icon}><span {...stylex.attrs(styles.tabIcon)}>{panel().icon}</span></Show><span {...stylex.attrs(styles.tabText)}>{panel().label}</span></button></Tooltip><Show when={state.tabCloseButtons && panel().closeable !== false}><Button data-hf-contextual-action class={stylex.attrs(styles.tabClose).class} variant="ghost" size="icon" tooltip={`Close ${panel().label}`} aria-label={`Close ${panel().label}`} onClick={() => state.onClose(panelId)}>×</Button></Show><Show when={state.draggingPanelId() && insertion()?.id === panelId && state.draggingPanelId() !== panelId}><span {...stylex.attrs(styles.tabInsert)} style={insertion()?.after ? { right: 0 } : { left: 0 }} data-dock-insertion=""/></Show></div>;
          }}</For>
        </div>
      </Show>
      <Show when={!props.focused}>
        <div {...stylex.attrs(styles.stackActions)}>
          <ActionMenu
            ariaLabel={`Add panel to ${activePanel()?.label ?? "empty dock"}`}
            trigger={({ toggle, open, menuId }) => <Button variant="ghost" size="icon" tooltip="Add or move a panel into this dock" aria-label="Add panel" aria-expanded={open()} aria-controls={menuId} onClick={toggle}>＋</Button>}
          >
            <For each={availablePanels()} fallback={<MenuItem disabled onSelect={() => undefined}>All panels are in this dock</MenuItem>}>
              {(panel) => <MenuItem icon={panel.icon} onSelect={() => state.onAdd(props.stack().id, panel.id)}>{dockPanelIsOpen(state.layout(), panel.id) ? `Move ${panel.label} here` : `Add ${panel.label}`}</MenuItem>}
            </For>
          </ActionMenu>
          <Show when={activePanel()}>{(panel) => <ActionMenu
            ariaLabel={`${panel().label} dock options`}
            trigger={({ toggle, open, menuId }) => <Button variant="ghost" size="icon" tooltip={`${panel().label} dock options`} aria-label={`${panel().label} dock options`} data-dock-panel-options={panel().id} aria-expanded={open()} aria-controls={menuId} onClick={toggle}>⋯</Button>}
          >
            {panel().menuItems?.()}
            <MenuItem icon={<DockMenuIcon kind="close"/>} disabled={panel().closeable === false} onSelect={() => state.onClose(panel().id)}>Close panel</MenuItem>
            <hr role="separator" {...stylex.attrs(styles.menuSeparator)}/>
            <Show when={splitReason()}><p role="note" {...stylex.attrs(styles.splitExplanation)}>{splitReason()}</p></Show>
            <MenuItem icon={<DockMenuIcon kind="left"/>} disabled={props.narrow || !canSplit()} onSelect={() => state.onSplit(props.stack().id, panel().id, "left")}>Split left</MenuItem>
            <MenuItem icon={<DockMenuIcon kind="right"/>} disabled={props.narrow || !canSplit()} onSelect={() => state.onSplit(props.stack().id, panel().id, "right")}>Split right</MenuItem>
            <MenuItem icon={<DockMenuIcon kind="top"/>} disabled={props.narrow || !canSplit()} onSelect={() => state.onSplit(props.stack().id, panel().id, "top")}>Split above</MenuItem>
            <MenuItem icon={<DockMenuIcon kind="bottom"/>} disabled={props.narrow || !canSplit()} onSelect={() => state.onSplit(props.stack().id, panel().id, "bottom")}>Split below</MenuItem>
            <Show when={panel().onDuplicate}><hr role="separator" {...stylex.attrs(styles.menuSeparator)}/><MenuItem icon={panel().icon} onSelect={() => panel().onDuplicate?.()}>Duplicate view</MenuItem></Show>
          </ActionMenu>}</Show>
          <Show when={props.stack().panelIds.length === 0}><Button variant="ghost" size="icon" tooltip="Remove empty dock" aria-label="Remove empty dock" onClick={() => state.onRemoveEmpty(props.stack().id)}>×</Button></Show>
        </div>
      </Show>
    </header>
    <Show when={props.stack().panelIds.length > 0} fallback={<div {...stylex.attrs(styles.emptyPanel)}>Use ＋ to add a panel here.</div>}>
      <For each={props.stack().panelIds}>{(panelId) => {
        createEffect(() => state.panel(panelId).onVisibilityChange?.(activePanelId() === panelId));
        const descriptor = state.panel(panelId);
        onCleanup(() => descriptor.onVisibilityChange?.(false));
        return <div
        id={`dock-panel-${encodeURIComponent(panelId)}`}
        {...stylex.attrs(styles.panel)}
        role="tabpanel"
        aria-label={state.panel(panelId).label}
        hidden={activePanelId() !== panelId}
        data-dock-panel={panelId}
      >{state.panel(panelId).content}</div>;
      }}</For>
    </Show>
    <Show when={state.draggingPanelId() && dropPosition()}>
      <div {...stylex.attrs(styles.dropOverlay)} style={{ top: `${headerHeight()}px`, left: 0, right: 0, bottom: 0 }} aria-hidden="true" data-dock-drop-overlay="">
        <div {...stylex.attrs(styles.dropPreview)} data-dock-drop-position={dropPosition()} style={{ left: dropPosition() === "right" ? "50%" : "0", top: dropPosition() === "bottom" ? "50%" : "0", width: dropPosition() === "left" || dropPosition() === "right" ? "50%" : "100%", height: dropPosition() === "top" || dropPosition() === "bottom" ? "50%" : "100%" }}>
          <span {...stylex.attrs(styles.dropLabel)}>{dropPosition() === "center" ? "Move to this group" : `Split ${dropPosition() === "top" ? "above" : dropPosition() === "bottom" ? "below" : dropPosition()}`}</span>
        </div>
      </div>
    </Show>
  </section>;
}
