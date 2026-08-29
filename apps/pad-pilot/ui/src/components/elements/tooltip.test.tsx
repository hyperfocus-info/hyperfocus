import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { PAD_PILOT_OVERLAY_ROOT_ID } from "./overlay-root";
import { Tooltip } from "./tooltip";

createUiTest("Tooltip", () => {
  it("does not render the tooltip content initially", () => {
    render(() => (
      <Tooltip content="Helper Text">
        <button type="button">Hover me</button>
      </Tooltip>
    ));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows tooltip on mouse enter and hides on mouse leave", async () => {
    render(() => (
      <Tooltip content="Helper Text">
        <button type="button">Hover me</button>
      </Tooltip>
    ));

    const container = screen.getByTestId("tooltip-container");
    fireEvent.mouseEnter(container);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("Helper Text");
    expect(document.getElementById(PAD_PILOT_OVERLAY_ROOT_ID)?.contains(tooltip)).toBe(true);
    expect(container.getAttribute("aria-describedby")).toBe(tooltip.id);

    fireEvent.mouseLeave(container);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows tooltip on focus in and hides on focus out", async () => {
    render(() => (
      <Tooltip content="Focus Text">
        <button type="button">Focus me</button>
      </Tooltip>
    ));

    const container = screen.getByTestId("tooltip-container");
    fireEvent.focusIn(container);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("Focus Text");

    fireEvent.focusOut(container);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
