import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { ActionMenu, MenuItem } from "./action-menu";

afterEach(() => document.body.replaceChildren());

function waitForMicrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ActionMenu", () => {
  test("anchors an accessible menu and roves focus while skipping disabled items", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const selected: string[] = [];
    const changes: boolean[] = [];
    const dispose = render(() => (
      <ActionMenu
        ariaLabel="Entity actions"
        open
        portal={false}
        onOpenChange={(open) => changes.push(open)}
        trigger={({ toggle, open, menuId }) => (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open()}
            aria-controls={menuId}
            onClick={toggle}
          >Actions</button>
        )}
      >
        <MenuItem onSelect={() => selected.push("rename")}>Rename</MenuItem>
        <MenuItem disabled onSelect={() => selected.push("duplicate")}>Duplicate</MenuItem>
        <MenuItem shortcut="Del" tone="danger" onSelect={() => selected.push("delete")}>Delete</MenuItem>
      </ActionMenu>
    ), host);
    await waitForMicrotask();

    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    const menu = document.querySelector<HTMLDivElement>('[role="menu"]')!;
    const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.getAttribute("aria-label")).toBe("Entity actions");

    items[0].focus();
    items[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(items[2]);
    items[2].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
    expect(document.activeElement).toBe(items[2]);

    items[2].click();
    await waitForMicrotask();
    expect(selected).toEqual(["delete"]);
    expect(changes).toEqual([false]);
    expect(document.activeElement).toBe(trigger);
    dispose();
  });
});
