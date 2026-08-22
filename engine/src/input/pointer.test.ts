import { expect, test } from "bun:test";
import { createCanvasObjectEvents } from "./delegation.ts";
import { canvasPointFromClient, createPointerInput, createTouchClusterTracker } from "./pointer.ts";

test("canvasPointFromClient accounts for CSS scaling", () => {
  const canvas = {
    width: 200,
    height: 100,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
  } as HTMLCanvasElement;
  expect(canvasPointFromClient(canvas, 60, 45)).toEqual({ x: 100, y: 50 });
});

function createCanvas() {
  const handlers = new Map<string, Set<(event: any) => void>>();
  return {
    width: 200,
    height: 100,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
    addEventListener(type: string, handler: (event: any) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(handler);
    },
    removeEventListener(type: string, handler: (event: any) => void) {
      handlers.get(type)?.delete(handler);
    },
    dispatch(type: string, event: any) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    }
  } as unknown as HTMLCanvasElement & { dispatch(type: string, event: any): void };
}

test("pointer input normalizes mouse and touch to canvas coordinates", () => {
  const canvas = createCanvas();
  const input = createPointerInput(canvas, { toWorld: (point) => ({ x: point.x + 5, y: point.y + 7 }) });
  const events: any[] = [];
  input.on("down", (event) => events.push(event));

  canvas.dispatch("mousedown", { clientX: 60, clientY: 45, preventDefault() {} });
  canvas.dispatch("touchstart", {
    changedTouches: [{ identifier: 9, clientX: 35, clientY: 30 }],
    preventDefault() {}
  });

  expect(events[0]).toMatchObject({ id: 1, type: "mouse", x: 100, y: 50, worldX: 105, worldY: 57, down: true, pressed: true });
  expect(events[1]).toMatchObject({ id: 9, type: "touch", x: 50, y: 20, worldX: 55, worldY: 27, down: true, pressed: true });

  input.update();
  expect(input.pointer(9)?.pressed).toBe(false);

  canvas.dispatch("touchend", {
    changedTouches: [{ identifier: 9, clientX: 35, clientY: 30 }],
    preventDefault() {}
  });
  expect(input.pointer(9)?.released).toBe(true);
  input.update();
  expect(input.pointer(9)).toBeNull();
});

test("touch cluster centroid stays continuous as fingers join and lift", () => {
  const tracker = createTouchClusterTracker();
  expect(tracker.sample([{ id: 1, x: 10, y: 20 }])).toMatchObject({ x: 10, y: 20, count: 1 });
  expect(tracker.sample([{ id: 1, x: 10, y: 20 }, { id: 2, x: 30, y: 20 }])).toMatchObject({ x: 10, y: 20, membershipChanged: true });
  expect(tracker.sample([{ id: 1, x: 12, y: 20 }, { id: 2, x: 32, y: 20 }])).toMatchObject({ x: 12, y: 20, membershipChanged: false });
  expect(tracker.sample([{ id: 2, x: 32, y: 20 }])).toMatchObject({ x: 12, y: 20, count: 1, membershipChanged: true });
  expect(tracker.sample([{ id: 2, x: 35, y: 24 }])).toMatchObject({ x: 15, y: 24 });
});

test("canvas object events delegates click and hover to topmost hit object", () => {
  const canvas = createCanvas();
  const back = { x: 0, y: 0, w: 200, h: 100 };
  const front = { x: 80, y: 40, w: 50, h: 30, layer: 1 };
  const delegated = createCanvasObjectEvents(canvas, [back, front]);
  const seen: string[] = [];

  delegated.on(back, "click", () => seen.push("back-click"));
  delegated.on(front, "enter", () => seen.push("front-enter"));
  delegated.on(front, "hover", () => seen.push("front-hover"));
  delegated.on(front, "click", () => seen.push("front-click"));

  canvas.dispatch("mousemove", { clientX: 55, clientY: 45, buttons: 0, preventDefault() {} });
  canvas.dispatch("mousedown", { clientX: 55, clientY: 45, preventDefault() {} });
  canvas.dispatch("mouseup", { clientX: 55, clientY: 45, preventDefault() {} });

  expect(seen).toEqual(["front-enter", "front-hover", "front-click"]);
  expect(delegated.hit(10, 10)).toBe(back);
});

