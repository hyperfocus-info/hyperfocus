import { describe, expect, test } from "bun:test";
import { createPlayableWorld } from "../../../engine/src/project/runtime-2d.ts";
import { createHyperfocus3DRuntime } from "../../../engine/src/project/runtime-3d.ts";
import { collectPlayableBuildAssets } from "./playable-build-assets.ts";
import { createEditorStarter, createPongProject } from "./starter-projects.ts";

describe("editor happy-path starters", () => {
  test("Pong is immediately playable and passes one-click build preflight", async () => {
    const project = createPongProject("Five Minute Pong");
    const world = createPlayableWorld(project);
    expect(world.diagnostics).toEqual([]);
    const ballBefore = world.getEntity("ball")!;
    const paddleBefore = world.getEntity("player-paddle")!;
    world.step({ actions: ["move-up"] });
    expect(world.getEntity("ball")!.x).toBeGreaterThan(ballBefore.x);
    expect(world.getEntity("player-paddle")!.y).toBeLessThan(paddleBefore.y);
    for (let index = 0; index < 240; index += 1) world.step();
    const ballAfter = world.getEntity("ball")!;
    expect(ballAfter.x).toBeGreaterThanOrEqual(-ballAfter.width);
    expect(ballAfter.x).toBeLessThanOrEqual(project.tilemap.columns * project.tilemap.tileSize + ballAfter.width);
    const preflight = await collectPlayableBuildAssets(project, async () => undefined);
    expect(preflight.diagnostics).toEqual([]);
  });

  test("3D starter contains real cookable assets and a moving portable runtime", async () => {
    const starter = createEditorStarter("3d-action", "Browser 3D");
    const assets = await Promise.all(starter.assets.map(async (asset) => ({
      id: asset.id,
      mimeType: asset.blob.type,
      bytes: new Uint8Array(await asset.blob.arrayBuffer()),
    })));
    const runtime = await createHyperfocus3DRuntime(starter.project, assets);
    expect(runtime.diagnostics).toEqual([]);
    const commands = runtime.compile();
    expect(commands.commandCount).toBe(3);
    expect(commands.instanceCount).toBe(5);
    const before = runtime.snapshot().entities.find((entity) => entity.id === "actor")!;
    const after = runtime.step(["move-right"]).entities.find((entity) => entity.id === "actor")!;
    expect(after.position[0]).toBeGreaterThan(before.position[0]);
  });
});
