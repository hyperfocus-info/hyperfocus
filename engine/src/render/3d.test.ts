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
  type ThreeLikeGeometry,
  type ThreeLikeMaterial,
  type ThreeLikeObject3D,
  type ThreeModuleLike
} from "./3d.ts";

class FakeVector3 {
  x = 0;
  y = 0;
  z = 0;

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

class FakeObject3D {
  isMesh = false;
  position = new FakeVector3();
  rotation = { x: 0, y: 0, z: 0 };
  scale = new FakeScale();
  visible = true;
  frustumCulled = true;
  castShadow = false;
  receiveShadow = false;
  children: FakeObject3D[] = [];
  matrixUpdates = 0;

  add(...objects: FakeObject3D[]) {
    this.children.push(...objects);
  }

  remove(...objects: FakeObject3D[]) {
    this.children = this.children.filter((child) => !objects.includes(child));
  }

  updateMatrix() {
    this.matrixUpdates += 1;
  }

  traverse(visit: (object: FakeObject3D) => void) {
    visit(this);
    for (const child of this.children) child.traverse(visit);
  }

  clone() {
    const copy = new FakeObject3D();
    copy.position.set(this.position.x, this.position.y, this.position.z);
    copy.rotation = { ...this.rotation };
    copy.scale.set(this.scale.x, this.scale.y, this.scale.z);
    copy.children = this.children.map((child) => child.clone());
    return copy;
  }
}

class FakeScene extends FakeObject3D {
  background: unknown;
  fog: unknown;
}

class FakeCamera extends FakeObject3D {
  aspect: number;
  fov: number;
  near: number;
  far: number;
  target = new FakeVector3();

  constructor(fov = 55, aspect = 1, near = 0.1, far = 1000) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }

  lookAt(x: number, y: number, z: number) {
    this.target.set(x, y, z);
  }

  updateProjectionMatrix() {}
}

class FakeOrthographicCamera extends FakeCamera {
  left: number;
  right: number;
  top: number;
  bottom: number;

  constructor(left: number, right: number, top: number, bottom: number, near: number, far: number) {
    super(55, 1, near, far);
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
  }
}

class FakeRenderer {
  domElement = { width: 320, height: 180, clientWidth: 320, clientHeight: 180 } as HTMLCanvasElement;
  shadowMap = { enabled: false };
  pixelRatio = 1;
  renders = 0;
  disposed = false;

  setPixelRatio(value: number) {
    this.pixelRatio = value;
  }

  setSize(width: number, height: number) {
    this.domElement.width = width;
    this.domElement.height = height;
  }

  setClearColor() {}

  render() {
    this.renders += 1;
  }

  dispose() {
    this.disposed = true;
  }
}

class FakeStyle {
  position = "";
  pointerEvents = "";
  willChange = "";
  color = "";
  display = "";
  left = "";
  top = "";
  fontSize = "";
  opacity = "";
  transform = "";
  properties = new Map<string, string>();

  setProperty(name: string, value: string) {
    this.properties.set(name, value);
  }
}

class FakeElement {
  className = "";
  textContent: string | null = null;
  style = new FakeStyle();
  ownerDocument: { defaultView: { innerWidth: number; innerHeight: number }; createElement: () => FakeElement };
  clientWidth = 0;
  clientHeight = 0;
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  removed = false;

  constructor() {
    this.ownerDocument = {
      defaultView: { innerWidth: 320, innerHeight: 180 },
      createElement: () => new FakeElement(),
    };
  }

  append(element: FakeElement) {
    element.parent = this;
    this.children.push(element);
  }

