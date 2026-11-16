import { afterEach, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Popover } from "../popover";
import { SelectControl } from "../selection/select-control";

const nativeResizeObserver = globalThis.ResizeObserver;
afterEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: nativeResizeObserver });
});

function nextMicrotask() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function element(selector: string) {
  const result = document.querySelector<HTMLElement>(selector);
  if (!result) throw new Error(`Missing element: ${selector}`);
  return result;
}

function renderNestedSelect() {
  const host = document.createElement("div");
  document.body.append(host);
  const [value, setValue] = createSignal("month");
  const changes: boolean[] = [];
  const dispose = render(() => <>
    <button data-outside="">Outside</button>
    <Popover ariaLabel="Period settings" autoFocus onOpenChange={open => changes.push(open)}
      trigger={toggle => <button data-period-trigger="" onClick={toggle}>Period</button>}>
      <SelectControl ariaLabel="Period preset" tooltip={false} value={value()} onChange={setValue}
        options={[{ value: "month", label: "This month" }, { value: "year", label: "This year" }]} />
      <button data-parent-action="">Apply period</button>
    </Popover>
  </>, host);
  return { dispose, value, changes };
}

test("keeps a parent popover open through portaled SelectControl focus and selection", async () => {
  const fixture = renderNestedSelect();
  try {
    element("[data-period-trigger]").click();
    await nextMicrotask();
    const parent = element('[role="dialog"][aria-label="Period settings"]');
    const trigger = element('button[aria-label="Period preset"]');
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await nextMicrotask();

    const listbox = element('[role="listbox"][aria-label="Period preset"]');
    expect(parent.contains(listbox)).toBe(false);
    expect(parent.isConnected).toBe(true);
    expect(document.activeElement).toBe(element('[data-select-option="month"]'));
    const option = element('[data-select-option="year"]');
    option.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(document.activeElement).toBe(option);
    option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(option.isConnected).toBe(true);
    option.click();
    await nextMicrotask();

    expect(fixture.value()).toBe("year");
    expect(trigger.textContent).toContain("This year");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(parent.isConnected).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(fixture.changes).toEqual([true]);
  } finally { fixture.dispose(); }
});

test.each(["pointerdown", "focusin"] as const)("only the top popover handles outside %s", async eventType => {
  const fixture = renderNestedSelect();
  const interact = (target: HTMLElement) => {
    if (eventType === "pointerdown") target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    else target.focus();
  };
  try {
    const outerTrigger = element("[data-period-trigger]");
    outerTrigger.click();
    await nextMicrotask();
    const parent = element('[role="dialog"][aria-label="Period settings"]');
    const trigger = element('button[aria-label="Period preset"]');
    trigger.click();
    // Exercise pointer ownership before the child's queued autofocus can mask it.
    const option = element('[data-select-option="year"]');
    interact(option);
    expect(parent.isConnected).toBe(true);
    expect(option.isConnected).toBe(true);
    await nextMicrotask();

    const outside = element("[data-outside]");
    interact(outside);
    await nextMicrotask();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(parent.isConnected).toBe(true);
    expect(fixture.changes).toEqual([true]);
    if (eventType === "focusin") expect(document.activeElement).toBe(outside);

    element("[data-parent-action]").focus();
    interact(outside);
    await nextMicrotask();
    expect(parent.isConnected).toBe(false);
    expect(outerTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(fixture.changes).toEqual([true, false]);
    expect(document.activeElement).not.toBe(outerTrigger);
    if (eventType === "focusin") expect(document.activeElement).toBe(outside);
  } finally { fixture.dispose(); }
});

test("Escape closes nested overlays one at a time and restores each trigger", async () => {
  const fixture = renderNestedSelect();
  try {
    const outerTrigger = element("[data-period-trigger]");
    outerTrigger.focus();
    outerTrigger.click();
    await nextMicrotask();
    const parent = element('[role="dialog"][aria-label="Period settings"]');
    const trigger = element('button[aria-label="Period preset"]');
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await nextMicrotask();
    element('[data-select-option="month"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextMicrotask();

    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(parent.isConnected).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(fixture.changes).toEqual([true]);
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextMicrotask();
    expect(parent.isConnected).toBe(false);
    expect(document.activeElement).toBe(outerTrigger);
    expect(fixture.changes).toEqual([true, false]);
  } finally { fixture.dispose(); }
});

test("keeps growing popup content inside the viewport and stops observing after close", async () => {
  let resize: (() => void) | undefined;
  let disconnected = false;
  const observed: Element[] = [];
  function FakeResizeObserver(callback: ResizeObserverCallback) {
    const observer: ResizeObserver = { observe(element) { observed.push(element); }, unobserve() {}, disconnect() { disconnected = true; } };
    resize = () => callback([], observer);
    return observer;
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: FakeResizeObserver });
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <Popover ariaLabel="Async model choices" trigger={toggle => <button onClick={toggle}>Choose model</button>}>
    <button>Available model</button>
  </Popover>, host);
  try {
    const trigger = host.querySelector<HTMLDivElement>("[data-test-popover]");
    const button = host.querySelector<HTMLButtonElement>("button");
    if (!trigger || !button) throw new Error("Popover trigger did not render");
    trigger.getBoundingClientRect = () => new DOMRect(30, window.innerHeight - 100, 200, 30);
    button.click();
    const popup = document.querySelector<HTMLDivElement>('[role="dialog"]');
    if (!popup) throw new Error("Popover did not open");
    let height = 40;
    popup.getBoundingClientRect = () => new DOMRect(0, 0, 220, height);
    await new Promise(resolve => setTimeout(resolve, 0));
    const initialTop = Number.parseFloat(popup.style.top);
    expect(initialTop).toBe(window.innerHeight - 64);
    height = 250;
    resize?.();
    const expandedTop = Number.parseFloat(popup.style.top);
    expect(expandedTop + height).toBeLessThanOrEqual(window.innerHeight - 6);
    expect(expandedTop).toBeLessThan(initialTop);
    expect(observed).toContain(popup);
    button.click();
    expect(disconnected).toBe(true);
  } finally { dispose(); }
});
