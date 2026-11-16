import { expect, test } from "bun:test";
import { createDefaultProject } from "./editor.ts";
import { createPlayableWorld } from "./runtime2d/runtime-world-2d.ts";

test("audio stop preserves the scene and state and rejects malformed batches before mutation", () => {
  const project = createDefaultProject("Stop narration");
  project.tilemap.values.fill(0);
  project.scenes[0]!.entities = [project.scenes[0]!.entities[0]!];
  const entity = project.scenes[0]!.entities[0]!;
  entity.components = [{ id: "controller", type: "behavior", enabled: true, values: { module: "./voice.ts", export: "update" } }];
  const command = { type: "stop-audio" as const, bus: "voice" as const };
  const world = createPlayableWorld(project, { behaviors: { "./voice.ts#update": () => ({ commands: [
    { type: "set-state", key: "chapter", value: 4 },
    command,
  ] }) } });
  const before = world.getEntity(entity.id)!;
  const result = world.step();
  expect(result.audioCommands).toEqual([{ type: "stop", commandId: expect.any(String), sceneId: project.activeSceneId, bus: "voice" }]);
  expect(world.snapshot().state?.chapter).toBe(4);
  expect(world.getEntity(entity.id)).toEqual(before);
  const unchanged = world.snapshot();
  // Authored JavaScript can supply invalid values despite the static command contract.
  Reflect.set(command, "bus", "not-a-bus");
  expect(() => world.step()).toThrow("audio bus");
  expect(world.snapshot().state).toEqual(unchanged.state);
});

test("an authored stop action stops its scene bus once and takes precedence over its play trigger", () => {
  const project = createDefaultProject("Stop action");
  project.tilemap.values.fill(0);
  const entity = project.scenes[0]!.entities[0]!;
  project.scenes[0]!.entities = [entity];
  project.assets.push({ id: "narration", kind: "audio", name: "Narration", mimeType: "audio/wav", size: 4, lastModified: 1, source: "imported" });
  entity.components = [{ id: "voice", type: "audio", enabled: true, values: { assetId: "narration", trigger: "action:stop", stopAction: "stop", bus: "voice" } }];
  const world = createPlayableWorld(project);
  expect(world.step({ actions: ["stop"] }).audioCommands).toEqual([{ type: "stop", commandId: expect.any(String), sceneId: project.activeSceneId, bus: "voice" }]);
  expect(world.step({ actions: ["stop"] }).audioCommands).toEqual([]);
  entity.components[0]!.values.stopAction = 7;
  expect(() => createPlayableWorld(project)).toThrow("stop action");
});