  remove() {
    this.removed = true;
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

class FakeLight extends FakeObject3D {
  constructor(
    public color: unknown,
    public intensity = 1,
  ) {
    super();
  }
}

class FakePointLight extends FakeLight {
  constructor(color: unknown, intensity = 1, public distance = 0, public decay = 1) {
    super(color, intensity);
  }
}

class FakeGeometry implements ThreeLikeGeometry {
  disposed = false;

  dispose() {
    this.disposed = true;
  }
}

class FakeMaterial implements ThreeLikeMaterial {
  constructor(public id: string, public options: Record<string, unknown> = {}) {}
  disposed = false;

  dispose() {
    this.disposed = true;
  }
}

class FakeBoxGeometry extends FakeGeometry {
  constructor(public width = 1, public height = 1, public depth = 1) {
    super();
  }
}

class FakeSphereGeometry extends FakeGeometry {
  constructor(public radius = 1) {
    super();
  }
}

class FakeMesh extends FakeObject3D {
  isMesh = true;

  constructor(public geometry: ThreeLikeGeometry, public material: ThreeLikeMaterial) {
    super();
  }

  clone() {
    const copy = new FakeMesh(this.geometry, this.material);
    copy.position.set(this.position.x, this.position.y, this.position.z);
    copy.rotation = { ...this.rotation };
    copy.scale.set(this.scale.x, this.scale.y, this.scale.z);
    copy.children = this.children.map((child) => child.clone());
    return copy;
  }
}

class FakeMatrix4 {
  elements: number[] = [];

  fromArray(values: ArrayLike<number>, offset = 0) {
    this.elements = Array.from({ length: 16 }, (_, index) => values[offset + index] ?? 0);
  }
}

class FakeInstancedMesh extends FakeObject3D {
  instanceMatrix = {
    needsUpdate: false,
    usage: undefined as unknown,
    setUsage(usage: unknown) {
      this.usage = usage;
    },
  };
  matrices: number[][] = [];

  constructor(
    public geometry: ThreeLikeGeometry,
    public material: ThreeLikeMaterial,
    public count: number,
  ) {
    super();
  }

  setMatrixAt(index: number, matrix: FakeMatrix4) {
    this.matrices[index] = [...matrix.elements];
  }
}

class FakeDataTexture {
  colorSpace: unknown;
  needsUpdate = false;

  constructor(public data: Uint8Array, public width: number, public height: number) {}
}

class FakeAnimationAction {
  played = false;
  stopped = false;

  reset() {
    return this;
  }

  play() {
    this.played = true;
    return this;
  }

  stop() {
    this.stopped = true;
    return this;
  }

  fadeIn() {
    return this;
  }

  fadeOut() {
    return this;
  }
}

class FakeAnimationMixer {
  updates: number[] = [];
  actions = new Map<string, FakeAnimationAction>();

  constructor(public root: ThreeLikeObject3D) {}

  clipAction(clip: { name: string }) {
    let action = this.actions.get(clip.name);
    if (!action) {
      action = new FakeAnimationAction();
      this.actions.set(clip.name, action);
    }
    return action;
  }

  update(dt: number) {
    this.updates.push(dt);
  }

  stopAllAction() {}
}

function createFakeThree() {
  return {
    WebGLRenderer: FakeRenderer,
    Scene: FakeScene,
    Group: FakeObject3D,
    PerspectiveCamera: FakeCamera,
    OrthographicCamera: FakeOrthographicCamera,
    Color: class {
      r = 1;
      g = 1;
      b = 1;

      constructor(public color: unknown) {
        if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return;
        this.r = Number.parseInt(color.slice(1, 3), 16) / 255;
        this.g = Number.parseInt(color.slice(3, 5), 16) / 255;
        this.b = Number.parseInt(color.slice(5, 7), 16) / 255;
      }
    },
    AmbientLight: FakeLight,
    HemisphereLight: class extends FakeLight {
      constructor(public skyColor: unknown, public groundColor: unknown, intensity = 1) {
        super(skyColor, intensity);
      }
    },
    DirectionalLight: FakeLight,
    PointLight: FakePointLight,
    BoxGeometry: FakeBoxGeometry,
    SphereGeometry: FakeSphereGeometry,
    Mesh: FakeMesh,
    InstancedMesh: FakeInstancedMesh,
    Matrix4: FakeMatrix4,
    MeshBasicMaterial: class extends FakeMaterial {
      constructor(options: Record<string, unknown> = {}) {
        super("basic", options);
      }
    },
    MeshStandardMaterial: class extends FakeMaterial {
      constructor() {
        super("standard");
      }
    },
    DataTexture: FakeDataTexture,
    AnimationMixer: FakeAnimationMixer,
    SRGBColorSpace: "srgb",
    BackSide: "back",
    DynamicDrawUsage: "dynamic",
    StaticDrawUsage: "static",
  } satisfies ThreeModuleLike;
}

function countBufferGeometryTriangles(geometry: THREE.BufferGeometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3);
}

test("createThirdPersonCameraRig3D orbits around a target and applies to a camera", () => {
  const camera = new FakeCamera();
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
  const camera = new FakeCamera();
  const container = new FakeElement();
  const projectedY: number[] = [];
  const layer = createThreeWorldTextOverlay3D({
    container: container as unknown as HTMLElement,
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
    createElement: () => new FakeElement() as unknown as HTMLElement,
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
  }) as unknown as FakeElement;

  layer.update(0);
  expect(layer.size).toBe(1);
  expect(container.children).toEqual([element]);
  expect(element.className).toBe("float-text");
  expect(element.textContent).toBe("28");
  expect(element.style.left).toBe("120px");
  expect(element.style.top).toBe("30px");
  expect(element.style.fontSize).toBe("10px");
  expect(element.style.opacity).toBe("1");
  expect(element.style.transform).toBe("translate(-50%, -50%) translateY(0px) scale(1)");
  expect(element.style.properties.get("--float-color")).toBe("#ffd782");

  layer.update(0.5);
  expect(projectedY).toEqual([4, 6]);
  expect(element.style.opacity).toBe("0.5");
  expect(element.style.transform).toBe("translate(-50%, -50%) translateY(-5px) scale(1.1)");

  layer.update(0.5);
  expect(layer.size).toBe(0);
  expect(element.removed).toBe(true);
});

test("createThreeRender3D renders registered meshes and instanced batches", async () => {
  const THREE = createFakeThree();
  const view = await createThreeRender3D({ three: THREE, width: 640, height: 360, pixelRatioCap: 1.5, shadows: true });
  const geometry = new FakeGeometry();
  const material = new FakeMaterial("tree");
  const ghost = new FakeMaterial("ghost");
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

  const renderer = view.renderer as FakeRenderer;
  const callRoot = view.scene.children?.[0] as FakeObject3D;
  const lightRoot = view.scene.children?.[1] as FakeObject3D;
  const mesh = callRoot.children[0] as FakeMesh;
  const batch = callRoot.children[1] as FakeInstancedMesh;

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
  const reusedMesh = callRoot.children[0] as FakeMesh;
  expect(secondResult.calls).toBe(1);
  expect(reusedMesh).toBe(firstMeshObject);
  expect(reusedMesh.position.x).toBe(5);
  expect(callRoot.children[1].visible).toBe(false);
});

test("createThreeRender3D guards unknown mesh and material ids", async () => {
  const view = await createThreeRender3D({ three: createFakeThree() });
  view.registerMesh("hero", { geometry: new FakeGeometry() });

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
    return new FakeMaterial(`tree-${ratio}`);
  });
  const reused = cache.get("tree", 0.5, () => new FakeMaterial("miss"));

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
    THREE: THREE as unknown as Pick<ThreeModuleLike, "BufferGeometry" | "BufferAttribute">,
    ratio: 0.25,
    targetError: 1,
    computeVertexNormals: true,
  });

  expect(simplified).not.toBe(source);
  expect(countBufferGeometryTriangles(simplified)).toBeLessThan(beforeTriangles);
  expect(simplified.getAttribute("position").count).toBeLessThan(source.getAttribute("position").count);
  expect(simplified.getAttribute("uv")).toBeTruthy();
  expect(simplified.getAttribute("normal")).toBeTruthy();
});

