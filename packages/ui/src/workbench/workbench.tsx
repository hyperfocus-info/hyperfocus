import * as stylex from "@stylexjs/stylex";
import { createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import {
  normalizeWorkbenchLayout,
  resetWorkbenchPanel,
  resizeWorkbenchPanel,
  toggleWorkbenchPanel,
  workbenchPanelLimits,
  type WorkbenchLayout,
  type WorkbenchPanelId,
} from "./layout";
import { createPanelPointerResizeController, resolvePanelSeparatorKey, type PanelResizeEdge } from "./panel-resize-interaction";

export type WorkbenchLayoutChangeReason = "resize" | "resize-commit" | "reset" | "toggle";

export type WorkbenchShellProps = {
  layout: () => Partial<WorkbenchLayout>;
  activityBar?: JSX.Element;
  sidebar?: JSX.Element;
  main: JSX.Element;
  inspector?: JSX.Element;
  bottomPanel?: JSX.Element;
  statusBar?: JSX.Element;
  panelLabels?: Partial<Record<WorkbenchPanelId, string>>;
  onLayoutChange?: (layout: WorkbenchLayout, reason: WorkbenchLayoutChangeReason, panel: WorkbenchPanelId) => void;
  apiRef?: (api: WorkbenchShellApi) => void;
};

export type WorkbenchShellApi = {
  layout(): WorkbenchLayout;
  updateLayout(layout: Partial<WorkbenchLayout>): void;
};

const styles = stylex.create({
  root: { overflow: "hidden", backgroundColor: tokens.background, color: tokens.foreground, display: "grid", position: "relative", height: "100%", minHeight: 0, minWidth: 0, width: "100%", },
  activity: { borderColor: tokens.border, borderStyle: "solid", overflow: "hidden", borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: "1px", borderTopWidth: 0, minHeight: 0 },
  sidebar: { overflow: "auto", minHeight: 0, minWidth: 0 },
  main: { overflow: "hidden", minHeight: 0, minWidth: 0 },
  inspector: { overflow: "auto", minHeight: 0, minWidth: 0 },
  bottom: { overflow: "auto", minHeight: 0, minWidth: 0 },
  status: { paddingInline: "0.6rem", alignItems: "center", backgroundColor: tokens.panelRaised, display: "flex", fontSize: "0.68rem", minWidth: 0 },
  handleCell: { backgroundColor: tokens.background, position: "relative", zIndex: 4, minHeight: 0, minWidth: 0, },
  horizontalHandleCell: { minHeight: 0, minWidth: 0 },
  collapsedHandleCell: { backgroundColor: tokens.panel },
  handle: {
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` },
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.selection },
    color: tokens.muted,
    cursor: "col-resize",
    display: "flex",
    justifyContent: "center",
    outlineOffset: "-2px",
    position: "relative",
    touchAction: "none",
    height: "100%",
    width: "100%",
  },
  horizontalHandle: { cursor: "row-resize" },
  collapsedHandle: { color: tokens.accent, cursor: "pointer" },
  grip: { fontFamily: tokens.fontMono, fontSize: "0.8rem", fontWeight: 800, pointerEvents: "none" },
});

export function WorkbenchShell(props: WorkbenchShellProps) {
  let currentLayout = normalizeWorkbenchLayout(props.layout());
  const resizeController = createPanelPointerResizeController();
  const [layoutRevision, setLayoutRevision] = createSignal(0);
  const layout = () => { layoutRevision(); return currentLayout; };
  const interactive = () => Boolean(props.onLayoutChange);
  const hasSidebar = () => Boolean(props.sidebar);
  const hasInspector = () => Boolean(props.inspector);
  const hasBottom = () => Boolean(props.bottomPanel);
  const activityOffset = () => props.activityBar ? 1 : 0;
  const sidebarColumn = () => 1 + activityOffset();
  const sidebarHandleColumn = () => 2 + activityOffset();
  const mainColumn = () => 3 + activityOffset();
  const inspectorHandleColumn = () => 4 + activityOffset();
  const inspectorColumn = () => 5 + activityOffset();
  const handleSize = (panel: WorkbenchPanelId, available: boolean) => !available || !interactive() ? 0 : layout()[`${panel}Collapsed`] ? 24 : 10;
  const columns = () => `${props.activityBar ? "3rem " : ""}${hasSidebar() && !layout().sidebarCollapsed ? `${layout().sidebarSize}px` : "0px"} ${handleSize("sidebar", hasSidebar())}px minmax(18rem,1fr) ${handleSize("inspector", hasInspector())}px ${hasInspector() && !layout().inspectorCollapsed ? `${layout().inspectorSize}px` : "0px"}`;
  const rows = () => `minmax(12rem,1fr) ${handleSize("bottom", hasBottom())}px ${hasBottom() && !layout().bottomCollapsed ? `${layout().bottomSize}px` : "0px"} ${props.statusBar ? "1.6rem" : "0px"}`;
  let rootElement: HTMLElement | undefined;
  let sidebarElement: HTMLElement | undefined;
  let inspectorElement: HTMLElement | undefined;
  let bottomElement: HTMLElement | undefined;

  const applyLayoutToDom = () => {
    if (rootElement) {
      rootElement.style.gridTemplateColumns = columns();
      rootElement.style.gridTemplateRows = rows();
      for (const panel of ["sidebar", "inspector", "bottom"] as const) {
        const handleElement = rootElement.querySelector<HTMLElement>(`[data-workbench-handle="${panel}"]`);
        if (!handleElement) continue;
        const collapsed = currentLayout[`${panel}Collapsed`];
        handleElement.dataset.collapsed = String(collapsed);
        handleElement.setAttribute("aria-valuenow", String(collapsed ? 0 : currentLayout[`${panel}Size`]));
      }
    }
    if (sidebarElement) {
      sidebarElement.hidden = currentLayout.sidebarCollapsed;
      sidebarElement.setAttribute("aria-hidden", String(currentLayout.sidebarCollapsed));
    }
    if (inspectorElement) {
      inspectorElement.hidden = currentLayout.inspectorCollapsed;
      inspectorElement.setAttribute("aria-hidden", String(currentLayout.inspectorCollapsed));
    }
    if (bottomElement) {
      bottomElement.hidden = currentLayout.bottomCollapsed;
      bottomElement.setAttribute("aria-hidden", String(currentLayout.bottomCollapsed));
    }
  };
  const updateLayout = (next: Partial<WorkbenchLayout>) => {
    currentLayout = normalizeWorkbenchLayout(next);
    setLayoutRevision((revision) => revision + 1);
    applyLayoutToDom();
  };
  createEffect(() => updateLayout(props.layout()));
  props.apiRef?.({ layout: () => currentLayout, updateLayout });

  const emit = (next: WorkbenchLayout, reason: WorkbenchLayoutChangeReason, panel: WorkbenchPanelId) => {
    updateLayout(next);
    props.onLayoutChange?.(next, reason, panel);
  };
  const panelAxis = (panel: WorkbenchPanelId) => panel === "bottom" ? "vertical" as const : "horizontal" as const;
  const panelEdge = (panel: WorkbenchPanelId): PanelResizeEdge => panel === "sidebar" ? "end" : "start";
  const startResize = (panel: WorkbenchPanelId, event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!interactive() || layout()[`${panel}Collapsed`]) return;
    resizeController.start({
      event,
      target: event.currentTarget,
      axis: panelAxis(panel),
      edge: panelEdge(panel),
      startSize: layout()[`${panel}Size`],
      onResize: (size) => emit(resizeWorkbenchPanel(layout(), panel, size), "resize", panel),
      onCommit: () => emit(layout(), "resize-commit", panel),
      // WorkbenchShell historically committed the last pointer value on cancel.
      onCancel: () => emit(layout(), "resize-commit", panel),
    });
  };
  const onHandleKeyDown = (panel: WorkbenchPanelId, event: KeyboardEvent) => {
    if (!interactive()) return;
    const limits = workbenchPanelLimits[panel];
    const action = resolvePanelSeparatorKey({
      key: event.key,
      shiftKey: event.shiftKey,
      axis: panelAxis(panel),
      edge: panelEdge(panel),
      currentSize: layout()[`${panel}Size`],
      minimumSize: limits.minimum,
      maximumSize: limits.maximum,
      collapsible: true,
    });
    if (!action) return;
    event.preventDefault();
    if (action.kind === "toggle") {
      emit(toggleWorkbenchPanel(layout(), panel), "toggle", panel);
      return;
    }
    emit(resizeWorkbenchPanel(layout(), panel, action.size), "resize-commit", panel);
  };

  onCleanup(() => {
    resizeController.dispose();
  });

  const handle = (panel: WorkbenchPanelId, available: boolean, gridStyle: JSX.CSSProperties) => {
    if (!available || !interactive()) return undefined;
    const collapsed = () => layout()[`${panel}Collapsed`];
    const label = () => props.panelLabels?.[panel] ?? (panel === "bottom" ? "bottom panel" : panel);
    const limits = workbenchPanelLimits[panel];
    return (
      <div style={gridStyle} {...stylex.attrs(styles.handleCell, panel === "bottom" && styles.horizontalHandleCell, collapsed() && styles.collapsedHandleCell)}>
        <div
          {...stylex.attrs(styles.handle, panel === "bottom" && styles.horizontalHandle, collapsed() && styles.collapsedHandle)}
          role="separator"
          tabIndex={0}
          aria-label={`${collapsed() ? "Show" : "Resize or hide"} ${label()}. Press Enter to ${collapsed() ? "show" : "hide"}; double-click to reset size.`}
          aria-orientation={panel === "bottom" ? "horizontal" : "vertical"}
          aria-valuemin={0}
          aria-valuemax={limits.maximum}
          aria-valuenow={collapsed() ? 0 : layout()[`${panel}Size`]}
          aria-keyshortcuts="Enter"
          data-workbench-handle={panel}
          data-collapsed={collapsed() ? "true" : "false"}
          onPointerDown={(event) => startResize(panel, event)}
          onLostPointerCapture={(event) => resizeController.lostPointerCapture(event.pointerId)}
          onKeyDown={(event) => onHandleKeyDown(panel, event)}
          onDblClick={() => emit(resetWorkbenchPanel(layout(), panel), "reset", panel)}
        >
          <span {...stylex.attrs(styles.grip)} aria-hidden="true" data-workbench-grip="">{collapsed() ? panel === "sidebar" ? "›" : panel === "inspector" ? "‹" : "⌃" : ""}</span>
        </div>
      </div>
    );
  };

  return (
    <div ref={(element) => { rootElement = element; applyLayoutToDom(); }} {...stylex.attrs(styles.root)} style={{ "grid-template-columns": columns(), "grid-template-rows": rows() }} data-test-workbench-shell="">
      {props.activityBar && <aside {...stylex.attrs(styles.activity)} style={{ "grid-column": "1", "grid-row": "1 / -1" }}>{props.activityBar}</aside>}
      {props.sidebar && <aside ref={(element) => { sidebarElement = element; }} {...stylex.attrs(styles.sidebar)} style={{ "grid-column": String(sidebarColumn()), "grid-row": "1" }} hidden={layout().sidebarCollapsed} aria-hidden={layout().sidebarCollapsed} data-workbench-panel="sidebar">{props.sidebar}</aside>}
      {handle("sidebar", hasSidebar(), { "grid-column": String(sidebarHandleColumn()), "grid-row": "1" })}
      <main {...stylex.attrs(styles.main)} style={{ "grid-column": String(mainColumn()), "grid-row": "1" }}>{props.main}</main>
      {handle("inspector", hasInspector(), { "grid-column": String(inspectorHandleColumn()), "grid-row": "1" })}
      {props.inspector && <aside ref={(element) => { inspectorElement = element; }} {...stylex.attrs(styles.inspector)} style={{ "grid-column": String(inspectorColumn()), "grid-row": "1" }} hidden={layout().inspectorCollapsed} aria-hidden={layout().inspectorCollapsed} data-workbench-panel="inspector">{props.inspector}</aside>}
      {handle("bottom", hasBottom(), { "grid-column": `${sidebarColumn()} / -1`, "grid-row": "2" })}
      {props.bottomPanel && <section ref={(element) => { bottomElement = element; }} {...stylex.attrs(styles.bottom)} style={{ "grid-column": `${sidebarColumn()} / -1`, "grid-row": "3" }} hidden={layout().bottomCollapsed} aria-hidden={layout().bottomCollapsed} data-workbench-panel="bottom">{props.bottomPanel}</section>}
      {props.statusBar && <footer {...stylex.attrs(styles.status)} style={{ "grid-column": `${sidebarColumn()} / -1`, "grid-row": "4" }}>{props.statusBar}</footer>}
    </div>
  );
}
