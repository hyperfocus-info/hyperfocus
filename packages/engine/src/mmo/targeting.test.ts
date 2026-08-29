import { expect, test } from "bun:test";
import { coneMmoTargetHits, firstMmoLineTargetHit, findMmoEntityNearAim, findNearestMmoEntity, lineMmoTargetHits, mmoTargetInCone, pointSegmentDistance, radiusMmoTargetHits } from "./targeting.ts";

test("targeting finds nearest with deterministic priority and id tie breaks", () => {
  const entities = [
    { id: "b", x: 3, y: 0, priority: 1 },
    { id: "a", x: 3, y: 0, priority: 2 },
    { id: "c", x: 4, y: 4, priority: 10 }
  ];

  expect(findNearestMmoEntity({ x: 0, y: 0 }, entities)?.id).toBe("a");
  expect(findNearestMmoEntity({ x: 0, y: 0 }, entities, { filter: (entity) => entity.id === "c" })?.id).toBe("c");
});

test("aim targeting prefers aim alignment then priority", () => {
  const entities = [
    { id: "near-off", x: 1, y: 1, priority: 99 },
    { id: "line-low", x: 4, y: 0, priority: 1 },
    { id: "line-high", x: 6, y: 0, priority: 5 }
  ];

  expect(pointSegmentDistance({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(1);
  expect(findMmoEntityNearAim({ x: 0, y: 0 }, { x: 10, y: 0 }, entities, { maxAimDistance: 2 })?.id).toBe("line-high");
});

test("shape targeting returns sorted line cone and radius hits", () => {
  const entities = [
    { id: "far", x: 8, y: 0, radius: 1 },
    { id: "near", x: 4, y: 0.5, radius: 1 },
    { id: "behind", x: -2, y: 0, radius: 1 },
    { id: "side", x: 3, y: 4, radius: 1 }
  ];

  expect(lineMmoTargetHits({ x: 0, y: 0 }, { x: 1, y: 0 }, entities, { range: 10, width: 0.6 }).map((hit) => hit.target.id)).toEqual(["near", "far"]);
  expect(firstMmoLineTargetHit({ x: 0, y: 0 }, { x: 1, y: 0 }, entities, { range: 10, width: 0.6 })?.target.id).toBe("near");
  expect(mmoTargetInCone({ x: 0, y: 0 }, { x: 1, y: 0 }, entities[0], { range: 10, halfAngleRad: Math.PI / 8 })).toBe(true);
  expect(coneMmoTargetHits({ x: 0, y: 0 }, { x: 1, y: 0 }, entities, { range: 10, halfAngleRad: Math.PI / 5 }).map((hit) => hit.target.id)).toEqual(["near", "far"]);
  expect(radiusMmoTargetHits({ x: 0, y: 0 }, entities, { radius: 3.2, includeRadius: true }).map((hit) => hit.target.id)).toEqual(["behind", "near"]);
});

test("first line target matches sorted line ordering without requiring input order", () => {
  const entities = [
    { id: "low", x: 4, y: 0, priority: 1 },
    { id: "winner", x: 4, y: 0, priority: 3 },
    { id: "later", x: 5, y: 0, priority: 99 },
    { id: "alpha", x: 4, y: 0, priority: 3 }
  ];
  const options = { range: 8, width: 0.1 };

  expect(lineMmoTargetHits({ x: 0, y: 0 }, { x: 1, y: 0 }, entities, options).map((hit) => hit.target.id)).toEqual(["alpha", "winner", "low", "later"]);
  expect(firstMmoLineTargetHit({ x: 0, y: 0 }, { x: 1, y: 0 }, entities, options)?.target.id).toBe("alpha");
});
