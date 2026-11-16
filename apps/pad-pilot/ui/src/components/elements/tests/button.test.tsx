import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../../utils/tests/test-harness";
import { Button } from "../button";

createUiTest("Button", () => {
  it("uses tooltip as the accessible name for icon-only buttons without emitting title", () => {
    render(() => (
      <Button tooltip="Settings" icon={<span aria-hidden="true">S</span>} />
    ));

    const button = screen.getByRole("button", { name: "Settings" });
    expect(button.getAttribute("data-icon-only")).toBe("true");
    expect(button.getAttribute("title")).toBeNull();
  });

  it("keeps visible text as the public label when a tooltip is also present", () => {
    render(() => <Button tooltip="Open preferences">Preferences</Button>);

    const button = screen.getByRole("button", { name: "Preferences" });
    expect(button.getAttribute("title")).toBeNull();
  });

  it("preserves disabled buttons without relying on title tooltips", () => {
    render(() => <Button disabled tooltip="Unavailable" icon={<span aria-hidden="true">X</span>} />);

    const button = screen.getByRole("button", { name: "Unavailable" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("title")).toBeNull();
  });

  it("keeps unstyled spatial buttons as direct layout children while retaining tooltip behavior", async () => {
    render(() => (
      <div data-testid="spatial-overlay">
        <Button appearance="unstyled" class="marker" tooltip="Preview slice">X</Button>
      </div>
    ));

    const button = screen.getByRole("button", { name: "Preview slice" });
    expect(button.parentElement).toBe(screen.getByTestId("spatial-overlay"));
    expect(button.className).toBe("marker");
    expect(button.getAttribute("title")).toBeNull();

    fireEvent.mouseEnter(button);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Preview slice");
  });
});
