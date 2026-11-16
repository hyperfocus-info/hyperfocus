import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Tab, TabList, TabPanel, Tabs } from "./tabs";

afterEach(() => document.body.replaceChildren());

function press(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

describe("Tabs", () => {
  test("programmatic selection reveals only the local strip without stealing focus", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [value, setValue] = createSignal("first");
    const dispose = render(() => <Tabs value={value()} onValueChange={setValue}><TabList aria-label="Sections"><Tab value="first">First</Tab><Tab value="last">Last</Tab></TabList><input aria-label="Draft" /></Tabs>, host);
    const list = host.querySelector<HTMLDivElement>('[role="tablist"]')!;
    const last = host.querySelector<HTMLButtonElement>('[data-tab-value="last"]')!;
    list.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, width: 100 });
    last.getBoundingClientRect = () => DOMRect.fromRect({ x: 180 - list.scrollLeft, width: 70 });
    const input = host.querySelector<HTMLInputElement>('input')!;
    input.focus();
    setValue("last");
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(list.scrollLeft).toBe(130);
    expect(document.activeElement).toBe(input);
    dispose();
  });
  test("links tabs and panels and exposes only the controlled panel", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [value, setValue] = createSignal("stage");
    const dispose = render(() => (
      <Tabs id="editor-mode" value={value()} onValueChange={setValue}>
        <TabList aria-label="Editor modes">
          <Tab value="stage">Stage</Tab>
          <Tab value="script">Script</Tab>
        </TabList>
        <TabPanel value="stage">Stage tools</TabPanel>
        <TabPanel value="script">Script tools</TabPanel>
      </Tabs>
    ), host);

    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const panels = host.querySelectorAll<HTMLElement>('[role="tabpanel"]');
    expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Editor modes");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].getAttribute("aria-controls")).toBe(panels[0].id);
    expect(panels[0].getAttribute("aria-labelledby")).toBe(tabs[0].id);
    expect(panels[0].hidden).toBe(false);
    expect(panels[1].hidden).toBe(true);

    tabs[1].click();
    expect(value()).toBe("script");
    dispose();
  });

  test("automatically activates arrow, Home, and End navigation while skipping disabled tabs", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [value, setValue] = createSignal("stage");
    const dispose = render(() => (
      <Tabs value={value()} onValueChange={setValue}>
        <TabList aria-label="Workspaces">
          <Tab value="stage">Stage</Tab>
          <Tab value="disabled" disabled>Unavailable</Tab>
          <Tab value="script">Script</Tab>
          <Tab value="motion">Motion</Tab>
        </TabList>
      </Tabs>
    ), host);
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    tabs[0].focus();
    press(tabs[0], "ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);
    expect(value()).toBe("script");
    press(tabs[2], "End");
    expect(document.activeElement).toBe(tabs[3]);
    expect(value()).toBe("motion");
    press(tabs[3], "Home");
    expect(document.activeElement).toBe(tabs[0]);
    expect(value()).toBe("stage");
    dispose();
  });

  test("supports manual activation and vertical arrow navigation", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [value, setValue] = createSignal("first");
    const dispose = render(() => (
      <Tabs value={value()} onValueChange={setValue} activationMode="manual" orientation="vertical">
        <TabList aria-label="Inspector views">
          <Tab value="first">First</Tab>
          <Tab value="second">Second</Tab>
        </TabList>
      </Tabs>
    ), host);
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    tabs[0].focus();
    press(tabs[0], "ArrowDown");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].tabIndex).toBe(0);
    expect(value()).toBe("first");
    press(tabs[1], "Enter");
    expect(value()).toBe("second");
    expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("vertical");
    dispose();
  });
});
