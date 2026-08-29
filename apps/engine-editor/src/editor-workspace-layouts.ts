import type { WorkspacePanelLayout } from "./app/editor-preferences";

type WorkspaceConfig = {
  id: string;
  selector: string;
  primaryIndex: number;
  defaultSizes: number[];
  defaultCollapsed?: boolean[];
  defaultVisible?: boolean[];
};

const workspaceConfigs: readonly WorkspaceConfig[] = [
  { id: "stage", selector: ".stage-layout", primaryIndex: 1, defaultSizes: [252, 0, 280], defaultCollapsed: [true, false, true], defaultVisible: [false, true, false] },
  { id: "scene3d", selector: ".scene3d-layout", primaryIndex: 1, defaultSizes: [230, 0, 300] },
  { id: "script", selector: ".script-layout", primaryIndex: 1, defaultSizes: [240, 0, 290] },
  { id: "tilemap", selector: ".tilemap-layout", primaryIndex: 1, defaultSizes: [250, 0, 280] },
  { id: "atlas", selector: ".atlas-layout", primaryIndex: 1, defaultSizes: [250, 0, 280] },
  // The live game preview is the work in Post. Keep supporting authoring and
  // budget panes one keypress away without letting them crowd the preview on
  // a first visit.
  { id: "post", selector: ".post-layout", primaryIndex: 0, defaultSizes: [0, 340, 300], defaultCollapsed: [false, true, true] },
  { id: "diagnostics", selector: ".diagnostics-layout", primaryIndex: 1, defaultSizes: [290, 0, 285] },
];

type MotionDragState = {
  panelIndex: number;
  pointerId: number;
  coordinate: number;
  size: number;
  direction: 1 | -1;
  target: HTMLElement;
};

function createMotionHandle(options: {
  panelIndex: number;
  orientation: "vertical" | "horizontal";
  state: WorkspacePanelLayout;
  defaults: readonly number[];
  apply: () => void;
  commit: () => void;
  onDragStart: (drag: MotionDragState) => void;
}) {
  const { panelIndex, orientation, state } = options;
  const handle = document.createElement("div");
  handle.className = "hf-workspace-separator";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", orientation);
  handle.dataset.panelIndex = String(panelIndex);
  handle.addEventListener("pointerdown", (event) => {
    if (state.collapsed[panelIndex]) return;
    event.preventDefault();
    options.onDragStart({
      panelIndex,
      pointerId: event.pointerId,
      coordinate: orientation === "horizontal" ? event.clientY : event.clientX,
      size: state.sizes[panelIndex],
      direction: panelIndex === 0 ? 1 : -1,
      target: handle
    });
    handle.setPointerCapture?.(event.pointerId);
    document.body.style.cursor = orientation === "horizontal" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  });
  handle.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      state.collapsed[panelIndex] = !state.collapsed[panelIndex];
      options.apply();
      options.commit();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      state.sizes[panelIndex] = event.key === "Home" ? 160 : panelIndex === 3 ? 420 : 720;
      options.apply();
      options.commit();
      return;
    }
    const visual = panelIndex === 0
      ? event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
      : panelIndex === 2
        ? event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0
        : event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (!visual) return;
    event.preventDefault();
    state.sizes[panelIndex] = clamp(state.sizes[panelIndex] + visual * (event.shiftKey ? 50 : 10));
    options.apply();
    options.commit();
  });
  handle.addEventListener("dblclick", () => {
    state.sizes[panelIndex] = options.defaults[panelIndex];
    state.collapsed[panelIndex] = false;
    options.apply();
    options.commit();
  });
  return handle;
}

