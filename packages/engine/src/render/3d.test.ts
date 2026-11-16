import { createFakeColor } from "../test-support/color.ts";
import { isRecord } from "@hyperfocus/utilities/records";
import { registerTestDom } from "../test-support/register-dom.ts";
import { expect, test } from "bun:test";
import * as THREE from "three";
import {
  clonePreparedThreeObject,
  createCameraRig,
  createSolidThreeTexture,
  createThreeBspTree3D,
  createThreeLodBakeCache,
  createThreeLodPolicy,
  createThreeSkybox3D,
  createThirdPersonCameraRig3D,
  createThreeRender3D,
  createThreeResourceCache,
  createThreeWorldTextOverlay3D,
  createToroidalWorld3D,
  loadFirstThreeAsset,
  loadThreeLoaderAsset,
  prepareThreeObject3D,
  simplifyThreeBufferGeometry,
  splitThreeInstanceBatchByLod,
  type ThreeLikeBufferAttribute,
  type ThreeLikeBufferGeometry,
  type ThreeLikeGeometry,
  type ThreeLikeMaterial,
  type ThreeLikeObject3D,
  type ThreeModuleLike
} from "./3d.ts";

registerTestDom();

type FakeVector3 = ReturnType<typeof createFakeVector3>;
type FakeScale = ReturnType<typeof createFakeScale>;
type FakeObject3D = Omit<ThreeLikeObject3D, "children"> & {
  isMesh: boolean;
  renderOrder?: number;
  position: FakeVector3;
  scale: FakeScale;
  children: ThreeLikeObject3D[];
  matrixUpdates: number;
  traverse(visit: (object: ThreeLikeObject3D) => void): void;
  clone(): FakeObject3D;
};
type FakeCamera = FakeObject3D & {
  aspect: number;
  fov: number;
  near: number;
  far: number;
  target: FakeVector3;
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix(): void;
};

const fakeObjects = new WeakSet<object>();

function createFakeVector3(x = 0, y = 0, z = 0) {
  const vector = {
    x,
    y,
    z,
    set(nextX: number, nextY: number, nextZ: number) {
      vector.x = nextX;
      vector.y = nextY;
      vector.z = nextZ;
    },
  };
  return vector;
}

function createFakeScale(x = 0, y = 0, z = 0) {
  const vector = createFakeVector3(x, y, z);
  return Object.assign(vector, {
    setScalar(value: number) {
      vector.set(value, value, value);
    },
  });
}

function createFakeObject3D(): FakeObject3D {
  const object: FakeObject3D = {
    isMesh: false,
    position: createFakeVector3(),
    rotation: { x: 0, y: 0, z: 0 },
    scale: createFakeScale(),
    visible: true,
    frustumCulled: true,
    castShadow: false,
    receiveShadow: false,
    children: [],
    matrixUpdates: 0,
    add(...objects) {
      object.children.push(...objects);
    },
    remove(...objects) {
      object.children = object.children.filter((child) => !objects.includes(child));
    },
    updateMatrix() {
      object.matrixUpdates += 1;
    },
    traverse(visit) {
      visit(object);
      for (const child of object.children) requireFakeObject3D(child).traverse(visit);
    },
    clone() {
      const copy = createFakeObject3D();
      copy.position.set(object.position.x, object.position.y, object.position.z);
      copy.rotation = { ...object.rotation };
      copy.scale.set(object.scale.x, object.scale.y, object.scale.z);
      copy.children = object.children.map((child) => requireFakeObject3D(child).clone());
      return copy;
    },
  };
  fakeObjects.add(object);
  return object;
}

function isFakeObject3D(value: unknown): value is FakeObject3D {
  return typeof value === "object" && value !== null && fakeObjects.has(value);
}

function requireFakeObject3D(value: unknown): FakeObject3D {
  if (!isFakeObject3D(value)) throw new TypeError("Expected a registered Three object test double.");
  return value;
}

function createFakeScene() {
  return Object.assign(createFakeObject3D(), { background: undefined, fog: undefined });
}

function createFakeCamera(fov = 55, aspect = 1, near = 0.1, far = 1000): FakeCamera {
  const camera = Object.assign(createFakeObject3D(), {
    aspect,
    fov,
    near,
    far,
    target: createFakeVector3(),
    lookAt(x: number, y: number, z: number) {
      camera.target.set(x, y, z);
    },
    updateProjectionMatrix() {},
  });
  return camera;
}

function createFakeOrthographicCamera(left: number, right: number, top: number, bottom: number, near: number, far: number) {
  return Object.assign(createFakeCamera(55, 1, near, far), { left, right, top, bottom });
}

type FakeRenderer = ReturnType<typeof createFakeRenderer>;

const fakeRenderers = new WeakSet<object>();

function createFakeRenderer() {
  const renderer = {
    shadowMap: { enabled: false },
    pixelRatio: 1,
    renders: 0,
    disposed: false,
    width: 320,
    height: 180,
    setPixelRatio(value: number) {
      renderer.pixelRatio = value;
    },
    setSize(width: number, height: number) {
      renderer.width = width;
      renderer.height = height;
    },
    setClearColor() {},
    render() {
      renderer.renders += 1;
    },
    dispose() {
      renderer.disposed = true;
    },
  };
  fakeRenderers.add(renderer);
  return renderer;
}

function requireFakeRenderer(value: unknown): FakeRenderer {
  if (!isFakeRenderer(value)) {
    throw new TypeError("Expected the registered renderer test double.");
  }
  return value;
}