test("canvas object events require matching down and up targets for click", () => {
  const canvas = createCanvas();
  const left = { x: 0, y: 0, w: 80, h: 100 };
  const right = { x: 80, y: 0, w: 120, h: 100 };
  const delegated = createCanvasObjectEvents(canvas, [left, right]);
  const seen: string[] = [];
  delegated.on(left, "click", () => seen.push("left"));
  delegated.on(right, "click", () => seen.push("right"));

  canvas.dispatch("mouseup", { clientX: 30, clientY: 30, preventDefault() {} });
  canvas.dispatch("mousedown", { clientX: 30, clientY: 30, preventDefault() {} });
  canvas.dispatch("mouseup", { clientX: 70, clientY: 30, preventDefault() {} });
  expect(seen).toEqual([]);
});

test("pointer input preserves same-frame edges across move and release events", () => {
  const canvas = createCanvas();
  const input = createPointerInput(canvas);

  canvas.dispatch("mousedown", { clientX: 30, clientY: 30, preventDefault() {} });
  canvas.dispatch("mousemove", { clientX: 31, clientY: 31, buttons: 1, preventDefault() {} });
  expect(input.primary()).toMatchObject({ down: true, pressed: true, moved: true, released: false });
  canvas.dispatch("mouseup", { clientX: 31, clientY: 31, preventDefault() {} });
  expect(input.primary()).toMatchObject({ down: false, pressed: true, moved: true, released: true });
});

test("pointer lifecycle reconciliation releases active pointers without blur delivery", () => {
  const canvas = createCanvas();
  const lifecycle = createCanvas();
  const visibility = Object.assign(createCanvas(), { hidden: false, visibilityState: "visible" });
  const input = createPointerInput(canvas, { lifecycleTarget: lifecycle, visibilityTarget: visibility });
  let cancellations = 0;
  input.on("cancel", () => cancellations += 1);
  canvas.dispatch("mousedown", { clientX: 30, clientY: 30, preventDefault() {} });
  lifecycle.dispatch("pagehide", new Event("pagehide"));
  expect(input.primary()).toMatchObject({ down: false, released: true });
  expect(cancellations).toBe(1);

  input.update();
  canvas.dispatch("mousedown", { clientX: 30, clientY: 30, preventDefault() {} });
  visibility.hidden = true;
  visibility.visibilityState = "hidden";
  visibility.dispatch("visibilitychange", new Event("visibilitychange"));
  expect(input.primary()?.down).toBe(false);
  expect(cancellations).toBe(2);
  input.dispose();
});

test("canvas object events deliver cancellation to the pressed target", () => {
  const canvas = createCanvas();
  const object = { x: 0, y: 0, w: 200, h: 100 };
  const delegated = createCanvasObjectEvents(canvas, [object]);
  let cancellations = 0;
  delegated.on(object, "cancel", () => cancellations += 1);

  canvas.dispatch("touchstart", {
    changedTouches: [{ identifier: 7, clientX: 30, clientY: 30 }],
    preventDefault() {}
  });
  canvas.dispatch("touchcancel", {
    changedTouches: [{ identifier: 7, clientX: 30, clientY: 30 }],
    preventDefault() {}
  });

  expect(cancellations).toBe(1);
});

test("removing the primary ended touch promotes another active touch", () => {
  const canvas = createCanvas();
  const input = createPointerInput(canvas);
  canvas.dispatch("touchstart", {
    changedTouches: [
      { identifier: 1, clientX: 20, clientY: 25 },
      { identifier: 2, clientX: 30, clientY: 35 }
    ],
    preventDefault() {}
  });
  canvas.dispatch("touchend", {
    changedTouches: [{ identifier: 2, clientX: 30, clientY: 35 }],
    preventDefault() {}
  });
  input.update();

  expect(input.primary()?.id).toBe(1);
  expect(input.primary()?.down).toBe(true);
});

test("pointer and delegated object listeners are isolated from sibling failures", () => {
  const canvas = createCanvas();
  const input = createPointerInput(canvas);
  let pointerCalls = 0;
  input.on("down", () => {
    throw new Error("pointer listener failed");
  });
  input.on("down", () => pointerCalls += 1);

  expect(() => canvas.dispatch("mousedown", { clientX: 20, clientY: 25, preventDefault() {} })).not.toThrow();
  expect(pointerCalls).toBe(1);
  expect(input.primary()?.down).toBe(true);
  input.dispose();

  const delegated = createCanvasObjectEvents(canvas, [{ x: 0, y: 0, w: 200, h: 100 }]);
  const object = delegated.hit(1, 1)!;
  let clicks = 0;
  delegated.on(object, "up", () => {
    throw new Error("object listener failed");
  });
  delegated.on(object, "click", () => clicks += 1);
  canvas.dispatch("mousedown", { clientX: 20, clientY: 25, preventDefault() {} });
  canvas.dispatch("mouseup", { clientX: 20, clientY: 25, preventDefault() {} });
  expect(clicks).toBe(1);
});