export function mountEditorWorkspaceLayouts(options: {
  root: ParentNode;
  layouts?: Record<string, WorkspacePanelLayout>;
  onCommit?: (id: string, layout: WorkspacePanelLayout) => void;
}) {
  const disposers = workspaceConfigs.flatMap((config) => {
    const container = options.root.querySelector<HTMLElement>(config.selector);
    return container ? [mountWorkspace(container, config, options.layouts?.[config.id], (layout) => options.onCommit?.(config.id, layout))] : [];
  });
  const motion = options.root.querySelector<HTMLElement>(".sequence-shell");
  if (motion) disposers.push(mountMotionWorkspace(motion, options.layouts?.motion, (layout) => options.onCommit?.("motion", layout)));
  return () => { for (const dispose of disposers.reverse()) dispose(); };
}

function mountMotionWorkspace(container: HTMLElement, saved: WorkspacePanelLayout | undefined, onCommit: (layout: WorkspacePanelLayout) => void) {
  const command = container.querySelector<HTMLElement>(":scope > .sequence-commandbar");
  const tracks = container.querySelector<HTMLElement>(":scope > .sequence-tracks-panel");
  const editor = container.querySelector<HTMLElement>(":scope > .sequence-editor-panel");
  const inspector = container.querySelector<HTMLElement>(":scope > .sequence-right-column");
  const rig = container.querySelector<HTMLElement>(":scope > .rig-dock");
  if (!command || !tracks || !editor || !inspector || !rig) return () => undefined;

  const panels = [tracks, editor, inspector, rig];
  const labels = ["Tracks", "Timeline", "Keyframe and audio", "Motion rig"];
  const defaults = [224, 0, 226, 174];
  const state: WorkspacePanelLayout = {
    sizes: defaults.map((size, index) => index === 1 ? 0 : clamp(saved?.sizes[index] ?? size)),
    collapsed: defaults.map((_, index) => index === 1 ? false : saved?.collapsed[index] === true),
    visible: defaults.map((_, index) => saved?.visible[index] !== false),
    narrowPanel: validPanelIndex(saved?.narrowPanel, panels.length, 1),
  };
  const original = {
    columns: container.style.gridTemplateColumns,
    rows: container.style.gridTemplateRows,
    position: container.style.position,
    command: command.getAttribute("style"),
    tracks: tracks.getAttribute("style"),
    editor: editor.getAttribute("style"),
    inspector: inspector.getAttribute("style"),
    rig: rig.getAttribute("style"),
  };
  let containerNarrow = false;
  let mobilePanel = state.visible[state.narrowPanel] ? state.narrowPanel : 1;
  let active: MotionDragState | undefined;
  let resizeFrame = 0;

  container.classList.add("hf-motion-workspace");
  panels.forEach((panel, index) => {
    panel.dataset.workspacePanel = String(index);
    panel.dataset.workspacePanelLabel = labels[index];
  });

  const handles = [
    createMotionHandle({ panelIndex: 0, orientation: "vertical", state, defaults,
      apply: () => apply(), commit: () => commit(), onDragStart: (drag) => { active = drag; } }),
    createMotionHandle({ panelIndex: 2, orientation: "vertical", state, defaults,
      apply: () => apply(), commit: () => commit(), onDragStart: (drag) => { active = drag; } }),
    createMotionHandle({ panelIndex: 3, orientation: "horizontal", state, defaults,
      apply: () => apply(), commit: () => commit(), onDragStart: (drag) => { active = drag; } }),
  ];
  handles[0].classList.add("hf-motion-handle-left");
  handles[1].classList.add("hf-motion-handle-right");
  handles[2].classList.add("hf-motion-handle-bottom");
  container.append(...handles);

  const switcher = document.createElement("div");
  switcher.className = "hf-workspace-switcher hf-motion-switcher";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Motion workspace panels");
  labels.forEach((label, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => { mobilePanel = index; state.narrowPanel = index; apply(); commit(); });
    switcher.append(button);
  });
  container.append(switcher);

  const apply = () => {
    const narrow = containerNarrow;
    if (narrow) {
      container.style.gridTemplateColumns = "minmax(0, 1fr)";
      container.style.gridTemplateRows = "42px minmax(0, 1fr)";
      command.style.gridColumn = "1"; command.style.gridRow = "1";
      panels.forEach((panel, index) => {
        panel.style.gridColumn = "1"; panel.style.gridRow = "2";
        panel.hidden = !state.visible[index] || index !== mobilePanel;
        panel.setAttribute("aria-hidden", String(panel.hidden));
      });
      handles.forEach((handle) => { handle.hidden = true; });
    } else {
      const left = state.collapsed[0] ? 0 : state.sizes[0];
      const right = state.collapsed[2] ? 0 : state.sizes[2];
      const bottom = state.collapsed[3] ? 0 : state.sizes[3];
      container.style.gridTemplateColumns = `${left}px ${state.collapsed[0] ? 24 : 10}px minmax(18rem, 1fr) ${state.collapsed[2] ? 24 : 10}px ${right}px`;
      container.style.gridTemplateRows = `42px minmax(18rem, 1fr) ${state.collapsed[3] ? 24 : 10}px ${bottom}px`;
      command.style.gridColumn = "1 / -1"; command.style.gridRow = "1";
      tracks.style.gridColumn = "1"; tracks.style.gridRow = "2";
      editor.style.gridColumn = "3"; editor.style.gridRow = "2";
      inspector.style.gridColumn = "5"; inspector.style.gridRow = "2";
      rig.style.gridColumn = "1 / -1"; rig.style.gridRow = "4";
      handles[0].style.gridColumn = "2"; handles[0].style.gridRow = "2";
      handles[1].style.gridColumn = "4"; handles[1].style.gridRow = "2";
      handles[2].style.gridColumn = "1 / -1"; handles[2].style.gridRow = "3";
      panels.forEach((panel, index) => {
        panel.hidden = !state.visible[index] || state.collapsed[index];
        panel.setAttribute("aria-hidden", String(panel.hidden));
      });
      handles.forEach((handle) => { handle.hidden = !state.visible[Number(handle.dataset.panelIndex)]; });
    }
    handles.forEach((handle) => {
      const index = Number(handle.dataset.panelIndex);
      const maximum = index === 3 ? 420 : 720;
      handle.dataset.collapsed = String(state.collapsed[index]);
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", String(maximum));
      handle.setAttribute("aria-valuenow", String(state.collapsed[index] ? 0 : state.sizes[index]));
      handle.setAttribute("aria-label", `${state.collapsed[index] ? "Show" : "Resize or hide"} ${labels[index]}. Press Enter to ${state.collapsed[index] ? "show" : "hide"}; double-click to reset.`);
    });
    [...switcher.querySelectorAll<HTMLButtonElement>("button")].forEach((button, index) => {
      button.hidden = !state.visible[index];
      button.setAttribute("aria-pressed", String(index === mobilePanel));
    });
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  };
  const commit = () => onCommit({ sizes: [...state.sizes], collapsed: [...state.collapsed], visible: [...state.visible], narrowPanel: state.narrowPanel });
  const onPointerMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    const orientation = active.panelIndex === 3 ? "horizontal" : "vertical";
    const coordinate = orientation === "horizontal" ? event.clientY : event.clientX;
    state.sizes[active.panelIndex] = clamp(active.size + (coordinate - active.coordinate) * active.direction);
    apply();
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    if (active.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    active = undefined;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    commit();
  };
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (width <= 0) return;
    const next = width <= 900;
    if (next === containerNarrow) return;
    containerNarrow = next;
    apply();
  }) : undefined;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerEnd);
  window.addEventListener("pointercancel", onPointerEnd);
  resizeObserver?.observe(container);
  apply();

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    resizeObserver?.disconnect();
    cancelAnimationFrame(resizeFrame);
    if (active?.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    active = undefined;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    handles.forEach((handle) => handle.remove());
    switcher.remove();
    panels.forEach((panel) => { panel.hidden = false; delete panel.dataset.workspacePanel; delete panel.dataset.workspacePanelLabel; panel.removeAttribute("aria-hidden"); });
    container.classList.remove("hf-motion-workspace");
    container.style.gridTemplateColumns = original.columns;
    container.style.gridTemplateRows = original.rows;
    container.style.position = original.position;
    restoreStyle(command, original.command);
    restoreStyle(tracks, original.tracks);
    restoreStyle(editor, original.editor);
    restoreStyle(inspector, original.inspector);
    restoreStyle(rig, original.rig);
  };
}

