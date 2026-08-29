import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
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
});