function isFakeRenderer(value: unknown): value is FakeRenderer {
  return typeof value === "object" && value !== null && fakeRenderers.has(value);
}

function createFakeLight(color: unknown, intensity = 1) {
  return Object.assign(createFakeObject3D(), { color, intensity });
}

function createFakePointLight(color: unknown, intensity = 1, distance = 0, decay = 1) {
  return Object.assign(createFakeLight(color, intensity), { distance, decay });
}

type FakeMaterial = ReturnType<typeof createFakeMaterial>;
type FakeSphereGeometry = ReturnType<typeof createFakeSphereGeometry>;
type FakeMesh = FakeObject3D & {
  isMesh: true;
  geometry: ThreeLikeGeometry;
  material: ThreeLikeMaterial;
  clone(): FakeMesh;
};

const fakeMeshes = new WeakSet<object>();
const fakeMaterials = new WeakSet<object>();
const fakeSphereGeometries = new WeakSet<object>();

function createFakeGeometry() {
  const geometry = {
    disposed: false,
    dispose() {
      geometry.disposed = true;
    },
  };
  return geometry;
}

function createFakeMaterial(id: string, options: Record<string, unknown> = {}) {
  const material = {
    id,
    options,
    disposed: false,
    dispose() {
      material.disposed = true;
    },
  };
  fakeMaterials.add(material);
  return material;
}

function createFakeBoxGeometry(width = 1, height = 1, depth = 1) {
  return Object.assign(createFakeGeometry(), { width, height, depth });
}

function createFakeSphereGeometry(radius = 1) {
  const geometry = Object.assign(createFakeGeometry(), { radius });
  fakeSphereGeometries.add(geometry);
  return geometry;
}

function createFakeMesh(geometry: ThreeLikeGeometry, material: ThreeLikeMaterial): FakeMesh {
  const mesh = Object.assign(createFakeObject3D(), {
    isMesh: true as const,
    geometry,
    material,
    clone() {
      const copy = createFakeMesh(mesh.geometry, mesh.material);
      copy.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
      copy.rotation = { ...mesh.rotation };
      copy.scale.set(mesh.scale.x, mesh.scale.y, mesh.scale.z);
      copy.children = mesh.children.map((child) => requireFakeObject3D(child).clone());
      return copy;
    },
  });
  fakeMeshes.add(mesh);
  return mesh;
}

function requireFakeMesh(value: unknown): FakeMesh {
  if (!isFakeMesh(value)) {
    throw new TypeError("Expected the registered mesh test double.");
  }
  return value;
}

function isFakeMesh(value: unknown): value is FakeMesh {
  return typeof value === "object" && value !== null && fakeMeshes.has(value);
}

function requireFakeMaterial(value: unknown): FakeMaterial {
  if (!isFakeMaterial(value)) {
    throw new TypeError("Expected the registered material test double.");
  }
  return value;
}

function isFakeMaterial(value: unknown): value is FakeMaterial {
  return typeof value === "object" && value !== null && fakeMaterials.has(value);
}

function requireFakeSphereGeometry(value: unknown): FakeSphereGeometry {
  if (!isFakeSphereGeometry(value)) {
    throw new TypeError("Expected the registered sphere-geometry test double.");
  }
  return value;
}

function isFakeSphereGeometry(value: unknown): value is FakeSphereGeometry {
  return typeof value === "object" && value !== null && fakeSphereGeometries.has(value);
}

type FakeMatrix4 = ReturnType<typeof createFakeMatrix4>;
type FakeInstancedMesh = FakeObject3D & ReturnType<typeof createFakeInstancedMeshState>;
type FakeDataTexture = ReturnType<typeof createFakeDataTexture>;
type FakeAnimationAction = ReturnType<typeof createFakeAnimationAction>;
type FakeAnimationMixer = ReturnType<typeof createFakeAnimationMixer>;

const fakeInstancedMeshes = new WeakSet<object>();
const fakeDataTextures = new WeakSet<object>();
const fakeAnimationMixers = new WeakSet<object>();

function createFakeMatrix4() {
  const elements: number[] = [];
  const matrix = {
    elements,
    fromArray(values: ArrayLike<number>, offset = 0) {
      matrix.elements = Array.from({ length: 16 }, (_, index) => values[offset + index] ?? 0);
    },
  };
  return matrix;
}

function createFakeInstancedMeshState(geometry: ThreeLikeGeometry, material: ThreeLikeMaterial, count: number) {
  const matrices: number[][] = [];
  const instanceMatrix: { needsUpdate: boolean; usage: unknown; setUsage(usage: unknown): void } = {
    needsUpdate: false,
    usage: undefined,
    setUsage(usage) {
      instanceMatrix.usage = usage;
    },
  };
  const state = {
    geometry,
    material,
    count,
    instanceMatrix,
    matrices,
    setMatrixAt(index: number, matrix: FakeMatrix4) {
      state.matrices[index] = [...matrix.elements];
    },
  };
  return state;
}

function createFakeInstancedMesh(geometry: ThreeLikeGeometry, material: ThreeLikeMaterial, count: number): FakeInstancedMesh {
  const mesh = Object.assign(createFakeObject3D(), createFakeInstancedMeshState(geometry, material, count));
  fakeInstancedMeshes.add(mesh);
  return mesh;
}

function requireFakeInstancedMesh(value: unknown): FakeInstancedMesh {
  if (!isFakeInstancedMesh(value)) {
    throw new TypeError("Expected the registered instanced-mesh test double.");
  }
  return value;
}

