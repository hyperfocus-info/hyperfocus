import { describe, expect, test } from "bun:test";
import {
  SceneLifecycle,
  createScenePrefabCatalog,
  type ContentComponent,
  type ScenePrefabSource,
} from "./scene-prefab.ts";

const component = (id: string, type: string, data: ContentComponent["data"] = {}): ContentComponent => ({ id, type, enabled: true, data });

function fixture(): ScenePrefabSource {
  return {
    prefabs: [
      {
        id: "actor",
        components: [component("transform", "transform", { x: 0, y: 0, tags: ["actor"] }), component("sprite", "sprite", { color: "blue" })],
        variants: [{ id: "fast", components: [component("move", "movement", { speed: 12 })] }],
      },
      {
        id: "enemy",
        extends: "actor",
        components: [component("transform", "transform", { x: 4 }), component("health", "health", { maximum: 100 })],
        variants: [
          { id: "elite", components: [component("health", "health", { maximum: 250, regeneration: 2 })] },
          { id: "boss", extends: "elite", components: [component("health", "health", { maximum: 1000 })] },
        ],
      },
    ],
    scenes: [
      {
        id: "field",
        entities: [
          { id: "enemy-01", prefabId: "enemy", variantIds: ["boss"], components: [component("health", "health", { current: 900 })] },
          { id: "marker", parentId: "enemy-01", components: [componentWithReferences("link", "link", {}, [{ kind: "entity", id: "enemy-01" }])] },
        ],
      },
      { id: "town", entities: [{ id: "spawn", components: [component("transform", "transform", { x: 2 })] }] },
    ],
  };
}

