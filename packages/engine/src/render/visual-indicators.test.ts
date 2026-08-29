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
  type ThreeIndicatorBufferGeometry,
  type ThreeIndicatorGeometry,
  type ThreeIndicatorMaterial,
  type ThreeIndicatorModule,
  type ThreeIndicatorObject,
  type ThreeIndicatorVec3Object
} from "./visual-indicators.ts";
import {
  createGroundArcIndicator as exportedArcIndicator,
  createGroundRingIndicator as exportedRingIndicator
} from "@hyperfocus/engine/render";

type FakeVector3 = ReturnType<typeof createFakeVector3>;
type FakeObject = ThreeIndicatorObject & { position: FakeVector3; children: ThreeIndicatorObject[] };
type FakeGeometry = ThreeIndicatorGeometry & { kind: string; args: unknown[] };
type FakeBufferGeometry = FakeGeometry & ThreeIndicatorBufferGeometry & { points: ThreeIndicatorVec3Object[] };
type FakeMaterial = ThreeIndicatorMaterial & { options: Record<string, unknown> };
type FakeMesh = FakeObject & { geometry: ThreeIndicatorGeometry; material: ThreeIndicatorMaterial };

const fakeObjects = new WeakSet<object>();
const fakeGeometries = new WeakSet<object>();
const fakeBufferGeometries = new WeakSet<object>();
const fakeMaterials = new WeakSet<object>();
const fakeMeshes = new WeakSet<object>();

function createFakeVector3(x = 0, y = 0, z = 0) {
  const vector = { x, y, z, set(nextX: number, nextY: number, nextZ: number) {
    vector.x = nextX; vector.y = nextY; vector.z = nextZ;
  } };
  return vector;
}

function createFakeScale() {
  const scale = Object.assign(createFakeVector3(), { setScalar(value: number) { scale.set(value, value, value); } });
  return scale;
}

function createFakeObject(): FakeObject {
  const children: ThreeIndicatorObject[] = [];
  const object = {
    position: createFakeVector3(), rotation: { x: 0, y: 0, z: 0 }, scale: createFakeScale(),
    frustumCulled: true, children, name: undefined, renderOrder: undefined,
    add(...objects: ThreeIndicatorObject[]) { object.children.push(...objects); },
  };
  fakeObjects.add(object);
  return object;
}

function createFakeGeometry(kind: string, args: unknown[]): FakeGeometry {
  const geometry = { kind, args };
  fakeGeometries.add(geometry);
  return geometry;
}

function createFakeBufferGeometry(): FakeBufferGeometry {
  const points: ThreeIndicatorVec3Object[] = [];
  const geometry = Object.assign(createFakeGeometry("buffer", []), {
    points,
    setFromPoints(points: ThreeIndicatorVec3Object[]) { geometry.points = points; return geometry; },
  });
  fakeBufferGeometries.add(geometry);
  return geometry;
}

function createFakeMaterial(options: Record<string, unknown> = {}): FakeMaterial {
  const material = { options };
  fakeMaterials.add(material);
  return material;
}

function createFakeMesh(geometry: ThreeIndicatorGeometry, material: ThreeIndicatorMaterial): FakeMesh {
  const mesh = Object.assign(createFakeObject(), { geometry, material });
  fakeMeshes.add(mesh);
  return mesh;
}

function createTestConstructor<T extends object>(factory: (args: readonly unknown[]) => T): new (...args: unknown[]) => T;
function createTestConstructor<T extends object>(factory: (args: readonly unknown[]) => T) {
  return new Proxy(Object, { construct: (_target, args) => factory(args) });
}

