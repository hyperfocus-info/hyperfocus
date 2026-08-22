import * as THREE from "three";
import { MeshoptSimplifier } from "meshoptimizer";

export type ThreeRender3DBackend = "webgl2" | "webgl1" | "webgpu-auto";
export type ThreeRender3DColor = string | number;
export type ThreeRender3DVector3 = readonly [number, number, number];
export type ThreeRender3DVector3Like = ThreeRender3DVector3 | Pick<ThreeLikeVector3, "x" | "y" | "z">;

export type ThreeLikeVector3 = {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
};

export type ThreeProjectableVector3 = ThreeLikeVector3 & {
  project(camera: ThreeLikeCamera): ThreeProjectableVector3;
};

export type ThreeLikeEuler = {
  x: number;
  y: number;
  z: number;
};

export type ThreeLikeScale = {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
  setScalar?(value: number): unknown;
};

export type ThreeLikeObject3D = {
  name?: string;
  position: ThreeLikeVector3;
  rotation: ThreeLikeEuler;
  scale: ThreeLikeScale;
  visible: boolean;
  frustumCulled?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  matrixAutoUpdate?: boolean;
  children?: ThreeLikeObject3D[];
  add(...objects: ThreeLikeObject3D[]): unknown;
  remove(...objects: ThreeLikeObject3D[]): unknown;
  updateMatrix?(): unknown;
};

export type ThreeLikeScene = ThreeLikeObject3D & {
  background?: unknown;
  fog?: unknown;
};

export type ThreeLikeCamera = ThreeLikeObject3D & {
  aspect?: number;
  fov?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  near: number;
  far: number;
  lookAt(x: number, y: number, z: number): unknown;
  updateProjectionMatrix(): unknown;
};

export type ThreeLikeRenderer = {
  domElement?: HTMLCanvasElement;
  outputColorSpace?: unknown;
  shadowMap?: { enabled?: boolean };
  setPixelRatio(value: number): unknown;
  setSize(width: number, height: number, updateStyle?: boolean): unknown;
  setClearColor?(color: unknown, alpha?: number): unknown;
  render(scene: ThreeLikeScene, camera: ThreeLikeCamera): unknown;
  dispose(): unknown;
};

export type ThreeLikeMatrix4 = {
  elements?: ArrayLike<number>;
  fromArray(values: ArrayLike<number>, offset?: number): unknown;
};

export type ThreeLikeInstancedMesh = ThreeLikeObject3D & {
  count: number;
  instanceMatrix?: { needsUpdate?: boolean; setUsage?(usage: unknown): unknown };
  setMatrixAt(index: number, matrix: ThreeLikeMatrix4): unknown;
};

export type ThreeLikeMaterial = object & {
  dispose?(): unknown;
};

export type ThreeLikeGeometry = object & {
  dispose?(): unknown;
};

export type ThreeLikeBufferAttribute = {
  array: ArrayLike<number>;
  itemSize: number;
  count: number;
  normalized?: boolean;
  isInterleavedBufferAttribute?: boolean;
};

export type ThreeLikeBufferGeometryGroup = {
  start: number;
  count: number;
  materialIndex?: number;
};

export type ThreeLikeBufferGeometry = ThreeLikeGeometry & {
  attributes?: Record<string, ThreeLikeBufferAttribute | undefined>;
  index?: ThreeLikeBufferAttribute | null;
  groups?: ThreeLikeBufferGeometryGroup[];
  getAttribute?(name: string): ThreeLikeBufferAttribute | undefined;
  getIndex?(): ThreeLikeBufferAttribute | null;
  setAttribute?(name: string, attribute: ThreeLikeBufferAttribute): unknown;
  setIndex?(index: ThreeLikeBufferAttribute | ArrayLike<number> | null): unknown;
  addGroup?(start: number, count: number, materialIndex?: number): unknown;
  clearGroups?(): unknown;
  clone?(): ThreeLikeBufferGeometry;
  computeVertexNormals?(): unknown;
  computeBoundingBox?(): unknown;
  computeBoundingSphere?(): unknown;
};

export type ThreeLikeBufferAttributeConstructor = new (
  array: ArrayLike<number>,
  itemSize: number,
  normalized?: boolean,
) => ThreeLikeBufferAttribute;

export type ThreeLikeBufferGeometryConstructor = new () => ThreeLikeBufferGeometry;

export type ThreeLikeColor = {
  r: number;
  g: number;
  b: number;
};

export type ThreeLikeTexture = object & {
  colorSpace?: unknown;
  needsUpdate?: boolean;
  dispose?(): unknown;
};

export type ThreeLikeAnimationClip = {
  name: string;
};

export type ThreeLikeAnimationAction = {
  reset(): ThreeLikeAnimationAction;
  play(): ThreeLikeAnimationAction;
  stop(): ThreeLikeAnimationAction;
  fadeIn?(duration: number): ThreeLikeAnimationAction;
  fadeOut?(duration: number): ThreeLikeAnimationAction;
  setEffectiveTimeScale?(value: number): ThreeLikeAnimationAction;
  setEffectiveWeight?(value: number): ThreeLikeAnimationAction;
};

export type ThreeLikeAnimationMixer = {
  clipAction(clip: ThreeLikeAnimationClip, root?: ThreeLikeObject3D): ThreeLikeAnimationAction;
  update(dt: number): unknown;
  stopAllAction?(): unknown;
};

export type ThreeLikeLoadingManager = {
  setURLModifier?(modifier: (url: string) => string): unknown;
};

export type ThreeModuleLike = {
  WebGLRenderer: new (options?: Record<string, unknown>) => ThreeLikeRenderer;
  Scene: new () => ThreeLikeScene;
  Group: new () => ThreeLikeObject3D;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => ThreeLikeCamera;
  OrthographicCamera: new (left: number, right: number, top: number, bottom: number, near: number, far: number) => ThreeLikeCamera;
  Color: new (color: ThreeRender3DColor) => unknown;
  AmbientLight: new (color: ThreeRender3DColor, intensity?: number) => ThreeLikeObject3D;
  HemisphereLight: new (skyColor: ThreeRender3DColor, groundColor: ThreeRender3DColor, intensity?: number) => ThreeLikeObject3D;
  DirectionalLight: new (color: ThreeRender3DColor, intensity?: number) => ThreeLikeObject3D;
  PointLight: new (color: ThreeRender3DColor, intensity?: number, distance?: number, decay?: number) => ThreeLikeObject3D;
  Vector3?: new (x?: number, y?: number, z?: number) => ThreeProjectableVector3;
  BufferAttribute?: ThreeLikeBufferAttributeConstructor;
  BufferGeometry?: ThreeLikeBufferGeometryConstructor;
  BoxGeometry?: new (width?: number, height?: number, depth?: number) => ThreeLikeGeometry;
  SphereGeometry?: new (radius?: number, widthSegments?: number, heightSegments?: number) => ThreeLikeGeometry;
  Mesh: new (geometry: ThreeLikeGeometry, material: ThreeLikeMaterial) => ThreeLikeObject3D;
  InstancedMesh: new (geometry: ThreeLikeGeometry, material: ThreeLikeMaterial, count: number) => ThreeLikeInstancedMesh;
  Matrix4: new () => ThreeLikeMatrix4;
  MeshBasicMaterial: new (options?: Record<string, unknown>) => ThreeLikeMaterial;
  MeshStandardMaterial?: new (options?: Record<string, unknown>) => ThreeLikeMaterial;
  DataTexture?: new (data: Uint8Array, width: number, height: number) => ThreeLikeTexture;
  AnimationMixer?: new (root: ThreeLikeObject3D) => ThreeLikeAnimationMixer;
  SRGBColorSpace?: unknown;
  BackSide?: unknown;
  DynamicDrawUsage?: unknown;
  StaticDrawUsage?: unknown;
};

export type ThreeSkybox3DOptions = {
  radius?: number;
  segments?: number;
  name?: string;
  texture?: ThreeLikeTexture;
  color?: ThreeRender3DColor;
  renderOrder?: number;
};

export type ThreeRender3DConfig = {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  backend?: ThreeRender3DBackend;
  pixelRatioCap?: number;
  width?: number;
  height?: number;
  antialias?: boolean;
  alpha?: boolean;
  clearColor?: ThreeRender3DColor;
  clearAlpha?: number;
  shadows?: boolean;
  three?: ThreeModuleLike;
  threeModuleUrl?: string;
};

export type ThreeRender3DMeshDefinition = {
  geometry: ThreeLikeGeometry;
  material?: ThreeLikeMaterial;
};

export type ThreeRender3DTransform = {
  position?: ThreeRender3DVector3;
  rotation?: ThreeRender3DVector3;
  rotationY?: number;
  scale?: number | ThreeRender3DVector3;
};

export type ThreeRender3DCamera =
  | {
      kind: "perspective";
      position: ThreeRender3DVector3;
      target: ThreeRender3DVector3;
      fov?: number;
      near?: number;
      far?: number;
    }
  | {
      kind: "orthographic";
      position: ThreeRender3DVector3;
      target: ThreeRender3DVector3;
      size: number;
      near?: number;
      far?: number;
    };

export type ThreeRender3DLight =
  | { kind: "ambient"; color: ThreeRender3DColor; intensity?: number }
  | { kind: "hemisphere"; skyColor: ThreeRender3DColor; groundColor: ThreeRender3DColor; intensity?: number }
  | { kind: "directional"; color?: ThreeRender3DColor; direction: ThreeRender3DVector3; intensity?: number }
  | { kind: "point"; color?: ThreeRender3DColor; position: ThreeRender3DVector3; intensity?: number; distance?: number; decay?: number };

export type ThreeRender3DMeshCall = {
  kind: "mesh";
  mesh: string;
  material?: string | ThreeLikeMaterial;
  transform?: ThreeRender3DTransform;
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
};

export type ThreeRender3DMatrixLike = {
  elements: ArrayLike<number>;
};

export type ThreeRender3DInstanceMatrices = ArrayLike<number> | ArrayLike<ArrayLike<number> | ThreeRender3DMatrixLike>;

export type ThreeRender3DInstanceBatchCall = {
  kind: "instanceBatch";
  mesh: string;
  material?: string | ThreeLikeMaterial;
  matrices: ThreeRender3DInstanceMatrices;
  count?: number;
  capacity?: number;
  usage?: "static" | "dynamic";
  culling?: "default" | "none";
  transform?: ThreeRender3DTransform;
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
};

export type ThreeRender3DCall = ThreeRender3DMeshCall | ThreeRender3DInstanceBatchCall;

export type ThreeRender3DLodLevel = {
  maxDistance: number;
  ratio?: number;
  mesh?: string;
  material?: string | ThreeLikeMaterial;
};

export type ThreeRender3DResolvedLodLevel = {
  index: number;
  maxDistance: number;
  ratio: number;
  mesh?: string;
  material?: string | ThreeLikeMaterial;
};

export type ThreeRender3DInstancePositions = ArrayLike<number> | ArrayLike<ThreeRender3DVector3>;

export type ThreeRender3DLodSplitOptions = {
  camera: ThreeRender3DVector3Like;
  levels: readonly ThreeRender3DLodLevel[];
  positions?: ThreeRender3DInstancePositions;
};

export type ThreeRender3DLodBatchCall = ThreeRender3DInstanceBatchCall & {
  lodIndex: number;
  lodRatio: number;
  lodMaxDistance: number;
};

export type ThreeRender3DLodPolicy = {
  levels: readonly ThreeRender3DResolvedLodLevel[];
  select(distance: number): ThreeRender3DResolvedLodLevel;
};

export type ThreeRender3DLodBakeRequest = {
  sourceKey: string;
  ratio: number;
};

export type ThreeRender3DLodBakeCache<TResource extends ThreeDisposableResource = ThreeDisposableResource> = {
  readonly size: number;
  has(sourceKey: string, ratio: number): boolean;
  get(sourceKey: string, ratio: number, bake: (request: ThreeRender3DLodBakeRequest) => TResource): TResource;
  delete(sourceKey: string, ratio: number): boolean;
  clear(): void;
};

export type ThreeBufferGeometrySimplifyOptions = {
  THREE?: Pick<ThreeModuleLike, "BufferGeometry" | "BufferAttribute">;
  ratio: number;
  targetError?: number;
  lockBorder?: boolean;
  minTriangles?: number;
  preserveGroups?: boolean;
  attributes?: readonly string[];
  computeVertexNormals?: boolean;
  computeBounds?: boolean;
};

export type ThreeRender3DFrame = {
  camera?: ThreeRender3DCamera;
  lights?: readonly ThreeRender3DLight[];
  calls?: readonly ThreeRender3DCall[];
};

export type ThreeRender3DRenderResult = {
  calls: number;
  lights: number;
  backend: ThreeRender3DBackend;
};

export type ThreeRender3DAnimationController = {
  mixer: ThreeLikeAnimationMixer;
  clips: ReadonlyMap<string, ThreeLikeAnimationClip>;
  current: string | null;
  play(name: string, options?: { fadeSeconds?: number; timeScale?: number; weight?: number }): boolean;
  update(dt: number): void;
  stop(): void;
};

export type ThreeRender3DRagdollPartConfig = {
  name?: string;
  kind?: "box" | "sphere";
  size?: ThreeRender3DVector3;
  radius?: number;
  offset: ThreeRender3DVector3;
  mass?: number;
};

export type ThreeRender3DRagdollConfig = {
  position: ThreeRender3DVector3;
  incomingForce?: ThreeRender3DVector3;
  scale?: number;
  material?: ThreeLikeMaterial;
  color?: ThreeRender3DColor;
  ttl?: number;
  gravity?: number;
  floorY?: number;
  bounce?: number;
  spread?: number;
  parts?: readonly ThreeRender3DRagdollPartConfig[];
};

