import { isObject as isRecord } from "@hyperfocus/utilities/records";
export const workbenchPanelLimits = {
  sidebar: { minimum: 180, maximum: 640, defaultSize: 260 },
  inspector: { minimum: 220, maximum: 720, defaultSize: 300 },
  bottom: { minimum: 120, maximum: 600, defaultSize: 220 },
};

export type WorkbenchPanelId = keyof typeof workbenchPanelLimits;

export const defaultWorkbenchLayout = {
  sidebarSize: 260,
  inspectorSize: 300,
  bottomSize: 220,
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  bottomCollapsed: false
};

export type WorkbenchLayout = typeof defaultWorkbenchLayout;

export function normalizeWorkbenchLayout(input: Partial<WorkbenchLayout> | Record<string, unknown>): WorkbenchLayout {
  return {
    sidebarSize: clamp(input.sidebarSize, workbenchPanelLimits.sidebar.minimum, workbenchPanelLimits.sidebar.maximum, defaultWorkbenchLayout.sidebarSize),
    inspectorSize: clamp(input.inspectorSize, workbenchPanelLimits.inspector.minimum, workbenchPanelLimits.inspector.maximum, defaultWorkbenchLayout.inspectorSize),
    bottomSize: clamp(input.bottomSize, workbenchPanelLimits.bottom.minimum, workbenchPanelLimits.bottom.maximum, defaultWorkbenchLayout.bottomSize),
    sidebarCollapsed: input.sidebarCollapsed === true,
    inspectorCollapsed: input.inspectorCollapsed === true,
    bottomCollapsed: input.bottomCollapsed === true
  };
}

export function resizeWorkbenchPanel(layout: WorkbenchLayout, panel: WorkbenchPanelId, size: number): WorkbenchLayout {
  const key = `${panel}Size` as const;
  return normalizeWorkbenchLayout({ ...layout, [key]: size });
}

export function resetWorkbenchPanel(layout: WorkbenchLayout, panel: WorkbenchPanelId): WorkbenchLayout {
  return resizeWorkbenchPanel(layout, panel, workbenchPanelLimits[panel].defaultSize);
}

export function toggleWorkbenchPanel(layout: WorkbenchLayout, panel: WorkbenchPanelId): WorkbenchLayout {
  const key = `${panel}Collapsed` as const;
  return normalizeWorkbenchLayout({ ...layout, [key]: !layout[key] });
}

export function serializeWorkbenchLayout(layout: WorkbenchLayout) {
  return JSON.stringify({ version: 1, layout: normalizeWorkbenchLayout(layout) });
}

export function parseWorkbenchLayout(input: string): WorkbenchLayout {
  const parsed: unknown = JSON.parse(input);
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.layout)) {
    throw new Error("Unsupported workbench layout");
  }
  return normalizeWorkbenchLayout(parsed.layout);
}



function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
