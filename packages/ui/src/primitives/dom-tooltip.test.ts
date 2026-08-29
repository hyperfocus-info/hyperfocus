import { afterEach, describe, expect, test } from "bun:test";
import { installDomTooltips } from "./dom-tooltip";

afterEach(() => document.body.replaceChildren());

describe("DOM tooltip adapter", () => {
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
