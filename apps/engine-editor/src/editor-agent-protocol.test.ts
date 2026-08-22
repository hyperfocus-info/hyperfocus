import { afterEach, describe, expect, test } from "bun:test";
import { createEditorAgentBridge } from "./editor-agent-protocol.ts";
import { createDefaultProject } from "./project.ts";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-editor-mode");
  globalThis.__hyperfocusEditorAgent = undefined;
});

describe("editor agent protocol", () => {
  test("executes semantic controls and returns an explicit handoff", async () => {
    document.documentElement.dataset.editorMode = "edit";
    document.body.innerHTML = `<button data-editor-action="settings">Settings</button><label>Name<input id="name" value="Before"></label><input data-component-id="behavior-player" data-component-key="speed" value="10"><canvas id="stage-canvas"></canvas><section data-workspace="stage" class="is-active"></section><span id="editor-project-state" class="is-dirty"></span><div id="editor-console-output"><div>Agent-visible diagnostic</div></div>`;
    let clicked = 0;
    document.querySelector("button")!.addEventListener("click", () => { clicked += 1; });
    const bridge = createEditorAgentBridge({ getProject: () => createDefaultProject("Agent Test"), isReady: () => true });

    const handoff = await bridge.perform({
      requestId: "request-1",
      intent: "Open settings and rename the visible field",
      actions: [
        { type: "click", target: { editorAction: "settings" } },
        { type: "input", target: { selector: "#name" }, value: "After" },
      ],
    });

    expect(clicked).toBe(1);
    expect((document.querySelector("#name") as HTMLInputElement).value).toBe("After");
    expect(handoff.ok).toBe(true);
    expect(handoff.completedActions).toBe(2);
    expect(handoff.snapshot.project.name).toBe("Agent Test");
    expect(handoff.snapshot.projectDirty).toBe(true);
    expect(handoff.snapshot.controls.some((control) => control.label === "Settings")).toBe(true);
    expect(handoff.snapshot.controls.some((control) => "selector" in control.target && control.target.selector.includes("data-component-key"))).toBe(true);
    expect(handoff.snapshot.controls.some((control) => "selector" in control.target && control.target.selector === "#stage-canvas")).toBe(true);
    expect(handoff.snapshot.messages).toContain("Agent-visible diagnostic");
  });

  test("stops at the failed action and records the unresolved handoff", async () => {
    document.body.innerHTML = `<button id="present">Present</button>`;
    const bridge = createEditorAgentBridge({ getProject: () => createDefaultProject() });
    const handoff = await bridge.perform({
      requestId: "request-2",
      intent: "Exercise failure reporting",
      actions: [
        { type: "click", target: { selector: "#missing" } },
        { type: "click", target: { selector: "#present" } },
      ],
    });

    expect(handoff.ok).toBe(false);
    expect(handoff.completedActions).toBe(0);
    expect(handoff.results).toHaveLength(1);
    expect(handoff.next.unresolved[0]).toContain("#missing");
  });

  test("rejects unbounded waits and invalid plans", async () => {
    const bridge = createEditorAgentBridge({ getProject: () => createDefaultProject() });
    expect(() => bridge.perform({ requestId: "", intent: "No id", actions: [] })).toThrow("requestId");
    const handoff = await bridge.perform({ requestId: "request-3", intent: "Wait safely", actions: [{ type: "wait", milliseconds: 10_001 }] });
    expect(handoff.ok).toBe(false);
    expect(handoff.error).toContain("10000");
  });
});
