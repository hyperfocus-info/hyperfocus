import { isRecord } from "@hyperfocus/utilities/records";
export const DOCK_LAYOUT_VERSION = 1 as const;

export type DockAxis = "horizontal" | "vertical";
export type DockDropPosition = "center" | "left" | "right" | "top" | "bottom";

export type DockStackNode = {
  kind: "stack";
  id: string;
  panelIds: readonly string[];
  activePanelId?: string;
};

export type DockSplitNode = {
  kind: "split";
  id: string;
  axis: DockAxis;
  ratio: number;
  first: DockNode;
  second: DockNode;
};

export type DockNode = DockStackNode | DockSplitNode;

export type DockLayout = {
  version: typeof DOCK_LAYOUT_VERSION;
  root: DockNode;
  lastDockByPanel: Readonly<Record<string, string>>;
};

export function createDockLayout(panelIds: readonly string[], rootId = "dock-root"): DockLayout {
  const unique = uniqueStrings(panelIds);
  return {
    version: DOCK_LAYOUT_VERSION,
    root: { kind: "stack", id: rootId, panelIds: unique, activePanelId: unique[0] },
    lastDockByPanel: Object.fromEntries(unique.map((panelId) => [panelId, rootId])),
  };
}

export function normalizeDockLayout(input: unknown, allowedPanelIds: readonly string[]): DockLayout {
  const allowed = new Set(uniqueStrings(allowedPanelIds));
  const seenPanels = new Set<string>();
  const seenNodes = new Set<string>();
  const candidate = isRecord(input) ? input : {};
  const root = normalizeNode(candidate.root, allowed, seenPanels, seenNodes)
    ?? createDockLayout([...allowed]).root;
  const stackIds = new Set(listDockStacks({ version: DOCK_LAYOUT_VERSION, root, lastDockByPanel: {} }).map((stack) => stack.id));
  const rawLastDock = isRecord(candidate.lastDockByPanel) ? candidate.lastDockByPanel : {};
  const lastDockByPanel = Object.fromEntries([...allowed].flatMap((panelId) => {
    const stackId = rawLastDock[panelId];
    if (typeof stackId === "string" && stackIds.has(stackId)) return [[panelId, stackId]];
    const current = findDockStackContaining(root, panelId);
    return current ? [[panelId, current.id]] : [];
  }));
  return { version: DOCK_LAYOUT_VERSION, root, lastDockByPanel };
}

export function listDockStacks(layout: DockLayout): readonly DockStackNode[] {
  const stacks: DockStackNode[] = [];
  visitDockNodes(layout.root, (node) => { if (node.kind === "stack") stacks.push(node); });
  return stacks;
}

export function listDockPanelIds(layout: DockLayout): readonly string[] {
  return listDockStacks(layout).flatMap((stack) => [...stack.panelIds]);
}

export function dockPanelIsOpen(layout: DockLayout, panelId: string): boolean {
  return Boolean(findDockStackContaining(layout.root, panelId));
}

export function activateDockPanel(layout: DockLayout, stackId: string, panelId: string): DockLayout {
  return updateDockStack(layout, stackId, (stack) => stack.panelIds.includes(panelId)
    ? { ...stack, activePanelId: panelId }
    : stack);
}

export function closeDockPanel(layout: DockLayout, panelId: string): DockLayout {
  const source = findDockStackContaining(layout.root, panelId);
  if (!source) return layout;
  const root = mapDockNode(layout.root, (stack) => {
    if (stack.id !== source.id) return stack;
    const panelIds = stack.panelIds.filter((candidate) => candidate !== panelId);
    return { ...stack, panelIds, activePanelId: nextActivePanel(stack, panelIds, panelId) };
  });
  return { ...layout, root, lastDockByPanel: { ...layout.lastDockByPanel, [panelId]: source.id } };
}

export function showDockPanel(
  layout: DockLayout,
  panelId: string,
  options: { targetPanelId?: string; position?: DockDropPosition } = {},
): DockLayout {
  const source = findDockStackContaining(layout.root, panelId);
  if (source) return activateDockPanel(layout, source.id, panelId);
  const remembered = layout.lastDockByPanel[panelId];
  const rememberedStack = remembered ? findDockStack(layout.root, remembered) : undefined;
  if (rememberedStack) return addDockPanel(layout, rememberedStack.id, panelId);
  const target = options.targetPanelId ? findDockStackContaining(layout.root, options.targetPanelId) : undefined;
  const fallback = target ?? listDockStacks(layout)[0];
  if (!fallback) return createDockLayout([panelId]);
  return moveDockPanel(layout, panelId, fallback.id, options.position ?? "center");
}

export function toggleDockPanel(
  layout: DockLayout,
  panelId: string,
  options: { targetPanelId?: string; position?: DockDropPosition } = {},
): DockLayout {
  return dockPanelIsOpen(layout, panelId) ? closeDockPanel(layout, panelId) : showDockPanel(layout, panelId, options);
}

