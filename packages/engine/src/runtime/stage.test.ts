import { expect, test } from "bun:test";
import { createStage } from "./stage.ts";

type TestEntity = {
  id: string;
  active?: boolean;
  layer?: number;
  order?: number;
};

test("stage renders lower layers before higher layers", () => {
  const rendered: string[] = [];
  const stage = createStage<TestEntity>({
    renderEntity: (entity) => {
      rendered.push(entity.id);
    }
  });

  stage.spawn({ id: "player" }, { layer: 10 });
  stage.spawn({ id: "background" }, { layer: -10 });
  stage.spawn({ id: "effect" }, { layer: 20 });

  stage.render(null);

  expect(rendered).toEqual(["background", "player", "effect"]);
});

test("stage preserves spawn order inside the same layer", () => {
  const rendered: string[] = [];
  const stage = createStage<TestEntity>({
    renderEntity: (entity) => {
      rendered.push(entity.id);
    }
  });

  stage.spawn({ id: "first" }, { layer: 1 });
  stage.spawn({ id: "second" }, { layer: 1 });

  stage.render(null);

  expect(rendered).toEqual(["first", "second"]);
});

test("stage can move an entity to a different render layer", () => {
  const rendered: string[] = [];
  const stage = createStage<TestEntity>({
    renderEntity: (entity) => {
      rendered.push(entity.id);
    }
  });
  const background = stage.spawn({ id: "background" }, { layer: -10 });

  stage.spawn({ id: "player" }, { layer: 0 });
  stage.setLayer(background, 10);
  stage.render(null);

  expect(rendered).toEqual(["player", "background"]);
});

test("stage updates only active entities", () => {
  const updated: string[] = [];
  const stage = createStage<TestEntity>({
    updateEntity: (entity) => {
      updated.push(entity.id);
    }
  });

  stage.spawn({ id: "active" });
  stage.spawn({ id: "inactive", active: false });
  stage.update(1 / 60);

  expect(updated).toEqual(["active"]);
});

test("stage mutation does not skip the next entity or update new spawns early", () => {
  const updated: string[] = [];
  let first: TestEntity;
  const stage = createStage<TestEntity>({
    updateEntity: (entity) => {
      updated.push(entity.id);
      if (entity === first) {
        stage.remove(first);
        stage.spawn({ id: "late" });
      }
    }
  });

  first = stage.spawn({ id: "first" });
  stage.spawn({ id: "second" });
  stage.update(1 / 60);
  expect(updated).toEqual(["first", "second"]);

  stage.update(1 / 60);
  expect(updated).toEqual(["first", "second", "second", "late"]);
});

test("stage mutation still visits later entities when a callback removes itself and an earlier entity", () => {
  const updated: string[] = [];
  let first: TestEntity;
  let second: TestEntity;
  const stage = createStage<TestEntity>({
    updateEntity(entity) {
      updated.push(entity.id);
      if (entity === second) {
        stage.remove(first);
        stage.remove(second);
      }
    }
  });
  first = stage.spawn({ id: "first" });
  second = stage.spawn({ id: "second" });
  stage.spawn({ id: "third" });

  stage.update(1 / 60);
  expect(updated).toEqual(["first", "second", "third"]);
});

test("stage render mutations do not render removed or newly spawned entities", () => {
  const rendered: string[] = [];
  let first: TestEntity;
  let second: TestEntity;
  const stage = createStage<TestEntity>({
    renderEntity(entity) {
      rendered.push(entity.id);
      if (entity === first) {
        stage.remove(second);
        stage.spawn({ id: "late" });
      }
    }
  });
  first = stage.spawn({ id: "first" });
  second = stage.spawn({ id: "second" });

  stage.render(null);
  expect(rendered).toEqual(["first"]);
  stage.render(null);
  expect(rendered).toEqual(["first", "first", "late"]);
});

test("stage does not process an entity removed and re-spawned during the same pass", () => {
  const updated: string[] = [];
  let first: TestEntity;
  let second: TestEntity;
  const stage = createStage<TestEntity>({
    updateEntity(entity) {
      updated.push(entity.id);
      if (entity === first) {
        stage.remove(second);
        stage.spawn(second);
      }
    }
  });
  first = stage.spawn({ id: "first" });
  second = stage.spawn({ id: "second" });

  stage.update(1 / 60);
  expect(updated).toEqual(["first"]);
  stage.update(1 / 60);
  expect(updated).toEqual(["first", "first"]);
});

test("stage rejects invalid layers and snapshot order values transactionally", () => {
  const stage = createStage<TestEntity>();
  stage.spawn({ id: "safe" });

  expect(() => stage.spawn({ id: "bad" }, { layer: Number.NaN })).toThrow("layer must be finite");
  expect(() => stage.deserialize({ version: 1, nextOrder: 0, entities: [] })).toThrow("positive safe integer");
  expect(stage.entities().map((entity) => entity.id)).toEqual(["safe"]);
});

test("stage serializes and restores ordered entities for rollback", () => {
  const stage = createStage<TestEntity>({
    deserializeEntity(snapshot) {
      if (!snapshot || typeof snapshot !== "object") throw new Error("invalid stage entity snapshot");
      const id = Reflect.get(snapshot, "id");
      const layer = Reflect.get(snapshot, "layer");
      const order = Reflect.get(snapshot, "order");
      if (typeof id !== "string" || typeof layer !== "number" || typeof order !== "number") throw new Error("invalid stage entity snapshot");
      return { id, layer, order };
    }
  });
  stage.spawn({ id: "first" }, { layer: 1 });
  stage.spawn({ id: "second" }, { layer: 2 });
  const snapshot = stage.serialize();

  stage.spawn({ id: "late" }, { layer: 3 });
  stage.deserialize(snapshot);
  stage.spawn({ id: "after" });

  expect(stage.entities().map((entity) => ({ id: entity.id, order: entity.order }))).toEqual([
    { id: "first", order: 1 },
    { id: "second", order: 2 },
    { id: "after", order: 3 }
  ]);
});

test("stage rejects invalid frame values and does not expose its membership array", () => {
  const stage = createStage<TestEntity>();
  stage.spawn({ id: "safe" });

  expect(() => stage.update(Number.NaN)).toThrow("non-negative finite");
  expect(() => stage.update(-1)).toThrow("non-negative finite");
  expect(() => stage.render(null, Number.POSITIVE_INFINITY)).toThrow("alpha must be finite");

  stage.entities().length = 0;
  expect(stage.count()).toBe(1);
  expect(stage.entities()[0].id).toBe("safe");
});

test("stage requires a parser before restoring snapshot entities", () => {
  const stage = createStage<TestEntity>();
  expect(() => stage.deserialize({ version: 1, nextOrder: 1, entities: [] })).toThrow("deserializeEntity parser is required");
});
