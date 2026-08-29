export type PanelAxis = "horizontal" | "vertical";

export type PanelCollapseMode = "none" | "hidden";

export type PanelLayoutDescriptor = {
  id: string;
  label: string;
  axis: PanelAxis;
  minimumSize: number;
  defaultSize: number;
  maximumSize: number;
  collapseMode: PanelCollapseMode;
  persistenceScope: string;
};

export type PanelLayoutValue = {
  size: number;
  collapsed: boolean;
};

export type PanelGroupLayout = Readonly<Record<string, Readonly<PanelLayoutValue>>>;

export type PanelGroupLayoutInput = Readonly<Record<string, Partial<PanelLayoutValue> | undefined>>;

export function assertPanelLayoutDescriptors(descriptors: readonly PanelLayoutDescriptor[]): void {
  if (descriptors.length === 0) throw new Error("PanelGroup requires at least one panel descriptor");

  const ids = new Set<string>();
  const axis = descriptors[0]!.axis;
  for (const descriptor of descriptors) {
    if (!descriptor.id.trim()) throw new Error("PanelGroup panel ids must be non-empty strings");
    if (ids.has(descriptor.id)) throw new Error(`PanelGroup panel id \"${descriptor.id}\" is duplicated`);
    ids.add(descriptor.id);
    if (!descriptor.label.trim()) throw new Error(`PanelGroup panel \"${descriptor.id}\" requires a label`);
    if (descriptor.axis !== axis) throw new Error("A PanelGroup cannot mix horizontal and vertical panel axes");
    if (!descriptor.persistenceScope.trim()) throw new Error(`PanelGroup panel \"${descriptor.id}\" requires a persistence scope`);
    if (!Number.isFinite(descriptor.minimumSize) || descriptor.minimumSize < 0) {
      throw new Error(`PanelGroup panel \"${descriptor.id}\" has an invalid minimum size`);
    }
    if (!Number.isFinite(descriptor.maximumSize) || descriptor.maximumSize < descriptor.minimumSize) {
      throw new Error(`PanelGroup panel \"${descriptor.id}\" has an invalid maximum size`);
    }
    if (!Number.isFinite(descriptor.defaultSize)) {
      throw new Error(`PanelGroup panel \"${descriptor.id}\" has an invalid default size`);
    }
  }
}

export function normalizePanelGroupLayout(
  descriptors: readonly PanelLayoutDescriptor[],
  input: PanelGroupLayoutInput = {},
): PanelGroupLayout {
  assertPanelLayoutDescriptors(descriptors);
  return Object.fromEntries(descriptors.map((descriptor) => {
    const value = input[descriptor.id];
    return [descriptor.id, {
      size: clampPanelSize(descriptor, value?.size),
      collapsed: descriptor.collapseMode !== "none" && value?.collapsed === true,
    }];
  }));
}

export function resizePanelGroupPanel(
  descriptors: readonly PanelLayoutDescriptor[],
  layout: PanelGroupLayoutInput,
  panelId: string,
  size: number,
): PanelGroupLayout {
  const descriptor = requirePanelDescriptor(descriptors, panelId);
  return normalizePanelGroupLayout(descriptors, {
    ...layout,
    [panelId]: { ...layout[panelId], size: clampPanelSize(descriptor, size) },
  });
}

export function resetPanelGroupPanel(
  descriptors: readonly PanelLayoutDescriptor[],
  layout: PanelGroupLayoutInput,
  panelId: string,
): PanelGroupLayout {
  const descriptor = requirePanelDescriptor(descriptors, panelId);
  return resizePanelGroupPanel(descriptors, layout, panelId, descriptor.defaultSize);
}

export function togglePanelGroupPanel(
  descriptors: readonly PanelLayoutDescriptor[],
  layout: PanelGroupLayoutInput,
  panelId: string,
): PanelGroupLayout {
  const descriptor = requirePanelDescriptor(descriptors, panelId);
  const normalized = normalizePanelGroupLayout(descriptors, layout);
  if (descriptor.collapseMode === "none") return normalized;
  return normalizePanelGroupLayout(descriptors, {
    ...normalized,
    [panelId]: { ...normalized[panelId]!, collapsed: !normalized[panelId]!.collapsed },
  });
}

function requirePanelDescriptor(descriptors: readonly PanelLayoutDescriptor[], panelId: string): PanelLayoutDescriptor {
  assertPanelLayoutDescriptors(descriptors);
  const descriptor = descriptors.find((candidate) => candidate.id === panelId);
  if (!descriptor) throw new Error(`Unknown PanelGroup panel id \"${panelId}\"`);
  return descriptor;
}

function clampPanelSize(descriptor: PanelLayoutDescriptor, size: number | undefined): number {
  const value = typeof size === "number" && Number.isFinite(size) ? size : descriptor.defaultSize;
  return Math.min(descriptor.maximumSize, Math.max(descriptor.minimumSize, value));
}