function isFakeInstancedMesh(value: unknown): value is FakeInstancedMesh {
  return typeof value === "object" && value !== null && fakeInstancedMeshes.has(value);
}

function createFakeDataTexture(data: Uint8Array, width: number, height: number) {
  const texture: { data: Uint8Array; width: number; height: number; colorSpace: unknown; needsUpdate: boolean } = {
    data,
    width,
    height,
    colorSpace: undefined,
    needsUpdate: false,
  };
  fakeDataTextures.add(texture);
  return texture;
}

function requireFakeDataTexture(value: unknown): FakeDataTexture {
  if (!isFakeDataTexture(value)) {
    throw new TypeError("Expected the registered data-texture test double.");
  }
  return value;
}

function isFakeDataTexture(value: unknown): value is FakeDataTexture {
  return typeof value === "object" && value !== null && fakeDataTextures.has(value);
}

function createFakeAnimationAction() {
  const action = {
    played: false,
    stopped: false,
    reset() {
      return action;
    },
    play() {
      action.played = true;
      return action;
    },
    stop() {
      action.stopped = true;
      return action;
    },
    fadeIn() {
      return action;
    },
    fadeOut() {
      return action;
    },
  };
  return action;
}

function createFakeAnimationMixer(root: ThreeLikeObject3D) {
  const updates: number[] = [];
  const mixer = {
    root,
    updates,
    actions: new Map<string, FakeAnimationAction>(),
    clipAction(clip: { name: string }) {
      let action = mixer.actions.get(clip.name);
      if (!action) {
        action = createFakeAnimationAction();
        mixer.actions.set(clip.name, action);
      }
      return action;
    },
    update(dt: number) {
      mixer.updates.push(dt);
    },
    stopAllAction() {},
  };
  fakeAnimationMixers.add(mixer);
  return mixer;
}

function requireFakeAnimationMixer(value: unknown): FakeAnimationMixer {
  if (!isFakeAnimationMixer(value)) {
    throw new TypeError("Expected the registered animation-mixer test double.");
  }
  return value;
}

function isFakeAnimationMixer(value: unknown): value is FakeAnimationMixer {
  return typeof value === "object" && value !== null && fakeAnimationMixers.has(value);
}

function createTestConstructor<T extends object>(factory: (args: readonly unknown[]) => T): new (...args: unknown[]) => T;
function createTestConstructor<T extends object>(factory: (args: readonly unknown[]) => T) {
  return new Proxy(Object, {
    construct: (_target, args) => factory(args),
  });
}

function createFakeThree(): ThreeModuleLike {
  return {
    WebGLRenderer: createTestConstructor(() => createFakeRenderer()),
    Scene: createTestConstructor(() => createFakeScene()),
    Group: createTestConstructor(() => createFakeObject3D()),
    PerspectiveCamera: createTestConstructor((args) => createFakeCamera(
        readNumberArgument(args, 0, 55),
        readNumberArgument(args, 1, 1),
        readNumberArgument(args, 2, 0.1),
        readNumberArgument(args, 3, 1000),
      )),
    OrthographicCamera: createTestConstructor((args) => createFakeOrthographicCamera(
        readNumberArgument(args, 0, -1),
        readNumberArgument(args, 1, 1),
        readNumberArgument(args, 2, 1),
        readNumberArgument(args, 3, -1),
        readNumberArgument(args, 4, 0.1),
        readNumberArgument(args, 5, 1000),
      )),
    Color: createTestConstructor((args) => createFakeColor(args[0])),
    AmbientLight: createTestConstructor((args) => createFakeLight(args[0], readNumberArgument(args, 1, 1))),
    HemisphereLight: createTestConstructor((args) => Object.assign(
        createFakeLight(args[0], readNumberArgument(args, 2, 1)),
        { skyColor: args[0], groundColor: args[1] },
      )),
    DirectionalLight: createTestConstructor((args) => createFakeLight(args[0], readNumberArgument(args, 1, 1))),
    PointLight: createTestConstructor((args) => createFakePointLight(
        args[0],
        readNumberArgument(args, 1, 1),
        readNumberArgument(args, 2, 0),
        readNumberArgument(args, 3, 1),
      )),
    BoxGeometry: createTestConstructor((args) => createFakeBoxGeometry(
        readNumberArgument(args, 0, 1),
        readNumberArgument(args, 1, 1),
        readNumberArgument(args, 2, 1),
      )),
    SphereGeometry: createTestConstructor((args) => createFakeSphereGeometry(readNumberArgument(args, 0, 1))),
    Mesh: createTestConstructor((args) => createFakeMesh(requireObject(args[0]), requireObject(args[1]))),
    InstancedMesh: createTestConstructor((args) => createFakeInstancedMesh(
        requireObject(args[0]),
        requireObject(args[1]),
        readNumberArgument(args, 2, 0),
      )),
    Matrix4: createTestConstructor(() => createFakeMatrix4()),
    MeshBasicMaterial: createTestConstructor((args) => createFakeMaterial("basic", readRecordArgument(args, 0))),
    MeshStandardMaterial: createTestConstructor((args) => createFakeMaterial("standard", readRecordArgument(args, 0))),
    DataTexture: createTestConstructor((args) => createFakeDataTexture(
        requireUint8Array(args[0]),
        readNumberArgument(args, 1, 1),
        readNumberArgument(args, 2, 1),
      )),
    AnimationMixer: createTestConstructor((args) => createFakeAnimationMixer(requireFakeObject3D(args[0]))),
    SRGBColorSpace: "srgb",
    BackSide: "back",
    DynamicDrawUsage: "dynamic",
    StaticDrawUsage: "static",
  };
}