describe("scene and prefab content primitives", () => {
  test("resolves prefab inheritance and variant inheritance deterministically", () => {
    const catalog = createScenePrefabCatalog(fixture());
    const first = catalog.instantiatePrefab("enemy", { entityId: "explicit-01", variantIds: ["boss"] });
    const second = catalog.instantiatePrefab("enemy", { entityId: "explicit-01", variantIds: ["boss"] });
    expect(second).toEqual(first);
    expect(first.id).toBe("explicit-01");
    expect(first.components.map((item) => item.id)).toEqual(["transform", "sprite", "health"]);
    expect(first.components.find((item) => item.id === "transform")?.data).toEqual({ tags: ["actor"], x: 4, y: 0 });
    expect(first.components.find((item) => item.id === "health")?.data).toEqual({ maximum: 1000, regeneration: 2 });
  });

  test("instantiates detached scene snapshots and validates explicit references", () => {
    const catalog = createScenePrefabCatalog(fixture());
    const scene = catalog.snapshotScene("field");
    expect(scene.entities[0].components.find((item) => item.id === "health")?.data).toEqual({ current: 900, maximum: 1000, regeneration: 2 });
    scene.entities[0].components[0].data.x = 999;
    expect(catalog.snapshotScene("field").entities[0].components[0].data.x).toBe(4);

    const invalid = fixture();
    invalid.scenes[0].entities[1].components![0].references![0].id = "missing";
    expect(() => createScenePrefabCatalog(invalid)).toThrow("references missing entity missing");
  });

  test("detects prefab, variant, and entity-parent cycles", () => {
    const prefabCycle: ScenePrefabSource = { prefabs: [{ id: "a", extends: "b" }, { id: "b", extends: "a" }], scenes: [{ id: "ok", entities: [] }] };
    expect(() => createScenePrefabCatalog(prefabCycle)).toThrow("Prefab inheritance cycle");

    const variantCycle: ScenePrefabSource = { prefabs: [{ id: "a", variants: [{ id: "one", extends: "two" }, { id: "two", extends: "one" }] }], scenes: [{ id: "ok", entities: [] }] };
    expect(() => createScenePrefabCatalog(variantCycle)).toThrow("Variant inheritance cycle");

    const parentCycle: ScenePrefabSource = { scenes: [{ id: "bad", entities: [{ id: "a", parentId: "b" }, { id: "b", parentId: "a" }] }] };
    expect(() => createScenePrefabCatalog(parentCycle)).toThrow("parenting cycle");
  });

  test("enforces component, inheritance, data-depth, and entity bounds", () => {
    expect(() => createScenePrefabCatalog({ scenes: [{ id: "s", entities: [{ id: "e", components: [component("a", "x"), component("b", "x")] }] }] }, { maxComponentsPerEntity: 1 })).toThrow("component list");
    expect(() => createScenePrefabCatalog({ prefabs: [{ id: "a" }, { id: "b", extends: "a" }], scenes: [{ id: "s", entities: [] }] }, { maxPrefabDepth: 1 })).toThrow("inheritance depth");
    expect(() => createScenePrefabCatalog({ scenes: [{ id: "s", entities: [{ id: "e", components: [component("deep", "data", { one: { two: 3 } })] }] }] }, { maxValueDepth: 1 })).toThrow("data depth");
    expect(() => createScenePrefabCatalog({ scenes: [{ id: "s", entities: [{ id: "a" }, { id: "b" }] }] }, { maxEntitiesPerScene: 1 })).toThrow("entity limit");
  });

  test("requires explicit IDs and rejects invalid removals transactionally", () => {
    const catalog = createScenePrefabCatalog(fixture());
    expect(() => catalog.instantiatePrefab("enemy", { entityId: "" })).toThrow("Entity id is invalid");
    expect(() => catalog.instantiatePrefab("enemy", { entityId: "enemy-02", removeComponentIds: ["missing"] })).toThrow("removes unknown component");
    expect(catalog.instantiatePrefab("enemy", { entityId: "enemy-02" }).components).toHaveLength(3);
  });

  test("loads, transitions, unloads, and exposes lifecycle snapshots", async () => {
    const events: string[] = [];
    const lifecycle = new SceneLifecycle(createScenePrefabCatalog(fixture()), {
      load: (scene) => { events.push(`load:${scene.sceneId}`); },
      unload: (scene) => { events.push(`unload:${scene.sceneId}`); },
    });
    expect(lifecycle.snapshot()).toEqual({ version: 1, status: "idle", revision: 0 });
    await lifecycle.load("field");
    expect(lifecycle.snapshot()).toEqual({ version: 1, status: "active", revision: 1, activeSceneId: "field" });
    await lifecycle.transition("town");
    expect(events).toEqual(["load:field", "load:town", "unload:field"]);
    expect(lifecycle.activeSceneId).toBe("town");
    await lifecycle.unload();
    expect(lifecycle.snapshot()).toEqual({ version: 1, status: "idle", revision: 3 });
  });

  test("rolls back state when loading or transition unloading fails", async () => {
    let failTownLoad = true;
    let failFieldUnload = false;
    const events: string[] = [];
    const lifecycle = new SceneLifecycle(createScenePrefabCatalog(fixture()), {
      load: (scene) => {
        events.push(`load:${scene.sceneId}`);
        if (scene.sceneId === "town" && failTownLoad) throw new Error("load failed");
      },
      unload: (scene) => {
        events.push(`unload:${scene.sceneId}`);
        if (scene.sceneId === "field" && failFieldUnload) throw new Error("unload failed");
      },
    });
    await lifecycle.load("field");
    expect(lifecycle.transition("town")).rejects.toThrow("load failed");
    expect(lifecycle.snapshot()).toEqual({ version: 1, status: "active", revision: 1, activeSceneId: "field" });

    failTownLoad = false;
    failFieldUnload = true;
    expect(lifecycle.transition("town")).rejects.toThrow("unload failed");
    expect(events.slice(-3)).toEqual(["load:town", "unload:field", "unload:town"]);
    expect(lifecycle.snapshot()).toEqual({ version: 1, status: "active", revision: 1, activeSceneId: "field" });
  });

  test("serializes asynchronous lifecycle operations and restores stable snapshots", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const lifecycle = new SceneLifecycle(createScenePrefabCatalog(fixture()), { load: () => gate });
    const loading = lifecycle.load("field");
    expect(lifecycle.snapshot()).toEqual({ version: 1, status: "loading", revision: 0, pendingSceneId: "field" });
    expect(() => lifecycle.restore({ version: 1, status: "idle", revision: 0 })).toThrow("already in progress");
    release();
    await loading;
    const stable = lifecycle.snapshot();
    const restored = new SceneLifecycle(createScenePrefabCatalog(fixture()));
    expect(restored.restore(stable)).toEqual(stable);
    expect(restored.activeSceneSnapshot()?.sceneId).toBe("field");
  });
});

// Optional references argument keeps fixture declarations compact.
function componentWithReferences(id: string, type: string, data: ContentComponent["data"], references: ContentComponent["references"]): ContentComponent {
  return { id, type, enabled: true, data, references };
}
