import { afterEach, describe, expect, test } from "bun:test";
import { installDomTooltips } from "./dom-tooltip";

afterEach(() => document.body.replaceChildren());

describe("DOM tooltip adapter", () => {
  test("caller description updates survive tooltip hide and installer disposal", async () => {
    document.body.innerHTML = '<button title="Save changes" aria-describedby="help error">Save</button>';
    const button = document.querySelector("button")!;
    const dispose = installDomTooltips(document);
    try {
      button.focus();
      const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
      expect(button.getAttribute("aria-describedby")?.split(" ")).toEqual(["help", "error", tooltip.id]);
      button.setAttribute("aria-describedby", "new-error");
      await Bun.sleep(0);
      expect(button.getAttribute("aria-describedby")?.split(" ")).toEqual(["new-error", tooltip.id]);
      button.blur();
      expect(button.getAttribute("aria-describedby")).toBe("new-error");
      button.focus();
      dispose();
      expect(button.getAttribute("aria-describedby")).toBe("new-error");
    } finally { dispose(); }
  });
  test("pointer can read the bubble after leaving the trigger", async () => {
    document.body.innerHTML = '<button title="Detailed help">Help</button>';
    const dispose = installDomTooltips(document), button = document.querySelector("button")!;
    try {
      button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      await Bun.sleep(370);
      const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
      button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
      tooltip.dispatchEvent(new PointerEvent("pointerenter"));
      await Bun.sleep(180);
      expect(tooltip.hidden).toBe(false);
      tooltip.dispatchEvent(new PointerEvent("pointerleave"));
      await Bun.sleep(180);
      expect(tooltip.hidden).toBe(true);
    } finally { dispose(); }
  });
  test("metric help is visible in a native modal's top layer", () => {
    document.body.innerHTML = '<dialog open><button title="LUFS measures perceived loudness">LUFS</button></dialog>';
    const dispose=installDomTooltips(document),button=document.querySelector('button')!;
    button.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    const tooltip=document.querySelector('[data-hf-dom-tooltip]')!;
    expect(tooltip.parentElement).toBe(document.querySelector('dialog'));
    expect(tooltip.textContent).toContain('perceived loudness');
    dispose();
  });
  test("upgrades native titles for pointer and keyboard users", () => {
    document.body.innerHTML = '<button title="Center camera">Center</button>';
    const button = document.querySelector("button")!;
    const dispose = installDomTooltips(document);
    expect(button.hasAttribute("title")).toBe(false);
    expect(button.dataset.hfTooltip).toBe("Center camera");
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.querySelector<HTMLElement>("[data-hf-dom-tooltip]")?.hidden).toBe(false);
    expect(button.getAttribute("aria-describedby")).toContain("hf-dom-tooltip");
    dispose();
  });
});
