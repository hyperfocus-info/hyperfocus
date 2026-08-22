import { expect, test } from "bun:test";
import {
  brightness,
  bloom,
  checkPostProcessBudget,
  colorLut,
  colorFringe,
  createPostProcessStack,
  crtScanlines,
  digitalNoise,
  getPostProcessEffectCost,
  grayscale,
  invert,
  motionBlur,
  pixelate,
  posterize,
  postProcessApiProfileNames,
  postProcessApiProfiles,
  radialBlur,
  retroDithering,
  screenShake,
  srgbByteToLinearByte,
  linearByteToSrgbByte,
  summarizePostProcessCost,
  threshold,
  vignette
} from "./post-processing.ts";

test("post process stack keeps effect order and removal explicit", () => {
  const stack = createPostProcessStack([grayscale(), invert()]);

  expect(stack.effects().map((effect) => effect.name)).toEqual(["grayscale", "invert"]);
  expect(stack.remove("grayscale")).toBe(true);
  expect(stack.remove("missing")).toBe(false);
  expect(stack.effects().map((effect) => effect.name)).toEqual(["invert"]);
});

test("pixel effects are deterministic and composable", () => {
  let pixel = brightness(0.1).apply([100, 120, 140, 255], 0, 0, { width: 1, height: 1 });
  pixel = threshold(140).apply(pixel, 0, 0, { width: 1, height: 1 });

  expect(pixel).toEqual([255, 255, 255, 255]);
  expect(posterize(4).apply([130, 10, 250, 255], 0, 0, { width: 1, height: 1 })).toEqual([170, 0, 255, 255]);
});

test("linear-sRGB stack mode decodes before filters and encodes afterward", () => {
  expect(linearByteToSrgbByte(srgbByteToLinearByte(128))).toBeCloseTo(128, 8);
  const image = { data: new Uint8ClampedArray([0, 0, 0, 255]) } as ImageData;
  const ctx = {
    canvas: { width: 1, height: 1 },
    getImageData: () => image,
    putImageData() {},
  } as unknown as CanvasRenderingContext2D;
  createPostProcessStack([brightness(0.5)], { workingColorSpace: "linear-srgb" }).apply(ctx);
  expect([...image.data]).toEqual([188, 188, 188, 255]);
});

test("retro dithering reuses precomputed quantization without changing pixels", () => {
  const effect = retroDithering(4);

  expect(effect.apply([130, 10, 250, 255], 0, 0, { width: 4, height: 4 })).toEqual([85, -0, 255, 255]);
  expect(effect.apply([130, 10, 250, 128], 1, 0, { width: 4, height: 4 })).toEqual([170, 0, 255, 128]);
});

test("vignette darkens edges more than center", () => {
  const effect = vignette(0.5, 0.8);
  const context = { width: 100, height: 100, centerX: 50, centerY: 50 };
  const center = effect.apply([200, 200, 200, 255], 50, 50, context);
  const edge = effect.apply([200, 200, 200, 255], 0, 0, context);

  expect(center[0]).toBe(200);
  expect(edge[0]).toBeLessThan(center[0]);
});

test("screen shake is deterministic for a frame time", () => {
  expect(screenShake(6, 1.25)).toEqual(screenShake(6, 1.25));
});

test("aliases expose catalog naming variants", () => {
  expect(colorFringe).toBeFunction();
  expect(digitalNoise().name).toBe("digital-noise");
  expect(colorLut((pixel) => pixel).name).toBe("color-lut");
});

test("post process costs make stack budget visible", () => {
  const effects = [grayscale(), invert(), radialBlur];

  expect(getPostProcessEffectCost(grayscale()).tier).toBe("pixel");
  expect(getPostProcessEffectCost(radialBlur).tier).toBe("overlay");
  expect(summarizePostProcessCost(effects)).toEqual({
    ok: true,
    pixelEffects: 2,
    distortionEffects: 0,
    fullCanvasPasses: 3,
    violations: []
  });
  expect(checkPostProcessBudget(effects, { maxPixelEffects: 1, maxFullCanvasPasses: 2 })).toEqual({
    ok: false,
    pixelEffects: 2,
    distortionEffects: 0,
    fullCanvasPasses: 3,
    violations: ["pixel effects 2 exceeds 1", "full canvas passes 3 exceeds 2"]
  });
});

