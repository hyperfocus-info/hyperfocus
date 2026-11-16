/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest, requireElement } from "../../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { clearBrowserStateForTests } from "../../utils/tests/store-test-utils";
import { Dialog } from "./dialog";
import { clearOverlayStackForTests } from "./overlay-stack";
import { Popover } from "./popover";
import { ContextMenu } from "./context-menu";
import { createSignal } from "solid-js";

createUiTest("Dialog", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    clearOverlayStackForTests();
  });

  it("keeps a nested context menu keyboard-owned and closes it before its dialog", async () => {
    const [open, setOpen] = createSignal(false);
    let closedDialog = false;
    render(() => <Dialog open title="Context owner" onClose={() => { closedDialog = true; }}>
      <button onClick={() => setOpen(true)}>Open actions</button>
      <ContextMenu open={open()} x={10} y={10} ariaLabel="Actions" onClose={() => setOpen(false)} actions={[
        { id: "first", label: "First action", onSelect: () => undefined },
        { id: "disabled", label: "Unavailable action", disabled: true, onSelect: () => undefined },
        { id: "last", label: "Last action", onSelect: () => undefined },
      ]} />
    </Dialog>);
    await Promise.resolve();
    const trigger = screen.getByRole("button", { name: "Open actions" });
    trigger.focus();
    fireEvent.click(trigger);
    await Promise.resolve();
    expect(document.activeElement?.textContent).toBe("First action");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Last action");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement?.textContent).toBe("First action");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(Boolean(screen.queryByRole("menu", { name: "Actions" }))).toBe(false);
    expect(closedDialog).toBe(false);
    expect(document.activeElement === trigger).toBe(true);
  });

  it("constructs nested dialog children only once", () => {
    let constructions = 0;
    function Nested() { constructions++; return <Dialog open title="Nested confirmation">Confirm</Dialog>; }
    render(() => <Dialog open title="Parent"><Nested /></Dialog>);
    expect(constructions).toBe(1);
    expect(screen.getAllByRole("dialog", { name: "Nested confirmation" })).toHaveLength(1);
  });

  it("renders nothing when closed", () => {
    render(() => <Dialog open={false} title="Hidden dialog">Hidden body</Dialog>);

    expect(screen.queryByRole("dialog", { name: "Hidden dialog" })).toBeNull();
  });

  it("renders dialog shell, content, footer, and body class when open", async () => {
    const footerButton = document.createElement("button");
    footerButton.type = "button";
    footerButton.textContent = "Footer action";

    render(() => (
      <Dialog
        open
        title="Visible dialog"
        description="Dialog description"
        contentClass="test-dialog-body"
        footer={footerButton}
      >
        Visible body
      </Dialog>
    ));

    const dialog = await screen.findByRole("dialog", { name: "Visible dialog" });
    expect(dialog).not.toBeNull();
    expect(screen.getByText("Dialog description")).not.toBeNull();
    expect(screen.getByText("Visible body")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Footer action" })).not.toBeNull();
    expect(dialog.hasAttribute("data-test-dialog")).toBe(true);
    expect(dialog.classList.contains("surface")).toBe(true);
    expect(dialog.querySelector(".test-dialog-body")).not.toBeNull();
  });

  it("calls onClose from backdrop click and close button click", async () => {
    let closeCount = 0;
    render(() => <Dialog open title="Closable dialog" onClose={() => closeCount += 1}>Body</Dialog>);

    const dialog = await screen.findByRole("dialog", { name: "Closable dialog" });
    const backdrop = requireElement(dialog.parentElement?.previousElementSibling);

    fireEvent.click(backdrop);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(closeCount).toBe(2);
  });

  it("calls onClose from Escape", async () => {
    let closed = false;
    render(() => <Dialog open title="Escapable dialog" onClose={() => closed = true}>Body</Dialog>);

    const dialog = await screen.findByRole("dialog", { name: "Escapable dialog" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(closed).toBe(true);
  });

  it("does not close when clicking inside dialog content", async () => {
    let closed = false;
    const innerButton = document.createElement("button");
    innerButton.type = "button";
    innerButton.textContent = "Inner action";
    render(() => <Dialog open title="Stable dialog" onClose={() => closed = true}>{innerButton}</Dialog>);

    fireEvent.click(await screen.findByRole("button", { name: "Inner action" }));
    expect(closed).toBe(false);
  });

  it("traps Tab focus inside dialog", async () => {
    const firstButton = document.createElement("button");
    firstButton.type = "button";
    firstButton.textContent = "First action";
    const lastButton = document.createElement("button");
    lastButton.type = "button";
    lastButton.textContent = "Last action";
    render(() => <Dialog open title="Focused dialog"><div>{firstButton}{lastButton}</div></Dialog>);

    await screen.findByRole("dialog", { name: "Focused dialog" });
    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    lastButton.focus();
    fireEvent.keyDown(lastButton, { key: "Tab" });

    expect(document.activeElement).toBe(closeButton);
  });

  it("restores focus after close", async () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open source";
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(() => <Dialog open title="Restore focus">Body</Dialog>);
    await screen.findByRole("dialog", { name: "Restore focus" });
    await Promise.resolve();

    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("closes nested popover before dialog on Escape", async () => {
    let dialogClosed = false;
    let popoverClosed = false;
    render(() => (
      <Dialog open title="Nested dialog" onClose={() => dialogClosed = true}>
        <Popover
          open
          onClose={() => popoverClosed = true}
          content={<button type="button">Popover action</button>}
        >
          <button type="button">Open popover</button>
        </Popover>
      </Dialog>
    ));

    const popoverAction = await screen.findByText("Popover action");
    await Promise.resolve();
    fireEvent.keyDown(popoverAction, { key: "Escape" });

    expect(popoverClosed).toBe(true);
    expect(dialogClosed).toBe(false);
  });

});
