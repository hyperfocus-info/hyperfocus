import { expect, test } from "bun:test";
import { createInputMapper, createMmoControllerActionFrameMapper } from "./input.ts";
import { createEntityInterpolator } from "./interpolation.ts";
import type { MmoReplicatedEntity } from "./types.ts";

function entity(id: string, x: number, y: number): MmoReplicatedEntity {
  return {
    id,
    type: "player",
    x,
    y,
    visibility: "public",
    revision: 1,
    publicData: {}
  };
}

test("input mapper maps axes actions and nearest pointer target", () => {
  const mapper = createInputMapper({
    keyBindings: { Space: "interact" },
    pointerActions: { primary: "attack" },
    targetRadius: 24,
    targetTypes: ["npc"]
  });
  const input = mapper.map({
    keys: new Set(["KeyD", "Space"]),
    pointer: { x: 11, y: 0, primaryDown: true },
    candidates: [
      { id: "ore", type: "resource", x: 10, y: 0 },
      { id: "far-npc", type: "npc", x: 40, y: 0 },
      { id: "near-npc", type: "npc", x: 12, y: 0 }
    ]
  });

  expect(input).toEqual({ dx: 1, dy: 0, action: "attack", targetId: "near-npc", aimX: 11, aimY: 0 });
});

test("controller action frame mapper normalizes buttons sticks and fallback aim", () => {
  const mapper = createMmoControllerActionFrameMapper({
    buttonBindings: [
      { button: 0, key: "Space" },
      { button: 6, key: "Mouse0" }
    ],
    aimRadius: 220,
    defaultDeadzone: 0.05,
    maxDeadzone: 0.5,
    buttonPressThreshold: 0.45
  });

  const frame = mapper.map({
    axes: [0.5, -0.5, 1, 0],
    buttons: [{ pressed: true }, {}, {}, {}, {}, {}, { value: 1 }],
    connected: true
  });

  expect([...frame.keys].sort()).toEqual(["Mouse0", "Space"]);
  expect(frame.movement.dx).toBeCloseTo(0.489, 3);
  expect(frame.movement.dy).toBeCloseTo(-0.489, 3);
  expect(frame.aimOffset).toEqual({ x: 220, y: 0 });
  expect(frame.active).toBe(true);
  expect(mapper.aimOffset({ movement: { dx: 0, dy: 1 } })).toEqual({ x: 0, y: 220 });
  expect(mapper.map({ axes: [0.04, 0, 0, 0], buttons: [], connected: true }).movement).toEqual({ dx: 0, dy: 0 });
});

test("entity interpolator holds interpolates and snaps large jumps", () => {
  const interpolator = createEntityInterpolator({ delayMs: 0, snapDistance: 50, holdMs: 100 });

  interpolator.pushSnapshot({ entities: { p: entity("p", 0, 0) } }, 0);
  expect(interpolator.get("p", 10)).toMatchObject({ x: 0, y: 0, interpolationMode: "hold" });

  interpolator.pushSnapshot({ entities: { p: entity("p", 10, 0) } }, 100);
  expect(interpolator.get("p", 50)).toMatchObject({ x: 5, y: 0, interpolationMode: "interpolate" });

  interpolator.pushSnapshot({ entities: { p: entity("p", 500, 0) } }, 200);
  expect(interpolator.get("p", 200)).toMatchObject({ x: 500, y: 0, interpolationMode: "snap" });
});

test("entity interpolator rejects invalid bounds and timestamps", () => {
  expect(() => createEntityInterpolator({ maxSamples: -1 })).toThrow("positive safe integer");
  expect(() => createEntityInterpolator({ maxSamples: Number.NaN })).toThrow("positive safe integer");
  expect(() => createEntityInterpolator({ delayMs: Number.POSITIVE_INFINITY })).toThrow("delayMs");
  expect(() => createEntityInterpolator({ snapDistance: -1 })).toThrow("snapDistance");
  expect(() => createEntityInterpolator({ holdMs: Number.NaN })).toThrow("holdMs");

  const interpolator = createEntityInterpolator();
  expect(() => interpolator.pushSnapshot({ entities: { p: entity("p", 0, 0) } }, Number.NaN)).toThrow("snapshot time");
  expect(() => interpolator.sample(Number.POSITIVE_INFINITY)).toThrow("sample time");
  expect(() => interpolator.get("p", Number.NEGATIVE_INFINITY)).toThrow("sample time");
});