test("splitThreeInstanceBatchByLod groups matrices by selected LOD mesh", () => {
  const matrices = new Float32Array(16 * 3);
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
  expect(Array.from(batches[1].matrices as Float32Array).slice(12, 15)).toEqual([20, 0, 0]);
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
  view.registerMesh("spark", { geometry: new FakeGeometry(), material: new FakeMaterial("spark") });
  const matrices = new Float32Array(16 * 4);
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
  const callRoot = view.scene.children?.[0] as FakeObject3D;
  const firstBatch = callRoot.children[0] as FakeInstancedMesh;

  view.render({
    calls: [{ kind: "instanceBatch", mesh: "spark", matrices, count: 2, capacity: 8, usage: "dynamic", culling: "none" }],
  });
  const reusedBatch = callRoot.children[0] as FakeInstancedMesh;

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
  const root = new FakeObject3D();
  const animation = view.createAnimationController(root, [{ name: "idle" }, { name: "run" }], { initial: "idle" });

  expect(animation.current).toBe("idle");
  expect(animation.play("run")).toBe(true);
  animation.update(0.16);
  expect(animation.current).toBe("run");
  expect((animation.mixer as FakeAnimationMixer).updates).toEqual([0.16]);

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
  const texture = createSolidThreeTexture(THREE, "#336699", { colorSpace: "srgb" }) as FakeDataTexture;
  expect(Array.from(texture.data)).toEqual([51, 102, 153, 255]);
  expect(texture.colorSpace).toBe("srgb");
  expect(texture.needsUpdate).toBe(true);

  const material = new FakeMaterial("skin");
  const root = new FakeObject3D();
  const mesh = new FakeMesh(new FakeGeometry(), new FakeMaterial("old"));
  root.add(mesh);
  prepareThreeObject3D(root, { castShadow: true, receiveShadow: true, material });

  expect(root.castShadow).toBe(false);
  expect(mesh.castShadow).toBe(true);
  expect(mesh.receiveShadow).toBe(true);
  expect(mesh.material).toBe(material);
});

