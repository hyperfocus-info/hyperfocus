import { expect, test } from "bun:test";
import { createStaticTerrainHit3D, raycastStaticTerrainDown3D, sampleStaticTerrainHeight3D } from "./static-raycast.ts";

test("vertical terrain raycasts return the surface and normal of a tilted box", () => {
  const angle = Math.PI / 12;
  const bodies = [{
    id: "slope",
    type: "static" as const,
    shape: { kind: "box" as const, halfX: 2, halfY: .1, halfZ: 1 },
    y: .5,
    rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
    collisionLayer: 4,
  }];
  const out = createStaticTerrainHit3D();
  const hit = raycastStaticTerrainDown3D(bodies, 1, 4, 0, 10, 4, out);
  const expectedY = .5 + Math.tan(angle) + .1 / Math.cos(angle);

  expect(hit).toBe(out);
  expect(hit?.body?.id).toBe("slope");
  expect(hit?.y).toBeCloseTo(expectedY, 6);
  expect(hit?.normalX).toBeCloseTo(-Math.sin(angle), 6);
  expect(hit?.normalY).toBeCloseTo(Math.cos(angle), 6);
  expect(hit?.normalZ).toBeCloseTo(0, 6);
  expect(sampleStaticTerrainHeight3D(bodies, 1, 0)).toBeCloseTo(expectedY, 6);
});

test("vertical terrain raycasts respect gaps, masks, and the highest surface", () => {
  const bodies = [
    { id: "low", type: "static" as const, shape: { kind: "box" as const, halfX: 1, halfY: .1, halfZ: 1 }, y: 0, collisionLayer: 1 },
    { id: "high", type: "static" as const, shape: { kind: "box" as const, halfX: .5, halfY: .1, halfZ: 1 }, y: .5, collisionLayer: 2 },
  ];
  const out = createStaticTerrainHit3D();

  expect(raycastStaticTerrainDown3D(bodies, 0, 2, 0, 5, 1, out)?.body?.id).toBe("low");
  expect(raycastStaticTerrainDown3D(bodies, 0, 2, 0, 5, 2, out)?.body?.id).toBe("high");
  expect(raycastStaticTerrainDown3D(bodies, 3, 2, 0, 5, undefined, out)).toBeNull();
  expect(sampleStaticTerrainHeight3D(bodies, 0, 0)).toBeCloseTo(.6, 6);
});
