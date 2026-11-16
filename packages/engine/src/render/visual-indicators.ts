import { clamp01Or as clamp01 } from "@hyperfocus/utilities/math";
export type ThreeIndicatorColor = string | number;
export type ThreeIndicatorVec3 = readonly [number, number, number];
export type ThreeIndicatorVec2 = readonly [number, number];

export type ThreeIndicatorObject = {
  name?: string;
  position: { set(x: number, y: number, z: number): unknown };
  rotation: { x: number; y: number; z: number };
  scale: { set(x: number, y: number, z: number): unknown; setScalar?(value: number): unknown };
  visible?: boolean;
  renderOrder?: number;
  frustumCulled?: boolean;
  add?(...objects: ThreeIndicatorObject[]): unknown;
};

export type ThreeIndicatorGeometry = object & { dispose?(): unknown };
export type ThreeIndicatorMaterial = object & {
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  depthTest?: boolean;
  toneMapped?: boolean;
  side?: unknown;
  dispose?(): unknown;
};

export type ThreeIndicatorModule = {
  Group?: new () => ThreeIndicatorObject;
  Mesh: new (geometry: ThreeIndicatorGeometry, material: ThreeIndicatorMaterial) => ThreeIndicatorObject;
  Line?: new (geometry: ThreeIndicatorGeometry, material: ThreeIndicatorMaterial) => ThreeIndicatorObject;
  RingGeometry?: new (
    innerRadius?: number,
    outerRadius?: number,
    thetaSegments?: number,
    phiSegments?: number,
    thetaStart?: number,
    thetaLength?: number,
  ) => ThreeIndicatorGeometry;
  CircleGeometry?: new (radius?: number, segments?: number, thetaStart?: number, thetaLength?: number) => ThreeIndicatorGeometry;
  PlaneGeometry?: new (width?: number, height?: number) => ThreeIndicatorGeometry;
  SphereGeometry?: new (radius?: number, widthSegments?: number, heightSegments?: number) => ThreeIndicatorGeometry;
  BufferGeometry?: new () => ThreeIndicatorBufferGeometry;
  Vector3?: new (x?: number, y?: number, z?: number) => ThreeIndicatorVec3Object;
  MeshBasicMaterial: new (options?: Record<string, unknown>) => ThreeIndicatorMaterial;
  LineBasicMaterial?: new (options?: Record<string, unknown>) => ThreeIndicatorMaterial;
  DoubleSide?: unknown;
  AdditiveBlending?: unknown;
  NormalBlending?: unknown;
};

export type ThreeIndicatorVec3Object = { x: number; y: number; z: number; set?(x: number, y: number, z: number): unknown };
export type ThreeIndicatorBufferGeometry = ThreeIndicatorGeometry & {
  setFromPoints?(points: ThreeIndicatorVec3Object[]): ThreeIndicatorBufferGeometry;
};

export type ThreeIndicatorMaterialOptions = {
  color?: ThreeIndicatorColor;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  depthTest?: boolean;
  additive?: boolean;
  doubleSided?: boolean;
  toneMapped?: boolean;
};

export type ThreeGroundRingIndicatorOptions = ThreeIndicatorMaterialOptions & {
  radius: number;
  thickness?: number;
  segments?: number;
  position?: ThreeIndicatorVec3;
  y?: number;
  name?: string;
  renderOrder?: number;
};

export type ThreeGroundArcIndicatorOptions = ThreeGroundRingIndicatorOptions & {
  startAngle?: number;
  angle: number;
};

export type ThreeConePreviewIndicatorOptions = ThreeIndicatorMaterialOptions & {
  range: number;
  angle: number;
  heading?: number;
  segments?: number;
  position?: ThreeIndicatorVec3;
  y?: number;
  name?: string;
  renderOrder?: number;
};

export type ThreeBeamPreviewIndicatorOptions = ThreeIndicatorMaterialOptions & {
  length: number;
  width?: number;
  heading?: number;
  origin?: ThreeIndicatorVec3;
  y?: number;
  name?: string;
  renderOrder?: number;
};

export type ThreeProjectileTrailIndicatorOptions = ThreeIndicatorMaterialOptions & {
  points: readonly ThreeIndicatorVec3[];
  name?: string;
  renderOrder?: number;
};

export type ThreeBarIndicatorOptions = {
  width: number;
  height: number;
  value: number;
  max?: number;
  background?: ThreeIndicatorMaterialOptions;
  fill?: ThreeIndicatorMaterialOptions;
  position?: ThreeIndicatorVec3;
  name?: string;
  renderOrder?: number;
};

export type ThreeRadialIndicatorOptions = ThreeIndicatorMaterialOptions & {
  radius: number;
  value: number;
  max?: number;
  thickness?: number;
  segments?: number;
  startAngle?: number;
  position?: ThreeIndicatorVec3;
  name?: string;
  renderOrder?: number;
};

export type ThreeStatusBadgeIndicatorOptions = {
  radius?: number;
  segments?: number;
  background?: ThreeIndicatorMaterialOptions;
  outline?: ThreeIndicatorMaterialOptions & { thickness?: number };
  position?: ThreeIndicatorVec3;
  name?: string;
  renderOrder?: number;
};

