import { expect, test } from "bun:test";
import { createCanvasImageSourceFixture, requireCanvasContextFixture } from "../test-support/canvas.ts";
import { defaultDrawState } from "./draw-data.ts";
import {
  createActorRenderer,
  createCanvasRenderStage,
  createEffectQueue,
  createHudRenderer,
  createLinearGradientPaint,
  createRenderFramePool,
  createRadialGradientPaint,
  createRenderStage,
  createTileCacheRenderer,
  drawRenderable,
  getRenderCallBounds,
  cullRenderCallsToRect,
  cullRenderCallsToRectInto,
  createTileChunkDrawData,
  pruneExpiredTimedEffectQueue,
  pushBoundedEffect,
  renderCallIntersectsRect,
  renderablePathCommand,
  renderableRecord,
  renderArray,
  renderRecord,
  resolveSpriteSheetFrame,
  sortRenderCallsByY,
  sortRenderCallsByYInto,
  truncateText,
  updateTimedEffectQueue,
  wrapText,
  type Renderable
} from "@hyperfocus/engine/render";

function createContext() {
  const calls: string[] = [];
  return requireCanvasContextFixture({
    calls,
    canvas: { width: 320, height: 180 },
    globalAlpha: 1,
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    set fillStyle(value: string | CanvasGradient | CanvasPattern) { calls.push(`fillStyle:${typeof value === "string" ? value : "paint"}`); },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) { calls.push(`strokeStyle:${typeof value === "string" ? value : "paint"}`); },
    set globalCompositeOperation(value: GlobalCompositeOperation) { calls.push(`globalCompositeOperation:${value}`); },
    set lineDashOffset(value: number) { calls.push(`lineDashOffset:${value}`); },
    set shadowColor(value: string) { calls.push(`shadowColor:${value}`); },
    set shadowBlur(value: number) { calls.push(`shadowBlur:${value}`); },
    set shadowOffsetX(value: number) { calls.push(`shadowOffsetX:${value}`); },
    set shadowOffsetY(value: number) { calls.push(`shadowOffsetY:${value}`); },
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clearRect:${x},${y},${w},${h}`),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect:${x},${y},${w},${h}`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rotate: (value: number) => calls.push(`rotate:${value}`),
    scale: (x: number, y: number) => calls.push(`scale:${x},${y}`),
    beginPath: () => calls.push("beginPath"),
    closePath: () => calls.push("closePath"),
    arc: (x: number, y: number, r: number) => calls.push(`arc:${x},${y},${r}`),
    ellipse: (x: number, y: number, rx: number, ry: number) => calls.push(`ellipse:${x},${y},${rx},${ry}`),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${x},${y}`),
    quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => calls.push(`quadraticCurveTo:${cpx},${cpy},${x},${y}`),
    bezierCurveTo: (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => calls.push(`bezierCurveTo:${cp1x},${cp1y},${cp2x},${cp2y},${x},${y}`),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    drawImage: (...args: unknown[]) => calls.push(`drawImage:${args.slice(1).join(",")}`),
    fillText: (text: string, x: number, y: number, maxWidth?: number) => calls.push(`fillText:${text},${x},${y},${maxWidth ?? ""}`),
    strokeText: (text: string, x: number, y: number, maxWidth?: number) => calls.push(`strokeText:${text},${x},${y},${maxWidth ?? ""}`),
    measureText: (text: string) => ({ width: text.length * 10 }),
    setLineDash: (dash: number[]) => calls.push(`setLineDash:${dash.join(",")}`),
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      calls.push(`createLinearGradient:${x0},${y0},${x1},${y1}`);
      return { addColorStop: (offset: number, color: string) => calls.push(`colorStop:${offset},${color}`) };
    },
    createRadialGradient: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
      calls.push(`createRadialGradient:${x0},${y0},${r0},${x1},${y1},${r1}`);
      return { addColorStop: (offset: number, color: string) => calls.push(`colorStop:${offset},${color}`) };
    }
  });
}

test("render stage preserves layer order and y-sorts world calls", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx, { x: 10, y: 5, scale: 2 });
  stage.addLayer("hud", { ignoreCamera: true });
  stage.addLayer("world", { sort: "y-axis" });

  stage.push("world", { kind: "custom", y: 30, draw: () => ctx.calls.push("world:back") });
  stage.push("hud", () => ctx.calls.push("hud"));
  stage.push("world", { kind: "custom", y: 10, draw: () => ctx.calls.push("world:front") });

  const result = stage.render();

  expect(result).toEqual({ layers: 2, submitted: 3, drawn: 3, skipped: 0, culled: 0 });
  expect(ctx.calls).toEqual(["hud", "save", "scale:2,2", "translate:-10,-5", "world:front", "world:back", "restore"]);
});

test("render stage pushes many calls in order", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx, {});
  stage.addLayer("world", { ignoreCamera: true });

  const pushed = stage.pushMany("world", [
    () => ctx.calls.push("first"),
    () => ctx.calls.push("second")
  ]);

  expect(pushed).toBe(2);
  expect(stage.size("world")).toBe(2);
  expect(stage.render()).toEqual({ layers: 1, submitted: 2, drawn: 2, skipped: 0, culled: 0 });
  expect(ctx.calls).toEqual(["first", "second"]);
});

test("render stage snapshots pooled entries before draw callbacks mutate queues", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx, {}, { autoClearCanvas: false });
  const world = stage.addLayer("world");
  const overlay = stage.addLayer("overlay");
  const drawn: string[] = [];

  world.push(() => {
    drawn.push("world:first");
    world.clear();
    world.push(() => drawn.push("world:next"));
    overlay.clear();
    overlay.push(() => drawn.push("overlay:next"));
  });
  world.push(() => drawn.push("world:second"));
  overlay.push(() => drawn.push("overlay:original"));

  expect(stage.render()).toEqual({ layers: 2, submitted: 3, drawn: 3, skipped: 0, culled: 0 });
  expect(drawn).toEqual(["world:first", "world:second", "overlay:original"]);

  drawn.length = 0;
  expect(stage.render()).toEqual({ layers: 2, submitted: 2, drawn: 2, skipped: 0, culled: 0 });
  expect(drawn).toEqual(["world:next", "overlay:next"]);
});

test("canvas render stage owns 2d context lookup and flushes", () => {
  const ctx = createContext();
  const canvas = {
    getContext(kind: "2d") {
      ctx.calls.push(`getContext:${kind}`);
      return ctx;
    }
  };
  const stage = createCanvasRenderStage(canvas, { camera: { x: 1, y: 2 }, autoClearCanvas: false });
  stage.addLayer("world");
  stage.push("world", () => ctx.calls.push("draw"));

  expect(stage.flush()).toEqual({ layers: 1, submitted: 1, drawn: 1, skipped: 0, culled: 0 });
  expect(ctx.calls).toEqual(["getContext:2d", "save", "scale:1,1", "translate:-1,-2", "draw", "restore"]);
});

test("render stage setCamera replaces camera used by transforms and draw state", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx, { x: 99, y: 99, scale: 9 });
  stage.addLayer("world");
  stage.push("world", (_ctx, state) => ctx.calls.push(`camera:${state.camera.x},${state.camera.y},${state.camera.zoom}`));

  expect(stage.setCamera({ x: 3, y: 4, zoom: 2 })).toEqual({ x: 3, y: 4, zoom: 2 });
  expect(stage.render()).toEqual({ layers: 1, submitted: 1, drawn: 1, skipped: 0, culled: 0 });
  expect(ctx.calls).toEqual(["save", "scale:2,2", "translate:-3,-4", "camera:3,4,2", "restore"]);
});

test("batch helpers sort by y and cull by render bounds", () => {
  const calls = [
    { kind: "rect", id: "back", x: 50, y: 40, width: 8, height: 8 },
    { kind: "circle", id: "front", x: 4, y: 10, radius: 3 },
    { kind: "rect", id: "middle", x: 100, y: 20, width: 8, height: 8 }
  ] as const;

  expect(sortRenderCallsByY(calls).map((call) => typeof call === "function" ? "" : call.id)).toEqual(["front", "middle", "back"]);
  expect(cullRenderCallsToRect(calls, { x: 0, y: 0, width: 20, height: 20 }).map((call) => typeof call === "function" ? "" : call.id)).toEqual(["front"]);
});

test("batch helpers can reuse caller-owned output arrays", () => {
  const calls = [
    { kind: "rect", id: "far", x: 90, y: 30, width: 8, height: 8 },
    { kind: "rect", id: "near-back", x: 2, y: 14, width: 8, height: 8 },
    { kind: "circle", id: "near-front", x: 4, y: 5, radius: 3 }
  ] as const;
  const out: Renderable[] = [() => undefined];

  expect(sortRenderCallsByYInto(calls, out)).toBe(out);
  expect(out.map((call) => typeof call === "function" ? "" : call.id)).toEqual(["near-front", "near-back", "far"]);
  expect(cullRenderCallsToRectInto(calls, { x: 0, y: 0, width: 20, height: 20 }, out)).toBe(out);
  expect(out.map((call) => typeof call === "function" ? "" : call.id)).toEqual(["near-back", "near-front"]);
  expect(renderCallIntersectsRect(calls[0], { x: 0, y: 0, width: 20, height: 20 })).toBe(false);
});

test("render stage culls before drawing and sorting", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx, {}, { cullRect: { x: 0, y: 0, width: 32, height: 32 } });
  stage.addLayer("world", { sort: "y-axis", ignoreCamera: true });
  stage.push("world", { kind: "rect", id: "offscreen", x: 200, y: 200, width: 10, height: 10, fill: "red" });
  stage.push("world", { kind: "rect", id: "back", x: 4, y: 18, width: 10, height: 10, fill: "blue" });
  stage.push("world", { kind: "rect", id: "front", x: 4, y: 2, width: 10, height: 10, fill: "green" });

  expect(stage.render()).toEqual({ layers: 1, submitted: 3, drawn: 2, skipped: 1, culled: 1 });
  expect(ctx.calls.filter((call) => call.startsWith("fillRect:"))).toEqual(["fillRect:4,2,10,10", "fillRect:4,18,10,10"]);
});

test("tile chunk draw data can reuse an output array", () => {
  const image = createCanvasImageSourceFixture(64, 64);
  const out: Renderable[] = [{ kind: "rect", x: 0, y: 0, width: 1, height: 1 }];
  const result = createTileChunkDrawData({
    tiles: [{ id: 1, x: 2, y: 3 }],
    image,
    tileWidth: 16,
    tileHeight: 16,
    out,
    getTileId: (tile) => tile.id,
    getX: (tile) => tile.x,
    getY: (tile) => tile.y,
    getSource: (_tile, id) => ({ x: Number(id) * 16, y: 0, width: 16, height: 16 })
  });

  expect(result).toBe(out);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: "sprite", x: 2, y: 3, sourceX: 16 });
});

test("render frame pool reuses arrays records points and commands across frames", () => {
  const pool = createRenderFramePool();
  const calls = renderArray(pool);
  const rect = renderRecord(pool, "rect");
  rect.width = 1;
  rect.height = 1;
  rect.fill = "red";
  calls.push(renderableRecord(rect));
  const point = pool.point(3, 4);
  const commands = pool.commands();
  const arc = pool.command("arc");
  arc.counterclockwise = true;
  arc.x = 0;
  arc.y = 0;
  arc.radius = 1;
  arc.startAngle = 0;
  arc.endAngle = Math.PI;
  commands.push(renderablePathCommand(arc));

  pool.beginFrame();

  const nextCalls = renderArray(pool);
  const nextRect = renderRecord(pool, "rect");
  const nextPoint = pool.point(8, 9);
  const nextCommands = pool.commands();
  const nextArc = pool.command("arc");

  expect(nextCalls).toBe(calls);
  expect(nextCalls).toHaveLength(0);
  expect(nextRect).toBe(rect);
  expect(nextRect.fill).toBeUndefined();
  expect(nextPoint).toBe(point);
  expect(nextPoint).toEqual({ x: 8, y: 9 });
  expect(nextCommands).toBe(commands);
  expect(nextCommands).toHaveLength(0);
  expect(nextArc).toBe(arc);
  expect(nextArc.counterclockwise).toBeUndefined();
});

test("pooled render records reject incomplete shapes", () => {
  const circle = renderRecord(undefined, "circle");
  expect(() => renderableRecord(circle)).toThrow("incomplete or unsupported");
  circle.radius = 4;
  expect(() => renderableRecord(circle)).not.toThrow();
});

test("render frame pool clears stale sprite transform fields", () => {
  const pool = createRenderFramePool();
  const sprite = renderRecord(pool, "sprite");
  sprite.anchor = "top";
  sprite.flipX = true;
  sprite.flipY = true;
  sprite.scale = 2;
  sprite.rotation = 0.5;
  sprite.width = 64;
  sprite.height = 32;
  sprite.composite = "multiply";
  sprite.shadowOffsetX = 4;
  sprite.shadowOffsetY = 2;
  sprite.visible = false;

  pool.beginFrame();

  const nextSprite = renderRecord(pool, "sprite");

  expect(nextSprite).toBe(sprite);
  expect(nextSprite.anchor).toBeUndefined();
  expect(nextSprite.flipX).toBeUndefined();
  expect(nextSprite.flipY).toBeUndefined();
  expect(nextSprite.scale).toBeUndefined();
  expect(nextSprite.rotation).toBeUndefined();
  expect(nextSprite.width).toBeUndefined();
  expect(nextSprite.height).toBeUndefined();
  expect(nextSprite.composite).toBeUndefined();
  expect(nextSprite.shadowOffsetX).toBeUndefined();
  expect(nextSprite.shadowOffsetY).toBeUndefined();
  expect(nextSprite.visible).toBeUndefined();
});

test("render frame pool clears pooled gradient paint fields", () => {
  const pool = createRenderFramePool();
  const gradient = renderRecord(pool, "linear-gradient");
  gradient.x0 = 0;
  gradient.y0 = 1;
  gradient.x1 = 2;
  gradient.y1 = 3;
  gradient.stops = [[0, "red"], [1, "blue"]];

  pool.beginFrame();

  const nextGradient = renderRecord(pool, "linear-gradient");

  expect(nextGradient).toBe(gradient);
  expect(nextGradient.x0).toBeUndefined();
  expect(nextGradient.y0).toBeUndefined();
  expect(nextGradient.x1).toBeUndefined();
  expect(nextGradient.y1).toBeUndefined();
  expect(nextGradient.stops).toBeUndefined();
});

test("render frame pool exposes explicit fresh and overwrite record strategies", () => {
  const freshPool = createRenderFramePool({ recordStrategy: "fresh" });
  const fresh = renderRecord(freshPool, "rect");
  fresh.fill = "red";
  freshPool.beginFrame();
  const nextFresh = renderRecord(freshPool, "rect");
  expect(nextFresh).not.toBe(fresh);
  expect(nextFresh.fill).toBeUndefined();

  const overwritePool = createRenderFramePool({ recordStrategy: "overwrite" });
  const retained = renderRecord(overwritePool, "rect");
  retained.fill = "red";
  overwritePool.beginFrame();
  const nextRetained = renderRecord(overwritePool, "rect");
  expect(nextRetained).toBe(retained);
  expect(nextRetained.fill).toBe("red");
});

test("stage clear resets queued calls and clears canvas", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx, {});
  stage.addLayer("world");
  stage.push("world", () => ctx.calls.push("draw"));

  stage.clear();
  const result = stage.render();

  expect(result).toEqual({ layers: 1, submitted: 0, drawn: 0, skipped: 0, culled: 0 });
  expect(stage.size()).toBe(0);
  expect(ctx.calls).toEqual(["clearRect:0,0,320,180"]);
});

test("tile cache renderer builds sprite draw calls from numeric tile ids", () => {
  const ctx = createContext();
  const image = createCanvasImageSourceFixture(64, 64);
  const renderer = createTileCacheRenderer({ image, tileWidth: 16, tileHeight: 16, columns: 4 });

  const result = renderer.render(ctx, [
    { id: 5, tileX: 2, tileY: 3 },
    { id: 1, tileX: 99, tileY: 99, visible: false }
  ]);

  expect(result).toEqual({ drawn: 1, skipped: 1 });
  expect(ctx.calls).toContain("drawImage:16,16,16,16,0,0,16,16");
});

test("tile cache renderer clamps atlas edges and snaps shared device-pixel boundaries", () => {
  const image = createCanvasImageSourceFixture(64, 64);
  const renderer = createTileCacheRenderer({ image, tileWidth: 16, tileHeight: 16, columns: 4, sourceInset: 0.5, pixelSnap: true });
  const call = renderer.toDrawCall({ id: 1, x: 0.2, y: 0.2 }, { scale: 1.25, pixelRatio: 2 });
  expect(call).toMatchObject({ x: 0.5, y: 0.5, width: 20, height: 20, sourceX: 16.5, sourceY: 0.5, sourceWidth: 15, sourceHeight: 15 });
});

test("render polygons accept flat typed point buffers with offset/count", () => {
  const ctx = createContext();
  const rendered = drawRenderable(ctx, {
    kind: "polygon",
    points: new Float32Array([99, 99, 1, 2, 3, 4, 5, 6, 88, 88]),
    pointOffset: 1,
    pointCount: 3,
    fill: "red",
  }, defaultDrawState);
  expect(rendered).toBe(true);
  expect(ctx.calls).toContain("moveTo:1,2");
  expect(ctx.calls).toContain("lineTo:5,6");
  expect(getRenderCallBounds({ kind: "polygon", points: new Float32Array([99, 99, 1, 2, 3, 4, 5, 6]), pointOffset: 1, pointCount: 3 })).toEqual({ x: 1, y: 2, width: 4, height: 4 });
});

test("HUD helper renders bars and wraps/truncates text", () => {
  const ctx = createContext();
  const hud = createHudRenderer();

  const bar = hud.bar({ x: 4, y: 5, width: 100, height: 8, value: 25, max: 100, background: "black", fill: "red", stroke: "white" });
  const text = hud.text({ x: 0, y: 0, text: "HP", fill: "white" });
  const result = hud.render(ctx, [bar, text]);

  expect(result).toEqual({ drawn: 2 });
  expect(ctx.calls).toContain("fillRect:4,5,100,8");
  expect(ctx.calls).toContain("fillRect:4,5,25,8");
  expect(ctx.calls).toContain("fillText:HP,0,0,");
  expect(wrapText(ctx, "alpha beta gamma", 100)).toEqual(["alpha beta", "gamma"]);
  expect(truncateText(ctx, "PlayerName", 60)).toBe("Pla...");
});

test("outline draw call supports ellipse shape", () => {
  const ctx = createContext();
  const hud = createHudRenderer();

  const result = hud.render(ctx, [
    hud.outline({ x: 10, y: 20, width: 30, height: 10, shape: "ellipse", stroke: "white", lineWidth: 3 })
  ]);

  expect(result).toEqual({ drawn: 1 });
  expect(ctx.calls).toContain("beginPath");
  expect(ctx.calls).toContain("ellipse:25,25,15,5");
  expect(ctx.calls).toContain("stroke");
});

test("render data supports filled and stroked ellipse", () => {
  const ctx = createContext();
  const hud = createHudRenderer();

  const result = hud.render(ctx, [
    { kind: "ellipse", x: 40, y: 30, radiusX: 18, radiusY: 8, fill: "red", stroke: "white", lineWidth: 2 }
  ]);

  expect(result).toEqual({ drawn: 1 });
  expect(ctx.calls).toContain("ellipse:40,30,18,8");
  expect(ctx.calls).toContain("fill");
  expect(ctx.calls).toContain("stroke");
});

test("render data supports polygon polyline and path drawing", () => {
  const ctx = createContext();
  const hud = createHudRenderer();

  const result = hud.render(ctx, [
    { kind: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 8 }], fill: "gold", stroke: "black" },
    { kind: "polyline", points: [[1, 2], [3, 4], [5, 6]], stroke: "white", lineWidth: 2 },
    { kind: "path", commands: [{ kind: "moveTo", x: 0, y: 8 }, { kind: "quadraticCurveTo", cpx: 4, cpy: 0, x: 8, y: 8 }], stroke: "blue" }
  ]);

  expect(result).toEqual({ drawn: 3 });
  expect(ctx.calls).toContain("closePath");
  expect(ctx.calls).toContain("lineTo:5,6");
  expect(ctx.calls).toContain("quadraticCurveTo:4,0,8,8");
});

test("render data carries canvas shadow state without custom draw functions", () => {
  const ctx = createContext();
  const hud = createHudRenderer();

  const result = hud.render(ctx, [
    hud.outline({ x: 10, y: 20, width: 30, height: 10, shape: "ellipse", fill: "black", shadowColor: "gold", shadowBlur: 8 })
  ]);

  expect(result).toEqual({ drawn: 1 });
  expect(ctx.calls).toContain("shadowColor:gold");
  expect(ctx.calls).toContain("shadowBlur:8");
  expect(ctx.calls).toContain("ellipse:25,25,15,5");
  expect(ctx.calls).toContain("fill");
});

test("render data supports additive radial glow paint and blend mode", () => {
  const ctx = createContext();
  const hud = createHudRenderer();

  const result = hud.render(ctx, [
    {
      kind: "circle",
      x: 10,
      y: 20,
      radius: 24,
      alpha: 0.75,
      blendMode: "lighter",
      shadowColor: "cyan",
      shadowBlur: 12,
      fill: createRadialGradientPaint({
        x0: 10,
        y0: 20,
        r0: 0,
        x1: 10,
        y1: 20,
        r1: 24,
        stops: [[0, "rgba(255,255,255,0.9)"], [1, "rgba(255,255,255,0)"]]
      })
    }
  ]);

  expect(result).toEqual({ drawn: 1 });
  expect(ctx.calls).toContain("globalCompositeOperation:lighter");
  expect(ctx.calls).toContain("shadowColor:cyan");
  expect(ctx.calls).toContain("shadowBlur:12");
  expect(ctx.calls).toContain("createRadialGradient:10,20,0,10,20,24");
  expect(ctx.calls).toContain("colorStop:0,rgba(255,255,255,0.9)");
  expect(ctx.calls).toContain("colorStop:1,rgba(255,255,255,0)");
  expect(ctx.calls).toContain("fillStyle:paint");
  expect(ctx.calls).toContain("fill");
});

test("draw data reuses cached gradients for repeated paint keys", () => {
  const ctx = createContext();
  const hud = createHudRenderer({ drawDataCaches: true });
  const fill = createLinearGradientPaint({
    x0: 0,
    y0: 0,
    x1: 10,
    y1: 0,
    stops: [[0, "red"], [1, "blue"]]
  });

  hud.render(ctx, [
    { kind: "rect", x: 0, y: 0, width: 10, height: 10, fill },
    { kind: "rect", x: 2, y: 0, width: 10, height: 10, fill }
  ]);

  expect(ctx.calls.filter((entry) => entry.startsWith("createLinearGradient:"))).toHaveLength(1);
  expect(ctx.calls.filter((entry) => entry.startsWith("colorStop:"))).toHaveLength(2);
  expect(ctx.calls.filter((entry) => entry === "fillStyle:paint")).toHaveLength(2);
});

test("render stage can opt into draw data caches per stage", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx, {}, { drawDataCaches: true });
  stage.addLayer("hud", { ignoreCamera: true });
  const fill = createLinearGradientPaint({
    x0: 0,
    y0: 0,
    x1: 10,
    y1: 0,
    stops: [[0, "red"], [1, "blue"]]
  });
  stage.push("hud", { kind: "rect", x: 0, y: 0, width: 10, height: 10, fill });
  stage.push("hud", { kind: "rect", x: 2, y: 0, width: 10, height: 10, fill });

  expect(stage.render()).toEqual({ layers: 1, submitted: 2, drawn: 2, skipped: 0, culled: 0 });
  expect(ctx.calls.filter((entry) => entry.startsWith("createLinearGradient:"))).toHaveLength(1);

  stage.setDrawDataCaches(false);
  stage.clear({ canvas: false });
  stage.push("hud", { kind: "rect", x: 0, y: 0, width: 10, height: 10, fill });
  stage.push("hud", { kind: "rect", x: 2, y: 0, width: 10, height: 10, fill });
  stage.render();

  expect(ctx.calls.filter((entry) => entry.startsWith("createLinearGradient:"))).toHaveLength(3);
});

test("draw data bounds gradient cache and evicts oldest key", () => {
  const ctx = createContext();
  const hud = createHudRenderer({ drawDataCaches: true });
  const calls = Array.from({ length: 65 }, (_, index) => ({
    kind: "rect" as const,
    x: index,
    y: 0,
    width: 1,
    height: 1,
    fill: createLinearGradientPaint({
      x0: index,
      y0: 0,
      x1: index + 1,
      y1: 0,
      stops: [[0, "red"], [1, "blue"]]
    })
  }));

  hud.render(ctx, calls);
  hud.render(ctx, [calls[0]]);

  expect(ctx.calls.filter((entry) => entry.startsWith("createLinearGradient:"))).toHaveLength(66);
});

test("render data supports dashed paths with dash offset and paint resolver state", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx);
  stage.addLayer("world", { ignoreCamera: true });
  stage.push("world", {
    kind: "path",
    commands: [{ kind: "moveTo", x: 0, y: 0 }, { kind: "lineTo", x: 20, y: 0 }],
    stroke: (_ctx, state) => `stroke:${state.layer}`,
    lineWidth: 3,
    lineDash: [6, 2],
    lineDashOffset: 4,
    cap: "round",
    join: "round"
  });

  expect(stage.render()).toEqual({ layers: 1, submitted: 1, drawn: 1, skipped: 0, culled: 0 });
  expect(ctx.calls).toContain("strokeStyle:stroke:world");
  expect(ctx.calls).toContain("setLineDash:6,2");
  expect(ctx.calls).toContain("lineDashOffset:4");
  expect(ctx.calls).toContain("stroke");
});

test("render data resets line dash after styled strokes", () => {
  const ctx = createContext();
  const stage = createRenderStage(ctx);
  stage.addLayer("world", { ignoreCamera: true });
  stage.push("world", {
    kind: "path",
    commands: [{ kind: "moveTo", x: 0, y: 0 }, { kind: "lineTo", x: 20, y: 0 }],
    stroke: "red",
    lineDash: [6, 2],
    lineDashOffset: 4,
    cap: "round",
    join: "round"
  });
  stage.push("world", {
    kind: "path",
    commands: [{ kind: "moveTo", x: 0, y: 4 }, { kind: "lineTo", x: 20, y: 4 }],
    stroke: "blue"
  });

  expect(stage.render()).toEqual({ layers: 1, submitted: 2, drawn: 2, skipped: 0, culled: 0 });
  expect(ctx.calls).toContain("setLineDash:6,2");
  expect(ctx.calls).toContain("lineDashOffset:4");
  expect(ctx.calls.lastIndexOf("setLineDash:")).toBeGreaterThan(ctx.calls.indexOf("setLineDash:6,2"));
  expect(ctx.calls.lastIndexOf("lineDashOffset:0")).toBeGreaterThan(ctx.calls.indexOf("lineDashOffset:4"));
});

test("draw data caches wrapped and truncated text measurements", () => {
  const ctx = createContext();
  let measured = 0;
  Object.defineProperty(ctx, "measureText", { value: (text: string) => {
    measured += 1;
    return { width: text.length * 10 };
  } });
  const hud = createHudRenderer({ drawDataCaches: true });
  const calls: Renderable[] = [
    hud.textBlock({ x: 2, y: 4, text: "alpha beta gamma", maxWidth: 100, size: 10, lineHeight: 12 }),
    hud.textBlock({ x: 2, y: 20, text: "alpha beta gamma", maxWidth: 100, size: 10, lineHeight: 12 }),
    hud.label({ x: 50, y: 50, text: "PlayerName", maxWidth: 60, size: 10 }),
    hud.label({ x: 50, y: 70, text: "PlayerName", maxWidth: 60, size: 10 })
  ];

  hud.render(ctx, calls);
  const firstMeasured = measured;
  hud.render(ctx, calls);

  expect(firstMeasured).toBeGreaterThan(0);
  expect(measured).toBe(firstMeasured);
});

test("sprite source rect helper resolves cropped frame data", () => {
  expect(resolveSpriteSheetFrame({
    width: 3360,
    height: 480,
    frameWidth: 480,
    frameHeight: 480,
    timeMs: 320,
    frameMs: 150,
    cropWidth: 320,
    cropHeight: 420
  })).toEqual({ sx: 1040, sy: 30, sw: 320, sh: 420, frame: 2, frames: 7 });
});

test("sprite source rect helper rejects malformed dimensions and timing", () => {
  const base = { width: 64, height: 32, frameWidth: 16, frameHeight: 16 };
  expect(resolveSpriteSheetFrame({ ...base, frameWidth: 0 })).toBeUndefined();
  expect(resolveSpriteSheetFrame({ ...base, frameMs: 0 })).toBeUndefined();
  expect(resolveSpriteSheetFrame({ ...base, frames: -1 })).toBeUndefined();
  expect(resolveSpriteSheetFrame({ ...base, timeMs: Number.NaN })).toBeUndefined();
  expect(resolveSpriteSheetFrame({ ...base, cropWidth: Number.POSITIVE_INFINITY })).toBeUndefined();
});

test("groups with an unbounded custom call remain conservatively visible", () => {
  const group: Renderable = {
    kind: "group",
    calls: [
      { kind: "rect", x: 10_000, y: 10_000, width: 10, height: 10, fill: "red" },
      () => {}
    ]
  };
  expect(renderCallIntersectsRect(group, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
});

test("text block draw call wraps and truncates text", () => {
  const ctx = createContext();
  const hud = createHudRenderer();

  hud.render(ctx, [
    hud.textBlock({ x: 2, y: 4, text: "alpha beta gamma", maxWidth: 100, size: 10, lineHeight: 12 })
  ]);
  expect(ctx.calls).toContain("fillText:alpha beta,2,4,100");
  expect(ctx.calls).toContain("fillText:gamma,2,16,100");

  ctx.calls.length = 0;
  hud.render(ctx, [
    hud.textBlock({ x: 2, y: 4, text: "alpha beta gamma", maxWidth: 100, size: 10, maxLines: 1 })
  ]);
  expect(ctx.calls).toContain("fillText:alpha b...,2,4,100");
});

test("text measurement helpers reject malformed layout limits", () => {
  const ctx = createContext();
  for (const maxWidth of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => truncateText(ctx, "text", maxWidth)).toThrow("maxWidth");
    expect(() => wrapText(ctx, "text", maxWidth)).toThrow("maxWidth");
  }
  for (const maxLines of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => wrapText(ctx, "one two", 100, { maxLines })).toThrow("maxLines");
  }
  expect(wrapText(ctx, "one two", 0)).toEqual([]);
  expect(wrapText(ctx, "one two", 100, { maxLines: 0 })).toEqual(["one two"]);
});

test("actor renderer emits grouped sprite, label, health, and outline calls", () => {
  const ctx = createContext();
  const image = createCanvasImageSourceFixture(64, 64);
  const renderer = createActorRenderer({ image, width: 24, height: 32 });
  const call = renderer.toDrawCall({
    id: "player",
    x: 50,
    y: 80,
    label: "Hero",
    health: 4,
    maxHealth: 8,
    selected: true
  });

  expect(call?.kind).toBe("group");
  expect(call?.calls).toHaveLength(4);
  if (!call) throw new Error("expected actor draw call");
  const hud = createHudRenderer();
  hud.render(ctx, [call]);

  expect(ctx.calls.some((entry) => entry.startsWith("drawImage:"))).toBe(true);
  expect(ctx.calls).toContain("fillText:Hero,50,28,40");
  expect(ctx.calls).toContain("strokeRect:38,48,24,32");
});

test("effect queue expires effects and exposes draw progress", () => {
  const ctx = createContext();
  const queue = createEffectQueue();
  queue.push({
    ttl: 1,
    draw: (_ctx, state) => ctx.calls.push(`effect:${state.progress}`)
  });

  expect(queue.update(0.25)).toBe(1);
  const [call] = queue.toDrawCalls();
  if (!call) throw new Error("expected effect call");
  const hud = createHudRenderer();
  hud.render(ctx, [call]);
  expect(ctx.calls).toEqual(["effect:0.25"]);

  expect(queue.update(0.8)).toBe(0);
});

test("timed effect helper updates custom lifecycle fields and expires effects", () => {
  const effects = [
    { t: 0, life: 1, updates: 0 },
    { t: 0.9, life: 1, updates: 0 }
  ];
  const expired: number[] = [];

  const remaining = updateTimedEffectQueue(effects, 0.2, {
    getElapsed: (effect) => effect.t,
    setElapsed: (effect, elapsed) => {
      effect.t = elapsed;
    },
    getLifetime: (effect) => effect.life,
    onUpdate: ({ effect, progress }) => {
      effect.updates += progress;
    },
    onExpire: (effect) => expired.push(effect.life)
  });

  expect(remaining).toBe(1);
  expect(effects).toHaveLength(1);
  expect(effects[0].t).toBeCloseTo(0.2);
  expect(effects[0].updates).toBeCloseTo(0.2);
  expect(expired).toEqual([1]);
});

test("absolute timed effect helper prunes by started time and reports progress", () => {
  const effects = [
    { startedMs: 100, lifetimeMs: 1000, updates: 0 },
    { startedMs: 0, lifetimeMs: 250, updates: 0 }
  ];
  const expired: number[] = [];

  const remaining = pruneExpiredTimedEffectQueue(effects, 500, {
    onUpdate: ({ effect, progress }) => {
      effect.updates += progress;
    },
    onExpire: (effect) => expired.push(effect.lifetimeMs)
  });

  expect(remaining).toBe(1);
  expect(effects).toHaveLength(1);
  expect(effects[0].updates).toBeCloseTo(0.4);
  expect(expired).toEqual([250]);
});

test("bounded effect helper drops oldest entries through callback", () => {
  const effects = [{ id: 1 }, { id: 2 }];
  const dropped: number[] = [];

  const remaining = pushBoundedEffect(effects, { id: 3 }, {
    maxEffects: 2,
    onDrop: (effect) => dropped.push(effect.id)
  });

  expect(remaining).toBe(2);
  expect(effects.map((effect) => effect.id)).toEqual([2, 3]);
  expect(dropped).toEqual([1]);
});

test("effect helpers reject non-finite timing and caps without mutating queues", () => {
  const effects = [{ elapsed: 0, ttl: 1 }];
  expect(() => updateTimedEffectQueue(effects, Number.NaN)).toThrow("effect delta");
  expect(effects).toEqual([{ elapsed: 0, ttl: 1 }]);
  expect(() => pushBoundedEffect(effects, { elapsed: 0, ttl: 1 }, { maxEffects: Number.NaN })).toThrow("maxEffects");
  expect(effects).toHaveLength(1);

  const queue = createEffectQueue();
  expect(() => queue.push({ ttl: Number.POSITIVE_INFINITY, draw() {} })).toThrow("effect ttl");
  expect(queue.size()).toBe(0);
});

test("effect helpers reject malformed default lifecycle fields", () => {
  expect(() => updateTimedEffectQueue([{ elapsed: "soon", ttl: 1 }], 0.1)).toThrow("effect elapsed must be a number");
  expect(() => pruneExpiredTimedEffectQueue([{ startedMs: 0, lifetimeMs: "later" }], 1)).toThrow("effect lifetime must be a number");
});

test("effect updates tolerate callbacks mutating the live queue", () => {
  const first = { elapsed: 0, ttl: 1 };
  const second = { elapsed: 0, ttl: 1 };
  const effects = [first, second];
  updateTimedEffectQueue(effects, 0.25, {
    onUpdate({ effect }) {
      if (effect === second) effects.splice(effects.indexOf(first), 1);
    }
  });
  expect(effects).toEqual([second]);
  expect(second.elapsed).toBe(0.25);
});
