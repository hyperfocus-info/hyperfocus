import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { Tab, TabList } from "./tab";

createUiTest("Tab", () => {
  it("moves selection with keyboard navigation", () => {
    const Demo = () => {
      const [selected, setSelected] = createSignal("one");

      return (
        <TabList ariaLabel="Demo tabs">
          <Tab selected={selected() === "one"} onClick={() => setSelected("one")}>
            One
          </Tab>
          <Tab selected={selected() === "two"} onClick={() => setSelected("two")}>
            Two
          </Tab>
        </TabList>
      );
    };

    render(() => <Demo />);

    const firstTab = screen.getByRole("tab", { name: "One" });
    const secondTab = screen.getByRole("tab", { name: "Two" });

    fireEvent.keyDown(firstTab, { key: "ArrowRight" });

    expect(secondTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(secondTab);
  });
});
