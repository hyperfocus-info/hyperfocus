import { expect, test } from "bun:test";
import { render } from "solid-js/web";
import { Dialog } from "./dialog";

test("dialog wraps at a collapsed summary even when its hidden links report layout rectangles", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <Dialog open title="Import" onClose={() => {}}>
    <input aria-label="Name" />
    <details><summary>Help</summary><a href="#hidden">Hidden link</a>
      <details open><summary>Nested help</summary><button>Nested action</button></details>
    </details>
  </Dialog>, host);
  try {
    await new Promise(resolve => queueMicrotask(resolve));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    for (const element of dialog.querySelectorAll<HTMLElement>('button,input,summary,a')) {
      element.style.visibility = "visible";
      Object.defineProperty(element, "getClientRects", { value: () => [new DOMRect(0, 0, 20, 20)] });
    }
    const first = dialog.querySelector<HTMLButtonElement>('button')!;
    const details = dialog.querySelector<HTMLDetailsElement>('details')!;
    const summary = details.querySelector<HTMLElement>('summary')!;
    summary.tabIndex = 0;
    summary.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    summary.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement === first).toBe(true);
    expect(document.querySelector('[role="tooltip"]') !== null).toBe(true);
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement === summary).toBe(true);
    details.open = true;
    const last = details.querySelector<HTMLButtonElement>('button')!;
    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement === first).toBe(true);
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement === last).toBe(true);
  } finally { dispose(); host.remove(); }
});