function readNumberArgument(args: readonly unknown[], index: number, fallback: number) {
  return typeof args[index] === "number" ? args[index] : fallback;
}

function readRecordArgument(args: readonly unknown[], index: number): Record<string, unknown> {
  const value = args[index];
  return isRecord(value) ? value : {};
}

function requireObject(value: unknown): object {
  if (typeof value !== "object" || value === null) throw new TypeError("Expected an object argument.");
  return value;
}

function requireUint8Array(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError("Expected a Uint8Array argument.");
  return value;
}

function countBufferGeometryTriangles(geometry: ThreeLikeBufferGeometry) {
  const value = geometry.getIndex?.() ?? geometry.index
    ?? geometry.getAttribute?.("position") ?? geometry.attributes?.position;
  return Math.floor(requireBufferGeometryAttributeValue(value, "index or position").count / 3);
}

function requireBufferGeometryAttribute(geometry: ThreeLikeBufferGeometry, name: string): ThreeLikeBufferAttribute {
  const attribute = geometry.getAttribute?.(name) ?? geometry.attributes?.[name];
  return requireBufferGeometryAttributeValue(attribute, name);
}

function requireBufferGeometryAttributeValue(value: unknown, name: string): ThreeLikeBufferAttribute {
  if (typeof value !== "object" || value === null) throw new TypeError(`Expected buffer geometry attribute ${name}.`);
  const array = "array" in value ? value.array : undefined;
  const itemSize = "itemSize" in value ? value.itemSize : undefined;
  const count = "count" in value ? value.count : undefined;
  if (!isNumberArrayLike(array) || typeof itemSize !== "number" || typeof count !== "number") {
    throw new TypeError(`Expected buffer geometry attribute ${name}.`);
  }
  return { array, itemSize, count };
}

function isNumberArrayLike(value: unknown): value is ArrayLike<number> {
  return value instanceof Int8Array || value instanceof Uint8Array || value instanceof Uint8ClampedArray
    || value instanceof Int16Array || value instanceof Uint16Array || value instanceof Int32Array
    || value instanceof Uint32Array || value instanceof Float32Array || value instanceof Float64Array
    || (Array.isArray(value) && value.every((entry) => typeof entry === "number"));
}

test("createThirdPersonCameraRig3D orbits around a target and applies to a camera", () => {
  const camera = createFakeCamera();
  const rig = createThirdPersonCameraRig3D({
    target: [0, 1, 0],
    yaw: Math.PI / 2,
    pitch: 0,
    distance: 10,
    fov: 62,
    smoothing: { follow: 0, rotation: 0, distance: 0, collision: 0 },
    collision: { enabled: false }
  });

  rig.update(0).applyToCamera(camera);

  expect(camera.position.x).toBeCloseTo(10);
  expect(camera.position.y).toBeCloseTo(1);
  expect(camera.position.z).toBeCloseTo(0);
  expect(camera.target.x).toBeCloseTo(0);
  expect(camera.target.y).toBeCloseTo(1);
  expect(camera.target.z).toBeCloseTo(0);
  expect(camera.fov).toBe(62);
});

test("createThirdPersonCameraRig3D chains transitions from the prior transition end state", () => {
  const rig = createThirdPersonCameraRig3D({
    pitch: 0,
    distance: 10,
    smoothing: { follow: 0, rotation: 0, distance: 0, collision: 0 },
    collision: { enabled: false }
  });

  rig
    .transitionTo({ distance: 14 }, { duration: 1, easing: (amount) => amount })
    .queueTransition({ distance: 6 }, { duration: 1, easing: (amount) => amount });

  rig.update(1);
  expect(rig.snapshot().distance).toBeCloseTo(14);

  rig.update(0.5);
  expect(rig.snapshot().distance).toBeCloseTo(10);
});

test("createThirdPersonCameraRig3D pulls in front of blocking obstacles", () => {
  const rig = createThirdPersonCameraRig3D({
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: 10,
    smoothing: { follow: 0, rotation: 0, distance: 0, collision: 0 },
    collision: {
      radius: 0.5,
      minDistance: 1,
      obstacles: [{ kind: "sphere", center: [0, 0, 5], radius: 1 }]
    }
  });

  const snapshot = rig.snapshot();

  expect(snapshot.blocked).toBe(true);
  expect(snapshot.position[2]).toBeLessThan(4);
  expect(snapshot.desiredPosition[2]).toBeCloseTo(10);
});

test("createThirdPersonCameraRig3D allows custom obstacle resolvers", () => {
  const rig = createThirdPersonCameraRig3D({
    target: [0, 0, 0],
    pitch: 0,
    distance: 10,
    smoothing: { follow: 0, rotation: 0, distance: 0, collision: 0 },
    collision: {
      resolver: () => ({ position: [2, 3, 4], blocked: true })
    }
  });

  expect(rig.snapshot().position).toEqual([2, 3, 4]);
  expect(rig.snapshot().blocked).toBe(true);
});

