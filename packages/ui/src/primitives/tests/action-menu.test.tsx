import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { ActionMenu, MenuItem } from "../action-menu";
import { Button } from "../button";

afterEach(() => document.body.replaceChildren());

function waitForMicrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ActionMenu", () => {
  test('right-click and Shift+F10 use the visible menu commands on the owning row', async()=>{
    const host=document.createElement('div');document.body.append(host);const chosen:string[]=[];
    const dispose=render(()=><section data-context-row><button>Record</button><ActionMenu ariaLabel="Record actions" contextTarget={trigger=>trigger.closest<HTMLElement>('[data-context-row]')} trigger={({toggle})=><button onClick={toggle}>More</button>}><MenuItem onSelect={()=>chosen.push('copy')}>Copy path</MenuItem><MenuItem onSelect={()=>chosen.push('reveal')}>Show file</MenuItem></ActionMenu></section>,host);
    try{
      const row=host.querySelector<HTMLElement>('section')!,record=row.querySelector('button')!;
      await waitForMicrotask();record.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:180}));await waitForMicrotask();
      const menu=document.querySelector<HTMLElement>('[role="menu"]')!;expect(menu).not.toBeNull();expect(menu.style.left).toBe('200px');expect(menu.style.top).toBe('180px');
      menu.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();await waitForMicrotask();expect(chosen).toEqual(['copy']);
      record.focus();record.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));await waitForMicrotask();expect(document.querySelector('[role="menu"]')).not.toBeNull();
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await waitForMicrotask();expect(document.querySelector('[role="menu"]')).toBeNull();expect(document.activeElement?.textContent).toBe('More');
    }finally{dispose();}
  });
  test("owns menu trigger semantics when callers supply only a toggle", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const dispose = render(() => <ActionMenu ariaLabel="App menu" trigger={({ toggle }) => <Button tooltip="App menu" onClick={toggle}>Menu</Button>}><MenuItem onSelect={() => {}}>Preferences</MenuItem></ActionMenu>, host);
    try {
      const trigger = host.querySelector<HTMLButtonElement>("button")!;
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      trigger.click(); await waitForMicrotask();
      const menu = document.getElementById(trigger.getAttribute("aria-controls")!);
      expect(menu?.getAttribute("role")).toBe("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await waitForMicrotask();
      expect(trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(trigger);
    } finally { dispose(); host.remove(); }
  });

  test("navigation menus anchor to the start edge and trailing actions can request end alignment", async () => {
    for (const [align, left] of [[undefined, 200], ["end", 40]] as const) {
      const host = document.createElement('div'); document.body.append(host);
      const dispose = render(() => <ActionMenu ariaLabel="Placement" defaultOpen portal={false} align={align} trigger={({ toggle }) => <button onClick={toggle}>Open</button>}><MenuItem onSelect={() => {}}>An action</MenuItem></ActionMenu>, host);
      try {
        const trigger = host.querySelector<HTMLElement>('[data-test-popover]')!;
        const menu = host.querySelector<HTMLElement>('[role="menu"]')!;
        trigger.getBoundingClientRect = () => new DOMRect(200, 100, 80, 32);
        menu.getBoundingClientRect = () => new DOMRect(0, 0, 240, 100);
        await waitForMicrotask();
        expect(menu.style.left).toBe(`${left}px`);
        expect(menu.style.top).toBe('138px');
      } finally { dispose(); host.remove(); }
    }
  });

  test("keeps complete visible menu labels free of redundant tooltips on focus and pointer navigation", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const label = "Restore the archived project and its complete workspace configuration";
    const dispose = render(() => (
      <MenuItem aria-label="Restore archived project" onSelect={() => {}}>{label}</MenuItem>
    ), host);
    try {
      const item = host.querySelector<HTMLButtonElement>('[role="menuitem"]');
      if (!item) throw new Error("Menu item did not render");
      item.focus();
      await waitForMicrotask();
      expect(item.textContent).toBe(label);
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
      expect(item.getAttribute("aria-label")).toBe("Restore archived project");
      item.blur();
      item.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
      await waitForMicrotask();
      expect(document.activeElement).toBe(item);
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
    } finally { dispose(); }
  });

  test("retains explicit context and icon-only button tooltips", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <>
      <p id="restore-help">Unsaved changes are kept.</p>
      <MenuItem aria-describedby="restore-help" tooltip="Restore the latest saved workspace" onSelect={() => {}}>Restore</MenuItem>
      <Button size="icon" aria-label="More actions" tooltip="More actions"><span aria-hidden="true">…</span></Button>
    </>, host);
    try {
      const item = host.querySelector<HTMLButtonElement>('[role="menuitem"]');
      const button = host.querySelector<HTMLButtonElement>('[aria-label="More actions"]');
      if (!item || !button) throw new Error("Tooltip controls did not render");
      item.focus();
      await waitForMicrotask();
      const context = document.querySelector('[role="tooltip"]');
      expect(context?.textContent).toBe("Restore the latest saved workspace");
      expect(item.getAttribute("aria-describedby")).toBe(`restore-help ${context?.id}`);
      button.focus();
      await waitForMicrotask();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toBe("More actions");
      expect(button.getAttribute("aria-describedby")).toBe(tooltip?.id ?? "missing-tooltip");
    } finally { dispose(); }
  });

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
        <MenuItem aria-disabled="true" onSelect={() => selected.push("archive")}>Archive unavailable</MenuItem>
      </ActionMenu>
    ), host);
    await waitForMicrotask();

    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    const menu = document.querySelector<HTMLDivElement>('[role="menu"]')!;
    const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.getAttribute("aria-label")).toBe("Entity actions");
    expect(items[0].textContent).toBe("Rename");
    expect(items[0].getAttribute("aria-label")).toBe("Rename");

    items[0].focus();
    items[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(items[2]);
    items[2].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
    expect(document.activeElement).toBe(items[2]);

    for (const item of [items[1], items[3]]) {
      item.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
      expect(document.activeElement).toBe(items[2]);
      item.click();
    }
    expect(selected).toEqual([]);
    expect(changes).toEqual([]);

    items[2].click();
    await waitForMicrotask();
    expect(selected).toEqual(["delete"]);
    expect(changes).toEqual([false]);
    expect(document.activeElement).toBe(trigger);
    dispose();
  });
});