export type ThreeRender3DRagdollController = {
  root: ThreeLikeObject3D;
  age: number;
  ttl: number;
  update(dt: number): boolean;
};

export type ThreeAssetLoader<TAsset> = {
  load(
    url: string,
    onLoad: (asset: TAsset) => void,
    onProgress?: ((event: unknown) => void) | undefined,
    onError?: ((error: unknown) => void) | undefined,
  ): unknown;
};

export type ThreeLoadAssetOptions<TAsset> = {
  encodeUrl?: boolean;
  prepare?: (asset: TAsset, path: string) => TAsset | Promise<TAsset>;
  onProgress?: (event: unknown, path: string) => void;
};

export type ThreeLoadFirstAssetOptions<TAsset> = {
  fallback?: TAsset | (() => TAsset | Promise<TAsset>);
  onError?: (error: unknown, path: string) => void;
};

export type ThreePrepareObjectOptions<TObject extends ThreeLikeObject3D = ThreeLikeObject3D> = {
  castShadow?: boolean;
  receiveShadow?: boolean;
  material?: ThreeLikeMaterial | ThreeLikeMaterial[] | ((object: TObject) => ThreeLikeMaterial | ThreeLikeMaterial[] | undefined);
  predicate?: (object: TObject) => boolean;
  onObject?: (object: TObject) => void;
};

export type ThreeCloneObjectOptions<TObject extends ThreeLikeObject3D = ThreeLikeObject3D> =
  ThreePrepareObjectOptions<TObject> & {
    /** Overrides Object3D.clone for skeleton-aware or otherwise specialized cloning. */
    clone?: (source: TObject) => TObject;
    recursive?: boolean;
    scale?: number | ThreeRender3DVector3;
  };

export type ThreeCloneableObject3D<TObject extends ThreeLikeObject3D = ThreeLikeObject3D> = TObject & {
  clone(recursive?: boolean): TObject;
};

export type ThreeDisposableResource = object & {
  dispose?(): unknown;
};

export type ThreeResourceCacheConfig<TResource extends ThreeDisposableResource> = {
  dispose?: (resource: TResource, key: string) => void;
};

export type ThreeResourceCache<TResource extends ThreeDisposableResource> = {
  readonly size: number;
  has(key: string): boolean;
  peek(key: string): TResource | undefined;
  set(key: string, resource: TResource): TResource;
  get(key: string, factory: (key: string) => TResource): TResource;
  delete(key: string): boolean;
  clear(): void;
};

export type ThreeRender3DToroidalWorldConfig = {
  width: number;
  depth: number;
  origin?: readonly [number, number];
};

export type ThreeRender3DToroidalDuplicateOffsetOptions = {
  includeOrigin?: boolean;
};

export type ThreeRender3DToroidalWorld = {
  width: number;
  depth: number;
  origin: readonly [number, number];
  wrapPosition(position: ThreeRender3DVector3): ThreeRender3DVector3;
  wrapXZ(x: number, z: number): readonly [number, number];
  shortestDelta(from: ThreeRender3DVector3, to: ThreeRender3DVector3): ThreeRender3DVector3;
  shortestDeltaXZ(from: readonly [number, number], to: readonly [number, number]): readonly [number, number];
  visibleDuplicateOffsets(viewer: ThreeRender3DVector3, viewRadius: number, options?: ThreeRender3DToroidalDuplicateOffsetOptions): ThreeRender3DVector3[];
};

export type ThreeBspTree3DItem<TValue> = {
  value: TValue;
  center: ThreeRender3DVector3;
  radius?: number;
};

export type ThreeBspTree3DConfig = {
  maxLeafItems?: number;
  maxDepth?: number;
};

export type ThreeBspTree3D<TValue> = {
  readonly size: number;
  rebuild(items: readonly ThreeBspTree3DItem<TValue>[]): ThreeBspTree3D<TValue>;
  clear(): void;
  querySphere(center: ThreeRender3DVector3, radius: number, out?: TValue[]): TValue[];
  queryBox(min: ThreeRender3DVector3, max: ThreeRender3DVector3, out?: TValue[]): TValue[];
};

export interface CameraRigConfig {
  /** The local camera offset distance vector from the tracking pivot point */
  offset: THREE.Vector3;
  /** The position pointing offset relative to the tracking pivot representing final focus point */
  lookAtOffset: THREE.Vector3;
  /** The asymptotic damping intensity factor (lambda) for follow smoothness */
  influence: number;
  /** Spatial dimensions of target playfield when running on top of toroidal maps */
  worldSize?: THREE.Vector2 | null;
}

export interface CameraRig {
  /** Fluent registration of tracked world coordinate system position target */
  setTarget(pos: THREE.Vector3): CameraRig;
  /** Fluent coordinate displacement offset mapping adjustments */
  setOffset(x: number, y: number, z: number): CameraRig;
  /** Fluent coordinate focus offset mapping adjustments */
  setLookAtOffset(x: number, y: number, z: number): CameraRig;
  /** High performance pipeline execution called at physics update or late loop boundaries */
  update(dt: number, staticColliders?: THREE.Object3D[]): CameraRig;
  /** Appends relative high-frequency position offsets (such as screen shake) directly to calculation results */
  applyShake(x: number, y: number, z: number): CameraRig;
  /** Copies current target calculations securely without allocating new objects */
  getDesiredPosition(out: THREE.Vector3): THREE.Vector3;
}

export type ThreeWorldTextOverlayViewport = {
  width: number;
  height: number;
};

export type ThreeWorldTextOverlayProjection = {
  x: number;
  y: number;
  z?: number;
  distance?: number;
  visible?: boolean;
};

export type ThreeWorldTextOverlayProjectQuery = {
  position: ThreeRender3DVector3;
  camera: ThreeLikeCamera;
  viewport: ThreeWorldTextOverlayViewport;
  age: number;
  progress: number;
};

export type ThreeWorldTextOverlaySpawn = {
  text: string;
  position: ThreeRender3DVector3;
  className?: string;
  color?: string;
  scale?: number;
  baseFontPx?: number;
  targetHeight?: number;
  lifeSeconds?: number;
  rise?: number;
  screenRisePx?: number;
  growScale?: number;
};

export type ThreeWorldTextOverlay3DConfig = {
  container: HTMLElement;
  camera: ThreeLikeCamera | (() => ThreeLikeCamera);
  THREE?: Pick<ThreeModuleLike, "Vector3">;
  vector?: ThreeProjectableVector3;
  viewport?: ThreeWorldTextOverlayViewport | (() => ThreeWorldTextOverlayViewport);
  className?: string;
  color?: string;
  baseFontPx?: number;
  targetHeight?: number;
  lifeSeconds?: number;
  rise?: number;
  screenRisePx?: number;
  growScale?: number;
  referenceDistance?: number;
  minDistanceScale?: number;
  maxDistanceScale?: number;
  createElement?: (spawn: ThreeWorldTextOverlaySpawn) => HTMLElement;
  resolvePosition?: (position: ThreeRender3DVector3) => ThreeRender3DVector3;
  project?: (query: ThreeWorldTextOverlayProjectQuery) => ThreeWorldTextOverlayProjection;
};

export type ThreeWorldTextOverlay3D = {
  readonly size: number;
  spawn(spawn: ThreeWorldTextOverlaySpawn): HTMLElement;
  update(deltaSeconds: number): void;
  clear(): void;
};

export type ThreeCameraRig3DSmoothing = {
  follow?: number;
  rotation?: number;
  distance?: number;
  collision?: number;
};

export type ThreeCameraRig3DObstacle =
  | { kind: "sphere"; center: ThreeRender3DVector3; radius: number }
  | { kind: "aabb"; min: ThreeRender3DVector3; max: ThreeRender3DVector3 };

export type ThreeCameraRig3DObstacleQuery = {
  target: ThreeRender3DVector3;
  desiredPosition: ThreeRender3DVector3;
  cameraRadius: number;
  minDistance: number;
  obstacles: readonly ThreeCameraRig3DObstacle[];
  state: ThreeCameraRig3DState;
  deltaSeconds: number;
};

export type ThreeCameraRig3DObstacleResult =
  | ThreeRender3DVector3
  | { position: ThreeRender3DVector3; blocked?: boolean };

export type ThreeCameraRig3DObstacleResolver = (query: ThreeCameraRig3DObstacleQuery) => ThreeCameraRig3DObstacleResult | null | undefined;

export type ThreeCameraRig3DCollisionConfig = {
  enabled?: boolean;
  radius?: number;
  minDistance?: number;
  obstacles?: readonly ThreeCameraRig3DObstacle[];
  resolver?: ThreeCameraRig3DObstacleResolver;
};

export type ThreeCameraRig3DPreset = {
  target?: ThreeRender3DVector3;
  targetOffset?: ThreeRender3DVector3;
  lookAtOffset?: ThreeRender3DVector3;
  shoulderOffset?: number;
  yaw?: number;
  pitch?: number;
  distance?: number;
  fov?: number;
};

export type ThreeCameraRig3DTransitionOptions = {
  duration?: number;
  easing?: (amount: number) => number;
};

export type ThreeCameraRig3DConfig = ThreeCameraRig3DPreset & {
  minPitch?: number;
  maxPitch?: number;
  minDistance?: number;
  maxDistance?: number;
  smoothing?: ThreeCameraRig3DSmoothing;
  collision?: ThreeCameraRig3DCollisionConfig;
};

export type ThreeCameraRig3DState = {
  target: ThreeRender3DVector3;
  lookAt: ThreeRender3DVector3;
  position: ThreeRender3DVector3;
  desiredPosition: ThreeRender3DVector3;
  yaw: number;
  pitch: number;
  distance: number;
  fov?: number;
  blocked: boolean;
};

export type ThreeCameraRig3DController = {
  setTarget(target: ThreeRender3DVector3): ThreeCameraRig3DController;
  setTargetOffset(offset: ThreeRender3DVector3): ThreeCameraRig3DController;
  setLookAtOffset(offset: ThreeRender3DVector3): ThreeCameraRig3DController;
  pan(offset: ThreeRender3DVector3): ThreeCameraRig3DController;
  setShoulderOffset(offset: number): ThreeCameraRig3DController;
  orbit(yawDelta: number, pitchDelta?: number): ThreeCameraRig3DController;
  setAngles(yaw: number, pitch: number): ThreeCameraRig3DController;
  setDistance(distance: number): ThreeCameraRig3DController;
  dolly(delta: number): ThreeCameraRig3DController;
  setFov(fov: number | undefined): ThreeCameraRig3DController;
  setSmoothing(smoothing: ThreeCameraRig3DSmoothing): ThreeCameraRig3DController;
  setObstacles(obstacles: readonly ThreeCameraRig3DObstacle[]): ThreeCameraRig3DController;
  setObstacleResolver(resolver: ThreeCameraRig3DObstacleResolver | undefined): ThreeCameraRig3DController;
  transitionTo(preset: ThreeCameraRig3DPreset, options?: ThreeCameraRig3DTransitionOptions): ThreeCameraRig3DController;
  queueTransition(preset: ThreeCameraRig3DPreset, options?: ThreeCameraRig3DTransitionOptions): ThreeCameraRig3DController;
  clearTransitions(): ThreeCameraRig3DController;
  snapTo(preset?: ThreeCameraRig3DPreset): ThreeCameraRig3DController;
  update(deltaSeconds: number): ThreeCameraRig3DController;
  applyToCamera(camera: ThreeLikeCamera): ThreeCameraRig3DController;
  snapshot(): ThreeCameraRig3DState;
};

type ThreeRender3DCallSlot = {
  key: string;
  object: ThreeLikeObject3D;
  matrix?: ThreeLikeMatrix4;
};

type ThreeWorldTextOverlayItemState = {
  element: HTMLElement;
  position: MutableVec3;
  age: number;
  lifeSeconds: number;
  targetHeight: number;
  rise: number;
  screenRisePx: number;
  scale: number;
  baseFontPx: number;
  growScale: number;
};

export type ThreeRender3DView = {
  THREE: ThreeModuleLike;
  backend: ThreeRender3DBackend;
  renderer: ThreeLikeRenderer;
  scene: ThreeLikeScene;
  camera: ThreeLikeCamera;
  registerMesh(id: string, definition: ThreeRender3DMeshDefinition): void;
  unregisterMesh(id: string): boolean;
  registerMaterial(id: string, material: ThreeLikeMaterial): void;
  unregisterMaterial(id: string): boolean;
  createAnimationController(root: ThreeLikeObject3D, clips: readonly ThreeLikeAnimationClip[], options?: { initial?: string; fadeSeconds?: number }): ThreeRender3DAnimationController;
  createRagdoll(config: ThreeRender3DRagdollConfig): ThreeRender3DRagdollController;
  render(frame?: ThreeRender3DFrame): ThreeRender3DRenderResult;
  resize(width: number, height: number): void;
  setPixelRatioCap(cap: number): void;
  loadAddon<TModule = unknown>(path: string): Promise<TModule>;
  dispose(): void;
};

const DEFAULT_THREE_MODULE_URL = "https://esm.sh/three@0.163.0";
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