test("createCameraRig follows targets with asymptotic damping and copies desired position", () => {
  const camera = new THREE.PerspectiveCamera();
  const desired = new THREE.Vector3();
  const rig = createCameraRig(camera, {
    offset: new THREE.Vector3(0, 6, 10),
    lookAtOffset: new THREE.Vector3(0, 1, 0),
    influence: 10,
  });

  rig.setTarget(new THREE.Vector3(0, 0, 0)).update(0);
  rig.setTarget(new THREE.Vector3(10, 0, 0)).update(0.1).getDesiredPosition(desired);

  const trackedX = 10 * (1 - Math.exp(-1));
  expect(desired.x).toBeCloseTo(trackedX);
  expect(desired.y).toBeCloseTo(6);
  expect(desired.z).toBeCloseTo(10);
  expect(camera.position.x).toBeCloseTo(desired.x);
});

test("createCameraRig tracks shortest toroidal target movement", () => {
  const camera = new THREE.PerspectiveCamera();
  const desired = new THREE.Vector3();
  const rig = createCameraRig(camera, {
    offset: new THREE.Vector3(0, 5, 10),
    lookAtOffset: new THREE.Vector3(0, 0, 0),
    influence: 0,
    worldSize: new THREE.Vector2(100, 100),
  });

  rig.setTarget(new THREE.Vector3(49, 0, 0)).update(0);
  rig.setTarget(new THREE.Vector3(-49, 0, 0)).update(0).getDesiredPosition(desired);

  expect(desired.x).toBeCloseTo(51);
  expect(desired.z).toBeCloseTo(10);
});

test("createCameraRig raycasts only supplied static colliders and supports decoupled shake", () => {
  const camera = new THREE.PerspectiveCamera();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1), new THREE.MeshBasicMaterial());
  wall.position.set(0, 0, 5);
  wall.updateMatrixWorld(true);
  const desired = new THREE.Vector3();
  const rig = createCameraRig(camera, {
    offset: new THREE.Vector3(0, 0, 10),
    lookAtOffset: new THREE.Vector3(0, 0, 0),
    influence: 0,
  });

  rig.setTarget(new THREE.Vector3(0, 0, 0)).update(0, [wall]).getDesiredPosition(desired);
  expect(desired.z).toBeCloseTo(4.3);

  rig.applyShake(1, 0, 0);
  rig.applyShake(0.5, 0, 0);
  expect(camera.position.x).toBeCloseTo(1.5);
  expect(camera.position.z).toBeCloseTo(desired.z);
});

test("createThreeWorldTextOverlay3D anchors text above targets and scales by camera distance", () => {
  const camera = createFakeCamera();
  const container = document.createElement("div");
  const projectedY: number[] = [];
  const layer = createThreeWorldTextOverlay3D({
    container,
    camera,
    viewport: { width: 200, height: 100 },
    className: "float-text",
    baseFontPx: 20,
    lifeSeconds: 1,
    referenceDistance: 10,
    minDistanceScale: 0.4,
    maxDistanceScale: 2,
    rise: 4,
    screenRisePx: 10,
    growScale: 0.2,
    createElement: () => document.createElement("div"),
    resolvePosition: (position) => [position[0] + 1, position[1], position[2]],
    project: ({ position }) => {
      projectedY.push(position[1]);
      return { x: 0.2, y: 0.4, z: 0.2, distance: 20 };
    },
  });

  const element = layer.spawn({
    text: "28",
    position: [0, 0, 0],
    targetHeight: 4,
    color: "#ffd782",
    scale: 1,
  });

  layer.update(0);
  expect(layer.size).toBe(1);
  expect(Array.from(container.children)).toEqual([element]);
  expect(element.className).toBe("float-text");
  expect(element.textContent).toBe("28");
  expect(element.style.left).toBe("120px");
  expect(element.style.top).toBe("30px");
  expect(element.style.fontSize).toBe("10px");
  expect(element.style.opacity).toBe("1");
  expect(element.style.transform).toBe("translate(-50%, -50%) translateY(0px) scale(1)");
  expect(element.style.getPropertyValue("--float-color")).toBe("#ffd782");

  layer.update(0.5);
  expect(projectedY).toEqual([4, 6]);
  expect(element.style.opacity).toBe("0.5");
  expect(element.style.transform).toBe("translate(-50%, -50%) translateY(-5px) scale(1.1)");

  layer.update(0.5);
  expect(layer.size).toBe(0);
  expect(element.isConnected).toBe(false);
});

