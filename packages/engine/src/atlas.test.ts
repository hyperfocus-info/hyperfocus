import { expect, test } from "bun:test";
import { atlasApiProfileNames, atlasApiProfiles, createTextureAtlas, createTexturePackerAtlas } from "./atlas.ts";

test("atlas root export profiles classify stable primitives", () => {
  expect(Object.keys(atlasApiProfiles).sort()).toEqual([...atlasApiProfileNames].sort());
  for (const [name, profile] of Object.entries(atlasApiProfiles)) {
    expect(profile.status, name).toBe("stable");
    expect(profile.proof, name).toBe("engine-contract");
    expect(profile.exposure, name).toBe("root");
  }
});

test("texture atlas normalizes TexturePacker frame maps", () => {
  const atlas = createTextureAtlas({
    frames: {
      idle_0: {
        frame: { x: 0, y: 0, w: 16, h: 16 },
        spriteSourceSize: { x: 1, y: 2, w: 14, h: 12 },
        sourceSize: { w: 16, h: 16 }
      }
    },
    meta: { image: "ship.png", scale: "1" }
  });

  expect(atlas.frameNames()).toEqual(["idle_0"]);
  expect(atlas.hasFrame("idle_0")).toBe(true);
  const frame = atlas.getFrame("idle_0");
  expect(frame?.name).toBe("idle_0");
  expect(frame?.x).toBe(0);
  expect(frame?.y).toBe(0);
  expect(frame?.w).toBe(16);
  expect(frame?.h).toBe(16);
  expect(frame?.sourceX).toBe(1);
  expect(frame?.sourceY).toBe(2);
  expect(frame?.sourceWidth).toBe(16);
  expect(frame?.sourceHeight).toBe(16);
  expect(frame?.pivotX).toBe(0.5);
  expect(frame?.pivotY).toBe(0.5);
});

test("texture packer atlas alias keeps exact frame names with spaces and case", () => {
  const atlas = createTexturePackerAtlas({
    frames: {
      "Run Cycle": {
        frame: { x: 4, y: 8, w: 12, h: 12 }
      }
    }
  });

  expect(atlas.frameNames()).toEqual(["Run Cycle"]);
  expect(atlas.hasFrame("run cycle")).toBe(false);
  const aliasFrame = atlas.getFrame("Run Cycle");
  expect(aliasFrame?.name).toBe("Run Cycle");
  expect(aliasFrame?.x).toBe(4);
  expect(aliasFrame?.y).toBe(8);
  expect(aliasFrame?.w).toBe(12);
  expect(aliasFrame?.h).toBe(12);
  expect(aliasFrame?.sourceX).toBe(0);
  expect(aliasFrame?.sourceY).toBe(0);
  expect(aliasFrame?.sourceWidth).toBe(12);
  expect(aliasFrame?.sourceHeight).toBe(12);
  expect(aliasFrame?.pivotX).toBe(0.5);
  expect(aliasFrame?.pivotY).toBe(0.5);
  expect(() => atlas.requireFrame("RUN CYCLE")).toThrow("Texture atlas frame not found: RUN CYCLE");
});

test("texture atlas rejects malformed runtime JSON before storing frames", () => {
  const create = (value: unknown) => createTextureAtlas(value);
  expect(() => create(null)).toThrow("texture atlas must be a plain object");
  expect(() => create({ frames: null })).toThrow("frames must be an array or plain object");
  expect(() => create({ frames: [{ frame: { x: 0, y: 0, w: 1, h: 1 } }] })).toThrow("name");
  expect(() => create({
    frames: [
      { name: "same", frame: { x: 0, y: 0, w: 1, h: 1 } },
      { name: "same", frame: { x: 1, y: 0, w: 1, h: 1 } }
    ]
  })).toThrow("Duplicate texture atlas frame");

  for (const frame of [
    { x: -1, y: 0, w: 1, h: 1 },
    { x: 0, y: 0, w: 0, h: 1 },
    { x: 0, y: 0, w: Number.NaN, h: 1 },
    { x: 0, y: 0, w: 1.5, h: 1 }
  ]) {
    expect(() => create({ frames: { bad: { frame } } })).toThrow("texture atlas frame bad.frame");
  }
});

test("texture atlas validates source bounds, flags, pivots, and metadata", () => {
  const create = (value: unknown) => createTextureAtlas(value);
  expect(() => create({
    frames: {
      bad: {
        frame: { x: 0, y: 0, w: 4, h: 4 },
        sourceSize: { w: 8, h: 8 },
        spriteSourceSize: { x: 7, y: 0, w: 2, h: 2 }
      }
    }
  })).toThrow("must fit inside sourceSize");
  expect(() => create({
    frames: { bad: { frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: "yes" } }
  })).toThrow("rotated must be a boolean");
  expect(() => create({
    frames: { bad: { frame: { x: 0, y: 0, w: 1, h: 1 }, pivot: { x: Number.NaN, y: 0 } } }
  })).toThrow("pivot.x must be finite");
  expect(() => create({
    frames: {}, meta: { scale: "not-a-number" }
  })).toThrow("meta.scale");
});
