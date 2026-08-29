import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { Toast } from "./toast";

createUiTest("Toast", () => {
  it("renders a dismiss button with tooltip-driven naming and no title", () => {
    let dismissed = false;
    render(() => <Toast message="Failed to save preset" onDismiss={() => { dismissed = true; }} />);

    const button = screen.getByRole("button", { name: "Dismiss notification" });
    expect(button.getAttribute("title")).toBeNull();

    fireEvent.click(button);
    expect(dismissed).toBe(true);
  });
});