export function createToroidalWorld3D(config: ThreeRender3DToroidalWorldConfig): ThreeRender3DToroidalWorld {
  const width = assertPositiveFinite(config.width, "toroidal world width");
  const depth = assertPositiveFinite(config.depth, "toroidal world depth");
  const origin = config.origin ?? [0, 0];
  const minX = assertFiniteNumber(origin[0], "toroidal world origin x");
  const minZ = assertFiniteNumber(origin[1], "toroidal world origin z");
  const maxX = minX + width;
  const maxZ = minZ + depth;

  return {
    width,
    depth,
    origin: [minX, minZ],
    wrapPosition(position) {
      const [x, z] = this.wrapXZ(position[0], position[2]);
      return [x, position[1], z];
    },
    wrapXZ(x, z) {
      return [wrapAxis(x, minX, width), wrapAxis(z, minZ, depth)];
    },
    shortestDelta(from, to) {
      const [x, z] = this.shortestDeltaXZ([from[0], from[2]], [to[0], to[2]]);
      return [x, to[1] - from[1], z];
    },
    shortestDeltaXZ(from, to) {
      return [
        shortestToroidalAxisDelta(to[0] - from[0], width),
        shortestToroidalAxisDelta(to[1] - from[1], depth),
      ];
    },
    visibleDuplicateOffsets(viewer, viewRadius, options = {}) {
      const radius = assertNonNegativeFinite(viewRadius, "toroidal world view radius");
      const [viewerX, viewerZ] = this.wrapXZ(viewer[0], viewer[2]);
      const xOffsets = [0];
      const zOffsets = [0];
      if (viewerX - radius < minX) xOffsets.push(-width);
      if (viewerX + radius >= maxX) xOffsets.push(width);
      if (viewerZ - radius < minZ) zOffsets.push(-depth);
      if (viewerZ + radius >= maxZ) zOffsets.push(depth);

      const offsets: ThreeRender3DVector3[] = [];
      for (const xOffset of xOffsets) {
        for (const zOffset of zOffsets) {
          if (!options.includeOrigin && xOffset === 0 && zOffset === 0) continue;
          offsets.push([xOffset, 0, zOffset]);
        }
      }
      return offsets;
    },
  };
}

export function createThreeLodPolicy(levels: readonly ThreeRender3DLodLevel[]): ThreeRender3DLodPolicy {
  const resolvedLevels = normalizeThreeLodLevels(levels);
  return {
    levels: resolvedLevels,
    select(distance) {
      return selectThreeLodLevel(resolvedLevels, distance);
    },
  };
}

export function selectThreeLodLevel(
  levels: readonly ThreeRender3DLodLevel[] | readonly ThreeRender3DResolvedLodLevel[],
  distance: number,
): ThreeRender3DResolvedLodLevel {
  const resolvedLevels = isResolvedLodLevelList(levels) ? levels : normalizeThreeLodLevels(levels);
  const normalizedDistance = assertNonNegativeFinite(distance, "3D LOD distance");
  return resolvedLevels.find((level) => normalizedDistance <= level.maxDistance) ?? resolvedLevels[resolvedLevels.length - 1];
}

export function createThreeLodBakeCache<TResource extends ThreeDisposableResource = ThreeDisposableResource>(
  config: ThreeResourceCacheConfig<TResource> = {},
): ThreeRender3DLodBakeCache<TResource> {
  const resources = new Map<string, TResource>();
  const dispose = (resource: TResource, key: string) => {
    if (config.dispose) config.dispose(resource, key);
    else resource.dispose?.();
  };
  return {
    get size() {
      return resources.size;
    },
    has(sourceKey, ratio) {
      return resources.has(lodBakeKey(sourceKey, ratio));
    },
    get(sourceKey, ratio, bake) {
      const key = lodBakeKey(sourceKey, ratio);
      const existing = resources.get(key);
      if (existing) return existing;
      const normalizedRatio = assertLodRatio(ratio, "3D LOD bake ratio");
      const resource = bake({ sourceKey, ratio: normalizedRatio });
      resources.set(key, resource);
      return resource;
    },
    delete(sourceKey, ratio) {
      const key = lodBakeKey(sourceKey, ratio);
      const resource = resources.get(key);
      if (!resource) return false;
      resources.delete(key);
      dispose(resource, key);
      return true;
    },
    clear() {
      for (const [key, resource] of resources) dispose(resource, key);
      resources.clear();
    },
  };
}

export async function simplifyThreeBufferGeometry<TGeometry extends ThreeLikeBufferGeometry>(
  geometry: TGeometry,
  options: ThreeBufferGeometrySimplifyOptions,
): Promise<TGeometry> {
  const ratio = assertLodRatio(options.ratio, "3D geometry LOD ratio");
  const constructors = resolveBufferGeometryConstructors(options.THREE);
  const position = getBufferGeometryAttribute(geometry, "position");
  if (!position) throw new Error("3D geometry simplification requires a position attribute");
  if (position.isInterleavedBufferAttribute) throw new Error("3D geometry simplification does not support interleaved position attributes");
  if (position.itemSize < 3) throw new Error("3D geometry position attribute must have at least 3 components");
  const sourceIndices = readGeometryIndices(geometry, position.count);
  const targetIndexCount = resolveSimplifiedIndexTarget(sourceIndices.length, ratio, options.minTriangles ?? 1);
  if (targetIndexCount >= sourceIndices.length) return cloneBufferGeometry(geometry);

  await MeshoptSimplifier.ready;
  const positions = readPositionArray(position);
  const flags = options.lockBorder ? ["LockBorder" as const] : undefined;
  const simplified = simplifyGeometryIndices(geometry, sourceIndices, positions, position.itemSize, targetIndexCount, options, flags);
  const compactIndices = new Uint32Array(simplified.indices);
  const [remap, uniqueVertexCount] = MeshoptSimplifier.compactMesh(compactIndices);
  const result = new constructors.BufferGeometry() as TGeometry;
  const indexArray = uniqueVertexCount > 65535 ? compactIndices : new Uint16Array(compactIndices);
  result.setIndex?.(new constructors.BufferAttribute(indexArray, 1));
  copySimplifiedAttributes(geometry, result, constructors.BufferAttribute, remap, uniqueVertexCount, options);
  copySimplifiedGroups(result, simplified.groups);
  if ((options.computeVertexNormals ?? Boolean(getBufferGeometryAttribute(geometry, "normal"))) && result.computeVertexNormals) {
    result.computeVertexNormals();
  }
  if (options.computeBounds ?? true) {
    result.computeBoundingBox?.();
    result.computeBoundingSphere?.();
  }
  return result;
}

export function splitThreeInstanceBatchByLod(
  call: ThreeRender3DInstanceBatchCall,
  options: ThreeRender3DLodSplitOptions,
): ThreeRender3DLodBatchCall[] {
  const policy = createThreeLodPolicy(options.levels);
  const camera = assertVec3Like(options.camera, "3D LOD camera");
  const count = call.count ?? inferMatrixCount(call.matrices);
  if (count < 0 || count > inferMatrixCount(call.matrices)) throw new Error("3D LOD instance count exceeds matrix count");
  const groups = policy.levels.map(() => [] as number[]);
  const groupCounts = policy.levels.map(() => 0);
  for (let index = 0; index < count; index += 1) {
    const matrix = resolveMatrixElements(call.matrices, index);
    const position = resolveInstanceLodPosition(options.positions, matrix, index);
    const dx = position[0] - camera[0];
    const dy = position[1] - camera[1];
    const dz = position[2] - camera[2];
    const level = policy.select(Math.hypot(dx, dy, dz));
    const group = groups[level.index];
    for (let elementIndex = 0; elementIndex < 16; elementIndex += 1) group.push(matrix[elementIndex] ?? 0);
    groupCounts[level.index] += 1;
  }
  const result: ThreeRender3DLodBatchCall[] = [];
  for (const level of policy.levels) {
    const countForLevel = groupCounts[level.index];
    if (countForLevel <= 0) continue;
    result.push({
      ...call,
      mesh: level.mesh ?? call.mesh,
      material: level.material ?? call.material,
      matrices: new Float32Array(groups[level.index]),
      count: countForLevel,
      capacity: countForLevel,
      lodIndex: level.index,
      lodRatio: level.ratio,
      lodMaxDistance: level.maxDistance,
    });
  }
  return result;
}

export function createThreeBspTree3D<TValue = unknown>(config: ThreeBspTree3DConfig = {}): ThreeBspTree3D<TValue> {
  const maxLeafItems = assertPositiveSafeInteger(config.maxLeafItems ?? 12, "3D BSP maxLeafItems");
  const maxDepth = assertPositiveSafeInteger(config.maxDepth ?? 18, "3D BSP maxDepth");
  let root: ThreeBspNode<TValue> | null = null;
  let itemCount = 0;
  const tree: ThreeBspTree3D<TValue> = {
    get size() {
      return itemCount;
    },
    rebuild(items) {
      const normalizedItems = items.map((item) => normalizeBspItem(item));
      itemCount = normalizedItems.length;
      root = normalizedItems.length ? buildBspNode(normalizedItems, 0, maxLeafItems, maxDepth) : null;
      return tree;
    },
    clear() {
      root = null;
      itemCount = 0;
    },
    querySphere(center, radius, out = []) {
      out.length = 0;
      const queryCenter = assertVec3(center, "3D BSP query sphere center");
      const queryRadius = assertNonNegativeFinite(radius, "3D BSP query sphere radius");
      if (root) queryBspSphere(root, queryCenter, queryRadius, out);
      return out;
    },
    queryBox(min, max, out = []) {
      out.length = 0;
      const queryMin = assertVec3(min, "3D BSP query box min");
      const queryMax = assertVec3(max, "3D BSP query box max");
      for (let axis = 0; axis < 3; axis += 1) {
        if (queryMax[axis] < queryMin[axis]) throw new Error("3D BSP query box max must be greater than or equal to min");
      }
      if (root) queryBspBox(root, queryMin, queryMax, out);
      return out;
    },
  };
  return tree;
}

export function createCameraRig(camera: THREE.Camera, config: CameraRigConfig): CameraRig {
  const offset = new THREE.Vector3().copy(config.offset);
  const lookAtOffset = new THREE.Vector3().copy(config.lookAtOffset);
  const target = new THREE.Vector3();
  const continuousTarget = new THREE.Vector3();
  const tracked = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const shake = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const hits: THREE.Intersection[] = [];
  const skin = 0.2;
  const influence = assertNonNegativeFinite(config.influence, "camera rig influence");
  const worldSize = config.worldSize ? new THREE.Vector2().copy(config.worldSize) : null;
  let hasTracked = false;

  const rig: CameraRig = {
    setTarget(pos) {
      target.copy(pos);
      if (!hasTracked) {
        tracked.copy(target);
        hasTracked = true;
      }
      return rig;
    },
    setOffset(x, y, z) {
      offset.set(
        assertFiniteNumber(x, "camera rig offset x"),
        assertFiniteNumber(y, "camera rig offset y"),
        assertFiniteNumber(z, "camera rig offset z"),
      );
      return rig;
    },
    setLookAtOffset(x, y, z) {
      lookAtOffset.set(
        assertFiniteNumber(x, "camera rig look-at offset x"),
        assertFiniteNumber(y, "camera rig look-at offset y"),
        assertFiniteNumber(z, "camera rig look-at offset z"),
      );
      return rig;
    },
    update(dt, staticColliders) {
      const deltaSeconds = Math.max(0, assertFiniteNumber(dt, "camera rig delta seconds"));
      const amount = influence <= 0 ? 1 : 1 - Math.exp(-influence * deltaSeconds);
      const world = worldSize;
      if (world) {
        continuousTarget.set(
          tracked.x + shortestToroidalAxisDelta(target.x - tracked.x, world.x),
          target.y,
          tracked.z + shortestToroidalAxisDelta(target.z - tracked.z, world.y),
        );
      } else {
        continuousTarget.copy(target);
      }
      tracked.addScaledVector(continuousTarget.subVectors(continuousTarget, tracked), amount);
      desired.copy(tracked).add(offset);
      focus.copy(tracked).add(lookAtOffset);

      if (staticColliders?.length) {
        rayOrigin.copy(focus);
        rayDirection.subVectors(desired, rayOrigin);
        const distance = rayDirection.length();
        if (distance > 0.000001) {
          rayDirection.multiplyScalar(1 / distance);
          raycaster.set(rayOrigin, rayDirection);
          raycaster.near = 0;
          raycaster.far = distance;
          hits.length = 0;
          raycaster.intersectObjects(staticColliders, true, hits);
          if (hits.length) desired.copy(rayOrigin).addScaledVector(rayDirection, Math.max(0, hits[0].distance - skin));
        }
      }

      camera.position.copy(desired).add(shake);
      camera.lookAt(focus);
      shake.set(0, 0, 0);
      return rig;
    },
    applyShake(x, y, z) {
      const sx = assertFiniteNumber(x, "camera rig shake x");
      const sy = assertFiniteNumber(y, "camera rig shake y");
      const sz = assertFiniteNumber(z, "camera rig shake z");
      shake.x += sx;
      shake.y += sy;
      shake.z += sz;
      camera.position.add(rayDirection.set(sx, sy, sz));
      return rig;
    },
    getDesiredPosition(out) {
      return out.copy(desired);
    },
  };

  return rig;
}

