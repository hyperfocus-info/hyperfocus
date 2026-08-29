import { afterEach, describe, expect, test } from "bun:test";
import { resolveEditorInteractionTarget } from "./editor-shell";

afterEach(() => document.body.replaceChildren());

describe("editor delegated interaction target", () => {
  test("does not treat arbitrary clicks as mode changes when the root carries styling state", () => {
    document.documentElement.dataset.editorMode = "edit";
    document.body.innerHTML = '<button id="preference-section"><span>Editor preferences</span></button><button data-editor-mode="play"><span>Play</span></button>';
    expect(resolveEditorInteractionTarget(document.querySelector("#preference-section span"))).toBeNull();
    expect(resolveEditorInteractionTarget(document.querySelector('[data-editor-mode="play"] span'))?.getAttribute("data-editor-mode")).toBe("play");
    delete document.documentElement.dataset.editorMode;
  });
});