function restoreStyle(element: HTMLElement, style: string | null) {
  if (style === null) element.removeAttribute("style");
  else element.setAttribute("style", style);
}

function mountWorkspace(container: HTMLElement, config: WorkspaceConfig, saved: WorkspacePanelLayout | undefined, onCommit: (layout: WorkspacePanelLayout) => void) {
  const panels = [...container.children].filter((element): element is HTMLElement => element instanceof HTMLElement);
  if (panels.length < 2 || config.primaryIndex < 0 || config.primaryIndex >= panels.length) return () => undefined;
  const original = { template: container.style.gridTemplateColumns, gap: container.style.gap, position: container.style.position };
  const originalPanelStyles = panels.map((panel) => panel.getAttribute("style"));
  const defaults = panels.map((_, index) => clamp(config.defaultSizes[index] || 260));
  const state: WorkspacePanelLayout = {
    sizes: panels.map((_, index) => index === config.primaryIndex ? 0 : clamp(saved?.sizes[index] ?? defaults[index])),
    collapsed: panels.map((_, index) => index === config.primaryIndex ? false : (saved?.collapsed[index] ?? (config.defaultCollapsed?.[index] === true))),
    visible: panels.map((_, index) => index === config.primaryIndex ? true : (saved?.visible[index] ?? (config.defaultVisible?.[index] !== false))),
    narrowPanel: validPanelIndex(saved?.narrowPanel, panels.length, config.primaryIndex),
  };
  let mobilePanel = state.visible[state.narrowPanel] ? state.narrowPanel : config.primaryIndex;
  let active: { panelIndex: number; pointerId: number; startX: number; startSize: number; direction: 1 | -1; target: HTMLElement } | undefined;
  let resizeFrame = 0;
  const handles: HTMLElement[] = [];
  let containerNarrow = false;

  container.classList.add("hf-resizable-workspace");
  panels.forEach((panel, index) => {
    panel.dataset.workspacePanel = String(index);
    panel.dataset.workspacePanelLabel = panel.querySelector<HTMLElement>(".panel-title span, header strong")?.textContent?.trim() || (index === config.primaryIndex ? "Main" : `Panel ${index + 1}`);
  });

  for (let boundary = 0; boundary < panels.length - 1; boundary += 1) {
    const panelIndex = boundary < config.primaryIndex ? boundary : boundary + 1;
    const handle = document.createElement("div");
    handle.className = "hf-workspace-separator";
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.dataset.panelIndex = String(panelIndex);
    panels[boundary].after(handle);
    handles.push(handle);
    handle.addEventListener("pointerdown", (event) => {
      if (state.collapsed[panelIndex]) return;
      event.preventDefault();
      active = { panelIndex, pointerId: event.pointerId, startX: event.clientX, startSize: state.sizes[panelIndex], direction: panelIndex < config.primaryIndex ? 1 : -1, target: handle };
      handle.setPointerCapture?.(event.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
    handle.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        state.collapsed[panelIndex] = !state.collapsed[panelIndex];
        apply();
        commit();
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        state.sizes[panelIndex] = event.key === "Home" ? 160 : 720;
        apply();
        commit();
        return;
      }
      const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!direction) return;
      event.preventDefault();
      const visualDirection = panelIndex < config.primaryIndex ? direction : -direction;
      state.sizes[panelIndex] = clamp(state.sizes[panelIndex] + visualDirection * (event.shiftKey ? 50 : 10));
      apply();
      commit();
    });
    handle.addEventListener("dblclick", () => {
      state.sizes[panelIndex] = defaults[panelIndex];
      state.collapsed[panelIndex] = false;
      apply();
      commit();
    });
  }

  const switcher = document.createElement("div");
  switcher.className = "hf-workspace-switcher";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Workspace panels");
  for (let index = 0; index < panels.length; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = panels[index].dataset.workspacePanelLabel ?? `Panel ${index + 1}`;
    button.addEventListener("click", () => { mobilePanel = index; state.narrowPanel = index; apply(); commit(); });
    switcher.append(button);
  }
  container.append(switcher);

  const apply = () => {
    const narrow = containerNarrow;
    const tracks: string[] = [];
    panels.forEach((panel, index) => {
      const collapsed = state.collapsed[index];
      const visible = state.visible[index];
      tracks.push(index === config.primaryIndex ? "minmax(0, 1fr)" : !visible || collapsed ? "0px" : `${state.sizes[index]}px`);
      panel.hidden = narrow ? !visible || mobilePanel !== index : !visible || collapsed;
      panel.setAttribute("aria-hidden", String(panel.hidden));
      panel.style.gridColumn = narrow ? "1" : String(index * 2 + 1);
      panel.style.gridRow = "1";
      if (index < handles.length) {
        const controlledIndex = Number(handles[index].dataset.panelIndex);
        tracks.push(!state.visible[controlledIndex] ? "0px" : state.collapsed[controlledIndex] ? "24px" : "10px");
      }
    });
    container.style.gap = "0";
    container.style.gridTemplateColumns = narrow ? "minmax(0, 1fr)" : tracks.join(" ");
    handles.forEach((handle, index) => {
      const panelIndex = Number(handle.dataset.panelIndex);
      handle.style.gridColumn = String((index + 1) * 2);
      handle.style.gridRow = "1";
      handle.hidden = narrow || !state.visible[panelIndex];
      handle.dataset.collapsed = String(state.collapsed[panelIndex]);
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", "720");
      handle.setAttribute("aria-valuenow", String(state.collapsed[panelIndex] ? 0 : state.sizes[panelIndex]));
      const label = panels[panelIndex].dataset.workspacePanelLabel;
      handle.setAttribute("aria-label", `${state.collapsed[panelIndex] ? "Show" : "Resize or hide"} ${label}. Press Enter to ${state.collapsed[panelIndex] ? "show" : "hide"}; double-click to reset.`);
    });
    [...switcher.querySelectorAll<HTMLButtonElement>("button")].forEach((button, index) => {
      button.hidden = !state.visible[index];
      button.setAttribute("aria-pressed", String(index === mobilePanel));
    });
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  };
  const commit = () => onCommit({ sizes: [...state.sizes], collapsed: [...state.collapsed], visible: [...state.visible], narrowPanel: state.narrowPanel });
  const onPointerMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    state.sizes[active.panelIndex] = clamp(active.startSize + (event.clientX - active.startX) * active.direction);
    apply();
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    if (active.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    active = undefined;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    commit();
  };
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (width <= 0) return;
    const next = width <= 900;
    if (next === containerNarrow) return;
    containerNarrow = next;
    apply();
  }) : undefined;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerEnd);
  window.addEventListener("pointercancel", onPointerEnd);
  resizeObserver?.observe(container);
  apply();

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    resizeObserver?.disconnect();
    cancelAnimationFrame(resizeFrame);
    if (active?.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    active = undefined;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    handles.forEach((handle) => handle.remove());
    switcher.remove();
    panels.forEach((panel, index) => {
      panel.hidden = false;
      delete panel.dataset.workspacePanel;
      delete panel.dataset.workspacePanelLabel;
      panel.removeAttribute("aria-hidden");
      restoreStyle(panel, originalPanelStyles[index] ?? null);
    });
    container.classList.remove("hf-resizable-workspace");
    container.style.gridTemplateColumns = original.template;
    container.style.gap = original.gap;
    container.style.position = original.position;
  };
}

function clamp(value: number) {
  return Math.min(720, Math.max(160, Number.isFinite(value) ? value : 260));
}

function validPanelIndex(value: unknown, count: number, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < count ? value : fallback;
}
