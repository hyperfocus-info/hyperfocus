import { describe, expect, test } from "bun:test";
import { createPlayableWorld, playableBehaviorDefinition2D } from "@hyperfocus/engine/project/runtime-2d";
import { createHyperfocus3DRuntime } from "@hyperfocus/engine/project/runtime-3d";
import { collectPlayableBuildAssets } from "./playable-build-assets.ts";
import { migrateProject, stableProjectJson } from "@hyperfocus/engine/project";
import { createEditorStarter, createPongProject } from "./starter-projects.ts";

describe("editor happy-path starters", () => {
  test("asset-free starters survive the command-session migration boundary", () => {
    for (const id of ["pong", "platformer", "blank-2d"] as const) {
      const project = createEditorStarter(id, `Migrated ${id}`).project;
      expect(migrateProject(JSON.parse(stableProjectJson(project))).extensions?.hyperfocusStarter).toMatchObject({ template: id });
    }
  });

  test("blank 2D removes default atlas clips with the default atlas frames", () => {
    const project = createEditorStarter("blank-2d", "Actually Blank").project;
    expect(project.atlas.frames).toEqual([]);
    expect(project.atlas.sequence).toEqual([]);
    expect(project.atlas.clips).toEqual([]);
    expect(project.atlas.defaultClipId).toBeUndefined();
    expect(() => migrateProject(JSON.parse(stableProjectJson(project)))).not.toThrow();
  });

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
    const ballBehavior = project.scenes[0].entities.find((entity) => entity.id === "ball")!.components.find((component) => component.type === "behavior")!;
    expect(playableBehaviorDefinition2D(ballBehavior)).toMatchObject({
      label: "Pong ball",
      fields: expect.arrayContaining([
        expect.objectContaining({ key: "maximumSpeed", type: "number" }),
        expect.objectContaining({ key: "leftScoreKey", type: "state-key" }),
      ]),
      events: [expect.objectContaining({ name: "pong:score" })],
    });

    const scoringProject = createPongProject("Scoring Pong");
    const cpu = scoringProject.scenes[0].entities.find((entity) => entity.id === "cpu-paddle")!;
    cpu.components.find((component) => component.type === "collider")!.enabled = false;
    const scoringWorld = createPlayableWorld(scoringProject);
    let observedLeftScore = false;
    for (let index = 0; index < 180; index += 1) {
      if (scoringWorld.step().events.some((event) => event.name === "pong:score" && event.data?.side === "left")) observedLeftScore = true;
    }
    expect(scoringWorld.getState("score.left")).toBeGreaterThan(0);
    expect(observedLeftScore).toBe(true);
    expect(scoringWorld.getEntity("score-left")?.components?.find((component) => component.type === "ui")?.values.text).toBe(String(scoringWorld.getState("score.left")));
    const preflight = await collectPlayableBuildAssets(project, async () => undefined);
    expect(preflight.diagnostics).toEqual([]);
  });

  test("platformer starter runs, jumps, collides, and passes one-click build preflight", async () => {
    const project = createEditorStarter("platformer", "Glassline Test").project;
    const world = createPlayableWorld(project);
    expect(world.diagnostics).toEqual([]);
    for (let index = 0; index < 30; index += 1) world.step();
    const before = world.getEntity("player")!;
    world.step({ actions: ["move-right", "jump"] });
    for (let index = 0; index < 8; index += 1) world.step({ actions: ["move-right"] });
    const after = world.getEntity("player")!;
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeLessThan(before.y);
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
