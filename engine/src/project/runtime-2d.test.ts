import { describe, expect, test } from "bun:test";
import { createDefaultProject } from "../../../apps/engine-editor/src/project.ts";
import { auditPlayableProject, createPlayableWorld, type PlayableProject2D, type PlayableWorldSnapshot } from "./runtime-2d.ts";

function emptyMapProject() {
  const project = createDefaultProject("Runtime Test");
  project.tilemap.values.fill(0);
  return project;
}

describe("portable playable runtime", () => {
  test("moves input entities deterministically from actions or authored bindings", () => {
    const fromAction = createPlayableWorld(emptyMapProject());
    const fromBinding = createPlayableWorld(emptyMapProject());
    fromAction.step({ actions: ["move-right"] });
    fromBinding.step({ bindings: ["KeyD"] });
    expect(fromAction.getEntity("player-01")?.x).toBeCloseTo(320 + 220 / 60, 10);
    expect(fromBinding.snapshot()).toEqual(fromAction.snapshot());
  });

  test("normalizes diagonal input and obeys disabled input components", () => {
    const project = emptyMapProject();
    project.settings.input.push({ action: "move-up", bindings: ["KeyW"] });
    const world = createPlayableWorld(project);
    world.step({ bindings: ["KeyD", "KeyW"] });
    const player = world.getEntity("player-01")!;
    expect(player.x - 320).toBeCloseTo(220 * Math.SQRT1_2 / 60, 10);
    expect(242 - player.y).toBeCloseTo(220 * Math.SQRT1_2 / 60, 10);

    project.scenes[0].entities.find((entity) => entity.id === "player-01")!.components.find((component) => component.type === "input")!.enabled = false;
    const stopped = createPlayableWorld(project);
    stopped.step({ actions: ["move-right"] });
    expect(stopped.getEntity("player-01")?.x).toBe(320);
  });

  test("sweeps into solid entity colliders without tunneling", () => {
    const project = emptyMapProject();
    const scene = project.scenes[0];
    const player = scene.entities.find((entity) => entity.id === "player-01")!;
    const crate = scene.entities.find((entity) => entity.id === "crate-01")!;
    crate.x = 400;
    crate.y = player.y;
    crate.width = 20;
    crate.height = 60;
    crate.components.push({ id: "crate-collider", type: "collider", enabled: true, values: { solid: true, shape: "box" } });
    const input = player.components.find((component) => component.type === "input")!;
    input.values.speed = 10_000;
    const world = createPlayableWorld(project);
    const result = world.step({ actions: ["move-right"] });
    expect(world.getEntity(player.id)?.x).toBe(400 - crate.width / 2 - player.width / 2);
    expect(result.collisions).toEqual([{ entityId: player.id, axis: "x", kind: "entity", targetId: crate.id }]);
  });

  test("resolves nonzero tilemap cells as solid AABBs", () => {
    const project = emptyMapProject();
    const player = project.scenes[0].entities.find((entity) => entity.id === "player-01")!;
    player.x = 100;
    player.y = 120;
    project.tilemap.values[2 * project.tilemap.columns + 3] = 7;
    project.tilemap.solidValues = [7];
    player.components.find((component) => component.type === "input")!.values.speed = 10_000;
    const world = createPlayableWorld(project);
    const result = world.step({ actions: ["move-right"] });
    expect(world.getEntity(player.id)?.x).toBe(3 * 48 - player.width / 2);
    expect(result.collisions).toEqual([{ entityId: player.id, axis: "x", kind: "tile", tileColumn: 3, tileRow: 2 }]);
  });

  test("carries descendants when a parent transform moves", () => {
    const project = emptyMapProject();
    const scene = project.scenes[0];
    const player = scene.entities.find((entity) => entity.id === "player-01")!;
    const torch = scene.entities.find((entity) => entity.id === "torch-west")!;
    torch.parentId = player.id;
    const world = createPlayableWorld(project);
    world.step({ actions: ["move-right"] });
    expect(world.getEntity(torch.id)!.x - torch.x).toBeCloseTo(world.getEntity(player.id)!.x - player.x, 10);
  });

  test("runs builtin patrol while reporting arbitrary modules as unsupported", () => {
    const project = emptyMapProject();
    const sentinel = project.scenes[0].entities.find((entity) => entity.id === "sentinel-a")!;
    const behavior = sentinel.components.find((component) => component.type === "behavior")!;
    behavior.values = { module: "builtin:patrol", axis: "x", speed: 60, distance: 1 };
    project.scenes[0].entities.find((entity) => entity.id === "player-01")!.components.push({
      id: "custom-player",
      type: "behavior",
      enabled: true,
      values: { module: "./src/player.ts", export: "update" },
    });
    const diagnostics = auditPlayableProject(project);
    expect(diagnostics.some((item) => item.entityId === sentinel.id)).toBe(false);
    expect(diagnostics.some((item) => item.entityId === "player-01" && item.code === "unsupported-behavior")).toBe(true);
    const world = createPlayableWorld(project);
    const origin = sentinel.x;
    world.step();
    expect(world.getEntity(sentinel.id)?.x).toBe(origin + 1);
    world.step();
    expect(world.getEntity(sentinel.id)?.x).toBe(origin);
  });

  test("switches scenes and round-trips deterministic snapshots", () => {
    const project = emptyMapProject();
    project.scenes.push({ id: "scene-two", name: "Second", entities: [] });
    const world = createPlayableWorld(project);
    world.step({ actions: ["move-left"] });
    const saved = world.snapshot();
    expect(world.switchScene("scene-two")).toMatchObject({ sceneId: "scene-two", tick: 0, entities: [] });
    expect(world.restore(saved)).toEqual(saved);
    expect(() => world.switchScene("missing")).toThrow("Unknown playable scene");
    const invalid = structuredClone(saved) as PlayableWorldSnapshot;
    invalid.entities.push({ ...invalid.entities[0] });
    expect(() => world.restore(invalid)).toThrow("entity count");
  });

  test("bounds fixed-step catch-up and reports discarded time", () => {
    const world = createPlayableWorld(emptyMapProject(), { fixedStepSeconds: 0.1, maxSubSteps: 2 });
    const result = world.advance(0.55, { actions: ["move-right"] });
    expect(result.steps).toBe(2);
    expect(result.droppedSeconds).toBeCloseTo(0.3, 10);
    expect(result.alpha).toBeCloseTo(0.5, 10);
    expect(world.tick).toBe(2);
  });

  test("runs an explicitly registered statically bundled behavior", () => {
    const project = emptyMapProject();
    const player = project.scenes[0].entities.find((entity) => entity.id === "player-01")!;
    player.components.push({ id: "dash", type: "behavior", enabled: true, values: { module: "./src/dash.ts", export: "updateDash", speed: 90 } });
    const world = createPlayableWorld(project, {
      behaviors: {
        "./src/dash.ts#updateDash": ({ actions, component }) => actions.includes("interact") ? { velocityX: Number(component.values.speed) } : undefined,
      },
    });
    expect(world.diagnostics).toHaveLength(0);
    world.step({ actions: ["interact"] });
    expect(world.getEntity(player.id)?.x).toBeCloseTo(player.x + 1.5, 10);
  });

  test("emits validated start and rising-edge action audio commands", () => {
    const project = emptyMapProject();
    project.assets.push({ id: "asset-tone", name: "tone.wav", kind: "audio", mimeType: "audio/wav", size: 4, lastModified: 1, source: "imported" });
    const player = project.scenes[0].entities.find((entity) => entity.id === "player-01")!;
    player.components.push(
      { id: "ambience", type: "audio", enabled: true, values: { assetId: "asset-tone", trigger: "start", bus: "ambient", volume: 0.4, loop: true } },
      { id: "interact-sound", type: "audio", enabled: true, values: { asset: "asset-tone", trigger: "action:interact", pan: -0.2, priority: 3 } },
    );
    const world = createPlayableWorld(project);
    expect(world.drainAudioCommands()).toEqual([{
      type: "play", commandId: "play:scene-main:player-01:ambience:0", sceneId: "scene-main", entityId: "player-01", componentId: "ambience",
      assetId: "asset-tone", bus: "ambient", gain: 0.4, pan: 0, loop: true, priority: 0,
    }]);
    expect(world.step({ actions: ["interact"] }).audioCommands).toEqual([{
      type: "play", commandId: "play:scene-main:player-01:interact-sound:0", sceneId: "scene-main", entityId: "player-01", componentId: "interact-sound",
      assetId: "asset-tone", bus: "sfx", gain: 1, pan: -0.2, loop: false, priority: 3,
    }]);
    expect(world.step({ actions: ["interact"] }).audioCommands).toEqual([]);
    world.step();
    expect(world.step({ actions: ["interact"] }).audioCommands).toHaveLength(1);
    expect(world.drainAudioCommands()).toHaveLength(2);
  });

  test("stops the previous scene audio before deterministic target start audio", () => {
    const project = emptyMapProject();
    project.assets.push({ id: "music", name: "music.ogg", kind: "audio", mimeType: "audio/ogg", size: 4, lastModified: 1, source: "imported" });
    project.scenes[0].entities[0].components.push({ id: "field-music", type: "audio", enabled: true, values: { asset: "music", autoplay: true, loop: true, bus: "music" } });
    project.scenes.push({ id: "town", name: "Town", entities: [{ ...structuredClone(project.scenes[0].entities[0]), id: "town-speaker", components: [{ id: "town-music", type: "audio", enabled: true, values: { asset: "music", trigger: "start", bus: "music" } }] }] });
    const world = createPlayableWorld(project);
    world.drainAudioCommands();
    world.switchScene("town");
    expect(world.drainAudioCommands().map((command) => [command.type, command.sceneId])).toEqual([["stop-scene", "scene-main"], ["play", "town"]]);
  });

  test("rejects missing assets and malformed audio semantics", () => {
    const missing = emptyMapProject();
    missing.scenes[0].entities[0].components.push({ id: "bad", type: "audio", enabled: true, values: { asset: "missing", trigger: "start" } });
    expect(() => createPlayableWorld(missing)).toThrow("references missing asset");

    const invalid = emptyMapProject();
    invalid.assets.push({ id: "tone", name: "tone.wav", kind: "audio", mimeType: "audio/wav", size: 4, lastModified: 1, source: "imported" });
    invalid.scenes[0].entities[0].components.push({ id: "bad", type: "audio", enabled: true, values: { asset: "tone", trigger: "collision", volume: 8 } });
    expect(() => createPlayableWorld(invalid)).toThrow("trigger must be start");
  });

  test("bounds pending audio work when a host does not drain commands", () => {
    const project = emptyMapProject();
    project.assets.push({ id: "tone", name: "tone.wav", kind: "audio", mimeType: "audio/wav", size: 4, lastModified: 1, source: "imported" });
    project.scenes[0].entities[0].components.push(
      { id: "one", type: "audio", enabled: true, values: { asset: "tone", trigger: "start" } },
      { id: "two", type: "audio", enabled: true, values: { asset: "tone", trigger: "start" } },
    );
    expect(() => createPlayableWorld(project, { maxPendingAudioCommands: 1 })).toThrow("audio command queue exceeds");
  });

  test("lands a platformer deterministically and exposes grounded controller state", () => {
    const authored = platformerProject();
    const first = createPlayableWorld(authored);
    const second = createPlayableWorld(authored);
    for (let tick = 0; tick < 120; tick += 1) { first.step(); second.step(); }
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.getEntity("player")?.y).toBeCloseTo(46, 10);
    expect(first.getPlatformerState("player")).toMatchObject({ grounded: true, verticalVelocity: 0 });
  });

  test("uses rising-edge jump and release cutting without held-key retrigger", () => {
    const authored = platformerProject(46);
    const held = createPlayableWorld(authored);
    const released = createPlayableWorld(authored);
    held.step({ actions: ["jump"] });
    released.step({ actions: ["jump"] });
    released.step();
    for (let tick = 0; tick < 7; tick += 1) {
      held.step({ actions: ["jump"] });
      released.step();
    }
    expect(held.getEntity("player")!.y).toBeLessThan(released.getEntity("player")!.y);
    for (let tick = 0; tick < 300; tick += 1) held.step({ actions: ["jump"] });
    expect(held.getPlatformerState("player")?.grounded).toBe(true);
  });

  test("supports coyote time after running off a ledge", () => {
    const authored = platformerProject(46);
    authored.tilemap.values.fill(0);
    for (let column = 0; column <= 2; column += 1) authored.tilemap.values[5 * authored.tilemap.columns + column] = 1;
    const controller = authored.scenes[0].entities[0].components.find((component) => component.values.module === "builtin:platformer")!;
    controller.values.runSpeed = 120;
    const world = createPlayableWorld(authored);
    for (let tick = 0; tick < 6; tick += 1) world.step({ actions: ["move-right"] });
    expect(world.getPlatformerState("player")?.grounded).toBe(false);
    world.step({ actions: ["move-right", "jump"] });
    expect(world.getPlatformerState("player")!.verticalVelocity).toBeLessThan(0);
  });

  test("executes a buffered jump on the tick after landing", () => {
    const world = createPlayableWorld(platformerProject(30));
    while (world.getEntity("player")!.y < 43) world.step();
    world.step({ actions: ["jump"] });
    expect(world.getPlatformerState("player")?.grounded).toBe(true);
    world.step();
    expect(world.getPlatformerState("player")!.verticalVelocity).toBeLessThan(0);
    expect(world.getEntity("player")!.y).toBeLessThan(46);
  });

  test("sweeps high-speed jumps into ceilings without tunneling", () => {
    const authored = platformerProject(46);
    for (let column = 0; column < authored.tilemap.columns; column += 1) authored.tilemap.values[1 * authored.tilemap.columns + column] = 1;
    const controller = authored.scenes[0].entities[0].components.find((component) => component.values.module === "builtin:platformer")!;
    controller.values.jumpSpeed = 2_000;
    controller.values.gravity = 0;
    const world = createPlayableWorld(authored);
    world.step({ actions: ["jump"] });
    expect(world.getEntity("player")?.y).toBe(24);
    expect(world.getPlatformerState("player")?.verticalVelocity).toBe(0);
  });

  test("restores mid-air platformer state for deterministic replay", () => {
    const world = createPlayableWorld(platformerProject(46));
    world.step({ actions: ["jump"] });
    for (let tick = 0; tick < 8; tick += 1) world.step({ actions: ["jump"] });
    const checkpoint = world.snapshot();
    for (let tick = 0; tick < 20; tick += 1) world.step();
    const expected = world.snapshot();
    world.restore(checkpoint);
    for (let tick = 0; tick < 20; tick += 1) world.step();
    expect(world.snapshot()).toEqual(expected);
  });

  test("rejects platformer controllers without coherent collider and input ownership", () => {
    const noCollider = platformerProject();
    noCollider.scenes[0].entities[0].components = noCollider.scenes[0].entities[0].components.filter((component) => component.type !== "collider");
    expect(() => createPlayableWorld(noCollider)).toThrow("requires an enabled solid box collider");
    const competingInput = platformerProject();
    competingInput.scenes[0].entities[0].components.push({ id: "input", type: "input", enabled: true, values: { speed: 100 } });
    expect(() => createPlayableWorld(competingInput)).toThrow("must not also use an input component");
  });
});

function platformerProject(y = 30): PlayableProject2D {
  const columns = 8;
  const rows = 6;
  const values = new Array(columns * rows).fill(0);
  for (let column = 0; column < columns; column += 1) values[(rows - 1) * columns + column] = 1;
  return {
    activeSceneId: "main",
    scenes: [{ id: "main", entities: [{
      id: "player", label: "Player", x: 25, y, width: 8, height: 8, scale: 1, layer: 1, color: "#fff", accent: "#000", kind: "actor" as const,
      components: [
        { id: "platformer", type: "behavior" as const, enabled: true, values: { module: "builtin:platformer", runSpeed: 60, gravity: 1_800, jumpSpeed: 300, maxFallSpeed: 600, coyoteMs: 100, jumpBufferMs: 150, jumpCutMultiplier: 0.5, groundProbe: 0.05 } },
        { id: "collider", type: "collider" as const, enabled: true, values: { shape: "box", solid: true } },
      ],
    }] }],
    assets: [],
    tilemap: { columns, rows, tileSize: 10, values, solidValues: [1] },
    settings: { input: [{ action: "move-left", bindings: ["KeyA"] }, { action: "move-right", bindings: ["KeyD"] }, { action: "jump", bindings: ["Space"] }] },
  };
}
