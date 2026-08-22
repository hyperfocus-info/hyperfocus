import { expect, test } from "bun:test";
import {
  createBarIndicator,
  createBeamPreviewIndicator,
  createConePreviewIndicator,
  createGroundArcIndicator,
  createGroundRingIndicator,
  createProjectileTrailIndicator,
  createRadialIndicator,
  createStatusBadgeIndicator,
  type ThreeIndicatorGeometry,
  type ThreeIndicatorMaterial,
  type ThreeIndicatorModule,
  type ThreeIndicatorObject,
  type ThreeIndicatorVec3Object
} from "./visual-indicators.ts";
import { createGroundRingIndicator as exportedRingIndicator } from "./index.ts";
import { createGroundArcIndicator as exportedArcIndicator } from "./index.ts";

class FakeVector3 implements ThreeIndicatorVec3Object {
  constructor(public x = 0, public y = 0, public z = 0) {}

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

class FakeScale extends FakeVector3 {
  setScalar(value: number) {
    this.set(value, value, value);
  }
}

class FakeObject implements ThreeIndicatorObject {
  position = new FakeVector3();
  rotation = { x: 0, y: 0, z: 0 };
  scale = new FakeScale();
  frustumCulled = true;
  children: ThreeIndicatorObject[] = [];
  name?: string;
  renderOrder?: number;

  add(...objects: ThreeIndicatorObject[]) {
    this.children.push(...objects);
  }
}

class FakeGeometry implements ThreeIndicatorGeometry {
  constructor(public kind: string, public args: unknown[]) {}
}

class FakeBufferGeometry extends FakeGeometry {
  points: ThreeIndicatorVec3Object[] = [];

  constructor() {
    super("buffer", []);
  }

  setFromPoints(points: ThreeIndicatorVec3Object[]) {
    this.points = points;
    return this;
  }
}

class FakeMaterial implements ThreeIndicatorMaterial {
  constructor(public options: Record<string, unknown> = {}) {}
}

class FakeMesh extends FakeObject {
  constructor(public geometry: ThreeIndicatorGeometry, public material: ThreeIndicatorMaterial) {
    super();
  }
}

class FakeLine extends FakeMesh {}

function createFakeThree() {
  return {
    Group: FakeObject,
    Mesh: FakeMesh,
    Line: FakeLine,
    RingGeometry: class extends FakeGeometry {
      constructor(...args: unknown[]) {
        super("ring", args);
      }
    },
    CircleGeometry: class extends FakeGeometry {
      constructor(...args: unknown[]) {
        super("circle", args);
      }
    },
    PlaneGeometry: class extends FakeGeometry {
      constructor(...args: unknown[]) {
        super("plane", args);
      }
    },
    BufferGeometry: FakeBufferGeometry,
    Vector3: FakeVector3,
    MeshBasicMaterial: FakeMaterial,
    LineBasicMaterial: FakeMaterial,
    DoubleSide: "double",
    AdditiveBlending: "additive",
    NormalBlending: "normal",
  } satisfies ThreeIndicatorModule;
}

test("ground ring and arc factories build flat arena rings", () => {
  const THREE = createFakeThree();
  const ring = createGroundRingIndicator(THREE, { radius: 4, thickness: 0.5, color: "#44ccff", y: 0.03, name: "range" }) as FakeMesh;
  const arc = createGroundArcIndicator(THREE, { radius: 5, thickness: 1, startAngle: 0.25, angle: Math.PI, segments: 12 }) as FakeMesh;

  expect((ring.geometry as FakeGeometry).args).toEqual([3.75, 4.25, 64, 1, 0, Math.PI * 2]);
  expect(ring.position.y).toBe(0.03);
  expect(ring.rotation.x).toBeCloseTo(-Math.PI / 2);
  expect(ring.name).toBe("range");
  expect(ring.frustumCulled).toBe(false);
  expect((ring.material as FakeMaterial).options).toMatchObject({ color: "#44ccff", side: "double", depthWrite: false });

  expect((arc.geometry as FakeGeometry).args).toEqual([4.5, 5.5, 12, 1, 0.25, Math.PI]);
});

test("cone and beam previews orient along heading on the ground plane", () => {
  const THREE = createFakeThree();
  const cone = createConePreviewIndicator(THREE, { range: 6, angle: Math.PI / 2, heading: 0.75, position: [1, 0.1, 2] }) as FakeMesh;
  const beam = createBeamPreviewIndicator(THREE, { length: 8, width: 0.4, heading: Math.PI / 2, origin: [2, 0, 3] }) as FakeMesh;

  expect((cone.geometry as FakeGeometry).args).toEqual([6, 48, -Math.PI / 4, Math.PI / 2]);
  expect(cone.position).toMatchObject({ x: 1, y: 0.1, z: 2 });
  expect(cone.rotation.z).toBe(0.75);
  expect((cone.material as FakeMaterial).options).toMatchObject({ transparent: true, opacity: 0.28 });

  expect((beam.geometry as FakeGeometry).args).toEqual([8, 0.4]);
  expect(beam.position.x).toBeCloseTo(2);
  expect(beam.position.z).toBeCloseTo(7);
  expect(beam.rotation.x).toBeCloseTo(-Math.PI / 2);
  expect(beam.rotation.z).toBeCloseTo(Math.PI / 2);
});

test("trail, bars, radials, and badges compose generic Three primitives", () => {
  const THREE = createFakeThree();
  const trail = createProjectileTrailIndicator(THREE, { points: [[0, 0, 0], [1, 0.5, 2]], additive: true, opacity: 0.7 }) as FakeLine;
  const bar = createBarIndicator(THREE, { width: 2, height: 0.2, value: 25, max: 100, position: [0, 2, 0] }) as FakeObject;
  const radial = createRadialIndicator(THREE, { radius: 3, value: 0.5, color: "red" }) as FakeMesh;
  const badge = createStatusBadgeIndicator(THREE, { radius: 0.5, outline: { color: "white", thickness: 0.1 } }) as FakeObject;

  expect((trail.geometry as FakeBufferGeometry).points.map((point) => [point.x, point.y, point.z])).toEqual([[0, 0, 0], [1, 0.5, 2]]);
  expect((trail.material as FakeMaterial).options).toMatchObject({ blending: "additive", opacity: 0.7 });

  expect(bar.children).toHaveLength(2);
  expect(bar.position.y).toBe(2);
  const fill = bar.children[1] as FakeMesh;
  expect((fill.geometry as FakeGeometry).args).toEqual([0.5, 0.2]);
  expect(fill.position.x).toBeCloseTo(-0.75);

  expect((radial.geometry as FakeGeometry).args[5]).toBeCloseTo(Math.PI);
  expect(radial.rotation.x).toBeCloseTo(-Math.PI / 2);

  expect(badge.children).toHaveLength(2);
  expect((badge.children[0] as FakeMesh).geometry).toMatchObject({ kind: "circle" });
  expect((badge.children[1] as FakeMesh).geometry).toMatchObject({ kind: "ring" });
});

test("visual indicator factories are exported from render and root entrypoints", () => {
  const THREE = createFakeThree();

  expect((exportedRingIndicator(THREE, { radius: 1 }) as FakeMesh).geometry).toMatchObject({ kind: "ring" });
  expect((exportedArcIndicator(THREE, { radius: 1, angle: 1 }) as FakeMesh).geometry).toMatchObject({ kind: "ring" });
});