export function createThirdPersonCameraRig3D(config: ThreeCameraRig3DConfig = {}): ThreeCameraRig3DController {
  const pitchMin = config.minPitch ?? -1.35;
  const pitchMax = config.maxPitch ?? 1.35;
  const distanceMin = config.minDistance ?? 1;
  const distanceMax = config.maxDistance ?? Number.POSITIVE_INFINITY;
  const smoothing: Required<ThreeCameraRig3DSmoothing> = {
    follow: normalizeSmoothingSeconds(config.smoothing?.follow, 0.12),
    rotation: normalizeSmoothingSeconds(config.smoothing?.rotation, 0.08),
    distance: normalizeSmoothingSeconds(config.smoothing?.distance, 0.12),
    collision: normalizeSmoothingSeconds(config.smoothing?.collision, 0.08),
  };
  const collision = {
    enabled: config.collision?.enabled ?? true,
    radius: assertNonNegativeFinite(config.collision?.radius ?? 0.35, "3D camera collision radius"),
    minDistance: assertNonNegativeFinite(config.collision?.minDistance ?? 1.4, "3D camera collision min distance"),
    obstacles: [...(config.collision?.obstacles ?? [])],
    resolver: config.collision?.resolver,
  };
  const desired = createCameraRigDesiredState({
    target: config.target,
    targetOffset: config.targetOffset,
    lookAtOffset: config.lookAtOffset,
    shoulderOffset: config.shoulderOffset,
    yaw: config.yaw,
    pitch: clampCameraRigValue(config.pitch ?? 0.62, pitchMin, pitchMax),
    distance: clampCameraRigValue(config.distance ?? 12, distanceMin, distanceMax),
    fov: config.fov,
  });
  const current = {
    target: vec3Add(desired.target, desired.targetOffset),
    yaw: desired.yaw,
    pitch: desired.pitch,
    distance: desired.distance,
    position: [0, 0, 0] as MutableVec3,
    desiredPosition: [0, 0, 0] as MutableVec3,
    lookAt: [0, 0, 0] as MutableVec3,
    blocked: false,
  };
  const transitions: CameraRigTransition[] = [];
  let activeTransition: CameraRigTransition | null = null;

  const controller: ThreeCameraRig3DController = {
    setTarget(target) {
      desired.target = assertVec3(target, "3D camera target");
      return controller;
    },
    setTargetOffset(offset) {
      desired.targetOffset = assertVec3(offset, "3D camera target offset");
      return controller;
    },
    setLookAtOffset(offset) {
      desired.lookAtOffset = assertVec3(offset, "3D camera look-at offset");
      return controller;
    },
    pan(offset) {
      const delta = assertVec3(offset, "3D camera pan offset");
      desired.targetOffset = vec3Add(desired.targetOffset, delta);
      desired.lookAtOffset = vec3Add(desired.lookAtOffset, delta);
      return controller;
    },
    setShoulderOffset(offset) {
      desired.shoulderOffset = assertFiniteNumber(offset, "3D camera shoulder offset");
      return controller;
    },
    orbit(yawDelta, pitchDelta = 0) {
      desired.yaw = normalizeRadians(desired.yaw + assertFiniteNumber(yawDelta, "3D camera yaw delta"));
      desired.pitch = clampCameraRigValue(desired.pitch + assertFiniteNumber(pitchDelta, "3D camera pitch delta"), pitchMin, pitchMax);
      return controller;
    },
    setAngles(yaw, pitch) {
      desired.yaw = normalizeRadians(assertFiniteNumber(yaw, "3D camera yaw"));
      desired.pitch = clampCameraRigValue(assertFiniteNumber(pitch, "3D camera pitch"), pitchMin, pitchMax);
      return controller;
    },
    setDistance(distance) {
      desired.distance = clampCameraRigValue(assertFiniteNumber(distance, "3D camera distance"), distanceMin, distanceMax);
      return controller;
    },
    dolly(delta) {
      desired.distance = clampCameraRigValue(desired.distance + assertFiniteNumber(delta, "3D camera dolly delta"), distanceMin, distanceMax);
      return controller;
    },
    setFov(fov) {
      desired.fov = fov === undefined ? undefined : assertPositiveFinite(fov, "3D camera fov");
      return controller;
    },
    setSmoothing(nextSmoothing) {
      if (nextSmoothing.follow !== undefined) smoothing.follow = normalizeSmoothingSeconds(nextSmoothing.follow, smoothing.follow);
      if (nextSmoothing.rotation !== undefined) smoothing.rotation = normalizeSmoothingSeconds(nextSmoothing.rotation, smoothing.rotation);
      if (nextSmoothing.distance !== undefined) smoothing.distance = normalizeSmoothingSeconds(nextSmoothing.distance, smoothing.distance);
      if (nextSmoothing.collision !== undefined) smoothing.collision = normalizeSmoothingSeconds(nextSmoothing.collision, smoothing.collision);
      return controller;
    },
    setObstacles(obstacles) {
      collision.obstacles = [...obstacles];
      return controller;
    },
    setObstacleResolver(resolver) {
      collision.resolver = resolver;
      return controller;
    },
    transitionTo(preset, options = {}) {
      transitions.length = 0;
      activeTransition = createCameraRigTransition(desired, normalizePreset(preset, desired, pitchMin, pitchMax, distanceMin, distanceMax), options);
      return controller;
    },
    queueTransition(preset, options = {}) {
      transitions.push(createCameraRigTransition(desired, normalizePreset(preset, desired, pitchMin, pitchMax, distanceMin, distanceMax), options));
      return controller;
    },
    clearTransitions() {
      transitions.length = 0;
      activeTransition = null;
      return controller;
    },
    snapTo(preset = {}) {
      Object.assign(desired, normalizePreset(preset, desired, pitchMin, pitchMax, distanceMin, distanceMax));
      current.target = vec3Add(desired.target, desired.targetOffset);
      current.yaw = desired.yaw;
      current.pitch = desired.pitch;
      current.distance = desired.distance;
      const next = resolveCameraRigPosition();
      current.position = [...next.position];
      current.desiredPosition = [...next.desiredPosition];
      current.lookAt = [...next.lookAt];
      current.blocked = next.blocked;
      return controller;
    },
    update(deltaSeconds) {
      const dt = Math.max(0, assertFiniteNumber(deltaSeconds, "3D camera delta seconds"));
      advanceCameraRigTransitions(dt);
      current.target = lerpVec3(current.target, vec3Add(desired.target, desired.targetOffset), smoothingAmount(dt, smoothing.follow));
      current.yaw = lerpAngle(current.yaw, desired.yaw, smoothingAmount(dt, smoothing.rotation));
      current.pitch = lerpNumber(current.pitch, desired.pitch, smoothingAmount(dt, smoothing.rotation));
      current.distance = lerpNumber(current.distance, desired.distance, smoothingAmount(dt, smoothing.distance));
      const next = resolveCameraRigPosition(dt);
      current.position = lerpVec3(current.position, next.position, smoothingAmount(dt, smoothing.collision));
      current.desiredPosition = [...next.desiredPosition];
      current.lookAt = [...next.lookAt];
      current.blocked = next.blocked;
      return controller;
    },
    applyToCamera(camera) {
      camera.position.set(current.position[0], current.position[1], current.position[2]);
      camera.lookAt(current.lookAt[0], current.lookAt[1], current.lookAt[2]);
      if (desired.fov !== undefined && camera.fov !== undefined) {
        camera.fov = desired.fov;
        camera.updateProjectionMatrix();
      }
      return controller;
    },
    snapshot() {
      return {
        target: [...current.target],
        lookAt: [...current.lookAt],
        position: [...current.position],
        desiredPosition: [...current.desiredPosition],
        yaw: current.yaw,
        pitch: current.pitch,
        distance: current.distance,
        fov: desired.fov,
        blocked: current.blocked,
      };
    },
  };

  controller.snapTo();
  return controller;

  function advanceCameraRigTransitions(dt: number) {
    if (!activeTransition) activeTransition = startNextCameraRigTransition();
    if (!activeTransition) return;
    activeTransition.elapsed += dt;
    const amount = activeTransition.duration <= 0 ? 1 : Math.min(1, activeTransition.elapsed / activeTransition.duration);
    applyCameraRigPreset(desired, interpolateCameraRigPreset(activeTransition.from, activeTransition.to, activeTransition.easing(amount)));
    if (amount >= 1) activeTransition = startNextCameraRigTransition();
  }

  function startNextCameraRigTransition() {
    const next = transitions.shift() ?? null;
    if (next) {
      next.from = cloneCameraRigDesiredState(desired);
      next.elapsed = 0;
    }
    return next;
  }

  function resolveCameraRigPosition(deltaSeconds = 0) {
    const lookAt = vec3Add(current.target, desired.lookAtOffset);
    const desiredPosition = calculateThirdPersonCameraPosition(current.target, current.yaw, current.pitch, current.distance, desired.shoulderOffset);
    let position = desiredPosition;
    let blocked = false;
    if (collision.enabled && (collision.resolver || collision.obstacles.length)) {
      const state = cameraRigSnapshotFromCurrent(lookAt, desiredPosition, current, desired.fov);
      const resolved = collision.resolver?.({
        target: lookAt,
        desiredPosition,
        cameraRadius: collision.radius,
        minDistance: collision.minDistance,
        obstacles: collision.obstacles,
        state,
        deltaSeconds,
      }) ?? resolveCameraRigObstacles(lookAt, desiredPosition, collision.obstacles, collision.radius, collision.minDistance);
      const parsed = parseObstacleResult(resolved);
      if (parsed) {
        position = parsed.position;
        blocked = parsed.blocked;
      }
    }
    return { lookAt, desiredPosition, position, blocked };
  }
}

export function createThreeWorldTextOverlay3D(config: ThreeWorldTextOverlay3DConfig): ThreeWorldTextOverlay3D {
  const items: ThreeWorldTextOverlayItemState[] = [];
  const defaultVector = config.vector ?? (config.THREE?.Vector3 ? new config.THREE.Vector3() : undefined);
  if (!defaultVector && !config.project) throw new Error("createThreeWorldTextOverlay3D requires THREE.Vector3, vector, or project");

  const controller: ThreeWorldTextOverlay3D = {
    get size() {
      return items.length;
    },
    spawn(spawn) {
      const element = config.createElement?.(spawn) ?? createOverlayTextElement(config.container);
      element.className = spawn.className ?? config.className ?? element.className;
      element.textContent = spawn.text;
      element.style.position = element.style.position || "fixed";
      element.style.pointerEvents = "none";
      element.style.willChange = "transform, opacity, left, top, font-size";
      if (spawn.color ?? config.color) {
        const color = spawn.color ?? config.color ?? "";
        element.style.color = color;
        element.style.setProperty?.("--float-color", color);
      }
      config.container.append(element);
      items.push({
        element,
        position: assertVec3(spawn.position, "3D overlay text position"),
        age: 0,
        lifeSeconds: assertPositiveFinite(spawn.lifeSeconds ?? config.lifeSeconds ?? 0.78, "3D overlay text life seconds"),
        targetHeight: assertFiniteNumber(spawn.targetHeight ?? config.targetHeight ?? 1.4, "3D overlay text target height"),
        rise: assertFiniteNumber(spawn.rise ?? config.rise ?? 1.2, "3D overlay text rise"),
        screenRisePx: assertFiniteNumber(spawn.screenRisePx ?? config.screenRisePx ?? 24, "3D overlay text screen rise"),
        scale: assertPositiveFinite(spawn.scale ?? 1, "3D overlay text scale"),
        baseFontPx: assertPositiveFinite(spawn.baseFontPx ?? config.baseFontPx ?? 16, "3D overlay text font size"),
        growScale: assertNonNegativeFinite(spawn.growScale ?? config.growScale ?? 0.18, "3D overlay text grow scale"),
      });
      return element;
    },
    update(deltaSeconds) {
      const dt = Math.max(0, assertFiniteNumber(deltaSeconds, "3D overlay text delta seconds"));
      const camera = readWorldTextCamera(config.camera);
      const viewport = readWorldTextViewport(config);
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        item.age += dt;
        const progress = item.age / item.lifeSeconds;
        if (progress >= 1) {
          item.element.remove();
          items.splice(index, 1);
          continue;
        }
        updateWorldTextOverlayItem(config, defaultVector, item, camera, viewport, clampCameraRigValue(progress, 0, 1));
      }
    },
    clear() {
      for (const item of items) item.element.remove();
      items.length = 0;
    },
  };

  return controller;
}

