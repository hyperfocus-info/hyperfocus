import { describe, expect, test } from "bun:test";
import { editorEntityTreeDepths } from "./editor-shell";

describe("editor project hierarchy presentation", () => {
  test("computes semantic depth without reordering authored entities", () => {
    const entities = [
      { id: "grandchild", parentId: "child" },
      { id: "root" },
      { id: "child", parentId: "root" },
      { id: "other-root" },
    ];

    expect(editorEntityTreeDepths(entities)).toEqual([2, 0, 1, 0]);
    expect(entities.map((entity) => entity.id)).toEqual(["grandchild", "root", "child", "other-root"]);
  });

  test("treats an unavailable parent as a root instead of inventing depth", () => {
    expect(editorEntityTreeDepths([{ id: "orphan", parentId: "missing" }])).toEqual([0]);
  });
});
