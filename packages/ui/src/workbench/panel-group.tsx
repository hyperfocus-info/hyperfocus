import * as stylex from "@stylexjs/stylex";
import { createEffect, createMemo, createSignal, For, onCleanup, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import {
  assertPanelLayoutDescriptors,
  normalizePanelGroupLayout,
  resetPanelGroupPanel,
  resizePanelGroupPanel,
  togglePanelGroupPanel,
  type PanelAxis,
  type PanelGroupLayout,
  type PanelGroupLayoutInput,
  type PanelLayoutDescriptor,
} from "./panel-group-layout";
import { createPanelPointerResizeController, resolvePanelSeparatorKey } from "./panel-resize-interaction";

export type PanelResizeHandle = "start" | "end" | "none";

export type PanelNarrowMode = "primary" | "mode" | "hidden";

export type PanelDescriptor = PanelLayoutDescriptor & {
  content: JSX.Element;
  resizeHandle: PanelResizeHandle;
  narrowMode: PanelNarrowMode;
  grow?: boolean;
};

export type PanelGroupLayoutChangeReason = "resize" | "resize-commit" | "resize-cancel" | "reset" | "toggle";

export type PanelGroupProps = {
  id: string;
  panels: readonly PanelDescriptor[];
  layout: () => PanelGroupLayoutInput;
  onLayoutChange: (layout: PanelGroupLayout, reason: PanelGroupLayoutChangeReason, panelId: string) => void;
  ariaLabel: string;
  narrowBreakpoint?: number | false;
  narrow?: () => boolean | undefined;
  narrowModeLabel?: string;
  narrowActivePanelId?: () => string | undefined;
  onNarrowActivePanelChange?: (panelId: string) => void;
  onNarrowChange?: (narrow: boolean) => void;
};

const styles = stylex.create({
  root: {
    overflow: "hidden",
    alignItems: "stretch",
    backgroundColor: tokens.background,
    color: tokens.foreground,
    display: "flex",
    flexDirection: "row",
    position: "relative",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
  },
  verticalRoot: { flexDirection: "column" },
  panel: { overflow: "hidden", minHeight: 0, minWidth: 0, },
  handleCell: {
    backgroundColor: tokens.background,
    position: "relative",
    zIndex: 4,
    minHeight: 0,
    minWidth: 0,
  },
  verticalHandleCell: { minHeight: 0, minWidth: 0 },
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
    touchAction: "none",
    height: "100%",
    width: "100%",
  },
  verticalHandle: { cursor: "row-resize" },
  collapsedHandle: { color: tokens.accent, cursor: "pointer" },
  grip: { fontFamily: tokens.fontMono, fontSize: "0.8rem", fontWeight: 800, pointerEvents: "none" },
  modeSwitcher: {
    gap: tokens.space1,
    paddingInline: tokens.space1,
    alignItems: "stretch",
    backgroundColor: tokens.panelRaised,
    display: "flex",
    flexBasis: 'auto',
    flexGrow: '0',
    flexShrink: '0',
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    minHeight: "44px",
    overflowX: "auto",
  },
  modeButton: {
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` },
    paddingInline: tokens.space3,
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": tokens.selection },
    color: tokens.foreground,
    cursor: "pointer",
    fontFamily: tokens.fontUi,
    fontSize: "0.78rem",
    outlineOffset: "-2px",
    whiteSpace: "nowrap",
    borderBottomColor: { default: "transparent", ':is([aria-selected="true"])': tokens.accent },
    borderBottomStyle: "solid",
    borderBottomWidth: "2px",
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    minHeight: "44px",
    minWidth: "44px",
  },
});

function requirePanel(panels: readonly PanelDescriptor[], index: number) {
  const panel = panels[index];
  if (!panel) throw new Error(`PanelGroup requires a panel at index ${index}`);
  return panel;
}

function requirePanelLayout(layout: PanelGroupLayout, panelId: string) {
  const state = layout[panelId];
  if (!state) throw new Error(`PanelGroup layout is missing panel "${panelId}"`);
  return state;
}

function validatePanelGroupProps(props: PanelGroupProps) {
  if (!props.id.trim()) throw new Error("PanelGroup requires a stable id");
  if (
    props.narrowBreakpoint !== false &&
    props.narrowBreakpoint !== undefined &&
    (!Number.isFinite(props.narrowBreakpoint) || props.narrowBreakpoint <= 0)
  ) {
    throw new Error("PanelGroup narrow breakpoint must be a positive number or false");
  }
  assertPanelLayoutDescriptors(props.panels);
  const primaryCount = props.panels.filter((panel) => panel.narrowMode === "primary").length;
  if (primaryCount > 1) throw new Error("PanelGroup accepts at most one primary narrow panel");
  for (let index = 1; index < props.panels.length; index += 1) {
    const previous = requirePanel(props.panels, index - 1);
    const current = requirePanel(props.panels, index);
    if (previous.resizeHandle === "end" && current.resizeHandle === "start") {
      throw new Error(
        `PanelGroup panels "${previous.id}" and "${current.id}" declare duplicate handles at the same boundary`,
      );
    }
  }
  for (const panel of props.panels) {
    if (panel.collapseMode !== "none" && panel.resizeHandle === "none") {
      throw new Error(
        `Collapsible PanelGroup panel "${panel.id}" requires a resize handle so it can always be restored`,
      );
    }
  }
}

function findPanelElement<Element extends HTMLElement>(root: HTMLElement, attribute: string, id: string) {
  return Array.from(root.querySelectorAll<Element>(`[${attribute}]`)).find(
    (element) => element.getAttribute(attribute) === id,
  );
}

function applyPanelGroupLayoutToDom(options: {
  root: HTMLDivElement;
  props: PanelGroupProps;
  layout: PanelGroupLayout;
  axis: PanelAxis;
  narrow: boolean;
  activePanelId?: string;
  modeDomId(panel: PanelDescriptor): string;
}) {
  const { root, props, layout, axis, narrow, activePanelId, modeDomId } = options;
  root.dataset.narrow = narrow ? "true" : "false";
  root.style.flexDirection = narrow || axis === "vertical" ? "column" : "row";
  const modeSwitcher = root.querySelector<HTMLElement>("[data-panel-group-mode-switcher]");
  if (modeSwitcher) {
    modeSwitcher.hidden = !narrow;
    modeSwitcher.setAttribute("aria-hidden", narrow ? "false" : "true");
  }
  for (const panel of props.panels) {
    const state = requirePanelLayout(layout, panel.id);
    const element = findPanelElement<HTMLElement>(root, "data-panel-group-panel", panel.id);
    if (element) updatePanelElement(element, panel, state, narrow, activePanelId, modeDomId);
    const handle = findPanelElement<HTMLElement>(root, "data-panel-group-handle", panel.id);
    const handleCell = findPanelElement<HTMLElement>(root, "data-panel-group-handle-cell", panel.id);
    if (handleCell) {
      handleCell.hidden = narrow;
      handleCell.style.flex = `0 0 ${state.collapsed ? 28 : 10}px`;
    }
    if (handle) updatePanelHandle(handle, panel, state);
    const mode = findPanelElement<HTMLButtonElement>(root, "data-panel-group-mode", panel.id);
    if (mode) {
      const selected = activePanelId === panel.id;
      mode.tabIndex = selected ? 0 : -1;
      mode.setAttribute("aria-selected", selected ? "true" : "false");
      mode.dataset.collapsed = state.collapsed ? "true" : "false";
    }
  }
}

function updatePanelElement(
  element: HTMLElement,
  panel: PanelDescriptor,
  state: PanelGroupLayout[string],
  narrow: boolean,
  activePanelId: string | undefined,
  modeDomId: (panel: PanelDescriptor) => string,
) {
  const hidden = state.collapsed || (narrow && activePanelId !== panel.id);
  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
  element.setAttribute("role", narrow ? "tabpanel" : "region");
  if (narrow) {
    element.removeAttribute("aria-label");
    element.setAttribute("aria-labelledby", modeDomId(panel));
  } else {
    element.setAttribute("aria-label", panel.label);
    element.removeAttribute("aria-labelledby");
  }
  applyPanelElementSize(element, panel, state, narrow);
}

function applyPanelElementSize(
  element: HTMLElement,
  panel: PanelDescriptor,
  state: PanelGroupLayout[string],
  narrow: boolean,
) {
  if (narrow) {
    Object.assign(element.style, {
      flex: "1 1 auto", width: "100%", height: "100%", minWidth: "0px", maxWidth: "none", minHeight: "0px", maxHeight: "none",
    });
  } else if (panel.axis === "horizontal") {
    Object.assign(element.style, {
      flex: `${panel.grow ? 1 : 0} ${panel.grow ? 1 : 0} ${state.size}px`, width: `${state.size}px`, height: "",
      minWidth: `${panel.minimumSize}px`, maxWidth: `${panel.maximumSize}px`, minHeight: "0px", maxHeight: "none",
    });
  } else {
    Object.assign(element.style, {
      flex: `${panel.grow ? 1 : 0} ${panel.grow ? 1 : 0} ${state.size}px`, width: "", height: `${state.size}px`,
      minWidth: "0px", maxWidth: "none", minHeight: `${panel.minimumSize}px`, maxHeight: `${panel.maximumSize}px`,
    });
  }
}

function updatePanelHandle(handle: HTMLElement, panel: PanelDescriptor, state: PanelGroupLayout[string]) {
  handle.dataset.collapsed = state.collapsed ? "true" : "false";
  handle.setAttribute("aria-valuenow", String(state.collapsed ? 0 : state.size));
  handle.setAttribute("aria-valuetext", state.collapsed ? "Collapsed" : `${state.size} pixels`);
  handle.setAttribute(
    "aria-label",
    `${state.collapsed ? "Show" : "Resize"} ${panel.label}${panel.collapseMode === "none" ? "." : `. Press Enter to ${state.collapsed ? "show" : "hide"}; double-click to reset size.`}`,
  );
  const grip = handle.querySelector<HTMLElement>("[data-panel-group-grip]");
  if (grip) grip.textContent = state.collapsed ? (panel.resizeHandle === "start" ? "<" : ">") : "";
}

export function PanelGroup(props: PanelGroupProps) {
  let rootElement: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let applyLayoutToDom = () => {};
  let observedContainerNarrow = false;
  let currentInternalNarrowPanelId: string | undefined;
  let currentLayout = normalizePanelGroupLayout(props.panels, props.layout());
  const resizeController = createPanelPointerResizeController();
  const [layoutRevision, setLayoutRevision] = createSignal(0);
  const [containerNarrow, setContainerNarrow] = createSignal(false);
  const [internalNarrowPanelId, setInternalNarrowPanelId] = createSignal<string>();
  const layout = () => {
    layoutRevision();
    return currentLayout;
  };
  const axis = (): PanelAxis => requirePanel(props.panels, 0).axis;
  const isNarrow = () => {
    containerNarrow();
    return props.narrow?.() ?? observedContainerNarrow;
  };
  const narrowPanels = () => props.panels.filter((panel) => panel.narrowMode !== "hidden");
  const activeNarrowPanelId = () => {
    internalNarrowPanelId();
    const candidates = narrowPanels();
    const available = (id: string | undefined) =>
      id && candidates.some((panel) => panel.id === id && !requirePanelLayout(layout(), panel.id).collapsed);
    const controlled = props.narrowActivePanelId?.();
    if (available(controlled)) return controlled;
    const internal = currentInternalNarrowPanelId;
    if (available(internal)) return internal;
    return candidates.find(
      (panel) => panel.narrowMode === "primary" && !requirePanelLayout(layout(), panel.id).collapsed,
    )?.id
      ?? candidates.find((panel) => !requirePanelLayout(layout(), panel.id).collapsed)?.id
      ?? candidates[0]?.id;
  };

  const updateLayout = (next: PanelGroupLayoutInput) => {
    validatePanelGroupProps(props);
    currentLayout = normalizePanelGroupLayout(props.panels, next);
    setLayoutRevision((revision) => revision + 1);
    applyLayoutToDom();
  };
  createEffect(() => updateLayout(props.layout()));

  const emit = (next: PanelGroupLayout, reason: PanelGroupLayoutChangeReason, panelId: string) => {
    updateLayout(next);
    props.onLayoutChange(next, reason, panelId);
  };
  const startResize = (panel: PanelDescriptor, event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (panel.resizeHandle === "none" || requirePanelLayout(layout(), panel.id).collapsed) return;
    const startLayout = layout();
    resizeController.start({
      event,
      target: event.currentTarget,
      axis: panel.axis,
      edge: panel.resizeHandle,
      startSize: requirePanelLayout(startLayout, panel.id).size,
      onResize: (size) => emit(resizePanelGroupPanel(props.panels, layout(), panel.id, size), "resize", panel.id),
      onCommit: () => emit(layout(), "resize-commit", panel.id),
      onCancel: () => emit(startLayout, "resize-cancel", panel.id),
    });
  };

  const onSeparatorKeyDown = (panel: PanelDescriptor, event: KeyboardEvent) => {
    if (panel.resizeHandle === "none") return;
    const action = resolvePanelSeparatorKey({
      key: event.key,
      shiftKey: event.shiftKey,
      axis: panel.axis,
      edge: panel.resizeHandle,
      currentSize: requirePanelLayout(layout(), panel.id).size,
      minimumSize: panel.minimumSize,
      maximumSize: panel.maximumSize,
      collapsible: panel.collapseMode !== "none",
    });
    if (!action) return;
    event.preventDefault();
    if (action.kind === "toggle") {
      emit(togglePanelGroupPanel(props.panels, layout(), panel.id), "toggle", panel.id);
      return;
    }
    emit(resizePanelGroupPanel(props.panels, layout(), panel.id, action.size), "resize-commit", panel.id);
  };

  const selectNarrowPanel = (panel: PanelDescriptor) => {
    if (requirePanelLayout(layout(), panel.id).collapsed && panel.collapseMode !== "none") {
      emit(togglePanelGroupPanel(props.panels, layout(), panel.id), "toggle", panel.id);
    }
    currentInternalNarrowPanelId = panel.id;
    setInternalNarrowPanelId(panel.id);
    props.onNarrowActivePanelChange?.(panel.id);
    applyLayoutToDom();
  };
  const onNarrowModeKeyDown = (panelId: string, event: KeyboardEvent) => {
    const panels = narrowPanels();
    const currentIndex = panels.findIndex((panel) => panel.id === panelId);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? panels.length - 1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? (currentIndex + 1) % panels.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (currentIndex - 1 + panels.length) % panels.length
      : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = requirePanel(panels, nextIndex);
    selectNarrowPanel(next);
    rootElement?.querySelectorAll<HTMLButtonElement>("[data-panel-group-mode]")[nextIndex]?.focus();
  };

  const setObservedNarrow = (size: number) => {
    const breakpoint = props.narrowBreakpoint === false ? undefined : props.narrowBreakpoint ?? 640;
    if (breakpoint === undefined || size <= 0) return;
    const next = size < breakpoint;
    if (next === observedContainerNarrow) return;
    observedContainerNarrow = next;
    setContainerNarrow(next);
    applyLayoutToDom();
    props.onNarrowChange?.(next);
  };
  const connectRoot = (element: HTMLDivElement) => {
    resizeObserver?.disconnect();
    rootElement = element;
    applyLayoutToDom();
    const rect = element.getBoundingClientRect();
    if (rect) setObservedNarrow(axis() === "horizontal" ? rect.width : rect.height);
    if (props.narrowBreakpoint === false || typeof ResizeObserver === "undefined") return;
    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setObservedNarrow(axis() === "horizontal" ? rect.width : rect.height);
    });
    resizeObserver.observe(element);
  };

  onCleanup(() => {
    resizeObserver?.disconnect();
    resizeController.dispose();
  });

  const panelDomId = (panel: PanelDescriptor) => `${props.id}--panel--${encodeURIComponent(panel.id)}`;
  const modeDomId = (panel: PanelDescriptor) => `${props.id}--mode--${encodeURIComponent(panel.id)}`;
  const panelStyle = (panel: PanelDescriptor): JSX.CSSProperties => {
    if (isNarrow()) return { flex: "1 1 auto", height: "100%", width: "100%" };
    const size = requirePanelLayout(layout(), panel.id).size;
    const flex = `${panel.grow ? 1 : 0} ${panel.grow ? 1 : 0} ${size}px`;
    return axis() === "horizontal"
      ? { flex, width: `${size}px`, "min-width": `${panel.minimumSize}px`, "max-width": `${panel.maximumSize}px` }
      : { flex, height: `${size}px`, "min-height": `${panel.minimumSize}px`, "max-height": `${panel.maximumSize}px` };
  };
  applyLayoutToDom = () => {
    const root = rootElement;
    if (!root) return;
    applyPanelGroupLayoutToDom({
      root,
      props,
      layout: layout(),
      axis: axis(),
      narrow: isNarrow(),
      activePanelId: activeNarrowPanelId(),
      modeDomId,
    });
  };
  createEffect(() => {
    isNarrow();
    activeNarrowPanelId();
    applyLayoutToDom();
  });
  return renderPanelGroup({
    props,
    axis,
    layout,
    isNarrow,
    activeNarrowPanelId,
    narrowPanels,
    panelDomId,
    modeDomId,
    panelStyle,
    startResize,
    onSeparatorKeyDown,
    selectNarrowPanel,
    onNarrowModeKeyDown,
    emit,
    connectRoot,
    resizeController,
  });
}

type PanelGroupViewOptions = {
  props: PanelGroupProps;
  axis: () => PanelAxis;
  layout: () => PanelGroupLayout;
  isNarrow: () => boolean;
  activeNarrowPanelId: () => string | undefined;
  narrowPanels: () => PanelDescriptor[];
  panelDomId: (panel: PanelDescriptor) => string;
  modeDomId: (panel: PanelDescriptor) => string;
  panelStyle: (panel: PanelDescriptor) => JSX.CSSProperties;
  startResize: (panel: PanelDescriptor, event: PointerEvent & { currentTarget: HTMLElement }) => void;
  onSeparatorKeyDown: (panel: PanelDescriptor, event: KeyboardEvent) => void;
  selectNarrowPanel: (panel: PanelDescriptor) => void;
  onNarrowModeKeyDown: (panelId: string, event: KeyboardEvent) => void;
  emit: (layout: PanelGroupLayout, reason: PanelGroupLayoutChangeReason, panelId: string) => void;
  connectRoot: (element: HTMLDivElement) => void;
  resizeController: ReturnType<typeof createPanelPointerResizeController>;
};

function renderPanelGroup(options: PanelGroupViewOptions) {
  const {
    props, axis, layout, isNarrow, activeNarrowPanelId, narrowPanels, panelDomId, modeDomId, panelStyle,
    startResize, onSeparatorKeyDown, selectNarrowPanel, onNarrowModeKeyDown, emit, connectRoot, resizeController,
  } = options;
  const separator = (panel: PanelDescriptor) => {
    if (panel.resizeHandle === "none") return undefined;
    const state = () => requirePanelLayout(layout(), panel.id);
    const collapsed = () => state().collapsed;
    const separatorOrientation = () => axis() === "horizontal" ? "vertical" : "horizontal";
    const label = () => `${collapsed() ? "Show" : "Resize"} ${panel.label}${panel.collapseMode === "none" ? "." : `. Press Enter to ${collapsed() ? "show" : "hide"}; double-click to reset size.`}`;
    return (
      <div
        {...stylex.attrs(
          styles.handleCell,
          panel.axis === "vertical" && styles.verticalHandleCell,
          collapsed() && styles.collapsedHandleCell,
        )}
        style={{ flex: `0 0 ${collapsed() ? 28 : 10}px` }}
        data-panel-group-handle-cell={panel.id}
        hidden={isNarrow()}
      >
        <div
          {...stylex.attrs(
            styles.handle,
            panel.axis === "vertical" && styles.verticalHandle,
            collapsed() && styles.collapsedHandle,
          )}
          role="separator"
          tabIndex={0}
          aria-label={label()}
          aria-controls={panelDomId(panel)}
          aria-orientation={separatorOrientation()}
          aria-valuemin={panel.collapseMode === "none" ? panel.minimumSize : 0}
          aria-valuemax={panel.maximumSize}
          aria-valuenow={collapsed() ? 0 : state().size}
          aria-valuetext={collapsed() ? "Collapsed" : `${state().size} pixels`}
          aria-keyshortcuts={panel.collapseMode === "none" ? undefined : "Enter"}
          data-panel-group-handle={panel.id}
          data-resize-edge={panel.resizeHandle}
          data-collapsed={String(collapsed())}
          onPointerDown={(event) => startResize(panel, event)}
          onLostPointerCapture={(event) => resizeController.lostPointerCapture(event.pointerId)}
          onKeyDown={(event) => onSeparatorKeyDown(panel, event)}
          onDblClick={() => emit(resetPanelGroupPanel(props.panels, layout(), panel.id), "reset", panel.id)}
        >
          <span {...stylex.attrs(styles.grip)} aria-hidden="true" data-panel-group-grip="">
            {collapsed() ? (panel.resizeHandle === "start" ? "<" : ">") : ""}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      id={props.id}
      ref={connectRoot}
      {...stylex.attrs(styles.root, requirePanel(props.panels, 0).axis === "vertical" && styles.verticalRoot)}
      role="group"
      aria-label={props.ariaLabel}
      data-panel-group=""
      data-panel-group-axis={axis()}
      data-narrow={isNarrow() ? "true" : "false"}
    >
      <div
        {...stylex.attrs(styles.modeSwitcher)}
        role="tablist"
        aria-label={props.narrowModeLabel ?? `${props.ariaLabel} panels`}
        aria-hidden={isNarrow() ? "false" : "true"}
        data-panel-group-mode-switcher=""
        hidden={!isNarrow()}
      >
        <For each={narrowPanels()}>{(panel) => {
          const selected = createMemo(() => activeNarrowPanelId() === panel.id);
          return (
            <button
              id={modeDomId(panel)}
              type="button"
              {...stylex.attrs(styles.modeButton)}
              role="tab"
              tabIndex={selected() ? 0 : -1}
              aria-selected={selected()}
              aria-controls={panelDomId(panel)}
              data-panel-group-mode={panel.id}
              data-collapsed={requirePanelLayout(layout(), panel.id).collapsed ? "true" : "false"}
              onClick={() => selectNarrowPanel(panel)}
              onKeyDown={(event) => onNarrowModeKeyDown(panel.id, event)}
            >{panel.label}</button>
          );
        }}</For>
      </div>
      <For each={props.panels}>{(panel) => {
        const hidden = createMemo(
          () => requirePanelLayout(layout(), panel.id).collapsed || (isNarrow() && activeNarrowPanelId() !== panel.id),
        );
        return (
          <>
            {panel.resizeHandle === "start" && separator(panel)}
            <section
              id={panelDomId(panel)}
              {...stylex.attrs(styles.panel)}
              style={panelStyle(panel)}
              role={isNarrow() ? "tabpanel" : "region"}
              aria-label={isNarrow() ? undefined : panel.label}
              aria-labelledby={isNarrow() ? modeDomId(panel) : undefined}
              aria-hidden={hidden()}
              hidden={hidden()}
              data-panel-group-panel={panel.id}
              data-persistence-scope={panel.persistenceScope}
            >{panel.content}</section>
            {panel.resizeHandle === "end" && separator(panel)}
          </>
        );
      }}</For>
    </div>
  );
}