test("post process profiles classify stable API separately from prototype helpers", () => {
  expect(postProcessApiProfiles.createPostProcessStack.status).toBe("stable");
  expect(postProcessApiProfiles.grayscale.tier).toBe("pixel");
  expect(postProcessApiProfiles.crtScanlines.status).toBe("stable");
  expect(postProcessApiProfiles.radialBlur.status).toBe("prototype");
  expect(postProcessApiProfiles.radialBlur.exposure).toBe("prototype-subpath");
  expect(postProcessApiProfiles.shockwaveDistortion.tier).toBe("distortion");
});

test("post process profiles isolate migrated proof from candidate helpers", () => {
  const migratedPrototypeHelpers = Object.entries(postProcessApiProfiles)
    .filter(([, profile]) => profile.status === "prototype" && profile.proof === "migrated-game")
    .map(([name]) => name);
  const promotionBlockedHelpers = Object.entries(postProcessApiProfiles)
    .filter(([, profile]) => profile.promotion === "blocked")
    .map(([name]) => name);

  expect(postProcessApiProfiles.flashbang.proof).toBe("migrated-game");
  expect(postProcessApiProfiles.flashbang.fit).toBe("migrated-fit");
  expect(postProcessApiProfiles.flashbang.promotion).toBe("blocked");
  expect(postProcessApiProfiles.flashbang.exposure).toBe("prototype-subpath");
  expect(postProcessApiProfiles.bloom.proof).toBe("candidate");
  expect(postProcessApiProfiles.bloom.fit).toBe("failed-fit");
  expect(postProcessApiProfiles.pixelate.proof).toBe("candidate");
  expect(postProcessApiProfiles.pixelate.fit).toBe("failed-fit");
  expect(postProcessApiProfiles.lensFlare.fit).toBe("failed-fit");
  expect(postProcessApiProfiles.starStreak.fit).toBe("failed-fit");
  expect(postProcessApiProfiles.shockwaveDistortion.fit).toBe("failed-fit");
  expect(postProcessApiProfiles.glitch.fit).toBe("failed-fit");
  expect(migratedPrototypeHelpers).toEqual(["flashbang"]);
  expect(promotionBlockedHelpers).toEqual(
    Object.entries(postProcessApiProfiles)
      .filter(([, profile]) => profile.status === "prototype")
      .map(([name]) => name)
  );
});

test("post process prototype helpers stay isolated in the prototype subpath", () => {
  for (const [name, profile] of Object.entries(postProcessApiProfiles)) {
    if (profile.status === "prototype") {
      expect(profile.exposure, name).toBe("prototype-subpath");
      expect(profile.promotion, name).toBe("blocked");
      continue;
    }

    expect(profile.exposure, name).toBe("root");
    expect(profile.promotion, name).toBe("stable");
  }
});

test("post process profile names match profiled helpers", () => {
  expect(Object.keys(postProcessApiProfiles).sort()).toEqual([...postProcessApiProfileNames].sort());
});

test("post process helpers reject loop parameters that could hang or exhaust a frame", () => {
  const ctx = { canvas: { width: 8, height: 8 } } as unknown as CanvasRenderingContext2D;
  for (const spacing of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => crtScanlines(spacing)).toThrow("spacing");
  }
  for (const samples of [-1, Number.NaN, Number.POSITIVE_INFINITY, 257]) {
    expect(() => motionBlur(ctx, 1, 0, samples)).toThrow("samples");
    expect(() => radialBlur(ctx, 0.1, samples)).toThrow("samples");
  }
  expect(() => pixelate(ctx, Number.POSITIVE_INFINITY)).toThrow("pixelate size");
  expect(() => posterize(Number.POSITIVE_INFINITY)).toThrow("posterize levels");
  expect(() => retroDithering(257)).toThrow("retro dithering levels");
});

test("overlay helpers restore canvas state when drawing fails", () => {
  const calls: string[] = [];
  const ctx = {
    canvas: { width: 8, height: 8 },
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    drawImage() {
      throw new Error("draw failed");
    }
  } as unknown as CanvasRenderingContext2D;
  expect(() => bloom(ctx)).toThrow("draw failed");
  expect(calls).toEqual(["save", "restore"]);
});
