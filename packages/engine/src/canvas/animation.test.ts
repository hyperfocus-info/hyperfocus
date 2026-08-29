import { expect, test } from "bun:test";
import { createTextureAtlas } from "../atlas.ts";
import { createAtlasAnimation } from "./animation.ts";

const atlas = createTextureAtlas({
  frames: {
    "run-0.png": {
      frame: { x: 0, y: 0, w: 8, h: 8 },
      spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
      sourceSize: { w: 8, h: 8 }
    },
    "run-1.png": {
      frame: { x: 8, y: 0, w: 8, h: 8 },
      spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
      sourceSize: { w: 8, h: 8 }
    }
  }
});

test("atlas animation resolves frames by exact atlas name", () => {
  const animation = createAtlasAnimation(
    atlas,
    [
      { name: "run-0.png", duration: 50 },
      { name: "run-1.png", duration: 50 }
    ],
    { frameDuration: 100 }
  );

  expect(animation.currentFrameName()).toBe("run-0.png");
  expect(animation.currentFrame().frame).toEqual({ x: 0, y: 0, w: 8, h: 8 });
  expect(animation.advance(51).name).toBe("run-1.png");
  expect(animation.reset().name).toBe("run-0.png");
});

test("atlas animation rejects invalid durations and time values", () => {
  expect(() => createAtlasAnimation(atlas, ["run-0.png"], { frameDuration: 0 })).toThrow(
    "frameDuration must be a positive finite number"
  );
  expect(() => createAtlasAnimation(atlas, [{ name: "run-0.png", duration: Number.NaN }])).toThrow(
    "frames[0].duration must be a positive finite number"
  );
  const animation = createAtlasAnimation(atlas, ["run-0.png"]);
  expect(() => animation.advance(Number.NaN)).toThrow("deltaMs must be a non-negative finite number");
  expect(() => animation.setTime(Number.POSITIVE_INFINITY)).toThrow("time must be finite");
  expect(() => animation.frameAt(Number.NaN)).toThrow("frame index must be a safe integer");
});

test("atlas animation handles fractional non-loop boundaries", () => {
  const animation = createAtlasAnimation(atlas, [
    { name: "run-0.png", duration: 0.25 },
    { name: "run-1.png", duration: 0.25 }
  ], { loop: false });

  expect(animation.setTime(0.25).name).toBe("run-1.png");
  expect(animation.setTime(0.5).name).toBe("run-1.png");
  expect(() => animation.frameAt(0.5)).toThrow("safe integer");
});

test("looping atlas animation normalizes large finite times before advancing", () => {
  const animation = createAtlasAnimation(atlas, ["run-0.png", "run-1.png"]);

  animation.setTime(Number.MAX_VALUE);
  expect(() => animation.advance(Number.MAX_VALUE)).not.toThrow();
});