export function createThreeIndicatorMaterial(
  THREE: Pick<ThreeIndicatorModule, "MeshBasicMaterial" | "DoubleSide" | "AdditiveBlending" | "NormalBlending">,
  options: ThreeIndicatorMaterialOptions = {},
): ThreeIndicatorMaterial {
  const opacity = clamp01(options.opacity ?? 1);
  return new THREE.MeshBasicMaterial({
    color: options.color ?? 0xffffff,
    transparent: options.transparent ?? opacity < 1,
    opacity,
    depthWrite: options.depthWrite ?? false,
    depthTest: options.depthTest ?? true,
    toneMapped: options.toneMapped ?? false,
    side: options.doubleSided === false ? undefined : THREE.DoubleSide,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function createGroundRingIndicator(
  THREE: ThreeIndicatorModule,
  options: ThreeGroundRingIndicatorOptions,
): ThreeIndicatorObject {
  const radius = positiveFinite(options.radius, "ground ring radius");
  const thickness = positiveFinite(options.thickness ?? radius * 0.08, "ground ring thickness");
  const RingGeometry = requireCtor(THREE.RingGeometry, "RingGeometry");
  const geometry = new RingGeometry(
    Math.max(0, radius - thickness * 0.5),
    radius + thickness * 0.5,
    integerAtLeast(options.segments ?? 64, 3, "ground ring segments"),
    1,
    0,
    Math.PI * 2,
  );
  const mesh = new THREE.Mesh(geometry, createThreeIndicatorMaterial(THREE, options));
  applyGroundObject(mesh, options.position, options.y);
  applyCommonObjectOptions(mesh, options);
  return mesh;
}

export function createGroundArcIndicator(
  THREE: ThreeIndicatorModule,
  options: ThreeGroundArcIndicatorOptions,
): ThreeIndicatorObject {
  const radius = positiveFinite(options.radius, "ground arc radius");
  const thickness = positiveFinite(options.thickness ?? radius * 0.08, "ground arc thickness");
  const RingGeometry = requireCtor(THREE.RingGeometry, "RingGeometry");
  const geometry = new RingGeometry(
    Math.max(0, radius - thickness * 0.5),
    radius + thickness * 0.5,
    integerAtLeast(options.segments ?? 48, 3, "ground arc segments"),
    1,
    options.startAngle ?? 0,
    positiveFinite(options.angle, "ground arc angle"),
  );
  const mesh = new THREE.Mesh(geometry, createThreeIndicatorMaterial(THREE, options));
  applyGroundObject(mesh, options.position, options.y);
  applyCommonObjectOptions(mesh, options);
  return mesh;
}

export function createConePreviewIndicator(
  THREE: ThreeIndicatorModule,
  options: ThreeConePreviewIndicatorOptions,
): ThreeIndicatorObject {
  const angle = positiveFinite(options.angle, "cone preview angle");
  const CircleGeometry = requireCtor(THREE.CircleGeometry, "CircleGeometry");
  const geometry = new CircleGeometry(
    positiveFinite(options.range, "cone preview range"),
    integerAtLeast(options.segments ?? 48, 3, "cone preview segments"),
    -angle * 0.5,
    angle,
  );
  const mesh = new THREE.Mesh(geometry, createThreeIndicatorMaterial(THREE, {
    opacity: 0.28,
    ...options,
    transparent: options.transparent ?? true,
  }));
  applyGroundObject(mesh, options.position, options.y);
  mesh.rotation.z = options.heading ?? 0;
  applyCommonObjectOptions(mesh, options);
  return mesh;
}

export function createBeamPreviewIndicator(
  THREE: ThreeIndicatorModule,
  options: ThreeBeamPreviewIndicatorOptions,
): ThreeIndicatorObject {
  const length = positiveFinite(options.length, "beam preview length");
  const width = positiveFinite(options.width ?? 0.18, "beam preview width");
  const PlaneGeometry = requireCtor(THREE.PlaneGeometry, "PlaneGeometry");
  const mesh = new THREE.Mesh(
    new PlaneGeometry(length, width),
    createThreeIndicatorMaterial(THREE, { opacity: 0.35, ...options, transparent: options.transparent ?? true }),
  );
  const heading = options.heading ?? 0;
  const origin = options.origin ?? [0, options.y ?? 0, 0];
  const half = length * 0.5;
  mesh.position.set(origin[0] + Math.cos(heading) * half, origin[1], origin[2] + Math.sin(heading) * half);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = heading;
  applyCommonObjectOptions(mesh, options);
  return mesh;
}

export function createProjectileTrailIndicator(
  THREE: ThreeIndicatorModule,
  options: ThreeProjectileTrailIndicatorOptions,
): ThreeIndicatorObject {
  const Line = requireCtor(THREE.Line, "Line");
  const BufferGeometry = requireCtor(THREE.BufferGeometry, "BufferGeometry");
  const LineBasicMaterial = requireCtor(THREE.LineBasicMaterial, "LineBasicMaterial");
  const geometry = new BufferGeometry();
  if (!geometry.setFromPoints) throw new Error("projectile trail requires BufferGeometry.setFromPoints");
  geometry.setFromPoints(options.points.map((point) => createVector3(THREE, point)));
  const line = new Line(geometry, new LineBasicMaterial({
    color: options.color ?? 0xffffff,
    transparent: options.transparent ?? (options.opacity ?? 1) < 1,
    opacity: clamp01(options.opacity ?? 1),
    depthWrite: options.depthWrite ?? false,
    depthTest: options.depthTest ?? true,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  applyCommonObjectOptions(line, options);
  return line;
}

export function createBarIndicator(THREE: ThreeIndicatorModule, options: ThreeBarIndicatorOptions): ThreeIndicatorObject {
  const Group = requireCtor(THREE.Group, "Group");
  const PlaneGeometry = requireCtor(THREE.PlaneGeometry, "PlaneGeometry");
  const group = new Group();
  const width = positiveFinite(options.width, "bar width");
  const height = positiveFinite(options.height, "bar height");
  const amount = normalizeValue(options.value, options.max);
  const background = new THREE.Mesh(
    new PlaneGeometry(width, height),
    createThreeIndicatorMaterial(THREE, { color: 0x111111, opacity: 0.65, transparent: true, ...options.background }),
  );
  const fill = new THREE.Mesh(
    new PlaneGeometry(Math.max(0.0001, width * amount), height),
    createThreeIndicatorMaterial(THREE, { color: 0x44ff88, opacity: 0.9, transparent: true, ...options.fill }),
  );
  fill.position.set(-width * 0.5 + (width * amount) * 0.5, 0, 0.001);
  group.add?.(background, fill);
  if (options.position) group.position.set(options.position[0], options.position[1], options.position[2]);
  applyCommonObjectOptions(group, options);
  return group;
}

export function createRadialIndicator(THREE: ThreeIndicatorModule, options: ThreeRadialIndicatorOptions): ThreeIndicatorObject {
  return createGroundArcIndicator(THREE, {
    ...options,
    angle: Math.PI * 2 * normalizeValue(options.value, options.max),
    thickness: options.thickness ?? options.radius * 0.12,
    startAngle: options.startAngle ?? -Math.PI / 2,
  });
}

export function createStatusBadgeIndicator(THREE: ThreeIndicatorModule, options: ThreeStatusBadgeIndicatorOptions = {}): ThreeIndicatorObject {
  const Group = requireCtor(THREE.Group, "Group");
  const CircleGeometry = requireCtor(THREE.CircleGeometry, "CircleGeometry");
  const RingGeometry = requireCtor(THREE.RingGeometry, "RingGeometry");
  const group = new Group();
  const radius = positiveFinite(options.radius ?? 0.24, "status badge radius");
  const background = new THREE.Mesh(
    new CircleGeometry(radius, integerAtLeast(options.segments ?? 24, 3, "status badge segments")),
    createThreeIndicatorMaterial(THREE, { color: 0x222222, opacity: 0.9, transparent: true, ...options.background }),
  );
  group.add?.(background);
  if (options.outline) {
    group.add?.(new THREE.Mesh(
      new RingGeometry(
        radius,
        radius + positiveFinite(options.outline.thickness ?? radius * 0.14, "status badge outline thickness"),
        integerAtLeast(options.segments ?? 24, 3, "status badge segments"),
      ),
      createThreeIndicatorMaterial(THREE, { color: 0xffffff, opacity: 1, transparent: true, ...options.outline }),
    ));
  }
  if (options.position) group.position.set(options.position[0], options.position[1], options.position[2]);
  applyCommonObjectOptions(group, options);
  return group;
}

function applyGroundObject(object: ThreeIndicatorObject, position: ThreeIndicatorVec3 | undefined, y: number | undefined) {
  const next = position ?? [0, y ?? 0, 0];
  object.position.set(next[0], next[1], next[2]);
  object.rotation.x = -Math.PI / 2;
}

function applyCommonObjectOptions(object: ThreeIndicatorObject, options: { name?: string; renderOrder?: number }) {
  if (options.name !== undefined) object.name = options.name;
  if (options.renderOrder !== undefined) object.renderOrder = options.renderOrder;
  object.frustumCulled = false;
}

function createVector3(THREE: ThreeIndicatorModule, point: ThreeIndicatorVec3): ThreeIndicatorVec3Object {
  if (THREE.Vector3) return new THREE.Vector3(point[0], point[1], point[2]);
  return { x: point[0], y: point[1], z: point[2] };
}

function requireCtor<T>(value: T | undefined, name: string): T {
  if (!value) throw new Error(`Three indicator helper requires ${name}`);
  return value;
}

function normalizeValue(value: number, max = 1) {
  const denominator = positiveFinite(max, "indicator max");
  return clamp01(value / denominator);
}

function positiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0`);
  return value;
}

function integerAtLeast(value: number, min: number, label: string) {
  if (!Number.isInteger(value) || value < min) throw new Error(`${label} must be an integer >= ${min}`);
  return value;
}