export function addDockPanel(layout: DockLayout, stackId: string, panelId: string): DockLayout {
  const withoutPanel = removePanelFromStacks(layout.root, panelId);
  const target = findDockStack(withoutPanel, stackId);
  if (!target) return layout;
  const root = mapDockNode(withoutPanel, (stack) => stack.id === stackId
    ? { ...stack, panelIds: [...stack.panelIds, panelId], activePanelId: panelId }
    : stack);
  return { ...layout, root, lastDockByPanel: { ...layout.lastDockByPanel, [panelId]: stackId } };
}

/** Move a panel to an exact tab position, including across stacks. */
export function reorderDockPanel(layout: DockLayout, panelId: string, stackId: string, beforePanelId: string): DockLayout {
  if (panelId === beforePanelId) return layout;
  const moved = addDockPanel(layout, stackId, panelId);
  return updateDockStack(moved, stackId, stack => {
    const ids = stack.panelIds.filter(id => id !== panelId);
    const index = ids.indexOf(beforePanelId);
    ids.splice(index < 0 ? ids.length : index, 0, panelId);
    return { ...stack, panelIds: ids };
  });
}

export function moveDockPanel(
  layout: DockLayout,
  panelId: string,
  targetStackId: string,
  position: DockDropPosition,
): DockLayout {
  if (position === "center") return addDockPanel(layout, targetStackId, panelId);
  const targetStack = findDockStack(layout.root, targetStackId);
  if (targetStack?.panelIds.length === 1 && targetStack.panelIds[0] === panelId) return layout;
  const withoutPanel = removePanelFromStacks(layout.root, panelId);
  if (!findDockStack(withoutPanel, targetStackId)) return layout;
  const stackId = nextDockNodeId(withoutPanel, "dock");
  const splitId = nextDockNodeId(withoutPanel, "split");
  const panelStack: DockStackNode = { kind: "stack", id: stackId, panelIds: [panelId], activePanelId: panelId };
  const axis: DockAxis = position === "left" || position === "right" ? "horizontal" : "vertical";
  const before = position === "left" || position === "top";
  const root = replaceDockNode(withoutPanel, targetStackId, (target) => ({
    kind: "split",
    id: splitId,
    axis,
    ratio: 0.5,
    first: before ? panelStack : target,
    second: before ? target : panelStack,
  }));
  return { ...layout, root, lastDockByPanel: { ...layout.lastDockByPanel, [panelId]: stackId } };
}

export function splitDockStack(
  layout: DockLayout,
  stackId: string,
  panelId: string,
  position: Exclude<DockDropPosition, "center">,
): DockLayout {
  const source = findDockStack(layout.root, stackId);
  if (!source?.panelIds.includes(panelId)) return layout;
  return moveDockPanel(layout, panelId, stackId, position);
}

export function resizeDockSplit(layout: DockLayout, splitId: string, ratio: number): DockLayout {
  const root = mapAllDockNodes(layout.root, (node) => node.kind === "split" && node.id === splitId
    ? { ...node, ratio: clampRatio(ratio) }
    : node);
  return { ...layout, root };
}

export function removeEmptyDock(layout: DockLayout, stackId: string): DockLayout {
  const stack = findDockStack(layout.root, stackId);
  if (!stack || stack.panelIds.length > 0 || layout.root.id === stackId) return layout;
  const root = collapseDockNode(layout.root, stackId) ?? createDockLayout([]).root;
  const fallbackStackId = listDockStacks({ ...layout, root })[0]?.id;
  const lastDockByPanel = Object.fromEntries(Object.entries(layout.lastDockByPanel).flatMap(([panelId, remembered]) => {
    if (remembered !== stackId) return [[panelId, remembered]];
    return fallbackStackId ? [[panelId, fallbackStackId]] : [];
  }));
  return { ...layout, root, lastDockByPanel };
}

export function serializeDockLayout(layout: DockLayout): string {
  return JSON.stringify(normalizeDockLayout(layout, [...listDockPanelIds(layout), ...Object.keys(layout.lastDockByPanel)]));
}

export function parseDockLayout(input: string, allowedPanelIds: readonly string[]): DockLayout {
  const parsed: unknown = JSON.parse(input);
  if (!isRecord(parsed) || parsed.version !== DOCK_LAYOUT_VERSION) throw new Error("Unsupported dock layout");
  return normalizeDockLayout(parsed, allowedPanelIds);
}

function normalizeNode(
  value: unknown,
  allowed: ReadonlySet<string>,
  seenPanels: Set<string>,
  seenNodes: Set<string>,
): DockNode | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  const id = uniqueNodeId(typeof value.id === "string" ? value.id : "dock", seenNodes);
  if (value.kind === "stack") {
    const panelIds = Array.isArray(value.panelIds)
      ? value.panelIds.flatMap((panelId) => {
        if (typeof panelId !== "string" || !allowed.has(panelId) || seenPanels.has(panelId)) return [];
        seenPanels.add(panelId);
        return [panelId];
      })
      : [];
    const activePanelId = typeof value.activePanelId === "string" && panelIds.includes(value.activePanelId)
      ? value.activePanelId
      : panelIds[0];
    return { kind: "stack", id, panelIds, activePanelId };
  }
  if (value.kind !== "split") return undefined;
  const first = normalizeNode(value.first, allowed, seenPanels, seenNodes);
  const second = normalizeNode(value.second, allowed, seenPanels, seenNodes);
  if (!first || !second) return first ?? second;
  if (first.kind === "stack" && first.panelIds.length === 0) return second;
  if (second.kind === "stack" && second.panelIds.length === 0) return first;
  return {
    kind: "split",
    id,
    axis: value.axis === "vertical" ? "vertical" : "horizontal",
    ratio: clampRatio(value.ratio),
    first,
    second,
  };
}

