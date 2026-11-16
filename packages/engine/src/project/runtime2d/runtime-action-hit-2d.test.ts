import { expect, test } from "bun:test";
import { hitTestPlayableAction2D, hitTestPlayableEntity2D } from "./runtime-action-hit-2d.ts";

const entity = (id: string, layer = 0) => ({ id, x: 100, y: 80, width: 40, height: 20, scale: 1, layer, components: [{ id: `${id}-sprite`, type: "sprite", enabled: true, values: { pointerAction: id } }] });

test("UI actions follow left and right text anchors at their far edges", () => {
  const left = { ...entity("choice"), components: [{ id: "ui", type: "ui", enabled: true, values: { align: "left", pointerAction: "choose" } }] };
  expect(hitTestPlayableAction2D({ entities: [left], worldPoint: { x: 139, y: 80 } })?.action).toBe("choose");
  expect(hitTestPlayableAction2D({ entities: [left], worldPoint: { x: 99, y: 80 } })).toBeUndefined();
  const right = { ...left, components: [{ ...left.components[0]!, values: { align: "right", pointerAction: "choose" } }] };
  expect(hitTestPlayableAction2D({ entities: [right], worldPoint: { x: 61, y: 80 } })?.action).toBe("choose");
  expect(hitTestPlayableAction2D({ entities: [right], worldPoint: { x: 101, y: 80 } })).toBeUndefined();
  const mirrored = { ...left, scale: -2, rotation: Math.PI / 2 };
  expect(hitTestPlayableAction2D({ entities: [mirrored], worldPoint: { x: 100, y: 2 } })?.action).toBe("choose");
});

test("rotated and scaled sprites hit their actual rectangle, including a mirrored sprite", () => {
  const sprite = { ...entity("play-note"), scale: -2, rotation: Math.PI / 2 };
  expect(hitTestPlayableAction2D({ entities: [sprite], worldPoint: { x: 100, y: 117 } })?.action).toBe("play-note");
  expect(hitTestPlayableAction2D({ entities: [sprite], worldPoint: { x: 125, y: 80 } })).toBeUndefined();
});

test("frontmost visible action wins, ties follow paint order and disabled targets do not consume input", () => {
  const first = entity("first", 8), second = entity("second", 8), invisible = { ...entity("hidden", 100), opacity: 0 };
  expect(hitTestPlayableAction2D({ entities: [second, invisible, first], worldPoint: { x: 100, y: 80 } })?.entityId).toBe("first");
  first.components[0].enabled = false;
  expect(hitTestPlayableAction2D({ entities: [second, first], worldPoint: { x: 100, y: 80 } })?.entityId).toBe("second");
});

test("screen UI remains clickable independently of a panned world and appears above world layers", () => {
  const hud = { ...entity("pause", -100), components: [{ id: "hud", type: "ui", enabled: true, values: { pointerAction: "pause", screenSpace: true } }] };
  expect(hitTestPlayableAction2D({ entities: [hud, entity("world", 999)], worldPoint: { x: 100, y: 80 }, screenPoint: { x: 100, y: 80 } })?.action).toBe("pause");
  expect(hitTestPlayableAction2D({ entities: [hud], worldPoint: { x: 900, y: 500 }, screenPoint: { x: 100, y: 80 } })?.action).toBe("pause");
});

test("editor selection shares screen geometry without requiring an action and invalid points do not hit", () => {
  const hud = { ...entity("title"), components: [{ id: "title-ui", type: "ui", enabled: true, values: { text: "Title", screenSpace: true } }] };
  expect(hitTestPlayableEntity2D({ entities: [hud], worldPoint: { x: 400, y: 400 }, screenPoint: { x: 100, y: 80 } })).toBe("title");
  expect(hitTestPlayableAction2D({ entities: [hud], worldPoint: { x: 100, y: 80 } })).toBeUndefined();
  expect(hitTestPlayableEntity2D({ entities: [entity("note")], worldPoint: { x: NaN, y: 80 } })).toBeUndefined();
});