test("createThreeRender3D renders registered meshes and instanced batches", async () => {
  const THREE = createFakeThree();
  const view = await createThreeRender3D({ three: THREE, width: 640, height: 360, pixelRatioCap: 1.5, shadows: true });
  const geometry = createFakeGeometry();
  const material = createFakeMaterial("tree");
  const ghost = createFakeMaterial("ghost");
  view.registerMesh("tree", { geometry, material });
  view.registerMaterial("ghost", ghost);

  const matrices = [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 2, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 8, 0, 6, 1,
  ];
  const result = view.render({
    camera: { kind: "perspective", position: [0, 12, 18], target: [0, 0, 0], fov: 55 },
    lights: [
      { kind: "ambient", color: "#ffffff", intensity: 0.4 },
      { kind: "directional", direction: [-1, -2, -1], intensity: 1 },
    ],
    calls: [
      { kind: "mesh", mesh: "tree", transform: { position: [4, 0, 2], rotationY: 1.2, scale: 2 } },
      { kind: "instanceBatch", mesh: "tree", material: "ghost", matrices, count: 2 },
    ],
  });

  const renderer = requireFakeRenderer(view.renderer);
  const callRoot = requireFakeObject3D(view.scene.children?.[0]);
  const lightRoot = requireFakeObject3D(view.scene.children?.[1]);
  const mesh = requireFakeMesh(callRoot.children[0]);
  const batch = requireFakeInstancedMesh(callRoot.children[1]);

  expect(result).toEqual({ calls: 2, lights: 2, backend: "webgl2" });
  expect(renderer.renders).toBe(1);
  expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5);
  expect(renderer.pixelRatio).toBeGreaterThanOrEqual(1);
  expect(renderer.shadowMap.enabled).toBe(true);
  expect(lightRoot.children.length).toBe(2);
  expect(mesh.position).toMatchObject({ x: 4, y: 0, z: 2 });
  expect(mesh.rotation.y).toBe(1.2);
  expect(mesh.scale).toMatchObject({ x: 2, y: 2, z: 2 });
  expect(batch.count).toBe(2);
  expect(batch.material).toBe(ghost);
  expect(batch.instanceMatrix.needsUpdate).toBe(true);
  expect(batch.matrices[1][12]).toBe(8);
  expect(view.camera.position).toMatchObject({ x: 0, y: 12, z: 18 });

  const firstMeshObject = mesh;
  const secondResult = view.render({ calls: [{ kind: "mesh", mesh: "tree", transform: { position: [5, 0, 2] } }] });
  const reusedMesh = requireFakeMesh(callRoot.children[0]);
  expect(secondResult.calls).toBe(1);
  expect(reusedMesh).toBe(firstMeshObject);
  expect(reusedMesh.position.x).toBe(5);
  expect(callRoot.children[1].visible).toBe(false);
});

test("createThreeRender3D guards unknown mesh and material ids", async () => {
  const view = await createThreeRender3D({ three: createFakeThree() });
  view.registerMesh("hero", { geometry: createFakeGeometry() });

  expect(() => view.render({ calls: [{ kind: "mesh", mesh: "missing" }] })).toThrow("Unknown 3D mesh");
  expect(() => view.render({ calls: [{ kind: "mesh", mesh: "hero", material: "missing" }] })).toThrow("Unknown 3D material");
});

test("3D LOD policy selects configurable distance bands", () => {
  const policy = createThreeLodPolicy([
    { maxDistance: 15, ratio: 1, mesh: "tree-high" },
    { maxDistance: 30, ratio: 0.5, mesh: "tree-mid" },
    { maxDistance: Number.POSITIVE_INFINITY, ratio: 0.25, mesh: "tree-low" },
  ]);

  expect(policy.select(0).ratio).toBe(1);
  expect(policy.select(15).mesh).toBe("tree-high");
  expect(policy.select(20).ratio).toBe(0.5);
  expect(policy.select(31).ratio).toBe(0.25);
  expect(() => createThreeLodPolicy([
    { maxDistance: 30, ratio: 1 },
    { maxDistance: 15, ratio: 0.5 },
  ])).toThrow("strictly increasing");
});

test("3D LOD bake cache lazily reuses and disposes baked resources", () => {
  const cache = createThreeLodBakeCache<FakeMaterial>();
  let bakes = 0;
  const first = cache.get("tree", 0.5, ({ ratio }) => {
    bakes += 1;
    return createFakeMaterial(`tree-${ratio}`);
  });
  const reused = cache.get("tree", 0.5, () => createFakeMaterial("miss"));

  expect(reused).toBe(first);
  expect(bakes).toBe(1);
  expect(cache.has("tree", 0.5)).toBe(true);
  expect(cache.delete("tree", 0.5)).toBe(true);
  expect(first.disposed).toBe(true);
  expect(cache.size).toBe(0);
});

test("simplifyThreeBufferGeometry bakes lower-index Three BufferGeometry", async () => {
  const source = new THREE.SphereGeometry(1, 24, 16);
  const beforeTriangles = countBufferGeometryTriangles(source);
  const simplified = await simplifyThreeBufferGeometry(source, {
    ratio: 0.25,
    targetError: 1,
    computeVertexNormals: true,
  });

  expect(simplified).not.toBe(source);
  expect(countBufferGeometryTriangles(simplified)).toBeLessThan(beforeTriangles);
  expect(requireBufferGeometryAttribute(simplified, "position").count).toBeLessThan(source.getAttribute("position").count);
  expect(requireBufferGeometryAttribute(simplified, "uv")).toBeTruthy();
  expect(requireBufferGeometryAttribute(simplified, "normal")).toBeTruthy();
});

test("splitThreeInstanceBatchByLod groups matrices by selected LOD mesh", () => {
  const matrices = new Float32Array(48);
  for (let index = 0; index < 3; index += 1) {
    matrices[index * 16] = 1;
    matrices[index * 16 + 5] = 1;
    matrices[index * 16 + 10] = 1;
    matrices[index * 16 + 12] = [5, 20, 40][index];
    matrices[index * 16 + 15] = 1;
  }

  const batches = splitThreeInstanceBatchByLod({
    kind: "instanceBatch",
    mesh: "tree-high",
    matrices,
    count: 3,
    usage: "static",
  }, {
    camera: { x: 0, y: 0, z: 0 },
    levels: [
      { maxDistance: 15, ratio: 1, mesh: "tree-high" },
      { maxDistance: 30, ratio: 0.5, mesh: "tree-mid" },
      { maxDistance: Number.POSITIVE_INFINITY, ratio: 0.25, mesh: "tree-low" },
    ],
  });

  expect(batches.map((batch) => batch.mesh)).toEqual(["tree-high", "tree-mid", "tree-low"]);
  expect(batches.map((batch) => batch.count)).toEqual([1, 1, 1]);
  expect(batches.map((batch) => batch.lodRatio)).toEqual([1, 0.5, 0.25]);
  const middleBatch = batches[1];
  if (!middleBatch || !(middleBatch.matrices instanceof Float32Array)) throw new TypeError("Expected a packed Float32Array LOD batch.");
  expect(Array.from(middleBatch.matrices).slice(12, 15)).toEqual([20, 0, 0]);
});