export async function createThreeRender3D(config: ThreeRender3DConfig = {}): Promise<ThreeRender3DView> {
  const THREE = config.three ?? await loadThree(config.threeModuleUrl);
  const backend = config.backend ?? "webgl2";
  let pixelRatioCap = normalizePixelRatioCap(config.pixelRatioCap);
  const renderer = createRenderer(THREE, config, backend);
  const width = Math.max(1, config.width ?? renderer.domElement?.clientWidth ?? renderer.domElement?.width ?? 1);
  const height = Math.max(1, config.height ?? renderer.domElement?.clientHeight ?? renderer.domElement?.height ?? 1);
  renderer.setPixelRatio(resolvePixelRatio(pixelRatioCap));
  renderer.setSize(width, height, false);
  if ("outputColorSpace" in renderer && THREE.SRGBColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (renderer.shadowMap) renderer.shadowMap.enabled = config.shadows ?? false;
  if (config.clearColor !== undefined) renderer.setClearColor?.(new THREE.Color(config.clearColor), config.clearAlpha ?? 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
  const callRoot = new THREE.Group();
  const lightRoot = new THREE.Group();
  scene.add(callRoot, lightRoot);

  const meshRegistry = new Map<string, ThreeRender3DMeshDefinition>();
  const materialRegistry = new Map<string, ThreeLikeMaterial>();
  const defaultMaterial = createDefaultMaterial(THREE);
  const callSlots: ThreeRender3DCallSlot[] = [];
  let disposed = false;

  const view: ThreeRender3DView = {
    THREE,
    backend,
    renderer,
    scene,
    camera,
    registerMesh(id, definition) {
      assertUsableId(id, "mesh");
      meshRegistry.set(id, definition);
    },
    unregisterMesh(id) {
      return meshRegistry.delete(id);
    },
    registerMaterial(id, material) {
      assertUsableId(id, "material");
      materialRegistry.set(id, material);
    },
    unregisterMaterial(id) {
      return materialRegistry.delete(id);
    },
    createAnimationController(root, clips, options) {
      return createAnimationController(THREE, root, clips, options);
    },
    createRagdoll(config) {
      return createRagdoll(THREE, defaultMaterial, config);
    },
    render(frame = {}) {
      if (disposed) throw new Error("createThreeRender3D view has been disposed");
      if (frame.camera) applyCamera(THREE, view, frame.camera);
      if (frame.lights) applyLights(THREE, lightRoot, frame.lights);
      applyCalls(THREE, callRoot, callSlots, meshRegistry, materialRegistry, defaultMaterial, frame.calls ?? []);
      renderer.render(scene, view.camera);
      return { calls: frame.calls?.length ?? 0, lights: lightRoot.children?.length ?? 0, backend };
    },
    resize(nextWidth, nextHeight) {
      const safeWidth = Math.max(1, nextWidth);
      const safeHeight = Math.max(1, nextHeight);
      view.camera.aspect = safeWidth / safeHeight;
      view.camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);
    },
    setPixelRatioCap(cap) {
      pixelRatioCap = normalizePixelRatioCap(cap);
      renderer.setPixelRatio(resolvePixelRatio(pixelRatioCap));
    },
    loadAddon<TModule = unknown>(path: string) {
      return import(resolveThreeAddonUrl(config.threeModuleUrl ?? DEFAULT_THREE_MODULE_URL, path)) as Promise<TModule>;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearGroup(callRoot);
      clearGroup(lightRoot);
      callSlots.length = 0;
      renderer.dispose();
    },
  };

  return view;
}

export function loadThreeLoaderAsset<TAsset>(
  loader: ThreeAssetLoader<TAsset>,
  path: string,
  options: ThreeLoadAssetOptions<TAsset> = {},
): Promise<TAsset> {
  const requestPath = options.encodeUrl === false ? path : encodeURI(path);
  return new Promise((resolve, reject) => {
    loader.load(
      requestPath,
      (asset) => {
        Promise.resolve(options.prepare ? options.prepare(asset, path) : asset).then(resolve, reject);
      },
      options.onProgress ? (event) => options.onProgress?.(event, path) : undefined,
      reject,
    );
  });
}

export async function loadFirstThreeAsset<TAsset>(
  paths: readonly string[],
  load: (path: string) => Promise<TAsset>,
  options: ThreeLoadFirstAssetOptions<TAsset> = {},
): Promise<TAsset> {
  let lastError: unknown;
  for (const path of paths) {
    try {
      return await load(path);
    } catch (error) {
      lastError = error;
      options.onError?.(error, path);
    }
  }
  if ("fallback" in options) {
    const fallback = options.fallback;
    return typeof fallback === "function" ? await (fallback as () => TAsset | Promise<TAsset>)() : fallback as TAsset;
  }
  throw lastError instanceof Error ? lastError : new Error("No Three asset path loaded");
}

export function createSolidThreeTexture(
  THREE: ThreeModuleLike,
  colorValue: ThreeRender3DColor,
  options: { colorSpace?: unknown } = {},
): ThreeLikeTexture {
  if (!THREE.DataTexture) throw new Error("createSolidThreeTexture requires THREE.DataTexture");
  const color = new THREE.Color(colorValue) as Partial<ThreeLikeColor>;
  const data = new Uint8Array([
    colorChannelToByte(color.r),
    colorChannelToByte(color.g),
    colorChannelToByte(color.b),
    255,
  ]);
  const texture = new THREE.DataTexture(data, 1, 1);
  if ("colorSpace" in options) texture.colorSpace = options.colorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createThreeSkybox3D(
  THREE: ThreeModuleLike,
  options: ThreeSkybox3DOptions = {},
): ThreeLikeObject3D {
  if (!THREE.SphereGeometry) throw new Error("createThreeSkybox3D requires THREE.SphereGeometry");
  const radius = positiveFiniteOrDefault(options.radius, 900, "radius");
  const segments = Math.max(8, Math.floor(positiveFiniteOrDefault(options.segments, 48, "segments")));
  const materialOptions: Record<string, unknown> = {
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  };
  if (options.texture) materialOptions.map = options.texture;
  else materialOptions.color = options.color ?? 0x87a8c8;
  const skybox = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.max(8, Math.floor(segments / 2))),
    new THREE.MeshBasicMaterial(materialOptions),
  );
  skybox.name = options.name ?? "skybox";
  skybox.frustumCulled = false;
  (skybox as { renderOrder?: number }).renderOrder = options.renderOrder ?? -1000;
  return skybox;
}

export function prepareThreeObject3D<TObject extends ThreeLikeObject3D>(
  root: TObject,
  options: ThreePrepareObjectOptions<TObject> = {},
): TObject {
  forEachThreeObject(root, (object) => {
    const typedObject = object as TObject;
    const shouldPrepare = options.predicate ? options.predicate(typedObject) : isThreeMeshLike(object);
    if (!shouldPrepare) return;
    if (options.castShadow !== undefined) typedObject.castShadow = options.castShadow;
    if (options.receiveShadow !== undefined) typedObject.receiveShadow = options.receiveShadow;
    const material = typeof options.material === "function" ? options.material(typedObject) : options.material;
    if (material !== undefined) (typedObject as ThreeMeshLike).material = material;
    options.onObject?.(typedObject);
  });
  return root;
}

export function clonePreparedThreeObject<TObject extends ThreeLikeObject3D>(
  source: ThreeCloneableObject3D<TObject>,
  options: ThreeCloneObjectOptions<TObject> = {},
): TObject {
  const clone = options.clone?.(source) ?? source.clone(options.recursive ?? true);
  if (options.scale !== undefined) applyObjectScale(clone, options.scale);
  return prepareThreeObject3D(clone, options);
}

export function createThreeResourceCache<TResource extends ThreeDisposableResource = ThreeDisposableResource>(
  config: ThreeResourceCacheConfig<TResource> = {},
): ThreeResourceCache<TResource> {
  const resources = new Map<string, TResource>();

  function dispose(key: string, resource: TResource) {
    if (config.dispose) config.dispose(resource, key);
    else resource.dispose?.();
  }

  return {
    get size() {
      return resources.size;
    },
    has(key) {
      return resources.has(key);
    },
    peek(key) {
      return resources.get(key);
    },
    set(key, resource) {
      const previous = resources.get(key);
      if (previous && previous !== resource) dispose(key, previous);
      resources.set(key, resource);
      return resource;
    },
    get(key, factory) {
      const existing = resources.get(key);
      if (existing) return existing;
      const resource = factory(key);
      resources.set(key, resource);
      return resource;
    },
    delete(key) {
      const resource = resources.get(key);
      if (!resource) return false;
      dispose(key, resource);
      return resources.delete(key);
    },
    clear() {
      for (const [key, resource] of resources) dispose(key, resource);
      resources.clear();
    },
  };
}

function updateWorldTextOverlayItem(
  config: ThreeWorldTextOverlay3DConfig,
  vector: ThreeProjectableVector3 | undefined,
  item: ThreeWorldTextOverlayItemState,
  camera: ThreeLikeCamera,
  viewport: ThreeWorldTextOverlayViewport,
  progress: number,
) {
  const lifted: MutableVec3 = [item.position[0], item.position[1] + item.targetHeight + item.rise * progress, item.position[2]];
  const worldPosition = config.resolvePosition ? assertVec3(config.resolvePosition(lifted), "3D overlay text resolved position") : lifted;
  const projection = config.project?.({
    position: worldPosition,
    camera,
    viewport,
    age: item.age,
    progress,
  }) ?? projectWorldTextPosition(vector, worldPosition, camera);
  const visible = projection.visible !== false && projectionIsUsable(projection);
  item.element.style.display = visible ? "" : "none";
  if (!visible) return;

  const screenX = (projection.x * 0.5 + 0.5) * viewport.width;
  const screenY = (-projection.y * 0.5 + 0.5) * viewport.height;
  const distance = projection.distance ?? distanceToCamera(worldPosition, camera);
  const distanceScale = resolveWorldTextDistanceScale(config, distance);
  const fontPx = item.baseFontPx * item.scale * distanceScale;
  const opacity = Math.max(0, 1 - progress);
  const grow = 1 + item.growScale * progress;
  item.element.style.left = `${formatCssNumber(screenX)}px`;
  item.element.style.top = `${formatCssNumber(screenY)}px`;
  item.element.style.fontSize = `${formatCssNumber(fontPx)}px`;
  item.element.style.opacity = formatCssNumber(opacity);
  item.element.style.transform = `translate(-50%, -50%) translateY(${formatCssNumber(-item.screenRisePx * progress)}px) scale(${formatCssNumber(grow)})`;
}

function createOverlayTextElement(container: HTMLElement) {
  const doc = container.ownerDocument ?? globalThis.document;
  if (!doc) throw new Error("createThreeWorldTextOverlay3D requires document or createElement");
  return doc.createElement("div");
}

function readWorldTextCamera(camera: ThreeLikeCamera | (() => ThreeLikeCamera)) {
  return typeof camera === "function" ? camera() : camera;
}

function readWorldTextViewport(config: ThreeWorldTextOverlay3DConfig): ThreeWorldTextOverlayViewport {
  const viewport = typeof config.viewport === "function" ? config.viewport() : config.viewport;
  if (viewport) {
    return {
      width: Math.max(1, assertFiniteNumber(viewport.width, "3D overlay text viewport width")),
      height: Math.max(1, assertFiniteNumber(viewport.height, "3D overlay text viewport height")),
    };
  }
  const view = config.container.ownerDocument?.defaultView ?? globalThis;
  const width = config.container.clientWidth || ("innerWidth" in view && typeof view.innerWidth === "number" ? view.innerWidth : 1);
  const height = config.container.clientHeight || ("innerHeight" in view && typeof view.innerHeight === "number" ? view.innerHeight : 1);
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

function projectWorldTextPosition(
  vector: ThreeProjectableVector3 | undefined,
  position: ThreeRender3DVector3,
  camera: ThreeLikeCamera,
): ThreeWorldTextOverlayProjection {
  if (!vector) throw new Error("createThreeWorldTextOverlay3D requires a project function or projectable vector");
  vector.set(position[0], position[1], position[2]);
  vector.project(camera);
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
    distance: distanceToCamera(position, camera),
  };
}

function projectionIsUsable(projection: ThreeWorldTextOverlayProjection) {
  if (!Number.isFinite(projection.x) || !Number.isFinite(projection.y)) return false;
  if (projection.z !== undefined && (!Number.isFinite(projection.z) || projection.z < -1 || projection.z > 1)) return false;
  return true;
}

function resolveWorldTextDistanceScale(config: ThreeWorldTextOverlay3DConfig, distance: number) {
  const referenceDistance = assertPositiveFinite(config.referenceDistance ?? 40, "3D overlay text reference distance");
  const minScale = assertPositiveFinite(config.minDistanceScale ?? 0.5, "3D overlay text min distance scale");
  const maxScale = assertPositiveFinite(config.maxDistanceScale ?? 1.4, "3D overlay text max distance scale");
  return clampCameraRigValue(referenceDistance / Math.max(0.001, distance), Math.min(minScale, maxScale), Math.max(minScale, maxScale));
}

function distanceToCamera(position: ThreeRender3DVector3, camera: ThreeLikeCamera) {
  return Math.hypot(
    position[0] - camera.position.x,
    position[1] - camera.position.y,
    position[2] - camera.position.z,
  );
}

