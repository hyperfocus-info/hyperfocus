import { expect, it } from "bun:test";
import { createSignal } from "solid-js";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { Popover } from "../popover";
import { clearOverlayStackForTests } from "../overlay-stack";

createUiTest("Popover focus recovery", () => {
  it("returns keyboard focus to the trigger after an option is focused and Escape dismisses", async () => {
    clearOverlayStackForTests();
    const [open, setOpen] = createSignal(false);
    render(() => <Popover open={open()} onClose={() => setOpen(false)} content={<button type="button">High effort</button>}>
      <button type="button" onClick={() => setOpen(value => !value)}>Task settings</button>
    </Popover>);
    const trigger = screen.getByRole("button", { name: "Task settings" });
    trigger.focus(); fireEvent.click(trigger);
    const choice = await screen.findByRole("button", { name: "High effort" }); choice.focus();
    fireEvent.keyDown(choice, { key: "Escape", bubbles: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "High effort" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