function requireObject(value: unknown): object {
  if (typeof value !== "object" || value === null) throw new TypeError("Expected an indicator object argument.");
  return value;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function requireFakeObject(value: unknown): FakeObject {
  if (!isRegistered<FakeObject>(value, fakeObjects)) throw new TypeError("Expected a registered indicator object.");
  return value;
}

function requireFakeGeometry(value: unknown): FakeGeometry {
  if (!isRegistered<FakeGeometry>(value, fakeGeometries)) throw new TypeError("Expected a registered indicator geometry.");
  return value;
}

function requireFakeBufferGeometry(value: unknown): FakeBufferGeometry {
  if (!isRegistered<FakeBufferGeometry>(value, fakeBufferGeometries)) throw new TypeError("Expected a registered indicator buffer geometry.");
  return value;
}

function requireFakeMaterial(value: unknown): FakeMaterial {
  if (!isRegistered<FakeMaterial>(value, fakeMaterials)) throw new TypeError("Expected a registered indicator material.");
  return value;
}

function requireFakeMesh(value: unknown): FakeMesh {
  if (!isRegistered<FakeMesh>(value, fakeMeshes)) throw new TypeError("Expected a registered indicator mesh.");
  return value;
}

function isRegistered<T extends object>(value: unknown, registry: WeakSet<object>): value is T {
  return typeof value === "object" && value !== null && registry.has(value);
}

function createFakeThree(): ThreeIndicatorModule {
  return {
    Group: createTestConstructor(() => createFakeObject()),
    Mesh: createTestConstructor((args) => createFakeMesh(requireObject(args[0]), requireObject(args[1]))),
    Line: createTestConstructor((args) => createFakeMesh(requireObject(args[0]), requireObject(args[1]))),
    RingGeometry: createTestConstructor((args) => createFakeGeometry("ring", [...args])),
    CircleGeometry: createTestConstructor((args) => createFakeGeometry("circle", [...args])),
    PlaneGeometry: createTestConstructor((args) => createFakeGeometry("plane", [...args])),
    BufferGeometry: createTestConstructor(() => createFakeBufferGeometry()),
    Vector3: createTestConstructor((args) => createFakeVector3(readNumber(args[0]), readNumber(args[1]), readNumber(args[2]))),
    MeshBasicMaterial: createTestConstructor((args) => createFakeMaterial(readRecord(args[0]))),
    LineBasicMaterial: createTestConstructor((args) => createFakeMaterial(readRecord(args[0]))),
    DoubleSide: "double",
    AdditiveBlending: "additive",
    NormalBlending: "normal",
  };
}

test("ground ring and arc factories build flat arena rings", () => {
  const THREE = createFakeThree();
  const ring = requireFakeMesh(createGroundRingIndicator(THREE, { radius: 4, thickness: 0.5, color: "#44ccff", y: 0.03, name: "range" }));
  const arc = requireFakeMesh(createGroundArcIndicator(THREE, { radius: 5, thickness: 1, startAngle: 0.25, angle: Math.PI, segments: 12 }));

  expect(requireFakeGeometry(ring.geometry).args).toEqual([3.75, 4.25, 64, 1, 0, Math.PI * 2]);
  expect(ring.position.y).toBe(0.03);
  expect(ring.rotation.x).toBeCloseTo(-Math.PI / 2);
  expect(ring.name).toBe("range");
  expect(ring.frustumCulled).toBe(false);
  expect(requireFakeMaterial(ring.material).options).toMatchObject({ color: "#44ccff", side: "double", depthWrite: false });

  expect(requireFakeGeometry(arc.geometry).args).toEqual([4.5, 5.5, 12, 1, 0.25, Math.PI]);
});

test("cone and beam previews orient along heading on the ground plane", () => {
  const THREE = createFakeThree();
  const cone = requireFakeMesh(createConePreviewIndicator(THREE, { range: 6, angle: Math.PI / 2, heading: 0.75, position: [1, 0.1, 2] }));
  const beam = requireFakeMesh(createBeamPreviewIndicator(THREE, { length: 8, width: 0.4, heading: Math.PI / 2, origin: [2, 0, 3] }));

  expect(requireFakeGeometry(cone.geometry).args).toEqual([6, 48, -Math.PI / 4, Math.PI / 2]);
  expect(cone.position).toMatchObject({ x: 1, y: 0.1, z: 2 });
  expect(cone.rotation.z).toBe(0.75);
  expect(requireFakeMaterial(cone.material).options).toMatchObject({ transparent: true, opacity: 0.28 });

  expect(requireFakeGeometry(beam.geometry).args).toEqual([8, 0.4]);
  expect(beam.position.x).toBeCloseTo(2);
  expect(beam.position.z).toBeCloseTo(7);
  expect(beam.rotation.x).toBeCloseTo(-Math.PI / 2);
  expect(beam.rotation.z).toBeCloseTo(Math.PI / 2);
});

test("trail, bars, radials, and badges compose generic Three primitives", () => {
  const THREE = createFakeThree();
  const trail = requireFakeMesh(createProjectileTrailIndicator(THREE, { points: [[0, 0, 0], [1, 0.5, 2]], additive: true, opacity: 0.7 }));
  const bar = requireFakeObject(createBarIndicator(THREE, { width: 2, height: 0.2, value: 25, max: 100, position: [0, 2, 0] }));
  const radial = requireFakeMesh(createRadialIndicator(THREE, { radius: 3, value: 0.5, color: "red" }));
  const badge = requireFakeObject(createStatusBadgeIndicator(THREE, { radius: 0.5, outline: { color: "white", thickness: 0.1 } }));

  expect(requireFakeBufferGeometry(trail.geometry).points.map((point) => [point.x, point.y, point.z])).toEqual([[0, 0, 0], [1, 0.5, 2]]);
  expect(requireFakeMaterial(trail.material).options).toMatchObject({ blending: "additive", opacity: 0.7 });

  expect(bar.children).toHaveLength(2);
  expect(bar.position.y).toBe(2);
  const fill = requireFakeMesh(bar.children[1]);
  expect(requireFakeGeometry(fill.geometry).args).toEqual([0.5, 0.2]);
  expect(fill.position.x).toBeCloseTo(-0.75);

  expect(requireFakeGeometry(radial.geometry).args[5]).toBeCloseTo(Math.PI);
  expect(radial.rotation.x).toBeCloseTo(-Math.PI / 2);

  expect(badge.children).toHaveLength(2);
  expect(requireFakeMesh(badge.children[0]).geometry).toMatchObject({ kind: "circle" });
  expect(requireFakeMesh(badge.children[1]).geometry).toMatchObject({ kind: "ring" });
});

test("visual indicator factories are exported from render and root entrypoints", () => {
  const THREE = createFakeThree();

  expect(requireFakeMesh(exportedRingIndicator(THREE, { radius: 1 })).geometry).toMatchObject({ kind: "ring" });
  expect(requireFakeMesh(exportedArcIndicator(THREE, { radius: 1, angle: 1 })).geometry).toMatchObject({ kind: "ring" });
});