function formatCssNumber(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

async function loadThree(url = DEFAULT_THREE_MODULE_URL): Promise<ThreeModuleLike> {
  return await import(url) as ThreeModuleLike;
}

function createRenderer(THREE: ThreeModuleLike, config: ThreeRender3DConfig, backend: ThreeRender3DBackend) {
  const options: Record<string, unknown> = {
    canvas: config.canvas,
    antialias: config.antialias ?? true,
    alpha: config.alpha ?? false,
    powerPreference: "high-performance",
  };
  if (backend === "webgl2" && config.canvas && "getContext" in config.canvas) {
    const context = config.canvas.getContext("webgl2", { alpha: config.alpha ?? false, antialias: config.antialias ?? true });
    if (context) options.context = context;
  }
  return new THREE.WebGLRenderer(options);
}

function createDefaultMaterial(THREE: ThreeModuleLike) {
  if (THREE.MeshStandardMaterial) return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  return new THREE.MeshBasicMaterial({ color: 0xffffff });
}

function createAnimationController(
  THREE: ThreeModuleLike,
  root: ThreeLikeObject3D,
  clips: readonly ThreeLikeAnimationClip[],
  options: { initial?: string; fadeSeconds?: number } = {},
): ThreeRender3DAnimationController {
  if (!THREE.AnimationMixer) throw new Error("ThreeRender3D animation support requires THREE.AnimationMixer");
  const mixer = new THREE.AnimationMixer(root);
  const clipMap = new Map(clips.map((clip) => [clip.name, clip] as const));
  let currentAction: ThreeLikeAnimationAction | null = null;
  let current: string | null = null;

  const controller: ThreeRender3DAnimationController = {
    mixer,
    clips: clipMap,
    get current() {
      return current;
    },
    play(name, playOptions = {}) {
      const clip = clipMap.get(name) ?? findClipByLooseName(clipMap, name);
      if (!clip) return false;
      if (current === clip.name) return true;
      const fadeSeconds = playOptions.fadeSeconds ?? options.fadeSeconds ?? 0.08;
      const nextAction = mixer.clipAction(clip, root).reset();
      nextAction.setEffectiveTimeScale?.(playOptions.timeScale ?? 1);
      nextAction.setEffectiveWeight?.(playOptions.weight ?? 1);
      if (fadeSeconds > 0) {
        currentAction?.fadeOut?.(fadeSeconds);
        nextAction.fadeIn?.(fadeSeconds);
      } else {
        currentAction?.stop();
      }
      nextAction.play();
      currentAction = nextAction;
      current = clip.name;
      return true;
    },
    update(dt) {
      mixer.update(dt);
    },
    stop() {
      mixer.stopAllAction?.();
      currentAction = null;
      current = null;
    },
  };

  if (options.initial) controller.play(options.initial, { fadeSeconds: 0 });
  return controller;
}

function findClipByLooseName(clips: ReadonlyMap<string, ThreeLikeAnimationClip>, requested: string) {
  const normalizedRequest = normalizeAnimationName(requested);
  for (const [name, clip] of clips) {
    if (normalizeAnimationName(name).includes(normalizedRequest)) return clip;
  }
  return undefined;
}

function normalizeAnimationName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createRagdoll(
  THREE: ThreeModuleLike,
  fallbackMaterial: ThreeLikeMaterial,
  config: ThreeRender3DRagdollConfig,
): ThreeRender3DRagdollController {
  const BoxGeometry = THREE.BoxGeometry;
  const SphereGeometry = THREE.SphereGeometry;
  if (!BoxGeometry || !SphereGeometry) throw new Error("ThreeRender3D ragdoll support requires basic THREE geometry constructors");
  const root = new THREE.Group();
  root.position.set(config.position[0], config.position[1], config.position[2]);
  const scale = config.scale ?? 1;
  const ttl = config.ttl ?? 1.4;
  const gravity = config.gravity ?? 22;
  const floorY = config.floorY ?? 0.08;
  const bounce = config.bounce ?? 0.22;
  const spread = config.spread ?? 2.8;
  const incomingForce = config.incomingForce ?? [0, 0, 0];
  const material = config.material ?? (config.color && THREE.MeshStandardMaterial
    ? new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.8 })
    : fallbackMaterial);
  const partStates = (config.parts ?? defaultRagdollParts).map((part, index) => {
    const geometry = part.kind === "sphere"
      ? new SphereGeometry((part.radius ?? 0.22) * scale, 10, 8)
      : new BoxGeometry((part.size?.[0] ?? 0.3) * scale, (part.size?.[1] ?? 0.5) * scale, (part.size?.[2] ?? 0.22) * scale);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name ?? `ragdoll-${index}`;
    mesh.position.set(part.offset[0] * scale, part.offset[1] * scale, part.offset[2] * scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    const scatter = spread / Math.max(0.2, part.mass ?? 1);
    return {
      mesh,
      velocity: {
        x: incomingForce[0] * scatter + Math.sin(index * 2.4) * spread,
        y: Math.max(1.5, incomingForce[1] * scatter + 4 + (index % 3) * 1.1),
        z: incomingForce[2] * scatter + Math.cos(index * 1.7) * spread,
      },
      angular: {
        x: (0.8 + index * 0.13) * scatter,
        y: (1.1 + index * 0.11) * scatter,
        z: (0.9 + index * 0.17) * scatter,
      },
    };
  });

  return {
    root,
    age: 0,
    ttl,
    update(dt) {
      this.age += dt;
      for (const part of partStates) {
        part.velocity.y -= gravity * dt;
        part.mesh.position.x += part.velocity.x * dt;
        part.mesh.position.y += part.velocity.y * dt;
        part.mesh.position.z += part.velocity.z * dt;
        if (part.mesh.position.y < floorY) {
          part.mesh.position.y = floorY;
          part.velocity.y = Math.abs(part.velocity.y) * bounce;
          part.velocity.x *= 0.72;
          part.velocity.z *= 0.72;
        }
        part.mesh.rotation.x += part.angular.x * dt;
        part.mesh.rotation.y += part.angular.y * dt;
        part.mesh.rotation.z += part.angular.z * dt;
      }
      return this.age < ttl;
    },
  };
}

type MutableVec3 = [number, number, number];

type CameraRigDesiredState = {
  target: MutableVec3;
  targetOffset: MutableVec3;
  lookAtOffset: MutableVec3;
  shoulderOffset: number;
  yaw: number;
  pitch: number;
  distance: number;
  fov?: number;
};

type CameraRigTransition = {
  from: CameraRigDesiredState;
  to: CameraRigDesiredState;
  duration: number;
  easing: (amount: number) => number;
  elapsed: number;
};

function createCameraRigDesiredState(preset: ThreeCameraRig3DPreset): CameraRigDesiredState {
  return {
    target: assertVec3(preset.target ?? [0, 0, 0], "3D camera target"),
    targetOffset: assertVec3(preset.targetOffset ?? [0, 0, 0], "3D camera target offset"),
    lookAtOffset: assertVec3(preset.lookAtOffset ?? [0, 0, 0], "3D camera look-at offset"),
    shoulderOffset: assertFiniteNumber(preset.shoulderOffset ?? 0, "3D camera shoulder offset"),
    yaw: normalizeRadians(assertFiniteNumber(preset.yaw ?? 0, "3D camera yaw")),
    pitch: assertFiniteNumber(preset.pitch ?? 0.62, "3D camera pitch"),
    distance: assertPositiveFinite(preset.distance ?? 12, "3D camera distance"),
    fov: preset.fov === undefined ? undefined : assertPositiveFinite(preset.fov, "3D camera fov"),
  };
}

function cloneCameraRigDesiredState(state: CameraRigDesiredState): CameraRigDesiredState {
  return {
    target: [...state.target],
    targetOffset: [...state.targetOffset],
    lookAtOffset: [...state.lookAtOffset],
    shoulderOffset: state.shoulderOffset,
    yaw: state.yaw,
    pitch: state.pitch,
    distance: state.distance,
    fov: state.fov,
  };
}

function normalizePreset(
  preset: ThreeCameraRig3DPreset,
  current: CameraRigDesiredState,
  pitchMin: number,
  pitchMax: number,
  distanceMin: number,
  distanceMax: number,
): CameraRigDesiredState {
  return {
    target: preset.target === undefined ? [...current.target] : assertVec3(preset.target, "3D camera target"),
    targetOffset: preset.targetOffset === undefined ? [...current.targetOffset] : assertVec3(preset.targetOffset, "3D camera target offset"),
    lookAtOffset: preset.lookAtOffset === undefined ? [...current.lookAtOffset] : assertVec3(preset.lookAtOffset, "3D camera look-at offset"),
    shoulderOffset: preset.shoulderOffset === undefined ? current.shoulderOffset : assertFiniteNumber(preset.shoulderOffset, "3D camera shoulder offset"),
    yaw: preset.yaw === undefined ? current.yaw : normalizeRadians(assertFiniteNumber(preset.yaw, "3D camera yaw")),
    pitch: preset.pitch === undefined ? current.pitch : clampCameraRigValue(assertFiniteNumber(preset.pitch, "3D camera pitch"), pitchMin, pitchMax),
    distance: preset.distance === undefined ? current.distance : clampCameraRigValue(assertFiniteNumber(preset.distance, "3D camera distance"), distanceMin, distanceMax),
    fov: preset.fov === undefined ? current.fov : assertPositiveFinite(preset.fov, "3D camera fov"),
  };
}

function createCameraRigTransition(
  from: CameraRigDesiredState,
  to: CameraRigDesiredState,
  options: ThreeCameraRig3DTransitionOptions,
): CameraRigTransition {
  return {
    from: cloneCameraRigDesiredState(from),
    to: cloneCameraRigDesiredState(to),
    duration: assertNonNegativeFinite(options.duration ?? 0.35, "3D camera transition duration"),
    easing: options.easing ?? smoothStep,
    elapsed: 0,
  };
}

function applyCameraRigPreset(target: CameraRigDesiredState, source: CameraRigDesiredState) {
  target.target = [...source.target];
  target.targetOffset = [...source.targetOffset];
  target.lookAtOffset = [...source.lookAtOffset];
  target.shoulderOffset = source.shoulderOffset;
  target.yaw = source.yaw;
  target.pitch = source.pitch;
  target.distance = source.distance;
  target.fov = source.fov;
}

function interpolateCameraRigPreset(from: CameraRigDesiredState, to: CameraRigDesiredState, amount: number): CameraRigDesiredState {
  const t = clampCameraRigValue(amount, 0, 1);
  return {
    target: lerpVec3(from.target, to.target, t),
    targetOffset: lerpVec3(from.targetOffset, to.targetOffset, t),
    lookAtOffset: lerpVec3(from.lookAtOffset, to.lookAtOffset, t),
    shoulderOffset: lerpNumber(from.shoulderOffset, to.shoulderOffset, t),
    yaw: lerpAngle(from.yaw, to.yaw, t),
    pitch: lerpNumber(from.pitch, to.pitch, t),
    distance: lerpNumber(from.distance, to.distance, t),
    fov: lerpOptionalNumber(from.fov, to.fov, t),
  };
}

function cameraRigSnapshotFromCurrent(
  lookAt: MutableVec3,
  desiredPosition: MutableVec3,
  current: { target: MutableVec3; position: MutableVec3; yaw: number; pitch: number; distance: number; blocked: boolean },
  fov: number | undefined,
): ThreeCameraRig3DState {
  return {
    target: [...current.target],
    lookAt: [...lookAt],
    position: [...current.position],
    desiredPosition: [...desiredPosition],
    yaw: current.yaw,
    pitch: current.pitch,
    distance: current.distance,
    fov,
    blocked: current.blocked,
  };
}

function calculateThirdPersonCameraPosition(
  target: MutableVec3,
  yaw: number,
  pitch: number,
  distance: number,
  shoulderOffset: number,
): MutableVec3 {
  const pitchCos = Math.cos(pitch);
  const orbitX = Math.sin(yaw) * pitchCos * distance;
  const orbitY = Math.sin(pitch) * distance;
  const orbitZ = Math.cos(yaw) * pitchCos * distance;
  const rightX = Math.cos(yaw) * shoulderOffset;
  const rightZ = -Math.sin(yaw) * shoulderOffset;
  return [target[0] + orbitX + rightX, target[1] + orbitY, target[2] + orbitZ + rightZ];
}

function resolveCameraRigObstacles(
  target: MutableVec3,
  desiredPosition: MutableVec3,
  obstacles: readonly ThreeCameraRig3DObstacle[],
  cameraRadius: number,
  minDistance: number,
) {
  const segment = vec3Subtract(desiredPosition, target);
  const length = vec3Length(segment);
  if (length <= 0) return null;
  let bestDistance = length;
  for (const obstacle of obstacles) {
    const t = obstacle.kind === "sphere"
      ? intersectSegmentSphere(target, desiredPosition, obstacle.center, obstacle.radius + cameraRadius)
      : intersectSegmentAabb(target, desiredPosition, obstacle.min, obstacle.max, cameraRadius);
    if (t === null) continue;
    const distance = Math.max(minDistance, length * t - 0.05);
    if (distance < bestDistance) bestDistance = distance;
  }
  if (bestDistance >= length) return null;
  const direction = vec3Scale(segment, 1 / length);
  return {
    position: vec3Add(target, vec3Scale(direction, bestDistance)),
    blocked: true,
  };
}

