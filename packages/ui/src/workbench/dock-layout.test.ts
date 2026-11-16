import { describe, expect, test } from "bun:test";
import {
  activateDockPanel,
  closeDockPanel,
  createDockLayout,
  dockPanelIsOpen,
  listDockStacks,
  moveDockPanel,
  normalizeDockLayout,
  removeEmptyDock,
  resizeDockSplit,
  showDockPanel,
  splitDockStack,
  serializeDockLayout,
  parseDockLayout,
} from "./dock-layout";

const panels = ["project", "workspace", "inspector", "console"];

describe("dock layout", () => {
  test("moves panels into arbitrary tab stacks and edge splits", () => {
    let layout = createDockLayout(panels);
    layout = moveDockPanel(layout, "project", "dock-root", "left");
    const stacks = listDockStacks(layout);
    expect(layout.root).toMatchObject({ kind: "split", axis: "horizontal", ratio: 0.5 });
    expect(stacks.map((stack) => stack.panelIds)).toEqual([["project"], ["workspace", "inspector", "console"]]);
    layout = moveDockPanel(layout, "console", stacks[1]!.id, "bottom");
    expect(listDockStacks(layout).map((stack) => stack.panelIds)).toEqual([["project"], ["workspace", "inspector"], ["console"]]);
  });

  test("closes into a remembered dock and restores without changing project data", () => {
    let layout = moveDockPanel(createDockLayout(panels), "console", "dock-root", "bottom");
    const consoleDock = listDockStacks(layout).find((stack) => stack.panelIds.includes("console"))!;
    layout = closeDockPanel(layout, "console");
    expect(dockPanelIsOpen(layout, "console")).toBe(false);
    expect(layout.lastDockByPanel.console).toBe(consoleDock.id);
    layout = showDockPanel(layout, "console", { targetPanelId: "workspace", position: "left" });
    expect(listDockStacks(layout).find((stack) => stack.id === consoleDock.id)?.panelIds).toEqual(["console"]);
  });

  test("normalizes unknown panels, duplicate ids, active tabs, and split bounds", () => {
    const layout = normalizeDockLayout({
      version: 1,
      root: {
        kind: "split", id: "same", axis: "vertical", ratio: 5,
        first: { kind: "stack", id: "same", panelIds: ["project", "unknown", "project"], activePanelId: "unknown" },
        second: { kind: "stack", id: "same", panelIds: ["workspace", "project"], activePanelId: "project" },
      },
    }, panels);
    expect(layout.root).toMatchObject({ kind: "split", ratio: 0.85 });
    expect(listDockStacks(layout).map((stack) => stack.id)).toEqual(["same-2", "same-3"]);
    expect(listDockStacks(layout).map((stack) => stack.panelIds)).toEqual([["project"], ["workspace"]]);
    expect(listDockStacks(layout).map((stack) => stack.activePanelId)).toEqual(["project", "workspace"]);
  });

  test("reopens a closed sole panel in the surviving dock and filters removed identities", () => {
    let layout = moveDockPanel(createDockLayout(panels), "console", "dock-root", "bottom");
    const remembered = layout.lastDockByPanel.console;
    layout = closeDockPanel(layout, "console");
    const saved = serializeDockLayout(layout);
    const reopened = showDockPanel(parseDockLayout(saved, panels), "console");
    expect(listDockStacks(reopened)).toHaveLength(1);
    expect(listDockStacks(reopened).find(stack => stack.panelIds.includes("console"))?.id).not.toBe(remembered);
    expect(parseDockLayout(saved, panels.filter(id => id !== "console")).lastDockByPanel.console).toBeUndefined();
  });

  test("supports activation, bounded resizing, and explicit empty-dock removal", () => {
    let layout = createDockLayout(panels);
    layout = activateDockPanel(layout, "dock-root", "inspector");
    expect(listDockStacks(layout)[0]?.activePanelId).toBe("inspector");
    layout = moveDockPanel(layout, "project", "dock-root", "left");
    if (layout.root.kind !== "split") throw new Error("Expected a split layout");
    layout = resizeDockSplit(layout, layout.root.id, 0.02);
    expect(layout.root).toMatchObject({ ratio: 0.15 });
    const projectDock = listDockStacks(layout).find((stack) => stack.panelIds.includes("project"))!;
    layout = closeDockPanel(layout, "project");
    layout = removeEmptyDock(layout, projectDock.id);
    expect(listDockStacks(layout).some((stack) => stack.id === projectDock.id)).toBe(false);
  });

  test("splits an active tab away from its current stack", () => {
    const layout = splitDockStack(createDockLayout(panels), "dock-root", "inspector", "right");
    expect(listDockStacks(layout).map((stack) => stack.panelIds)).toEqual([["project", "workspace", "console"], ["inspector"]]);
  });
});
