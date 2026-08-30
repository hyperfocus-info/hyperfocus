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
    expect(document.activeElement === secondTab).toBe(true);
  });

  it("skips disabled tabs and supports vertical navigation", () => {
    const Demo = () => {
      const [selected, setSelected] = createSignal("one");
      return (
        <TabList ariaLabel="Vertical tabs" orientation="vertical">
          <Tab selected={selected() === "one"} onClick={() => setSelected("one")}>One</Tab>
          <Tab disabled selected={false} onClick={() => setSelected("two")}>Two</Tab>
          <Tab selected={selected() === "three"} onClick={() => setSelected("three")}>Three</Tab>
        </TabList>
      );
    };

    render(() => <Demo />);
    const firstTab = screen.getByRole("tab", { name: "One" });
    const thirdTab = screen.getByRole("tab", { name: "Three" });
    fireEvent.keyDown(firstTab, { key: "ArrowDown" });
    expect(thirdTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement === thirdTab).toBe(true);
  });
});
