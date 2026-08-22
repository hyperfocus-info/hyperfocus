import { describe, expect, test } from "bun:test";
import { createPlayableWorld, type PlayableProject2D } from "./runtime-2d.ts";
import { auditNavigationProject2D, createNavigationBehaviorRegistry2D } from "./runtime-navigation-2d.ts";

function project(): PlayableProject2D {
  return {
    activeSceneId: "main",
    scenes: [{ id: "main", entities: [{
      id: "agent", label: "Agent", x: 5, y: 5, width: 4, height: 4, scale: 1, layer: 1, color: "#fff", accent: "#000", kind: "actor",
      components: [{ id: "navigate", type: "behavior", enabled: true, values: { module: "builtin:navigate", targetX: 35, targetY: 5, speed: 10 } }],
    }] }],
    tilemap: { columns: 4, rows: 3, tileSize: 10, values: [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
    settings: { input: [] },
  };
}

describe("portable navigation behavior adapter", () => {
  test("uses first-party A* to move around blocked tiles deterministically", () => {
    const authored = project();
    const firstRegistry = createNavigationBehaviorRegistry2D(authored);
    const secondRegistry = createNavigationBehaviorRegistry2D(authored);
    expect(firstRegistry).not.toBe(secondRegistry);
    expect(firstRegistry["builtin:navigate#update"]).not.toBe(secondRegistry["builtin:navigate#update"]);
    const first = createPlayableWorld(authored, { fixedStepSeconds: 0.1, behaviors: firstRegistry });
    const second = createPlayableWorld(authored, { fixedStepSeconds: 0.1, behaviors: secondRegistry });
    for (let tick = 0; tick < 100; tick += 1) { first.step(); second.step(); }
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.getEntity("agent")?.x).toBeCloseTo(35, 6);
    expect(first.getEntity("agent")?.y).toBeCloseTo(5, 6);
    expect(first.diagnostics).toEqual([]);
  });

  test("supports action-gated agents", () => {
    const authored = project();
    authored.scenes[0].entities[0].components[0].values.action = "go";
    authored.settings.input.push({ action: "go", bindings: ["Space"] });
    const world = createPlayableWorld(authored, { fixedStepSeconds: 0.1, behaviors: createNavigationBehaviorRegistry2D(authored) });
    world.step();
    expect(world.getEntity("agent")?.x).toBe(5);
    world.step({ actions: ["go"] });
    expect(world.getEntity("agent")?.y).toBeGreaterThan(5);
  });

  test("reports blocked targets and malformed configuration with locations", () => {
    const blocked = project();
    blocked.scenes[0].entities[0].components[0].values.targetX = 15;
    blocked.scenes[0].entities[0].components[0].values.targetY = 5;
    expect(auditNavigationProject2D(blocked)).toMatchObject([{ code: "navigation-unreachable", sceneId: "main", entityId: "agent", componentId: "navigate" }]);

    const malformed = project();
    malformed.scenes[0].entities[0].components[0].values.speed = -1;
    expect(auditNavigationProject2D(malformed)).toMatchObject([{ code: "invalid-navigation" }]);
    expect(() => createNavigationBehaviorRegistry2D(malformed)).toThrow("speed must be greater");
  });

  test("surfaces search and path bounds explicitly", () => {
    const long = project();
    expect(auditNavigationProject2D(long, { maxPathCells: 2 })).toMatchObject([{ code: "navigation-path-too-long" }]);
    expect(auditNavigationProject2D(long, { maxVisited: 1 })).toMatchObject([{ code: "navigation-budget-exceeded" }]);
  });

  test("bounds grid and agent counts before allocating unbounded state", () => {
    const authored = project();
    expect(() => auditNavigationProject2D(authored, { maxGridCells: 4 })).toThrow("grid has 12 cells");
    authored.scenes[0].entities.push({ ...structuredClone(authored.scenes[0].entities[0]), id: "agent-two" });
    expect(auditNavigationProject2D(authored, { maxAgents: 1 })).toMatchObject([{ code: "invalid-navigation", entityId: "agent-two" }]);
  });
});
