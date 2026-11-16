import { expect, test } from "bun:test";
import { createDefaultProject } from "../editor.ts";
import { createPlayableWorld } from "../runtime2d/runtime-world-2d.ts";

test("every behavior sees a restoration once, after a real fixed step, including a fresh world", () => {
  const project = createDefaultProject("Restore a narrated exhibit");
  project.tilemap.values.fill(0);
  project.scenes[0]!.entities = project.scenes[0]!.entities.slice(0, 2);
  for (const entity of project.scenes[0]!.entities) entity.components = [{ id: entity.id + "-behavior", type: "behavior", enabled: true, values: { module: "./test.ts", export: "update" } }];
  const seen: boolean[] = [];
  const options = { behaviors: { "./test.ts#update": (context: { restored?: boolean }) => { seen.push(context.restored === true); } } };
  const first = createPlayableWorld(project, options);
  first.step(); expect(seen).toEqual([false, false]); seen.length = 0;
  const saved = first.snapshot(); first.restore(saved);
  first.advance(0); expect(seen).toEqual([]);
  first.step(); first.step(); expect(seen).toEqual([true, true, false, false]); seen.length = 0;
  expect(first.snapshot()).not.toHaveProperty("restored");
  const cold = createPlayableWorld(project, options); cold.restore(saved); cold.step();
  expect(seen).toEqual([true, true]);
});

test("invalid restore does not announce a successful restore to behavior", () => {
  const project = createDefaultProject("Invalid restore");
  project.scenes[0]!.entities = [project.scenes[0]!.entities[0]!];
  project.scenes[0]!.entities[0]!.components = [{ id: "script", type: "behavior", enabled: true, values: { module: "./test.ts", export: "update" } }];
  const seen: boolean[] = [];
  const world = createPlayableWorld(project, { behaviors: { "./test.ts#update": context => { seen.push(context.restored === true); } } });
  expect(() => world.restore({ ...world.snapshot(), version: 9 })).toThrow();
  world.step(); expect(seen).toEqual([false]);
});
