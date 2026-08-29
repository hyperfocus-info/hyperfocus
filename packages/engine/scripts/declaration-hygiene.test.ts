import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertCameraDeclarationSource,
  assertCameraRootExportsSource,
  assertRootBrowserSubpathOnlyDeclarationsSource
} from "./declaration-hygiene.ts";

const cleanCameraDeclaration = [
  "import type { Point } from '../math/collision.js';",
  "export type CameraTarget = Point & { w?: number; h?: number; width?: number; height?: number };",
  "export type CameraBounds = { x: number; y: number; w: number; h: number };",
  "export type FollowOptions = { deadzoneX?: number; deadzoneY?: number; smoothing?: number };",
  "export type CameraOptions = { viewportWidth: number; viewportHeight: number };",
  "export type CameraState = { x: number; y: number; zoom: number; viewportWidth: number; viewportHeight: number; bounds: CameraBounds | null; follow: CameraTarget | null };",
  "export type Camera = {",
  "pan(dx: number, dy: number): Camera;",
  "centerOn(point: Point, amount?: number): Camera;",
  "follow(target: CameraTarget | null, followOptions?: FollowOptions): Camera;",
  "clearFollow(): Camera;",
  "update(): void;",
  "zoomTo(value: number, anchor?: Point): Camera;",
  "zoomBy(factor: number, anchor?: Point): Camera;",
  "setViewport(width: number, height: number): Camera;",
  "setBounds(nextBounds: CameraBounds | null): Camera;",
  "};",
  "export declare function createCamera(options: CameraOptions): Camera;",
].join("\n");

describe("camera declaration hygiene", () => {
  test("guards the checked-in generated camera declarations", () => {
    const rootDir = join(import.meta.dir, "..");
    const cameraDeclaration = readFileSync(join(rootDir, "dist/src/canvas/camera.d.ts"), "utf8");
    const rootDeclaration = readFileSync(join(rootDir, "dist/src/index.d.ts"), "utf8");

    expect(() => assertCameraDeclarationSource(cameraDeclaration, "dist/src/canvas/camera.d.ts")).not.toThrow();
    expect(() => assertCameraRootExportsSource(rootDeclaration, "dist/src/index.d.ts")).not.toThrow();
  });

  test("accepts the strict public camera surface", () => {
    expect(() => assertCameraDeclarationSource(cleanCameraDeclaration, "camera.d.ts")).not.toThrow();
  });

  test("rejects elided any leaks before package smoke imports runtime builds", () => {
    const leaked = cleanCameraDeclaration.replace(
      "pan(dx: number, dy: number): Camera;",
      "pan: /*elided*/ any;",
    );

    expect(() => assertCameraDeclarationSource(leaked, "camera.d.ts")).toThrow(
      "declaration emit leaked elided any in camera.d.ts",
    );
  });

  test("rejects lost named fluent camera returns", () => {
    const leaked = cleanCameraDeclaration.replace(
      "zoomTo(value: number, anchor?: Point): Camera;",
      "zoomTo(value: number, anchor?: Point): unknown;",
    );

    expect(() => assertCameraDeclarationSource(leaked, "camera.d.ts")).toThrow(
      "camera.d.ts lost public camera signature: zoomTo(value: number, anchor?: Point): Camera;",
    );
  });

  test("rejects root declaration entries that drop camera exports", () => {
    const rootDeclaration = 'export { createCamera, type Camera, type CameraOptions } from "./canvas/camera.js";';

    expect(() => assertCameraRootExportsSource(rootDeclaration, "index.d.ts")).toThrow(
      "index.d.ts lost public camera export: CameraState",
    );
  });

  test("rejects mmo/render/physics helpers leaked through root declarations", () => {
    const rootDeclaration = [
      'export { createCamera, type Camera, type CameraOptions, type CameraState } from "./canvas/camera.js";',
      'export { createMmoWorld } from "./mmo/index.js";',
      'export { createRenderStage } from "./render/index.js";',
      'export { createKinematicCharacter3D } from "./physics/3d.js";',
    ].join("\n");

    expect(() => assertRootBrowserSubpathOnlyDeclarationsSource(rootDeclaration, "index.d.ts")).toThrow(
      "index.d.ts must not re-export mmo/render/physics internals from root/browser declarations",
    );
  });
});
