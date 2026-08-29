import { describe, expect, it } from "bun:test";
import { shouldHandleCardSurfaceAction, shouldStartCardDrag } from "./fx-card-drag";

describe("FX card drag gating", () => {
  it("allows card surface actions from non-interactive card surfaces", () => {
    const root = document.createElement("section");
    const title = document.createElement("div");
    const text = document.createElement("span");
    text.textContent = "PadPilot";
    title.append(text);
    root.append(title);

    expect(shouldHandleCardSurfaceAction(text, root)).toBe(true);
    expect(shouldStartCardDrag(text, root, undefined, "mouse")).toBe(true);
  });

  it("requires the explicit drag handle before starting a touch drag", () => {
    const root = document.createElement("section");
    const grip = document.createElement("span");
    const gripIcon = document.createElement("svg");
    const text = document.createElement("span");

    grip.setAttribute("data-drag-handle", "true");
    text.textContent = "PadPilot";
    grip.append(gripIcon);
    root.append(grip, text);

    expect(shouldStartCardDrag(gripIcon, root, undefined, "touch")).toBe(true);
    expect(shouldStartCardDrag(text, root, undefined, "touch")).toBe(false);
    expect(shouldStartCardDrag(text, root, undefined, "mouse")).toBe(true);
  });

  it("blocks drag from interactive descendants and explicit opt-outs", () => {
    const root = document.createElement("section");
    const button = document.createElement("button");
    const input = document.createElement("input");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    const noDrag = document.createElement("div");

    editable.setAttribute("contenteditable", "true");
    noDrag.setAttribute("data-no-drag", "true");

    root.append(button, input, select, editable, noDrag);

    expect(shouldHandleCardSurfaceAction(button, root)).toBe(false);
    expect(shouldStartCardDrag(button, root, undefined, "mouse")).toBe(false);
    expect(shouldStartCardDrag(input, root, undefined, "mouse")).toBe(false);
    expect(shouldStartCardDrag(select, root, undefined, "mouse")).toBe(false);
    expect(shouldStartCardDrag(editable, root, undefined, "mouse")).toBe(false);
    expect(shouldStartCardDrag(noDrag, root, undefined, "mouse")).toBe(false);
  });
});