function intersectSegmentSphere(
  start: MutableVec3,
  end: MutableVec3,
  center: ThreeRender3DVector3,
  radius: number,
) {
  if (!Number.isFinite(radius) || radius < 0) return null;
  const d = vec3Subtract(end, start);
  const m = vec3Subtract(start, center);
  const a = vec3Dot(d, d);
  const b = vec3Dot(m, d);
  const c = vec3Dot(m, m) - radius * radius;
  if (c <= 0) return 0;
  if (b > 0) return null;
  const discriminant = b * b - a * c;
  if (discriminant < 0 || a <= 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}

function intersectSegmentAabb(
  start: MutableVec3,
  end: MutableVec3,
  min: ThreeRender3DVector3,
  max: ThreeRender3DVector3,
  padding: number,
) {
  const direction = vec3Subtract(end, start);
  let tMin = 0;
  let tMax = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const boxMin = Math.min(min[axis], max[axis]) - padding;
    const boxMax = Math.max(min[axis], max[axis]) + padding;
    const origin = start[axis];
    const delta = direction[axis];
    if (Math.abs(delta) < 0.000001) {
      if (origin < boxMin || origin > boxMax) return null;
      continue;
    }
    const inv = 1 / delta;
    let t1 = (boxMin - origin) * inv;
    let t2 = (boxMax - origin) * inv;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMax >= 0 && tMin <= 1 ? clampCameraRigValue(tMin, 0, 1) : null;
}

function parseObstacleResult(result: ThreeCameraRig3DObstacleResult | null | undefined) {
  if (!result) return null;
  if (isVec3Result(result)) return { position: assertVec3(result, "3D camera resolved position"), blocked: true };
  const resolved = result as { position: ThreeRender3DVector3; blocked?: boolean };
  return {
    position: assertVec3(resolved.position, "3D camera resolved position"),
    blocked: resolved.blocked ?? true,
  };
}

function isVec3Result(value: unknown): value is ThreeRender3DVector3 {
  return Array.isArray(value);
}

function assertVec3(value: ThreeRender3DVector3, label: string): MutableVec3 {
  return [
    assertFiniteNumber(value[0], `${label} x`),
    assertFiniteNumber(value[1], `${label} y`),
    assertFiniteNumber(value[2], `${label} z`),
  ];
}

function vec3Add(a: ThreeRender3DVector3, b: ThreeRender3DVector3): MutableVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Subtract(a: ThreeRender3DVector3, b: ThreeRender3DVector3): MutableVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(value: ThreeRender3DVector3, scale: number): MutableVec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function vec3Dot(a: ThreeRender3DVector3, b: ThreeRender3DVector3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Length(value: ThreeRender3DVector3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function lerpVec3(from: ThreeRender3DVector3, to: ThreeRender3DVector3, amount: number): MutableVec3 {
  return [
    lerpNumber(from[0], to[0], amount),
    lerpNumber(from[1], to[1], amount),
    lerpNumber(from[2], to[2], amount),
  ];
}

function lerpNumber(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function lerpOptionalNumber(from: number | undefined, to: number | undefined, amount: number) {
  if (from === undefined) return to;
  if (to === undefined) return from;
  return lerpNumber(from, to, amount);
}

function lerpAngle(from: number, to: number, amount: number) {
  return normalizeRadians(from + shortestAngleDelta(from, to) * amount);
}

function shortestAngleDelta(from: number, to: number) {
  return normalizeRadians(to - from + Math.PI) - Math.PI;
}

function normalizeRadians(value: number) {
  return positiveModulo(value + Math.PI, Math.PI * 2) - Math.PI;
}

function smoothingAmount(deltaSeconds: number, seconds: number) {
  if (seconds <= 0) return 1;
  return 1 - Math.exp(-deltaSeconds / seconds);
}

function normalizeSmoothingSeconds(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  return assertNonNegativeFinite(value, "3D camera smoothing seconds");
}

function clampCameraRigValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(amount: number) {
  const t = clampCameraRigValue(amount, 0, 1);
  return t * t * (3 - 2 * t);
}

const defaultRagdollParts: readonly ThreeRender3DRagdollPartConfig[] = [
  { name: "torso", kind: "box", size: [0.55, 0.9, 0.35], offset: [0, 0.9, 0], mass: 1.4 },
  { name: "head", kind: "sphere", radius: 0.26, offset: [0, 1.55, 0], mass: 0.7 },
  { name: "left-arm", kind: "box", size: [0.22, 0.7, 0.2], offset: [-0.44, 1.0, 0], mass: 0.55 },
  { name: "right-arm", kind: "box", size: [0.22, 0.7, 0.2], offset: [0.44, 1.0, 0], mass: 0.55 },
  { name: "left-leg", kind: "box", size: [0.24, 0.78, 0.22], offset: [-0.18, 0.28, 0], mass: 0.75 },
  { name: "right-leg", kind: "box", size: [0.24, 0.78, 0.22], offset: [0.18, 0.28, 0], mass: 0.75 },
];

function applyCamera(THREE: ThreeModuleLike, view: ThreeRender3DView, config: ThreeRender3DCamera) {
  const rendererCanvas = view.renderer.domElement;
  const width = Math.max(1, rendererCanvas?.width ?? rendererCanvas?.clientWidth ?? 1);
  const height = Math.max(1, rendererCanvas?.height ?? rendererCanvas?.clientHeight ?? 1);
  if (config.kind === "orthographic") {
    const aspect = width / height;
    const halfHeight = config.size / 2;
    const halfWidth = halfHeight * aspect;
    view.camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, config.near ?? 0.1, config.far ?? 1000);
  } else {
    view.camera = new THREE.PerspectiveCamera(config.fov ?? 55, width / height, config.near ?? 0.1, config.far ?? 1000);
  }
  view.camera.position.set(config.position[0], config.position[1], config.position[2]);
  view.camera.lookAt(config.target[0], config.target[1], config.target[2]);
  view.camera.updateProjectionMatrix();
}

function applyLights(THREE: ThreeModuleLike, lightRoot: ThreeLikeObject3D, lights: readonly ThreeRender3DLight[]) {
  clearGroup(lightRoot);
  for (const lightConfig of lights) {
    let light: ThreeLikeObject3D;
    if (lightConfig.kind === "ambient") {
      light = new THREE.AmbientLight(lightConfig.color, lightConfig.intensity ?? 1);
    } else if (lightConfig.kind === "hemisphere") {
      light = new THREE.HemisphereLight(lightConfig.skyColor, lightConfig.groundColor, lightConfig.intensity ?? 1);
    } else if (lightConfig.kind === "directional") {
      light = new THREE.DirectionalLight(lightConfig.color ?? 0xffffff, lightConfig.intensity ?? 1);
      light.position.set(-lightConfig.direction[0], -lightConfig.direction[1], -lightConfig.direction[2]);
    } else {
      light = new THREE.PointLight(lightConfig.color ?? 0xffffff, lightConfig.intensity ?? 1, lightConfig.distance, lightConfig.decay);
      light.position.set(lightConfig.position[0], lightConfig.position[1], lightConfig.position[2]);
    }
    lightRoot.add(light);
  }
}

function applyCalls(
  THREE: ThreeModuleLike,
  callRoot: ThreeLikeObject3D,
  slots: ThreeRender3DCallSlot[],
  meshRegistry: Map<string, ThreeRender3DMeshDefinition>,
  materialRegistry: Map<string, ThreeLikeMaterial>,
  defaultMaterial: ThreeLikeMaterial,
  calls: readonly ThreeRender3DCall[],
) {
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const definition = meshRegistry.get(call.mesh);
    if (!definition) throw new Error(`Unknown 3D mesh: ${call.mesh}`);
    const material = resolveMaterial(call.material, definition, materialRegistry, defaultMaterial);
    const count = call.kind === "instanceBatch" ? call.count ?? inferMatrixCount(call.matrices) : 1;
    const capacity = call.kind === "instanceBatch" ? resolveInstanceCapacity(call, count) : 1;
    const key = renderCallKey(call, definition, material, capacity);
    let slot = slots[index];
    if (!slot || slot.key !== key) {
      if (slot) callRoot.remove(slot.object);
      slot = {
        key,
        object: call.kind === "instanceBatch"
          ? new THREE.InstancedMesh(definition.geometry, material, capacity)
          : new THREE.Mesh(definition.geometry, material),
      };
      if (call.kind === "instanceBatch") {
        slot.matrix = new THREE.Matrix4();
        applyInstanceUsage(THREE, slot.object as ThreeLikeInstancedMesh, call.usage);
      }
      slots[index] = slot;
      callRoot.add(slot.object);
    }
    const object = slot.object;
    if (call.kind === "instanceBatch") {
      if (count > capacity) throw new Error(`3D instanceBatch count ${count} exceeds capacity ${capacity}`);
      updateInstanceBatch(object as ThreeLikeInstancedMesh, call, count, slot.matrix ?? new THREE.Matrix4());
      if (call.culling === "none") object.frustumCulled = false;
      else if (call.culling === "default") object.frustumCulled = true;
    }
    object.visible = call.visible ?? true;
    object.castShadow = call.castShadow ?? false;
    object.receiveShadow = call.receiveShadow ?? false;
    applyTransform(object, call.transform);
  }
  for (let index = calls.length; index < slots.length; index += 1) {
    slots[index].object.visible = false;
  }
}

function updateInstanceBatch(
  mesh: ThreeLikeInstancedMesh,
  call: ThreeRender3DInstanceBatchCall,
  count: number,
  matrix: ThreeLikeMatrix4,
) {
  mesh.count = count;
  if (isFlatMatrixArray(call.matrices)) {
    for (let index = 0; index < count; index += 1) {
      matrix.fromArray(call.matrices, index * 16);
      mesh.setMatrixAt(index, matrix);
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      matrix.fromArray(resolveMatrixElements(call.matrices, index));
      mesh.setMatrixAt(index, matrix);
    }
  }
  if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
}

function resolveInstanceCapacity(call: ThreeRender3DInstanceBatchCall, count: number) {
  const capacity = call.capacity ?? count;
  if (!Number.isInteger(capacity) || capacity < 0) throw new Error("3D instanceBatch capacity must be a non-negative integer");
  return capacity;
}

function applyInstanceUsage(THREE: ThreeModuleLike, mesh: ThreeLikeInstancedMesh, usage: ThreeRender3DInstanceBatchCall["usage"]) {
  if (!usage || !mesh.instanceMatrix?.setUsage) return;
  if (usage === "dynamic" && THREE.DynamicDrawUsage !== undefined) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  } else if (usage === "static" && THREE.StaticDrawUsage !== undefined) {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  }
}

function resolveMaterial(
  material: string | ThreeLikeMaterial | undefined,
  definition: ThreeRender3DMeshDefinition,
  registry: Map<string, ThreeLikeMaterial>,
  fallback: ThreeLikeMaterial,
) {
  if (typeof material === "string") {
    const registered = registry.get(material);
    if (!registered) throw new Error(`Unknown 3D material: ${material}`);
    return registered;
  }
  return material ?? definition.material ?? fallback;
}

type ThreeBspInternalItem<TValue> = {
  value: TValue;
  center: MutableVec3;
  radius: number;
  min: MutableVec3;
  max: MutableVec3;
};

type ThreeBspNode<TValue> = {
  min: MutableVec3;
  max: MutableVec3;
  items?: ThreeBspInternalItem<TValue>[];
  left?: ThreeBspNode<TValue>;
  right?: ThreeBspNode<TValue>;
};

function normalizeThreeLodLevels(levels: readonly ThreeRender3DLodLevel[]): ThreeRender3DResolvedLodLevel[] {
  if (!levels.length) throw new Error("3D LOD policy requires at least one level");
  let previousMaxDistance = Number.NEGATIVE_INFINITY;
  return levels.map((level, index) => {
    const maxDistance = Number(level.maxDistance);
    if (!(maxDistance > 0 || maxDistance === Number.POSITIVE_INFINITY)) {
      throw new Error("3D LOD maxDistance must be greater than 0");
    }
    if (maxDistance <= previousMaxDistance) throw new Error("3D LOD maxDistance values must be strictly increasing");
    previousMaxDistance = maxDistance;
    return {
      index,
      maxDistance,
      ratio: assertLodRatio(level.ratio ?? 1, "3D LOD ratio"),
      mesh: level.mesh,
      material: level.material,
    };
  });
}

function isResolvedLodLevelList(
  levels: readonly ThreeRender3DLodLevel[] | readonly ThreeRender3DResolvedLodLevel[],
): levels is readonly ThreeRender3DResolvedLodLevel[] {
  return levels.length > 0 && "index" in levels[0] && "ratio" in levels[0];
}

function assertLodRatio(value: number, label: string) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) throw new Error(`${label} must be greater than 0 and at most 1`);
  return ratio;
}

function lodBakeKey(sourceKey: string, ratio: number) {
  if (!sourceKey.trim()) throw new Error("3D LOD bake source key must not be empty");
  return `${sourceKey}\0${assertLodRatio(ratio, "3D LOD bake ratio").toFixed(6)}`;
}

function resolveBufferGeometryConstructors(constructors?: Pick<ThreeModuleLike, "BufferGeometry" | "BufferAttribute">) {
  const THREELike = constructors ?? THREE as unknown as Pick<ThreeModuleLike, "BufferGeometry" | "BufferAttribute">;
  if (!THREELike.BufferGeometry) throw new Error("3D geometry simplification requires THREE.BufferGeometry");
  if (!THREELike.BufferAttribute) throw new Error("3D geometry simplification requires THREE.BufferAttribute");
  return {
    BufferGeometry: THREELike.BufferGeometry,
    BufferAttribute: THREELike.BufferAttribute,
  };
}

function assertVec3Like(value: ThreeRender3DVector3Like, label: string): MutableVec3 {
  if (Array.isArray(value) || typeof (value as ArrayLike<number>)?.[0] === "number") {
    return assertVec3(value as ThreeRender3DVector3, label);
  }
  const vector = value as Pick<ThreeLikeVector3, "x" | "y" | "z">;
  return [
    assertFiniteNumber(vector.x, `${label} x`),
    assertFiniteNumber(vector.y, `${label} y`),
    assertFiniteNumber(vector.z, `${label} z`),
  ];
}

function getBufferGeometryAttribute(geometry: ThreeLikeBufferGeometry, name: string) {
  return geometry.getAttribute?.(name) ?? geometry.attributes?.[name];
}

function cloneBufferGeometry<TGeometry extends ThreeLikeBufferGeometry>(geometry: TGeometry): TGeometry {
  return (geometry.clone?.() ?? geometry) as TGeometry;
}

function readGeometryIndices(geometry: ThreeLikeBufferGeometry, vertexCount: number) {
  const index = geometry.getIndex?.() ?? geometry.index ?? null;
  if (index?.array) return toUint32Array(index.array, index.count);
  const result = new Uint32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) result[index] = index;
  return result;
}

function toUint32Array(values: ArrayLike<number>, count = values.length) {
  const result = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) result[index] = Number(values[index] ?? 0);
  return result;
}

function resolveSimplifiedIndexTarget(indexCount: number, ratio: number, minTriangles: number) {
  const minIndexCount = Math.max(3, Math.floor(minTriangles) * 3);
  const target = Math.floor(indexCount * ratio / 3) * 3;
  return Math.max(minIndexCount, target);
}

function readPositionArray(position: ThreeLikeBufferAttribute) {
  if (position.array instanceof Float32Array && position.itemSize >= 3) return position.array;
  const result = new Float32Array(position.count * position.itemSize);
  for (let index = 0; index < result.length; index += 1) result[index] = Number(position.array[index] ?? 0);
  return result;
}

function simplifyGeometryIndices(
  geometry: ThreeLikeBufferGeometry,
  sourceIndices: Uint32Array,
  positions: Float32Array,
  positionStride: number,
  targetIndexCount: number,
  options: ThreeBufferGeometrySimplifyOptions,
  flags: readonly "LockBorder"[] | undefined,
) {
  const groups = (options.preserveGroups ?? true) ? validGeometryGroups(geometry, sourceIndices.length) : [];
  if (!groups.length) {
    const indices = MeshoptSimplifier.simplify(sourceIndices, positions, positionStride, targetIndexCount, options.targetError ?? 0.02, flags as ["LockBorder"] | undefined)[0];
    return { indices, groups: [] };
  }

  const output: number[] = [];
  const outputGroups: ThreeLikeBufferGeometryGroup[] = [];
  let remainingTarget = targetIndexCount;
  let remainingSource = groups.reduce((sum, group) => sum + group.count, 0);
  for (const group of groups) {
    const groupIndices = sourceIndices.slice(group.start, group.start + group.count);
    const groupTarget = Math.min(group.count, resolveSimplifiedIndexTarget(group.count, remainingTarget / Math.max(1, remainingSource), 1));
    const simplified = MeshoptSimplifier.simplify(groupIndices, positions, positionStride, groupTarget, options.targetError ?? 0.02, flags as ["LockBorder"] | undefined)[0];
    outputGroups.push({ start: output.length, count: simplified.length, materialIndex: group.materialIndex ?? 0 });
    output.push(...simplified);
    remainingTarget -= simplified.length;
    remainingSource -= groupIndices.length;
  }
  return { indices: new Uint32Array(output), groups: outputGroups };
}

