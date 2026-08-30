import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { Modal, getModalFocusableElements, resolveModalTabTarget } from "./modal";

createUiTest("Modal", () => {
  it("finds focusable elements and cycles tab targets through the public helpers", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <button type="button">One</button>
      <button type="button">Two</button>
      <button type="button" hidden>Hidden</button>
    `;

    const focusable = getModalFocusableElements(root);
    expect(focusable).toHaveLength(2);
    expect(resolveModalTabTarget(focusable, focusable[1]!, false)).toBe(focusable[0]);
    expect(resolveModalTabTarget(focusable, focusable[0]!, true)).toBe(focusable[1]);
  });

  it("renders dialog semantics and closes from the close button", () => {
    let closed = false;
    render(() => (
      <Modal open onClose={() => { closed = true; }} title="Settings">
        <button type="button">Primary action</button>
      </Modal>
    ));

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const closeButton = screen.getByRole("button", { name: "Close modal" });
    expect(closeButton.getAttribute("title")).toBeNull();
    fireEvent.click(closeButton);
    expect(closed).toBe(true);
  });

  it("closes on Escape when allowed", () => {
    let closed = false;
    render(() => (
      <Modal open onClose={() => { closed = true; }} title="Escape test">
        <button type="button">Focusable</button>
      </Modal>
    ));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(true);
  });

  it("restores focus to the opener after closing", async () => {
    const Demo = () => {
      const [open, setOpen] = createSignal(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open settings</button>
          <Modal open={open()} onClose={() => setOpen(false)} title="Settings">
            <button type="button">Save</button>
          </Modal>
        </>
      );
    };

    render(() => <Demo />);
    const opener = screen.getByRole("button", { name: "Open settings" });
    opener.focus();
    fireEvent.click(opener);
    await Promise.resolve();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await Promise.resolve();
    expect(document.activeElement === opener).toBe(true);
  });

  it("lets Escape dismiss only the topmost modal", () => {
    const Demo = () => {
      const [outerOpen, setOuterOpen] = createSignal(true);
      const [innerOpen, setInnerOpen] = createSignal(true);
      return (
        <>
          <Modal open={outerOpen()} onClose={() => setOuterOpen(false)} title="Outer modal">
            <span>Outer content</span>
          </Modal>
          <Modal open={innerOpen()} onClose={() => setInnerOpen(false)} title="Inner modal">
            <span>Inner content</span>
          </Modal>
        </>
      );
    };

    render(() => <Demo />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Inner modal" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Outer modal" })).toBeTruthy();
  });
});
