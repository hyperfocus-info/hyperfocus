import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { TreeItem, TreeRoot } from "./tree";

afterEach(() => document.body.replaceChildren());

function press(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

describe("TreeRoot and TreeItem", () => {
  test("provide tree semantics and visible-item roving navigation", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => (
      <TreeRoot aria-label="Project tree">
        <TreeItem itemId="scene" label="Scene" selected expanded onExpandedChange={() => undefined}>
          <TreeItem itemId="player" label="Player" />
          <TreeItem itemId="disabled" label="Unavailable" disabled />
        </TreeItem>
        <TreeItem itemId="assets" label="Assets" />
      </TreeRoot>
    ), host);

    const tree = host.querySelector<HTMLElement>('[role="tree"]')!;
    const scene = host.querySelector<HTMLElement>('[data-tree-item="scene"]')!;
    const player = host.querySelector<HTMLElement>('[data-tree-item="player"]')!;
    const disabled = host.querySelector<HTMLElement>('[data-tree-item="disabled"]')!;
    const assets = host.querySelector<HTMLElement>('[data-tree-item="assets"]')!;
    expect(tree.getAttribute("aria-label")).toBe("Project tree");
    expect(scene.getAttribute("aria-expanded")).toBe("true");
    expect(scene.getAttribute("aria-selected")).toBe("true");
    expect(scene.tabIndex).toBe(0);
    expect(player.tabIndex).toBe(-1);

    scene.focus();
    press(scene, "ArrowDown");
    expect(document.activeElement).toBe(player);
    press(player, "ArrowDown");
    expect(document.activeElement).toBe(assets);
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    press(assets, "Home");
    expect(document.activeElement).toBe(scene);
    press(scene, "End");
    expect(document.activeElement).toBe(assets);
    dispose();
  });

  test("expands, collapses, selects, and moves between parents and children", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const expansionRequests: Array<[string, boolean]> = [];
    const selections: string[] = [];
    const dispose = render(() => (
      <TreeRoot aria-label="Objects">
        <TreeItem
          itemId="open"
          label="Open branch"
          expanded
          onExpandedChange={(expanded) => expansionRequests.push(["open", expanded])}
          onSelect={() => selections.push("open")}
        >
          <TreeItem itemId="child" label="Child" onSelect={() => selections.push("child")} />
        </TreeItem>
        <TreeItem
          itemId="closed"
          label="Closed branch"
          hasChildren
          expanded={false}
          onExpandedChange={(expanded) => expansionRequests.push(["closed", expanded])}
          onSelect={() => selections.push("closed")}
        />
      </TreeRoot>
    ), host);
    const open = host.querySelector<HTMLElement>('[data-tree-item="open"]')!;
    const child = host.querySelector<HTMLElement>('[data-tree-item="child"]')!;
    const closed = host.querySelector<HTMLElement>('[data-tree-item="closed"]')!;

    open.focus();
    press(open, "ArrowRight");
    expect(document.activeElement).toBe(child);
    press(child, "ArrowLeft");
    expect(document.activeElement).toBe(open);
    press(open, "ArrowLeft");
    expect(expansionRequests).toEqual([["open", false]]);
    closed.focus();
    press(closed, "ArrowRight");
    expect(expansionRequests).toEqual([["open", false], ["closed", true]]);
    closed.querySelector<HTMLElement>("[data-tree-expander]")!.click();
    expect(expansionRequests).toEqual([["open", false], ["closed", true], ["closed", true]]);
    press(closed, "Enter");
    expect(selections).toEqual(["closed"]);
    dispose();
  });
});
