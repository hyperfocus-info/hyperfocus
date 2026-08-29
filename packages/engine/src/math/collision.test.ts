import { expect, test } from "bun:test";
import {
  findNearestRadiusCandidate,
  forEachRadiusCandidate,
  pointInRect,
  queryRadiusCandidates,
  rayIntersectMap,
  testOverlapCircle,
  testOverlapRect,
  vecAngle,
  vecDistance,
  vecNormalize
} from "./collision.ts";

test("raw rectangle overlap uses primitive coordinates", () => {
  expect(testOverlapRect(0, 0, 10, 10, 9, 9, 4, 4)).toBe(true);
  expect(testOverlapRect(0, 0, 10, 10, 10, 0, 4, 4)).toBe(false);
});

test("raw circle and point collision helpers avoid object inputs", () => {
  expect(testOverlapCircle(0, 0, 5, 9, 0, 4)).toBe(true);
  expect(testOverlapCircle(0, 0, 5, 10, 0, 4)).toBe(false);
  expect(pointInRect(4, 5, 2, 3, 4, 4)).toBe(true);
  expect(pointInRect(7, 5, 2, 3, 4, 4)).toBe(false);
});

test("vector helpers return stable raw-number results", () => {
  expect(vecDistance(0, 0, 3, 4)).toBe(5);
  expect(vecAngle(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);

  const out = { x: 12, y: 12 };
  expect(vecNormalize(3, 4, out)).toBe(out);
  expect(out).toEqual({ x: 0.6, y: 0.8 });
  expect(vecNormalize(0, 0, out)).toEqual({ x: 0, y: 0 });
});

test("radius candidate query filters, sorts, and reuses output arrays", () => {
  const candidates = [
    { id: "far", x: 7, z: 0, radius: 0, priority: 10 },
    { id: "wide", x: 6, z: 0, radius: 2, priority: 1 },
    { id: "near", x: 3, z: 4, radius: 0, priority: 0 },
    { id: "priority", x: 5, z: 0, radius: 0, priority: 5 }
  ];
  const out = [{ target: candidates[0], distance: 99, distanceSq: 99, effectiveDistance: 99 }];

  const hits = queryRadiusCandidates({ x: 0, z: 0 }, candidates, {
    radius: 5,
    includeCandidateRadius: true,
    sort: true,
    out
  });

  expect(hits).toBe(out);
  expect(hits.map((hit) => hit.target.id)).toEqual(["wide", "priority", "near"]);
  expect(hits[0].distance).toBe(6);
  expect(hits[0].effectiveDistance).toBe(4);
  expect(hits[1].distanceSq).toBe(25);
});

test("radius candidate query can preserve iteration order and custom coordinates", () => {
  const candidates = [
    { id: "first", px: 4, py: 0, r: 1 },
    { id: "second", px: 2, py: 0, r: 1 }
  ];

  const hits = queryRadiusCandidates({ x: 0, y: 0 }, candidates, {
    radius: 3,
    includeCandidateRadius: true,
    getX: (entity) => entity.px,
    getY: (entity) => entity.py,
    getRadius: (entity) => entity.r,
    sort: false
  });

  expect(hits.map((hit) => hit.target.id)).toEqual(["first", "second"]);
});

test("radius candidate query accepts custom distance functions for wrapped worlds", () => {
  const candidates = [
    { id: "across-edge", x: 98, z: 0 },
    { id: "far", x: 50, z: 0 }
  ];

  const hits = queryRadiusCandidates({ x: 2, z: 0 }, candidates, {
    radius: 5,
    getDistanceSq: (entity, center) => {
      const raw = Math.abs(entity.x - center.x);
      const wrapped = Math.min(raw, 100 - raw);
      return wrapped * wrapped;
    }
  });

  expect(hits.map((hit) => hit.target.id)).toEqual(["across-edge"]);
  expect(hits[0].distance).toBe(4);
});

test("radius candidate callback visits hits without allocating hit records", () => {
  const candidates = [
    { id: "a", x: 1, y: 0, radius: 0 },
    { id: "b", x: 3, y: 0, radius: 0 },
    { id: "c", x: 5, y: 0, radius: 0 }
  ];
  const visited: string[] = [];

  const count = forEachRadiusCandidate({ x: 0, y: 0 }, candidates, { radius: 4, max: 2 }, (entity, distanceSq) => {
    visited.push(`${entity.id}:${distanceSq}`);
  });

  expect(count).toBe(2);
  expect(visited).toEqual(["a:1", "b:9"]);
});

test("radius candidate max zero returns and visits no results", () => {
  const candidates = [{ id: "inside", x: 0, y: 0 }];
  let visits = 0;

  expect(queryRadiusCandidates({ x: 0, y: 0 }, candidates, { radius: 10, max: 0 })).toEqual([]);
  expect(forEachRadiusCandidate({ x: 0, y: 0 }, candidates, { radius: 10, max: 0 }, () => {
    visits += 1;
  })).toBe(0);
  expect(visits).toBe(0);
});

test("radius candidate helpers reject invalid query numbers and skip invalid hits", () => {
  const candidates = [
    { id: "valid", x: 1, y: 0, radius: 0 },
    { id: "bad-x", x: Number.NaN, y: 0, radius: 0 },
    { id: "bad-radius", x: 0, y: 0, radius: Number.POSITIVE_INFINITY }
  ];

  expect(queryRadiusCandidates({ x: 0, y: 0 }, candidates, { radius: Number.NaN })).toEqual([]);
  expect(queryRadiusCandidates({ x: 0, y: 0 }, candidates, {
    radius: 2,
    includeCandidateRadius: true
  }).map((hit) => hit.target.id)).toEqual(["valid"]);
  expect(findNearestRadiusCandidate({ x: Number.POSITIVE_INFINITY, y: 0 }, candidates, { radius: 2 })).toBeUndefined();

  const visited: string[] = [];
  const count = forEachRadiusCandidate({ x: 0, y: 0 }, candidates, {
    radius: 2,
    getDistanceSq: (candidate) => candidate.id === "valid" ? 1 : Number.NaN
  }, (candidate) => {
    visited.push(candidate.id);
  });
  expect(count).toBe(1);
  expect(visited).toEqual(["valid"]);
});

test("nearest radius candidate uses priority and id as stable tie breakers", () => {
  const candidates = [
    { id: "b", x: 3, y: 4, priority: 1 },
    { id: "a", x: -3, y: -4, priority: 1 },
    { id: "c", x: 0, y: 5, priority: 2 }
  ];

  expect(findNearestRadiusCandidate({ x: 0, y: 0 }, candidates, { radius: 5 })?.target.id).toBe("c");
  expect(findNearestRadiusCandidate({ x: 0, y: 0 }, candidates.slice(0, 2), { radius: 5 })?.target.id).toBe("a");
});

test("ray helper tests line of sight against box maps", () => {
  expect(rayIntersectMap(0, 0, 10, 0, [[4, -1, 2, 2]])).toBe(true);
  expect(rayIntersectMap(0, 0, 10, 0, [{ x: 4, y: 3, w: 2, h: 2 }])).toBe(false);
});