/** Exchange two live panels without changing their identities or either stack's other tabs. */
export function swapDockPanels(layout: DockLayout, firstId: string, secondId: string): DockLayout {
  const first = findDockStackContaining(layout.root, firstId), second = findDockStackContaining(layout.root, secondId);
  if (!first || !second || first.id === second.id) return layout;
  const replace = (id: string) => id === firstId ? secondId : id === secondId ? firstId : id;
  const root = mapDockNode(layout.root, stack => ({ ...stack, panelIds: stack.panelIds.map(replace), activePanelId: stack.activePanelId ? replace(stack.activePanelId) : undefined }));
  return { ...layout, root, lastDockByPanel: { ...layout.lastDockByPanel, [firstId]: second.id, [secondId]: first.id } };
}

function uniqueNodeId(candidate: string, seen: Set<string>): string {
  const base = candidate.trim() || "dock";
  let id = base;
  let suffix = 2;
  while (seen.has(id)) id = `${base}-${suffix++}`;
  seen.add(id);
  return id;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function visitDockNodes(node: DockNode, visit: (node: DockNode) => void): void {
  visit(node);
  if (node.kind === "split") {
    visitDockNodes(node.first, visit);
    visitDockNodes(node.second, visit);
  }
}

function mapDockNode(node: DockNode, mapStack: (stack: DockStackNode) => DockStackNode): DockNode {
  if (node.kind === "stack") return mapStack(node);
  return { ...node, first: mapDockNode(node.first, mapStack), second: mapDockNode(node.second, mapStack) };
}

function mapAllDockNodes(node: DockNode, map: (node: DockNode) => DockNode): DockNode {
  const mapped = node.kind === "split"
    ? { ...node, first: mapAllDockNodes(node.first, map), second: mapAllDockNodes(node.second, map) }
    : node;
  return map(mapped);
}

function replaceDockNode(node: DockNode, nodeId: string, replace: (node: DockNode) => DockNode): DockNode {
  if (node.id === nodeId) return replace(node);
  if (node.kind === "stack") return node;
  return { ...node, first: replaceDockNode(node.first, nodeId, replace), second: replaceDockNode(node.second, nodeId, replace) };
}

function removePanelFromStacks(node: DockNode, panelId: string): DockNode {
  return mapDockNode(node, (stack) => {
    if (!stack.panelIds.includes(panelId)) return stack;
    const panelIds = stack.panelIds.filter((candidate) => candidate !== panelId);
    return { ...stack, panelIds, activePanelId: nextActivePanel(stack, panelIds, panelId) };
  });
}

function nextActivePanel(stack: DockStackNode, panelIds: readonly string[], removedPanelId: string): string | undefined {
  if (stack.activePanelId !== removedPanelId && stack.activePanelId && panelIds.includes(stack.activePanelId)) return stack.activePanelId;
  const removedIndex = stack.panelIds.indexOf(removedPanelId);
  return panelIds[Math.min(Math.max(0, removedIndex), Math.max(0, panelIds.length - 1))];
}

function findDockStack(node: DockNode, stackId: string): DockStackNode | undefined {
  if (node.kind === "stack") return node.id === stackId ? node : undefined;
  return findDockStack(node.first, stackId) ?? findDockStack(node.second, stackId);
}

function findDockStackContaining(node: DockNode, panelId: string): DockStackNode | undefined {
  if (node.kind === "stack") return node.panelIds.includes(panelId) ? node : undefined;
  return findDockStackContaining(node.first, panelId) ?? findDockStackContaining(node.second, panelId);
}

function updateDockStack(layout: DockLayout, stackId: string, update: (stack: DockStackNode) => DockStackNode): DockLayout {
  return { ...layout, root: mapDockNode(layout.root, (stack) => stack.id === stackId ? update(stack) : stack) };
}

function nextDockNodeId(root: DockNode, prefix: string): string {
  const ids = new Set<string>();
  visitDockNodes(root, (node) => ids.add(node.id));
  let index = 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function collapseDockNode(node: DockNode, stackId: string): DockNode | undefined {
  if (node.id === stackId) return undefined;
  if (node.kind === "stack") return node;
  const first = collapseDockNode(node.first, stackId);
  const second = collapseDockNode(node.second, stackId);
  return first && second ? { ...node, first, second } : first ?? second;
}

function clampRatio(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(0.85, Math.max(0.15, value)) : 0.5;
}
