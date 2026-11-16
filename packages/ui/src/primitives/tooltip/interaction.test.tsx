import { afterEach, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Button } from "../button";
import { Tooltip } from "../tooltip";
import { registerOverlay } from "../overlay-stack";

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); });

test("tooltips preserve caller descriptions through updates, dismissal and unmount", async () => {
  const [description, setDescription] = createSignal("help error");
  const dispose = render(() => <Button tooltip="Save changes" aria-describedby={description()}>Save</Button>, document.body);
  disposers.push(dispose);
  const button = document.querySelector("button")!;
  expect(button.getAttribute("aria-describedby")).toBe("help error");
  button.focus();
  const tooltip = document.querySelector('[role="tooltip"]')!;
  expect(button.getAttribute("aria-describedby")?.split(" ")).toEqual(["help", "error", tooltip.id]);
  setDescription("updated-error");
  await Bun.sleep(0);
  expect(button.getAttribute("aria-describedby")?.split(" ")).toEqual(["updated-error", tooltip.id]);
  button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(button.getAttribute("aria-describedby")).toBe("updated-error");
  button.blur(); button.focus();
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  dispose();
  expect(button.getAttribute("aria-describedby")).toBe("updated-error");
});

test("hover can cross the trigger gap and remain over the content; focus independently retains it", async () => {
  disposers.push(render(() => <Tooltip content="A long explanation" delay={0}><button>Help</button></Tooltip>, document.body));
  const button = document.querySelector("button")!, wrapper = button.parentElement!;
  wrapper.dispatchEvent(new MouseEvent("mouseenter"));
  const tooltip = document.querySelector('[role="tooltip"]')!;
  wrapper.dispatchEvent(new MouseEvent("mouseleave"));
  tooltip.dispatchEvent(new MouseEvent("mouseenter"));
  await Bun.sleep(180);
  expect(tooltip.isConnected).toBe(true);
  button.focus();
  tooltip.dispatchEvent(new MouseEvent("mouseleave"));
  await Bun.sleep(180);
  expect(tooltip.isConnected).toBe(true);
  button.blur();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
});

test("Escape dismisses tooltip before its containing overlay and native dialogs retain top-layer content", () => {
  const dialog = document.createElement("dialog"); dialog.open = true; document.body.append(dialog);
  let closed = 0;
  const unregister = registerOverlay({ id: "tooltip-parent", element: dialog, close: () => { closed++; } });
  disposers.push(unregister);
  disposers.push(render(() => <Tooltip content="Help"><button>Action</button></Tooltip>, dialog));
  const button = dialog.querySelector("button")!; button.focus();
  expect(dialog.contains(document.querySelector('[role="tooltip"]'))).toBe(true);
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  button.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(closed).toBe(0);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(document.activeElement).toBe(button);
});

test("disabling a visible tooltip releases its description and overlay", () => {
  const [disabled, setDisabled] = createSignal(false);
  disposers.push(render(() => <Tooltip content="Help" disabled={disabled()}><button aria-describedby="hint">Action</button></Tooltip>, document.body));
  const button = document.querySelector("button")!; button.focus();
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  setDisabled(true);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(button.getAttribute("aria-describedby")).toBe("hint");
});
