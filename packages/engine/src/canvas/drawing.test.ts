import { expect, test } from "bun:test";
import { createCanvasContextFixture, createCanvasImageSourceFixture } from "../test-support/canvas.ts";
import {
  createSpriteBatchFrames,
  drawRect,
  drawPolygonFlat,
  drawSpriteBatch,
  drawSpriteSlice,
  popTransform,
  pushTransform,
  registerSprite,
  setDrawContext
} from "./drawing.ts";

function createContext() {
  const calls: string[] = [];
  return createCanvasContextFixture({
    calls,
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rotate: (value: number) => calls.push(`rotate:${value}`),
    scale: (x: number, y: number) => calls.push(`scale:${x},${y}`),
    drawImage: (...args: unknown[]) => calls.push(`drawImage:${args.slice(1).join(",")}`),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect:${x},${y},${w},${h}`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    beginPath: () => calls.push("beginPath"),
    arc: () => calls.push("arc"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    closePath: () => calls.push("closePath"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke")
  });
}

test("drawRect uses the active context and restores drawing state", () => {
  const ctx = createContext();
  setDrawContext(ctx);

  drawRect(1, 2, 3, 4, { fill: "red", stroke: "blue", alpha: 0.5 });

  expect(ctx.calls).toEqual(["save", "fillRect:1,2,3,4", "strokeRect:1,2,3,4", "restore"]);
  setDrawContext(undefined);
});

test("draw helpers restore canvas state when drawing throws", () => {
  const ctx = createContext();
  ctx.fillRect = () => {
    throw new Error("draw failed");
  };
  expect(() => drawRect(1, 2, 3, 4, { ctx, fill: "red" })).toThrow("draw failed");
  expect(ctx.calls).toEqual(["save", "restore"]);
});

test("drawSpriteSlice computes source frame data from counters", () => {
  const ctx = createContext();
  registerSprite("ship", createCanvasImageSourceFixture(64, 32));

  drawSpriteSlice("ship", 10, 20, 3, { ctx, frameWidth: 16, frameHeight: 16, columns: 2 });

  expect(ctx.calls).toContain("drawImage:16,16,16,16,0,0,16,16");
});

test("drawSpriteBatch uses precomputed atlas frames without per-sprite canvas state saves", () => {
  const ctx = createContext();
  const image = createCanvasImageSourceFixture(64, 32);
  registerSprite("batch-ship", image);
  const frames = createSpriteBatchFrames({ image, frameWidth: 16, frameHeight: 16 });

  const result = drawSpriteBatch(
    "batch-ship",
    [
      { x: 10, y: 20, frame: 3 },
      { x: 30, y: 40, frame: 4, alpha: 0.5, width: 20, height: 24 },
      { x: 0, y: 0, frame: 99 },
      { x: 0, y: 0, frame: 1, alpha: 0 }
    ],
    { ctx, frames }
  );

  expect(result).toEqual({ drawn: 2, skipped: 2 });
  expect(ctx.globalAlpha).toBe(1);
  expect(ctx.calls).toEqual(["drawImage:48,0,16,16,10,20,16,16", "drawImage:0,16,16,16,30,40,20,24"]);
});

test("transform stack ignores underflow", () => {
  const ctx = createContext();

  pushTransform({ ctx, x: 5, y: 6, rotation: 1, scale: 2 });
  expect(popTransform({ ctx })).toBe(true);
  expect(popTransform({ ctx })).toBe(false);

  expect(ctx.calls).toEqual(["save", "translate:5,6", "rotate:1", "scale:2,2", "restore"]);
});

test("flat polygon drawing accepts typed-buffer offset/count ranges", () => {
  const ctx = createContext();
  drawPolygonFlat(new Float32Array([99, 99, 1, 2, 3, 4, 5, 6, 88, 88]), 1, 3, { ctx, fill: "red" });
  expect(ctx.calls).toEqual(["save", "beginPath", "moveTo", "lineTo", "lineTo", "closePath", "fill", "restore"]);
});