test("createThreeBspTree3D queries static 3D items without stale output", () => {
  const tree = createThreeBspTree3D<string>({ maxLeafItems: 1 });
  tree.rebuild([
    { value: "near", center: [0, 0, 0] },
    { value: "fat", center: [12, 0, 0], radius: 7 },
    { value: "far", center: [40, 0, 0] },
  ]);

  const out = ["stale"];
  expect(tree.size).toBe(3);
  expect(tree.querySphere([0, 0, 0], 6, out).sort()).toEqual(["fat", "near"]);
  expect(out).toEqual(["fat", "near"]);
  expect(tree.queryBox([-1, -1, -1], [1, 1, 1])).toEqual(["near"]);
  tree.clear();
  expect(tree.size).toBe(0);
  expect(tree.querySphere([0, 0, 0], 100)).toEqual([]);
});

test("createThreeBspTree3D rejects unsafe recursion limits", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => createThreeBspTree3D({ maxLeafItems: value })).toThrow("maxLeafItems");
    expect(() => createThreeBspTree3D({ maxDepth: value })).toThrow("maxDepth");
  }
});

test("createThreeRender3D keeps instance batches stable under capacity", async () => {
  const view = await createThreeRender3D({ three: createFakeThree() });
  view.registerMesh("spark", { geometry: createFakeGeometry(), material: createFakeMaterial("spark") });
  const matrices = new Float32Array(64);
  for (let index = 0; index < 4; index += 1) {
    matrices[index * 16] = 1;
    matrices[index * 16 + 5] = 1;
    matrices[index * 16 + 10] = 1;
    matrices[index * 16 + 12] = index * 3;
    matrices[index * 16 + 15] = 1;
  }

  view.render({
    calls: [{ kind: "instanceBatch", mesh: "spark", matrices, count: 4, capacity: 8, usage: "dynamic", culling: "none" }],
  });
  const callRoot = requireFakeObject3D(view.scene.children?.[0]);
  const firstBatch = requireFakeInstancedMesh(callRoot.children[0]);

  view.render({
    calls: [{ kind: "instanceBatch", mesh: "spark", matrices, count: 2, capacity: 8, usage: "dynamic", culling: "none" }],
  });
  const reusedBatch = requireFakeInstancedMesh(callRoot.children[0]);

  expect(reusedBatch).toBe(firstBatch);
  expect(reusedBatch.count).toBe(2);
  expect(reusedBatch.frustumCulled).toBe(false);
  expect(reusedBatch.instanceMatrix.usage).toBe("dynamic");
  expect(reusedBatch.matrices[1][12]).toBe(3);
  expect(() => view.render({
    calls: [{ kind: "instanceBatch", mesh: "spark", matrices, count: 4, capacity: 3 }],
  })).toThrow("exceeds capacity");
});

test("createThreeRender3D exposes animation and ragdoll helpers", async () => {
  const view = await createThreeRender3D({ three: createFakeThree() });
  const root = createFakeObject3D();
  const animation = view.createAnimationController(root, [{ name: "idle" }, { name: "run" }], { initial: "idle" });

  expect(animation.current).toBe("idle");
  expect(animation.play("run")).toBe(true);
  animation.update(0.16);
  expect(animation.current).toBe("run");
  expect(requireFakeAnimationMixer(animation.mixer).updates).toEqual([0.16]);

  const ragdoll = view.createRagdoll({ position: [1, 2, 3], incomingForce: [2, 1, -1], color: "#89aa61", ttl: 0.2 });
  expect(ragdoll.root.children?.length).toBeGreaterThanOrEqual(6);
  expect(ragdoll.update(0.1)).toBe(true);
  expect(ragdoll.update(0.2)).toBe(false);
});

test("Three asset helpers load first successful path and optional fallback", async () => {
  const errors: string[] = [];
  const loaded = await loadFirstThreeAsset(
    ["assets/missing model.glb", "assets/hero.glb"],
    async (path) => {
      if (path.includes("missing")) throw new Error("missing");
      return { path };
    },
    { onError: (_error, path) => errors.push(path) },
  );

  expect(loaded).toEqual({ path: "assets/hero.glb" });
  expect(errors).toEqual(["assets/missing model.glb"]);

  const fallback = await loadFirstThreeAsset(
    ["assets/missing.glb"],
    async () => {
      throw new Error("missing");
    },
    { fallback: () => ({ path: "fallback" }) },
  );
  expect(fallback).toEqual({ path: "fallback" });
});

test("Three loader helper encodes paths and prepares loaded assets", async () => {
  const requested: string[] = [];
  const loader = {
    load(url: string, onLoad: (asset: { url: string }) => void) {
      requested.push(url);
      onLoad({ url });
    },
  };

  const asset = await loadThreeLoaderAsset(loader, "assets/my model.glb", {
    prepare: (loaded, path) => ({ ...loaded, url: path }),
  });

  expect(requested).toEqual(["assets/my%20model.glb"]);
  expect(asset).toEqual({ url: "assets/my model.glb" });
});