function validGeometryGroups(geometry: ThreeLikeBufferGeometry, indexCount: number) {
  const groups = geometry.groups?.filter((group) => group.count >= 3 && group.start >= 0 && group.start + group.count <= indexCount) ?? [];
  return groups.map((group) => ({ ...group }));
}

function copySimplifiedAttributes(
  source: ThreeLikeBufferGeometry,
  target: ThreeLikeBufferGeometry,
  BufferAttribute: ThreeLikeBufferAttributeConstructor,
  remap: Uint32Array,
  uniqueVertexCount: number,
  options: ThreeBufferGeometrySimplifyOptions,
) {
  const sourceAttributes = source.attributes ?? {};
  const attributeNames = options.attributes ?? Object.keys(sourceAttributes);
  const recomputeNormals = options.computeVertexNormals ?? Boolean(sourceAttributes.normal);
  const missing = 2 ** 32 - 1;
  for (const name of attributeNames) {
    if (name === "normal" && recomputeNormals) continue;
    const attribute = getBufferGeometryAttribute(source, name);
    if (!attribute || attribute.isInterleavedBufferAttribute) continue;
    const itemSize = attribute.itemSize;
    if (attribute.count < remap.length || itemSize <= 0) continue;
    const array = createRemappedAttributeArray(attribute.array, uniqueVertexCount * itemSize);
    for (let oldIndex = 0; oldIndex < remap.length; oldIndex += 1) {
      const newIndex = remap[oldIndex];
      if (newIndex === missing) continue;
      const oldOffset = oldIndex * itemSize;
      const newOffset = newIndex * itemSize;
      for (let element = 0; element < itemSize; element += 1) array[newOffset + element] = Number(attribute.array[oldOffset + element] ?? 0);
    }
    target.setAttribute?.(name, new BufferAttribute(array, itemSize, attribute.normalized));
  }
}

type MutableNumericArray = ArrayLike<number> & { [index: number]: number };

function createRemappedAttributeArray(source: ArrayLike<number>, length: number): MutableNumericArray {
  if (source instanceof Float32Array) return new Float32Array(length);
  if (source instanceof Float64Array) return new Float64Array(length);
  if (source instanceof Uint8Array) return new Uint8Array(length);
  if (source instanceof Uint8ClampedArray) return new Uint8ClampedArray(length);
  if (source instanceof Uint16Array) return new Uint16Array(length);
  if (source instanceof Uint32Array) return new Uint32Array(length);
  if (source instanceof Int8Array) return new Int8Array(length);
  if (source instanceof Int16Array) return new Int16Array(length);
  if (source instanceof Int32Array) return new Int32Array(length);
  return new Float32Array(length);
}

function copySimplifiedGroups(target: ThreeLikeBufferGeometry, groups: readonly ThreeLikeBufferGeometryGroup[]) {
  if (!groups.length || !target.addGroup) return;
  target.clearGroups?.();
  for (const group of groups) {
    if (group.count >= 3) target.addGroup(group.start, group.count, group.materialIndex ?? 0);
  }
}

function resolveInstanceLodPosition(
  positions: ThreeRender3DInstancePositions | undefined,
  matrix: ArrayLike<number>,
  index: number,
): MutableVec3 {
  if (!positions) return [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0];
  if (isFlatVectorArray(positions)) {
    const offset = index * 3;
    if (offset + 2 >= positions.length) throw new Error("3D LOD positions length is smaller than instance count");
    return [positions[offset] ?? 0, positions[offset + 1] ?? 0, positions[offset + 2] ?? 0];
  }
  if (index >= positions.length) throw new Error("3D LOD positions length is smaller than instance count");
  return assertVec3(positions[index], `3D LOD instance position ${index}`);
}

function isFlatVectorArray(value: ThreeRender3DInstancePositions): value is ArrayLike<number> {
  return value.length === 0 || typeof value[0] === "number";
}

function normalizeBspItem<TValue>(item: ThreeBspTree3DItem<TValue>): ThreeBspInternalItem<TValue> {
  const center = assertVec3(item.center, "3D BSP item center");
  const radius = assertNonNegativeFinite(item.radius ?? 0, "3D BSP item radius");
  return {
    value: item.value,
    center,
    radius,
    min: [center[0] - radius, center[1] - radius, center[2] - radius],
    max: [center[0] + radius, center[1] + radius, center[2] + radius],
  };
}

function buildBspNode<TValue>(
  items: ThreeBspInternalItem<TValue>[],
  depth: number,
  maxLeafItems: number,
  maxDepth: number,
): ThreeBspNode<TValue> {
  const bounds = calculateBspBounds(items);
  if (items.length <= maxLeafItems || depth >= maxDepth) return { ...bounds, items };
  const axis = largestBspAxis(bounds.min, bounds.max);
  const sorted = [...items].sort((a, b) => a.center[axis] - b.center[axis]);
  const middle = Math.floor(sorted.length / 2);
  const leftItems = sorted.slice(0, middle);
  const rightItems = sorted.slice(middle);
  if (!leftItems.length || !rightItems.length) return { ...bounds, items };
  return {
    ...bounds,
    left: buildBspNode(leftItems, depth + 1, maxLeafItems, maxDepth),
    right: buildBspNode(rightItems, depth + 1, maxLeafItems, maxDepth),
  };
}

function calculateBspBounds<TValue>(items: readonly ThreeBspInternalItem<TValue>[]) {
  const min: MutableVec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: MutableVec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const item of items) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], item.min[axis]);
      max[axis] = Math.max(max[axis], item.max[axis]);
    }
  }
  return { min, max };
}

function largestBspAxis(min: MutableVec3, max: MutableVec3) {
  const x = max[0] - min[0];
  const y = max[1] - min[1];
  const z = max[2] - min[2];
  if (y >= x && y >= z) return 1;
  if (z >= x && z >= y) return 2;
  return 0;
}

function queryBspSphere<TValue>(node: ThreeBspNode<TValue>, center: MutableVec3, radius: number, out: TValue[]) {
  if (!sphereIntersectsBox(center, radius, node.min, node.max)) return;
  if (node.items) {
    for (const item of node.items) {
      const combinedRadius = radius + item.radius;
      if (distanceSquared3D(center, item.center) <= combinedRadius * combinedRadius) out.push(item.value);
    }
    return;
  }
  if (node.left) queryBspSphere(node.left, center, radius, out);
  if (node.right) queryBspSphere(node.right, center, radius, out);
}

function queryBspBox<TValue>(node: ThreeBspNode<TValue>, min: MutableVec3, max: MutableVec3, out: TValue[]) {
  if (!boxesIntersect(min, max, node.min, node.max)) return;
  if (node.items) {
    for (const item of node.items) {
      if (sphereIntersectsBox(item.center, item.radius, min, max)) out.push(item.value);
    }
    return;
  }
  if (node.left) queryBspBox(node.left, min, max, out);
  if (node.right) queryBspBox(node.right, min, max, out);
}

function sphereIntersectsBox(center: MutableVec3, radius: number, min: MutableVec3, max: MutableVec3) {
  return distancePointBoxSquared(center, min, max) <= radius * radius;
}

function distancePointBoxSquared(point: MutableVec3, min: MutableVec3, max: MutableVec3) {
  let sum = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const value = point[axis];
    const clamped = Math.max(min[axis], Math.min(max[axis], value));
    const delta = value - clamped;
    sum += delta * delta;
  }
  return sum;
}

function boxesIntersect(aMin: MutableVec3, aMax: MutableVec3, bMin: MutableVec3, bMax: MutableVec3) {
  return aMin[0] <= bMax[0] && aMax[0] >= bMin[0]
    && aMin[1] <= bMax[1] && aMax[1] >= bMin[1]
    && aMin[2] <= bMax[2] && aMax[2] >= bMin[2];
}

function distanceSquared3D(a: MutableVec3, b: MutableVec3) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

type ThreeMeshLike = ThreeLikeObject3D & {
  isMesh?: boolean;
  material?: ThreeLikeMaterial | ThreeLikeMaterial[];
  traverse?(visit: (object: ThreeMeshLike) => void): unknown;
};

function forEachThreeObject(root: ThreeLikeObject3D, visit: (object: ThreeLikeObject3D) => void) {
  const traversable = root as ThreeMeshLike;
  if (typeof traversable.traverse === "function") {
    traversable.traverse((object) => visit(object));
    return;
  }
  const stack = [root];
  while (stack.length) {
    const object = stack.pop();
    if (!object) continue;
    visit(object);
    for (const child of object.children ?? []) stack.push(child);
  }
}

function isThreeMeshLike(object: ThreeLikeObject3D) {
  return (object as ThreeMeshLike).isMesh === true;
}

function applyObjectScale(object: ThreeLikeObject3D, scale: number | ThreeRender3DVector3) {
  if (typeof scale === "number") {
    if (object.scale.setScalar) object.scale.setScalar(scale);
    else object.scale.set(scale, scale, scale);
    return;
  }
  object.scale.set(scale[0], scale[1], scale[2]);
}

function colorChannelToByte(value: number | undefined) {
  const channel = Number.isFinite(value) ? value as number : 1;
  return Math.max(0, Math.min(255, Math.round(channel * 255)));
}

function applyTransform(object: ThreeLikeObject3D, transform: ThreeRender3DTransform | undefined) {
  if (!transform) return;
  if (transform.position) object.position.set(transform.position[0], transform.position[1], transform.position[2]);
  if (transform.rotation) object.rotation.x = transform.rotation[0];
  if (transform.rotation) object.rotation.y = transform.rotation[1];
  if (transform.rotation) object.rotation.z = transform.rotation[2];
  if (transform.rotationY !== undefined) object.rotation.y = transform.rotationY;
  if (typeof transform.scale === "number") {
    if (object.scale.setScalar) object.scale.setScalar(transform.scale);
    else object.scale.set(transform.scale, transform.scale, transform.scale);
  } else if (transform.scale) {
    object.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
  }
  object.updateMatrix?.();
}

function inferMatrixCount(matrices: ThreeRender3DInstanceMatrices) {
  if (isFlatMatrixArray(matrices)) return Math.floor(matrices.length / 16);
  return matrices.length;
}

function resolveMatrixElements(matrices: ThreeRender3DInstanceMatrices, index: number): ArrayLike<number> {
  if (isFlatMatrixArray(matrices)) return sliceMatrix(matrices, index * 16);
  const matrix = matrices[index];
  if (isMatrixLike(matrix)) return matrix.elements;
  return matrix;
}

function isFlatMatrixArray(value: ThreeRender3DInstanceMatrices): value is ArrayLike<number> {
  return value.length === 0 || typeof value[0] === "number";
}

function isMatrixLike(value: ArrayLike<number> | ThreeRender3DMatrixLike): value is ThreeRender3DMatrixLike {
  return typeof value === "object" && value !== null && "elements" in value;
}

function sliceMatrix(values: ArrayLike<number>, offset: number) {
  const result = new Array<number>(16);
  for (let index = 0; index < 16; index += 1) result[index] = values[offset + index] ?? 0;
  return result;
}

function clearGroup(group: ThreeLikeObject3D) {
  const children = [...(group.children ?? [])];
  if (children.length) group.remove(...children);
}

function renderCallKey(
  call: ThreeRender3DCall,
  definition: ThreeRender3DMeshDefinition,
  material: ThreeLikeMaterial,
  count: number,
) {
  return `${call.kind}:${call.mesh}:${objectKey(definition.geometry)}:${objectKey(material)}:${count}`;
}

function objectKey(value: object) {
  let id = objectIds.get(value);
  if (!id) {
    id = nextObjectId;
    nextObjectId += 1;
    objectIds.set(value, id);
  }
  return id;
}

function assertUsableId(id: string, label: string) {
  if (!id.trim()) throw new Error(`3D ${label} id must not be empty`);
}

function normalizePixelRatioCap(value: number | undefined) {
  if (value === undefined) return 2;
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
}

function assertFiniteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function assertPositiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0`);
  return value;
}

function positiveFiniteOrDefault(value: number | undefined, fallback: number, label: string) {
  return value === undefined ? fallback : assertPositiveFinite(value, label);
}

function assertNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be 0 or greater`);
  return value;
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function wrapAxis(value: number, origin: number, size: number) {
  return positiveModulo(value - origin, size) + origin;
}

function shortestToroidalAxisDelta(delta: number, size: number) {
  const half = size / 2;
  const wrapped = positiveModulo(delta + half, size) - half;
  return wrapped === -half && delta > 0 ? half : wrapped;
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function resolvePixelRatio(cap: number) {
  const rawRatio = typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1;
  return Math.min(cap, Math.max(1, rawRatio));
}

function resolveThreeAddonUrl(moduleUrl: string, path: string) {
  if (/^https?:\/\//.test(path) || path.startsWith("/") || path.startsWith("data:")) return path;
  const cleanPath = path.replace(/^\/+/, "");
  if (moduleUrl === "three") return `https://esm.sh/three@0.163.0/${cleanPath}?external=three`;
  if (moduleUrl.includes("esm.sh/three@")) return `${moduleUrl.replace(/\/+$/, "")}/${cleanPath}?external=three`;
  return new URL(cleanPath, moduleUrl.endsWith("/") ? moduleUrl : `${moduleUrl}/`).href;
}
