import { expect, test } from "bun:test";
import { clearOverlayStackForTests, isTopOverlay, registerOverlay } from "./overlay-stack";
import { registerOverlay as registerSharedOverlay } from "@hyperfocus/ui/primitives";

test("overlay stack gives the last-opened nested overlay Escape ownership", () => {
  clearOverlayStackForTests();
  const unregisterDialog = registerOverlay("dialog-test");
  const unregisterPopover = registerOverlay("popover-test");

  expect(isTopOverlay("popover-test")).toBe(true);
  expect(isTopOverlay("dialog-test")).toBe(false);

  unregisterPopover();
  expect(isTopOverlay("dialog-test")).toBe(true);
  unregisterDialog();
});

test("shared menus and Harness dialogs dismiss one layer per Escape in opening order", () => {
  clearOverlayStackForTests();
  const closed: string[] = [];
  const unregisterMenu = registerSharedOverlay({ id: "shared-menu", close: () => { closed.push("menu"); unregisterMenu(); } });
  const unregisterDialog = registerOverlay("dialog-later", { onEscape: () => { closed.push("dialog"); unregisterDialog(); } });
  try {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(closed).toEqual(["dialog"]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(closed).toEqual(["dialog", "menu"]);
  } finally { unregisterDialog(); unregisterMenu(); }
});