test("createThreeSkybox3D creates inward non-culled texture dome", () => {
  const THREE = createFakeThree();
  const texture = new FakeDataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const skybox = createThreeSkybox3D(THREE, { texture, radius: 120, segments: 24 });
  const mesh = skybox as FakeMesh & { renderOrder?: number };

  expect(skybox.name).toBe("skybox");
  expect(skybox.frustumCulled).toBe(false);
  expect((mesh.geometry as FakeSphereGeometry).radius).toBe(120);
  expect((mesh.material as FakeMaterial).options).toMatchObject({
    map: texture,
    side: "back",
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  expect(mesh.renderOrder).toBe(-1000);
});

test("prepared Three clones apply scale and mesh preparation", () => {
  const source = new FakeMesh(new FakeGeometry(), new FakeMaterial("old"));
  source.add(new FakeMesh(new FakeGeometry(), new FakeMaterial("child")));

  const material = new FakeMaterial("prepared");
  const clone = clonePreparedThreeObject(source, { scale: 0.5, castShadow: true, receiveShadow: true, material }) as FakeMesh;
  const child = clone.children[0] as FakeMesh;

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
  const first = cache.get("spark", () => new FakeMaterial("spark"));
  const reused = cache.get("spark", () => new FakeMaterial("other"));

  expect(reused).toBe(first);
  expect(cache.size).toBe(1);

  const replacement = new FakeMaterial("replacement");
  cache.set("spark", replacement);
  expect(first.disposed).toBe(true);
  expect(cache.peek("spark")).toBe(replacement);

  expect(cache.delete("spark")).toBe(true);
  expect(replacement.disposed).toBe(true);
  expect(cache.delete("spark")).toBe(false);

  const left = cache.set("left", new FakeMaterial("left"));
  const right = cache.set("right", new FakeMaterial("right"));
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
