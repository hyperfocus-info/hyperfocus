import { expect, test } from "bun:test";
import type { PlayableBehaviorCommand2D, PlayableEntity2D, PlayableProject2D } from "./runtime-2d-contracts.ts";
import { createPlayableWorld } from "./runtime-world-2d.ts";

function actor(id: string): PlayableEntity2D {
  return { id, label: id, x: 0, y: 0, width: 20, height: 20, scale: 1, layer: 1, color: "#fff", accent: "#000", kind: "rectangle", components: [] };
}

function fixture(commands: () => PlayableBehaviorCommand2D[]) {
  const lead = actor("lead");
  lead.components.push({ id: "script", type: "behavior", enabled: true, values: { module: "../src/actor.ts", export: "update" } });
  const child = { ...actor("child"), parentId: "lead", x: 15 };
  const wall = { ...actor("wall"), x: 100, components: [{ id: "solid", type: "collider", enabled: true, values: { solid: true } }] };
  const project: PlayableProject2D = { activeSceneId: "scene", scenes: [{ id: "scene", entities: [lead, child, wall] }], tilemap: { columns: 1, rows: 1, tileSize: 32, values: [0] }, settings: { input: [] } };
  return { project, world: createPlayableWorld(project, { behaviors: { "../src/actor.ts#update": () => ({ commands: commands() }) } }) };
}

test("sets absolute transforms, preserves omitted fields and translates descendants once", () => {
  let commands: PlayableBehaviorCommand2D[] = [{ type: "set-transform", x: 40, y: 30, rotation: Math.PI / 6, scale: 2 }];
  const { project, world } = fixture(() => commands);
  world.step();
  expect(world.getEntity("lead")).toMatchObject({ x: 40, y: 30, rotation: Math.PI / 6, scale: 2 });
  expect(world.getEntity("child")).toMatchObject({ x: 55, y: 30, scale: 1 });
  expect(project.scenes[0].entities[0]).toMatchObject({ x: 0, y: 0, scale: 1 });
  const saved = world.snapshot();
  commands = [{ type: "set-transform", entityId: "lead", x: 90 }];
  world.step();
  expect(world.getEntity("lead")).toMatchObject({ x: 90, y: 30, rotation: Math.PI / 6, scale: 2 });
  world.restore(saved);
  expect(world.snapshot()).toEqual(saved);
  world.switchScene("scene");
  expect(world.getEntity("lead")).toMatchObject({ x: 0, y: 0, scale: 1 });
});

test("rejects malformed transforms before committing any command in the batch", () => {
  const invalid: unknown[] = [
    { x: NaN }, { y: Infinity }, { x: "40" }, { x: 1e10 }, { rotation: null },
    { scale: 0 }, { scale: -1 }, { scale: Infinity }, {}, { rotation: [0, 0, 0, 1] },
    { x: 20, z: 3 }, { x: 20, entityId: "absent" }, { x: 20, entityId: null },
  ];
  for (const value of invalid) {
    const command: PlayableBehaviorCommand2D = { type: "set-transform", ...Object(value) };
    const { world } = fixture(() => [{ type: "set-state", key: "committed", value: true }, { type: "set-transform", x: 80 }, command]);
    expect(() => world.step()).toThrow();
    expect(world.getEntity("lead")?.x).toBe(0);
    expect(world.snapshot().state).not.toHaveProperty("committed");
  }
});

test("validates ordered spawn/transform/destroy dependencies without partial application", () => {
  const { world } = fixture(() => [{ type: "spawn-entity", entity: actor("spawned") }, { type: "set-transform", entityId: "spawned", x: 75, scale: 3 }]);
  world.step();
  expect(world.getEntity("spawned")).toMatchObject({ x: 75, scale: 3 });
  const { world: rejected } = fixture(() => [{ type: "destroy-entity", entityId: "child" }, { type: "set-transform", entityId: "child", x: 10 }]);
  expect(() => rejected.step()).toThrow();
  expect(rejected.getEntity("child")).toBeDefined();
});

test("updated scale participates in subsequent AABB collision while rotation remains visual", () => {
  let commands: PlayableBehaviorCommand2D[] = [{ type: "set-transform", entityId: "wall", scale: 3, rotation: Math.PI / 4 }];
  const { project } = fixture(() => commands);
  project.scenes[0].entities[0].components.push({ id: "solid", type: "collider", enabled: true, values: { solid: true } });
  const world = createPlayableWorld(project, { behaviors: { "../src/actor.ts#update": () => ({ velocityX: commands.length ? 0 : 6000, commands }) } });
  world.step(); commands = [];
  const result = world.step();
  expect(world.getEntity("lead")?.x).toBeCloseTo(60, 6);
  expect(result.collisions.some((collision) => collision.targetId === "wall")).toBe(true);
});

test("scene controller composes with later actors' transforms and switches only after old-scene commands", () => {
  const { project } = fixture(() => []);
  project.scenes.push({ id: "arrival", entities: [{ ...actor("child"), x: 900 }] });
  project.scenes[0].entities[1].components.push({ id: "animate", type: "behavior", enabled: true, values: { module: "../src/actor.ts", export: "animate" } });
  const world = createPlayableWorld(project, { behaviors: {
    "../src/actor.ts#update": () => ({ commands: [{ type: "switch-scene", sceneId: "arrival" }] }),
    "../src/actor.ts#animate": () => ({ commands: [{ type: "set-transform", x: 45, rotation: 0.4 }, { type: "set-state", key: "old-scene-finished", value: true }] }),
  } });
  expect(() => world.step()).not.toThrow();
  expect(world.sceneId).toBe("arrival");
  expect(world.getState("old-scene-finished")).toBe(true);
  expect(world.getEntity("child")?.x).toBe(900);
  expect(world.getEntity("child")?.rotation).toBeUndefined();
  expect(world.drainAudioCommands().at(-1)).toMatchObject({ type: "stop-scene", sceneId: "scene" });
});

test("ambiguous scene switches and malformed commands after a requested switch reject the command batch", () => {
  for (const suffix of [
    { type: "switch-scene" as const, sceneId: "scene" },
    { type: "set-transform" as const, x: NaN },
  ]) {
    const { world } = fixture(() => [{ type: "set-state", key: "committed", value: true }, { type: "switch-scene", sceneId: "scene" }, suffix]);
    expect(() => world.step()).toThrow();
    expect(world.getState("committed")).toBeUndefined();
    expect(world.getEntity("lead")?.x).toBe(0);
  }
});