test("Three texture and object prep helpers stay caller-configured", () => {
  const THREE = createFakeThree();
  const texture = requireFakeDataTexture(createSolidThreeTexture(THREE, "#336699", { colorSpace: "srgb" }));
  expect(Array.from(texture.data)).toEqual([51, 102, 153, 255]);
  expect(texture.colorSpace).toBe("srgb");
  expect(texture.needsUpdate).toBe(true);

  const material = createFakeMaterial("skin");
  const root = createFakeObject3D();
  const mesh = createFakeMesh(createFakeGeometry(), createFakeMaterial("old"));
  root.add(mesh);
  prepareThreeObject3D(root, { castShadow: true, receiveShadow: true, material });

  expect(root.castShadow).toBe(false);
  expect(mesh.castShadow).toBe(true);
  expect(mesh.receiveShadow).toBe(true);
  expect(mesh.material).toBe(material);
});

test("createThreeSkybox3D creates inward non-culled texture dome", () => {
  const THREE = createFakeThree();
  const texture = createFakeDataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const skybox = createThreeSkybox3D(THREE, { texture, radius: 120, segments: 24 });
  const mesh = requireFakeMesh(skybox);

  expect(skybox.name).toBe("skybox");
  expect(skybox.frustumCulled).toBe(false);
  expect(requireFakeSphereGeometry(mesh.geometry).radius).toBe(120);
  expect(requireFakeMaterial(mesh.material).options).toMatchObject({
    map: texture,
    side: "back",
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  expect(mesh.renderOrder).toBe(-1000);
});

test("prepared Three clones apply scale and mesh preparation", () => {
  const source = createFakeMesh(createFakeGeometry(), createFakeMaterial("old"));
  source.add(createFakeMesh(createFakeGeometry(), createFakeMaterial("child")));

  const material = createFakeMaterial("prepared");
  const clone = requireFakeMesh(clonePreparedThreeObject(source, { scale: 0.5, castShadow: true, receiveShadow: true, material }));
  const child = requireFakeMesh(clone.children[0]);

  expect(clone).not.toBe(source);
  expect(clone.scale).toMatchObject({ x: 0.5, y: 0.5, z: 0.5 });
  expect(clone.castShadow).toBe(true);
  expect(clone.receiveShadow).toBe(true);
  expect(clone.material).toBe(material);
  expect(child.castShadow).toBe(true);
  expect(child.material).toBe(material);
});

test("Three resource cache reuses and disposes keyed resources", () => {
  const cache = createThreeResourceCache<FakeMaterial>();
  const first = cache.get("spark", () => createFakeMaterial("spark"));
  const reused = cache.get("spark", () => createFakeMaterial("other"));

  expect(reused).toBe(first);
  expect(cache.size).toBe(1);

  const replacement = createFakeMaterial("replacement");
  cache.set("spark", replacement);
  expect(first.disposed).toBe(true);
  expect(cache.peek("spark")).toBe(replacement);

  expect(cache.delete("spark")).toBe(true);
  expect(replacement.disposed).toBe(true);
  expect(cache.delete("spark")).toBe(false);

  const left = cache.set("left", createFakeMaterial("left"));
  const right = cache.set("right", createFakeMaterial("right"));
  cache.clear();
  expect(left.disposed).toBe(true);
  expect(right.disposed).toBe(true);
  expect(cache.size).toBe(0);
});

test("createToroidalWorld3D wraps 3D positions inside width and depth", () => {
  const world = createToroidalWorld3D({ width: 100, depth: 60, origin: [-50, -30] });

  expect(world.wrapPosition([55, 2, -31])).toEqual([-45, 2, 29]);
  expect(world.wrapPosition([-151, -4, 91])).toEqual([49, -4, -29]);
  expect(world.wrapXZ(50, 30)).toEqual([-50, -30]);
});

test("createToroidalWorld3D computes shortest toroidal deltas", () => {
  const world = createToroidalWorld3D({ width: 100, depth: 60, origin: [-50, -30] });

  expect(world.shortestDelta([48, 1, 0], [-48, 3, 0])).toEqual([4, 2, 0]);
  expect(world.shortestDelta([0, 1, 28], [0, 4, -27])).toEqual([0, 3, 5]);
  expect(world.shortestDelta([0, 0, 0], [50, 0, 30])).toEqual([50, 0, 30]);
  expect(world.shortestDelta([0, 0, 0], [-50, 0, -30])).toEqual([-50, 0, -30]);
});

test("createToroidalWorld3D returns duplicate offsets for edge viewing", () => {
  const world = createToroidalWorld3D({ width: 100, depth: 60, origin: [-50, -30] });

  expect(world.visibleDuplicateOffsets([-48, 0, 28], 6)).toEqual([
    [0, 0, 60],
    [-100, 0, 0],
    [-100, 0, 60],
  ]);
  expect(world.visibleDuplicateOffsets([52, 0, -32], 6, { includeOrigin: true })).toEqual([
    [0, 0, 0],
    [0, 0, 60],
    [-100, 0, 0],
    [-100, 0, 60],
  ]);
  expect(world.visibleDuplicateOffsets([0, 0, 0], 6)).toEqual([]);
});

test("createToroidalWorld3D validates finite positive bounds", () => {
  expect(() => createToroidalWorld3D({ width: 0, depth: 60 })).toThrow("width");
  expect(() => createToroidalWorld3D({ width: 100, depth: Number.POSITIVE_INFINITY })).toThrow("depth");
  expect(() => createToroidalWorld3D({ width: 100, depth: 60 }).visibleDuplicateOffsets([0, 0, 0], -1)).toThrow("view radius");
});
