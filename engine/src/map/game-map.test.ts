import { expect, test } from "bun:test";
import { GameMap, type MapWorldBounds } from "./game-map.ts";

type TestContext = CanvasRenderingContext2D & {
  calls: string[];
  globalAlpha: number;
};

function createContext(): TestContext {
  const calls: string[] = [];
  const alphaStack: number[] = [];
  const ctx = {
    calls,
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDashOffset: 0,
    fillStyle: "#000",
    strokeStyle: "#000",
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    save: () => {
      alphaStack.push(ctx.globalAlpha);
      calls.push("save");
    },
    restore: () => {
      ctx.globalAlpha = alphaStack.pop() ?? ctx.globalAlpha;
      calls.push("restore");
    },
    beginPath: () => calls.push("beginPath"),
    closePath: () => calls.push("closePath"),
    clip: () => calls.push("clip"),
    arc: (x: number, y: number, r: number) => calls.push(`arc:${x},${y},${r}`),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect:${x},${y},${w},${h}`),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect:${x},${y},${w},${h}`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rotate: (value: number) => calls.push(`rotate:${value}`),
    scale: (x: number, y: number) => calls.push(`scale:${x},${y}`),
    drawImage: (...args: unknown[]) => calls.push(`drawImage:${args.slice(1).join(",")}`),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${x},${y}`),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
    fillText: (text: string, x: number, y: number) => calls.push(`fillText:${text}:${x},${y}:alpha=${ctx.globalAlpha}`),
    strokeText: (text: string, x: number, y: number) => calls.push(`strokeText:${text}:${x},${y}`),
    setLineDash: (pattern: number[]) => calls.push(`setLineDash:${pattern.join(",")}`),
    createLinearGradient: () => ({
      addColorStop: (offset: number, color: string) => calls.push(`colorStop:${offset},${color}`)
    }),
    measureText: (text: string) => ({ width: text.length * 8 })
  } as unknown as TestContext;
  return ctx;
}

function createFollowMap(options: Partial<ConstructorParameters<typeof GameMap>[0]> = {}) {
  const map = new GameMap({
    shape: "rectangle",
    pixelX: 10,
    pixelY: 20,
    width: 200,
    height: 100,
    zoom: 2,
    mode: "FOLLOW_TARGET",
    borderStyle: false,
    compass: false,
    ...options
  });
  map.update(0, 1000, 500, 0);
  return map;
}

function expectBounds(actual: MapWorldBounds, expected: MapWorldBounds): void {
  expect(actual.minX).toBeCloseTo(expected.minX);
  expect(actual.minY).toBeCloseTo(expected.minY);
  expect(actual.maxX).toBeCloseTo(expected.maxX);
  expect(actual.maxY).toBeCloseTo(expected.maxY);
}

test("FOLLOW_TARGET maps world to viewport pixels and exposes visible bounds", () => {
  const map = createFollowMap();

  expect(map.worldToMapSpace(1000, 500)).toEqual({ x: 110, y: 70, offMap: false });
  expect(map.worldToMapSpace(1025, 490)).toEqual({ x: 160, y: 50, offMap: false });
  expect(map.worldToMapSpace(1051, 500).offMap).toBe(true);
  expect(map.visibleWorldBounds()).toEqual({ minX: 950, minY: 475, maxX: 1050, maxY: 525 });
});

test("FREE_PAN ignores tracking update and drags opposite pointer delta", () => {
  const map = new GameMap({
    shape: "rectangle",
    pixelX: 0,
    pixelY: 0,
    width: 200,
    height: 100,
    zoom: 2,
    mode: "FREE_PAN",
    borderStyle: false,
    compass: false
  });

  map.update(0, 999, 999, Math.PI);
  expect(map.worldToMapSpace(0, 0)).toEqual({ x: 100, y: 50, offMap: false });

  map.handleInput({ x: 100, y: 50, down: true, pressed: true });
  map.handleInput({ x: 140, y: 60, down: true, moved: true });

  expect(map.state().centerWorldX).toBe(-20);
  expect(map.state().centerWorldY).toBe(-5);
});

test("FREE_PAN wheel zoom preserves world point under cursor", () => {
  const map = new GameMap({
    shape: "rectangle",
    pixelX: 0,
    pixelY: 0,
    width: 200,
    height: 100,
    zoom: 1,
    mode: "FREE_PAN",
    borderStyle: false,
    compass: false
  });
  const before = map.screenToWorldSpace(150, 50);

  map.handleInput({ x: 150, y: 50, zoomDelta: 1 });

  const after = map.screenToWorldSpace(150, 50);
  expect(map.state().zoom).toBe(2);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
});

test("draw scopes circle and rectangle clips with final restore", () => {
  const circleCtx = createContext();
  const circle = new GameMap({
    shape: "circle",
    pixelX: 10,
    pixelY: 20,
    width: 100,
    height: 80,
    zoom: 1,
    mode: "FOLLOW_TARGET",
    borderStyle: false,
    compass: false
  });

  circle.draw(circleCtx, { markers: [] });

  expect(circleCtx.calls).toEqual(["save", "beginPath", "arc:60,60,40", "clip", "restore"]);

  const rectCtx = createContext();
  createFollowMap().draw(rectCtx, { markers: [] });

  expect(rectCtx.calls).toEqual(["save", "beginPath", "rect:10,20,200,100", "clip", "restore"]);
});

test("markers cull outside bounds and clamp HUD edge indicators", () => {
  const ctx = createContext();
  const map = createFollowMap();
  const drawn: string[] = [];

  map.draw(ctx, {
    markers: [
      { id: "inside", worldX: 1000, worldY: 500, onDraw: () => drawn.push("inside") },
      { id: "outside", worldX: 2000, worldY: 500, onDraw: () => drawn.push("outside") }
    ]
  });

  expect(drawn).toEqual(["inside"]);

  const rectClamp = new GameMap({
    shape: "rectangle",
    pixelX: 0,
    pixelY: 0,
    width: 200,
    height: 100,
    zoom: 1,
    mode: "FOLLOW_TARGET",
    borderStyle: false,
    compass: false
  });
  const clampedRect: Array<{ x: number; y: number }> = [];
  rectClamp.draw(ctx, {
    markers: [{ id: "edge", worldX: 200, worldY: 20, clampToEdge: true, onDraw: (_ctx, x, y) => clampedRect.push({ x, y }) }]
  });
  expect(clampedRect[0].x).toBeCloseTo(200);
  expect(clampedRect[0].y).toBeCloseTo(60);

  const circleClamp = new GameMap({
    shape: "circle",
    pixelX: 50,
    pixelY: 50,
    width: 100,
    height: 100,
    zoom: 1,
    mode: "FOLLOW_TARGET",
    borderStyle: false,
    compass: false
  });
  const clampedCircle: Array<{ x: number; y: number }> = [];
  circleClamp.draw(ctx, {
    markers: [{ id: "edge", worldX: 100, worldY: 0, clampToEdge: true, onDraw: (_ctx, x, y) => clampedCircle.push({ x, y }) }]
  });
  expect(clampedCircle[0].x).toBeCloseTo(150);
  expect(clampedCircle[0].y).toBeCloseTo(100);
});

test("routes use dashed canvas paths, reset dash state, and cull offscreen routes", () => {
  const ctx = createContext();
  const map = createFollowMap();

  map.draw(ctx, {
    markers: [],
    routes: [
      {
        points: [{ x: 1000, y: 500 }, { x: 1020, y: 500 }],
        color: "#fff",
        lineWidth: 3,
        dashPattern: [4, 4]
      },
      {
        points: [{ x: 2000, y: 2000 }, { x: 2020, y: 2020 }],
        color: "#f00",
        lineWidth: 3
      }
    ]
  });

  expect(ctx.calls).toContain("setLineDash:4,4");
  expect(ctx.calls).toContain("moveTo:110,70");
  expect(ctx.calls).toContain("lineTo:150,70");
  expect(ctx.calls).toContain("stroke");
  expect(ctx.calls).toContain("setLineDash:");
  expect(ctx.calls.filter((call) => call.startsWith("moveTo:")).length).toBe(1);
});

test("zone labels respect zoom threshold, fade, and restore alpha", () => {
  const hiddenCtx = createContext();
  createFollowMap({ zoom: 1 }).draw(hiddenCtx, {
    markers: [],
    labels: [{ text: "THE FROSTMAW PEAKS", worldX: 1000, worldY: 500, font: "20px serif", color: "#fff", minZoomToShow: 1.5 }]
  });
  expect(hiddenCtx.calls.some((call) => call.startsWith("fillText:THE FROSTMAW PEAKS"))).toBe(false);

  const visibleCtx = createContext();
  createFollowMap({ zoom: 1.5 }).draw(visibleCtx, {
    markers: [],
    labels: [{ text: "THE FROSTMAW PEAKS", worldX: 1000, worldY: 500, font: "20px serif", color: "#fff", minZoomToShow: 1.5 }]
  });
  expect(visibleCtx.calls.some((call) => call.startsWith("fillText:THE FROSTMAW PEAKS"))).toBe(true);

  const fadedCtx = createContext();
  createFollowMap({ zoom: 1.625, labelFadeZoomRange: 0.25 }).draw(fadedCtx, {
    markers: [],
    labels: [{ text: "FROST", worldX: 1000, worldY: 500, font: "20px serif", color: "#fff", minZoomToShow: 1.5 }]
  });
  expect(fadedCtx.calls.find((call) => call.startsWith("fillText:FROST"))).toContain("alpha=0.5");
  expect(fadedCtx.globalAlpha).toBe(1);
});

test("terrain receives conservative rotated culling bounds", () => {
  const ctx = createContext();
  let received: MapWorldBounds | undefined;
  const map = createFollowMap({
    rotateWithTracking: true,
    onDrawTerrain: (_ctx, bounds) => {
      received = bounds;
    }
  });

  map.update(0, 1000, 500, Math.PI / 2);
  map.draw(ctx, { markers: [] });

  expect(received).toBeDefined();
  expectBounds(received as MapWorldBounds, { minX: 975, minY: 450, maxX: 1025, maxY: 550 });
});

test("legend draws outside map clip with its own scoped panel state", () => {
  const ctx = createContext();
  createFollowMap().draw(ctx, { markers: [] });
  const callsBeforeLegend = ctx.calls.length;

  createFollowMap().drawLegend(ctx, { x: 4, y: 8, w: 120, h: 80 }, [
    { color: "#f00", label: "Quest" },
    { color: "#0f0", label: "Gate" }
  ]);

  const legendCalls = ctx.calls.slice(callsBeforeLegend);
  expect(legendCalls[0]).toBe("save");
  expect(legendCalls).toContain("fillRect:4,8,120,80");
  expect(legendCalls.filter((call) => call === "fill").length).toBe(2);
  expect(legendCalls.filter((call) => call.startsWith("fillText:")).length).toBe(2);
  expect(legendCalls).not.toContain("clip");
  expect(legendCalls.at(-1)).toBe("restore");
});

test("map options reject invalid zoom ranges and unbounded border work", () => {
  expect(() => new GameMap({
    shape: "circle",
    pixelX: 0,
    pixelY: 0,
    width: 100,
    height: 100,
    zoom: 1,
    minZoom: 2,
    maxZoom: 1,
    mode: "FOLLOW_TARGET"
  })).toThrow(/minZoom/);

  expect(() => new GameMap({
    shape: "circle",
    pixelX: 0,
    pixelY: 0,
    width: 100,
    height: 100,
    zoom: 1,
    mode: "FOLLOW_TARGET",
    borderStyle: { tickCount: Infinity }
  })).toThrow(/tickCount/);
});

test("negative route phases wrap across segment colors", () => {
  const ctx = createContext();
  const map = createFollowMap();

  map.draw(ctx, {
    markers: [],
    routes: [{
      points: [{ x: 1000, y: 500 }, { x: 1010, y: 500 }],
      color: "fallback",
      lineWidth: 1,
      segmentColors: ["red", "blue"],
      phaseOffset: -1
    }]
  });

  expect(ctx.strokeStyle).not.toBe("fallback");
});
