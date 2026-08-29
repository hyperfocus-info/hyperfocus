import { describe, expect, test } from "bun:test";
import { resolveEditor3DActions } from "./editor-3d-play.ts";

const project = {
  settings: {
    input: [
      { action: "move-left", bindings: ["KeyA", "ArrowLeft"] },
      { action: "move-right", bindings: ["KeyD", "ArrowRight"] },
      { action: "interact", bindings: ["KeyE"] },
    ],
  },
};

describe("editor 3D Play input", () => {
  test("maps authored bindings instead of hard-coded physical keys", () => {
    expect([...resolveEditor3DActions(project, new Set(["ArrowRight", "KeyE"]))].sort()).toEqual(["interact", "move-right"]);
  });

  test("adds portable movement actions from a gamepad dead zone", () => {
    expect([...resolveEditor3DActions(project, new Set(), [-0.8, 0.65])].sort()).toEqual(["move-down", "move-left"]);
    expect([...resolveEditor3DActions(project, new Set(), [0.1, -0.1])]).toEqual([]);
  });
});
