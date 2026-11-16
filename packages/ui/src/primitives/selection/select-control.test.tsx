import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { SelectControl } from "./select-control";

afterEach(() => document.body.replaceChildren());

function nextMicrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SelectControl", () => {
  test("disabling an already open selector freezes existing options", async () => {
    const [disabled, setDisabled] = createSignal(false);
    const [value, setValue] = createSignal("a");
    const dispose = render(() => <SelectControl ariaLabel="Category" value={value()} options={[{ value: "a", label: "Original" }, { value: "b", label: "Other" }]} disabled={disabled()} onChange={setValue}/>, document.body);
    try {
      document.querySelector<HTMLButtonElement>('[aria-label="Category"]')!.click(); await nextMicrotask();
      const option = document.querySelector<HTMLButtonElement>('[data-select-option="b"]')!;
      setDisabled(true); expect(option.disabled).toBe(true);
      option.click(); expect(value()).toBe("a");
      option.dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(value()).toBe("a");
      setDisabled(false); option.click(); expect(value()).toBe("b");
    } finally { dispose(); }
  });
  test("creation has a separate keyboard action even when the list is empty", async () => {
    const queries: string[] = [];
    const dispose = render(() => <SelectControl ariaLabel="Category" value="" options={[]} searchable onChange={() => { throw new Error("Do not accept arbitrary text"); }} onCreate={query => queries.push(query)} />, document.body);
    try {
      const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Category"]')!;
      expect(trigger.disabled).toBe(false); trigger.click(); await nextMicrotask();
      const search = document.querySelector<HTMLInputElement>('[aria-label="Search Category"]')!;
      search.value = "  Supplies  "; search.dispatchEvent(new Event("input", { bubbles: true }));
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      const create = document.querySelector<HTMLButtonElement>('[data-select-create]')!;
      expect(create.textContent).toBe("Add new…"); expect(document.activeElement === create).toBe(true);
      expect(create.getAttribute("role")).not.toBe("option");
      create.click(); await nextMicrotask();
      expect(queries).toEqual(["Supplies"]); expect(trigger.dataset.selectValue).toBe("");
      expect(document.activeElement === trigger).toBe(true); expect(document.querySelector('[role="dialog"]')).toBeNull();
    } finally { dispose(); }
  });

  test("keyboard creation remains reachable with matching choices and hands focus to the host form", async () => {
    const [disabled, setDisabled] = createSignal(false);
    const target = document.createElement("input"); document.body.append(target);
    const queries: string[] = [];
    const dispose = render(() => <SelectControl ariaLabel="Contact" value="a" options={[{ value: "a", label: "Ada" }, { value: "b", label: "Unavailable", disabled: true }]} searchable disabled={disabled()} onChange={() => {}} onCreate={query => { queries.push(query); target.focus(); }} createLabel="Add contact" />, document.body);
    try {
      document.querySelector<HTMLButtonElement>('[aria-label="Contact"]')!.click(); await nextMicrotask();
      const search = document.querySelector<HTMLInputElement>('[aria-label="Search Contact"]')!;
      search.value = "Ada"; search.dispatchEvent(new Event("input", { bubbles: true }));
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      const option = document.querySelector<HTMLButtonElement>('[role="option"]')!;
      expect(document.activeElement === option).toBe(true);
      option.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      const create = document.querySelector<HTMLButtonElement>('[data-select-create]')!;
      expect(document.activeElement === create).toBe(true);
      create.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      expect(document.activeElement === option).toBe(true);
      option.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      expect(document.activeElement === create).toBe(true);
      setDisabled(true); expect(create.disabled).toBe(true); create.click(); expect(queries).toEqual([]);
      setDisabled(false); create.click(); await nextMicrotask();
      expect(queries).toEqual(["Ada"]); expect(document.activeElement === target).toBe(true);
    } finally { dispose(); }
  });

  test("keeps a focused option mounted through streamed metadata updates", async () => {
    const host=document.createElement("div");document.body.append(host);
    const [options,setOptions]=createSignal([{value:"run-a",label:"Run A",description:"Running"},{value:"run-b",label:"Run B"}]);
    let chosen="";
    const dispose=render(()=><SelectControl ariaLabel="Streamed runs" value="run-b" options={options()} onChange={value=>{chosen=value;}}/>,host);
    try {
      host.querySelector<HTMLButtonElement>("button")!.click();await nextMicrotask();
      const option=document.querySelector<HTMLButtonElement>('[data-select-option="run-a"]')!;option.focus();
      setOptions([{value:"run-a",label:"Run A",description:"Validating"},{value:"run-b",label:"Run B"}]);
      expect(document.querySelector('[data-select-option="run-a"]') === option).toBe(true);
      expect(document.activeElement === option).toBe(true);
      expect(option.textContent).toBe("Run A");
      expect(document.getElementById(option.getAttribute("aria-describedby")!)?.textContent).toBe("Validating");
      setOptions([{value:"run-b",label:"Run B"},{value:"run-a",label:"Run A",description:"Validating"}]);
      expect(document.querySelector('[data-select-option="run-a"]') === option).toBe(true);option.click();
      expect(chosen).toBe("run-a");
    } finally {dispose();}
  });
  test("uses a labeled button and listbox with descriptive keyboard-selectable options", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [value, setValue] = createSignal("pi");
    const dispose = render(() => (
      <SelectControl
        ariaLabel="Select agent"
        value={value()}
        options={[
          { value: "pi", label: "Pi", description: "Planner-driven runtime" },
          { value: "copilot", label: "Copilot", disabled: true },
          { value: "codex", label: "Codex CLI", description: "Local Codex runtime" },
        ]}
        onChange={setValue}
      />
    ), host);

    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Select agent"]')!;
    expect(trigger.textContent).toContain("Pi");
    expect(host.querySelector("select")).toBeNull();
    trigger.focus();
    await nextMicrotask();
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    trigger.click();
    await nextMicrotask();

    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Planner-driven runtime");
    const options = listbox.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(trigger.getAttribute("aria-controls")).toBe(listbox.id);
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[0].textContent).toBe("Pi");
    expect(document.getElementById(options[0].getAttribute("aria-describedby")!)?.textContent).toBe("Planner-driven runtime");
    options[0].focus();
    options[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    expect(document.activeElement === options[2]).toBe(true);
    options[2].click();
    await nextMicrotask();
    expect(value()).toBe("codex");
    expect(document.activeElement === trigger).toBe(true);

    const outside = document.createElement("button");
    document.body.append(outside);
    trigger.click();
    await nextMicrotask();
    outside.focus();
    await nextMicrotask();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement === outside).toBe(true);
    dispose();
  });

  test("searches large option sets immediately and filters them by tags", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const searches: string[] = [];
    const options = Array.from({ length: 10 }, (_, index) => ({
      value: `model-${index}`,
      label: index === 8 ? "Vision Pro" : `Model ${index}`,
      tags: [index % 2 ? "fast" : "deep"],
    }));
    const dispose = render(() => (
      <SelectControl
        ariaLabel="Select model"
        value="model-0"
        options={options}
        tags={[{ id: "fast", label: "Fast" }, { id: "deep", label: "Deep" }]}
        onSearch={(query) => searches.push(query)}
        onChange={() => undefined}
      />
    ), host);

    host.querySelector<HTMLButtonElement>('[aria-label="Select model"]')!.click();
    await nextMicrotask();
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search Select model"]')!;
    search.value = "vision";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(searches).toEqual(["vision"]);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(document.querySelector('[role="option"]')?.textContent).toContain("Vision Pro");

    search.value = "";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(5);
    dispose();
  });
});
