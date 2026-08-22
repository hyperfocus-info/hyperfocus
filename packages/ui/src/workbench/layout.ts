export type WorkbenchLayout = {
  sidebarSize: number;
  inspectorSize: number;
  bottomSize: number;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  bottomCollapsed: boolean;
};

export const defaultWorkbenchLayout: WorkbenchLayout = {
  sidebarSize: 260,
  inspectorSize: 300,
  bottomSize: 220,
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  bottomCollapsed: false
};

export function normalizeWorkbenchLayout(input: Partial<WorkbenchLayout>): WorkbenchLayout {
  return {
    sidebarSize: clamp(input.sidebarSize, 180, 640, defaultWorkbenchLayout.sidebarSize),
    inspectorSize: clamp(input.inspectorSize, 220, 720, defaultWorkbenchLayout.inspectorSize),
    bottomSize: clamp(input.bottomSize, 120, 600, defaultWorkbenchLayout.bottomSize),
    sidebarCollapsed: input.sidebarCollapsed === true,
    inspectorCollapsed: input.inspectorCollapsed === true,
    bottomCollapsed: input.bottomCollapsed === true
  };
}

export function serializeWorkbenchLayout(layout: WorkbenchLayout) {
  return JSON.stringify({ version: 1, layout: normalizeWorkbenchLayout(layout) });
}

export function parseWorkbenchLayout(input: string): WorkbenchLayout {
  const parsed: unknown = JSON.parse(input);
  if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 || !("layout" in parsed)) {
    throw new Error("Unsupported workbench layout");
  }
  return normalizeWorkbenchLayout(parsed.layout as Partial<WorkbenchLayout>);
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value as number)) : fallback;
}

