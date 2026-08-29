import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("editor Canvas2D readback contexts", () => {
  test("requests readback-optimized contexts only for surfaces that run pixel effects", async () => {
    const source = await readFile(new URL("./client.ts", import.meta.url), "utf8");
    expect(source).toContain("const stageContext = require2dContext(stageCanvas, true)");
    expect(source).toContain("const activePostContext = require2dContext(activePostCanvas, true)");
    expect(source).toContain("const exportPreviewContext = require2dContext(exportPreviewCanvas, true)");
    expect(source).toContain("const reviewContext = require2dContext(reviewCanvas, true)");
    expect(source).toContain('canvas.getContext("2d", { willReadFrequently: true })');
    expect(source).toContain("const rawPostContext = require2dContext(rawPostCanvas)");
  });
});
