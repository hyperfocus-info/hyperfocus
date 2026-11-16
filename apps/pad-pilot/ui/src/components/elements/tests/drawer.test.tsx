import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../../utils/tests/test-harness";
import { Drawer } from "../drawer";

createUiTest("Drawer", () => {
  it("renders complementary content and closes from the close button", () => {
    const Demo = () => {
      const [open, setOpen] = createSignal(true);
      return (
        <Drawer open={open()} onOpenChange={setOpen} title="Palette" showScrim>
          <button type="button">Inside</button>
        </Drawer>
      );
    };

    render(() => <Demo />);
    expect(screen.getByRole("complementary").getAttribute("aria-hidden")).toBe("false");
    const closeButton = screen.getByRole("button", { name: "Close drawer" });
    expect(closeButton.getAttribute("title")).toBeNull();
    fireEvent.click(closeButton);
    expect(screen.getByRole("complementary", { hidden: true }).getAttribute("aria-hidden")).toBe("true");
  });

  it("closes from the scrim when allowed", () => {
    let open = true;
    render(() => (
      <Drawer open={open} onOpenChange={(next) => { open = next; }} title="Palette" showScrim>
        <button type="button">Inside</button>
      </Drawer>
    ));

    const scrim = document.querySelector("button[aria-hidden='true']");
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim!);
    expect(open).toBe(false);
  });
});
