import { afterEach, describe, expect, test } from "bun:test";
import { createDomSelectControl } from "./dom-select";

afterEach(() => document.body.replaceChildren());

describe("createDomSelectControl", () => {
  test('closing a containing modal releases its open selector overlay', async () => {
    const dialog = document.createElement('dialog'), trigger = document.createElement('button');
    dialog.append(trigger);document.body.append(dialog);dialog.showModal();
    const control = createDomSelectControl({ element: trigger, options: [{ value: 'one', label: 'One' }] });
    try {
      trigger.click();await Promise.resolve();
      expect(dialog.querySelector('[data-dom-select-popup]')).not.toBeNull();
      dialog.close();await new Promise(resolve => setTimeout(resolve, 0));
      expect(dialog.querySelector('[data-dom-select-popup]')).toBeNull();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      dialog.showModal();trigger.click();await Promise.resolve();
      expect(dialog.querySelector('[data-dom-select-popup]')).not.toBeNull();
    } finally { control.dispose();dialog.close();dialog.remove(); }
  });
  test('live options preserve keyboard focus and recover when the focused option leaves', async () => {
    const trigger = document.createElement('button');document.body.append(trigger);
    const control = createDomSelectControl({ element: trigger, options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] });
    try {
      trigger.click();await Promise.resolve();
      document.querySelector<HTMLButtonElement>('[data-select-option=two]')!.focus();
      control.setOptions([{ value: 'one', label: 'One' }, { value: 'two', label: 'Updated' }, { value: 'three', label: 'Three' }]);
      expect(document.activeElement?.textContent).toContain('Updated');expect(control.focused).toBe(true);
      control.value = 'three';
      expect(document.querySelector('[data-select-option=three]')?.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement?.textContent).toContain('Updated');
      control.setOptions([{ value: 'one', label: 'One' }, { value: 'three', label: 'Three' }]);
      expect(document.activeElement).toBe(document.querySelector('[data-select-option=three]'));
      control.dispose();expect(document.querySelector('[data-dom-select-popup]')).toBeNull();
    } finally { control.dispose(); }
  });
  test("owns popup focus inside a native modal and removes the popup on disposal", async () => {
    const dialog = document.createElement('dialog'), trigger = document.createElement('button');
    dialog.append(trigger);document.body.append(dialog);dialog.showModal();
    const control = createDomSelectControl({ element: trigger, options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] });
    trigger.click();await Promise.resolve();
    const popup = dialog.querySelector<HTMLElement>('[data-dom-select-popup]')!;
    expect(popup).not.toBeNull();expect(control.focused).toBe(true);
    popup.querySelector<HTMLButtonElement>('[data-select-option=two]')!.click();
    expect(control.value).toBe('two');expect(document.activeElement).toBe(trigger);
    trigger.click();await Promise.resolve();control.dispose();
    expect(dialog.querySelector('[data-dom-select-popup]')).toBeNull();
    trigger.click();expect(dialog.querySelector('[data-dom-select-popup]')).toBeNull();
    dialog.close();dialog.remove();
  });
  test("provides descriptive listbox keyboard behavior without native select markup", async () => {
    const trigger = document.createElement("button");
    trigger.id = "runtime-choice";
    document.body.append(trigger);
    const changes: string[] = [];
    trigger.addEventListener("change", () => changes.push(trigger.dataset.selectValue ?? ""));
    const control = createDomSelectControl({
      element: trigger,
      ariaLabel: "Runtime",
      value: "pi",
      options: [
        { value: "pi", label: "Pi", description: "Planner-driven runtime" },
        { value: "codex", label: "Codex", description: "Local Codex runtime" },
      ],
    });

    trigger.click();
    await Promise.resolve();
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    const options = [...listbox.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(document.querySelector("select")).toBeNull();
    expect(options[0]?.textContent).toContain("Planner-driven runtime");
    options[0]?.focus();
    options[0]?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(options[1]);
    options[1]?.click();
    expect(control.value).toBe("codex");
    expect(changes).toEqual(["codex"]);
    expect(document.activeElement).toBe(trigger);
    control.dispose();
  });

  test("searches large tagged sets immediately", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const searches: string[] = [];
    const control = createDomSelectControl({
      element: trigger,
      ariaLabel: "Model",
      value: "model-0",
      onSearch: (query) => searches.push(query),
      options: Array.from({ length: 10 }, (_, index) => ({
        value: `model-${index}`,
        label: index === 8 ? "Vision Pro" : `Model ${index}`,
        tags: [index % 2 ? "fast" : "deep"],
      })),
    });

    trigger.click();
    await Promise.resolve();
    const search = document.querySelector<HTMLInputElement>('[type="search"]')!;
    search.value = "vision";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(searches).toEqual(["vision"]);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(document.querySelector('[role="option"]')?.textContent).toContain("Vision Pro");
    control.dispose();
  });
});
