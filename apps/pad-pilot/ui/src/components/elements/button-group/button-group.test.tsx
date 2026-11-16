import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../../utils/tests/test-harness";
import { ButtonGroup } from "./button-group";

createUiTest("ButtonGroup", () => {
  it("collapses into a keyboard-safe menu and closes after an action", async () => {
    const OriginalResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: function (callback: ResizeObserverCallback) {
 const observer: ResizeObserver = { observe(target) { callback([{ target, contentRect: new DOMRect(0, 0, 120, 0), borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], observer); }, disconnect() {}, unobserve() {} };
 return observer;
} });

    try {
      let invoked = false;
      render(() => (
        <ButtonGroup collapseWidth={320}>
          <ButtonGroup.Item onClick={() => { invoked = true; }} tooltip="Undo">Undo</ButtonGroup.Item>
          <ButtonGroup.Item tooltip="Redo">Redo</ButtonGroup.Item>
        </ButtonGroup>
      ));
      await Promise.resolve();

      const trigger = screen.getByRole("button", { name: "More actions" });
      trigger.focus();
      fireEvent.click(trigger);
      await Promise.resolve();
      const menu = screen.getByRole("menu", { name: "More actions" });
      const undo = screen.getByRole("menuitem", { name: "Undo" });
      const redo = screen.getByRole("menuitem", { name: "Redo" });
      expect(menu).toBeTruthy();
      fireEvent.keyDown(undo, { key: "ArrowDown" });
      expect(document.activeElement === redo).toBe(true);
      fireEvent.click(undo);
      expect(invoked).toBe(true);
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  it("restores trigger focus when Escape closes the collapsed menu", async () => {
    const OriginalResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: function (callback: ResizeObserverCallback) {
 const observer: ResizeObserver = { observe(target) { callback([{ target, contentRect: new DOMRect(0, 0, 120, 0), borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], observer); }, disconnect() {}, unobserve() {} };
 return observer;
} });

    try {
      render(() => (
        <ButtonGroup collapseWidth={320}>
          <ButtonGroup.Item tooltip="Undo">Undo</ButtonGroup.Item>
        </ButtonGroup>
      ));
      await Promise.resolve();
      const trigger = screen.getByRole("button", { name: "More actions" });
      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.keyDown(window, { key: "Escape" });
      await Promise.resolve();
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement === trigger).toBe(true);
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });
});
