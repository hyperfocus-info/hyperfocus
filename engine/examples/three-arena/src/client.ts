import {
  createFixedGridSpatialIndex,
  createFrameMetrics,
  createFixedStepDriver,
  createGamepadSession,
  type FixedGridSpatialIndex,
  type MetricSummary
} from "@hyperfocus/engine";
import { updateTimedEffectQueue } from "@hyperfocus/engine/render";
import { applyEngineUiTheme, createRovingFocusController } from "@hyperfocus/engine/ui";
import type * as Three from "three";
import type { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createAssetLoadSnapshot,
  createAssetLoader,
  createAssetLoaderUi,
  createSmoothedAssetProgress,
  progressFromLoadEvent,
  runAssetLoaderRafLoop,
  type AssetLoadSnapshot,
  type AssetLoadTaskContext
} from "@hyperfocus/engine/assets/loader";
import {
  clonePreparedThreeObject,
  createCameraRig,
  createSolidThreeTexture,
  createThreeBspTree3D,
  createThreeSkybox3D,
  createThreeRender3D,
  createThreeResourceCache,
  createThreeWorldTextOverlay3D,
  createToroidalWorld3D,
  loadFirstThreeAsset,
  loadThreeLoaderAsset,
  prepareThreeObject3D,
  simplifyThreeBufferGeometry,
  type CameraRig,
  type ThreeBspTree3D,
  type ThreeDisposableResource,
  type ThreeModuleLike,
  type ThreeRender3DAnimationController,
  type ThreeResourceCache,
  type ThreeWorldTextOverlay3D
} from "@hyperfocus/engine/render/3d";
import { ARENA_DATA } from "./arena-data.ts";
import { createArenaAudioRuntime } from "./audio-runtime.ts";
import * as lobbyNetwork from "./network.ts";
import {
  createThreeArenaPlayerMotion,
  type ThreeArenaPlayerMotion,
  type ThreeArenaPlayerMotionSnapshot,
} from "./player-motion.ts";

const PERF_QUERY = new URLSearchParams(location.search.replace(/%3B/gi, "&").replace(/;/g, "&"));
const PERF_FLAGS = {
  batchPickups: readPerfFlag("batchPickups", true),
  batchParticles: readPerfFlag("batchParticles", true),
  propCollisionGrid: readPerfFlag("propCollisionGrid", true) || PERF_QUERY.get("allowSlowPropCollision") !== "1",
  staticPropBsp: readPerfFlag("staticPropBsp", true),
  staticPropLod: readPerfFlag("staticPropLod", false),
  staticModelProps: readPerfFlag("staticModelProps", false),
  benchWalkOnly: readPerfFlag("benchWalkOnly", false),
  benchNoLevelChoices: readPerfFlag("benchNoLevelChoices", false),
  benchInvulnerable: readPerfFlag("benchInvulnerable", false),
  telemetryPanel: readPerfFlag("telemetryPanel", true),
  shadows: readPerfFlag("shadows", true),
  maxAnimatedEnemies: Math.max(0, Math.floor(readPerfNumber("animatedEnemies", 4))),
  enemyTerrainBudget: readPerfNumber("enemyTerrainBudget", 32),
  enemyTerrainNearRadius: readPerfNumber("enemyTerrainNearRadius", 16),
  enemyDenseTerrainNearRadius: readPerfNumber("enemyDenseTerrainNearRadius", 8),
  enemyTerrainStepSeconds: readPerfNumber("enemyTerrainStepSeconds", 0.16),
  farEnemyPropCollision: readPerfFlag("farEnemyPropCollision", true),
  enemyHealthBars: readPerfFlag("enemyHealthBars", true),
  enemyBillboardFrameStep: Math.max(1, Math.floor(readPerfNumber("enemyBillboardFrameStep", 1))),
  pulseRingsBatched: readPerfFlag("pulseRingsBatched", false)
};
applyEngineUiTheme(document.documentElement, {
  surface: "#080b0d",
  surfaceAlt: "#111a14",
  border: "rgba(190, 228, 160, 0.28)",
  accent: "#d7ff8d",
  accentText: "#06100a",
  text: "#eef5ed",
  muted: "#dbefcf",
  danger: "#ff6658",
  success: "#a8ff7d",
  focusRing: "rgba(171, 221, 126, 0.45)",
  controlSurface: "rgba(39, 59, 43, 0.92)",
  controlSurfaceHover: "rgba(61, 91, 62, 0.96)",
  controlBorder: "rgba(202, 226, 183, 0.35)",
  controlText: "#f3ffe7",
  inputSurface: "rgba(8, 13, 11, 0.86)",
  radius: "0px",
  shadow: "0 8px 22px rgba(0, 0, 0, 0.3)"
});
function readPerfFlag(name: string, fallback: boolean): boolean {
  const value = PERF_QUERY.get(name);
  if (value === null) return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}
function readPerfNumber(name: string, fallback: number): number {
  const raw = PERF_QUERY.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
const bootUi = createAssetLoaderUi({
  title: "Three Arena",
  subtitle: "Preparing graveyard assets",
  backgroundImage: 'url("./assets/source/kenney/graveyard-kit/Sample.png")',
  zIndex: 12,
  palette: {
    accent: "#d7ff8d",
    accentAlt: "#7bd6ff",
    border: "rgba(226, 244, 185, 0.38)"
  }
});
bootUi.attach();
const bootSmoother = createSmoothedAssetProgress({ speed: 6.6, completeSpeed: 13, minAdvancePerSecond: 0.035 });
let bootSnapshot: AssetLoadSnapshot = createAssetLoadSnapshot({
  status: "loading",
  total: 1,
  label: "Preparing arena",
  activeLabel: "Starting renderer",
  startedAt: performance.now(),
  updatedAt: performance.now()
});
const bootLoop = runAssetLoaderRafLoop({
  read: () => bootSnapshot,
  smoother: bootSmoother,
  render: (snapshot) => bootUi.render(snapshot)
});
type ThreeNamespace = typeof import("three");
type FbxLoaderModule = typeof import("three/examples/jsm/loaders/FBXLoader.js");
type GltfLoaderModule = typeof import("three/examples/jsm/loaders/GLTFLoader.js");
type SkeletonUtilsModule = typeof import("three/examples/jsm/utils/SkeletonUtils.js");
type LocalThreeModules = {
  three: ThreeNamespace;
  FBXLoader: FbxLoaderModule["FBXLoader"];
  GLTFLoader: GltfLoaderModule["GLTFLoader"];
  skeletonUtils: SkeletonUtilsModule;
};
let localThreeModules: LocalThreeModules | null = null;
const bootLoader = createAssetLoader([{
  id: "renderer",
  label: "Starting renderer",
  weight: 1.2,
  async load(context) {
    context.reportProgress(0.18, "Importing Three.js");
    const [three, fbxModule, gltfModule, skeletonUtils] = await Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/FBXLoader.js"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/utils/SkeletonUtils.js")
    ]);
    localThreeModules = {
      three,
      FBXLoader: fbxModule.FBXLoader,
      GLTFLoader: gltfModule.GLTFLoader,
      skeletonUtils
    };
    const view = await createThreeRender3D({
      backend: "webgl2",
      pixelRatioCap: 2,
      shadows: PERF_FLAGS.shadows,
      three: requireEngineThreeModule(three)
    });
    context.reportProgress(1, "Renderer ready");
    return view;
  }
}], {
  label: "Preparing arena",
  concurrency: 1,
  onSnapshot(snapshot) {
    bootSnapshot = snapshot;
  }
});
const bootRenderer = await bootLoader.loadAsset<Awaited<ReturnType<typeof createThreeRender3D>>>("renderer");
const threeView = bootRenderer;

function requireLocalThreeModules(): LocalThreeModules {
  if (!localThreeModules) throw new Error("Three Arena local runtime modules were not loaded.");
  return localThreeModules;
}

const runtimeThreeModules = requireLocalThreeModules();

function isCompleteThreeNamespace(value: object): value is ThreeNamespace {
  return "Vector2" in value
    && "Vector3" in value
    && "Quaternion" in value
    && "Raycaster" in value
    && "WebGLRenderer" in value
    && "AnimationMixer" in value;
}

function isEngineThreeModule(value: object): value is ThreeModuleLike {
  return "WebGLRenderer" in value
    && typeof value.WebGLRenderer === "function"
    && "Scene" in value
    && typeof value.Scene === "function"
    && "Group" in value
    && typeof value.Group === "function"
    && "PerspectiveCamera" in value
    && typeof value.PerspectiveCamera === "function"
    && "OrthographicCamera" in value
    && typeof value.OrthographicCamera === "function"
    && "Color" in value
    && typeof value.Color === "function"
    && "Mesh" in value
    && typeof value.Mesh === "function"
    && "InstancedMesh" in value
    && typeof value.InstancedMesh === "function";
}

function requireEngineThreeModule(value: ThreeNamespace): ThreeModuleLike {
  if (!isEngineThreeModule(value)) throw new Error("Three Arena requires the complete local Three.js renderer module.");
  return value;
}

function requireCompleteThreeNamespace(value: object): ThreeNamespace {
  if (!isCompleteThreeNamespace(value)) {
    throw new Error("Three Arena requires the complete Three.js module.");
  }
  return value;
}
const THREE = requireCompleteThreeNamespace(threeView.THREE);

type RuntimeConstructor<T> = abstract new (...args: never[]) => T;

function requireRuntimeInstance<T>(value: unknown, constructor: RuntimeConstructor<T>, label: string): T {
  if (!(value instanceof constructor)) throw new Error(`${label} has an unexpected runtime type.`);
  return value;
}
let bootTaskContext: AssetLoadTaskContext | null = null;
const MAP_LINEAR_MULTIPLIER = 10;
const CAMERA_VIEW_RADIUS = 72;
const STATIC_VISIBILITY_RADIUS = 128;
const STATIC_VISIBILITY_QUERY_RADIUS = STATIC_VISIBILITY_RADIUS * Math.SQRT2;
const STATIC_PROP_LOD_MID_DISTANCE = 15;
const STATIC_PROP_LOD_LOW_DISTANCE = 30;
const STATIC_PROP_LOD_MID_RATIO = 0.5;
const STATIC_PROP_LOD_LOW_RATIO = 0.25;
const LAZY_PROP_INITIAL_RADIUS = STATIC_VISIBILITY_RADIUS * 0.78;
const LAZY_PROP_NEAR_RADIUS = STATIC_VISIBILITY_RADIUS * 0.96;
const LAZY_PROP_AHEAD_RADIUS = STATIC_VISIBILITY_RADIUS + 126;
const LAZY_PROP_AHEAD_DOT = -0.12;
const MINIMAP_RANGE = 150;
const MINIMAP_UPDATE_INTERVAL = 0.2;
const MINIMAP_MAX_PICKUPS = 120;
const MINIMAP_MAX_ENEMIES = 180;
const HUD_UPDATE_INTERVAL = 0.12;
const TELEMETRY_UPDATE_INTERVAL = 0.5;
const TELEMETRY_SAMPLE_COUNT = 360;
const TELEMETRY_FRAME_BUDGET_MS = 1000 / 60;
const TELEMETRY_PHASE_NAMES = [
  "pollGamepad",
  "wave",
  "player",
  "passive",
  "weapons",
  "weaponZones",
  "enemies",
  "bullets",
  "pickups",
  "effects",
  "ragdolls",
  "bossAttacks",
  "attackIndicators",
  "hazards",
  "network",
  "combo",
  "audio",
  "hud",
  "minimap",
  "cameraLights",
  "propGlows",
  "groundTiles",
  "staticVisuals",
  "cameraRig",
  "visualIndicators",
  "floatingTexts",
  "propCollisionQuery",
  "propCollisionResolve",
  "enemyMove",
  "enemyTerrainCollision",
  "enemyAnimation",
  "enemyHealthBars",
  "enemyBillboards",
  "particleSpawnBatched",
  "particleSpawnScene",
  "particleUpdateBatched",
  "particleUpdateScene",
  "bulletTargeting",
  "bulletHits",
  "weaponFire",
  "enemySpawn"
];
const STATIC_WRAP_UPDATE_INTERVAL = 0.08;
const STATIC_WRAP_MOVE_THRESHOLD = 1.4;
const PROP_COLLISION_CELL_SIZE = 18;
const ENEMY_SPATIAL_CELL_SIZE = 18;
const LAZY_PROP_REVEAL_BUDGET = 10;
const OPTIONAL_MODEL_UPGRADE_BUDGET_MS = 4;
const GROUND_TILE_SIZE = 3.8;
const GROUND_TILE_PATCH_AXIS = 39;
const GROUND_TILE_BASE_HEIGHT = 0.026;
const TERRAIN_HILL_HEIGHT = 15.5;
const TERRAIN_HILL_FREQUENCY = 0.0105;
const TERRAIN_MOUNTAIN_HEIGHT = 19.5;
const TERRAIN_START_CLEAR_RADIUS = 42;
const TERRAIN_PLATFORM_CELL_SIZE = 66;
const TERRAIN_PLATFORM_DENSITY = 0.31;
const TERRAIN_PLATFORM_RADIUS_MIN = 10.5;
const TERRAIN_PLATFORM_RADIUS_MAX = 20.5;
const TERRAIN_PLATFORM_HEIGHT_MIN = 12;
const TERRAIN_PLATFORM_HEIGHT_MAX = 27;
const TERRAIN_PLATFORM_EDGE_PAD = 1.15;
const TERRAIN_GRADIENT_SAMPLE = 1.85;
const TERRAIN_HEIGHT_CACHE_STEP = 0.5;
const TERRAIN_CACHE_KEY_STRIDE = 8192;
const TERRAIN_HEIGHT_CACHE_MAX_ENTRIES = 4096;
const TERRAIN_PLATFORM_CELL_CACHE_MAX_ENTRIES = 4096;
const TERRAIN_WALKABLE_SLOPE_RATIO = Math.tan(Math.PI / 4);
const TERRAIN_UPHILL_POSITION_LOSS = 0.34;
const TERRAIN_DOWNHILL_ACCELERATION = 12.5;
const TERRAIN_SLIDE_ACCELERATION = 17.5;
const TERRAIN_DROP_AIR_HEIGHT = 3.2;
const TERRAIN_WALL_RUN_TRANSFER = 0.82;
const TERRAIN_WALL_RUN_SECONDS = 0.36;
const TERRAIN_PLATFORM_LAND_SNAP = 0.32;
const TRAVERSAL_TOOL_COUNT = 25;
const TRAVERSAL_TOOL_TRIGGER_RADIUS = 3.2;
const TRAVERSAL_TOOL_COOLDOWN_SECONDS = 1.35;
const TRAVERSAL_TOOL_TYPES = ["spring", "floatPlatform", "zipline", "teleporter", "windLift"] as const;
const MAX_ANIMATED_ENEMIES = PERF_FLAGS.maxAnimatedEnemies;
const ENEMY_BILLBOARD_BATCH_CAPACITY = 768;
const ENEMY_TERRAIN_NEAR_RADIUS = 16;
const ENEMY_TERRAIN_DENSE_NEAR_RADIUS = 8;
const ENEMY_TERRAIN_STEP_SECONDS = 0.16;
const ENEMY_TERRAIN_UPDATE_BUDGET_PER_FRAME = 32;
const ANIMATED_ENEMY_DENSE_COUNT = 120;
const ANIMATED_ENEMY_DENSE_MESH_BUDGET = 8;
const ANIMATED_ENEMY_DENSE_MESH_RADIUS = 34;
const PICKUP_BATCH_CAPACITY = 768;
const PARTICLE_POOL_CAPACITY = 8192;
const ENEMY_ANIMATION_STEP_SECONDS = 0.08;
const BOSS_ANIMATION_STEP_SECONDS = 0.04;
const PICKUP_LIGHT_POOL_SIZE = 6;
const PROP_READABILITY_SCALE = 1.75;
const RUIN_IMPORT_TARGET_MAX_DIMENSION = 1.25;
const LARGE_IMPORT_TARGET_MAX_DIMENSION = 1.4;
const PLAYER_HEIGHT_WORLD = 3.9;
const PLAYER_MODEL_SCALE = 0.03;
const PLAYER_RADIUS = 1;
const PROJECTILE_HEIGHT_OFFSET = 1.28;
const PROJECTILE_VERTICAL_HIT_PAD = 0.78;
const PLAYER_GRAVITY_BASE = 11.8;
const PLAYER_GRAVITY = PLAYER_GRAVITY_BASE * 1.5 * 1.33 * 2;
const PLAYER_JUMP_HEIGHT_MULTIPLIER = 3;
const PLAYER_JUMP_VELOCITY_BASE = 7.4;
const PLAYER_DOUBLE_JUMP_VELOCITY_BASE = 6.6;
const PLAYER_JUMP_POWER_MULTIPLIER = 1.5;
const PLAYER_JUMP_VELOCITY = PLAYER_JUMP_VELOCITY_BASE * Math.sqrt(PLAYER_JUMP_HEIGHT_MULTIPLIER * (PLAYER_GRAVITY / PLAYER_GRAVITY_BASE)) * PLAYER_JUMP_POWER_MULTIPLIER;
const PLAYER_DOUBLE_JUMP_VELOCITY = PLAYER_DOUBLE_JUMP_VELOCITY_BASE * Math.sqrt(PLAYER_JUMP_HEIGHT_MULTIPLIER * (PLAYER_GRAVITY / PLAYER_GRAVITY_BASE)) * PLAYER_JUMP_POWER_MULTIPLIER;
const PLAYER_MAX_JUMPS = 2;
const PLAYER_AIRBORNE_HIT_CLEARANCE = 0.85;
const PLAYER_AIR_TRAIL_INTERVAL = 0.045;
const PLAYER_DAMAGE_IMMUNE_SECONDS = 1;
const PLAYER_MOMENTUM_BUILD_SECONDS = 0.18;
const PLAYER_MOMENTUM_DAMP_SECONDS = 0.5;
const PLAYER_MOMENTUM_DUST_THRESHOLD = 0.8;
const PLAYER_MOMENTUM_DUST_INTERVAL = 0.25;
const PLAYER_MOMENTUM_SPEED_BONUS_MULTIPLIER = 1;
const PLAYER_KNOCKBACK_DECAY = 8.4;
const PLAYER_KNOCKBACK_STOP_SPEED = 0.04;
const PLAYER_CONTACT_KNOCKBACK_BASE = 14;
const ENEMY_CONTACT_DAMAGE_MIN = 25;
const ENEMY_CONTACT_DAMAGE_MAX = 75;
const HAZARD_DAMAGE_TICK_SECONDS = 0.5;
const HEALTH_VIAL_DROP_MULTIPLIER = 0.2;
const MAGNET_DROP_CHANCE = 0.075;
const MAGNET_PICKUP_SECONDS = 4.25;
const MAGNET_PICKUP_SPEED = 92;
const BLACK_GARLIC_COOLDOWN_MULTIPLIER = 0.5;
const BLACK_GARLIC_RANGE_MULTIPLIER = 1.5;
const PICKUP_VISUAL_SCALE_MULTIPLIER = 3;
const PICKUP_COLLECT_RADIUS_MULTIPLIER = 4.5;
const CAMERA_BASE_DISTANCE = 55;
const CAMERA_DEFAULT_PITCH = 0.72;
const CAMERA_MIN_PITCH = 0.18;
const CAMERA_MAX_PITCH = 1.15;
const CAMERA_MIN_DISTANCE = 22;
const CAMERA_MAX_DISTANCE = 82;
const CAMERA_TARGET_HEIGHT = 1.45;
const CAMERA_LOOK_AT_HEIGHT = 0.28;
const CAMERA_MOUSE_YAW_SPEED = 0.00192;
const CAMERA_MOUSE_PITCH_SPEED = 0.00168;
const CAMERA_STICK_YAW_SPEED = 1.62;
const CAMERA_STICK_PITCH_SPEED = 1.35;
const CAMERA_FOLLOW_SMOOTHING_SECONDS = 0.37;
const CAMERA_ROTATION_SMOOTHING_SECONDS = 0.25;
const CAMERA_DISTANCE_SMOOTHING_SECONDS = 0.43;
const CAMERA_COLLISION_SMOOTHING_SECONDS = 0.27;
const CAMERA_OBSTACLE_RADIUS = 1.15;
const CAMERA_OBSTACLE_MIN_DISTANCE = 8;
const CAMERA_AIM_DISTANCE = 18;
const CAMERA_OCCLUDER_FADE_OPACITY = 0.12;
const CAMERA_OCCLUDER_FADE_EXTRA_RADIUS = 1.6;
const PICKUP_COLLECT_RADIUS = 3.08 * PICKUP_COLLECT_RADIUS_MULTIPLIER;
const ENEMY_HEALTH_BASE_MULTIPLIER = 3.2;
const KNOCKBACK_DECAY = 10.5;
const KNOCKBACK_STOP_SPEED = 0.03;
const HEALTH_BAR_VISIBLE_SECONDS = 2.4;
const PROP_COLLISION_PUSH_EPSILON = 0.02;
const COMBO_TIMEOUT_SECONDS = 2.45;
const FLOAT_TEXT_LIFE_SECONDS = 0.82;
const SYNTH_MASTER_VOLUME = 0.48;
const SPAWN_PACING = {
  rampSeconds: 600,
  minRateMultiplier: 2,
  maxRateMultiplier: 10,
  minSpawnIntervalSeconds: 0.075,
  activeCapMultiplierAtMax: 1.85,
  hardActiveEnemyCap: 260
};
const BOSS_PACING = {
  firstBossSecond: 60,
  intervalSeconds: 60,
  sizeMultiplier: 2.5,
  healthMultiplier: 10,
  speedMultiplier: 0.72,
  contactDamageMultiplier: 1.35,
  maxActiveBosses: 3
};
const BOSS_ATTACKS = {
  firstAttackDelaySeconds: 2.5,
  cooldownSeconds: 5.2,
  cooldownMinSeconds: 3.1,
  windupSeconds: 1.15,
  hitFlashSeconds: 0.18,
  slamRadiusMultiplier: 3.2,
  dashLength: 16,
  dashWidthMultiplier: 1.6,
  novaRadius: 5.5
};
const COMBAT_VISUALS = {
  aimConeLength: 18,
  aimConeHalfAngle: 0.22,
  targetLockRange: 38,
  offscreenArrowRange: CAMERA_VIEW_RADIUS * 1.18,
  maxOffscreenArrows: 8
};
const COMBAT_BULLET_CAP = 240;
const SPECIAL_WEAPON_OBJECT_CAPS: Partial<Record<string, number>> = {
  orbit: 28,
  plagueVial: 24,
  plaguePool: 36,
  moldBloom: 36,
  boomerang: 18,
  bat: 42,
  pulse: 18
};

const FALLBACK_DATA = {
  arena: { radius: 48, softRadius: 42, spawnRadius: 52 },
  weapons: [
    { id: "pistol", name: "Pistol", label: "P", fantasy: "Old iron for opening one clean lane.", cooldown: 0.36, damage: 13, speed: 28, range: 26, pellets: 1, spread: 0.02, pierce: 1, knockback: 4.4, color: "#ffd782" },
    { id: "shotgun", name: "Shotgun", label: "SG", fantasy: "Short blast for when the dead reach your boots.", cooldown: 0.88, damage: 9, speed: 23, range: 18, pellets: 6, spread: 0.52, pierce: 1, knockback: 7.2, color: "#ffb36b" },
    { id: "smg", name: "SMG", label: "SM", fantasy: "Fast teeth for holding a moving lane.", cooldown: 0.13, damage: 6, speed: 31, range: 22, pellets: 1, spread: 0.12, pierce: 1, knockback: 2.1, color: "#d8f7ff" },
    { id: "rifle", name: "Rifle", label: "RF", fantasy: "Long shot for the biggest corpse in the row.", cooldown: 0.72, damage: 28, speed: 36, range: 34, pellets: 1, spread: 0.01, pierce: 3, knockback: 10.8, color: "#f8f0aa" },
    { id: "flame", name: "Flame", label: "FL", fantasy: "Close fire for packs that ignore the fence.", cooldown: 0.08, damage: 4, speed: 14, range: 10, pellets: 2, spread: 0.72, pierce: 2, knockback: 1.4, color: "#ff713d" }
  ],
  enemies: {
    shambler: { name: "Shambler", hp: 28, speed: 4.2, touch: 8, radius: 1.05, score: 1, texture: "zombieA" },
    sprinter: { name: "Runner", hp: 18, speed: 6.8, touch: 7, radius: 0.92, score: 2, texture: "zombieB" },
    brute: { name: "Brute", hp: 92, speed: 3.1, touch: 18, radius: 1.45, score: 6, texture: "brute" },
    shade: { name: "Shade", hp: 42, speed: 5.4, touch: 11, radius: 0.88, score: 4, texture: "shade" }
  },
  waves: [
    { at: 0, name: "Grave Surge", mix: [["shambler", 1]], rate: 1.1, cap: 38 },
    { at: 35, name: "Rot Runners", mix: [["shambler", 0.78], ["sprinter", 0.22]], rate: 0.82, cap: 54 },
    { at: 75, name: "Crypt Break", mix: [["shambler", 0.58], ["sprinter", 0.3], ["brute", 0.12]], rate: 0.58, cap: 76 },
    { at: 130, name: "Moonless Push", mix: [["sprinter", 0.36], ["brute", 0.2], ["shade", 0.44]], rate: 0.42, cap: 98 }
  ],
  hazards: [
    { id: "mist-a", kind: "rotMist", x: -18, z: -12, radius: 4.8, dps: 5 },
    { id: "mist-b", kind: "rotMist", x: 22, z: 11, radius: 5.3, dps: 5 },
    { id: "spikes-a", kind: "boneSpikes", x: -5, z: 24, radius: 3.8, dps: 9 },
    { id: "spikes-b", kind: "boneSpikes", x: 27, z: -20, radius: 3.4, dps: 9 }
  ],
  props: [
    { model: "gravestone-a", x: -15, z: -25, rot: 0.4, scale: 1.4 },
    { model: "gravestone-b", x: -5, z: -25, rot: 0.1, scale: 1.3 },
    { model: "grave", x: -20, z: 11, rot: -0.12, scale: 1.15 },
    { model: "gravestone-a", x: -17, z: 14, rot: 0.22, scale: 1.15 },
    { model: "grave", x: -10, z: 13, rot: 0.08, scale: 1.1 },
    { model: "gravestone-b", x: -7, z: 16, rot: -0.16, scale: 1.1 },
    { model: "grave", x: 10, z: -17, rot: 0.12, scale: 1.1 },
    { model: "gravestone-a", x: 14, z: -15, rot: -0.22, scale: 1.18 },
    { model: "grave", x: 20, z: -13, rot: -0.04, scale: 1.12 },
    { model: "gravestone-b", x: 23, z: -16, rot: 0.18, scale: 1.08 },
    { model: "crypt", x: 18, z: -23, rot: 0.85, scale: 1.8 },
    { model: "ruin-arch", x: -31, z: -29, rot: -0.25, scale: 1.4 },
    { model: "ruin-column", x: 31, z: -27, rot: 0.5, scale: 1.55 },
    { model: "ruin-wall", x: 29, z: 29, rot: 0.15, scale: 1.45 },
    { model: "coffin", x: 25, z: -6, rot: -0.5, scale: 1.4 },
    { model: "shovel", x: 22, z: -4, rot: 0.5, scale: 1.25 },
    { model: "pine", x: -30, z: 17, rot: 0, scale: 2.2 },
    { model: "pine", x: 33, z: 21, rot: 0.3, scale: 1.8 },
    { model: "tree-log", x: -22, z: 29, rot: -0.45, scale: 1.4 },
    { model: "rock-a", x: -12, z: 25, rot: 0.2, scale: 1.2 },
    { model: "rock-b", x: 30, z: 4, rot: -0.5, scale: 1.3 },
    { model: "rocks", x: -31, z: -14, rot: 0.4, scale: 1.25 },
    { model: "grass-large", x: -8, z: -15, rot: 0.2, scale: 1.8 },
    { model: "grass-large", x: 7, z: 18, rot: -0.3, scale: 1.55 },
    { model: "grass", x: 17, z: 5, rot: 0.5, scale: 1.5 },
    { model: "barrel", x: 5, z: 27, rot: 0.2, scale: 1.2 },
    { model: "cross", x: -28, z: -6, rot: -0.1, scale: 1.3 },
    { model: "lantern", x: -10, z: -8, rot: 0.2, scale: 1.4 },
    { model: "lantern", x: -2, z: 9, rot: 0.3, scale: 1.25 },
    { model: "lantern", x: 12, z: 9, rot: -0.4, scale: 1.4 },
    { model: "lantern", x: 8, z: -13, rot: -0.2, scale: 1.25 },
    { model: "lantern", x: 30, z: -18, rot: 0.6, scale: 1.2 },
    { model: "campfire", x: -25, z: 25, rot: 0, scale: 1.6 },
    { model: "campfire", x: 24, z: 18, rot: 0.2, scale: 1.35 },
    { model: "pumpkin", x: 20, z: 26, rot: 0.4, scale: 1.3 },
    { model: "fence", x: -36, z: 0, rot: Math.PI / 2, scale: 2.1 },
    { model: "fence", x: 36, z: 0, rot: Math.PI / 2, scale: 2.1 },
    { model: "stone-wall", x: -18, z: 31, rot: 0, scale: 1.7 },
    { model: "stone-wall", x: -7, z: 31, rot: 0, scale: 1.7 },
    { model: "stone-wall", x: 15, z: 31, rot: 0, scale: 1.7 },
    { model: "fence-doorway", x: 4, z: 31, rot: 0, scale: 1.7 }
  ],
  objectives: [
    "Kite the first grave hands. Grab blue shards before they sink.",
    "Runners are cutting circles. Break one lane and leave through it.",
    "Brutes are breaking stone. Step out before the ring lands.",
    "Shades have the center. Keep one escape lane open."
  ]
};

function requiredHtmlElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Required HTML element not found: ${selector}`);
  return element;
}

function requiredButton(selector: string): HTMLButtonElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Required button not found: ${selector}`);
  return element;
}

function requiredInput(selector: string): HTMLInputElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Required input not found: ${selector}`);
  return element;
}

function requiredCanvas(selector: string): HTMLCanvasElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`Required canvas not found: ${selector}`);
  return element;
}

const ui = {
  hud: requiredHtmlElement("#hud"),
  menu: requiredHtmlElement("#menu"),
  soloButton: requiredButton("#soloButton"),
  onlineButton: requiredButton("#onlineButton"),
  loadoutConfigButton: requiredButton("#loadoutConfigButton"),
  playerName: requiredInput("#playerName"),
  createRoomButton: requiredButton("#createRoomButton"),
  startRoomButton: requiredButton("#startRoomButton"),
  refreshRoomsButton: requiredButton("#refreshRoomsButton"),
  roomList: requiredHtmlElement("#roomList"),
  lobbyStatus: requiredHtmlElement("#lobbyStatus"),
  hpText: requiredHtmlElement("#hpText"),
  hpFill: requiredHtmlElement("#hpFill"),
  killsText: requiredHtmlElement("#killsText"),
  waveText: requiredHtmlElement("#waveText"),
  levelText: requiredHtmlElement("#levelText"),
  xpText: requiredHtmlElement("#xpText"),
  xpFill: requiredHtmlElement("#xpFill"),
  modeText: requiredHtmlElement("#modeText"),
  classText: requiredHtmlElement("#classText"),
  objectiveText: requiredHtmlElement("#objectiveText"),
  weaponText: requiredHtmlElement("#weaponText"),
  passiveText: requiredHtmlElement("#passiveText"),
  toast: requiredHtmlElement("#toast"),
  fxOverlay: requiredHtmlElement("#fxOverlay"),
  comboText: requiredHtmlElement("#comboText"),
  centerBanner: requiredHtmlElement("#centerBanner"),
  classGrid: requiredHtmlElement("#classGrid"),
  classProgressText: requiredHtmlElement("#classProgressText"),
  classProgressFill: requiredHtmlElement("#classProgressFill"),
  loadoutSummary: requiredHtmlElement("#loadoutSummary"),
  loadoutPanel: requiredHtmlElement("#loadoutPanel"),
  loadoutWeaponGrid: requiredHtmlElement("#loadoutWeaponGrid"),
  loadoutPassiveGrid: requiredHtmlElement("#loadoutPassiveGrid"),
  loadoutWeaponStatus: requiredHtmlElement("#loadoutWeaponStatus"),
  loadoutPassiveStatus: requiredHtmlElement("#loadoutPassiveStatus"),
  pauseOverlay: requiredHtmlElement("#pauseOverlay"),
  pauseRootPanel: requiredHtmlElement("#pauseRootPanel"),
  pauseResumeButton: requiredButton("#pauseResumeButton"),
  pauseSettingsButton: requiredButton("#pauseSettingsButton"),
  pauseMainMenuButton: requiredButton("#pauseMainMenuButton"),
  pauseSettingsPanel: requiredHtmlElement("#pauseSettingsPanel"),
  pauseConfirmDialog: requiredHtmlElement("#pauseConfirmDialog"),
  pauseConfirmLeaveButton: requiredButton("#pauseConfirmLeaveButton"),
  pauseConfirmCancelButton: requiredButton("#pauseConfirmCancelButton"),
  mouseSensitivityInput: requiredInput("#mouseSensitivityInput"),
  stickSensitivityInput: requiredInput("#stickSensitivityInput"),
  invertYToggle: requiredInput("#invertYToggle"),
  masterVolumeInput: requiredInput("#masterVolumeInput"),
  musicVolumeInput: requiredInput("#musicVolumeInput"),
  sfxVolumeInput: requiredInput("#sfxVolumeInput"),
  muteToggle: requiredInput("#muteToggle"),
  levelChoiceOverlay: requiredHtmlElement("#levelChoiceOverlay"),
  levelChoiceSubtitle: requiredHtmlElement("#levelChoiceSubtitle"),
  levelChoiceGrid: requiredHtmlElement("#levelChoiceGrid"),
  levelChoiceRerollButton: requiredButton("#levelChoiceRerollButton"),
  levelChoiceBanishButton: requiredButton("#levelChoiceBanishButton"),
  reticle: requiredHtmlElement("#reticle"),
  controlHint: requiredHtmlElement("#controlHint"),
  controllerStatus: requiredHtmlElement("#controllerStatus"),
  minimapCanvas: requiredCanvas("#minimapCanvas"),
  telemetryPanel: requiredHtmlElement("#telemetryPanel")
};

type StringCategories = Record<string, string>;

type ProgressionBonus = {
  level?: number;
  badge?: string;
  stateLabel?: string;
  category?: string;
  damage?: number;
  pierce?: number;
  projectiles?: number;
  orbitals?: number;
  summons?: number;
  pulseCount?: number;
  cooldownMultiplier?: number;
  projectileSpeedMultiplier?: number;
  spreadDegrees?: number;
  knockback?: number;
  eliteDamageMultiplier?: number;
  radius?: number;
  poolRadius?: number;
  bleedDamagePerSecond?: number;
  burnDamagePerSecond?: number;
  rotationSpeedMultiplier?: number;
  orbitalSize?: number;
  poolSeconds?: number;
  tickRateMultiplier?: number;
  returnSpeedMultiplier?: number;
  width?: number;
  summonSeconds?: number;
  biteCooldownMultiplier?: number;
  staggerSeconds?: number;
  pulseDelaySeconds?: number;
  arcDegrees?: number;
  executeHealthRatio?: number;
  auraRadiusMultiplier?: number;
  auraDamageMultiplier?: number;
  silverDamageMultiplier?: number;
  fireDamageMultiplier?: number;
  plagueDamageMultiplier?: number;
  bleedDamageMultiplier?: number;
  moveSpeedMultiplier?: number;
  contactGraceSecondsFlat?: number;
  knockbackResistFlat?: number;
  effectDurationMultiplier?: number;
  pickupLifetimeMultiplier?: number;
  armorFlat?: number;
  contactThornsDamage?: number;
  knockbackForceMultiplier?: number;
  pickupRadiusFlat?: number;
  projectileCountFlat?: number;
  projectileSizeMultiplier?: number;
  damageMultiplier?: number;
  jumpHeightMultiplier?: number;
  gravityMultiplier?: number;
  maxJumpsFlat?: number;
  splashDamageFlat?: number;
  xpMultiplier?: number;
  curseMultiplier?: number;
  luckMultiplier?: number;
  critChanceFlat?: number;
  critMultiplier?: number;
  maxHpFlat?: number;
  maxHpMultiplier?: number;
  regenFlat?: number;
  healMultiplier?: number;
};

type PassiveTeamworkEffect = {
  id: string;
  title: string;
  badge: string;
  color: string;
  category: string;
  bonus: ProgressionBonus;
  description: string;
};

type LevelChoiceBase = {
  id: string;
  title: string;
  badge: string;
  subtitle: string;
  description: string;
  color: string;
  category: string;
  targetLevel?: number;
  owned?: boolean;
  bonus?: ProgressionBonus;
  amount?: number | null;
  effect?: PassiveTeamworkEffect | null;
};
type WeaponLevelChoice = LevelChoiceBase & { kind: "weapon"; targetLevel: number; owned: boolean };
type PassiveLevelChoice = LevelChoiceBase & { kind: "passive"; targetLevel: number; owned: boolean };
type EvolutionLevelChoice = LevelChoiceBase & { kind: "evolution" };
type StatLevelChoice = LevelChoiceBase & { kind: "stat"; bonus: ProgressionBonus; amount: number | null };
type HealLevelChoice = LevelChoiceBase & { kind: "heal" };
type LevelChoice = WeaponLevelChoice | PassiveLevelChoice | EvolutionLevelChoice | StatLevelChoice | HealLevelChoice;

type WeaponEvolution = {
  requires: string;
  resultId: string;
  name: string;
  tierBadge?: string;
  stateLabel?: string;
  categories?: StringCategories;
  color?: string;
  timerHint?: string;
  change?: string;
};

type RawWeaponBase = {
  damage?: number;
  damageType?: string;
  cooldown?: number;
  projectiles?: number;
  arcs?: number;
  pulseCount?: number;
  orbitals?: number;
  summons?: number;
  projectileSpeed?: number;
  lifetime?: number;
  pierce?: number;
  knockback?: number;
  spreadDegrees?: number;
};

type RawWeaponDefinition = {
  id: string;
  name: string;
  fantasy?: string;
  tierBadge?: string;
  stateLabel?: string;
  tags?: string[];
  categories?: StringCategories;
  maxLevel?: number;
  base?: RawWeaponBase;
  levels?: ProgressionBonus[];
  evolution?: WeaponEvolution;
  visual?: { color?: string };
};

type WeaponDefinition = {
  id: string;
  name: string;
  label: string;
  fantasy: string;
  tierBadge: string;
  stateLabel: string;
  tags: string[];
  categories: StringCategories;
  maxLevel: number;
  levels: ProgressionBonus[];
  evolution: WeaponEvolution | null;
  damageType: string;
  cooldown: number;
  damage: number;
  speed: number;
  range: number;
  pellets: number;
  spread: number;
  pierce: number;
  knockback: number;
  color: string;
};

type WeaponRuntime = WeaponDefinition & {
  level: number;
  evolved: boolean;
  eliteDamageMultiplier: number;
  critChance: number;
  critMultiplier: number;
  projectileSizeMultiplier: number;
  splashDamageMultiplier: number;
  splashRadius: number;
  specialRadius?: number;
  orbitSpeed?: number;
  orbitalSize?: number;
  poolRadius?: number;
  poolSeconds?: number;
  tickInterval?: number;
  arcHeight?: number;
  returnSpeed?: number;
  width?: number;
  summonSpeed?: number;
  summonSeconds?: number;
  biteCooldown?: number;
  pulseRadius?: number;
  waveSpeed?: number;
  staggerSeconds?: number;
  pulseDelaySeconds?: number;
  sweepRadius?: number;
  sweepArc?: number;
  executeRatio?: number;
};

type DamageWeapon = Pick<WeaponRuntime,
  "color" | "damage" | "knockback" | "eliteDamageMultiplier" | "critChance" | "critMultiplier"
> & {
  id?: string;
  damageType?: string;
};

type EnemyDefinition = {
  name: string;
  hp: number;
  speed: number;
  touch: number;
  radius: number;
  score: number;
  texture: string;
};

type RawEnemyDefinition = {
  name: string;
  health?: number;
  speed?: number;
  contactDamage?: number;
  radius?: number;
  xp?: number;
};

type WaveDefinition = {
  id: string;
  at: number;
  name: string;
  mix: Array<[string, number]>;
  rate: number;
  cap: number;
  eliteId: string | null;
  bossAtSecond?: number;
};

type RawWaveDefinition = {
  id?: string;
  label?: string;
  startSecond?: number;
  spawnIntervalSeconds?: number;
  spawnCap?: number;
  eliteId?: string | null;
  bossAtSecond?: number;
  squads?: Array<{ enemyId: string; weight?: number }>;
};

type HazardDefinition = {
  id: string;
  kind: string;
  x: number;
  z: number;
  radius: number;
  dps: number;
};

type RawHazardDefinition = {
  id: string;
  radius?: number;
  damagePerSecond?: number;
  damage?: number;
};

type ArenaPropDefinition = {
  id?: string;
  model: string;
  x: number;
  z: number;
  rot?: number;
  scale?: number;
};

type PassiveDefinition = {
  id: string;
  name: string;
  maxLevel: number;
  tierBadge?: string;
  stateLabel?: string;
  tags?: string[];
  categories?: StringCategories;
  visual?: { color?: string; timerHint?: string };
  bonuses?: ProgressionBonus[];
};

type ClassUnlock = { level: number; id: string };
type PlayerClassDefinition = {
  id: string;
  name: string;
  role: string;
  color: string;
  starterWeapon: string;
  starterPassives: string[];
  progression?: { weapons: ClassUnlock[]; passives: ClassUnlock[] };
  passiveBias: string[];
  stats: ProgressionBonus;
  perk: string;
};

type ArenaData = {
  balance: typeof ARENA_DATA.balance;
  arena: { radius: number; softRadius: number; spawnRadius: number; worldSize: number; baseRadius: number };
  player: {
    startHealth: number;
    healthRegenPerSecond: number;
    moveSpeed: number;
    pickupRadius: number;
    maxWeaponSlots: number;
    maxPassiveSlots: number;
  };
  progression: {
    startLevel: number;
    xpCurveBase: number;
    xpCurvePower: number;
    xpCurveLinear: number;
    levelChoiceCount: number;
    rerollsStart: number;
    banishesStart: number;
    evolutionLevel: number;
    passiveEvolutionLevel: number;
  };
  passiveItems: PassiveDefinition[];
  playerClasses: PlayerClassDefinition[];
  levelUpPools: typeof ARENA_DATA.levelUpPools;
  pickups: typeof ARENA_DATA.pickups;
  weapons: WeaponDefinition[];
  enemies: Record<string, EnemyDefinition>;
  waves: WaveDefinition[];
  hazards: HazardDefinition[];
  props: ArenaPropDefinition[];
  objectives: string[];
  pickupChances: { heal: number; magnet: number };
};

const data = normalizeArenaData(ARENA_DATA);
const WORLD_SIZE = data.arena.worldSize ?? data.arena.radius * 2;
const WORLD_HALF_SIZE = WORLD_SIZE / 2;
const toroidalWorld = createToroidalWorld3D({
  width: WORLD_SIZE,
  depth: WORLD_SIZE,
  origin: [-WORLD_HALF_SIZE, -WORLD_HALF_SIZE]
});
const weaponsById = new Map(data.weapons.map((weapon) => [weapon.id, weapon]));
const passiveItemsById = new Map((data.passiveItems ?? []).map((passive) => [passive.id, passive]));
const playerClasses: PlayerClassDefinition[] = data.playerClasses.length ? data.playerClasses : [{
  id: "survivor",
  name: "Survivor",
  role: "Balanced",
  color: "#d7ff8d",
  starterWeapon: data.weapons[0]?.id ?? "pistol",
  starterPassives: [],
  passiveBias: ["damage", "tempo", "utility"],
  stats: {},
  perk: "Plain kit: enough speed, enough bite, no special debt."
}];
const playerClassesById = new Map(playerClasses.map((klass) => [klass.id, klass]));
const DEFAULT_CLASS_ID = playerClasses[0]?.id ?? "survivor";
const CLASS_LEVEL_STORAGE_KEY = "three-arena.class-levels.v1";
const CLASS_LOADOUT_STORAGE_KEY = "three-arena.class-loadouts.v1";
const SETTINGS_STORAGE_KEY = "three-arena.settings.v1";
const DEFAULT_CLASS_LEVEL = 1;
const MAX_LOADOUT_PASSIVES = 3;
const DEFAULT_SETTINGS = {
  mouseSensitivity: 1,
  stickSensitivity: 1,
  invertY: false,
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 1,
  muted: false
};
type Settings = typeof DEFAULT_SETTINGS;
type SettingKey = keyof Settings;
type NumericSettingKey = "mouseSensitivity" | "stickSensitivity" | "masterVolume" | "musicVolume" | "sfxVolume";
type ClassLoadout = { weaponId?: string; passiveIds?: string[]; passiveId?: string };
type ResolvedClassLoadout = { weaponId?: string; passiveIds: string[] };
type ClassLoadouts = Record<string, ClassLoadout>;
const POWERUP_DROP_MULTIPLIER = 0.05;
const XP_DROP_CHANCE = 0.5;
type RunStatDefinition = {
  id: string;
  title: string;
  badge: string;
  color: string;
  category: string;
  min: number;
  max: number;
  step: number;
  bonus: (value: number) => ProgressionBonus;
  description: (value: number) => string;
};
const RUN_STAT_DEFINITIONS: RunStatDefinition[] = [
  {
    id: "critChance",
    title: "Crit Chance",
    badge: "Crit",
    color: "#fff4a6",
    category: "damage",
    min: 0.03,
    max: 0.06,
    step: 0.01,
    bonus: (value) => ({ critChanceFlat: value }),
    description: (value) => `Crit chance +${formatPercentPoints(value)}`
  },
  {
    id: "critDamage",
    title: "Crit Damage",
    badge: "Crit",
    color: "#ffd36d",
    category: "damage",
    min: 1.1,
    max: 1.22,
    step: 0.02,
    bonus: (value) => ({ critMultiplier: value }),
    description: (value) => `Crit damage +${percentDelta(value)}`
  },
  {
    id: "projectileCount",
    title: "Projectile Count",
    badge: "Shots",
    color: "#9fe8ff",
    category: "coverage",
    min: 1,
    max: 2,
    step: 1,
    bonus: (value) => ({ projectileCountFlat: value }),
    description: (value) => `Projectiles +${value}`
  },
  {
    id: "projectileSpeed",
    title: "Projectile Speed",
    badge: "Speed",
    color: "#82e9ff",
    category: "projectile",
    min: 1.08,
    max: 1.18,
    step: 0.02,
    bonus: (value) => ({ projectileSpeedMultiplier: value }),
    description: (value) => `Projectile speed +${percentDelta(value)}`
  },
  {
    id: "projectileSize",
    title: "Projectile Size",
    badge: "Size",
    color: "#d7ff8d",
    category: "coverage",
    min: 1.1,
    max: 1.24,
    step: 0.02,
    bonus: (value) => ({ projectileSizeMultiplier: value }),
    description: (value) => `Projectile size +${percentDelta(value)}`
  },
  {
    id: "damage",
    title: "Damage",
    badge: "Dmg",
    color: "#ffb36b",
    category: "damage",
    min: 1.06,
    max: 1.14,
    step: 0.02,
    bonus: (value) => ({ damageMultiplier: value }),
    description: (value) => `Damage +${percentDelta(value)}`
  },
  {
    id: "moveSpeed",
    title: "Move Speed",
    badge: "Move",
    color: "#85ff9a",
    category: "mobility",
    min: 1.05,
    max: 1.12,
    step: 0.01,
    bonus: (value) => ({ moveSpeedMultiplier: value }),
    description: (value) => `Move speed +${percentDelta(value)}`
  },
  {
    id: "jumpHeight",
    title: "Jump Height",
    badge: "Jump",
    color: "#bff7ff",
    category: "mobility",
    min: 1.1,
    max: 1.24,
    step: 0.02,
    bonus: (value) => ({ jumpHeightMultiplier: value }),
    description: (value) => `Jump height +${percentDelta(value)}`
  },
  {
    id: "gravityRate",
    title: "Gravity Rate",
    badge: "Float",
    color: "#cfd7ff",
    category: "mobility",
    min: 0.82,
    max: 0.94,
    step: 0.02,
    bonus: (value) => ({ gravityMultiplier: value }),
    description: (value) => `Gravity -${percentDelta(1 / value)}`
  },
  {
    id: "extraJump",
    title: "Extra Jump",
    badge: "Jumps",
    color: "#d8f8ff",
    category: "mobility",
    min: 1,
    max: 1,
    step: 1,
    bonus: (value) => ({ maxJumpsFlat: value }),
    description: (value) => `Jumps +${value}`
  },
  {
    id: "splashDamage",
    title: "Splash Damage",
    badge: "Splash",
    color: "#ff9de8",
    category: "area",
    min: 0.1,
    max: 0.22,
    step: 0.02,
    bonus: (value) => ({ splashDamageFlat: value }),
    description: (value) => `Splash damage +${formatPercentPoints(value)}`
  },
  {
    id: "xpGain",
    title: "XP Gain",
    badge: "XP",
    color: "#7bd6ff",
    category: "utility",
    min: 1.12,
    max: 1.28,
    step: 0.04,
    bonus: (value) => ({ xpMultiplier: value }),
    description: (value) => `XP gain +${percentDelta(value)}`
  },
  {
    id: "curse",
    title: "Curse",
    badge: "Curse",
    color: "#c88cff",
    category: "pressure",
    min: 1.08,
    max: 1.2,
    step: 0.02,
    bonus: (value) => ({ curseMultiplier: value }),
    description: (value) => `Enemy count and health +${percentDelta(value)}`
  },
  {
    id: "luck",
    title: "Luck",
    badge: "Luck",
    color: "#f3de9a",
    category: "utility",
    min: 1.25,
    max: 1.6,
    step: 0.05,
    bonus: (value) => ({ luckMultiplier: value }),
    description: (value) => `Powerup drops +${percentDelta(value)}`
  },
  {
    id: "attackSpeed",
    title: "Attack Speed",
    badge: "Atk",
    color: "#c8b784",
    category: "tempo",
    min: 0.84,
    max: 0.92,
    step: 0.02,
    bonus: (value) => ({ cooldownMultiplier: value }),
    description: (value) => `Attack speed +${percentDelta(1 / value)}`
  }
];
const PASSIVE_TEAMWORK_EFFECTS: PassiveTeamworkEffect[] = [
  { id: "packTactics", title: "Pack Tactics", badge: "Pack", color: "#d7ff8d", category: "damage", bonus: { damageMultiplier: 1.05 }, description: "Team damage link" },
  { id: "crossfire", title: "Crossfire", badge: "Aim", color: "#fff4a6", category: "damage", bonus: { critChanceFlat: 0.03 }, description: "Shared crit lanes" },
  { id: "sharedTempo", title: "Shared Tempo", badge: "Tempo", color: "#c8b784", category: "tempo", bonus: { cooldownMultiplier: 0.95 }, description: "Team attack rhythm" },
  { id: "signalRelay", title: "Signal Relay", badge: "Relay", color: "#82e9ff", category: "projectile", bonus: { projectileSpeedMultiplier: 1.08 }, description: "Faster shared shots" },
  { id: "coverStep", title: "Cover Step", badge: "Step", color: "#85ff9a", category: "mobility", bonus: { moveSpeedMultiplier: 1.05 }, description: "Faster repositioning near allies" },
  { id: "medicRelay", title: "Medic Relay", badge: "Heal", color: "#baffb0", category: "survival", bonus: { regenFlat: 0.12, healMultiplier: 1.08 }, description: "Shared recovery pulse" },
  { id: "bulwarkLink", title: "Bulwark Link", badge: "Guard", color: "#d6c0a4", category: "defense", bonus: { armorFlat: 2 }, description: "Linked armor" },
  { id: "pickupChain", title: "Pickup Chain", badge: "Draw", color: "#7bd6ff", category: "utility", bonus: { pickupRadiusFlat: 0.6, xpMultiplier: 1.05 }, description: "Shared pickup reach" },
  { id: "luckySignal", title: "Lucky Signal", badge: "Luck", color: "#f3de9a", category: "utility", bonus: { luckMultiplier: 1.2 }, description: "Better team powerup odds" },
  { id: "blastCallout", title: "Blast Callout", badge: "Blast", color: "#ff9de8", category: "area", bonus: { splashDamageFlat: 0.08 }, description: "Splash callouts" },
  { id: "volleySync", title: "Volley Sync", badge: "Volley", color: "#9fe8ff", category: "coverage", bonus: { projectileCountFlat: 1 }, description: "Extra synchronized projectile" },
  { id: "focusLens", title: "Focus Lens", badge: "Focus", color: "#ffd36d", category: "damage", bonus: { critMultiplier: 1.08 }, description: "Harder team crits" },
  { id: "scavengerBond", title: "Scavenger Bond", badge: "XP", color: "#78b7ff", category: "utility", bonus: { xpMultiplier: 1.12 }, description: "Shared shard learning" },
  { id: "guardianPulse", title: "Guardian Pulse", badge: "Pulse", color: "#cfd7df", category: "control", bonus: { knockbackForceMultiplier: 1.08, contactGraceSecondsFlat: 0.02 }, description: "Safer close pressure" },
  { id: "wardingCircle", title: "Warding Circle", badge: "Aura", color: "#d6c0a4", category: "area", bonus: { auraRadiusMultiplier: 1.08 }, description: "Wider ally-safe aura" },
  { id: "warChant", title: "War Chant", badge: "Chant", color: "#ffb36b", category: "tempo", bonus: { damageMultiplier: 1.03, cooldownMultiplier: 0.97 }, description: "Damage and rhythm chant" },
  { id: "markedQuarry", title: "Marked Quarry", badge: "Mark", color: "#fff2b5", category: "damage", bonus: { eliteDamageMultiplier: 1.08 }, description: "Team elite mark" },
  { id: "silverSignal", title: "Silver Signal", badge: "Silver", color: "#f2f4df", category: "damage", bonus: { silverDamageMultiplier: 1.08 }, description: "Shared silver pressure" },
  { id: "fireWatch", title: "Fire Watch", badge: "Fire", color: "#ff9d4a", category: "damage", bonus: { fireDamageMultiplier: 1.08 }, description: "Shared burn pressure" },
  { id: "plagueNet", title: "Plague Net", badge: "Plague", color: "#74c96b", category: "damage", bonus: { plagueDamageMultiplier: 1.08 }, description: "Shared plague pressure" },
  { id: "bloodPact", title: "Blood Pact", badge: "Bleed", color: "#9f2635", category: "damage", bonus: { bleedDamageMultiplier: 1.08 }, description: "Shared bleed pressure" },
  { id: "rallyBoots", title: "Rally Boots", badge: "Rally", color: "#9f8d72", category: "mobility", bonus: { moveSpeedMultiplier: 1.03, knockbackResistFlat: 0.05 }, description: "Team rally footing" },
  { id: "magnetLine", title: "Magnet Line", badge: "Line", color: "#9fe8ff", category: "utility", bonus: { pickupRadiusFlat: 0.4, luckMultiplier: 1.08 }, description: "Loot line through allies" },
  { id: "lastStand", title: "Last Stand", badge: "Stand", color: "#cfd7df", category: "survival", bonus: { maxHpFlat: 8, armorFlat: 1 }, description: "Shared emergency grit" },
  { id: "overwatch", title: "Overwatch", badge: "Watch", color: "#b38cff", category: "coverage", bonus: { projectileSizeMultiplier: 1.08, splashDamageFlat: 0.05 }, description: "Bigger cover fire" }
];
const texturePaths = {
  skybox: "assets/usable/textures/skybox/three-arena-skybox.png",
  survivor: [
    "assets/usable/characters/craftpix/survivor-girl/walk-gun/walk-gun-000.png",
    "assets/usable/characters/kenney/skins/survivor-female-a.png"
  ],
  ally: [
    "assets/usable/characters/kenney/skins/survivor-male-b.png",
    "assets/usable/characters/kenney/skins/retro-human-male-a.png"
  ],
  zombieA: [
    "assets/usable/characters/craftpix/zombie-female/walk/walk-000.png",
    "assets/usable/characters/kenney/skins/zombie-a.png"
  ],
  zombieB: [
    "assets/usable/characters/craftpix/zombie-female/walk/walk-003.png",
    "assets/usable/characters/kenney/skins/retro-zombie-male-a.png"
  ],
  brute: [
    "assets/usable/characters/craftpix/icons/zombie5-icon-no-bg.png",
    "assets/usable/characters/kenney/skins/zombie-c.png"
  ],
  shade: [
    "assets/usable/characters/kenney/skins/retro-zombie-female-a.png",
    "assets/usable/characters/craftpix/icons/zombie1-icon-no-bg.png"
  ],
  ground: [
    "assets/usable/textures/craftpix/soil-stones-tilelist-1.png",
    "assets/usable/textures/craftpix/soil-stones-tilelist-2.png",
    "assets/usable/textures/kenney/graveyard-colormap.png"
  ]
};

const ARCHITECT_UI_ROOT = "assets/usable/architect-ui";
const CLASS_WEAPON_ICON_BY_ID: Record<string, string> = {
  vanguard: "weapons/vanguard-repulser.png",
  tech: "weapons/tech-rivet-smg.png",
  bio: "weapons/bio-catalyst-grenadier.png",
  quantum: "weapons/quantum-blink-dagger-shotgun.png",
  singularity: "weapons/singularity-crucible.png"
};
const WEAPON_ICON_BY_ID: Record<string, string> = {
  boneSplinter: "weapons/quantum-needle-rail.png",
  graveLantern: "weapons/singularity-crucible.png",
  silverStake: "weapons/vanguard-lance-gun.png",
  plagueVial: "weapons/bio-catalyst-grenadier.png",
  coffinLid: "weapons/vanguard-repulser.png",
  batSwarm: "weapons/quantum-blink-dagger-shotgun.png",
  funeralBell: "weapons/singularity-mass-driver.png",
  reaperScythe: "weapons/quantum-event-horizon-knuckles.png",
  pistol: "weapons/quantum-phase-pistols.png",
  shotgun: "weapons/vanguard-repulser.png",
  smg: "weapons/tech-rivet-smg.png",
  rifle: "weapons/vanguard-slugger.png",
  flame: "weapons/bio-chem-sprayer.png"
};
const EVOLUTION_ICON_BY_WEAPON_ID: Record<string, string> = {
  boneSplinter: "weapons/singularity-orbiting-shards.png",
  graveLantern: "weapons/singularity-crucible.png",
  silverStake: "weapons/vanguard-lance-gun.png",
  plagueVial: "weapons/bio-symbiote-siphon.png",
  coffinLid: "weapons/vanguard-repulser.png",
  batSwarm: "weapons/quantum-blink-dagger-shotgun.png",
  funeralBell: "weapons/singularity-mass-driver.png",
  reaperScythe: "weapons/quantum-event-horizon-knuckles.png"
};
const PASSIVE_ICON_BY_ID: Record<string, string> = {
  blackGarlic: "status/debuff-38.png",
  silverRosary: "status/debuff-33.png",
  graveBoots: "status/debuff-24.png",
  funeralBellClapper: "status/debuff-27.png",
  bloodHourglass: "status/debuff-10.png",
  coffinNails: "status/debuff-32.png"
};

function architectUiAsset(path: string): string {
  return path ? `${ARCHITECT_UI_ROOT}/${path}` : "";
}

function weaponIconPath(id: string, evolved = false): string {
  return architectUiAsset((evolved ? EVOLUTION_ICON_BY_WEAPON_ID[id] : null) ?? WEAPON_ICON_BY_ID[id] ?? WEAPON_ICON_BY_ID.boneSplinter);
}

function passiveIconPath(id: string): string {
  return architectUiAsset(PASSIVE_ICON_BY_ID[id] ?? "status/debuff-4.png");
}

function classSigilPath(klass: PlayerClassDefinition | null | undefined): string {
  const classIcon = klass ? CLASS_WEAPON_ICON_BY_ID[klass.id] : undefined;
  const starterWeaponIcon = klass ? WEAPON_ICON_BY_ID[klass.starterWeapon] : undefined;
  return architectUiAsset(classIcon ?? starterWeaponIcon ?? WEAPON_ICON_BY_ID.boneSplinter);
}

function classPassiveDeckPath(klass: PlayerClassDefinition | null | undefined): string {
  return architectUiAsset(`passives/${klass?.id ?? "vanguard"}-1.png`);
}

function choiceVisual(choice: LevelChoice): { icon: string; kind: string } {
  if (choice.kind === "evolution") return { icon: weaponIconPath(choice.id, true), kind: "Evolution" };
  if (choice.kind === "weapon") return { icon: weaponIconPath(choice.id), kind: choice.owned ? "Weapon tier" : "New weapon" };
  if (choice.kind === "passive") return { icon: passiveIconPath(choice.id), kind: choice.owned ? "Passive tier" : "Passive" };
  if (choice.kind === "heal") return { icon: architectUiAsset("status/debuff-1.png"), kind: "Recover" };
  return { icon: architectUiAsset("status/debuff-4.png"), kind: "Core" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasArenaAnimationMetadata(clip: Three.AnimationClip): clip is ArenaAnimationClip {
  return "userData" in clip && isRecord(clip.userData);
}

function forEachObjectMaterial(
  object: Three.Object3D,
  visit: (material: Three.Material) => void
): void {
  if (!("material" in object)) return;
  const material = object.material;
  if (Array.isArray(material)) {
    for (const entry of material) {
      if (entry instanceof THREE.Material) visit(entry);
    }
    return;
  }
  if (material instanceof THREE.Material) visit(material);
}

function cachedGeometry(key: string, factory: () => Three.BufferGeometry): Three.BufferGeometry {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.BufferGeometry, `Cached geometry ${key}`);
}

function cachedMeshBasicMaterial(key: string, factory: () => Three.MeshBasicMaterial): Three.MeshBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.MeshBasicMaterial, `Cached material ${key}`);
}

function cachedMeshStandardMaterial(key: string, factory: () => Three.MeshStandardMaterial): Three.MeshStandardMaterial {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.MeshStandardMaterial, `Cached material ${key}`);
}

function cachedLineBasicMaterial(key: string, factory: () => Three.LineBasicMaterial): Three.LineBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.LineBasicMaterial, `Cached material ${key}`);
}

function isArenaPropDefinition(value: unknown): value is ArenaPropDefinition {
  return isRecord(value)
    && typeof value.model === "string"
    && typeof value.x === "number"
    && typeof value.z === "number";
}

function readStorageRecord(key: string): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorageJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional in private or embedded contexts.
  }
}

function settingNumber(source: Record<string, unknown>, key: NumericSettingKey, min: number, max: number): number {
  const value = Number(source[key]);
  return Number.isFinite(value) ? clamp(value, min, max) : DEFAULT_SETTINGS[key];
}

function readSettings(): Settings {
  const stored = readStorageRecord(SETTINGS_STORAGE_KEY);
  return {
    mouseSensitivity: settingNumber(stored, "mouseSensitivity", 0.5, 2),
    stickSensitivity: settingNumber(stored, "stickSensitivity", 0.5, 2),
    invertY: typeof stored.invertY === "boolean" ? stored.invertY : DEFAULT_SETTINGS.invertY,
    masterVolume: settingNumber(stored, "masterVolume", 0, 1),
    musicVolume: settingNumber(stored, "musicVolume", 0, 1),
    sfxVolume: settingNumber(stored, "sfxVolume", 0, 1),
    muted: typeof stored.muted === "boolean" ? stored.muted : DEFAULT_SETTINGS.muted
  };
}

function saveSettings(): void {
  writeStorageJson(SETTINGS_STORAGE_KEY, state.settings);
}

function createInitialClassLevels(): Map<string, number> {
  const stored = readStorageRecord(CLASS_LEVEL_STORAGE_KEY);
  const levels = new Map<string, number>();
  for (const klass of playerClasses) {
    const value = Math.floor(Number(stored[klass.id] ?? DEFAULT_CLASS_LEVEL));
    levels.set(klass.id, Math.max(DEFAULT_CLASS_LEVEL, Number.isFinite(value) ? value : DEFAULT_CLASS_LEVEL));
  }
  return levels;
}

function createInitialClassLoadouts(): ClassLoadouts {
  const stored = readStorageRecord(CLASS_LOADOUT_STORAGE_KEY);
  const loadouts: ClassLoadouts = {};
  for (const [classId, value] of Object.entries(stored)) {
    if (!isRecord(value)) continue;
    const weaponId = typeof value.weaponId === "string" ? value.weaponId : undefined;
    const passiveIds = Array.isArray(value.passiveIds)
      ? value.passiveIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const passiveId = typeof value.passiveId === "string" ? value.passiveId : undefined;
    loadouts[classId] = { weaponId, passiveIds, passiveId };
  }
  return loadouts;
}

function saveClassLevels(): void {
  const payload: Record<string, number> = {};
  for (const klass of playerClasses) payload[klass.id] = Math.max(DEFAULT_CLASS_LEVEL, state.classLevels.get(klass.id) ?? DEFAULT_CLASS_LEVEL);
  writeStorageJson(CLASS_LEVEL_STORAGE_KEY, payload);
}

function saveClassLoadouts(): void {
  writeStorageJson(CLASS_LOADOUT_STORAGE_KEY, state.configuredLoadouts);
}

function flattenWeaponUnlockFallback(): string[] {
  const ids: string[] = [];
  for (const id of data.levelUpPools?.starterWeapons ?? []) ids.push(id);
  for (const entry of data.levelUpPools?.unlockOrder ?? []) {
    for (const id of entry.weaponIds ?? []) ids.push(id);
  }
  for (const weapon of data.weapons ?? []) ids.push(weapon.id);
  return ids;
}

function normalizeUnlockList(
  entries: unknown,
  fallbackIds: Array<string | null | undefined>,
  validIds: ReadonlyMap<string, unknown>
): ClassUnlock[] {
  const result: ClassUnlock[] = [];
  const seen = new Set<string>();
  const push = (entry: unknown, fallbackLevel: number): void => {
    const id = typeof entry === "string" ? entry : isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
    if (typeof id !== "string" || !validIds.has(id) || seen.has(id)) return;
    const rawLevel = typeof entry === "string" ? fallbackLevel : isRecord(entry) ? entry.level ?? fallbackLevel : fallbackLevel;
    const level = Math.max(DEFAULT_CLASS_LEVEL, Math.floor(Number(rawLevel) || fallbackLevel || DEFAULT_CLASS_LEVEL));
    seen.add(id);
    result.push({ id, level });
  };
  const explicitEntries = Array.isArray(entries) && entries.length ? entries : null;
  if (explicitEntries) {
    for (const entry of explicitEntries) push(entry, DEFAULT_CLASS_LEVEL);
  } else {
    fallbackIds.forEach((id, index) => push(id, index === 0 ? DEFAULT_CLASS_LEVEL : 1 + index * 2));
  }
  result.sort((left, right) => left.level - right.level || displayNameForUnlock(left.id).localeCompare(displayNameForUnlock(right.id)));
  return result;
}

function classWeaponUnlocks(klass: PlayerClassDefinition | null | undefined): ClassUnlock[] {
  const fallback = [klass?.starterWeapon, ...flattenWeaponUnlockFallback()].filter((id): id is string => typeof id === "string");
  return normalizeUnlockList(klass?.progression?.weapons, fallback, weaponsById);
}

function classPassiveUnlocks(klass: PlayerClassDefinition | null | undefined): ClassUnlock[] {
  const fallback = [...(klass?.starterPassives ?? []), ...data.passiveItems.map((passive) => passive.id)];
  return normalizeUnlockList(klass?.progression?.passives, fallback, passiveItemsById);
}

function classUnlocks(klass: PlayerClassDefinition | null | undefined): Array<ClassUnlock & { kind: "weapon" | "passive" }> {
  return [
    ...classWeaponUnlocks(klass).map((unlock): ClassUnlock & { kind: "weapon" } => ({ ...unlock, kind: "weapon" })),
    ...classPassiveUnlocks(klass).map((unlock): ClassUnlock & { kind: "passive" } => ({ ...unlock, kind: "passive" }))
  ].sort((left, right) => left.level - right.level || displayNameForUnlock(left.id).localeCompare(displayNameForUnlock(right.id)));
}

function displayNameForUnlock(id: string): string {
  return weaponsById.get(id)?.name ?? passiveItemsById.get(id)?.name ?? id;
}

const animatedCharacterPaths = {
  model: "assets/usable/characters/kenney/models/character-medium.fbx",
  rig: "assets/usable/characters/kenney/models/character-medium.t3rig",
  animations: {
    idle: "assets/usable/characters/kenney/animations/idle.fbx",
    run: "assets/usable/characters/kenney/animations/run.fbx",
    jump: "assets/usable/characters/kenney/animations/jump.fbx"
  },
  skins: {
    survivor: "assets/usable/characters/kenney/skins/survivor-female-a.png",
    ally: "assets/usable/characters/kenney/skins/survivor-male-b.png",
    zombieA: "assets/usable/characters/kenney/skins/zombie-a.png",
    zombieB: "assets/usable/characters/kenney/skins/retro-zombie-male-a.png",
    brute: "assets/usable/characters/kenney/skins/zombie-c.png",
    shade: "assets/usable/characters/kenney/skins/retro-zombie-female-a.png"
  }
};

const modelPaths = {
  "gravestone-a": ["assets/usable/environment/kenney/gravestone-cross.glb", "assets/usable/environment/kenney/gravestone-round.glb"],
  "gravestone-b": ["assets/usable/environment/kenney/gravestone-broken.glb", "assets/usable/environment/kenney/grave.glb"],
  grave: ["assets/usable/environment/kenney/grave.glb"],
  crypt: ["assets/usable/environment/kenney/crypt.glb"],
  "ruin-arch": ["assets/usable/scenery/ruin-low-poly/fbx/_ruin_9.fbx", "assets/usable/scenery/ruin-low-poly/fbx/_ruin_5.fbx"],
  "ruin-column": ["assets/usable/scenery/ruin-low-poly/fbx/_ruin_14.fbx", "assets/usable/scenery/ruin-low-poly/fbx/_ruin_15.fbx"],
  "ruin-wall": ["assets/usable/scenery/ruin-low-poly/fbx/_ruin_10.fbx", "assets/usable/scenery/ruin-low-poly/fbx/_ruin_11.fbx"],
  coffin: ["assets/usable/props/kenney/coffin.glb", "assets/usable/props/kenney/coffin-old.glb"],
  shovel: ["assets/usable/props/kenney/shovel.glb"],
  pine: ["assets/usable/environment/kenney/pine.glb", "assets/usable/environment/kenney/tree.glb"],
  "tree-log": ["assets/usable/environment/kenney/tree-log.glb"],
  "rock-a": ["assets/usable/environment/kenney/rock-a.glb"],
  "rock-b": ["assets/usable/environment/kenney/rock-b.glb"],
  rocks: ["assets/usable/environment/kenney/rocks.glb"],
  grass: ["assets/usable/environment/kenney/grass.glb"],
  "grass-large": ["assets/usable/environment/kenney/grass-large.glb"],
  barrel: ["assets/usable/props/kenney/barrel.glb"],
  cross: ["assets/usable/environment/kenney/pillar-obelisk.glb", "assets/usable/props/kenney/lantern-candle.glb"],
  lantern: ["assets/usable/props/kenney/lantern-candle.glb"],
  campfire: ["assets/usable/props/kenney/campfire-pit.glb"],
  pumpkin: ["assets/usable/props/kenney/pumpkin-carved.glb", "assets/usable/props/kenney/pumpkin.glb"],
  fence: ["assets/usable/environment/kenney/iron-fence.glb", "assets/usable/environment/kenney/fence.glb"],
  "stone-wall": ["assets/usable/environment/kenney/stone-wall.glb"],
  "fence-doorway": ["assets/usable/environment/kenney/fence-doorway.glb"],
  floor: ["assets/usable/environment/kenney/floor-old.glb", "assets/usable/environment/kenney/floor.glb"]
};

const weaponModelPaths = {
  boneSplinter: ["assets/usable/weapons/kaykit/gltf/arrow_A.gltf", "assets/usable/weapons/kaykit/gltf/dagger_A.gltf"],
  graveLantern: ["assets/usable/weapons/kaykit/gltf/wand_A.gltf", "assets/usable/weapons/kaykit/gltf/staff_B.gltf"],
  silverStake: ["assets/usable/weapons/kaykit/gltf/spear_A.gltf", "assets/usable/weapons/kaykit/gltf/arrow_B.gltf"],
  plagueVial: ["assets/usable/weapons/kaykit/gltf/dagger_B.gltf", "assets/usable/weapons/kaykit/gltf/wand_A.gltf"],
  coffinLid: ["assets/usable/weapons/kaykit/gltf/shield_C.gltf", "assets/usable/weapons/kaykit/gltf/shield_B.gltf"],
  batSwarm: ["assets/usable/weapons/kaykit/gltf/fistweapon_B.gltf", "assets/usable/weapons/kaykit/gltf/dagger_B.gltf"],
  funeralBell: ["assets/usable/weapons/kaykit/gltf/hammer_C.gltf", "assets/usable/weapons/kaykit/gltf/staff_A.gltf"],
  reaperScythe: ["assets/usable/weapons/kaykit/gltf/halberd.gltf", "assets/usable/weapons/kaykit/gltf/sword_E.gltf"],
  pistol: ["assets/usable/weapons/kaykit/gltf/wand_A.gltf", "assets/usable/weapons/kaykit/gltf/dagger_A.gltf"],
  shotgun: ["assets/usable/weapons/kaykit/gltf/hammer_B.gltf", "assets/usable/weapons/kaykit/gltf/axe_B.gltf"],
  smg: ["assets/usable/weapons/kaykit/gltf/bow_B_withString.gltf", "assets/usable/weapons/kaykit/gltf/bow_A_withString.gltf"],
  rifle: ["assets/usable/weapons/kaykit/gltf/staff_A.gltf", "assets/usable/weapons/kaykit/gltf/spear_A.gltf"],
  flame: ["assets/usable/weapons/kaykit/gltf/staff_B.gltf", "assets/usable/weapons/kaykit/gltf/wand_A.gltf"]
};

type WeaponVisualProfile = {
  equippedScale: number;
  pickupScale: number;
  rotationZ: number;
  offsetX: number;
  glowX: number;
};

const weaponVisualProfiles: Record<string, WeaponVisualProfile> = {
  boneSplinter: { equippedScale: 1.45, pickupScale: 0.9, rotationZ: Math.PI / 2, offsetX: 0.62, glowX: 1.18 },
  graveLantern: { equippedScale: 1.1, pickupScale: 0.78, rotationZ: Math.PI / 2, offsetX: 0.5, glowX: 0.96 },
  silverStake: { equippedScale: 1.7, pickupScale: 1.0, rotationZ: Math.PI / 2, offsetX: 0.68, glowX: 1.28 },
  plagueVial: { equippedScale: 1.18, pickupScale: 0.82, rotationZ: Math.PI / 2, offsetX: 0.48, glowX: 0.98 },
  coffinLid: { equippedScale: 1.05, pickupScale: 0.82, rotationZ: Math.PI / 2, offsetX: 0.5, glowX: 0.92 },
  batSwarm: { equippedScale: 1.16, pickupScale: 0.86, rotationZ: Math.PI / 2, offsetX: 0.52, glowX: 1.02 },
  funeralBell: { equippedScale: 1.18, pickupScale: 0.86, rotationZ: Math.PI / 2, offsetX: 0.5, glowX: 1.02 },
  reaperScythe: { equippedScale: 1.55, pickupScale: 0.96, rotationZ: Math.PI / 2, offsetX: 0.62, glowX: 1.2 },
  default: { equippedScale: 1.35, pickupScale: 0.88, rotationZ: Math.PI / 2, offsetX: 0.58, glowX: 1.12 }
};

const pickupModelPaths = {
  xp: ["assets/usable/collectibles/treasure-low-poly/fbx/_coin.fbx", "assets/usable/collectibles/treasure-low-poly/fbx/_coins.fbx"],
  heal: ["assets/usable/collectibles/treasure-low-poly/fbx/_jewerly_06.fbx", "assets/usable/collectibles/treasure-low-poly/fbx/_jewerly_09.fbx"],
  weapon: ["assets/usable/props/kenney/chest.glb", "assets/usable/collectibles/treasure-low-poly/fbx/_key_08.fbx"]
};

const universalAnimationPaths = [
  "assets/usable/animations/universal/UAL1_Standard.glb",
  "assets/usable/animations/universal/UAL2_Standard.glb"
];
const UNIVERSAL_ANIMATION_RETARGET_FPS = 24;
const UNIVERSAL_ANIMATION_CLIP_ALIASES: Record<string, string | string[]> = {
  Hit_Chest: "hit",
  Hit_Head: "hitHead",
  Death01: "death",
  Idle_Loop: "ualIdle",
  Idle_Talking_Loop: ["fabricatorShopIdle", "blackHoleChoirRootedChant"],
  Idle_FoldArms_Loop: "idleFoldArms",
  Idle_Shield_Break: "shieldBreak",
  Idle_Shield_Loop: "shieldIdle",
  Zombie_Idle_Loop: ["downed", "enemyStunned", "enemySlowed", "enemyPulled", "enemyTethered", "enemyPoisoned", "enemyBleeding", "enemyMarked"],
  Zombie_Walk_Fwd_Loop: "zombieWalk",
  Zombie_Scratch: "zombieScratch",
  Jog_Fwd_Loop: "jog",
  Sprint_Loop: ["dash", "run8Dir"],
  Walk_Loop: "walk",
  Crouch_Idle_Loop: "crouchIdle",
  Crouch_Fwd_Loop: "crouchMove",
  Jump_Loop: "fall",
  Jump_Land: "land",
  Jump_Start: ["blinkStart", "jumpStart"],
  NinjaJump_Start: "ninjaJumpStart",
  NinjaJump_Idle_Loop: "ninjaJumpIdle",
  NinjaJump_Land: ["blinkEnd", "ninjaJumpLand"],
  Roll: ["roll", "returnSnap"],
  Roll_RM: "rollRootMotion",
  Slide_Start: "slideStart",
  Slide_Loop: ["afterimageDecay", "slideLoop"],
  Slide_Exit: "slideExit",
  Interact: "interact",
  PickUp_Table: "interactPickup",
  Fixing_Kneeling: ["reviveAlly", "patchDroneRepair", "slurryPurification"],
  Farm_Harvest: "fabricationPauseTransition",
  Farm_PlantSeed: ["turretDeploy", "mineArm"],
  Farm_Watering: ["chemSprayLoop", "cleansePulse"],
  Consume: "overclockActivation",
  Pistol_Aim_Neutral: ["aimUpperBody8Dir", "turretAiming"],
  Pistol_Aim_Down: "aimDown",
  Pistol_Aim_Up: "aimUp",
  Pistol_Idle_Loop: "weaponIdle",
  Pistol_Reload: ["reload", "pistolReload"],
  Pistol_Shoot: ["fireWeapon", "turretFiring", "projectileInterception"],
  OverhandThrow: ["grenadeThrow", "microDroneSpawn"],
  Spell_Simple_Enter: ["singularityChannelStart", "overchannelStart"],
  Spell_Simple_Idle_Loop: ["siphonBeamChannel", "singularityChannel", "orbitingShardLoop"],
  Spell_Simple_Shoot: ["shardRelease", "chemicalZonePulse", "cleansePulseCast", "mineDetonate"],
  Spell_Simple_Exit: ["gravityWellCollapse", "overchannelCollapse"],
  Push_Loop: ["gravityWellExpansion", "fenceNodeActivation"],
  Shield_Dash_RM: "shieldDash",
  Shield_OneShot: "shieldOneShot",
  Sword_Block: "swordBlock",
  Sword_Dash_RM: "swordDash",
  Sword_Regular_A: ["melee", "meleeShotgunStrike", "perfectBreachTimingHit"],
  Sword_Regular_B: "swordRegularB",
  Sword_Regular_C: "swordRegularC",
  Sword_Regular_Combo: "swordCombo",
  Sword_Attack: "swordAttack",
  Melee_Hook: "meleeHook",
  Punch_Cross: "punchCross",
  Punch_Jab: "punchJab",
  Chest_Open: ["eliteKeyDrop", "tierUpgradeAnimation"],
  TreeChopping_Loop: "turretDamagedDestroyed",
  Sitting_Idle_Loop: "fabricatorShopSittingIdle",
  Sitting_Enter: "sitEnter",
  Sitting_Exit: "sitExit",
  Dance_Loop: "victoryExtractPose",
  Yes: "celebrate",
  Walk_Carry_Loop: "carryWalk",
  Walk_Formal_Loop: "formalWalk"
};
// UAL upper-body shoot clips over-rotate this Kenney rig. Keep those as local overlays.
const PROCEDURAL_ACTION_ANIMATION_NAMES = new Set(["shoot", "cast", "aim"]);
const KENNEY_TO_UNIVERSAL_BONE_NAMES = {
  Hips: "pelvis",
  Spine: "spine_02",
  Head: "Head",
  LeftArm: "upperarm_l",
  LeftForeArm: "lowerarm_l",
  LeftHand: "hand_l",
  LeftHandIndex1: "index_01_l",
  LeftHandIndex2: "index_02_l",
  LeftHandIndex3: "index_03_l",
  LeftHandThumb1: "thumb_01_l",
  LeftHandThumb2: "thumb_02_l",
  RightArm: "upperarm_r",
  RightForeArm: "lowerarm_r",
  RightHand: "hand_r",
  RightHandIndex1: "index_01_r",
  RightHandIndex2: "index_02_r",
  RightHandIndex3: "index_03_r",
  RightHandThumb1: "thumb_01_r",
  RightHandThumb2: "thumb_02_r",
  LeftUpLeg: "thigh_l",
  LeftLeg: "calf_l",
  LeftFoot: "foot_l",
  RightUpLeg: "thigh_r",
  RightLeg: "calf_r",
  RightFoot: "foot_r"
};

const GAMEPAD_BUTTON = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  create: 8,
  options: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15
};
const MOVE_DEADZONE = 0.16;
const AIM_DEADZONE = 0.22;
const gamepadSession = createGamepadSession({
  mapperConfig: {
    defaultMovementDeadzone: MOVE_DEADZONE,
    defaultAimDeadzone: AIM_DEADZONE,
    buttonPressThreshold: 0.45,
  },
});
const MANUAL_AIM_PRIORITY_SECONDS = 1.2;
const CONTROL_HINTS = {
  controller: "PS5: left stick moves, D-pad moves menus, Cross selects, Start pauses.",
  keyboard: "Keyboard: WASD move, mouse aim, Space jumps, Escape pauses."
};

const WAVE_BANNER_SUBTITLES: Record<string, string> = {
  "graveyard-wake": "First hands are slow. Take shards early.",
  "crawl-from-crypts": "Crawlers are low. Keep your back out of the grass.",
  "ghoul-sprint": "Runners cut circles. Break one lane before looting.",
  "rotting-barrage": "Archers draw pale lines. Cross after the shot.",
  "open-graves": "Fresh dirt bites. Step wide before it opens.",
  "witching-hour": "Purple circles mean move now.",
  "bone-tide": "The brute raises a club. Leave the ring.",
  "blood-moon": "The red cape locks before the dash.",
  "catacomb-collapse": "Dust shadows show where stone will land.",
  "lich-procession": "The fence is lost. Keep one escape lane."
};

type RenderableObject = Three.Object3D & {
  material?: Three.Material | Three.Material[];
  geometry?: Three.BufferGeometry;
};

type ProceduralPosePart = {
  object: Three.Object3D;
  rotation: Three.Euler;
  position: Three.Vector3;
  overlayRotation: { x: number; y: number; z: number };
};

type ProceduralPose = { parts: Map<string, ProceduralPosePart>; time: number };
type ArenaAnimationClip = Three.AnimationClip & { userData: Record<string, unknown> };

type ProceduralMode = "none" | "additive" | "full" | "semantic";

type ActorAnimationState = {
  mesh: RenderableObject | null;
  animator: ThreeRender3DAnimationController | null;
  animatorRoot: Three.Object3D | null;
  animated: boolean;
  proceduralPose: ProceduralPose | null;
  proceduralMode: ProceduralMode;
  activeAnimation: string;
  activeAnimationSource: string | null;
  overlayAnimation: string | null;
  animationClock: number;
  animLock?: number;
  engineMotion?: ThreeArenaPlayerMotion | null;
};

type ActorVisual = ActorAnimationState & { mesh: RenderableObject };

type WorldActor = ActorAnimationState & {
  x: number;
  z: number;
  radius: number;
  speed: number;
  knockX: number;
  knockZ: number;
  facingAngle?: number;
  scale?: number;
  jumpY?: number;
  moveMomentumX?: number;
  moveMomentumZ?: number;
  terrainBlocked?: boolean;
  slopeDustClock?: number;
  renderAsBillboard?: boolean;
  groundY?: number;
};

type Player = WorldActor & {
  id: string;
  name: string;
  mesh: RenderableObject;
  hp: number;
  maxHp: number;
  regenPerSecond: number;
  speed: number;
  armor: number;
  knockbackResist: number;
  radius: number;
  jumpY: number;
  jumpVelocityY: number;
  jumpsUsed: number;
  grounded: boolean;
  jumpTrailClock: number;
  floatAssistUntil: number;
  wallRunClock: number;
  terrainSlope: number;
  terrainBlocked: boolean;
  moveMomentumX: number;
  moveMomentumZ: number;
  momentumDustClock: number;
  animationState: string;
  facingAngle: number;
  knockX: number;
  knockZ: number;
  invuln: number;
  handAnchor: Three.Object3D | null;
  engineMotion: ThreeArenaPlayerMotion | null;
  engineMotionLastX: number;
  engineMotionLastY: number;
  engineMotionLastZ: number;
  engineMotionAimHeight: number;
  engineMotionLandSource: string | null;
  engineMotionRecoilSource: string | null;
};

type EnemyHealthBar = {
  root: Three.Group;
  fill: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;
};

type Enemy = WorldActor & {
  typeId: string;
  boss: boolean;
  x: number;
  y: number;
  z: number;
  mesh: RenderableObject | null;
  batchKey: string | null;
  hp: number;
  maxHp: number;
  speed: number;
  touch: number;
  radius: number;
  score: number;
  scale: number;
  slow: number;
  knockX: number;
  knockZ: number;
  textureKey: string;
  animClock: number;
  animStep: number;
  nextAttack: number;
  seed: number;
  lastHit: { x: number; z: number; force: number };
  terrainClock?: number;
  moveMomentumX?: number;
  moveMomentumZ?: number;
  groundY?: number;
  renderAsBillboard?: boolean;
  facingAngle?: number;
  healthBar?: EnemyHealthBar | null;
  healthBarTimer?: number;
};

type BulletBase = {
  x: number;
  y: number;
  z: number;
  heightOffset: number;
  vx: number;
  vz: number;
  mesh: Three.Object3D;
  color: string;
  damage: number;
  damageType: string;
  eliteDamageMultiplier: number;
  critChance: number;
  critMultiplier: number;
  radius: number;
  pierce: number;
  ttl: number;
  speed: number;
  knockback: number;
  splashDamageMultiplier: number;
  splashRadius: number;
  age?: number;
};

type OrdinaryBullet = BulletBase & { kind?: undefined };
type BoomerangBullet = BulletBase & {
  kind: "boomerang";
  weaponId: string;
  outboundSeconds: number;
  returnSpeed?: number;
  hitEnemies: Set<Enemy>;
  returning?: boolean;
};
type HomingBullet = BulletBase & {
  kind: "homing";
  weaponId: string;
  turnRate: number;
  biteCooldown?: number;
  hitEnemies: Set<Enemy>;
};
type CombatBullet = OrdinaryBullet | BoomerangBullet | HomingBullet;

type WeaponZoneKind = "plaguePool" | "moldBloom" | "bloodBloom";
type WeaponZoneSpec = {
  kind: WeaponZoneKind;
  weaponId: string;
  x: number;
  z: number;
  radius: number;
  ttl: number;
  tickEvery: number;
  damage: number;
  slowSeconds: number;
  color: string;
  damageType?: string;
};
type WeaponZone = WeaponZoneSpec & {
  mesh: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;
  age: number;
  life: number;
  tickClock: number;
  opacity: number;
  seed: number;
};

type Pickup = {
  kind: "weapon" | "xp" | "heal" | "magnet";
  x: number;
  z: number;
  mesh: Three.Object3D | null;
  texture: Three.Texture;
  scale: number;
  payload: StatLevelChoice | null;
  t: number;
  groundY: number;
  light: Three.PointLight | null;
  magnetized?: boolean;
  magnetTrailClock: number;
  spawnedAt: number;
  ttl: number;
};

type SceneSpark = { mesh: Three.Object3D; vx: number; vy: number; vz: number; rx: number; ry: number };
type SceneEffect = { mesh: Three.Object3D; sparks?: SceneSpark[]; light?: Three.Object3D; t: number; life: number; baseScale: number; expand: number };

type IndicatorRuntime = {
  mesh: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;
  damage: number;
  windup: number;
  ttl: number;
  t: number;
  applied: boolean;
};
type RadialIndicator = IndicatorRuntime & {
  kind: "slam" | "nova";
  x: number;
  z: number;
  radius: number;
  originX?: number;
  originZ?: number;
};
type DashIndicator = IndicatorRuntime & {
  kind: "dash";
  x: number;
  z: number;
  originX: number;
  originZ: number;
  angle: number;
  length: number;
  width: number;
};
type AttackIndicator = RadialIndicator | DashIndicator;
type RadialIndicatorSpec = Omit<RadialIndicator, keyof IndicatorRuntime>;
type DashIndicatorSpec = Omit<DashIndicator, keyof IndicatorRuntime>;
type AttackIndicatorSpec = (RadialIndicatorSpec | DashIndicatorSpec) & Pick<IndicatorRuntime, "damage" | "windup" | "ttl">;

type ActiveHazard = HazardDefinition & { mesh: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>; seed: number; damageClock: number };

type CircleCollider = {
  kind: "circle";
  blocking: boolean;
  radius: number;
  height: number;
  rot: number;
  baseY?: number;
  topY?: number;
};
type BoxCollider = {
  kind: "box";
  blocking: true;
  halfX: number;
  halfZ: number;
  height: number;
  rot: number;
  cos?: number;
  sin?: number;
  baseY?: number;
  topY?: number;
};
type PropCollider = CircleCollider | BoxCollider;

type PropCollisionItem = { prop: Three.Object3D; x: number; y: number; z: number; radius: number; collider: PropCollider };

type TraversalTool = {
  id: string;
  type: (typeof TRAVERSAL_TOOL_TYPES)[number];
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  dirX: number;
  dirZ: number;
  radius: number;
  cooldown: number;
  seed: number;
  mesh: Three.Object3D;
  light: Three.PointLight;
  color: string;
};
type TraversalToolType = TraversalTool["type"];
type TraversalHeightDelta = { delta: number; dirX: number; dirZ: number; targetX: number; targetZ: number };
type TraversalSpawn = TraversalHeightDelta & { x: number; z: number; score: number };
type TerrainGradient = { x: number; z: number; ratio: number; angle: number };
type WorldDelta = { dx: number; dz: number };
type WorldPoint = { x: number; z: number };
type PlayerJumpStats = { heightMultiplier: number; gravityMultiplier: number; maxJumps: number };
type WeaponAim = { angle: number; mode: "manual" | "auto" | "manual-fallback"; target: WorldPoint | null };
type EnemyTarget = Player | { x: number; z: number; radius: number };
type AreaWeaponDamageOptions = {
  hitLimit?: number;
  damageOverride?: number;
  damageScale?: number;
  knockbackScale?: number;
  slowSeconds?: number;
  color?: Three.ColorRepresentation;
};
type WeaponDamageOptions = {
  hitX?: number;
  hitZ?: number;
  knockbackScale?: number;
  slowSeconds?: number;
  color?: Three.ColorRepresentation;
};

type PlayerDamageOptions = {
  minDamage?: number;
  invulnSeconds?: number;
  source?: Enemy;
  sourceX?: number;
  sourceZ?: number;
  knockbackForce?: number;
  knockback?: boolean;
};

type RemoteWeaponProgression = { id: string; level: number; evolved: boolean };
type RemotePassiveProgression = { id: string; level: number; effects?: string[] };
type RemotePlayer = ActorAnimationState & {
  mesh: RenderableObject;
  lastX: number | null;
  lastZ: number | null;
  classId: string | null;
  classColor: string;
  weapons: RemoteWeaponProgression[];
  passives: RemotePassiveProgression[];
  appliedClassColor: string | null;
  appliedProgressionTintKey: string | null;
};

type ProgressionStats = Required<Pick<ProgressionBonus,
  "maxHpFlat" | "maxHpMultiplier" | "regenFlat" | "moveSpeedMultiplier" | "jumpHeightMultiplier"
  | "gravityMultiplier" | "maxJumpsFlat" | "cooldownMultiplier" | "damageMultiplier"
  | "projectileSpeedMultiplier" | "projectileCountFlat" | "projectileSizeMultiplier"
  | "splashDamageFlat" | "knockbackForceMultiplier" | "knockbackResistFlat" | "armorFlat"
  | "contactThornsDamage" | "pickupRadiusFlat" | "xpMultiplier" | "healMultiplier"
  | "auraRadiusMultiplier" | "auraDamageMultiplier" | "silverDamageMultiplier"
  | "eliteDamageMultiplier" | "fireDamageMultiplier" | "plagueDamageMultiplier"
  | "bleedDamageMultiplier" | "critChanceFlat" | "critMultiplier" | "curseMultiplier"
  | "luckMultiplier" | "contactGraceSecondsFlat" | "effectDurationMultiplier"
>>;

type Actor = Player | Enemy;

type LevelChoiceState = { choices: LevelChoice[]; selectedIndex: number };
type ClassLevelNotice = { classId: string; level: number; unlocked: Array<ClassUnlock & { kind: "weapon" | "passive" }> };
type InstanceBatch = { mesh: Three.InstancedMesh; count: number; capacity: number; width?: number; height?: number };
type PickupInstanceBatch = InstanceBatch & { width: number; height: number };
type ArenaRagdoll = Omit<ReturnType<typeof threeView.createRagdoll>, "root"> & { root: Three.Object3D };
type GroundTilePatch = { mesh: Three.InstancedMesh; palette: number[]; platformPalette: number[]; lastCenterGX: number; lastCenterGZ: number };
type TerrainPlatformCell = { centerX: number; centerZ: number; radius: number; radiusSq: number; lift: number; baseHeight: number };
type ParticlePool = {
  mesh: Three.InstancedMesh;
  count: number;
  capacity: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  groundY: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
};

type EffectKind = "muzzle" | "hit" | "blast" | "jumpDust" | "airTrail";
type EffectOptions = {
  color?: Three.ColorRepresentation;
  angle?: number;
  particles?: number;
  speed?: number;
  size?: number;
  y?: number;
  worldY?: number;
};
type BatchedParticle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  groundY?: number;
  r: number;
  g: number;
  b: number;
};
type SparkOptions = {
  fullCircle?: boolean;
  startSpread?: number;
  verticalBase?: number;
  verticalRandom?: number;
  scale?: number;
};
type WorldPosition3D = { x: number; y: number; z: number };
type SynthCueKind = "shot" | "hit" | "pickup" | "kill" | "bossKill" | "level" | "weapon"
  | "start" | "wave" | "boss" | "telegraph" | "jump" | "slam" | "damage" | "death";
type SynthCueOptions = {
  weaponId?: string;
  kind?: Pickup["kind"];
  color?: Three.ColorRepresentation;
};
type ToneOptions = {
  attack?: number;
  release?: number;
  gain?: number;
  endFreq?: number;
  type?: OscillatorType;
  dest?: AudioNode | null;
};
type NoiseOptions = {
  attack?: number;
  release?: number;
  gain?: number;
  frequency?: number;
  q?: number;
  type?: BiquadFilterType;
  dest?: AudioNode | null;
};
type FloatingTextOptions = {
  y?: number;
  targetHeight?: number;
  baseFontPx?: number;
  lifeSeconds?: number;
  rise?: number;
  screenRisePx?: number;
  growScale?: number;
};
type SceneListItem = {
  mesh?: Three.Object3D | null;
  light?: Three.Object3D | null;
  userData?: { light?: Three.Object3D };
};

function isEnemySceneItem(item: SceneListItem): item is Enemy {
  return "typeId" in item && "hp" in item && "maxHp" in item;
}

type ActorAssets = {
  baseModel: Three.Object3D;
  clips: ArenaAnimationClip[];
  skins: Record<string, Three.Texture>;
  clone: (source: Three.Object3D) => Three.Object3D;
  universalClipNames: string[];
  retargetedUniversalClipNames: string[];
  retargetFailures: string[];
  clipSources: Map<string, string>;
  rigSidecar: string | null;
};

type IndicatorMesh = Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;

type VisualIndicators = {
  root: Three.Group;
  playerRing: IndicatorMesh;
  allyRings: Map<string, IndicatorMesh>;
  targetLock: Three.Group;
  aimCursor: IndicatorMesh;
  aimCone: IndicatorMesh;
  magnetRing: IndicatorMesh;
  offscreenArrows: IndicatorMesh[];
  cooldownRings: IndicatorMesh[];
  lockedEnemy: Enemy | null;
};

type BenchStress = { quietCombat: boolean; enemies: number; pickups: number; effects: number; allProps: boolean };
type CameraRigSnapshot = {
  lookAt: [number, number, number];
  desiredPosition: [number, number, number];
  position: [number, number, number];
  yaw: number;
  pitch: number;
  distance: number;
  blocked: boolean;
};

let renderer: Three.WebGLRenderer;
let scene: Three.Scene;
let camera: Three.PerspectiveCamera;
let raycaster: Three.Raycaster;
let groundPlane: Three.Plane;
let gltfLoader: GLTFLoader | null = null;
let fbxLoader: FBXLoader | null = null;
let modelTextureOverride = "assets/usable/textures/kenney/graveyard-colormap.png";
let networkModule: typeof lobbyNetwork | null = null;
let networkClient: Awaited<ReturnType<typeof lobbyNetwork.connectLobby>> | null = null;
let networkClock = 0;
let lobbyRoomStatus: Record<string, unknown> | null = null;
let minimapCtx: CanvasRenderingContext2D | null = null;
let hudClock = 0;
let lastWeaponHudKey = "";
let lastPassiveHudKey = "";
let cameraRig: CameraRig | null = null;
let cameraRigSnapshot: CameraRigSnapshot | null = null;
let floatingTextLayer: ThreeWorldTextOverlay3D | null = null;
let cameraYaw = 0;
let cameraPitch = CAMERA_DEFAULT_PITCH;
let cameraDistance = CAMERA_BASE_DISTANCE;
let desiredCameraYaw = 0;
let desiredCameraPitch = CAMERA_DEFAULT_PITCH;
let desiredCameraDistance = CAMERA_BASE_DISTANCE;
let cameraBlocked = false;
let centerBannerTimeout: ReturnType<typeof setTimeout> | undefined;
let toastTimeout: ReturnType<typeof setTimeout> | undefined;

const keys = new Set<string>();
const remotePlayers = new Map<string, RemotePlayer>();
const cameraObstacleBuffer: Three.Object3D[] = [];
const tempVec = new THREE.Vector3();
const tempCameraTarget = new THREE.Vector3();
const tempCameraOffset = new THREE.Vector3();
const tempCameraDesired = new THREE.Vector3();
const tempCameraWorldSize = new THREE.Vector2();
const tempPointerNdc = new THREE.Vector2();
const tempMatrix = new THREE.Matrix4();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const tempColor = new THREE.Color();
const tempRenderPosition = { x: 0, z: 0 };
const tempRenderPositionB = { x: 0, z: 0 };
const tempWorldDelta = { dx: 0, dz: 0 };
const clusterTargetScratch: WorldPoint[] = [];
const pointer = { x: 0, y: 0, worldX: 0, worldZ: -8, manualAimUntil: 0 };
const playerMotionPosition = new Float32Array(3);
const playerMotionResolvedDelta = new Float32Array(3);
const playerMotionDesiredVelocity = new Float32Array(3);
const playerMotionFacing = new Float32Array(3);
const playerMotionAimTarget = new Float32Array(3);
const playerMotionGroundNormal = new Float32Array(3);
let lastReticleX = Number.NaN;
let lastReticleY = Number.NaN;
type ArenaGamepadState = {
  connected: boolean;
  index: number | null;
  id: string;
  inputMode: "keyboard" | "controller";
  moveX: number;
  moveZ: number;
  moveActive: boolean;
  aimX: number;
  aimZ: number;
  lookX: number;
  lookY: number;
  menuIndex: number;
  stickNavX: boolean;
  stickNavY: boolean;
};
const gamepadState: ArenaGamepadState = {
  connected: false,
  index: null,
  id: "",
  inputMode: "keyboard",
  moveX: 0,
  moveZ: 0,
  moveActive: false,
  aimX: 0,
  aimZ: -1,
  lookX: 0,
  lookY: 0,
  menuIndex: 0,
  stickNavX: false,
  stickNavY: false
};

type FocusItem = {
  element: HTMLElement;
  zone: "actions" | "classes" | "loadoutWeapons" | "loadoutPassives" | "lobby" | "pause" | "settings" | "confirm" | "levelChoice";
  row: number;
  col: number;
  disabled?: boolean;
};
type MenuDirection = "up" | "down" | "left" | "right";
type MenuMove = { x: number; y: number; active: boolean };

const menuFocus = createRovingFocusController({
  getTargets: menuTargets,
  document,
  root: document,
  shouldFocus: () => gamepadState.inputMode === "controller",
  isAvailable: (element) => isFocusElementAvailable(element),
  onFocus(target, index) {
    gamepadState.menuIndex = index;
    if (state.levelChoice) {
      const choiceButtons = [...(ui.levelChoiceGrid?.querySelectorAll(".level-choice-card") ?? [])];
      const choiceIndex = choiceButtons.indexOf(target);
      if (choiceIndex >= 0) selectLevelChoice(choiceIndex);
    }
  }
});

type SlowFrame = {
  time: number;
  frameMs: number;
  updateMs: number;
  renderMs: number;
  gapMs: number;
  rawDtMs: number;
  topPhase: string;
  topPhaseMs: number;
  heapDeltaBytes: number;
  enemies: number;
  bullets: number;
  pickups: number;
  particles: number;
  props: number;
  pendingProps: number;
};

type TelemetrySample = {
  frameMs: number;
  updateMs: number;
  cameraMs: number;
  renderMs: number;
  dtMs: number;
  rawDtMs: number;
  frameGapMs: number;
};
type SampleStats = { p50: number; p95: number; p99: number; avg: number; max: number };
type PositiveSampleStats = SampleStats & { count: number };
type BrowserPerformance = Performance & { memory?: { usedJSHeapSize: number } };

function createSlowFrameList(): SlowFrame[] {
  return [];
}

const telemetry = {
  enabled: PERF_QUERY.get("telemetry") === "1",
  metrics: createFrameMetrics({ capacity: TELEMETRY_SAMPLE_COUNT, maxSeries: 64, longFrameMs: TELEMETRY_FRAME_BUDGET_MS }),
  phaseScratch: createTelemetryPhaseScratch(),
  count: 0,
  totalFrames: 0,
  longFramesOverBudget: 0,
  longFramesOver33: 0,
  longFramesOver50: 0,
  longFramesOver100: 0,
  skippedFrames: 0,
  dtClampFrames: 0,
  maxFrameGapMs: 0,
  maxFrameMs: 0,
  maxUpdateMs: 0,
  maxRenderMs: 0,
  lastFrameStart: 0,
  lastHeapBytes: 0,
  lastMaterialCreates: 0,
  lastMeshCreates: 0,
  lastEffectCreates: 0,
  lastParticleCreates: 0,
  slowFrames: createSlowFrameList(),
  clock: 0,
  materialCreates: 0,
  meshCreates: 0,
  effectCreates: 0,
  particleCreates: 0,
  lastText: ""
};

function createTelemetryPhaseScratch(): Record<string, number> {
  const scratch: Record<string, number> = {};
  for (const name of TELEMETRY_PHASE_NAMES) scratch[name] = 0;
  return scratch;
}

function measureTelemetryPhase<T>(name: string, work: () => T): T {
  if (!telemetry.enabled) return work();
  const started = performance.now();
  try {
    return work();
  } finally {
    telemetry.phaseScratch[name] += performance.now() - started;
  }
}

type ArenaLights = {
  ambient?: Three.HemisphereLight;
  moon?: Three.DirectionalLight;
  rim?: Three.PointLight;
  sun?: Three.DirectionalLight;
  cryptFill?: Three.PointLight;
  muzzle?: Three.PointLight;
  playerGlow?: Three.PointLight;
  pickupLights?: Three.PointLight[];
};

type ArenaState = {
  running: boolean;
  paused: boolean;
  pausePanel: "root" | "settings" | "confirm";
  online: boolean;
  playerId: string;
  runSeed: number;
  runRandomState: number;
  time: number;
  waveIndex: number;
  spawnClock: number;
  nextBossAt: number;
  kills: number;
  level: number;
  xp: number;
  nextXp: number;
  selectedClassId: string;
  classLevels: Map<string, number>;
  configuredLoadouts: ClassLoadouts;
  settings: Settings;
  loadoutPanelOpen: boolean;
  classLevelNotice: ClassLevelNotice | null;
  weaponLevels: Map<string, number>;
  passiveSlots: string[];
  passiveLevels: Map<string, number>;
  passiveTimers: Map<string, number>;
  startingPassiveIds: Set<string>;
  passiveTeamworkEffects: Map<string, string[]>;
  evolvedWeapons: Set<string>;
  statBonuses: ProgressionBonus[];
  progressionStats: ProgressionStats | null;
  pendingLevelChoices: number;
  levelChoice: LevelChoiceState | null;
  levelChoiceRerolls: number;
  levelChoiceBanishes: number;
  banishedLevelChoices: Set<string>;
  resumeAfterLevelChoice: boolean;
  shake: number;
  shakePower: number;
  player: Player | null;
  enemies: Enemy[];
  bullets: CombatBullet[];
  weaponZones: WeaponZone[];
  pickups: Pickup[];
  effects: SceneEffect[];
  ragdolls: ArenaRagdoll[];
  attackIndicators: AttackIndicator[];
  hazards: ActiveHazard[];
  props: Three.Object3D[];
  traversalTools: TraversalTool[];
  pendingProps: ArenaPropDefinition[];
  propCollisionItems: PropCollisionItem[];
  propCollisionCandidates: PropCollisionItem[];
  propCollisionGrid: FixedGridSpatialIndex<PropCollisionItem>;
  propCollisionGridDirty: boolean;
  enemySpatialItems: Enemy[];
  enemySpatialGrid: FixedGridSpatialIndex<Enemy>;
  enemySpatialCandidates: Enemy[];
  enemySelectionScratch: Enemy[];
  enemyClusterScratch: Enemy[];
  enemyDistanceScratch: number[];
  enemySpatialDirty: boolean;
  propVisibilityBsp: ThreeBspTree3D<Three.Object3D>;
  propVisibilityCandidates: Three.Object3D[];
  propVisibilityBspDirty: boolean;
  visibleStaticProps: Set<Three.Object3D>;
  nextVisibleStaticProps: Set<Three.Object3D>;
  propAssetMode: "fallback" | "model";
  weaponSlots: string[];
  weaponCooldowns: Map<string, number>;
  activeWeaponId: string | null;
  textures: Record<string, Three.Texture>;
  modelCache: Map<string, Three.Object3D>;
  propLodGeometries: Map<Three.BufferGeometry, { high: Three.BufferGeometry; mid: Three.BufferGeometry; low: Three.BufferGeometry }>;
  propLodStats: { ready: boolean; sources: number; geometries: number; skipped: number; ms: number };
  optionalModelsLoading: boolean;
  optionalModelsReady: boolean;
  enemyBillboardBatches: Map<string, InstanceBatch>;
  enemyHealthBarPool: EnemyHealthBar[];
  pickupBatches: Map<string, PickupInstanceBatch>;
  particlePool: ParticlePool | null;
  actorAssets: ActorAssets | null;
  currentWeaponVisual: { id: string; mesh: Three.Group } | null;
  combatVisuals: null;
  lights: ArenaLights;
  groundTiles: Three.InstancedMesh[];
  groundTilePatch: GroundTilePatch | null;
  terrainBaseHeightCache: Map<number, number>;
  terrainHeightCache: Map<number, number>;
  terrainPlatformCellCache: Map<string, TerrainPlatformCell | null>;
  loopGroundCopies: Three.Mesh[];
  minimapClock: number;
  hudClock: number;
  staticWrapClock: number;
  lastStaticWrapX: number;
  lastStaticWrapZ: number;
  renderCache: ThreeResourceCache<ThreeDisposableResource>;
  pendingModelUpgrade: boolean;
  pendingModelUpgradeProps: ArenaPropDefinition[];
  pendingModelUpgradeIndex: number;
  muzzleFlash: number;
  combo: number;
  comboTimer: number;
  magnetPullUntil: number;
  visualIndicators: VisualIndicators | null;
  animationPlayCounts: Record<string, number>;
  lastAnimationPlay: { name: string; source: string; at: number } | null;
  benchStress: BenchStress | null;
};

const state: ArenaState = {
  running: false,
  paused: false,
  pausePanel: "root",
  online: false,
  playerId: crypto.randomUUID?.() ?? `p-${Math.floor(Math.random() * 999999)}`,
  runSeed: 0,
  runRandomState: 1,
  time: 0,
  waveIndex: 0,
  spawnClock: 0,
  nextBossAt: BOSS_PACING.firstBossSecond,
  kills: 0,
  level: 1,
  xp: 0,
  nextXp: 12,
  selectedClassId: DEFAULT_CLASS_ID,
  classLevels: createInitialClassLevels(),
  configuredLoadouts: createInitialClassLoadouts(),
  settings: readSettings(),
  loadoutPanelOpen: false,
  classLevelNotice: null,
  weaponLevels: new Map(),
  passiveSlots: [],
  passiveLevels: new Map(),
  passiveTimers: new Map(),
  startingPassiveIds: new Set(),
  passiveTeamworkEffects: new Map(),
  evolvedWeapons: new Set(),
  statBonuses: [],
  progressionStats: null,
  pendingLevelChoices: 0,
  levelChoice: null,
  levelChoiceRerolls: data.progression?.rerollsStart ?? 0,
  levelChoiceBanishes: data.progression?.banishesStart ?? 0,
  banishedLevelChoices: new Set(),
  resumeAfterLevelChoice: false,
  shake: 0,
  shakePower: 0,
  player: null,
  enemies: [],
  bullets: [],
  weaponZones: [],
  pickups: [],
  effects: [],
  ragdolls: [],
  attackIndicators: [],
  hazards: [],
  props: [],
  traversalTools: [],
  pendingProps: [],
  propCollisionItems: [],
  propCollisionCandidates: [],
  propCollisionGrid: createFixedGridSpatialIndex<PropCollisionItem>({
    cellSize: PROP_COLLISION_CELL_SIZE,
    worldSize: WORLD_SIZE
  }),
  propCollisionGridDirty: true,
  enemySpatialItems: [],
  enemySpatialGrid: createFixedGridSpatialIndex<Enemy>({
    cellSize: ENEMY_SPATIAL_CELL_SIZE,
    worldSize: WORLD_SIZE
  }),
  enemySpatialCandidates: [],
  enemySelectionScratch: [],
  enemyClusterScratch: [],
  enemyDistanceScratch: [],
  enemySpatialDirty: true,
  propVisibilityBsp: createThreeBspTree3D<Three.Object3D>({ maxLeafItems: 16 }),
  propVisibilityCandidates: [],
  propVisibilityBspDirty: true,
  visibleStaticProps: new Set(),
  nextVisibleStaticProps: new Set(),
  propAssetMode: "fallback",
  weaponSlots: [data.weapons[0]?.id ?? "pistol"],
  weaponCooldowns: new Map(),
  activeWeaponId: data.weapons[0]?.id ?? "pistol",
  textures: {},
  modelCache: new Map(),
  propLodGeometries: new Map(),
  propLodStats: { ready: false, sources: 0, geometries: 0, skipped: 0, ms: 0 },
  optionalModelsLoading: false,
  optionalModelsReady: false,
  enemyBillboardBatches: new Map(),
  enemyHealthBarPool: [],
  pickupBatches: new Map(),
  particlePool: null,
  actorAssets: null,
  currentWeaponVisual: null,
  combatVisuals: null,
  lights: {},
  groundTiles: [],
  groundTilePatch: null,
  terrainBaseHeightCache: new Map(),
  terrainHeightCache: new Map(),
  terrainPlatformCellCache: new Map(),
  loopGroundCopies: [],
  minimapClock: 0,
  hudClock: 0,
  staticWrapClock: 0,
  lastStaticWrapX: Number.POSITIVE_INFINITY,
  lastStaticWrapZ: Number.POSITIVE_INFINITY,
  renderCache: createThreeResourceCache<ThreeDisposableResource>(),
  pendingModelUpgrade: false,
  pendingModelUpgradeProps: [],
  pendingModelUpgradeIndex: 0,
  muzzleFlash: 0,
  combo: 0,
  comboTimer: 0,
  magnetPullUntil: 0,
  visualIndicators: null,
  animationPlayCounts: {},
  lastAnimationPlay: null,
  benchStress: null
};

type ArenaAudio = {
  noiseBuffer: AudioBuffer | null;
  nextBeatAt: number;
  beat: number;
  shotGateAt: number;
  hitGateAt: number;
  pickupGateAt: number;
};
const arenaAudioRuntime = createArenaAudioRuntime(SYNTH_MASTER_VOLUME);
const audio: ArenaAudio = {
  noiseBuffer: null,
  nextBeatAt: 0,
  beat: 0,
  shotGateAt: 0,
  hitGateAt: 0,
  pickupGateAt: 0
};
window.addEventListener("pagehide", () => { void arenaAudioRuntime.dispose(); }, { once: true });

void init().catch((error) => {
  console.error("Three Arena boot failed", error);
  bootSnapshot = {
    ...bootSnapshot,
    status: "failed",
    label: "Loading failed",
    activeLabel: bootErrorLabel(error),
    actualProgress: 1,
    visibleProgress: 1,
    error,
    updatedAt: performance.now()
  };
  bootUi.render(bootSnapshot);
  bootLoop.stop();
});

function normalizeArenaData(raw: typeof ARENA_DATA): ArenaData {
  const balancePlayer = raw.balance.player;
  const balanceDirector = raw.balance.director;
  const balanceArena = raw.balance.arena;
  const balanceProgression = raw.balance.progression;
  const baseRadius = Math.max(36, Math.min(70, (balanceArena.floorSize ?? 96) / 2));
  const radius = baseRadius * MAP_LINEAR_MULTIPLIER;
  const rawWeapons: Record<string, RawWeaponDefinition> = raw.weapons;
  const weapons: WeaponDefinition[] = Object.values(rawWeapons).map((weapon, index) => {
    const base = weapon.base ?? {};
    const speed = base.projectileSpeed ?? 22;
    const projectileCount = base.projectiles ?? base.arcs ?? base.pulseCount ?? base.orbitals ?? base.summons ?? 1;
    return {
      id: weapon.id,
      name: weapon.name,
      label: (weapon.name ?? weapon.id).slice(0, 2).toUpperCase(),
      fantasy: weapon.fantasy ?? "",
      tierBadge: weapon.tierBadge ?? "Weapon",
      stateLabel: weapon.stateLabel ?? "Attack",
      tags: weapon.tags ?? [],
      categories: weapon.categories ?? {},
      maxLevel: weapon.maxLevel ?? 1,
      levels: weapon.levels ?? [],
      evolution: weapon.evolution ?? null,
      damageType: base.damageType ?? weapon.tags?.find((tag) => ["physical", "silver", "fire", "shadow", "holy", "plague", "bleed"].includes(tag)) ?? "physical",
      cooldown: base.cooldown ?? 0.6,
      damage: base.damage ?? 12,
      speed,
      range: Math.max(9, (base.lifetime ?? 1.1) * speed),
      pellets: projectileCount,
      spread: ((base.spreadDegrees ?? (index % 2 ? 8 : 2)) * Math.PI) / 180,
      pierce: Math.min(8, base.pierce ?? 1),
      knockback: base.knockback ?? resolveWeaponKnockback(weapon.id, base.cooldown ?? 0.6, base.damage ?? 12, projectileCount),
      color: weapon.visual?.color ?? ["#ffd782", "#ff9d4a", "#cfd7df", "#74c96b", "#6b4a35", "#bda9ff"][index % 6]
    };
  });
  const enemies: Record<string, EnemyDefinition> = {};
  const rawEnemies: Record<string, RawEnemyDefinition> = raw.enemies;
  for (const [id, enemy] of Object.entries(rawEnemies)) {
    const texture = id.includes("Runner") || id.includes("runner") || id.includes("hound")
      ? "zombieB"
      : id.includes("brute") || id.includes("Bloat") || id.includes("bloat") || id.includes("guard")
        ? "brute"
        : id.includes("shade") || id.includes("witch") || id.includes("lich")
          ? "shade"
          : "zombieA";
    enemies[id] = {
      name: enemy.name ?? id,
      hp: (enemy.health ?? 28) * ENEMY_HEALTH_BASE_MULTIPLIER,
      speed: (enemy.speed ?? 2.5) * 1.45,
      touch: enemy.contactDamage ?? 10,
      radius: Math.max(0.75, (enemy.radius ?? 0.6) * 1.45),
      score: enemy.xp ?? 2,
      texture
    };
  }
  const rawWaves: RawWaveDefinition[] = raw.waves;
  const waves: WaveDefinition[] = rawWaves.map((wave, index) => ({
    id: wave.id ?? `wave-${index + 1}`,
    at: wave.startSecond ?? index * 45,
    name: wave.label ?? wave.id ?? `Wave ${index + 1}`,
    mix: (wave.squads ?? [{ enemyId: Object.keys(enemies)[0], weight: 1 }]).map((squad) => [squad.enemyId, squad.weight ?? 1]),
    rate: wave.spawnIntervalSeconds ?? Math.max(0.35, 1.1 - index * 0.08),
    cap: Math.min(130, wave.spawnCap ?? 35 + index * 14),
    eliteId: wave.eliteId ?? null,
    bossAtSecond: wave.bossAtSecond
  }));
  const rawHazards: Record<string, RawHazardDefinition> = raw.hazards;
  const hazardDefs = Object.values(rawHazards);
  const hazardPositions = [[-18, -12], [22, 11], [-5, 24], [27, -20], [-25, 18]];
  const hazards = hazardDefs.slice(0, 5).map((hazard, index) => ({
    id: hazard.id,
    kind: hazard.id,
    x: hazardPositions[index][0],
    z: hazardPositions[index][1],
    radius: hazard.radius ?? 4,
    dps: hazard.damagePerSecond ?? Math.max(5, (hazard.damage ?? 20) / 4)
  }));
  return {
    balance: raw.balance,
    arena: { radius, softRadius: radius, spawnRadius: Math.min(radius * 0.46, 48), worldSize: radius * 2, baseRadius },
    player: {
      startHealth: balancePlayer.startHealth ?? 120,
      healthRegenPerSecond: balancePlayer.healthRegenPerSecond ?? 0,
      moveSpeed: Math.max(8.8, (balancePlayer.moveSpeed ?? 6.2) * 1.74),
      pickupRadius: balancePlayer.pickupRadius ?? 2.4,
      maxWeaponSlots: balancePlayer.maxWeaponSlots ?? 6,
      maxPassiveSlots: balancePlayer.maxPassiveSlots ?? 6
    },
    progression: {
      startLevel: balanceProgression.startLevel ?? 1,
      xpCurveBase: balanceProgression.xpCurveBase ?? 24,
      xpCurvePower: balanceProgression.xpCurvePower ?? 1.28,
      xpCurveLinear: balanceProgression.xpCurveLinear ?? 8,
      levelChoiceCount: balanceProgression.levelChoiceCount ?? 3,
        rerollsStart: balanceProgression.rerollsStart ?? 0,
        banishesStart: balanceProgression.banishesStart ?? 0,
      evolutionLevel: balanceProgression.evolutionLevel ?? 8,
      passiveEvolutionLevel: balanceProgression.passiveEvolutionLevel ?? 5
    },
    passiveItems: Object.values(raw.passiveItems),
    playerClasses: Object.values(raw.playerClasses),
    levelUpPools: raw.levelUpPools,
    pickups: raw.pickups,
    weapons,
    enemies,
    waves,
    hazards,
    props: expandArenaProps(FALLBACK_DATA.props, radius),
    objectives: raw.objectives,
    pickupChances: {
      heal: (balanceDirector.healingDropChance ?? 0.035) * HEALTH_VIAL_DROP_MULTIPLIER,
      magnet: MAGNET_DROP_CHANCE
    }
  };
}

function resolveWeaponKnockback(id: string, cooldown: number, damage: number, pellets: number): number {
  const cadence = cooldown < 0.16 ? 0.42 : cooldown < 0.5 ? 0.72 : cooldown < 1 ? 1.05 : 1.34;
  const payload = Math.max(1, damage) / Math.max(1, pellets);
  let type = 1;
  if (/shotgun|coffin|hammer|lid/i.test(id)) type = 1.45;
  else if (/rifle|stake|spear|silver/i.test(id)) type = 1.7;
  else if (/flame|lantern|plague|swarm/i.test(id)) type = 0.55;
  else if (/smg|splinter|bone/i.test(id)) type = 0.78;
  return Math.max(1.1, Math.min(13.5, payload * cadence * type));
}

function expandArenaProps(props: ArenaPropDefinition[], radius: number): ArenaPropDefinition[] {
  const axis = Math.max(3, Math.min(5, Math.ceil((radius * 2) / (STATIC_VISIBILITY_RADIUS * 1.45))));
  const spacing = (radius * 2) / axis;
  const expanded: ArenaPropDefinition[] = [];
  let clusterIndex = 0;
  for (let ix = 0; ix < axis; ix += 1) {
    for (let iz = 0; iz < axis; iz += 1) {
      const clusterX = -radius + spacing * (ix + 0.5);
      const clusterZ = -radius + spacing * (iz + 0.5);
      const clusterJitterX = (terrainSeed(ix, iz, 5) - 0.5) * spacing * 0.22;
      const clusterJitterZ = (terrainSeed(ix, iz, 6) - 0.5) * spacing * 0.22;
      for (const prop of props) {
        const skip = clusterIndex !== Math.floor(axis * axis / 2) && terrainSeed(clusterIndex, Math.round(prop.x * 7 + prop.z * 5), 7) < 0.08;
        if (skip) continue;
        const scaleJitter = clusterIndex === Math.floor(axis * axis / 2) ? 1 : 0.88 + ((clusterIndex * 17 + Math.round(prop.x * 3)) % 9) * 0.035;
        const localSpread = 0.9 + terrainSeed(clusterIndex, expanded.length, 8) * 0.22;
        expanded.push({
          ...prop,
          id: `${prop.model}-${clusterIndex}-${expanded.length}`,
          x: wrapValue(clusterX + clusterJitterX + prop.x * localSpread, radius * 2),
          z: wrapValue(clusterZ + clusterJitterZ + prop.z * localSpread, radius * 2),
          rot: (prop.rot ?? 0) + clusterIndex * 0.17,
          scale: (prop.scale ?? 1) * scaleJitter
        });
      }
      clusterIndex += 1;
    }
  }
  return expanded;
}

function wrapValue(value: number, size: number): number {
  const half = size / 2;
  return ((((value + half) % size) + size) % size) - half;
}

function selectedClass(): PlayerClassDefinition | undefined {
  return playerClassesById.get(state.selectedClassId) ?? playerClasses[0];
}

function selectedClassLevel(): number {
  return classLevelFor(selectedClass()?.id);
}

function classLevelFor(classId: string | null | undefined): number {
  const storedLevel = typeof classId === "string" ? state.classLevels.get(classId) : undefined;
  return Math.max(DEFAULT_CLASS_LEVEL, Math.floor(Number(storedLevel ?? DEFAULT_CLASS_LEVEL) || DEFAULT_CLASS_LEVEL));
}

function classMaxUnlockLevel(klass: PlayerClassDefinition | null | undefined): number {
  return Math.max(DEFAULT_CLASS_LEVEL, ...classUnlocks(klass).map((unlock) => unlock.level));
}

function classNextUnlocks(
  klass: PlayerClassDefinition | null | undefined,
  level = classLevelFor(klass?.id)
): Array<ClassUnlock & { kind: "weapon" | "passive" }> {
  const nextLevel = classUnlocks(klass).find((unlock) => unlock.level > level)?.level;
  if (!nextLevel) return [];
  return classUnlocks(klass).filter((unlock) => unlock.level === nextLevel);
}

function classUnlocksAtLevel(
  klass: PlayerClassDefinition | null | undefined,
  level: number
): Array<ClassUnlock & { kind: "weapon" | "passive" }> {
  return classUnlocks(klass).filter((unlock) => unlock.level === level);
}

function classUnlockedWeaponIds(klass = selectedClass(), level = classLevelFor(klass?.id)): string[] {
  return classWeaponUnlocks(klass)
    .filter((unlock) => unlock.level <= level)
    .map((unlock) => unlock.id);
}

function classUnlockedPassiveIds(klass = selectedClass(), level = classLevelFor(klass?.id)): string[] {
  return classPassiveUnlocks(klass)
    .filter((unlock) => unlock.level <= level)
    .map((unlock) => unlock.id);
}

type ClassUnlockKind = "weapon" | "passive";

function isClassUnlockAvailable(
  klass: PlayerClassDefinition | null | undefined,
  id: string | null | undefined,
  kind: ClassUnlockKind,
  level = classLevelFor(klass?.id)
): boolean {
  const unlocks = kind === "weapon" ? classWeaponUnlocks(klass) : classPassiveUnlocks(klass);
  const unlock = unlocks.find((entry) => entry.id === id);
  return Boolean(unlock && unlock.level <= level);
}

function firstUnlockedId(unlocks: ClassUnlock[], level: number, fallbackId?: string): string | null {
  const unlocked = unlocks.find((unlock) => unlock.level <= level);
  if (unlocked) return unlocked.id;
  return fallbackId ?? unlocks[0]?.id ?? null;
}

function normalizeLoadoutPassiveIds(
  klass: PlayerClassDefinition | null | undefined,
  current: ClassLoadout,
  level: number,
  passiveUnlocks: ClassUnlock[]
): string[] {
  const ids: string[] = [];
  const push = (id: string | null | undefined): void => {
    if (typeof id !== "string" || ids.includes(id)) return;
    if (!isClassUnlockAvailable(klass, id, "passive", level)) return;
    ids.push(id);
  };
  for (const id of Array.isArray(current.passiveIds) ? current.passiveIds : []) push(id);
  push(current.passiveId);
  for (const id of klass?.starterPassives ?? []) push(id);
  for (const unlock of passiveUnlocks) {
    if (ids.length >= MAX_LOADOUT_PASSIVES) break;
    push(unlock.id);
  }
  return ids.slice(0, MAX_LOADOUT_PASSIVES);
}

function configuredLoadoutForClass(klass = selectedClass()): ResolvedClassLoadout {
  const classId = klass?.id ?? DEFAULT_CLASS_ID;
  const level = classLevelFor(classId);
  const current = state.configuredLoadouts[classId] ?? {};
  const weaponUnlocks = classWeaponUnlocks(klass);
  const passiveUnlocks = classPassiveUnlocks(klass);
  const fallbackWeapon = firstUnlockedId(weaponUnlocks, level, klass?.starterWeapon);
  const weaponId = isClassUnlockAvailable(klass, current.weaponId, "weapon", level) ? current.weaponId : fallbackWeapon;
  const passiveIds = normalizeLoadoutPassiveIds(klass, current, level, passiveUnlocks);
  const next: ResolvedClassLoadout = { weaponId: weaponId ?? undefined, passiveIds };
  const rawCurrentPassiveIds = Array.isArray(current.passiveIds) ? current.passiveIds : [current.passiveId].filter(Boolean);
  const currentKey = `${current.weaponId ?? ""}|${rawCurrentPassiveIds.join(",")}`;
  const nextKey = `${next.weaponId ?? ""}|${next.passiveIds.join(",")}`;
  if (currentKey !== nextKey) {
    state.configuredLoadouts[classId] = next;
    saveClassLoadouts();
  }
  return next;
}

function setConfiguredLoadout(kind: ClassUnlockKind, id: string): void {
  const klass = selectedClass();
  if (!klass) return;
  if (!isClassUnlockAvailable(klass, id, kind)) {
    const unlocks = kind === "weapon" ? classWeaponUnlocks(klass) : classPassiveUnlocks(klass);
    const unlock = unlocks.find((entry) => entry.id === id);
    toast(`Unlocks at class L${unlock?.level ?? "?"}`);
    return;
  }
  const current = configuredLoadoutForClass(klass);
  let toastText = `${displayNameForUnlock(id)} equipped`;
  if (kind === "weapon") {
    state.configuredLoadouts[klass.id] = { ...current, weaponId: id };
  } else {
    let passiveIds = [...(current.passiveIds ?? [])];
    const index = passiveIds.indexOf(id);
    if (index >= 0) {
      if (passiveIds.length > 1) {
        passiveIds.splice(index, 1);
        toastText = `${displayNameForUnlock(id)} removed`;
      }
    } else if (passiveIds.length < MAX_LOADOUT_PASSIVES) {
      passiveIds.push(id);
      toastText = `${displayNameForUnlock(id)} equipped (${passiveIds.length}/${MAX_LOADOUT_PASSIVES})`;
    } else {
      passiveIds = [...passiveIds.slice(1), id];
      toastText = `${displayNameForUnlock(id)} equipped (${MAX_LOADOUT_PASSIVES}/${MAX_LOADOUT_PASSIVES})`;
    }
    state.configuredLoadouts[klass.id] = { ...current, passiveIds };
  }
  saveClassLoadouts();
  renderClassPicker();
  updateHud(0, true);
  toast(toastText);
  focusLoadoutOption(kind, id);
}

function advanceSelectedClassLevel(): ClassLevelNotice | null {
  const klass = selectedClass();
  if (!klass) return null;
  const previous = classLevelFor(klass.id);
  const next = previous + 1;
  state.classLevels.set(klass.id, next);
  const unlocked = classUnlocksAtLevel(klass, next);
  state.classLevelNotice = { classId: klass.id, level: next, unlocked };
  saveClassLevels();
  return state.classLevelNotice;
}

function classUnlockNoticeText(notice: ClassLevelNotice | null | undefined): string {
  if (!notice?.unlocked?.length) return "";
  return notice.unlocked.map((unlock) => displayNameForUnlock(unlock.id)).slice(0, 2).join(" + ");
}

function xpForLevel(level: number): number {
  const curve = data.progression ?? {};
  const base = curve.xpCurveBase ?? 24;
  const power = curve.xpCurvePower ?? 1.28;
  const linear = curve.xpCurveLinear ?? 8;
  return Math.max(8, Math.round(base * Math.pow(Math.max(1, level), power) + linear * Math.max(1, level)));
}

function createProgressionStats(): ProgressionStats {
  return {
    maxHpFlat: 0,
    maxHpMultiplier: 1,
    regenFlat: 0,
    moveSpeedMultiplier: 1,
    jumpHeightMultiplier: 1,
    gravityMultiplier: 1,
    maxJumpsFlat: 0,
    cooldownMultiplier: 1,
    damageMultiplier: 1,
    projectileSpeedMultiplier: 1,
    projectileSizeMultiplier: 1,
    projectileCountFlat: 0,
    splashDamageFlat: 0,
    pickupRadiusFlat: 0,
    armorFlat: 0,
    knockbackForceMultiplier: 1,
    knockbackResistFlat: 0,
    contactGraceSecondsFlat: 0,
    contactThornsDamage: 0,
    effectDurationMultiplier: 1,
    auraRadiusMultiplier: 1,
    auraDamageMultiplier: 1,
    fireDamageMultiplier: 1,
    silverDamageMultiplier: 1,
    plagueDamageMultiplier: 1,
    bleedDamageMultiplier: 1,
    eliteDamageMultiplier: 1,
    healMultiplier: 1,
    critChanceFlat: 0,
    critMultiplier: data.balance?.combat?.critMultiplier ?? 1.75,
    xpMultiplier: 1,
    curseMultiplier: 1,
    luckMultiplier: 1
  };
}

const PROGRESSION_STAT_KEYS: ReadonlySet<string> = new Set(Object.keys(createProgressionStats()));

function isProgressionStatKey(key: string): key is keyof ProgressionStats {
  return PROGRESSION_STAT_KEYS.has(key);
}

function applyProgressionBonus(stats: ProgressionStats, bonus: ProgressionBonus = {}): void {
  for (const [key, rawValue] of Object.entries(bonus)) {
    if (key === "level" || key === "badge" || key === "stateLabel" || key === "category") continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    if (isProgressionStatKey(key)) {
      if (key.endsWith("Multiplier")) stats[key] *= value;
      else stats[key] += value;
      continue;
    }
    if (key.endsWith("Multiplier") && key.toLowerCase().includes("damage")) stats.damageMultiplier *= value;
  }
}

function applyScaledProgressionBonus(stats: ProgressionStats, bonus: ProgressionBonus = {}, scale = 1): void {
  for (const [key, rawValue] of Object.entries(bonus)) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    if (isProgressionStatKey(key)) {
      if (key.endsWith("Multiplier")) stats[key] *= 1 + (value - 1) * scale;
      else stats[key] += value * scale;
      continue;
    }
    if (key.endsWith("Multiplier") && key.toLowerCase().includes("damage")) {
      stats.damageMultiplier *= 1 + (value - 1) * scale;
    }
  }
}

function nearbyAllyCount(radius = 36): number {
  if (!state.player || !remotePlayers.size) return 0;
  let count = 0;
  const radiusSq = radius * radius;
  for (const remote of remotePlayers.values()) {
    const rx = remote.mesh?.position?.x;
    const rz = remote.mesh?.position?.z;
    if (!Number.isFinite(rx) || !Number.isFinite(rz)) continue;
    if (worldDistanceSquared(state.player.x, state.player.z, rx, rz) <= radiusSq) count += 1;
  }
  return count;
}

function passiveTeamworkScale(): number {
  return 1 + Math.min(3, nearbyAllyCount()) * 0.35;
}

function applyPassiveTeamworkEffects(stats: ProgressionStats): void {
  const scale = passiveTeamworkScale();
  for (const [passiveId, effects] of state.passiveTeamworkEffects) {
    if (!state.passiveSlots.includes(passiveId)) continue;
    for (const effectId of effects ?? []) {
      const effect = PASSIVE_TEAMWORK_EFFECTS.find((entry) => entry.id === effectId);
      if (effect) applyScaledProgressionBonus(stats, effect.bonus, scale);
    }
  }
}

function resolveProgressionStats(): ProgressionStats {
  const stats = createProgressionStats();
  applyProgressionBonus(stats, selectedClass()?.stats);
  for (const bonus of state.statBonuses) applyProgressionBonus(stats, bonus);
  for (const [id, level] of state.passiveLevels) {
    const passive = passiveItemsById.get(id);
    for (const bonus of passive?.bonuses ?? []) {
      if ((bonus.level ?? 0) <= level) applyProgressionBonus(stats, bonus);
    }
  }
  applyPassiveTeamworkEffects(stats);
  stats.cooldownMultiplier = Math.max(0.45, stats.cooldownMultiplier);
  stats.moveSpeedMultiplier = Math.max(0.65, stats.moveSpeedMultiplier);
  stats.jumpHeightMultiplier = clamp(stats.jumpHeightMultiplier, 0.65, 2.6);
  stats.gravityMultiplier = clamp(stats.gravityMultiplier, 0.5, 1.6);
  stats.maxJumpsFlat = clamp(Math.floor(stats.maxJumpsFlat), 0, 4);
  stats.projectileSizeMultiplier = Math.max(0.45, stats.projectileSizeMultiplier);
  stats.splashDamageFlat = clamp(stats.splashDamageFlat, 0, 1.2);
  stats.knockbackResistFlat = clamp(stats.knockbackResistFlat, 0, 0.72);
  stats.critChanceFlat = clamp(stats.critChanceFlat, 0, 0.45);
  stats.curseMultiplier = clamp(stats.curseMultiplier, 0.25, 4);
  stats.luckMultiplier = clamp(stats.luckMultiplier, 0, 6);
  return stats;
}

function applyProgressionStats(options: { fullHeal?: boolean } = {}): void {
  const player = state.player;
  if (!player) return;
  const previousMax = Math.max(1, player.maxHp ?? data.player.startHealth ?? 100);
  const stats = resolveProgressionStats();
  state.progressionStats = stats;
  const baseHp = data.player.startHealth ?? 100;
  const nextMax = Math.max(60, Math.round((baseHp + stats.maxHpFlat) * stats.maxHpMultiplier));
  const hpDelta = Math.max(0, nextMax - previousMax);
  player.maxHp = nextMax;
  player.speed = (data.player.moveSpeed ?? 10.8) * stats.moveSpeedMultiplier;
  player.regenPerSecond = (data.player.healthRegenPerSecond ?? 0) + stats.regenFlat;
  player.armor = stats.armorFlat;
  player.knockbackResist = stats.knockbackResistFlat;
  if (options.fullHeal) player.hp = nextMax;
  else player.hp = Math.min(nextMax, Math.max(1, (player.hp ?? nextMax) + hpDelta));
  if (state.lights.playerGlow) {
    state.lights.playerGlow.color.set(selectedClass()?.color ?? "#d7ff8d");
  }
}

function getWeaponLevel(id: string): number {
  return state.weaponLevels.get(id) ?? (state.weaponSlots.includes(id) ? 1 : 0);
}

function setWeaponLevel(id: string, level: number): number {
  const weapon = weaponsById.get(id);
  if (!weapon) return 0;
  const nextLevel = clamp(Math.floor(level), 1, weapon.maxLevel ?? 1);
  state.weaponLevels.set(id, nextLevel);
  return nextLevel;
}

function addWeaponToLoadout(id: string | null | undefined, level = 1): boolean {
  if (typeof id !== "string" || !weaponsById.has(id)) return false;
  if (!state.weaponSlots.includes(id) && state.weaponSlots.length >= getMaxWeaponSlots()) return false;
  if (!state.weaponSlots.includes(id)) state.weaponSlots.push(id);
  setWeaponLevel(id, Math.max(level, getWeaponLevel(id) || 1));
  state.activeWeaponId = state.activeWeaponId ?? id;
  return true;
}

function addPassiveToLoadout(id: string | null | undefined, level = 1): boolean {
  if (typeof id !== "string" || !passiveItemsById.has(id)) return false;
  if (!state.passiveSlots.includes(id) && state.startingPassiveIds.size > 0 && !state.startingPassiveIds.has(id)) return false;
  if (!state.passiveSlots.includes(id) && state.passiveSlots.length >= getMaxPassiveSlots()) return false;
  if (!state.passiveSlots.includes(id)) state.passiveSlots.push(id);
  const passive = passiveItemsById.get(id);
  const nextLevel = clamp(Math.floor(level), 1, passive?.maxLevel ?? 1);
  state.passiveLevels.set(id, Math.max(nextLevel, state.passiveLevels.get(id) ?? 0));
  return true;
}

function applyClassLoadout(): void {
  state.weaponSlots = [];
  state.weaponCooldowns.clear();
  state.weaponLevels.clear();
  state.passiveSlots = [];
  state.passiveLevels.clear();
  state.passiveTimers.clear();
  state.startingPassiveIds.clear();
  state.passiveTeamworkEffects.clear();
  state.evolvedWeapons.clear();
  state.statBonuses = [];
  const klass = selectedClass();
  const loadout = configuredLoadoutForClass(klass);
  const starterWeapon = loadout.weaponId ?? klass?.starterWeapon ?? data.levelUpPools?.starterWeapons?.[0] ?? data.weapons[0]?.id;
  addWeaponToLoadout(starterWeapon, 1);
  for (const passiveId of loadout.passiveIds ?? []) addPassiveToLoadout(passiveId, 1);
  state.startingPassiveIds = new Set(state.passiveSlots);
  if (!state.weaponSlots.length && data.weapons[0]) addWeaponToLoadout(data.weapons[0].id, 1);
  state.activeWeaponId = state.weaponSlots[0] ?? null;
}

function getMaxWeaponSlots(): number {
  return 1;
}

function getMaxPassiveSlots(): number {
  return Math.max(1, state.startingPassiveIds.size || MAX_LOADOUT_PASSIVES);
}

function getPassiveLevel(id: string): number {
  return state.passiveLevels.get(id) ?? 0;
}

function passiveTimerReady(id: string, cooldown: number, dt: number): boolean {
  const remaining = (state.passiveTimers.get(id) ?? 0) - dt;
  if (remaining > 0) {
    state.passiveTimers.set(id, remaining);
    return false;
  }
  state.passiveTimers.set(id, cooldown);
  return true;
}

function updatePassiveEffects(dt: number): void {
  if (!state.player || state.benchStress?.quietCombat) return;
  if (getPassiveLevel("blackGarlic") > 0 && passiveTimerReady("blackGarlic", Math.max(0.16, (0.74 - getPassiveLevel("blackGarlic") * 0.045) * BLACK_GARLIC_COOLDOWN_MULTIPLIER), dt)) {
    triggerBlackGarlicAura();
  }
  if (getPassiveLevel("graveBoots") > 0) updateGraveBootTrail(dt);
  if (getPassiveLevel("silverRosary") > 0 && passiveTimerReady("silverRosary", Math.max(0.8, 1.85 - getPassiveLevel("silverRosary") * 0.09), dt)) {
    triggerSilverRosaryMark();
  }
  if (getPassiveLevel("funeralBellClapper") > 0 && passiveTimerReady("funeralBellClapper", Math.max(2.8, 6.2 - getPassiveLevel("funeralBellClapper") * 0.42), dt)) {
    triggerTempoChime();
  }
}

function passiveWeapon(id: string, color: string, damageType = "holy"): DamageWeapon {
  const level = getPassiveLevel(id);
  return {
    id,
    color,
    damageType,
    damage: 4 + level * 2.2,
    knockback: 1.6 + level * 0.5,
    eliteDamageMultiplier: 1 + level * 0.035,
    critChance: (state.progressionStats?.critChanceFlat ?? 0) * 0.5,
    critMultiplier: state.progressionStats?.critMultiplier ?? 1.75
  };
}

function triggerBlackGarlicAura(): void {
  const player = state.player;
  if (!player) return;
  const level = getPassiveLevel("blackGarlic");
  const radius = (3.6 + level * 0.58) * BLACK_GARLIC_RANGE_MULTIPLIER + ((state.progressionStats ?? resolveProgressionStats()).auraRadiusMultiplier - 1) * 4;
  const weapon = passiveWeapon("blackGarlic", "#d6c0a4", "shadow");
  const hits = applyAreaWeaponDamage(weapon, player.x, player.z, radius, {
    damageScale: 0.55 + level * 0.08,
    slowSeconds: 0.24 + level * 0.025,
    knockbackScale: 0.25,
    hitLimit: 10 + level * 3
  });
  if (!hits) return;
  spawnPulseRing(player.x, player.z, "#d6c0a4", 0.18, 0.7, radius * 0.75);
}

function updateGraveBootTrail(dt: number): void {
  const player = state.player;
  if (!player) return;
  const speed = Math.hypot(player.moveMomentumX, player.moveMomentumZ);
  if (speed < player.speed * 0.74) {
    state.passiveTimers.set("graveBootsTrail", Math.min(state.passiveTimers.get("graveBootsTrail") ?? 0, 0.12));
    return;
  }
  if (!passiveTimerReady("graveBootsTrail", Math.max(0.14, 0.34 - getPassiveLevel("graveBoots") * 0.025), dt)) return;
  const backX = -(player.moveMomentumX / Math.max(0.001, speed));
  const backZ = -(player.moveMomentumZ / Math.max(0.001, speed));
  const x = wrapWorld(player.x + backX * 1.15);
  const z = wrapWorld(player.z + backZ * 1.15);
  const weapon = passiveWeapon("graveBoots", "#9f8d72", "physical");
  applyAreaWeaponDamage(weapon, x, z, 2.2 + getPassiveLevel("graveBoots") * 0.16, {
    damageScale: 0.22,
    slowSeconds: 0.36,
    knockbackScale: 0.08,
    hitLimit: 5
  });
  spawnEffect("jumpDust", x, z, 0.22, { particles: 5, color: "#9f8d72", y: 0.14, speed: 1.6, size: 0.14 });
}

function triggerSilverRosaryMark(): void {
  const player = state.player;
  if (!player) return;
  let target: Enemy | null = null;
  let best = -Infinity;
  const candidates = queryLiveEnemies(player.x, player.z, 42);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const distanceSq = worldDistanceSquared(player.x, player.z, enemy.x, enemy.z);
    const score = (enemy.boss ? 80 : 0) + resolveEnemySpawnRank(enemy.typeId) * 40 + (enemy.hp / Math.max(1, enemy.maxHp)) * 10 - distanceSq * 0.001;
    if (score > best) {
      best = score;
      target = enemy;
    }
  }
  if (!target) return;
  const weapon = passiveWeapon("silverRosary", "#f2f4df", "holy");
  const { dx, dz } = worldDelta(player.x, player.z, target.x, target.z);
  const distance = Math.hypot(dx, dz) || 1;
  applyWeaponDamage(target, weapon, weapon.damage * 1.8, { hitX: dx / distance, hitZ: dz / distance, knockbackScale: 0.42, slowSeconds: 0.5, color: "#f2f4df" });
  spawnPulseRing(target.x, target.z, "#f2f4df", 0.3, 0.55, 2.5);
  spawnBeamPreview({ x: player.x, y: 1.4, z: player.z }, angleTo(player.x, player.z, target.x, target.z), Math.min(18, distance), "#f2f4df");
}

function triggerTempoChime(): void {
  const player = state.player;
  if (!player) return;
  const level = getPassiveLevel("funeralBellClapper");
  const refund = 0.12 + level * 0.08;
  for (const [weaponId, remaining] of state.weaponCooldowns) {
    state.weaponCooldowns.set(weaponId, Math.max(0, remaining - refund));
  }
  spawnPulseRing(player.x, player.z, "#c8b784", 0.22, 0.75, 3.4 + level * 0.42);
  spawnFloatingText("TEMPO", player.x, player.z, "#f3de9a", 0.88, { targetHeight: actorFloatingTextHeight(player, 0.8), lifeSeconds: 0.55 });
}

function triggerBloodHourglassDeathBloom(enemy: Enemy): void {
  const level = getPassiveLevel("bloodHourglass");
  if (level <= 0 || Math.random() > 0.28 + level * 0.08) return;
  addWeaponZone({
    kind: "bloodBloom",
    weaponId: "bloodHourglass",
    x: enemy.x,
    z: enemy.z,
    radius: 2.7 + level * 0.26,
    ttl: 2.1 + level * 0.2,
    tickEvery: 0.42,
    damage: 2.2 + level * 1.3,
    slowSeconds: 0.24,
    color: "#9f2635"
  });
}

function unlockedWeaponPool(): string[] {
  const ids = new Set(classUnlockedWeaponIds());
  for (const id of state.weaponSlots) ids.add(id);
  return [...ids].filter((id) => weaponsById.has(id));
}

function unlockedPassivePool(): string[] {
  const ids = new Set(classUnlockedPassiveIds());
  for (const id of state.passiveSlots) ids.add(id);
  return [...ids].filter((id) => passiveItemsById.has(id));
}

function getWeaponRuntime(idOrWeapon: string | WeaponDefinition): WeaponRuntime | null {
  const base = typeof idOrWeapon === "string" ? weaponsById.get(idOrWeapon) : idOrWeapon;
  if (!base) return null;
  const level = Math.max(1, getWeaponLevel(base.id));
  const stats = state.progressionStats ?? resolveProgressionStats();
  const runtime: WeaponRuntime = {
    ...base,
    name: base.name,
    cooldown: base.cooldown,
    damage: base.damage,
    speed: base.speed,
    range: base.range,
    pellets: base.pellets,
    spread: base.spread,
    pierce: base.pierce,
    knockback: base.knockback,
    level,
    evolved: state.evolvedWeapons.has(base.id),
    eliteDamageMultiplier: 1,
    critChance: stats.critChanceFlat,
    critMultiplier: stats.critMultiplier,
    projectileSizeMultiplier: stats.projectileSizeMultiplier,
    splashDamageMultiplier: stats.splashDamageFlat,
    splashRadius: stats.splashDamageFlat > 0 ? 2.4 + (stats.projectileSizeMultiplier - 1) * 1.6 : 0
  };
  applySpecialWeaponRuntimeDefaults(runtime);
  for (const bonus of base.levels ?? []) {
    if ((bonus.level ?? 0) <= level) applyWeaponLevelBonus(runtime, bonus);
  }
  runtime.cooldown *= stats.cooldownMultiplier;
  runtime.damage *= stats.damageMultiplier * damageTypeMultiplier(runtime.damageType, stats);
  runtime.speed *= stats.projectileSpeedMultiplier;
  if (runtime.returnSpeed) runtime.returnSpeed *= stats.projectileSpeedMultiplier;
  if (runtime.summonSpeed) runtime.summonSpeed *= stats.projectileSpeedMultiplier;
  if (runtime.waveSpeed) runtime.waveSpeed *= stats.projectileSpeedMultiplier;
  runtime.pellets += stats.projectileCountFlat;
  runtime.projectileSizeMultiplier = Math.max(0.45, runtime.projectileSizeMultiplier ?? 1);
  runtime.splashDamageMultiplier = Math.max(0, runtime.splashDamageMultiplier ?? 0);
  runtime.knockback *= stats.knockbackForceMultiplier;
  if (runtime.tags?.some((tag) => ["aura", "orbit", "area"].includes(tag))) {
    runtime.range *= stats.auraRadiusMultiplier;
    if (runtime.specialRadius) runtime.specialRadius *= stats.auraRadiusMultiplier;
    if (runtime.poolRadius) runtime.poolRadius *= stats.auraRadiusMultiplier;
    if (runtime.pulseRadius) runtime.pulseRadius *= stats.auraRadiusMultiplier;
    if (runtime.sweepRadius) runtime.sweepRadius *= stats.auraRadiusMultiplier;
  }
  if (runtime.specialRadius) runtime.specialRadius *= runtime.projectileSizeMultiplier;
  if (runtime.poolRadius) runtime.poolRadius *= runtime.projectileSizeMultiplier;
  if (runtime.pulseRadius) runtime.pulseRadius *= runtime.projectileSizeMultiplier;
  if (runtime.sweepRadius) runtime.sweepRadius *= runtime.projectileSizeMultiplier;
  if (runtime.width) runtime.width *= runtime.projectileSizeMultiplier;
  if (runtime.orbitalSize) runtime.orbitalSize *= runtime.projectileSizeMultiplier;
  runtime.range = Math.max(runtime.range, runtime.speed * 0.45);
  runtime.eliteDamageMultiplier *= stats.eliteDamageMultiplier;
  if (runtime.evolved) applyEvolutionRuntime(runtime);
  runtime.cooldown = Math.max(data.balance?.combat?.globalCooldownFloor ?? 0.12, runtime.cooldown);
  runtime.damage = Math.max(1, runtime.damage);
  runtime.speed = Math.max(1, runtime.speed);
  runtime.pellets = Math.max(1, Math.round(runtime.pellets));
  runtime.pierce = Math.max(1, Math.round(runtime.pierce));
  runtime.spread = Math.max(0, runtime.spread);
  runtime.knockback = Math.max(0, runtime.knockback);
  return runtime;
}

function applySpecialWeaponRuntimeDefaults(weapon: WeaponRuntime): void {
  if (weapon.id === "graveLantern") {
    weapon.specialRadius = 4.8;
    weapon.orbitSpeed = 1.65;
    weapon.orbitalSize = 1.1;
  } else if (weapon.id === "plagueVial") {
    weapon.poolRadius = 2.8;
    weapon.poolSeconds = 4.2;
    weapon.tickInterval = 0.35;
    weapon.arcHeight = 4;
  } else if (weapon.id === "coffinLid") {
    weapon.returnSpeed = 18;
    weapon.width = 1.8;
  } else if (weapon.id === "batSwarm") {
    weapon.summonSpeed = 15;
    weapon.summonSeconds = 4.5;
    weapon.biteCooldown = 0.55;
  } else if (weapon.id === "funeralBell") {
    weapon.pulseRadius = 8;
    weapon.waveSpeed = 18;
    weapon.staggerSeconds = 0.45;
    weapon.pulseDelaySeconds = 0.28;
  } else if (weapon.id === "reaperScythe") {
    weapon.sweepRadius = 5.8;
    weapon.sweepArc = (105 * Math.PI) / 180;
    weapon.executeRatio = 0.08;
  }
}

function applyWeaponLevelBonus(weapon: WeaponRuntime, bonus: ProgressionBonus): void {
  if (bonus.damage) weapon.damage += bonus.damage;
  if (bonus.pierce) weapon.pierce += bonus.pierce;
  if (bonus.projectiles) weapon.pellets += bonus.projectiles;
  if (bonus.orbitals) weapon.pellets += bonus.orbitals;
  if (bonus.summons) weapon.pellets += bonus.summons;
  if (bonus.pulseCount) weapon.pellets += bonus.pulseCount;
  if (bonus.cooldownMultiplier) weapon.cooldown *= bonus.cooldownMultiplier;
  if (bonus.projectileSpeedMultiplier) {
    weapon.speed *= bonus.projectileSpeedMultiplier;
    weapon.range *= bonus.projectileSpeedMultiplier;
  }
  if (bonus.spreadDegrees) weapon.spread += (bonus.spreadDegrees * Math.PI) / 180;
  if (bonus.knockback) weapon.knockback += bonus.knockback;
  if (bonus.eliteDamageMultiplier) weapon.eliteDamageMultiplier *= bonus.eliteDamageMultiplier;
  if (bonus.radius) {
    weapon.range += bonus.radius * 1.8;
    if (weapon.specialRadius) weapon.specialRadius += bonus.radius;
    if (weapon.pulseRadius) weapon.pulseRadius += bonus.radius;
    if (weapon.sweepRadius) weapon.sweepRadius += bonus.radius;
  }
  if (bonus.poolRadius) {
    weapon.range += bonus.poolRadius * 1.4;
    if (weapon.poolRadius) weapon.poolRadius += bonus.poolRadius;
  }
  const damageOverTime = bonus.bleedDamagePerSecond ?? bonus.burnDamagePerSecond;
  if (damageOverTime) weapon.damage += damageOverTime * 0.35;
  if (bonus.rotationSpeedMultiplier && weapon.orbitSpeed) weapon.orbitSpeed *= bonus.rotationSpeedMultiplier;
  if (bonus.orbitalSize && weapon.orbitalSize) weapon.orbitalSize += bonus.orbitalSize;
  if (bonus.poolSeconds && weapon.poolSeconds) weapon.poolSeconds += bonus.poolSeconds;
  if (bonus.tickRateMultiplier && weapon.tickInterval) weapon.tickInterval *= bonus.tickRateMultiplier;
  if (bonus.returnSpeedMultiplier && weapon.returnSpeed) weapon.returnSpeed *= bonus.returnSpeedMultiplier;
  if (bonus.width && weapon.width) weapon.width += bonus.width;
  if (bonus.summonSeconds && weapon.summonSeconds) weapon.summonSeconds += bonus.summonSeconds;
  if (bonus.biteCooldownMultiplier && weapon.biteCooldown) weapon.biteCooldown *= bonus.biteCooldownMultiplier;
  if (bonus.staggerSeconds && weapon.staggerSeconds) weapon.staggerSeconds += bonus.staggerSeconds;
  if (bonus.pulseDelaySeconds && weapon.pulseDelaySeconds) weapon.pulseDelaySeconds = bonus.pulseDelaySeconds;
  if (bonus.arcDegrees && weapon.sweepArc) weapon.sweepArc += (bonus.arcDegrees * Math.PI) / 180;
  if (bonus.executeHealthRatio && weapon.executeRatio) weapon.executeRatio += bonus.executeHealthRatio;
}

function damageTypeMultiplier(type: string, stats: ProgressionStats): number {
  if (type === "silver" || type === "holy") return stats.silverDamageMultiplier;
  if (type === "fire") return stats.fireDamageMultiplier * stats.auraDamageMultiplier;
  if (type === "plague") return stats.plagueDamageMultiplier;
  if (type === "bleed") return stats.bleedDamageMultiplier;
  return 1;
}

function applyEvolutionRuntime(weapon: WeaponRuntime): void {
  const evolution = weaponsById.get(weapon.id)?.evolution;
  weapon.name = evolution?.name ?? `${weapon.name}+`;
  weapon.color = evolution?.color ?? weapon.color;
  weapon.damage *= 1.28;
  weapon.cooldown *= 0.88;
  weapon.pellets += 1;
  weapon.pierce += 1;
  weapon.range *= 1.12;
  weapon.knockback *= 1.12;
  if (weapon.specialRadius) weapon.specialRadius *= 1.12;
  if (weapon.poolRadius) weapon.poolRadius *= 1.12;
  if (weapon.poolSeconds) weapon.poolSeconds *= 1.12;
  if (weapon.pulseRadius) weapon.pulseRadius *= 1.12;
  if (weapon.sweepRadius) weapon.sweepRadius *= 1.12;
  if (weapon.summonSeconds) weapon.summonSeconds *= 1.12;
  if (weapon.executeRatio) weapon.executeRatio += 0.03;
}

function getPickupCollectRadius(): number {
  const stats = state.progressionStats ?? resolveProgressionStats();
  return PICKUP_COLLECT_RADIUS + Math.max(0, stats.pickupRadiusFlat) * PICKUP_COLLECT_RADIUS_MULTIPLIER;
}

function grantXp(amount: number): void {
  const stats = state.progressionStats ?? resolveProgressionStats();
  state.xp += Math.max(1, Math.round(amount * (stats.xpMultiplier ?? 1)));
  let leveled = false;
  while (state.xp >= state.nextXp) {
    state.xp -= state.nextXp;
    state.level += 1;
    advanceSelectedClassLevel();
    state.nextXp = xpForLevel(state.level);
    state.pendingLevelChoices += 1;
    leveled = true;
  }
  if (leveled) {
    renderClassPicker();
    renderLoadoutConfig();
    updateHud(0, true);
    if (PERF_FLAGS.benchNoLevelChoices) {
      state.pendingLevelChoices = 0;
      state.levelChoice = null;
      state.resumeAfterLevelChoice = false;
      return;
    }
    openNextLevelChoice();
  }
}

function openNextLevelChoice(): void {
  if (!state.pendingLevelChoices || state.levelChoice || !ui.levelChoiceOverlay || !ui.levelChoiceGrid) return;
  const player = state.player;
  if (!player) return;
  state.resumeAfterLevelChoice = state.resumeAfterLevelChoice || state.running;
  state.running = false;
  document.exitPointerLock?.();
  const choices = buildLevelUpChoices();
  state.levelChoice = { choices, selectedIndex: 0 };
  renderLevelChoices(choices);
  document.body.classList.add("level-choice-open");
  ui.levelChoiceOverlay.classList.remove("hidden");
  const unlockText = classUnlockNoticeText(state.classLevelNotice);
  ui.levelChoiceSubtitle.textContent = unlockText
    ? `${selectedClass()?.name ?? "Class"} L${selectedClassLevel()}: new kit unlocked, ${unlockText}.`
    : `${selectedClass()?.name ?? "Class"} L${selectedClassLevel()}. Choose one edge before the graves move again.`;
  updateLevelChoiceControls();
  player.animLock = 0.55;
  playActorAnimation(player, "celebrate", 0.04);
  pulseOverlay("level");
  playSynthCue("level");
  spawnPulseRing(player.x, player.z, selectedClass()?.color ?? "#9fe8ff", 0.64, 1.2, 6);
  spawnFloatingText("LEVEL UP", player.x, player.z, "#bff7ff", 1.28, { targetHeight: actorFloatingTextHeight(player, 0.55) });
  pulseShake(0.45, 0.35);
  setMenuFocus(0);
}

function closeLevelChoice(): void {
  state.levelChoice = null;
  document.body.classList.remove("level-choice-open");
  ui.levelChoiceOverlay?.classList.add("hidden");
  ui.levelChoiceGrid?.replaceChildren();
  updateLevelChoiceControls();
}

function levelChoiceCount(): number {
  return Math.max(1, Math.floor(data.progression?.levelChoiceCount ?? 3));
}

function levelChoiceCharge(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function levelChoiceKey(choice: LevelChoice): string {
  return `${choice.kind}:${choice.id}:${choice.targetLevel ?? 0}:${choice.effect?.id ?? ""}`;
}

function rollStatAmount(definition: RunStatDefinition): number {
  const min = Number(definition.min);
  const max = Number(definition.max);
  const step = Number(definition.step ?? 0);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 1;
  if (!Number.isFinite(step) || step <= 0) return round(min + Math.random() * (max - min));
  const steps = Math.max(0, Math.round((max - min) / step));
  return roundToStep(min + Math.floor(Math.random() * (steps + 1)) * step, step);
}

function createRolledStatChoice(
  definition: RunStatDefinition,
  options: { badge?: string; subtitle?: string } = {}
): StatLevelChoice {
  const amount = rollStatAmount(definition);
  return createStatChoice(
    definition.id,
    definition.title,
    definition.description(amount),
    definition.bonus(amount),
    definition.color,
    definition.category,
    options.badge ?? definition.badge,
    options.subtitle ?? "Weapon property",
    amount
  );
}

function rollChestStatReward(): StatLevelChoice {
  const definition = RUN_STAT_DEFINITIONS[Math.floor(Math.random() * RUN_STAT_DEFINITIONS.length)];
  if (!definition) throw new Error("Run stat definitions are empty.");
  return createRolledStatChoice(definition, { badge: "Cache", subtitle: "Chest stat" });
}

function passiveTeamworkEffectIds(passiveId: string): string[] {
  return state.passiveTeamworkEffects.get(passiveId) ?? [];
}

function addPassiveTeamworkEffect(passiveId: string, effectId: string): boolean {
  if (!passiveItemsById.has(passiveId)) return false;
  const current = passiveTeamworkEffectIds(passiveId);
  if (current.includes(effectId)) return false;
  state.passiveTeamworkEffects.set(passiveId, [...current, effectId]);
  return true;
}

function rollPassiveTeamworkEffect(
  passiveId: string,
  excludedEffectIds: ReadonlySet<string> = new Set<string>()
): PassiveTeamworkEffect | null {
  const owned = new Set(passiveTeamworkEffectIds(passiveId));
  const pool = PASSIVE_TEAMWORK_EFFECTS.filter((effect) => !owned.has(effect.id) && !excludedEffectIds.has(effect.id));
  const candidates = pool.length ? pool : PASSIVE_TEAMWORK_EFFECTS.filter((effect) => !owned.has(effect.id));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function buildLevelUpChoices(excludedKeys: ReadonlySet<string> | null = null): LevelChoice[] {
  const candidates: LevelChoice[] = RUN_STAT_DEFINITIONS.map((definition) => createRolledStatChoice(definition));
  for (const id of state.passiveSlots) {
    if (!state.startingPassiveIds.has(id)) continue;
    const passive = passiveItemsById.get(id);
    const current = state.passiveLevels.get(id) ?? 0;
    if (passive && current < (passive.maxLevel ?? 1)) {
      const excludedEffectIds = new Set<string>();
      for (const key of excludedKeys ?? []) {
        const [, passiveId, , effectId] = String(key).split(":");
        if (passiveId === id && effectId) excludedEffectIds.add(effectId);
      }
      candidates.push(createPassiveTeamworkChoice(id, current + 1, excludedEffectIds));
    }
  }
  const unique: LevelChoice[] = [];
  const seen = new Set<string>();
  for (const choice of candidates) {
    const key = `${choice.kind}:${choice.id}:${choice.targetLevel ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(choice);
  }
  const count = levelChoiceCount();
  const draftPool = unique.filter((choice) => !state.banishedLevelChoices.has(levelChoiceKey(choice)));
  const freshPool = excludedKeys?.size
    ? draftPool.filter((choice) => !excludedKeys.has(levelChoiceKey(choice)))
    : draftPool;
  const available = freshPool.length >= Math.min(count, draftPool.length)
    ? freshPool
    : [
      ...freshPool,
      ...draftPool.filter((choice) => excludedKeys?.has(levelChoiceKey(choice)))
    ];
  const bias = new Set(selectedClass()?.passiveBias ?? []);
  available.sort((a, b) => choiceScore(b, bias) - choiceScore(a, bias));
  const selected = available.slice(0, count);
  const passiveCandidate = available.find((choice) => choice.kind === "passive");
  if (passiveCandidate && !selected.some((choice) => choice.kind === "passive")) {
    selected[Math.max(0, selected.length - 1)] = passiveCandidate;
  }
  return selected;
}

function choiceScore(choice: LevelChoice, bias: ReadonlySet<string>): number {
  let score = Math.random();
  if (choice.kind === "evolution") score += 5;
  if (choice.kind === "weapon" && choice.owned) score += 1.6;
  if (choice.kind === "passive" && choice.owned) score += 1.35;
  if (bias.has(choice.category)) score += 1.2;
  if (choice.kind === "heal" && state.player && state.player.hp < state.player.maxHp * 0.45) score += 2.2;
  return score;
}

function createWeaponChoice(id: string, targetLevel: number): WeaponLevelChoice {
  const weapon = weaponsById.get(id);
  if (!weapon) throw new Error(`Unknown weapon choice: ${id}`);
  const bonus = (weapon?.levels ?? []).find((entry) => entry.level === targetLevel);
  const owned = state.weaponSlots.includes(id);
  return {
    kind: "weapon",
    id,
    targetLevel,
    owned,
    title: owned ? `${weapon.name} ${formatLevel(targetLevel)}` : weapon.name,
    badge: owned ? `L${targetLevel}` : "New",
    subtitle: owned ? (bonus?.stateLabel ?? weapon.stateLabel ?? "Weapon upgrade") : "New weapon",
    description: owned ? describeWeaponBonus(bonus) : (weapon.fantasy ?? weapon.stateLabel ?? "Adds another auto-fire line."),
    color: weapon.color ?? "#d7ff8d",
    category: bonus?.category ?? weapon.categories?.utility ?? "damage"
  };
}

function createPassiveChoice(id: string, targetLevel: number): PassiveLevelChoice {
  const passive = passiveItemsById.get(id);
  if (!passive) throw new Error(`Unknown passive choice: ${id}`);
  const bonus = (passive?.bonuses ?? []).find((entry) => entry.level === targetLevel);
  const owned = state.passiveSlots.includes(id);
  return {
    kind: "passive",
    id,
    targetLevel,
    owned,
    title: owned ? `${passive.name} ${formatLevel(targetLevel)}` : passive.name,
    badge: owned ? `L${targetLevel}` : "New",
    subtitle: bonus?.stateLabel ?? passive.stateLabel ?? "Passive",
    description: describePassiveBonus(bonus, passive),
    color: passive.visual?.color ?? "#d7ff8d",
    category: bonus?.category ?? "utility"
  };
}

function createPassiveTeamworkChoice(
  id: string,
  targetLevel: number,
  excludedEffectIds: ReadonlySet<string> = new Set<string>()
): PassiveLevelChoice {
  const passive = passiveItemsById.get(id);
  if (!passive) throw new Error(`Unknown passive teamwork choice: ${id}`);
  const effect = rollPassiveTeamworkEffect(id, excludedEffectIds);
  const fallbackBonus = (passive?.bonuses ?? []).find((entry) => entry.level === targetLevel);
  const description = effect
    ? `${effect.description}: ${describeGenericBonus(effect.bonus)}`
    : describePassiveBonus(fallbackBonus, passive);
  return {
    kind: "passive",
    id,
    targetLevel,
    owned: true,
    effect,
    title: `${passive.name} ${formatLevel(targetLevel)}`,
    badge: effect?.badge ?? `L${targetLevel}`,
    subtitle: effect ? effect.title : (fallbackBonus?.stateLabel ?? passive.stateLabel ?? "Passive"),
    description,
    color: effect?.color ?? passive.visual?.color ?? "#d7ff8d",
    category: effect?.category ?? fallbackBonus?.category ?? "utility"
  };
}

function createEvolutionChoice(id: string): EvolutionLevelChoice {
  const weapon = weaponsById.get(id);
  if (!weapon) throw new Error(`Unknown evolution choice: ${id}`);
  return {
    kind: "evolution",
    id,
    title: weapon.evolution?.name ?? `${weapon.name}+`,
    badge: "Evo",
    subtitle: weapon.evolution?.stateLabel ?? "Evolved weapon",
    description: weapon.evolution?.change ?? "Transforms maxed weapon into a stronger pattern.",
    color: weapon.evolution?.color ?? weapon.color ?? "#fff4a6",
    category: "evolution"
  };
}

function createStatChoice(
  id: string,
  title: string,
  description: string,
  bonus: ProgressionBonus,
  color: string,
  category: string,
  badge = "Core",
  subtitle = "Weapon property",
  amount: number | null = null
): StatLevelChoice {
  return { kind: "stat", id, title, badge, subtitle, description, bonus, color, category, amount };
}

function createHealChoice(): HealLevelChoice {
  return { kind: "heal", id: "fieldVial", title: "Field Vial", badge: "Heal", subtitle: "Recover now", description: "Patch 35 HP before the next pack closes.", color: "#85ff9a", category: "survival" };
}

function canEvolveWeapon(id: string): boolean {
  const weapon = weaponsById.get(id);
  if (!weapon?.evolution || state.evolvedWeapons.has(id)) return false;
  if (getWeaponLevel(id) < (weapon.maxLevel ?? data.progression?.evolutionLevel ?? 8)) return false;
  const required = weapon.evolution.requires;
  if (!required) return true;
  return (state.passiveLevels.get(required) ?? 0) >= (passiveItemsById.get(required)?.maxLevel ?? data.progression?.passiveEvolutionLevel ?? 5);
}

function describeWeaponBonus(bonus: ProgressionBonus | null | undefined): string {
  if (!bonus) return "Unlocks base attack pattern.";
  const parts: string[] = [];
  if (bonus.damage) parts.push(`damage +${bonus.damage}`);
  if (bonus.projectiles || bonus.orbitals || bonus.summons || bonus.pulseCount) parts.push("extra shot");
  if (bonus.pierce) parts.push(`pierce +${bonus.pierce}`);
  if (bonus.cooldownMultiplier) parts.push("faster cooldown");
  if (bonus.knockback) parts.push("more shove");
  return parts.length ? parts.join(", ") : (bonus.stateLabel ?? "Better weapon rhythm.");
}

function describePassiveBonus(
  bonus: ProgressionBonus | null | undefined,
  passive: PassiveDefinition | null | undefined
): string {
  if (!bonus) return passive?.stateLabel ?? "Passive upgrade.";
  const parts: string[] = [];
  if (bonus.auraRadiusMultiplier) parts.push(`radius +${percentDelta(bonus.auraRadiusMultiplier)}`);
  if (bonus.auraDamageMultiplier) parts.push(`aura damage +${percentDelta(bonus.auraDamageMultiplier)}`);
  if (bonus.cooldownMultiplier) parts.push(`cooldown -${percentDelta(1 / bonus.cooldownMultiplier)}`);
  if (bonus.damageMultiplier) parts.push(`damage +${percentDelta(bonus.damageMultiplier)}`);
  if (bonus.silverDamageMultiplier) parts.push(`silver damage +${percentDelta(bonus.silverDamageMultiplier)}`);
  if (bonus.eliteDamageMultiplier) parts.push(`elite damage +${percentDelta(bonus.eliteDamageMultiplier)}`);
  if (bonus.moveSpeedMultiplier) parts.push(`move speed +${percentDelta(bonus.moveSpeedMultiplier)}`);
  if (bonus.pickupRadiusFlat) parts.push(`pickup +${round(bonus.pickupRadiusFlat)}`);
  if (bonus.armorFlat) parts.push(`armor +${bonus.armorFlat}`);
  if (bonus.contactThornsDamage) parts.push(`contact punish +${bonus.contactThornsDamage}`);
  if (bonus.knockbackResistFlat) parts.push(`knockback resist +${Math.round(bonus.knockbackResistFlat * 100)}%`);
  if (bonus.effectDurationMultiplier) parts.push(`duration +${percentDelta(bonus.effectDurationMultiplier)}`);
  if (bonus.bleedDamageMultiplier) parts.push(`bleed damage +${percentDelta(bonus.bleedDamageMultiplier)}`);
  if (bonus.healMultiplier) parts.push(`healing +${percentDelta(bonus.healMultiplier)}`);
  if (bonus.maxHpFlat) parts.push(`max HP +${bonus.maxHpFlat}`);
  return parts.length ? parts.join(", ") : (bonus.stateLabel ?? bonus.badge ?? "Passive upgrade.");
}

function describeGenericBonus(bonus: ProgressionBonus = {}): string {
  const parts: string[] = [];
  if (bonus.damageMultiplier) parts.push(`damage +${percentDelta(bonus.damageMultiplier)}`);
  if (bonus.cooldownMultiplier) parts.push(`attack speed +${percentDelta(1 / bonus.cooldownMultiplier)}`);
  if (bonus.critChanceFlat) parts.push(`crit +${formatPercentPoints(bonus.critChanceFlat)}`);
  if (bonus.critMultiplier) parts.push(`crit damage +${percentDelta(bonus.critMultiplier)}`);
  if (bonus.projectileCountFlat) parts.push(`projectiles +${bonus.projectileCountFlat}`);
  if (bonus.projectileSpeedMultiplier) parts.push(`shot speed +${percentDelta(bonus.projectileSpeedMultiplier)}`);
  if (bonus.projectileSizeMultiplier) parts.push(`shot size +${percentDelta(bonus.projectileSizeMultiplier)}`);
  if (bonus.splashDamageFlat) parts.push(`splash +${formatPercentPoints(bonus.splashDamageFlat)}`);
  if (bonus.moveSpeedMultiplier) parts.push(`move +${percentDelta(bonus.moveSpeedMultiplier)}`);
  if (bonus.jumpHeightMultiplier) parts.push(`jump +${percentDelta(bonus.jumpHeightMultiplier)}`);
  if (bonus.gravityMultiplier) parts.push(`gravity -${percentDelta(1 / bonus.gravityMultiplier)}`);
  if (bonus.maxJumpsFlat) parts.push(`jumps +${bonus.maxJumpsFlat}`);
  if (bonus.xpMultiplier) parts.push(`XP +${percentDelta(bonus.xpMultiplier)}`);
  if (bonus.luckMultiplier) parts.push(`luck +${percentDelta(bonus.luckMultiplier)}`);
  if (bonus.pickupRadiusFlat) parts.push(`pickup +${round(bonus.pickupRadiusFlat)}`);
  if (bonus.regenFlat) parts.push(`regen +${round(bonus.regenFlat)}`);
  if (bonus.healMultiplier) parts.push(`healing +${percentDelta(bonus.healMultiplier)}`);
  if (bonus.armorFlat) parts.push(`armor +${bonus.armorFlat}`);
  if (bonus.maxHpFlat) parts.push(`max HP +${bonus.maxHpFlat}`);
  if (bonus.knockbackForceMultiplier) parts.push(`shove +${percentDelta(bonus.knockbackForceMultiplier)}`);
  if (bonus.knockbackResistFlat) parts.push(`resist +${formatPercentPoints(bonus.knockbackResistFlat)}`);
  if (bonus.contactGraceSecondsFlat) parts.push("contact grace");
  if (bonus.auraRadiusMultiplier) parts.push(`aura +${percentDelta(bonus.auraRadiusMultiplier)}`);
  if (bonus.eliteDamageMultiplier) parts.push(`elite +${percentDelta(bonus.eliteDamageMultiplier)}`);
  if (bonus.silverDamageMultiplier) parts.push(`silver +${percentDelta(bonus.silverDamageMultiplier)}`);
  if (bonus.fireDamageMultiplier) parts.push(`fire +${percentDelta(bonus.fireDamageMultiplier)}`);
  if (bonus.plagueDamageMultiplier) parts.push(`plague +${percentDelta(bonus.plagueDamageMultiplier)}`);
  if (bonus.bleedDamageMultiplier) parts.push(`bleed +${percentDelta(bonus.bleedDamageMultiplier)}`);
  return parts.join(", ") || "team effect";
}

function percentDelta(multiplier: number): string {
  return `${Math.max(1, Math.round((multiplier - 1) * 100))}%`;
}

function formatPercentPoints(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatLevel(level: number): string {
  const numerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  return numerals[level] ?? String(level);
}

function renderLevelChoices(choices: LevelChoice[]): void {
  if (!ui.levelChoiceGrid) return;
  const selectedIndex = choices.length ? clamp(state.levelChoice?.selectedIndex ?? 0, 0, choices.length - 1) : 0;
  if (state.levelChoice) state.levelChoice.selectedIndex = selectedIndex;
  ui.levelChoiceGrid.replaceChildren(...choices.map((choice, index) => {
    const visual = choiceVisual(choice);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `level-choice-card choice-${choice.kind}`;
    if (index === selectedIndex) button.classList.add("selected-choice");
    button.style.setProperty("--choice-color", choice.color ?? "#d7ff8d");
    button.setAttribute("aria-label", `Choice ${index + 1}: ${choice.title}`);
    const frame = document.createElement("span");
    frame.className = "choice-frame";
    frame.setAttribute("aria-hidden", "true");
    const icon = document.createElement("span");
    icon.className = "choice-icon";
    if (visual.icon) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = visual.icon;
      icon.append(image);
    }
    const kind = document.createElement("span");
    kind.className = "choice-kind";
    kind.textContent = visual.kind;
    frame.append(icon, kind);
    const copy = document.createElement("span");
    copy.className = "choice-copy";
    const badge = document.createElement("span");
    badge.className = "choice-badge";
    badge.textContent = choice.badge;
    const title = document.createElement("strong");
    title.textContent = choice.title;
    const subtitle = document.createElement("em");
    subtitle.textContent = choice.subtitle;
    const description = document.createElement("span");
    description.className = "choice-description";
    description.textContent = choice.description;
    const payoff = document.createElement("span");
    payoff.className = "choice-payoff";
    for (const line of choicePayoffLines(choice)) {
      const item = document.createElement("span");
      item.textContent = line;
      payoff.append(item);
    }
    copy.append(badge, title, subtitle, description, payoff);
    button.append(frame, copy);
    button.addEventListener("focus", () => selectLevelChoice(index));
    button.addEventListener("pointerenter", () => selectLevelChoice(index));
    button.addEventListener("click", () => applyLevelChoice(index));
    return button;
  }));
  updateLevelChoiceControls();
}

function choicePayoffLines(choice: LevelChoice): string[] {
  if (choice.kind === "weapon") {
    if (choice.owned) return [`Before L${Math.max(1, choice.targetLevel - 1)}`, `After L${choice.targetLevel}: ${choice.subtitle}`];
    return ["Before empty weapon slot", `After L${choice.targetLevel ?? 1}: ${choice.subtitle}`];
  }
  if (choice.kind === "passive") {
    if (choice.owned) return [`Before L${Math.max(1, choice.targetLevel - 1)}`, `After L${choice.targetLevel}: ${choice.subtitle}`];
    return ["Before empty passive slot", `After L${choice.targetLevel ?? 1}: ${choice.subtitle}`];
  }
  if (choice.kind === "evolution") return ["Before max weapon", `After: ${choice.subtitle}`];
  if (choice.kind === "heal") {
    const player = state.player;
    return player
      ? [`Before HP ${Math.ceil(player.hp)}`, `After HP ${Math.min(player.maxHp, Math.ceil(player.hp + 35))}`]
      : [choice.subtitle, choice.description];
  }
  if (choice.kind === "stat") return ["Before class baseline", `After: ${choice.description}`];
  return [];
}

function selectedLevelChoiceIndex(): number {
  const choices = state.levelChoice?.choices ?? [];
  if (!choices.length) return -1;
  return clamp(state.levelChoice?.selectedIndex ?? 0, 0, choices.length - 1);
}

function selectedLevelChoice(): LevelChoice | null {
  const index = selectedLevelChoiceIndex();
  return index >= 0 ? state.levelChoice?.choices?.[index] ?? null : null;
}

function selectLevelChoice(index: number): void {
  const levelChoice = state.levelChoice;
  const choices = levelChoice?.choices ?? [];
  if (!choices.length) {
    updateLevelChoiceControls();
    return;
  }
  if (!levelChoice) return;
  levelChoice.selectedIndex = clamp(index, 0, choices.length - 1);
  ui.levelChoiceGrid?.querySelectorAll(".level-choice-card").forEach((button, buttonIndex) => {
    button.classList.toggle("selected-choice", buttonIndex === levelChoice.selectedIndex);
  });
  updateLevelChoiceControls();
}

function setLevelChoiceActionButton(
  button: HTMLButtonElement | null | undefined,
  label: string,
  count: number,
  disabled: boolean,
  ariaLabel: string
): void {
  if (!button) return;
  const title = button.querySelector("strong");
  const counter = button.querySelector("span");
  if (title) title.textContent = label;
  if (counter) counter.textContent = String(count);
  button.disabled = disabled;
  button.setAttribute("aria-label", ariaLabel);
}

function updateLevelChoiceControls(): void {
  const hasChoices = Boolean(state.levelChoice?.choices?.length);
  const selected = selectedLevelChoice();
  const rerolls = levelChoiceCharge(state.levelChoiceRerolls);
  const banishes = levelChoiceCharge(state.levelChoiceBanishes);
  setLevelChoiceActionButton(
    ui.levelChoiceRerollButton,
    "Reroll",
    rerolls,
    !hasChoices || rerolls <= 0,
    `Reroll current level choices. ${rerolls} remaining.`
  );
  setLevelChoiceActionButton(
    ui.levelChoiceBanishButton,
    "Banish",
    banishes,
    !hasChoices || !selected || banishes <= 0,
    selected ? `Banish ${selected.title} from future drafts. ${banishes} remaining.` : `Banish selected upgrade. ${banishes} remaining.`
  );
}

function rerollLevelChoices(): void {
  if (!state.levelChoice || state.levelChoiceRerolls <= 0) return;
  const previousKeys = new Set((state.levelChoice.choices ?? []).map(levelChoiceKey));
  state.levelChoiceRerolls = levelChoiceCharge(state.levelChoiceRerolls - 1);
  state.levelChoice.choices = buildLevelUpChoices(previousKeys);
  state.levelChoice.selectedIndex = 0;
  renderLevelChoices(state.levelChoice.choices);
  setMenuFocus(0);
  toast("Choices redrawn from the cache.");
  playSynthCue("level");
}

function banishSelectedLevelChoice(): void {
  if (!state.levelChoice || state.levelChoiceBanishes <= 0) return;
  const selectedIndex = selectedLevelChoiceIndex();
  const choice = selectedLevelChoice();
  if (!choice) return;
  const targetKey = levelChoiceKey(choice);
  state.banishedLevelChoices.add(targetKey);
  state.levelChoiceBanishes = levelChoiceCharge(state.levelChoiceBanishes - 1);

  const count = levelChoiceCount();
  const currentChoices = state.levelChoice.choices ?? [];
  const kept = currentChoices.filter((candidate) => {
    const key = levelChoiceKey(candidate);
    return key !== targetKey && !state.banishedLevelChoices.has(key);
  });
  const keptKeys = new Set(kept.map(levelChoiceKey));
  const replacementKeys = new Set(currentChoices.map(levelChoiceKey));
  const replacements = buildLevelUpChoices(replacementKeys)
    .filter((candidate) => !keptKeys.has(levelChoiceKey(candidate)));
  state.levelChoice.choices = [...kept, ...replacements].slice(0, count);
  if (!state.levelChoice.choices.length) state.levelChoice.choices = buildLevelUpChoices();
  state.levelChoice.selectedIndex = state.levelChoice.choices.length
    ? clamp(selectedIndex, 0, state.levelChoice.choices.length - 1)
    : 0;
  renderLevelChoices(state.levelChoice.choices);
  setMenuFocus(state.levelChoice.selectedIndex);
  toast(`${choice.title} cut from future caches.`);
  playSynthCue("level");
}

function applyLevelChoice(index: number): void {
  const choice = state.levelChoice?.choices?.[index];
  const player = state.player;
  if (!choice || !player) return;
  if (choice.kind === "weapon") {
    if (addWeaponToLoadout(choice.id, choice.targetLevel)) state.activeWeaponId = choice.id;
  } else if (choice.kind === "passive") {
    if (state.startingPassiveIds.has(choice.id) && addPassiveToLoadout(choice.id, choice.targetLevel) && choice.effect) {
      addPassiveTeamworkEffect(choice.id, choice.effect.id);
    }
  } else if (choice.kind === "evolution") {
    state.evolvedWeapons.add(choice.id);
    state.activeWeaponId = choice.id;
  } else if (choice.kind === "stat") {
    state.statBonuses.push(choice.bonus);
  } else if (choice.kind === "heal") {
    const heal = Math.round(35 * ((state.progressionStats ?? resolveProgressionStats()).healMultiplier ?? 1));
    player.hp = Math.min(player.maxHp, player.hp + heal);
  }
  applyProgressionStats();
  state.pendingLevelChoices = Math.max(0, state.pendingLevelChoices - 1);
  toast(choice.title);
  showCenterBanner(choice.title, choice.subtitle);
  spawnPulseRing(player.x, player.z, choice.color ?? "#d7ff8d", 0.54, 1.1, 5.4);
  pulseOverlay(choice.kind === "heal" ? "gold" : "level");
  playSynthCue(choice.kind === "weapon" || choice.kind === "evolution" ? "weapon" : "level");
  closeLevelChoice();
  lastWeaponHudKey = "";
  lastPassiveHudKey = "";
  updateHud(0, true);
  if (state.pendingLevelChoices > 0) {
    openNextLevelChoice();
    return;
  }
  state.running = state.resumeAfterLevelChoice && player.hp > 0;
  if (state.running) requestRunPointerLock();
}

function renderClassPicker() {
  if (!ui.classGrid) return;
  ui.classGrid.replaceChildren(...playerClasses.map((klass) => {
    const classLevel = classLevelFor(klass.id);
    const configured = configuredLoadoutForClass(klass);
    const weapon = weaponsById.get(configured.weaponId ?? klass.starterWeapon);
    const passiveIds = configured.passiveIds ?? [];
    const passiveNames = passiveIds.map((id) => passiveItemsById.get(id)?.name).filter(Boolean);
    const nextUnlocks = classNextUnlocks(klass, classLevel);
    const nextUnlockLevel = nextUnlocks[0]?.level;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `class-card${klass.id === state.selectedClassId ? " selected" : ""}`;
    button.style.setProperty("--class-color", klass.color ?? "#d7ff8d");
    button.dataset.classId = klass.id;
    button.dataset.weaponId = configured.weaponId ?? "";
    button.dataset.passiveIds = passiveIds.join(",");
    button.setAttribute("aria-label", `${klass.name} class level ${classLevel}`);
    const header = document.createElement("span");
    header.className = "class-card-header";
    const sigil = document.createElement("span");
    sigil.className = "class-sigil";
    sigil.setAttribute("aria-hidden", "true");
    const sigilImage = document.createElement("img");
    sigilImage.alt = "";
    sigilImage.src = classSigilPath(klass);
    sigil.append(sigilImage);
    const titleBlock = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = klass.name;
    const role = document.createElement("em");
    role.textContent = klass.role;
    titleBlock.append(title, role);
    const levelBadge = document.createElement("span");
    levelBadge.className = "class-level-badge";
    levelBadge.textContent = `L${classLevel}`;
    header.append(sigil, titleBlock, levelBadge);

    const loadout = document.createElement("span");
    loadout.className = "class-loadout";
    const loadoutIcon = document.createElement("span");
    loadoutIcon.className = "class-loadout-icon";
    loadoutIcon.setAttribute("aria-hidden", "true");
    const weaponImage = document.createElement("img");
    weaponImage.alt = "";
    weaponImage.src = weaponIconPath(configured.weaponId ?? klass.starterWeapon);
    loadoutIcon.append(weaponImage);
    const loadoutCopy = document.createElement("span");
    loadoutCopy.className = "class-loadout-copy";
    const loadoutLabel = document.createElement("span");
    loadoutLabel.className = "class-loadout-label";
    loadoutLabel.textContent = "Starter";
    const loadoutName = document.createElement("span");
    loadoutName.className = "class-loadout-name";
    loadoutName.textContent = weapon?.name ?? "Starter weapon";
    loadoutCopy.append(loadoutLabel, loadoutName);
    loadout.append(loadoutIcon, loadoutCopy);

    const passiveLine = document.createElement("small");
    passiveLine.className = "class-passive-line";
    const passiveImage = document.createElement("img");
    passiveImage.alt = "";
    passiveImage.src = passiveIds[0] ? passiveIconPath(passiveIds[0]) : classPassiveDeckPath(klass);
    passiveLine.append(passiveImage, document.createTextNode(passiveNames.join(" + ") || "Open passive slots"));

    const perk = document.createElement("small");
    perk.className = "class-perk";
    perk.textContent = klass.perk ?? "";

    const tags = document.createElement("span");
    tags.className = "class-tags";
    for (const tag of (klass.passiveBias ?? []).slice(0, 3)) {
      const chip = document.createElement("span");
      chip.className = "bias-chip";
      chip.textContent = tag;
      tags.append(chip);
    }
    const nextUnlock = document.createElement("span");
    nextUnlock.className = "class-next-unlock";
    if (nextUnlocks.length) {
      const lock = document.createElement("span");
      lock.className = "lock-icon";
      lock.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.textContent = `L${nextUnlockLevel} ${nextUnlocks.map((unlock) => displayNameForUnlock(unlock.id)).join(" + ")}`;
      nextUnlock.append(lock, copy);
    } else {
      const copy = document.createElement("span");
      copy.textContent = "All unlocks ready";
      nextUnlock.append(copy);
    }
    button.append(header, loadout, passiveLine, perk, tags, nextUnlock);
    button.title = klass.perk ?? "";
    button.addEventListener("click", () => selectPlayerClass(klass.id));
    return button;
  }));
  renderLoadoutConfig();
}

function renderLoadoutConfig() {
  const klass = selectedClass();
  if (!klass) return;
  const level = selectedClassLevel();
  const maxUnlockLevel = classMaxUnlockLevel(klass);
  const loadout = configuredLoadoutForClass(klass);
  const weapon = loadout.weaponId ? weaponsById.get(loadout.weaponId) : undefined;
  const passiveNames = (loadout.passiveIds ?? []).map((id) => passiveItemsById.get(id)?.name).filter(Boolean);
  const color = klass.color ?? "#d7ff8d";
  for (const element of [ui.loadoutPanel, ui.classProgressText, ui.loadoutSummary, ui.classProgressFill, ui.loadoutWeaponStatus, ui.loadoutPassiveStatus]) {
    element?.style?.setProperty("--class-color", color);
  }
  ui.classProgressFill?.style?.setProperty("transform", `scaleX(${clamp01(level / Math.max(1, maxUnlockLevel))})`);
  if (ui.classProgressText) ui.classProgressText.textContent = `${klass.name} L${level}`;
  if (ui.loadoutSummary) ui.loadoutSummary.textContent = `${weapon?.name ?? "Weapon"} + ${passiveNames.join(" + ") || "Passives"}`;
  ui.loadoutPanel?.classList.toggle("hidden", !state.loadoutPanelOpen);
  ui.loadoutConfigButton?.classList.toggle("active", state.loadoutPanelOpen);
  ui.loadoutConfigButton?.setAttribute("aria-expanded", state.loadoutPanelOpen ? "true" : "false");

  const weaponUnlocks = classWeaponUnlocks(klass);
  const passiveUnlocks = classPassiveUnlocks(klass);
  if (ui.loadoutWeaponStatus) ui.loadoutWeaponStatus.textContent = `${weaponUnlocks.filter((unlock) => unlock.level <= level).length}/${weaponUnlocks.length}`;
  if (ui.loadoutPassiveStatus) ui.loadoutPassiveStatus.textContent = `${(loadout.passiveIds ?? []).length}/${MAX_LOADOUT_PASSIVES}`;
  renderLoadoutOptionGrid(ui.loadoutWeaponGrid, weaponUnlocks, loadout.weaponId, "weapon", klass, level);
  renderLoadoutOptionGrid(ui.loadoutPassiveGrid, passiveUnlocks, loadout.passiveIds ?? [], "passive", klass, level);
}

function renderLoadoutOptionGrid(
  grid: HTMLElement | null | undefined,
  unlocks: ClassUnlock[],
  selectedId: string | string[] | undefined,
  kind: ClassUnlockKind,
  klass: PlayerClassDefinition,
  level: number
): void {
  if (!grid) return;
  grid.replaceChildren(...unlocks.map((unlock) => {
    const unlocked = unlock.level <= level;
    const selected = Array.isArray(selectedId) ? selectedId.includes(unlock.id) : selectedId === unlock.id;
    const name = displayNameForUnlock(unlock.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `loadout-option ${unlocked ? "is-unlocked" : "is-locked"}${selected ? " is-selected" : ""}`;
    button.dataset.loadoutKind = kind;
    button.dataset.loadoutId = unlock.id;
    button.dataset.locked = unlocked ? "false" : "true";
    button.dataset.requiredLevel = String(unlock.level);
    button.style.setProperty("--class-color", klass.color ?? "#d7ff8d");
    button.setAttribute("aria-disabled", unlocked ? "false" : "true");
    button.setAttribute("aria-label", unlocked ? `${name} unlocked` : `${name} locked until class level ${unlock.level}`);
    button.title = unlocked ? `${name} L${unlock.level}` : `Locked until class level ${unlock.level}`;

    const icon = document.createElement("span");
    icon.className = "loadout-option-icon";
    const image = document.createElement("img");
    image.alt = "";
    image.src = kind === "weapon" ? weaponIconPath(unlock.id) : passiveIconPath(unlock.id);
    icon.append(image);

    const title = document.createElement("strong");
    title.textContent = name;
    const badge = document.createElement("span");
    badge.textContent = unlocked ? (selected ? "Equipped" : `L${unlock.level}`) : `L${unlock.level}`;
    button.append(icon, title, badge);
    if (!unlocked) {
      const lock = document.createElement("span");
      lock.className = "loadout-lock";
      lock.setAttribute("aria-hidden", "true");
      const glyph = document.createElement("span");
      glyph.className = "lock-icon";
      lock.append(glyph);
      button.append(lock);
    }
    button.addEventListener("click", () => setConfiguredLoadout(kind, unlock.id));
    return button;
  }));
}

function toggleLoadoutPanel(): void {
  state.loadoutPanelOpen = !state.loadoutPanelOpen;
  renderLoadoutConfig();
  if (state.loadoutPanelOpen && !focusSelectedLoadoutOption("weapon")) focusPauseElement(ui.loadoutConfigButton);
  else if (!state.loadoutPanelOpen) focusPauseElement(ui.loadoutConfigButton);
}

function focusLoadoutOption(kind: ClassUnlockKind, id: string): boolean {
  const element = document.querySelector<HTMLElement>(`.loadout-option[data-loadout-kind="${kind}"][data-loadout-id="${id}"]`);
  if (!element) return false;
  focusPauseElement(element);
  return true;
}

function focusSelectedLoadoutOption(kind: ClassUnlockKind): boolean {
  const klass = selectedClass();
  const loadout = configuredLoadoutForClass(klass);
  const id = kind === "weapon" ? loadout.weaponId : loadout.passiveIds?.[0];
  return id ? focusLoadoutOption(kind, id) : false;
}

function selectPlayerClass(id: string): void {
  if (!playerClassesById.has(id)) return;
  state.selectedClassId = id;
  renderClassPicker();
  renderLoadoutConfig();
  updateHud(0, true);
  if (!state.running) toast(`${selectedClass()?.name ?? "Class"} ready`);
}

async function init(): Promise<void> {
  bootLoader.add({
    id: "scene",
    label: "Lighting graveyard",
    weight: 0.55,
    load: (context) => withBootTaskContext(context, async () => {
      setupScene();
      reportBootProgress(1, "Scene ready");
    })
  });
  bootLoader.add({
    id: "textures",
    label: "Loading character textures",
    weight: 2,
    load: (context) => withBootTaskContext(context, setupTextures)
  });
  bootLoader.add({
    id: "actors",
    label: "Loading actor animation",
    weight: 1.6,
    load: (context) => withBootTaskContext(context, setupActorAssets)
  });
  bootLoader.add({
    id: "arena",
    label: "Building arena",
    weight: 1,
    load: (context) => withBootTaskContext(context, async () => {
      reportBootProgress(0.12, "Spawning hunter");
      setupPlayer();
      reportBootProgress(0.34, "Building arena");
      setupArena();
      reportBootProgress(0.62, "Binding controls");
      setupInput();
      setupMenu();
      setupMinimap();
      reportBootProgress(1, "Arena ready");
    })
  });
  await bootLoader.load(["scene", "textures", "actors", "arena"]);
  loadOptionalModels();
  loadNetworkModule();
  arenaFrameDriver.reset(performance.now());
  renderer.setAnimationLoop(tick);
  bootSnapshot = {
    ...bootSnapshot,
    status: "loaded",
    label: "Arena ready",
    activeLabel: "Arena ready",
    actualProgress: 1,
    visibleProgress: 1,
    updatedAt: performance.now()
  };
  bootSmoother.set(1);
  bootUi.render(bootSnapshot);
  bootLoop.stop();
  bootUi.hide();
}

async function withBootTaskContext<T>(
  context: AssetLoadTaskContext,
  work: (context: AssetLoadTaskContext) => T | Promise<T>
): Promise<T> {
  const previous = bootTaskContext;
  bootTaskContext = context;
  try {
    return await work(context);
  } finally {
    bootTaskContext = previous;
  }
}

function reportBootProgress(progress: number, label?: string): void {
  bootTaskContext?.reportProgress(progress, label);
}

function bootErrorLabel(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Asset setup failed";
}

function setupScene(): void {
  scene = requireRuntimeInstance(threeView.scene, THREE.Scene, "Three scene");
  scene.background = new THREE.Color(0x07100f);
  scene.fog = new THREE.FogExp2(0x08110f, 0.0095);
  const skyboxTexture = new THREE.TextureLoader().load(texturePaths.skybox);
  if ("colorSpace" in skyboxTexture && "SRGBColorSpace" in THREE) skyboxTexture.colorSpace = THREE.SRGBColorSpace;
  scene.add(requireRuntimeInstance(createThreeSkybox3D(threeView.THREE, { texture: skyboxTexture, radius: 1000, segments: 64 }), THREE.Object3D, "Skybox"));
  camera = requireRuntimeInstance(threeView.camera, THREE.PerspectiveCamera, "Three camera");
  camera.fov = 54;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.near = 0.1;
  camera.far = 1400;
  camera.updateProjectionMatrix();
  resetCameraState(0, CAMERA_DEFAULT_PITCH, CAMERA_BASE_DISTANCE);
  cameraRig = createCameraRig(camera, {
    offset: resolveCameraOffset(),
    lookAtOffset: tempVec.set(0, CAMERA_LOOK_AT_HEIGHT, 0),
    influence: 1 / CAMERA_FOLLOW_SMOOTHING_SECONDS,
    worldSize: tempCameraWorldSize.set(data.arena.worldSize, data.arena.worldSize)
  });
  cameraRig.setTarget(tempCameraTarget.set(0, CAMERA_TARGET_HEIGHT, 0)).update(0);
  cameraRigSnapshot = readCameraRigSnapshot();
  renderer = requireRuntimeInstance(threeView.renderer, THREE.WebGLRenderer, "Three renderer");
  if (ui.hud) {
    floatingTextLayer = createThreeWorldTextOverlay3D({
      THREE: threeView.THREE,
      camera: () => camera,
      container: ui.hud,
      viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      className: "float-text",
      baseFontPx: 15,
      lifeSeconds: FLOAT_TEXT_LIFE_SECONDS,
      referenceDistance: CAMERA_BASE_DISTANCE,
      minDistanceScale: 0.42,
      maxDistanceScale: 1.34,
      rise: 2.1,
      screenRisePx: 28,
      growScale: 0.18,
      resolvePosition: (position) => {
        const projected = renderPosition(position[0], position[2]);
        return [projected.x, position[1], projected.z] as [number, number, number];
      }
    });
  }
  if ("toneMapping" in renderer && "ACESFilmicToneMapping" in THREE) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if ("toneMappingExposure" in renderer) renderer.toneMappingExposure = 1.32;
  threeView.resize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ambient = new THREE.HemisphereLight(0xc8ddcf, 0x17251f, 1.78);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0xd8ecff, 5.1);
  moon.position.set(-22, 38, 21);
  moon.castShadow = true;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 180;
  moon.shadow.camera.left = -82;
  moon.shadow.camera.right = 82;
  moon.shadow.camera.top = 82;
  moon.shadow.camera.bottom = -82;
  scene.add(moon);
  const rim = new THREE.PointLight(0x9ee6ff, 3.1, 82);
  rim.position.set(18, 10, -17);
  scene.add(rim);
  const sun = new THREE.DirectionalLight(0xffb16b, 1.75);
  sun.position.set(30, 20, -28);
  scene.add(sun);
  const cryptFill = new THREE.PointLight(0x8f7dff, 1.45, 98, 2);
  cryptFill.position.set(-28, 7, 26);
  scene.add(cryptFill);
  const muzzle = new THREE.PointLight(0xffd07a, 0, 18, 2);
  muzzle.position.set(0, 1.7, 0);
  scene.add(muzzle);
  const playerGlow = new THREE.PointLight(0xd7ff8d, 2.1, 24, 2);
  playerGlow.position.set(0, 2.2, 0);
  scene.add(playerGlow);
  const pickupLights: Three.PointLight[] = [];
  for (let i = 0; i < PICKUP_LIGHT_POOL_SIZE; i += 1) {
    const light = new THREE.PointLight(0xbaff73, 0, 12, 2);
    light.position.set(0, 1.2, 0);
    scene.add(light);
    pickupLights.push(light);
  }
  state.lights = { ambient, moon, rim, sun, cryptFill, muzzle, playerGlow, pickupLights };
  setupVisualIndicators();
  window.addEventListener("resize", onResize);
}

function setupVisualIndicators(): void {
  const root = new THREE.Group();
  root.name = "combat-visual-indicators";
  root.frustumCulled = false;
  const playerRing = createGroundRing("#d7ff8d", 0.58, 1.15, 0.028);
  const targetLock = createTargetLockVisual();
  const aimCursor = createGroundRing("#e9ffbf", 0.72, 0.72, 0.024);
  const aimCone = createAimConeVisual();
  const magnetRing = createGroundRing("#9fe8ff", 0.52, PICKUP_COLLECT_RADIUS, 0.02);
  const offscreenArrows = Array.from({ length: COMBAT_VISUALS.maxOffscreenArrows }, () => createOffscreenArrowVisual());
  const cooldownRings = Array.from({ length: 6 }, (_, index) => createGroundRing(index % 2 ? "#7bd6ff" : "#ffd782", 0.5, 1, 0.016));
  const allyRings = new Map<string, IndicatorMesh>();
  root.add(playerRing, targetLock, aimCursor, aimCone, magnetRing, ...offscreenArrows, ...cooldownRings);
  scene.add(root);
  state.visualIndicators = { root, playerRing, allyRings, targetLock, aimCursor, aimCone, magnetRing, offscreenArrows, cooldownRings, lockedEnemy: null };
}

function resetVisualIndicators(): void {
  const indicators = state.visualIndicators;
  if (!indicators) return;
  indicators.lockedEnemy = null;
  indicators.targetLock.visible = false;
  indicators.magnetRing.visible = false;
  for (const arrow of indicators.offscreenArrows) arrow.visible = false;
  for (const ring of indicators.cooldownRings) ring.visible = false;
  clearAllyRings();
}

function clearAllyRings(): void {
  const indicators = state.visualIndicators;
  if (!indicators) return;
  for (const ring of indicators.allyRings.values()) indicators.root.remove(ring);
  indicators.allyRings.clear();
}

function updateVisualIndicators(dt: number): void {
  const indicators = state.visualIndicators;
  const player = state.player;
  if (!indicators || !player) return;
  const playerPosition = renderPosition(player.x, player.z);
  const playerGroundY = actorGroundHeight(player);
  const pulse = 1 + Math.sin(state.time * 5.2) * 0.035;
  indicators.playerRing.visible = true;
  indicators.playerRing.position.set(playerPosition.x, playerGroundY + 0.105, playerPosition.z);
  indicators.playerRing.scale.setScalar(Math.max(0.82, player.radius) * pulse);
  updateAllyRadiusRings(indicators, dt);
  updateAimVisuals(indicators, player);
  updateTargetLockVisual(indicators, player);
  updateCooldownRings(indicators, player);
  updateMagnetFieldRing(indicators, player);
  updateOffscreenEnemyArrows(indicators, player);
}

function updateAllyRadiusRings(indicators: VisualIndicators, dt: number): void {
  for (const ring of indicators.allyRings.values()) ring.visible = false;
  for (const [id, remote] of remotePlayers) {
    let ring = indicators.allyRings.get(id);
    if (!ring) {
      ring = createGroundRing("#7bd6ff", 0.48, 1.05, 0.022);
      indicators.allyRings.set(id, ring);
      indicators.root.add(ring);
    }
    ring.visible = true;
    ring.position.set(remote.mesh.position.x, (remote.mesh.position.y ?? 0) + 0.11, remote.mesh.position.z);
    ring.scale.setScalar(1 + Math.sin(state.time * 4.8 + dt) * 0.025);
  }
}

function updateAimVisuals(indicators: VisualIndicators, player: Player): void {
  const aim = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const aimPosition = renderPosition(pointer.worldX, pointer.worldZ);
  const playerGroundY = actorGroundHeight(player);
  indicators.aimCursor.visible = true;
  indicators.aimCursor.position.set(aimPosition.x, terrainHeightAt(pointer.worldX, pointer.worldZ) + 0.13, aimPosition.z);
  indicators.aimCursor.scale.setScalar(0.72 + Math.sin(state.time * 8) * 0.04);
  const playerPosition = renderPosition(player.x, player.z);
  indicators.aimCone.visible = true;
  indicators.aimCone.position.set(playerPosition.x, playerGroundY + 0.095, playerPosition.z);
  indicators.aimCone.rotation.z = -aim;
  indicators.aimCone.material.opacity = 0.16 + Math.sin(state.time * 7.5) * 0.035;
}

function updateTargetLockVisual(indicators: VisualIndicators, player: Player): void {
  const target = nearestEnemy(player.x, player.z, COMBAT_VISUALS.targetLockRange);
  indicators.lockedEnemy = target;
  if (!target) {
    indicators.targetLock.visible = false;
    return;
  }
  const position = renderPosition(target.x, target.z);
  indicators.targetLock.visible = true;
  indicators.targetLock.position.set(position.x, actorGroundHeight(target) + 0.2, position.z);
  indicators.targetLock.rotation.y = state.time * 2.8;
  indicators.targetLock.scale.setScalar(Math.max(1.05, target.radius * 1.35) * (1 + Math.sin(state.time * 9) * 0.045));
}

function updateCooldownRings(indicators: VisualIndicators, player: Player): void {
  const playerPosition = renderPosition(player.x, player.z);
  const playerGroundY = actorGroundHeight(player);
  indicators.cooldownRings.forEach((ring, index) => {
    const weaponId = state.weaponSlots[index];
    if (!weaponId) {
      ring.visible = false;
      return;
    }
    const weapon = getWeaponRuntime(weaponId);
    if (!weapon) {
      ring.visible = false;
      return;
    }
    const remaining = Math.max(0, state.weaponCooldowns.get(weaponId) ?? 0);
    const progress = remaining <= 0.001 ? 1 : 1 - clamp01(remaining / Math.max(0.001, weapon.cooldown));
    ring.visible = true;
    ring.position.set(playerPosition.x, playerGroundY + 0.12 + index * 0.003, playerPosition.z);
    ring.scale.setScalar((PLAYER_RADIUS + 0.64 + index * 0.18) * (0.22 + progress * 0.78));
    ring.material.color.set(weapon.color ?? "#d7ff8d");
    ring.material.opacity = progress >= 1 ? 0.58 + Math.sin(state.time * 10 + index) * 0.16 : 0.18 + progress * 0.24;
  });
}

function updateMagnetFieldRing(indicators: VisualIndicators, player: Player): void {
  const remaining = Math.max(0, (state.magnetPullUntil ?? 0) - state.time);
  if (remaining <= 0) {
    indicators.magnetRing.visible = false;
    return;
  }
  const playerPosition = renderPosition(player.x, player.z);
  indicators.magnetRing.visible = true;
  indicators.magnetRing.position.set(playerPosition.x, actorGroundHeight(player) + 0.1, playerPosition.z);
  indicators.magnetRing.scale.setScalar((getPickupCollectRadius() / PICKUP_COLLECT_RADIUS) * (1 + Math.sin(state.time * 7) * 0.018));
  indicators.magnetRing.material.opacity = 0.18 + clamp01(remaining / MAGNET_PICKUP_SECONDS) * 0.38;
}

function updateOffscreenEnemyArrows(indicators: VisualIndicators, player: Player): void {
  let used = 0;
  for (const enemy of state.enemies) {
    if (used >= indicators.offscreenArrows.length) break;
    const { dx, dz } = worldDelta(player.x, player.z, enemy.x, enemy.z);
    const distance = Math.hypot(dx, dz);
    if (distance < COMBAT_VISUALS.offscreenArrowRange) continue;
    const angle = Math.atan2(dz, dx);
    const arrow = indicators.offscreenArrows[used];
    if (!arrow) break;
    const markerDistance = CAMERA_VIEW_RADIUS * 0.72;
    const position = renderPosition(player.x + Math.cos(angle) * markerDistance, player.z + Math.sin(angle) * markerDistance);
    arrow.visible = true;
    arrow.position.set(position.x, actorGroundHeight(player) + 0.18, position.z);
    arrow.rotation.z = -angle;
    arrow.scale.setScalar(enemy.boss ? 1.55 : 1);
    arrow.material.opacity = enemy.boss ? 0.78 : 0.42;
    used += 1;
  }
  for (; used < indicators.offscreenArrows.length; used += 1) {
    const arrow = indicators.offscreenArrows[used];
    if (arrow) arrow.visible = false;
  }
}

function createGroundRing(colorValue: Three.ColorRepresentation, opacity: number, radius: number, tube = 0.024): IndicatorMesh {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 64), createIndicatorMaterial(colorValue, opacity));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.frustumCulled = false;
  return ring;
}

function createTargetLockVisual(): Three.Group {
  const group = new THREE.Group();
  const outer = createGroundRing("#ffd782", 0.74, 1.2, 0.025);
  const inner = createGroundRing("#fff5c8", 0.38, 0.56, 0.018);
  group.add(outer, inner);
  for (let i = 0; i < 4; i += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.07), createIndicatorMaterial("#ffd782", 0.86));
    tick.position.set(Math.cos(i * Math.PI * 0.5) * 1.32, 0.01, Math.sin(i * Math.PI * 0.5) * 1.32);
    tick.rotation.y = -i * Math.PI * 0.5;
    group.add(tick);
  }
  group.visible = false;
  return group;
}

function createAimConeVisual(): IndicatorMesh {
  const half = COMBAT_VISUALS.aimConeHalfAngle;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(-half) * COMBAT_VISUALS.aimConeLength, Math.sin(-half) * COMBAT_VISUALS.aimConeLength);
  shape.absarc(0, 0, COMBAT_VISUALS.aimConeLength, -half, half, false);
  shape.lineTo(0, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), createIndicatorMaterial("#7bd6ff", 0.16));
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

function createOffscreenArrowVisual(): IndicatorMesh {
  const shape = new THREE.Shape();
  shape.moveTo(1.1, 0);
  shape.lineTo(-0.52, -0.5);
  shape.lineTo(-0.22, 0);
  shape.lineTo(-0.52, 0.5);
  shape.lineTo(1.1, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), createIndicatorMaterial("#ffcf6d", 0.5));
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

function createIndicatorMaterial(colorValue: Three.ColorRepresentation, opacity: number): Three.MeshBasicMaterial {
  telemetry.materialCreates += 1;
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorValue),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  material.userData = { opacityBase: opacity };
  return material;
}

async function setupTextures(): Promise<void> {
  const loader = new THREE.TextureLoader();
  state.textures.survivor = await loadFirstTexture(loader, texturePaths.survivor, solidTexture("#7aa56e"), "Survivor skin", 0.04, 0.16);
  state.textures.ally = await loadFirstTexture(loader, texturePaths.ally, solidTexture("#6fa0c8"), "Ally skin", 0.16, 0.28);
  state.textures.zombieA = await loadFirstTexture(loader, texturePaths.zombieA, solidTexture("#74a867"), "Shambler skin", 0.28, 0.4);
  state.textures.zombieB = await loadFirstTexture(loader, texturePaths.zombieB, solidTexture("#6ea79f"), "Runner skin", 0.4, 0.52);
  state.textures.brute = await loadFirstTexture(loader, texturePaths.brute, solidTexture("#a57d52"), "Brute skin", 0.52, 0.64);
  state.textures.shade = await loadFirstTexture(loader, texturePaths.shade, solidTexture("#8b78b9"), "Shade skin", 0.64, 0.76);
  state.textures.shard = createPickupSpriteTexture("xp");
  state.textures.heal = createPickupSpriteTexture("heal");
  state.textures.magnet = createPickupSpriteTexture("magnet");
  state.textures.crate = createPickupSpriteTexture("weapon");
  reportBootProgress(0.8, "Pickup textures");
  state.textures.ruin = await loadFirstTexture(loader, ["assets/usable/scenery/ruin-low-poly/texture/Texture_MAp_ruins.png"], solidTexture("#6d6a5d"), "Ruin texture", 0.8, 0.9);
  state.textures.treasure = await loadFirstTexture(loader, ["assets/usable/collectibles/treasure-low-poly/texture/Texture_MAp_treasure.png"], solidTexture("#ffd36d"), "Treasure texture", 0.9, 1);
}

async function setupActorAssets(): Promise<void> {
  try {
    reportBootProgress(0.05, "Preparing Three addons");
    const { FBXLoader, GLTFLoader, skeletonUtils } = runtimeThreeModules;
    fbxLoader = fbxLoader ?? new FBXLoader();
    const animationGltfLoader = new GLTFLoader();
    gltfLoader = gltfLoader ?? animationGltfLoader;
    const textureLoader = new THREE.TextureLoader();
    reportBootProgress(0.18, "Loading actor rig");
    const [baseModel, idleFbx, runFbx, jumpFbx, rigSidecar] = await Promise.all([
      loadFbx(fbxLoader, animatedCharacterPaths.model),
      loadFbx(fbxLoader, animatedCharacterPaths.animations.idle),
      loadFbx(fbxLoader, animatedCharacterPaths.animations.run),
      loadFbx(fbxLoader, animatedCharacterPaths.animations.jump),
      fetch(animatedCharacterPaths.rig).then(async (response) => {
        if (!response.ok) throw new Error(`Character rig sidecar failed with HTTP ${response.status}`);
        return response.text();
      })
    ]);
    const kenneyClips = [
      renameClip(selectSourceAnimationClip(idleFbx, "idle"), "idle"),
      renameClip(selectSourceAnimationClip(runFbx, "run"), "run"),
      renameClip(selectSourceAnimationClip(jumpFbx, "jump"), "jump")
    ]
      .filter((clip): clip is Three.AnimationClip => clip !== null)
      .map((clip) => markClipSource(clip, "kenney"));
    reportBootProgress(0.48, "Binding universal clips");
    const universal = await loadRetargetedUniversalAnimations(animationGltfLoader, skeletonUtils, baseModel);
    reportBootProgress(0.68, "Loading actor skins");
    const skins: Record<string, Three.Texture> = {};
    const skinEntries = Object.entries(animatedCharacterPaths.skins);
    for (const [index, [key, path]] of skinEntries.entries()) {
      const start = 0.68 + index / Math.max(1, skinEntries.length) * 0.28;
      const end = 0.68 + (index + 1) / Math.max(1, skinEntries.length) * 0.28;
      skins[key] = await loadFirstTexture(textureLoader, [path], solidTexture("#88aa66"), `${key} skin`, start, end);
    }
    const clips = [...kenneyClips, ...universal.clips];
    const clipSources = new Map(clips.map((clip): [string, string] => {
      const source = clip.userData.animationSource;
      return [clip.name, typeof source === "string" ? source : "unknown"];
    }));
    state.actorAssets = {
      baseModel,
      clips,
      skins,
      clone: skeletonUtils.clone,
      universalClipNames: universal.names,
      retargetedUniversalClipNames: universal.clips.map((clip) => clip.name),
      retargetFailures: universal.failures,
      clipSources,
      rigSidecar
    };
    reportBootProgress(1, "Actor animation ready");
  } catch (error) {
    console.warn("Animated actor assets unavailable; using billboards.", error);
    state.actorAssets = null;
    reportBootProgress(1, "Billboard fallback ready");
  }
}

function loadFbx(loader: FBXLoader, path: string): Promise<Three.Group> {
  return loadThreeLoaderAsset(loader, path);
}

function renameClip(clip: Three.AnimationClip | null, name: string): Three.AnimationClip | null {
  if (!clip) return null;
  clip.name = name;
  return clip;
}

function selectSourceAnimationClip(asset: Three.Object3D, preferredName: string): Three.AnimationClip | null {
  const clips = asset?.animations ?? [];
  const requested = normalizeSourceClipName(preferredName);
  return clips.find((clip) => normalizeSourceClipName(clip.name) === requested)
    ?? clips.find((clip) => normalizeSourceClipName(clip.name).includes(requested) && !isSourcePoseClip(clip))
    ?? clips.find((clip) => !isSourcePoseClip(clip) && (clip.duration ?? 0) > 0.1)
    ?? clips[0]
    ?? null;
}

function normalizeSourceClipName(name = ""): string {
  return (String(name).split("|").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSourcePoseClip(clip: Three.AnimationClip | null | undefined): boolean {
  return /targeting|pose/i.test(clip?.name ?? "") || (clip?.duration ?? 0) <= 0.05;
}

function markClipSource(
  clip: Three.AnimationClip | null,
  source: string,
  extra: Record<string, unknown> = {}
): ArenaAnimationClip {
  if (!clip) throw new Error(`Cannot mark a missing ${source} animation clip.`);
  const userData = "userData" in clip && isRecord(clip.userData) ? clip.userData : {};
  Object.assign(clip, { userData: { ...userData, ...extra, animationSource: source } });
  if (!hasArenaAnimationMetadata(clip)) throw new Error("Animation clip metadata was not attached.");
  return clip;
}

async function loadRetargetedUniversalAnimations(
  loader: GLTFLoader,
  skeletonUtils: SkeletonUtilsModule,
  baseModel: Three.Object3D
): Promise<{ names: string[]; failures: string[]; clips: ArenaAnimationClip[] }> {
  const names: string[] = [];
  const failures: string[] = [];
  const clips: ArenaAnimationClip[] = [];
  if (!skeletonUtils.retargetClip) return { names, failures: ["retargetClip unavailable"], clips };
  const targetRoot = skeletonUtils.clone(baseModel);
  const targetMesh = findSkinnedMesh(targetRoot);
  if (!targetMesh?.skeleton) return { names, failures: ["Kenney target skeleton unavailable"], clips };
  for (const path of universalAnimationPaths) {
    try {
      const gltf = await loadThreeLoaderAsset(loader, path);
      const sourceMesh = findSkinnedMesh(gltf.scene);
      if (!sourceMesh?.skeleton) {
        failures.push(`${path}: source skeleton unavailable`);
        continue;
      }
      for (const sourceClip of gltf.animations ?? []) {
        if (sourceClip?.name) names.push(sourceClip.name);
        const mappedAliases = UNIVERSAL_ANIMATION_CLIP_ALIASES[sourceClip.name];
        const aliases = (Array.isArray(mappedAliases) ? mappedAliases : [mappedAliases])
          .filter((alias): alias is string => typeof alias === "string");
        for (const alias of aliases) {
          if (clips.some((clip) => clip.name === alias)) continue;
          try {
            const retargeted = skeletonUtils.retargetClip(targetMesh, sourceMesh, sourceClip, {
              names: KENNEY_TO_UNIVERSAL_BONE_NAMES,
              hip: "pelvis",
              fps: UNIVERSAL_ANIMATION_RETARGET_FPS,
              preserveMatrix: true,
              preservePosition: true,
              preserveHipPosition: false,
              useFirstFramePosition: true
            });
            retargeted.name = alias;
            rewriteRetargetedClipTracks(retargeted);
            clips.push(markClipSource(retargeted, "universal", { sourceName: sourceClip.name, sourcePath: path }));
            targetMesh.skeleton.pose?.();
            targetRoot.updateMatrixWorld?.(true);
          } catch (error) {
            failures.push(`${sourceClip.name} -> ${alias}: ${bootErrorLabel(error)}`);
          }
        }
      }
    } catch (error) {
      failures.push(`${path}: ${bootErrorLabel(error)}`);
    }
  }
  return { names, failures, clips };
}

function findSkinnedMesh(root: Three.Object3D | null | undefined): Three.SkinnedMesh | null {
  let skinned: Three.SkinnedMesh | null = null;
  root?.traverse?.((child) => {
    if (!skinned && child instanceof THREE.SkinnedMesh && child.skeleton) skinned = child;
  });
  return skinned;
}

function rewriteRetargetedClipTracks(clip: Three.AnimationClip): Three.AnimationClip {
  for (const track of clip.tracks ?? []) {
    track.name = track.name.replace(/^\.bones\[([^\]]+)\]\./, "$1.");
  }
  return clip;
}

function setupPlayer(): void {
  const actor = createActorVisual("survivor", state.textures.survivor, 2.7, PLAYER_HEIGHT_WORLD, PLAYER_MODEL_SCALE);
  const rigRoot = actor.mesh;
  const playerRoot = new THREE.Group() as RenderableObject;
  playerRoot.name = "ThreeArenaPlayerMotionRoot";
  playerRoot.add(rigRoot);
  const start = getWorldCenter();
  const player: Player = {
    id: state.playerId,
    name: ui.playerName.value.trim() || "Hunter",
    x: start.x,
    z: start.z,
    hp: data.player.startHealth ?? 100,
    maxHp: data.player.startHealth ?? 100,
    regenPerSecond: data.player.healthRegenPerSecond,
    speed: data.player.moveSpeed ?? 10.8,
    armor: 0,
    knockbackResist: 0,
    radius: PLAYER_RADIUS,
    jumpY: 0,
    jumpVelocityY: 0,
    jumpsUsed: 0,
    grounded: true,
    jumpTrailClock: 0,
    floatAssistUntil: 0,
    wallRunClock: 0,
    terrainSlope: 0,
    terrainBlocked: false,
    moveMomentumX: 0,
    moveMomentumZ: 0,
    momentumDustClock: 0,
    animationState: "idle",
    facingAngle: 0,
    knockX: 0,
    knockZ: 0,
    invuln: 0,
    mesh: playerRoot,
    animator: actor.animator,
    animatorRoot: actor.animatorRoot,
    animated: actor.animated,
    proceduralPose: actor.proceduralPose,
    proceduralMode: actor.proceduralMode,
    handAnchor: findActorHandAnchor(playerRoot),
    activeAnimation: actor.activeAnimation,
    activeAnimationSource: actor.activeAnimationSource,
    overlayAnimation: null,
    animationClock: actor.animationClock,
    animLock: 0,
    engineMotion: null,
    engineMotionLastX: start.x,
    engineMotionLastY: terrainHeightAt(start.x, start.z),
    engineMotionLastZ: start.z,
    engineMotionAimHeight: PLAYER_HEIGHT_WORLD,
    engineMotionLandSource: null,
    engineMotionRecoilSource: null
  };
  state.player = player;
  setActorPosition(player, start.x, start.z);
  const skeleton = findSkinnedMesh(rigRoot)?.skeleton ?? null;
  if (skeleton && state.actorAssets?.rigSidecar) {
    try {
      actor.animator?.stop();
      // The Kenney FBX is already in its imported bind pose. Skeleton.pose()
      // reconstructs its control-root transform from inverse binds and expands
      // this particular FBX hierarchy by 100x before semantic compilation.
      rigRoot.updateMatrixWorld(true);
      player.engineMotion = createThreeArenaPlayerMotion({
        rigRoot,
        motionRoot: playerRoot,
        skeleton,
        t3rig: state.actorAssets.rigSidecar,
        initialPosition: [start.x, player.engineMotionLastY, start.z],
        initialFacing: [0, 0, 1],
        initialGrounded: true,
        maxSpeed: Math.max(24, player.speed * 2),
        // The motor ceiling includes dash/knockback bursts; normal movement
        // should still reach a fully expressed run rather than a half blend.
        fullStrideSpeed: Math.max(1, player.speed * 0.82),
        discontinuityDistance: WORLD_HALF_SIZE,
        heightField: {
          heightAt(x, z) {
            return terrainHeightAt(wrapWorld(x), wrapWorld(z));
          },
          normalAt(x, z) {
            const gradient = terrainGradientAt(wrapWorld(x), wrapWorld(z));
            return { x: -gradient.x, y: 1, z: -gradient.z };
          }
        }
      });
      const semanticHead = player.engineMotion.controller.document.semantics.head;
      if (semanticHead) {
        player.engineMotionAimHeight = player.engineMotion.controller.binding.world.translations[semanticHead.boneIndex * 3 + 1]
          - player.engineMotion.controller.motor.state.position.y;
      }
      player.animator = null;
      player.proceduralPose = null;
      player.proceduralMode = "semantic";
      player.activeAnimation = "idle";
      player.activeAnimationSource = "engine-motion";
    } catch (error) {
      console.warn("Semantic player motion unavailable; retaining the legacy presentation fallback.", error);
      actor.animator?.play("idle", { fadeSeconds: 0 });
    }
  }
  scene.add(player.mesh);
}

function createActorVisual(
  skinKey: string,
  fallbackTexture: Three.Texture,
  width: number,
  height: number,
  scale: number,
  options: { allowAnimated?: boolean; castShadow?: boolean; receiveShadow?: boolean } = {}
): ActorVisual {
  const actorAssets = state.actorAssets;
  if (options.allowAnimated !== false && actorAssets?.baseModel && actorAssets.clone) {
    const mesh = actorAssets.clone(actorAssets.baseModel);
    mesh.scale.setScalar(scale);
    prepareThreeObject3D(mesh, {
      castShadow: options.castShadow ?? true,
      receiveShadow: options.receiveShadow ?? true,
      material: () => {
        const map = actorAssets.skins[skinKey] ?? fallbackTexture;
        return new THREE.MeshStandardMaterial({
          map,
          roughness: 0.72,
          metalness: 0.02
        });
      }
    });
    const animatorRoot = mesh;
    const animator = threeView.createAnimationController(animatorRoot, actorAssets.clips, { initial: "idle", fadeSeconds: 0.08 });
    return {
      mesh,
      animator,
      animatorRoot,
      animated: true,
      proceduralPose: createProceduralPose(mesh),
      proceduralMode: "additive",
      activeAnimation: "idle",
      activeAnimationSource: resolveAnimationSource("idle"),
      overlayAnimation: null,
      animationClock: Math.random() * 10
    };
  }
  return {
    mesh: makeBillboard(fallbackTexture, width, height),
    animator: null,
    animatorRoot: null,
    animated: false,
    proceduralPose: null,
    proceduralMode: "none",
    activeAnimation: "idle",
    activeAnimationSource: "billboard",
    overlayAnimation: null,
    animationClock: 0
  };
}

function findActorHandAnchor(root: Three.Object3D | null | undefined): Three.Object3D | null {
  const matches: Array<{ object: Three.Object3D; exact: boolean }> = [];
  root?.traverse?.((child) => {
    if (!child.name) return;
    const key = child.name.toLowerCase();
    const compact = key.replace(/[^a-z0-9]/g, "");
    const exact = key === "righthand" || key === "right_hand" || key === "hand_r" || compact === "righthand" || compact === "handr";
    if (exact || (compact.includes("right") && compact.includes("hand"))) matches.push({ object: child, exact });
  });
  return matches.find((match) => match.exact)?.object ?? matches[0]?.object ?? null;
}

function setActorPosition(actor: WorldActor, x: number, z: number): void {
  if (!actor.mesh || actor.renderAsBillboard) return;
  const position = renderPositionInto(tempRenderPosition, x, z);
  actor.mesh.position.set(position.x, actorGroundHeight(actor) + (actor.animated ? 0 : 1.65) + (actor.jumpY ?? 0), position.z);
}

function setActorFacing(actor: WorldActor, angle: number): void {
  if (!actor.mesh || actor.renderAsBillboard) return;
  actor.facingAngle = angle;
  if (actor.animated) actor.mesh.rotation.y = -angle + Math.PI / 2;
  else {
    const material = actor.mesh.material;
    if (material && !Array.isArray(material) && "rotation" in material && typeof material.rotation === "number") {
      material.rotation = -angle + Math.PI / 2;
    }
  }
}

function updatePlayerFacing(dt: number): void {
  const player = state.player;
  if (!player) return;
  const targetAngle = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const currentAngle = player.facingAngle ?? targetAngle;
  const amount = 1 - Math.exp(-18 * Math.max(0, dt));
  setActorFacing(player, currentAngle + shortestAngleDelta(currentAngle, targetAngle) * amount);
}

function setActorOpacity(actor: ActorAnimationState, opacity: number): void {
  if (!actor.mesh) return;
  actor.mesh.traverse?.((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
    }
  });
  if (actor.mesh.material) {
    const materials = Array.isArray(actor.mesh.material) ? actor.mesh.material : [actor.mesh.material];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
    }
  }
}

function setActorDamageFlash(actor: ActorAnimationState | null | undefined, strength: number): void {
  if (!actor?.mesh) return;
  const flash = clamp01(strength);
  actor.mesh.traverse?.((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) applyDamageFlashToMaterial(material, flash);
  });
  if (actor.mesh.material) {
    const materials = Array.isArray(actor.mesh.material) ? actor.mesh.material : [actor.mesh.material];
    for (const material of materials) applyDamageFlashToMaterial(material, flash);
  }
}

function applyDamageFlashToMaterial(material: Three.Material, strength: number): void {
  material.userData = material.userData ?? {};
  const color = "color" in material && material.color instanceof THREE.Color ? material.color : null;
  const emissive = "emissive" in material && material.emissive instanceof THREE.Color ? material.emissive : null;
  if (color && !(material.userData.baseDamageFlashColor instanceof THREE.Color)) material.userData.baseDamageFlashColor = color.clone();
  if (emissive && !(material.userData.baseDamageFlashEmissive instanceof THREE.Color)) material.userData.baseDamageFlashEmissive = emissive.clone();
  if (color && material.userData.baseDamageFlashColor instanceof THREE.Color) {
    color.copy(material.userData.baseDamageFlashColor).lerp(new THREE.Color(0xffffff), strength * 0.55);
  }
  if (emissive) {
    if (strength > 0) emissive.setRGB(1.0 * strength, 0.24 * strength, 0.18 * strength);
    else if (material.userData.baseDamageFlashEmissive instanceof THREE.Color) emissive.copy(material.userData.baseDamageFlashEmissive);
  }
}

function playActorAnimation(actor: ActorAnimationState | null | undefined, name: string, fadeSeconds = 0.08): boolean {
  if (!actor) return false;
  if (actor.engineMotion) {
    const isOverlay = PROCEDURAL_ACTION_ANIMATION_NAMES.has(name);
    actor.overlayAnimation = isOverlay ? name : null;
    if (!isOverlay) actor.activeAnimation = name;
    actor.activeAnimationSource = "engine-motion";
    actor.proceduralMode = "semantic";
    if (name === "shoot" || name === "cast") {
      actor.engineMotion.recoil(name === "cast" ? 0.72 : 1);
      if (actor === state.player && state.player) state.player.engineMotionRecoilSource = "engine-motion";
    }
    if (name === "land" && actor === state.player && state.player) state.player.engineMotionLandSource = "engine-motion";
    const key = `engine-motion:${name}`;
    state.animationPlayCounts[key] = (state.animationPlayCounts[key] ?? 0) + 1;
    state.lastAnimationPlay = { name, source: "engine-motion", at: state.time };
    return true;
  }
  const animator = actor.animator;
  const played = animator?.play(name, { fadeSeconds }) === true;
  const fallbackSource = actor.animated ? resolveProceduralAnimationSource(name) ?? "missing" : "billboard";
  if (played) {
    actor.overlayAnimation = null;
    actor.activeAnimation = animator?.current ?? name;
    actor.activeAnimationSource = resolveAnimationSource(actor.activeAnimation);
    actor.proceduralMode = actor.proceduralPose ? "additive" : "none";
  } else if (fallbackSource === "procedural") {
    actor.overlayAnimation = name;
    actor.activeAnimation = animator?.current ?? actor.activeAnimation ?? name;
    actor.activeAnimationSource = resolveAnimationSource(actor.activeAnimation) ?? (animator?.current ? "unknown" : "procedural");
    actor.proceduralMode = actor.proceduralPose ? (animator?.current ? "additive" : "full") : "none";
  } else {
    actor.overlayAnimation = null;
    actor.activeAnimation = name;
    actor.activeAnimationSource = fallbackSource;
    actor.proceduralMode = actor.proceduralPose ? "full" : "none";
  }
  if (played || fallbackSource === "procedural") {
    const source = played ? actor.activeAnimationSource ?? "unknown" : fallbackSource;
    const key = `${source}:${name}`;
    state.animationPlayCounts[key] = (state.animationPlayCounts[key] ?? 0) + 1;
    state.lastAnimationPlay = { name, source, at: state.time };
  }
  return played;
}

function resolveAnimationSource(name: string): string | null {
  return state.actorAssets?.clipSources?.get(name) ?? null;
}

function resolveProceduralAnimationSource(name: string): "procedural" | null {
  return PROCEDURAL_ACTION_ANIMATION_NAMES.has(name) ? "procedural" : null;
}

function createProceduralPose(root: Three.Object3D): ProceduralPose {
  const parts = new Map<string, ProceduralPosePart>();
  root.traverse?.((child) => {
    if (!child.name) return;
    parts.set(child.name.toLowerCase(), {
      object: child,
      rotation: child.rotation.clone(),
      position: child.position.clone(),
      overlayRotation: { x: 0, y: 0, z: 0 }
    });
  });
  return { parts, time: Math.random() * 10 };
}

function getPosePart(pose: ProceduralPose | null | undefined, names: string[]): ProceduralPosePart | null {
  if (!pose) return null;
  for (const name of names) {
    const part = pose.parts.get(name.toLowerCase());
    if (part) return part;
  }
  return null;
}

function resetPosePart(part: ProceduralPosePart | null | undefined): void {
  if (!part) return;
  part.object.rotation.copy(part.rotation);
  part.object.position.copy(part.position);
}

function addPoseRotation(part: ProceduralPosePart | null | undefined, x: number, y: number, z: number): void {
  if (!part) return;
  part.object.rotation.x += x;
  part.object.rotation.y += y;
  part.object.rotation.z += z;
  part.overlayRotation.x += x;
  part.overlayRotation.y += y;
  part.overlayRotation.z += z;
}

function clearProceduralPoseOverlay(pose: ProceduralPose | null | undefined): void {
  if (!pose) return;
  for (const part of pose.parts.values()) {
    const overlay = part.overlayRotation;
    if (!overlay || (!overlay.x && !overlay.y && !overlay.z)) continue;
    part.object.rotation.x -= overlay.x;
    part.object.rotation.y -= overlay.y;
    part.object.rotation.z -= overlay.z;
    overlay.x = 0;
    overlay.y = 0;
    overlay.z = 0;
  }
}

function applyProceduralPose(actor: ActorAnimationState, dt: number, moving: boolean): void {
  const pose = actor?.proceduralPose;
  if (!pose) return;
  if (actor.animator?.current) {
    applyProceduralOverlay(actor, dt, moving);
    return;
  }
  actor.proceduralMode = "full";
  const animation = actor.activeAnimation ?? "idle";
  const runAmount = moving || animation === "run" ? 1 : 0;
  pose.time += dt * (runAmount ? 7.8 : 2.2);
  const hips = getPosePart(pose, ["HipsCtrl", "Hips"]);
  const spine = getPosePart(pose, ["Spine"]);
  const head = getPosePart(pose, ["Head"]);
  const leftArm = getPosePart(pose, ["LeftArm"]);
  const rightArm = getPosePart(pose, ["RightArm"]);
  const leftForeArm = getPosePart(pose, ["LeftForeArm"]);
  const rightForeArm = getPosePart(pose, ["RightForeArm"]);
  const leftUpLeg = getPosePart(pose, ["LeftUpLeg"]);
  const rightUpLeg = getPosePart(pose, ["RightUpLeg"]);
  const leftLeg = getPosePart(pose, ["LeftLeg"]);
  const rightLeg = getPosePart(pose, ["RightLeg"]);
  for (const part of [hips, spine, head, leftArm, rightArm, leftForeArm, rightForeArm, leftUpLeg, rightUpLeg, leftLeg, rightLeg]) resetPosePart(part);
  const phase = pose.time;
  const stride = Math.sin(phase);
  const counterStride = Math.sin(phase + Math.PI);
  const bob = runAmount ? Math.abs(stride) * 0.13 : Math.sin(phase) * 0.025;
  addPoseRotation(leftArm, 0, 0, -1.05);
  addPoseRotation(rightArm, 0, 0, 1.05);
  addPoseRotation(leftForeArm, 0, 0, -0.22);
  addPoseRotation(rightForeArm, 0, 0, 0.22);
  if (hips) hips.object.position.y += bob;
  if (animation === "fall") {
    if (hips) hips.object.position.y += 0.18;
    addPoseRotation(spine, 0.24, 0, 0);
    addPoseRotation(head, -0.16, 0, 0);
    addPoseRotation(leftArm, -0.42, 0, 0.36);
    addPoseRotation(rightArm, -0.42, 0, -0.36);
    addPoseRotation(leftUpLeg, 0.2, 0, 0.08);
    addPoseRotation(rightUpLeg, 0.2, 0, -0.08);
    addPoseRotation(leftLeg, 0.35, 0, 0);
    addPoseRotation(rightLeg, 0.35, 0, 0);
    return;
  }
  if (animation === "land") {
    if (hips) hips.object.position.y -= 0.18;
    addPoseRotation(spine, 0.38, 0, 0);
    addPoseRotation(head, -0.18, 0, 0);
    addPoseRotation(leftArm, 0.32, 0, 0.32);
    addPoseRotation(rightArm, 0.32, 0, -0.32);
    addPoseRotation(leftUpLeg, 0.48, 0, 0.06);
    addPoseRotation(rightUpLeg, 0.48, 0, -0.06);
    addPoseRotation(leftLeg, -0.5, 0, 0);
    addPoseRotation(rightLeg, -0.5, 0, 0);
    return;
  }
  if (animation === "jump") {
    if (hips) hips.object.position.y += 0.36 + Math.sin(phase * 2.4) * 0.06;
    addPoseRotation(leftArm, -0.55, 0, 0.72);
    addPoseRotation(rightArm, -0.55, 0, -0.72);
    addPoseRotation(leftUpLeg, 0.36, 0, 0);
    addPoseRotation(rightUpLeg, 0.36, 0, 0);
    return;
  }
  if (!runAmount) {
    addPoseRotation(spine, Math.sin(phase) * 0.025, 0, Math.cos(phase * 0.7) * 0.018);
    addPoseRotation(head, Math.sin(phase * 0.7) * 0.018, 0, 0);
    return;
  }
  addPoseRotation(hips, -0.08, Math.sin(phase * 0.5) * 0.04, 0);
  addPoseRotation(spine, 0.16, 0, stride * 0.045);
  addPoseRotation(head, -0.08, 0, -stride * 0.035);
  addPoseRotation(leftArm, stride * 0.72, 0, -0.18);
  addPoseRotation(rightArm, counterStride * 0.72, 0, 0.18);
  addPoseRotation(leftForeArm, -0.18 + counterStride * 0.22, 0, 0);
  addPoseRotation(rightForeArm, -0.18 + stride * 0.22, 0, 0);
  addPoseRotation(leftUpLeg, counterStride * 0.78, 0, 0.04);
  addPoseRotation(rightUpLeg, stride * 0.78, 0, -0.04);
  addPoseRotation(leftLeg, Math.max(0, stride) * 0.5, 0, 0);
  addPoseRotation(rightLeg, Math.max(0, counterStride) * 0.5, 0, 0);
}

function applyProceduralOverlay(actor: ActorAnimationState, dt: number, moving: boolean): void {
  const pose = actor?.proceduralPose;
  if (!pose) return;
  actor.proceduralMode = "additive";
  const animation = actor.overlayAnimation ?? actor.activeAnimation ?? "idle";
  if (animation === "hit" || animation === "death") return;
  pose.time += dt * (moving ? 7.8 : 2.2);
  const phase = pose.time;
  const leftArm = getPosePart(pose, ["LeftArm"]);
  const rightArm = getPosePart(pose, ["RightArm"]);
  const leftForeArm = getPosePart(pose, ["LeftForeArm"]);
  const rightForeArm = getPosePart(pose, ["RightForeArm"]);
  const head = getPosePart(pose, ["Head"]);
  const recoil = animation === "shoot" || animation === "cast" ? Math.sin(phase * 18) * 0.08 : 0;
  if (animation === "shoot" || animation === "cast" || animation === "aim") {
    addPoseRotation(leftArm, -0.08, 0, -0.14);
    addPoseRotation(rightArm, -0.16 - recoil, 0, 0.18);
    addPoseRotation(leftForeArm, -0.08, 0, -0.05);
    addPoseRotation(rightForeArm, -0.12 - recoil, 0, 0.04);
    addPoseRotation(head, -0.015, 0, 0);
    return;
  }
  if (moving) {
    const sway = Math.sin(phase) * 0.055;
    addPoseRotation(leftArm, sway, 0, -0.04);
    addPoseRotation(rightArm, -sway, 0, 0.04);
  }
}

function updateActorAnimation(actor: ActorAnimationState | null | undefined, dt: number, moving: boolean): void {
  if (!actor) return;
  if (!actor.animated && !actor.animator && !actor.proceduralPose) {
    actor.activeAnimation = moving ? "run" : "idle";
    actor.activeAnimationSource = "billboard";
    return;
  }
  if ((actor.animLock ?? 0) <= 0) actor.overlayAnimation = null;
  const desired = moving ? "run" : "idle";
  if (actor.overlayAnimation && (actor.animLock ?? 0) > 0) {
    actor.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(actor, desired);
  } else if (actor.activeAnimationSource === "procedural" && (actor.animLock ?? 0) > 0) {
    actor.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(actor, desired);
  } else if ((actor.animLock ?? 0) <= 0 && actor.activeAnimation !== desired) {
    playActorAnimation(actor, desired);
  }
  clearProceduralPoseOverlay(actor.proceduralPose);
  actor.animator?.update(dt);
  applyProceduralPose(actor, dt, moving);
}

function setupArena(): void {
  const worldSize = getWorldSize();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldSize, worldSize, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x111a15, roughness: 0.98, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  addLoopGroundCopies(ground, worldSize);
  addGroundTileField();
  addLoopBoundary(worldSize);
  for (const hazard of data.hazards) addHazard(hazard);
  addTraversalTools();
  state.pendingProps = [...data.props];
  revealLazyProps({ initial: true, force: true });
}

function addLoopGroundCopies(sourceGround: Three.Mesh, worldSize: number): void {
  for (const xOffset of [-worldSize, 0, worldSize]) {
    for (const zOffset of [-worldSize, 0, worldSize]) {
      if (xOffset === 0 && zOffset === 0) continue;
      const copy = sourceGround.clone();
      copy.position.set(xOffset, 0, zOffset);
      copy.visible = false;
      scene.add(copy);
      state.loopGroundCopies.push(copy);
    }
  }
}

function addLoopBoundary(worldSize: number): void {
  const half = worldSize / 2;
  const material = new THREE.MeshBasicMaterial({ color: 0xaadf8e, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
  const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(worldSize, 0.8), material);
  horizontal.rotation.x = -Math.PI / 2;
  horizontal.position.set(0, 0.035, -half);
  const horizontalB = horizontal.clone();
  horizontalB.position.z = half;
  const vertical = new THREE.Mesh(new THREE.PlaneGeometry(0.8, worldSize), material);
  vertical.rotation.x = -Math.PI / 2;
  vertical.position.set(-half, 0.035, 0);
  const verticalB = vertical.clone();
  verticalB.position.x = half;
  scene.add(horizontal, horizontalB, vertical, verticalB);
}

function addGroundTileField(): void {
  const palette = [0x26352f, 0x2d3c34, 0x223235, 0x3a3d33, 0x284245, 0x403c2f, 0x30372e];
  const platformPalette = [0x4b525d, 0x59606a, 0x454d58, 0x5f665d];
  const geometry = new THREE.BoxGeometry(GROUND_TILE_SIZE * 0.94, GROUND_TILE_BASE_HEIGHT, GROUND_TILE_SIZE * 0.94);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, emissive: 0x030807, emissiveIntensity: 0.08, transparent: true, opacity: 0.78 });
  const mesh = new THREE.InstancedMesh(geometry, material, GROUND_TILE_PATCH_AXIS * GROUND_TILE_PATCH_AXIS);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
  state.groundTilePatch = {
    mesh,
    palette,
    platformPalette,
    lastCenterGX: Number.POSITIVE_INFINITY,
    lastCenterGZ: Number.POSITIVE_INFINITY
  };
  updateGroundTilePatch(true);
  scene.add(mesh);
  state.groundTiles.push(mesh);
}

function updateGroundTilePatch(force = false): void {
  if (!state.groundTilePatch || !state.player) return;
  const { mesh, palette, platformPalette } = state.groundTilePatch;
  const centerGX = Math.floor(state.player.x / GROUND_TILE_SIZE);
  const centerGZ = Math.floor(state.player.z / GROUND_TILE_SIZE);
  if (!force && centerGX === state.groundTilePatch.lastCenterGX && centerGZ === state.groundTilePatch.lastCenterGZ) return;
  state.groundTilePatch.lastCenterGX = centerGX;
  state.groundTilePatch.lastCenterGZ = centerGZ;
  const half = Math.floor(GROUND_TILE_PATCH_AXIS / 2);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let index = 0;
  for (let ox = -half; ox <= half; ox += 1) {
    for (let oz = -half; oz <= half; oz += 1) {
      const gx = centerGX + ox;
      const gz = centerGZ + oz;
      const worldX = gx * GROUND_TILE_SIZE + ((Math.abs(gz) % 2) * GROUND_TILE_SIZE * 0.18);
      const worldZ = gz * GROUND_TILE_SIZE;
      const wrappedX = wrapWorld(worldX);
      const wrappedZ = wrapWorld(worldZ);
      const position = renderPosition(wrappedX, wrappedZ);
      const jitter = tileJitter(gx, gz);
      const platformHeight = terrainPlatformHeightAt(wrappedX, wrappedZ);
      const topY = platformHeight ?? terrainBaseHeightAt(wrappedX, wrappedZ);
      const thickness = platformHeight === null ? GROUND_TILE_BASE_HEIGHT * (1 + Math.abs(jitter) * 2.2) : GROUND_TILE_BASE_HEIGHT * 15;
      matrix.compose(
        new THREE.Vector3(position.x, topY - thickness * 0.5, position.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (jitter * 0.16), 0)),
        new THREE.Vector3(1 + Math.sin(gx * 2.1) * 0.08, thickness / GROUND_TILE_BASE_HEIGHT, 1 + Math.cos(gz * 3.4) * 0.08)
      );
      mesh.setMatrixAt(index, matrix);
      const activePalette = platformHeight === null ? palette : platformPalette;
      color.setHex(activePalette[Math.abs(Math.floor(tileJitter(gx + 13, gz - 7) * 1000)) % activePalette.length] ?? 0x26352f);
      mesh.setColorAt?.(index, color);
      index += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function tileJitter(gx: number, gz: number): number {
  return Math.sin(gx * 17.13 + gz * 4.77);
}

function terrainSeed(ix: number, iz: number, salt = 0): number {
  const value = Math.sin(ix * 127.1 + iz * 311.7 + salt * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function terrainBaseHeightAt(x: number, z: number): number {
  const qx = Math.round(x / TERRAIN_HEIGHT_CACHE_STEP);
  const qz = Math.round(z / TERRAIN_HEIGHT_CACHE_STEP);
  const key = qx * TERRAIN_CACHE_KEY_STRIDE + qz;
  const cached = state.terrainBaseHeightCache.get(key);
  if (cached !== undefined) return cached;
  const sampleX = qx * TERRAIN_HEIGHT_CACHE_STEP;
  const sampleZ = qz * TERRAIN_HEIGHT_CACHE_STEP;
  const low = (
    Math.sin((sampleX + 11) * TERRAIN_HILL_FREQUENCY)
    + Math.sin((sampleZ - 29) * TERRAIN_HILL_FREQUENCY * 1.17)
    + Math.sin((sampleX * 0.7 + sampleZ * 0.42) * TERRAIN_HILL_FREQUENCY * 1.38)
  ) / 3;
  const mountain = (
    Math.sin((sampleX + 83) * 0.0064)
    + Math.cos((sampleZ - 41) * 0.0071)
    + Math.sin((sampleX * 0.58 + sampleZ * 0.82) * 0.0082)
  ) / 3;
  const mountainLift = Math.pow(clamp01(0.55 + mountain * 0.45), 1.28) * TERRAIN_MOUNTAIN_HEIGHT;
  const ridges = Math.sin(sampleX * 0.033 + sampleZ * 0.014) * 0.72 + Math.sin(sampleX * -0.021 + sampleZ * 0.044) * 0.46;
  const centerFalloff = smoothstep01((Math.hypot(sampleX, sampleZ) - TERRAIN_START_CLEAR_RADIUS * 0.45) / (TERRAIN_START_CLEAR_RADIUS * 0.9));
  const height = Math.max(0.02, ((0.5 + low * 0.5) * TERRAIN_HILL_HEIGHT + mountainLift + ridges) * centerFalloff);
  if (state.terrainBaseHeightCache.size < TERRAIN_HEIGHT_CACHE_MAX_ENTRIES) state.terrainBaseHeightCache.set(key, height);
  return height;
}

function terrainPlatformCellAt(gx: number, gz: number): TerrainPlatformCell | null {
  const key = `${gx},${gz}`;
  if (state.terrainPlatformCellCache.has(key)) return state.terrainPlatformCellCache.get(key) ?? null;
  let cell: TerrainPlatformCell | null = null;
  if (terrainSeed(gx, gz) <= TERRAIN_PLATFORM_DENSITY) {
    const centerX = (gx + 0.5 + (terrainSeed(gx, gz, 1) - 0.5) * 0.56) * TERRAIN_PLATFORM_CELL_SIZE;
    const centerZ = (gz + 0.5 + (terrainSeed(gx, gz, 2) - 0.5) * 0.56) * TERRAIN_PLATFORM_CELL_SIZE;
    if (centerX * centerX + centerZ * centerZ >= TERRAIN_START_CLEAR_RADIUS * TERRAIN_START_CLEAR_RADIUS) {
      const radius = TERRAIN_PLATFORM_RADIUS_MIN + terrainSeed(gx, gz, 3) * (TERRAIN_PLATFORM_RADIUS_MAX - TERRAIN_PLATFORM_RADIUS_MIN);
      cell = {
        centerX,
        centerZ,
        radius,
        radiusSq: radius * radius,
        lift: TERRAIN_PLATFORM_HEIGHT_MIN + terrainSeed(gx, gz, 4) * (TERRAIN_PLATFORM_HEIGHT_MAX - TERRAIN_PLATFORM_HEIGHT_MIN),
        baseHeight: terrainBaseHeightAt(centerX, centerZ)
      };
    }
  }
  if (state.terrainPlatformCellCache.size < TERRAIN_PLATFORM_CELL_CACHE_MAX_ENTRIES) state.terrainPlatformCellCache.set(key, cell);
  return cell;
}

function terrainPlatformHeightAt(x: number, z: number): number | null {
  const baseGX = Math.floor(x / TERRAIN_PLATFORM_CELL_SIZE);
  const baseGZ = Math.floor(z / TERRAIN_PLATFORM_CELL_SIZE);
  let best = Number.NEGATIVE_INFINITY;
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oz = -1; oz <= 1; oz += 1) {
      const gx = baseGX + ox;
      const gz = baseGZ + oz;
      const cell = terrainPlatformCellAt(gx, gz);
      if (!cell) continue;
      const dx = x - cell.centerX;
      const dz = z - cell.centerZ;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > cell.radiusSq) continue;
      const edgeBlend = clamp01((cell.radius - Math.sqrt(distanceSq)) / TERRAIN_PLATFORM_EDGE_PAD);
      const top = cell.baseHeight + cell.lift * (0.74 + edgeBlend * 0.26);
      best = Math.max(best, top);
    }
  }
  return best > Number.NEGATIVE_INFINITY ? best : null;
}

function terrainHeightAt(x: number, z: number): number {
  const qx = Math.round(x / TERRAIN_HEIGHT_CACHE_STEP);
  const qz = Math.round(z / TERRAIN_HEIGHT_CACHE_STEP);
  const key = qx * TERRAIN_CACHE_KEY_STRIDE + qz;
  const cached = state.terrainHeightCache.get(key);
  if (cached !== undefined) return cached;
  const sampleX = qx * TERRAIN_HEIGHT_CACHE_STEP;
  const sampleZ = qz * TERRAIN_HEIGHT_CACHE_STEP;
  const height = terrainPlatformHeightAt(sampleX, sampleZ) ?? terrainBaseHeightAt(sampleX, sampleZ);
  if (state.terrainHeightCache.size < TERRAIN_HEIGHT_CACHE_MAX_ENTRIES) state.terrainHeightCache.set(key, height);
  return height;
}

function actorGroundHeight(actor: WorldActor | null | undefined): number {
  if (!actor) return 0;
  if (actor !== state.player && typeof actor.groundY === "number" && Number.isFinite(actor.groundY)) return actor.groundY;
  const groundY = terrainHeightAt(actor.x ?? 0, actor.z ?? 0);
  if (actor !== state.player) actor.groundY = groundY;
  return groundY;
}

function actorFeetY(actor: WorldActor | null | undefined): number {
  if (!actor) return 0;
  return actorGroundHeight(actor) + (actor.jumpY ?? 0);
}

function actorVerticalHeight(actor: WorldActor | null | undefined): number {
  return PLAYER_HEIGHT_WORLD * Math.max(0.45, actor?.scale ?? 1);
}

function verticalRangesOverlap(minA: number, maxA: number, minB: number, maxB: number, pad = 0.12): boolean {
  return minA <= maxB + pad && maxA >= minB - pad;
}

function actorsOverlapY(a: WorldActor, b: WorldActor, pad = 0.24): boolean {
  const aMin = actorFeetY(a);
  const bMin = actorFeetY(b);
  return verticalRangesOverlap(aMin, aMin + actorVerticalHeight(a), bMin, bMin + actorVerticalHeight(b), pad);
}

function terrainGradientAt(x: number, z: number, sample = TERRAIN_GRADIENT_SAMPLE): { x: number; z: number; ratio: number; angle: number } {
  const sx = Math.max(0.4, sample);
  const sz = Math.max(0.4, sample);
  const gx = (terrainHeightAt(wrapWorld(x + sx), z) - terrainHeightAt(wrapWorld(x - sx), z)) / (sx * 2);
  const gz = (terrainHeightAt(x, wrapWorld(z + sz)) - terrainHeightAt(x, wrapWorld(z - sz))) / (sz * 2);
  return { x: gx, z: gz, ratio: Math.hypot(gx, gz), angle: Math.atan(Math.hypot(gx, gz)) };
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function addTraversalTools(): void {
  if (state.traversalTools.length) return;
  const spawns = buildTraversalToolSpawns(TRAVERSAL_TOOL_COUNT);
  for (let index = 0; index < spawns.length; index += 1) {
    const spawn = spawns[index];
    const type = TRAVERSAL_TOOL_TYPES[index % TRAVERSAL_TOOL_TYPES.length];
    if (!spawn || !type) continue;
    const color = traversalToolColor(type);
    const mesh = createTraversalToolVisual(type, color);
    const light = new THREE.PointLight(new THREE.Color(color), 0.85, 14, 2);
    const tool: TraversalTool = {
      id: `tool-${type}-${index}`,
      type,
      x: spawn.x,
      z: spawn.z,
      targetX: spawn.targetX,
      targetZ: spawn.targetZ,
      dirX: spawn.dirX,
      dirZ: spawn.dirZ,
      radius: TRAVERSAL_TOOL_TRIGGER_RADIUS,
      cooldown: 0,
      seed: terrainSeed(index, Math.round(spawn.x + spawn.z), 19) * 10,
      mesh,
      light,
      color
    };
    scene.add(mesh, light);
    state.traversalTools.push(tool);
    updateTraversalToolVisual(tool, 0, true);
  }
}

function buildTraversalToolSpawns(count: number): TraversalSpawn[] {
  const worldSize = getWorldSize();
  const half = worldSize / 2;
  const step = 30;
  const candidates: TraversalSpawn[] = [];
  for (let x = -half + step; x < half; x += step) {
    for (let z = -half + step; z < half; z += step) {
      if (Math.hypot(x, z) < TERRAIN_START_CLEAR_RADIUS + 18) continue;
      const gap = largestHeightDeltaAround(x, z);
      const gradient = terrainGradientAt(x, z, 3.2);
      const score = Math.abs(gap.delta) + Math.max(0, gradient.ratio - 0.72) * 18;
      if (score < 6.2) continue;
      candidates.push({ x: wrapWorld(x), z: wrapWorld(z), score, ...gap });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const selected = selectSeparatedTraversalSpawns(candidates, count, 34);
  if (selected.length >= count) return selected.slice(0, count);
  const relaxed = selectSeparatedTraversalSpawns(candidates, count, 20, selected);
  while (relaxed.length < count) {
    const index = relaxed.length;
    const angle = index * 2.399963229728653;
    const radius = 74 + (index % 9) * 38;
    const x = wrapWorld(Math.cos(angle) * radius);
    const z = wrapWorld(Math.sin(angle) * radius);
    relaxed.push({ x, z, ...largestHeightDeltaAround(x, z), score: 0 });
  }
  return relaxed.slice(0, count);
}

function largestHeightDeltaAround(x: number, z: number): TraversalHeightDelta {
  const base = terrainHeightAt(x, z);
  let best = { delta: 0, dirX: 1, dirZ: 0, targetX: wrapWorld(x + 24), targetZ: z };
  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    for (const distance of [18, 28, 42]) {
      const targetX = wrapWorld(x + dirX * distance);
      const targetZ = wrapWorld(z + dirZ * distance);
      const delta = terrainHeightAt(targetX, targetZ) - base;
      if (Math.abs(delta) > Math.abs(best.delta)) best = { delta, dirX, dirZ, targetX, targetZ };
    }
  }
  return best;
}

function selectSeparatedTraversalSpawns(
  candidates: TraversalSpawn[],
  count: number,
  minDistance: number,
  seed: TraversalSpawn[] = []
): TraversalSpawn[] {
  const selected: TraversalSpawn[] = [...seed];
  const minDistanceSq = minDistance * minDistance;
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    if (selected.some((item) => worldDistanceSquared(item.x, item.z, candidate.x, candidate.z) < minDistanceSq)) continue;
    selected.push(candidate);
  }
  return selected;
}

function traversalToolColor(type: TraversalToolType): string {
  if (type === "spring") return "#bff7ff";
  if (type === "floatPlatform") return "#d7ff8d";
  if (type === "zipline") return "#ffd27a";
  if (type === "teleporter") return "#d6b2ff";
  return "#9fe8ff";
}

function createTraversalToolVisual(type: TraversalToolType, colorValue: Three.ColorRepresentation): Three.Group {
  const group = new THREE.Group();
  group.frustumCulled = false;
  const color = new THREE.Color(colorValue);
  const metal = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.52, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a241f, roughness: 0.86, metalness: 0.08 });
  if (type === "spring") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.18, 18), dark);
    base.position.y = 0.09;
    group.add(base);
    for (let i = 0; i < 4; i += 1) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 6, 32), metal);
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 0.28 + i * 0.22;
      group.add(coil);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.16, 18), metal);
    cap.position.y = 1.18;
    group.add(cap);
  } else if (type === "floatPlatform") {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 2.1), metal);
    deck.position.y = 0.72;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.035, 6, 40), createIndicatorMaterial(colorValue, 0.34));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.42;
    group.add(deck, ring);
  } else if (type === "zipline") {
    const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), dark);
    const postB = postA.clone();
    postA.position.set(-1.45, 1.1, 0);
    postB.position.set(1.45, 1.45, 0);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.45, 2.1, 0), new THREE.Vector3(1.45, 2.62, 0)]),
      new THREE.LineBasicMaterial({ color })
    );
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.18), metal);
    handle.position.set(0, 1.84, 0);
    group.add(postA, postB, line, handle);
  } else if (type === "teleporter") {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.16, 28), dark);
    pad.position.y = 0.08;
    const groundRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.045, 6, 48), metal);
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = 0.18;
    const gate = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.045, 6, 48), createIndicatorMaterial(colorValue, 0.52));
    gate.position.y = 1.2;
    group.add(pad, groundRing, gate);
  } else {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 0.22, 18), dark);
    column.position.y = 0.11;
    group.add(column);
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62 + i * 0.25, 0.025, 6, 36), createIndicatorMaterial(colorValue, 0.28 + i * 0.08));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.42 + i * 0.38;
      group.add(ring);
    }
  }
  return group;
}

function updateTraversalTools(dt: number): void {
  for (const tool of state.traversalTools) {
    tool.cooldown = Math.max(0, (tool.cooldown ?? 0) - dt);
    updateTraversalToolVisual(tool, dt);
    if (!state.running || !state.player || state.player.hp <= 0 || tool.cooldown > 0) continue;
    if (worldDistanceSquared(state.player.x, state.player.z, tool.x, tool.z) > tool.radius * tool.radius) continue;
    activateTraversalTool(tool);
  }
}

function updateTraversalToolVisuals(dt = 0): void {
  for (const tool of state.traversalTools) updateTraversalToolVisual(tool, dt);
}

function updateTraversalToolVisual(tool: TraversalTool, dt = 0, force = false): void {
  if (!tool?.mesh || !state.player) return;
  const delta = worldDelta(state.player.x, state.player.z, tool.x, tool.z);
  const visible = force || (Math.abs(delta.dx) <= STATIC_VISIBILITY_RADIUS + 52 && Math.abs(delta.dz) <= STATIC_VISIBILITY_RADIUS + 52);
  tool.mesh.visible = visible;
  if (tool.light) tool.light.visible = visible;
  if (!visible) return;
  const position = renderPosition(tool.x, tool.z);
  const bob = Math.sin(state.time * 2.5 + tool.seed) * 0.12;
  const y = terrainHeightAt(tool.x, tool.z) + traversalToolYOffset(tool.type) + bob;
  tool.mesh.position.set(position.x, y, position.z);
  tool.mesh.rotation.y += dt * traversalToolRotationSpeed(tool.type);
  if (tool.type === "zipline") tool.mesh.rotation.y = -Math.atan2(tool.dirZ, tool.dirX);
  if (tool.light) {
    tool.light.position.set(position.x, y + 1.2, position.z);
    tool.light.intensity = (tool.cooldown > 0 ? 0.28 : 0.85) * (0.88 + Math.sin(state.time * 4 + tool.seed) * 0.12);
  }
  const scale = tool.cooldown > 0 ? 0.82 : 1 + Math.sin(state.time * 5.2 + tool.seed) * 0.025;
  tool.mesh.scale.setScalar(scale);
}

function traversalToolYOffset(type: TraversalToolType): number {
  if (type === "zipline") return 0.06;
  if (type === "floatPlatform") return 1.05;
  if (type === "teleporter") return 0.08;
  return 0.04;
}

function traversalToolRotationSpeed(type: TraversalToolType): number {
  if (type === "spring") return 1.2;
  if (type === "teleporter") return 1.55;
  if (type === "windLift") return 0.9;
  return 0.2;
}

function activateTraversalTool(tool: TraversalTool): void {
  const player = state.player;
  if (!player) return;
  tool.cooldown = TRAVERSAL_TOOL_COOLDOWN_SECONDS;
  const dirX = tool.dirX ?? 1;
  const dirZ = tool.dirZ ?? 0;
  const currentVertical = player.jumpVelocityY ?? 0;
  player.grounded = false;
  player.jumpY = Math.max(player.jumpY ?? 0, 0.1);
  if (tool.type === "spring") {
    player.jumpVelocityY = Math.max(currentVertical, playerJumpVelocity(false) * 1.28);
    player.jumpsUsed = Math.min(player.jumpsUsed ?? 0, Math.max(0, playerJumpStats().maxJumps - 1));
  } else if (tool.type === "zipline") {
    const zipSpeed = Math.max(playerMomentumMaxSpeed(player) * 1.65, 25);
    player.moveMomentumX = dirX * zipSpeed;
    player.moveMomentumZ = dirZ * zipSpeed;
    player.jumpVelocityY = Math.max(currentVertical, 2.6);
    player.floatAssistUntil = Math.max(player.floatAssistUntil ?? 0, state.time + 0.45);
  } else if (tool.type === "teleporter") {
    const absoluteY = actorFeetY(player) + 1.2;
    player.x = wrapWorld(tool.targetX ?? (tool.x + dirX * 36));
    player.z = wrapWorld(tool.targetZ ?? (tool.z + dirZ * 36));
    player.jumpY = Math.max(0.35, absoluteY - terrainHeightAt(player.x, player.z));
    player.jumpVelocityY = Math.max(currentVertical, 2.8);
    player.floatAssistUntil = Math.max(player.floatAssistUntil ?? 0, state.time + 0.55);
  } else if (tool.type === "floatPlatform") {
    player.moveMomentumX = (player.moveMomentumX ?? 0) + dirX * 12;
    player.moveMomentumZ = (player.moveMomentumZ ?? 0) + dirZ * 12;
    capActorHorizontalSpeed(player, playerMomentumMaxSpeed(player) * 1.5);
    player.jumpVelocityY = Math.max(currentVertical, 4.3);
    player.floatAssistUntil = Math.max(player.floatAssistUntil ?? 0, state.time + 1.05);
  } else {
    player.moveMomentumX = (player.moveMomentumX ?? 0) + dirX * 9;
    player.moveMomentumZ = (player.moveMomentumZ ?? 0) + dirZ * 9;
    capActorHorizontalSpeed(player, playerMomentumMaxSpeed(player) * 1.45);
    player.jumpVelocityY = Math.max(currentVertical, playerJumpVelocity(false) * 0.82);
    player.floatAssistUntil = Math.max(player.floatAssistUntil ?? 0, state.time + 1.25);
  }
  spawnPulseRing(tool.x, tool.z, tool.color, 0.28, 0.72, 2.6);
  spawnFloatingText(traversalToolLabel(tool.type), tool.x, tool.z, tool.color, 0.86, { targetHeight: 2.6, lifeSeconds: 0.58 });
  playSynthCue("pickup", 1.05, { kind: "xp" });
  setActorPosition(player, player.x, player.z);
}

function traversalToolLabel(type: TraversalToolType): string {
  if (type === "spring") return "SPRING";
  if (type === "floatPlatform") return "FLOAT";
  if (type === "zipline") return "ZIP";
  if (type === "teleporter") return "BLINK";
  return "LIFT";
}

function setupInput(): void {
  window.addEventListener("keydown", (event) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    if (state.levelChoice && /^Digit[1-3]$/.test(event.code)) {
      event.preventDefault();
      applyLevelChoice(Number(event.code.at(-1)) - 1);
      return;
    }
    if (state.levelChoice && !event.repeat && event.code === "KeyR") {
      event.preventDefault();
      rerollLevelChoices();
      return;
    }
    if (state.levelChoice && !event.repeat && event.code === "KeyB") {
      event.preventDefault();
      banishSelectedLevelChoice();
      return;
    }
    if (event.code === "Space" && !event.repeat && state.running) attemptPlayerJump();
    keys.add(event.code);
    setInputMode("keyboard");
    if (event.code === "Escape" && !event.repeat) {
      if (state.running) openPauseMenu();
      else if (state.paused && state.pausePanel === "root") resumeRunFromPause();
      else if (state.paused && state.pausePanel === "settings") closePauseSettings();
      else if (state.paused && state.pausePanel === "confirm") closePauseConfirm();
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("pointermove", (event) => {
    setInputMode("keyboard");
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (state.running) {
      if (Math.hypot(event.movementX ?? 0, event.movementY ?? 0) > 0.5) markManualAim();
      orbitCameraFromMouse(event);
      setAimFromCamera();
      syncReticleToAimWorld();
      return;
    }
    positionReticle(event.clientX, event.clientY);
    updatePointerWorld(event.clientX, event.clientY);
  });
  renderer.domElement.addEventListener("pointerdown", () => {
    if (state.running) requestRunPointerLock();
  });
  window.addEventListener("gamepadconnected", (event) => registerGamepad(event.gamepad));
  window.addEventListener("gamepaddisconnected", (event) => {
    if (event.gamepad.index !== gamepadState.index) return;
    clearGamepadState();
  });
  updateControllerStatus();
  setInputMode("keyboard");
}

function setupMenu(): void {
  renderClassPicker();
  ui.soloButton.addEventListener("click", () => startGame(false));
  ui.onlineButton.addEventListener("click", connectLobby);
  ui.loadoutConfigButton?.addEventListener("click", toggleLoadoutPanel);
  ui.createRoomButton.addEventListener("click", () => networkClient?.createRoom?.());
  ui.startRoomButton?.addEventListener("click", () => networkClient?.startRoom?.());
  ui.refreshRoomsButton.addEventListener("click", () => networkClient?.listRooms?.());
  ui.levelChoiceRerollButton?.addEventListener("click", rerollLevelChoices);
  ui.levelChoiceBanishButton?.addEventListener("click", banishSelectedLevelChoice);
  ui.pauseResumeButton?.addEventListener("click", resumeRunFromPause);
  ui.pauseSettingsButton?.addEventListener("click", openPauseSettings);
  ui.pauseMainMenuButton?.addEventListener("click", openPauseConfirm);
  ui.pauseConfirmLeaveButton?.addEventListener("click", returnToMainMenuFromPause);
  ui.pauseConfirmCancelButton?.addEventListener("click", closePauseConfirm);
  bindSettingsControls();
  renderPauseUi();
  setMenuFocus(0);
}

function setupMinimap(): void {
  minimapCtx = ui.minimapCanvas?.getContext?.("2d") ?? null;
  ui.telemetryPanel?.classList.toggle("hidden", !telemetry.enabled || !PERF_FLAGS.telemetryPanel);
}

function pollGamepad(): void {
  const sample = gamepadSession.poll();
  const gamepad = sample.gamepad as Gamepad | undefined;
  if (!gamepad) {
    if (gamepadState.connected) clearGamepadState();
    return;
  }
  if (!gamepadState.connected || gamepadState.index !== gamepad.index) registerGamepad(gamepad);

  const frame = sample.frame;
  const pressedNow = (button: number): boolean => sample.pressedButtons.has(button);
  const move = {
    x: frame.movement.dx,
    y: frame.movement.dy,
    active: Math.hypot(frame.movement.dx, frame.movement.dy) > 0.001
  };
  const aim = {
    x: frame.aimOffset?.x ?? 0,
    y: frame.aimOffset?.y ?? 0,
    active: Boolean(frame.aimOffset)
  };

  gamepadState.moveX = move.x;
  gamepadState.moveZ = move.y;
  gamepadState.moveActive = move.active;
  gamepadState.lookX = aim.active ? clamp(aim.x, -1, 1) : 0;
  gamepadState.lookY = aim.active ? clamp(aim.y, -1, 1) : 0;
  if (frame.active) setInputMode("controller");

  if (aim.active) {
    gamepadState.aimX = aim.x;
    gamepadState.aimZ = aim.y;
  } else if (move.active && gamepadState.inputMode === "controller") {
    gamepadState.aimX = move.x;
    gamepadState.aimZ = move.y;
  }

  if (pressedNow(GAMEPAD_BUTTON.options)) {
    if (state.running) openPauseMenu();
    else if (state.paused && state.pausePanel === "root") resumeRunFromPause();
    else if (state.paused && state.pausePanel === "settings") closePauseSettings();
    else if (state.paused && state.pausePanel === "confirm") closePauseConfirm();
    else if ((isMenuVisible() || state.levelChoice) && menuFocus.targets().length) activateMenuFocus();
  }
  if (pressedNow(GAMEPAD_BUTTON.circle)) {
    if (state.paused && state.pausePanel === "root") resumeRunFromPause();
    else if (state.paused && state.pausePanel === "settings") closePauseSettings();
    else if (state.paused && state.pausePanel === "confirm") closePauseConfirm();
  }
  if (state.paused) {
    handleMenuGamepadNavigation(pressedNow, move);
    if (pressedNow(GAMEPAD_BUTTON.cross)) activateMenuFocus();
  } else if (state.levelChoice) {
    handleMenuGamepadNavigation(pressedNow, move);
    if (pressedNow(GAMEPAD_BUTTON.r1) || pressedNow(GAMEPAD_BUTTON.triangle)) rerollLevelChoices();
    if (pressedNow(GAMEPAD_BUTTON.square)) banishSelectedLevelChoice();
    if (pressedNow(GAMEPAD_BUTTON.cross)) activateMenuFocus();
  } else if (isMenuVisible()) {
    handleMenuGamepadNavigation(pressedNow, move);
    if (pressedNow(GAMEPAD_BUTTON.cross)) activateMenuFocus();
    if (pressedNow(GAMEPAD_BUTTON.r1) && !ui.refreshRoomsButton.disabled) networkClient?.listRooms?.();
  } else if (state.running && pressedNow(GAMEPAD_BUTTON.cross)) {
    attemptPlayerJump();
  }

}

function clearGamepadState(): void {
  gamepadState.connected = false;
  gamepadState.index = null;
  gamepadState.id = "";
  gamepadState.moveX = 0;
  gamepadState.moveZ = 0;
  gamepadState.moveActive = false;
  gamepadState.lookX = 0;
  gamepadState.lookY = 0;
  gamepadSession.reset();
  gamepadState.stickNavX = false;
  gamepadState.stickNavY = false;
  setInputMode("keyboard");
  updateControllerStatus();
}

function registerGamepad(gamepad: Gamepad): void {
  gamepadState.connected = true;
  gamepadState.index = gamepad.index;
  gamepadState.id = gamepad.id ?? "Gamepad";
  setInputMode("controller");
  updateControllerStatus();
  if (isFocusSurfaceVisible()) setMenuFocus(gamepadState.menuIndex);
}

function handleMenuGamepadNavigation(pressedNow: (button: number) => boolean, move: MenuMove): void {
  let direction: MenuDirection | null = null;
  if (pressedNow(GAMEPAD_BUTTON.up)) direction = "up";
  if (pressedNow(GAMEPAD_BUTTON.down)) direction = "down";
  if (pressedNow(GAMEPAD_BUTTON.left)) direction = "left";
  if (pressedNow(GAMEPAD_BUTTON.right)) direction = "right";
  if (Math.abs(move.y) > 0.72) {
    if (!direction && !gamepadState.stickNavY) direction = move.y > 0 ? "down" : "up";
    gamepadState.stickNavY = true;
  } else {
    gamepadState.stickNavY = false;
  }
  if (Math.abs(move.x) > 0.72) {
    if (!direction && !gamepadState.stickNavX) direction = move.x > 0 ? "right" : "left";
    gamepadState.stickNavX = true;
  } else {
    gamepadState.stickNavX = false;
  }
  if (direction) moveMenuFocus(direction);
}

function menuTargets(): HTMLElement[] {
  return focusItems().map((item) => item.element);
}

function setMenuFocus(index: number): void {
  if (!isFocusSurfaceVisible()) return;
  menuFocus.focus(index);
}

function moveMenuFocus(direction: MenuDirection): void {
  const items = focusItems();
  if (!items.length) return;
  if (adjustFocusedSetting(direction, items)) return;
  const current = currentFocusItem(items) ?? items[Math.min(gamepadState.menuIndex, items.length - 1)] ?? items[0];
  const next = direction === "left" || direction === "right"
    ? nearestHorizontalFocusItem(items, current, direction)
    : nearestVerticalFocusItem(items, current, direction);
  if (next) focusMenuElement(next.element);
}

function activateMenuFocus(): void {
  menuFocus.activate();
}

function clearControllerFocus(): void {
  menuFocus.clear();
}

function isMenuVisible(): boolean {
  return !ui.menu.classList.contains("hidden");
}

function isPauseVisible(): boolean {
  return state.paused && !ui.pauseOverlay?.classList.contains("hidden");
}

function isFocusSurfaceVisible(): boolean {
  return isMenuVisible() || isPauseVisible() || Boolean(state.levelChoice);
}

function focusItems(): FocusItem[] {
  const items = state.paused ? pauseFocusItems() : state.levelChoice ? levelChoiceFocusItems() : mainMenuFocusItems();
  return items.filter((item) => !item.disabled && isFocusElementAvailable(item.element));
}

function mainMenuFocusItems(): FocusItem[] {
  if (!isMenuVisible()) return [];
  const items: FocusItem[] = [];
  addFocusItem(items, ui.soloButton, "actions", 0, 0);
  addFocusItem(items, ui.onlineButton, "actions", 0, 1);
  addFocusItem(items, ui.loadoutConfigButton, "actions", 0, 2);
  Array.from(ui.classGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "classes", 1, index));
  if (state.loadoutPanelOpen) {
    Array.from(ui.loadoutWeaponGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "loadoutWeapons", 2, index));
    Array.from(ui.loadoutPassiveGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "loadoutPassives", 3, index));
  }
  const lobbyButtons = [
    ui.createRoomButton,
    ui.startRoomButton,
    ui.refreshRoomsButton,
    ...(ui.roomList?.querySelectorAll<HTMLElement>("button") ?? [])
  ];
  lobbyButtons.forEach((button, index) => addFocusItem(items, button, "lobby", index + 1, 8));
  return items;
}

function pauseFocusItems(): FocusItem[] {
  if (!isPauseVisible()) return [];
  const items: FocusItem[] = [];
  if (state.pausePanel === "settings") {
    [
      ui.mouseSensitivityInput,
      ui.stickSensitivityInput,
      ui.invertYToggle,
      ui.masterVolumeInput,
      ui.musicVolumeInput,
      ui.sfxVolumeInput,
      ui.muteToggle
    ].forEach((input, index) => addFocusItem(items, input, "settings", index, 0));
    return items;
  }
  if (state.pausePanel === "confirm") {
    addFocusItem(items, ui.pauseConfirmLeaveButton, "confirm", 0, 0);
    addFocusItem(items, ui.pauseConfirmCancelButton, "confirm", 0, 1);
    return items;
  }
  addFocusItem(items, ui.pauseResumeButton, "pause", 0, 0);
  addFocusItem(items, ui.pauseSettingsButton, "pause", 0, 1);
  addFocusItem(items, ui.pauseMainMenuButton, "pause", 0, 2);
  return items;
}

function levelChoiceFocusItems(): FocusItem[] {
  const items: FocusItem[] = [];
  Array.from(ui.levelChoiceGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "levelChoice", 0, index));
  addFocusItem(items, ui.levelChoiceRerollButton, "levelChoice", 1, 0);
  addFocusItem(items, ui.levelChoiceBanishButton, "levelChoice", 1, 1);
  return items;
}

function addFocusItem(
  items: FocusItem[],
  element: HTMLElement | null | undefined,
  zone: FocusItem["zone"],
  row: number,
  col: number,
  disabled = false
): void {
  if (!element) return;
  items.push({ element, zone, row, col, disabled });
}

function isFocusElementAvailable(element: HTMLElement | null | undefined): boolean {
  if (!element || !element.isConnected) return false;
  if ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement) && element.disabled) return false;
  if (element.closest?.(".hidden")) return false;
  const style = globalThis.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return (element.getClientRects?.().length ?? 0) > 0;
}

function currentFocusItem(items: FocusItem[]): FocusItem | null {
  const active = document.activeElement;
  const focused = active ? items.find((item) => item.element === active) : null;
  if (focused) return focused;
  const byClass = items.find((item) => item.element.classList.contains("controller-focus"));
  return byClass ?? null;
}

function focusMenuElement(element: HTMLElement): void {
  const targets = menuTargets();
  const index = targets.indexOf(element);
  if (index >= 0) menuFocus.focus(index);
}

function nearestHorizontalFocusItem(items: FocusItem[], current: FocusItem, direction: "left" | "right"): FocusItem | null {
  const sign = direction === "right" ? 1 : -1;
  const candidates = items
    .filter((item) => item.row === current.row && (item.col - current.col) * sign > 0)
    .sort((a, b) => Math.abs(a.col - current.col) - Math.abs(b.col - current.col));
  return candidates[0] ?? null;
}

function nearestVerticalFocusItem(items: FocusItem[], current: FocusItem, direction: "up" | "down"): FocusItem | null {
  const sign = direction === "down" ? 1 : -1;
  const rows = [...new Set(items.map((item) => item.row))]
    .filter((row) => (row - current.row) * sign > 0)
    .sort((a, b) => Math.abs(a - current.row) - Math.abs(b - current.row));
  for (const row of rows) {
    const candidates = items
      .filter((item) => item.row === row)
      .sort((a, b) => Math.abs(a.col - current.col) - Math.abs(b.col - current.col));
    if (candidates[0]) return candidates[0];
  }
  return null;
}

function adjustFocusedSetting(direction: MenuDirection, items: FocusItem[]): boolean {
  if (!state.paused || state.pausePanel !== "settings" || (direction !== "left" && direction !== "right")) return false;
  const current = currentFocusItem(items);
  const element = current?.element;
  if (!(element instanceof HTMLInputElement) || element.type !== "range") return false;
  const step = Number(element.step) || 0.05;
  const min = Number(element.min) || 0;
  const max = Number(element.max) || 1;
  const next = clamp((Number(element.value) || 0) + (direction === "right" ? step : -step), min, max);
  element.value = String(roundToStep(next, step));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function setInputMode(mode: ArenaGamepadState["inputMode"]): void {
  if (gamepadState.inputMode === mode) return;
  gamepadState.inputMode = mode;
  updateControlHint();
  if (mode === "keyboard") clearControllerFocus();
  if (mode === "controller" && isFocusSurfaceVisible()) setMenuFocus(gamepadState.menuIndex);
}

function updateControllerStatus(): void {
  if (!ui.controllerStatus) return;
  if (!gamepadState.connected) {
    ui.controllerStatus.textContent = "Controller line idle. Connect a pad any time.";
    return;
  }
  const label = /dualsense|dualshock|wireless controller|ps5/i.test(gamepadState.id) ? "PS5 controller" : "Controller";
  ui.controllerStatus.textContent = `${label} has the run.`;
}

function updateControlHint(): void {
  if (!ui.controlHint) return;
  ui.controlHint.textContent = state.paused
    ? "PS5: Cross select, Circle back, Start resume."
    : CONTROL_HINTS[gamepadState.inputMode] ?? CONTROL_HINTS.keyboard;
}

function updateControllerAim(x: number, z: number): void {
  if (!state.player) return;
  setAimWorld(state.player.x + x * CAMERA_AIM_DISTANCE, state.player.z + z * CAMERA_AIM_DISTANCE);
  syncReticleToAimWorld();
}

function resetCameraState(yaw = 0, pitch = CAMERA_DEFAULT_PITCH, distance = CAMERA_BASE_DISTANCE): void {
  desiredCameraYaw = yaw;
  desiredCameraPitch = clamp(pitch, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
  desiredCameraDistance = clamp(distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
  cameraYaw = desiredCameraYaw;
  cameraPitch = desiredCameraPitch;
  cameraDistance = desiredCameraDistance;
}

function resolveCameraOffset(): Three.Vector3 {
  const pitchCos = Math.cos(cameraPitch);
  return tempCameraOffset.set(
    Math.sin(cameraYaw) * pitchCos * cameraDistance,
    Math.sin(cameraPitch) * cameraDistance,
    Math.cos(cameraYaw) * pitchCos * cameraDistance
  );
}

function dampCameraRigState(dt: number): void {
  const rotationAmount = dampingAmount(dt, CAMERA_ROTATION_SMOOTHING_SECONDS);
  const distanceAmount = dampingAmount(dt, CAMERA_DISTANCE_SMOOTHING_SECONDS);
  cameraYaw += shortestAngleDelta(cameraYaw, desiredCameraYaw) * rotationAmount;
  cameraPitch += (desiredCameraPitch - cameraPitch) * rotationAmount;
  cameraDistance += (desiredCameraDistance - cameraDistance) * distanceAmount;
}

function dampingAmount(dt: number, smoothingSeconds: number): number {
  if (smoothingSeconds <= 0) return 1;
  return 1 - Math.exp(-dt / smoothingSeconds);
}

function shortestAngleDelta(from: number, to: number): number {
  return ((((to - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function readCameraRigSnapshot(): CameraRigSnapshot | null {
  if (!cameraRig) return null;
  cameraRig.getDesiredPosition(tempCameraDesired);
  return {
    lookAt: [tempCameraTarget.x, tempCameraTarget.y + CAMERA_LOOK_AT_HEIGHT, tempCameraTarget.z],
    desiredPosition: [tempCameraDesired.x, tempCameraDesired.y, tempCameraDesired.z],
    position: [camera.position.x, camera.position.y, camera.position.z],
    yaw: cameraYaw,
    pitch: cameraPitch,
    distance: cameraDistance,
    blocked: cameraBlocked
  };
}

function orbitCameraFromMouse(event: PointerEvent): void {
  if (!cameraRig) return;
  const sensitivity = state.settings.mouseSensitivity;
  const pitchSign = state.settings.invertY ? -1 : 1;
  const yawDelta = -(event.movementX ?? 0) * CAMERA_MOUSE_YAW_SPEED * sensitivity;
  const pitchDelta = (event.movementY ?? 0) * CAMERA_MOUSE_PITCH_SPEED * sensitivity * pitchSign;
  desiredCameraYaw += yawDelta;
  desiredCameraPitch = clamp(desiredCameraPitch + pitchDelta, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
}

async function loadNetworkModule(): Promise<void> {
  try {
    networkModule = lobbyNetwork;
    ui.onlineButton.disabled = false;
    ui.lobbyStatus.textContent = "Lobby bell ready. Start the server, then call a room.";
  } catch {
    ui.lobbyStatus.textContent = "Lobby bell missing. Solo gate is open.";
  }
}

async function connectLobby(): Promise<void> {
  if (!networkModule?.connectLobby) return toast("Lobby bell missing. Solo gate is open.");
  try {
    ui.onlineButton.disabled = true;
    lobbyRoomStatus = null;
    if (ui.startRoomButton) ui.startRoomButton.disabled = true;
    networkClient = await networkModule.connectLobby({ url: defaultWsUrl(), name: ui.playerName.value.trim() || "Hunter" });
    networkClient.onLobby?.(handleLobbyMessage);
    networkClient.onState?.(applyNetworkSnapshot);
    ui.createRoomButton.disabled = false;
    if (ui.startRoomButton) ui.startRoomButton.disabled = true;
    ui.refreshRoomsButton.disabled = false;
    ui.lobbyStatus.textContent = "Lobby bell answered. Create or join a room.";
  } catch (error) {
    ui.onlineButton.disabled = false;
    ui.lobbyStatus.textContent = `Lobby call failed: ${bootErrorLabel(error)}`;
  }
}

function handleLobbyMessage(message: Record<string, unknown>): void {
  if (message?.type === "disconnect") {
    state.online = false;
    lobbyRoomStatus = null;
    if (ui.startRoomButton) ui.startRoomButton.disabled = true;
    clearRemotePlayers();
  }
  if (message?.type === "joined") {
    lobbyRoomStatus = message;
    updateStartRoomButton();
    ui.lobbyStatus.textContent = message.hostId === networkClient?.playerId
      ? `Hosting ${message.roomId ?? "room"}. Wait for friends, then start the lobby game.`
      : `Joined ${message.roomId ?? "room"}. Waiting for the host to start.`;
    toast(`Joined ${message.roomId ?? "room"}.`);
  }
  if (message?.type === "room_status") {
    lobbyRoomStatus = message;
    updateStartRoomButton();
    if (!state.running) {
      const players = Number(message.players ?? 0);
      ui.lobbyStatus.textContent = message.status === "running"
        ? `${message.roomId ?? "Room"} already started. Joining run...`
        : `${message.roomId ?? "Room"} waiting: ${players} player${players === 1 ? "" : "s"}.`;
    }
  }
  if (message?.type === "room_started") {
    lobbyRoomStatus = { ...(lobbyRoomStatus ?? {}), ...message, status: "running" };
    updateStartRoomButton();
    if (!state.running || !state.online) {
      startGame(true, message);
      toast(`Started ${message.roomId ?? "room"}. Hold near your allies.`);
    }
  }
  if (Array.isArray(message.rooms)) renderRoomList(message.rooms.filter(isRecord));
}

function updateStartRoomButton(): void {
  if (!ui.startRoomButton) return;
  const host = lobbyRoomStatus?.hostId === networkClient?.playerId;
  const waiting = lobbyRoomStatus?.status !== "running" && Boolean(lobbyRoomStatus?.roomId ?? networkClient?.roomId);
  ui.startRoomButton.disabled = !(host && waiting);
}

function renderRoomList(rooms: Array<Record<string, unknown>>): void {
  ui.roomList.textContent = "";
  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.className = "small";
    empty.textContent = "No rooms on the bell yet.";
    ui.roomList.append(empty);
    setMenuFocus(gamepadState.menuIndex);
    return;
  }
  for (const room of rooms) {
    const roomId = typeof room.id === "string" ? room.id : null;
    if (!roomId) continue;
    const row = document.createElement("div");
    row.className = "room-row";
    const label = document.createElement("span");
    const status = room.status === "running" ? "running" : "waiting";
    label.textContent = `${typeof room.name === "string" ? room.name : roomId} (${Number(room.players ?? 0)}) ${status}`;
    const join = document.createElement("button");
    join.textContent = room.status === "running" ? "Join Run" : "Join Lobby";
    join.addEventListener("click", () => networkClient?.joinRoom?.(roomId));
    row.append(label, join);
    ui.roomList.append(row);
  }
  setMenuFocus(gamepadState.menuIndex);
}

function bindSettingsControls(): void {
  const bindings: Array<[HTMLInputElement | null | undefined, SettingKey]> = [
    [ui.mouseSensitivityInput, "mouseSensitivity"],
    [ui.stickSensitivityInput, "stickSensitivity"],
    [ui.invertYToggle, "invertY"],
    [ui.masterVolumeInput, "masterVolume"],
    [ui.musicVolumeInput, "musicVolume"],
    [ui.sfxVolumeInput, "sfxVolume"],
    [ui.muteToggle, "muted"]
  ];
  for (const [input, key] of bindings) {
    if (!input) continue;
    const eventName = input.type === "checkbox" ? "change" : "input";
    input.addEventListener(eventName, () => updateSettingFromControl(key, input));
  }
  renderSettingsControls();
  applyAudioSettings();
  saveSettings();
}

function isNumericSettingKey(key: SettingKey): key is NumericSettingKey {
  return key !== "invertY" && key !== "muted";
}

function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key);
}

function updateSettingFromControl(key: SettingKey, input: HTMLInputElement): void {
  if (input.type === "checkbox" && (key === "invertY" || key === "muted")) {
    state.settings[key] = Boolean(input.checked);
  } else if (isNumericSettingKey(key)) {
    const [min, max] = settingRange(key);
    state.settings[key] = clamp(Number(input.value), min, max);
  }
  renderSettingsControls();
  applyAudioSettings();
  saveSettings();
}

function settingRange(key: NumericSettingKey): [number, number] {
  if (key === "mouseSensitivity" || key === "stickSensitivity") return [0.5, 2];
  return [0, 1];
}

function renderSettingsControls(): void {
  setSettingsInput(ui.mouseSensitivityInput, state.settings.mouseSensitivity);
  setSettingsInput(ui.stickSensitivityInput, state.settings.stickSensitivity);
  setSettingsInput(ui.masterVolumeInput, state.settings.masterVolume);
  setSettingsInput(ui.musicVolumeInput, state.settings.musicVolume);
  setSettingsInput(ui.sfxVolumeInput, state.settings.sfxVolume);
  setSettingsToggle(ui.invertYToggle, state.settings.invertY);
  setSettingsToggle(ui.muteToggle, state.settings.muted);
  document.querySelectorAll<HTMLElement>("[data-setting-value]").forEach((output) => {
    const key = output.getAttribute("data-setting-value");
    output.textContent = settingReadback(key);
  });
}

function setSettingsInput(input: HTMLInputElement | null | undefined, value: number): void {
  if (!input) return;
  input.value = String(value);
}

function setSettingsToggle(input: HTMLInputElement | null | undefined, value: boolean): void {
  if (!input) return;
  input.checked = Boolean(value);
}

function settingReadback(key: string | null): string {
  if (key === "invertY") return state.settings.invertY ? "On" : "Off";
  if (key === "muted") return state.settings.muted ? "On" : "Off";
  if (!key || !(key in state.settings)) return "";
  const settingKey: SettingKey = key === "mouseSensitivity" || key === "stickSensitivity" || key === "invertY"
    || key === "masterVolume" || key === "musicVolume" || key === "sfxVolume" || key === "muted"
    ? key
    : "masterVolume";
  const value = Number(state.settings[settingKey]);
  return Number.isFinite(value) ? value.toFixed(2) : "1.00";
}

function openPauseMenu(): void {
  if (!state.running || state.paused) return;
  state.running = false;
  state.paused = true;
  state.pausePanel = "root";
  document.exitPointerLock?.();
  ui.menu?.classList.add("hidden");
  document.body.classList.add("pause-open", "run-active");
  document.body.classList.remove("menu-open");
  clearControllerFocus();
  renderPauseUi();
  focusPauseElement(ui.pauseResumeButton);
}

function resumeRunFromPause(): void {
  if (!state.paused) return;
  state.paused = false;
  state.running = true;
  state.pausePanel = "root";
  document.body.classList.remove("pause-open", "menu-open");
  document.body.classList.add("run-active");
  renderPauseUi();
  clearControllerFocus();
  requestRunPointerLock();
}

function openPauseSettings(): void {
  if (!state.paused) return;
  state.pausePanel = "settings";
  renderPauseUi();
  focusPauseElement(ui.mouseSensitivityInput);
}

function closePauseSettings(): void {
  if (!state.paused || state.pausePanel !== "settings") return;
  state.pausePanel = "root";
  renderPauseUi();
  focusPauseElement(ui.pauseSettingsButton);
}

function openPauseConfirm(): void {
  if (!state.paused) return;
  state.pausePanel = "confirm";
  renderPauseUi();
  focusPauseElement(ui.pauseConfirmCancelButton);
}

function closePauseConfirm(): void {
  if (!state.paused || state.pausePanel !== "confirm") return;
  state.pausePanel = "root";
  renderPauseUi();
  focusPauseElement(ui.pauseMainMenuButton);
}

function returnToMainMenuFromPause(): void {
  if (!state.paused || state.pausePanel !== "confirm") return;
  state.running = false;
  state.paused = false;
  state.pausePanel = "root";
  document.exitPointerLock?.();
  ui.menu?.classList.remove("hidden");
  if (ui.soloButton) ui.soloButton.textContent = "Singleplayer";
  document.body.classList.add("menu-open");
  document.body.classList.remove("run-active", "pause-open");
  renderPauseUi();
  clearControllerFocus();
  focusPauseElement(ui.soloButton);
  toast("Run abandoned at the gate.");
}

function renderPauseUi(): void {
  const open = state.paused;
  ui.pauseOverlay?.classList.toggle("hidden", !open);
  ui.pauseRootPanel?.classList.toggle("hidden", !open || state.pausePanel !== "root");
  ui.pauseSettingsPanel?.classList.toggle("hidden", !open || state.pausePanel !== "settings");
  ui.pauseConfirmDialog?.classList.toggle("hidden", !open || state.pausePanel !== "confirm");
  if (open) renderSettingsControls();
  updateControlHint();
}

function focusPauseElement(element: HTMLElement | null | undefined): void {
  if (!element) return;
  focusMenuElement(element);
  if (gamepadState.inputMode !== "controller") element.focus?.({ preventScroll: true });
}

function waveCopyKey(wave: WaveDefinition | null | undefined): string {
  return String(wave?.id ?? wave?.name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function waveBannerSubtitle(wave: WaveDefinition | null | undefined): string {
  const key = waveCopyKey(wave);
  if (WAVE_BANNER_SUBTITLES[key]) return WAVE_BANNER_SUBTITLES[key];
  if (wave?.eliteId && data.enemies?.[wave.eliteId]?.name) return `${data.enemies[wave.eliteId].name} signs spotted. Watch the floor.`;
  return "The yard changed shape. Keep one lane open.";
}

function normalizeRunSeed(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric >>> 0;
  const text = String(value ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function resetRunRandom(seed = state.runSeed): void {
  state.runRandomState = normalizeRunSeed(seed) || 0x6d2b79f5;
}

function runRandom(): number {
  state.runRandomState = (state.runRandomState + 0x6d2b79f5) >>> 0;
  let value = state.runRandomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function startGame(online: boolean, options: Record<string, unknown> = {}): void {
  state.runSeed = online ? normalizeRunSeed(options.seed ?? options.roomId ?? networkClient?.roomId ?? Date.now()) : normalizeRunSeed(crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`);
  resetRun();
  state.online = online;
  state.running = true;
  state.paused = false;
  state.pausePanel = "root";
  ui.modeText.textContent = online ? "Lobby" : "Solo";
  ui.menu.classList.add("hidden");
  renderPauseUi();
  document.body.classList.remove("menu-open", "pause-open");
  document.body.classList.add("run-active");
  ensureAudio();
  playSynthCue("start");
  showCenterBanner(selectedClass()?.name ?? "Graveyard Wake", "Take shards fast. Spend the next cache.");
  toast(online ? "Room entered. Stay near your allies." : `${selectedClass()?.name ?? "Class"} entered the yard.`);
  clearControllerFocus();
  requestRunPointerLock();
  resetTelemetrySamples();
}

function requestRunPointerLock(): void {
  try {
    const request = renderer?.domElement?.requestPointerLock?.();
    request?.catch?.(() => {});
  } catch {
    // Pointer lock can throw synchronously in headless or embedded documents.
  }
}

function pauseToMenu(): void {
  state.running = false;
  state.paused = false;
  state.pausePanel = "root";
  document.exitPointerLock?.();
  renderPauseUi();
  ui.menu.classList.remove("hidden");
  document.body.classList.add("menu-open");
  document.body.classList.remove("run-active", "pause-open");
  setMenuFocus(gamepadState.menuIndex);
}

function resetRun(): void {
  const player = state.player;
  if (!player) throw new Error("Cannot reset the run before the player is initialized.");
  resetRunRandom();
  clearList(state.enemies);
  resetEnemyBillboardBatches();
  commitEnemyBillboardBatches();
  markEnemySpatialDirty();
  clearList(state.bullets);
  clearList(state.weaponZones);
  clearList(state.pickups);
  resetPickupBatches();
  commitPickupBatches();
  clearList(state.effects);
  clearBatchedParticles();
  clearList(state.attackIndicators);
  if (state.currentWeaponVisual?.mesh) scene.remove(state.currentWeaponVisual.mesh);
  state.currentWeaponVisual = null;
  for (const ragdoll of state.ragdolls) scene.remove(ragdoll.root);
  state.ragdolls.length = 0;
  state.time = 0;
  state.waveIndex = 0;
  state.spawnClock = 0;
  state.nextBossAt = BOSS_PACING.firstBossSecond;
  state.kills = 0;
  state.level = data.progression?.startLevel ?? 1;
  state.xp = 0;
  state.nextXp = xpForLevel(state.level);
  state.pendingLevelChoices = 0;
  state.levelChoice = null;
  state.classLevelNotice = null;
  state.levelChoiceRerolls = levelChoiceCharge(data.progression?.rerollsStart ?? 0);
  state.levelChoiceBanishes = levelChoiceCharge(data.progression?.banishesStart ?? 0);
  state.banishedLevelChoices.clear();
  state.resumeAfterLevelChoice = false;
  closeLevelChoice();
  applyClassLoadout();
  state.benchStress = null;
  player.name = ui.playerName.value.trim() || "Hunter";
  const start = getWorldCenter();
  player.x = start.x;
  player.z = start.z;
  applyProgressionStats({ fullHeal: true });
  player.jumpY = 0;
  player.jumpVelocityY = 0;
  player.jumpsUsed = 0;
  player.grounded = true;
  player.jumpTrailClock = 0;
  player.floatAssistUntil = 0;
  player.wallRunClock = 0;
  player.terrainSlope = 0;
  player.terrainBlocked = false;
  player.moveMomentumX = 0;
  player.moveMomentumZ = 0;
  player.momentumDustClock = 0;
  player.animationState = "idle";
  player.knockX = 0;
  player.knockZ = 0;
  player.invuln = 0;
  player.animLock = 0;
  for (const tool of state.traversalTools) tool.cooldown = 0;
  state.minimapClock = 0;
  state.hudClock = 0;
  state.staticWrapClock = 0;
  state.lastStaticWrapX = Number.POSITIVE_INFINITY;
  state.lastStaticWrapZ = Number.POSITIVE_INFINITY;
  state.combo = 0;
  state.comboTimer = 0;
  state.magnetPullUntil = 0;
  resetVisualIndicators();
  clearRemotePlayers();
  state.animationPlayCounts = {};
  state.lastAnimationPlay = null;
  clearFloatingTexts();
  updateComboReadout();
  lastWeaponHudKey = "";
  lastPassiveHudKey = "";
  setActorPosition(player, start.x, start.z);
  setActorOpacity(player, 1);
  playActorAnimation(player, "idle", 0.02);
  resetCameraState(0, CAMERA_DEFAULT_PITCH, CAMERA_BASE_DISTANCE);
  cameraRig?.setOffset(resolveCameraOffset().x, tempCameraOffset.y, tempCameraOffset.z);
  cameraRig?.setTarget(tempCameraTarget.set(start.x, CAMERA_TARGET_HEIGHT, start.z)).update(0);
  cameraRigSnapshot = readCameraRigSnapshot();
  pointer.manualAimUntil = 0;
  setAimFromCamera();
  resetLazyProps();
  updateGroundTilePatch(true);
  updateWrappedStaticVisuals(0, true);
  if (!PERF_FLAGS.benchWalkOnly) {
    spawnOpeningPack();
    spawnOpeningLoot();
  }
  updateMinimap(0, true);
  updateHud(0, true);
}

function spawnOpeningPack(): void {
  const wave = data.waves[0];
  if (!wave) return;
  const start = getWorldCenter();
  for (let i = 0; i < 8; i += 1) {
    spawnEnemy(weightedPick(wave.mix));
    const enemy = state.enemies[state.enemies.length - 1];
    if (!enemy) continue;
    const angle = (Math.PI * 2 * i) / 8 + 0.2;
    const radius = 18 + (i % 3) * 4;
    enemy.x = wrapWorld(start.x + Math.cos(angle) * radius);
    enemy.z = wrapWorld(start.z + Math.sin(angle) * radius);
    setActorPosition(enemy, enemy.x, enemy.z);
    setActorFacing(enemy, angleTo(enemy.x, enemy.z, start.x, start.z));
  }
}

function spawnOpeningLoot(): void {
  const start = getWorldCenter();
  spawnPickup("weapon", start.x + 5.5, start.z - 4.5);
  if (runRandom() < HEALTH_VIAL_DROP_MULTIPLIER) spawnPickup("heal", start.x - 6.5, start.z + 4.5);
  spawnPickup("xp", start.x + 3.5, start.z + 6);
  spawnPickup("xp", start.x - 4, start.z - 6);
}

let arenaFrameStartedAt = 0;
let arenaPreviousFrameStartedAt = 0;
let arenaUpdateWorkMs = 0;

const arenaFrameDriver = createFixedStepDriver({
  step: 1 / 60,
  maxFrame: 0.05,
  update(dt) {
    const startedAt = performance.now();
    if (state.running) updateGame(dt);
    arenaUpdateWorkMs += performance.now() - startedAt;
  },
  render(_alpha, timing) {
    const updateEnd = performance.now();
    updateCamera(timing.delta);
    measureTelemetryPhase("visualIndicators", () => updateVisualIndicators(timing.delta));
    measureTelemetryPhase("floatingTexts", () => updateFloatingTexts(timing.delta));
    const cameraEnd = performance.now();
    if (!state.running) continueOptionalModelUpgrade();
    threeView.render();
    const renderEnd = performance.now();
    recordTelemetry({
      frameMs: renderEnd - arenaFrameStartedAt,
      updateMs: arenaUpdateWorkMs,
      cameraMs: cameraEnd - updateEnd,
      renderMs: renderEnd - cameraEnd,
      dtMs: timing.delta * 1000,
      rawDtMs: timing.rawDelta * 1000,
      frameGapMs: arenaPreviousFrameStartedAt > 0
        ? arenaFrameStartedAt - arenaPreviousFrameStartedAt
        : timing.rawDelta * 1000,
    }, timing.delta);
  },
});

function tick(timeMilliseconds = performance.now()): void {
  arenaFrameStartedAt = performance.now();
  arenaPreviousFrameStartedAt = telemetry.lastFrameStart;
  telemetry.lastFrameStart = arenaFrameStartedAt;
  arenaUpdateWorkMs = 0;
  measureTelemetryPhase("pollGamepad", pollGamepad);
  arenaFrameDriver.advance(timeMilliseconds);
}

function updateGame(dt: number): void {
  state.time += dt;
  measureTelemetryPhase("wave", () => updateWave(dt));
  measureTelemetryPhase("player", () => updatePlayer(dt));
  measureTelemetryPhase("passive", () => updatePassiveEffects(dt));
  measureTelemetryPhase("weapons", () => updateWeapons(dt));
  measureTelemetryPhase("weaponZones", () => updateWeaponZones(dt));
  measureTelemetryPhase("enemies", () => updateEnemies(dt));
  measureTelemetryPhase("bullets", () => updateBullets(dt));
  measureTelemetryPhase("pickups", () => updatePickups(dt));
  measureTelemetryPhase("effects", () => updateEffects(dt));
  measureTelemetryPhase("ragdolls", () => updateRagdolls(dt));
  measureTelemetryPhase("bossAttacks", () => updateBossAttacks(dt));
  measureTelemetryPhase("attackIndicators", () => updateAttackIndicators(dt));
  measureTelemetryPhase("hazards", () => updateHazards(dt));
  measureTelemetryPhase("network", () => updateNetwork(dt));
  measureTelemetryPhase("combo", () => updateCombo(dt));
  measureTelemetryPhase("audio", () => updateAudio());
  measureTelemetryPhase("hud", () => updateHud(dt));
  measureTelemetryPhase("minimap", () => updateMinimap(dt));
}

function updateWave(dt: number): void {
  const player = state.player;
  if (PERF_FLAGS.benchWalkOnly || !player || !data.waves.length) return;
  let next = state.waveIndex;
  for (let i = data.waves.length - 1; i >= 0; i -= 1) {
    const candidate = data.waves[i];
    if (candidate && state.time >= candidate.at) {
      next = i;
      break;
    }
  }
  if (next !== state.waveIndex) {
    state.waveIndex = next;
    const nextWave = data.waves[next];
    if (!nextWave) return;
    toast(nextWave.name);
    showCenterBanner(nextWave.name, waveBannerSubtitle(nextWave));
    pulseOverlay("level");
    playSynthCue("wave");
    spawnPulseRing(player.x, player.z, "#d8ff8d", 0.52, 1.4, 5.4);
    pulseShake(0.5, 0.45);
  }
  if (state.benchStress) return;
  const wave = data.waves[state.waveIndex];
  if (!wave) return;
  updateBossSpawns(wave);
  state.spawnClock -= dt;
  const ramp = Math.min(1, state.time / SPAWN_PACING.rampSeconds);
  const curseMultiplier = Math.max(0.25, (state.progressionStats ?? resolveProgressionStats()).curseMultiplier ?? 1);
  const spawnMultiplier = (SPAWN_PACING.minRateMultiplier + (SPAWN_PACING.maxRateMultiplier - SPAWN_PACING.minRateMultiplier) * ramp) * curseMultiplier;
  const activeCap = Math.min(
    SPAWN_PACING.hardActiveEnemyCap,
    Math.round(wave.cap * (1 + (SPAWN_PACING.activeCapMultiplierAtMax - 1) * ramp) * curseMultiplier)
  );
  if (state.enemies.length < activeCap && state.spawnClock <= 0) {
    state.spawnClock = Math.max(SPAWN_PACING.minSpawnIntervalSeconds, wave.rate / spawnMultiplier);
    measureTelemetryPhase("enemySpawn", () => spawnEnemy(weightedPick(wave.mix)));
  }
}

function updateBossSpawns(wave: WaveDefinition): void {
  while (state.time >= state.nextBossAt) {
    const activeBosses = state.enemies.filter((enemy) => enemy.boss).length;
    if (activeBosses < BOSS_PACING.maxActiveBosses) {
      const boss = spawnEnemy(resolveBossType(wave), { boss: true });
      showCenterBanner("Boss Bell", `${data.enemies[boss.typeId]?.name ?? "Elite undead"} crossed the fence.`);
      pulseOverlay("danger");
      playSynthCue("boss");
      spawnPulseRing(boss.x, boss.z, "#ff5d4d", 0.72, 2.4, 6.8);
    }
    state.nextBossAt += BOSS_PACING.intervalSeconds;
  }
}

function resolveBossType(wave: WaveDefinition): string {
  if (wave.eliteId && data.enemies[wave.eliteId]) return wave.eliteId;
  let bestId = wave.mix[0]?.[0] ?? Object.keys(data.enemies)[0] ?? "";
  let bestHp = 0;
  for (const [id] of wave.mix) {
    const hp = data.enemies[id]?.hp ?? 0;
    if (hp > bestHp) {
      bestHp = hp;
      bestId = id;
    }
  }
  return bestId;
}

function updatePlayer(dt: number): void {
  const player = state.player;
  if (!player) return;
  let dx = 0;
  let dz = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) dz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) dz += 1;
  if (gamepadState.moveActive) {
    dx += gamepadState.moveX;
    dz += gamepadState.moveZ;
  }
  const length = Math.hypot(dx, dz);
  let desiredVx = 0;
  let desiredVz = 0;
  if (length > 0.0001) {
    const yaw = cameraRigSnapshot?.yaw ?? cameraYaw;
    const strafe = dx / length;
    const forward = -dz / length;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    desiredVx = (rightX * strafe + forwardX * forward) * player.speed;
    desiredVz = (rightZ * strafe + forwardZ * forward) * player.speed;
  }
  updatePlayerMomentum(player, desiredVx, desiredVz, length > 0.0001, dt);
  const terrainBeforeX = player.x;
  const terrainBeforeZ = player.z;
  const terrainBeforeFeetY = actorFeetY(player);
  player.x += (player.moveMomentumX ?? 0) * dt;
  player.z += (player.moveMomentumZ ?? 0) * dt;
  player.x += (player.knockX ?? 0) * dt;
  player.z += (player.knockZ ?? 0) * dt;
  const playerKnockDamping = Math.max(0, 1 - PLAYER_KNOCKBACK_DECAY * dt);
  player.knockX = Math.abs(player.knockX ?? 0) < PLAYER_KNOCKBACK_STOP_SPEED ? 0 : (player.knockX ?? 0) * playerKnockDamping;
  player.knockZ = Math.abs(player.knockZ ?? 0) < PLAYER_KNOCKBACK_STOP_SPEED ? 0 : (player.knockZ ?? 0) * playerKnockDamping;
  wrapEntity(player);
  resolvePlayerTerrainMotion(player, terrainBeforeX, terrainBeforeZ, terrainBeforeFeetY, dt);
  const collisionBeforeX = player.x;
  const collisionBeforeZ = player.z;
  const collisionBeforeFeetY = actorFeetY(player);
  resolvePropCollisions(player);
  resolvePlayerTerrainMotion(player, collisionBeforeX, collisionBeforeZ, collisionBeforeFeetY, dt, { collisionStep: true });
  updateTraversalTools(dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.animLock = Math.max(0, (player.animLock ?? 0) - dt);
  player.wallRunClock = Math.max(0, (player.wallRunClock ?? 0) - dt);
  updatePlayerJumpPhysics(player, dt);
  if (player.regenPerSecond > 0 && player.hp > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.regenPerSecond * dt);
  }
  const moving = Math.hypot(player.moveMomentumX ?? 0, player.moveMomentumZ ?? 0) > player.speed * 0.08;
  setActorPosition(player, player.x, player.z);
  updatePlayerFacing(dt);
  updatePlayerAnimationState(player, dt, moving);
  const flash = player.invuln > 0 ? 0.5 + Math.sin(state.time * 42) * 0.5 : 0;
  setActorOpacity(player, player.invuln > 0 ? 0.56 + flash * 0.34 : 1);
  setActorDamageFlash(player, flash);
  updatePlayerWeaponVisual();
}

function resolvePlayerTerrainMotion(
  player: Player,
  beforeX: number,
  beforeZ: number,
  beforeFeetY: number,
  dt: number,
  options: { collisionStep?: boolean } = {}
): void {
  const gradient = terrainGradientAt(player.x, player.z);
  player.terrainSlope = gradient.ratio;
  player.terrainBlocked = false;
  const moved = worldDeltaInto(tempWorldDelta, beforeX, beforeZ, player.x, player.z);
  const distance = Math.hypot(moved.dx, moved.dz);
  if (distance <= 0.0001) {
    if (player.grounded && gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO) slideActorDownSlope(player, gradient, dt);
    return;
  }

  const beforeGround = terrainHeightAt(beforeX, beforeZ);
  const afterGround = terrainHeightAt(player.x, player.z);
  const heightDelta = afterGround - beforeGround;
  const pathSlope = heightDelta / distance;
  const dirX = moved.dx / distance;
  const dirZ = moved.dz / distance;
  const hasGradient = gradient.ratio > 0.001;
  const uphillX = hasGradient ? gradient.x / gradient.ratio : dirX;
  const uphillZ = hasGradient ? gradient.z / gradient.ratio : dirZ;
  const uphillMotion = dirX * uphillX + dirZ * uphillZ;
  const tooSteep = gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO && uphillMotion > 0.04;

  if (!player.grounded) {
    const feetToGround = beforeFeetY - afterGround;
    const clearedLandingTop = feetToGround >= -TERRAIN_PLATFORM_LAND_SNAP;
    player.jumpY = Math.max(0, feetToGround);
    if (tooSteep && !clearedLandingTop && (player.jumpVelocityY > 0.2 || (player.jumpY ?? 0) > 0.55)) {
      transferVerticalMomentumIntoWallRun(player, beforeX, beforeZ, moved, distance, uphillX, uphillZ, dt);
      player.jumpY = Math.max(0, beforeFeetY - terrainHeightAt(player.x, player.z));
    }
    return;
  }

  if (tooSteep) {
    player.terrainBlocked = true;
    killUphillMomentum(player, uphillX, uphillZ);
    const lateralX = moved.dx - uphillX * Math.max(0, moved.dx * uphillX + moved.dz * uphillZ);
    const lateralZ = moved.dz - uphillZ * Math.max(0, moved.dx * uphillX + moved.dz * uphillZ);
    const slideStep = clamp(
      (player.speed ?? 8) * dt * 0.48 + (gradient.ratio - TERRAIN_WALKABLE_SLOPE_RATIO) * TERRAIN_SLIDE_ACCELERATION * dt * 0.08,
      0.035,
      Math.max(0.18, distance * 0.92)
    );
    player.x = wrapWorld(beforeX + lateralX * 0.72 - uphillX * slideStep);
    player.z = wrapWorld(beforeZ + lateralZ * 0.72 - uphillZ * slideStep);
    player.jumpY = 0;
    player.jumpVelocityY = Math.min(0, player.jumpVelocityY ?? 0);
    spawnSlopeDust(player, dt, "#9f8d72");
    return;
  }

  if (heightDelta <= -TERRAIN_DROP_AIR_HEIGHT) {
    player.grounded = false;
    player.jumpY = Math.max(0.04, beforeFeetY - afterGround);
    player.jumpVelocityY = Math.min(player.jumpVelocityY ?? 0, -0.35);
    return;
  }

  if (pathSlope > 0.015 && !options.collisionStep) {
    const loss = clamp(pathSlope * TERRAIN_UPHILL_POSITION_LOSS, 0, 0.42);
    player.x = wrapWorld(beforeX + moved.dx * (1 - loss));
    player.z = wrapWorld(beforeZ + moved.dz * (1 - loss));
    const uphillVelocity = (player.moveMomentumX ?? 0) * dirX + (player.moveMomentumZ ?? 0) * dirZ;
    if (uphillVelocity > 0) {
      player.moveMomentumX -= dirX * uphillVelocity * loss;
      player.moveMomentumZ -= dirZ * uphillVelocity * loss;
    }
  } else if (pathSlope < -0.015 && !options.collisionStep) {
    const boost = clamp(-pathSlope, 0, 1) * TERRAIN_DOWNHILL_ACCELERATION * dt;
    player.moveMomentumX = (player.moveMomentumX ?? 0) + dirX * boost;
    player.moveMomentumZ = (player.moveMomentumZ ?? 0) + dirZ * boost;
    capActorHorizontalSpeed(player, playerMomentumMaxSpeed(player) * 1.42);
  }

  player.jumpY = 0;
  player.jumpVelocityY = Math.max(0, player.jumpVelocityY ?? 0) * 0.14;
  player.grounded = true;
}

function transferVerticalMomentumIntoWallRun(
  player: Player,
  beforeX: number,
  beforeZ: number,
  moved: WorldDelta,
  distance: number,
  uphillX: number,
  uphillZ: number,
  dt: number
): void {
  const tangentA = { x: -uphillZ, z: uphillX };
  const tangentB = { x: uphillZ, z: -uphillX };
  const velocityX = (player.moveMomentumX ?? 0) + (player.knockX ?? 0);
  const velocityZ = (player.moveMomentumZ ?? 0) + (player.knockZ ?? 0);
  const sign = velocityX * tangentA.x + velocityZ * tangentA.z >= velocityX * tangentB.x + velocityZ * tangentB.z ? 1 : -1;
  const tangentX = sign > 0 ? tangentA.x : tangentB.x;
  const tangentZ = sign > 0 ? tangentA.z : tangentB.z;
  const vertical = Math.max(0, player.jumpVelocityY ?? 0);
  const transfer = Math.max(2.2, vertical * TERRAIN_WALL_RUN_TRANSFER + Math.min(5, (player.jumpY ?? 0) * 0.36));
  killUphillMomentum(player, uphillX, uphillZ);
  player.moveMomentumX = (player.moveMomentumX ?? 0) + tangentX * transfer;
  player.moveMomentumZ = (player.moveMomentumZ ?? 0) + tangentZ * transfer;
  capActorHorizontalSpeed(player, playerMomentumMaxSpeed(player) * 1.65);
  player.jumpVelocityY = Math.min(player.jumpVelocityY ?? 0, vertical * 0.42);
  player.wallRunClock = TERRAIN_WALL_RUN_SECONDS;
  player.terrainBlocked = true;
  const wallRunStep = Math.min(distance * 1.12, Math.max(0.18, (player.speed ?? 8) * dt * 1.18));
  player.x = wrapWorld(beforeX + tangentX * wallRunStep - uphillX * 0.05);
  player.z = wrapWorld(beforeZ + tangentZ * wallRunStep - uphillZ * 0.05);
  spawnEffect("airTrail", player.x, player.z, 0.28, {
    particles: 4,
    color: "#bff7ff",
    y: 1.1 + Math.min(4, player.jumpY ?? 0),
    speed: 1.4,
    size: 0.16
  });
}

function slideActorDownSlope(actor: WorldActor, gradient: TerrainGradient, dt: number): void {
  if (!actor || gradient.ratio <= 0.001) return;
  const downhillX = -gradient.x / gradient.ratio;
  const downhillZ = -gradient.z / gradient.ratio;
  const slide = clamp((actor.speed ?? 6) * dt * 0.36 + gradient.ratio * TERRAIN_SLIDE_ACCELERATION * dt * 0.035, 0.025, 0.42);
  actor.x = wrapWorld((actor.x ?? 0) + downhillX * slide);
  actor.z = wrapWorld((actor.z ?? 0) + downhillZ * slide);
  if (actor !== state.player) actor.groundY = terrainHeightAt(actor.x, actor.z);
  actor.moveMomentumX = (actor.moveMomentumX ?? 0) + downhillX * TERRAIN_SLIDE_ACCELERATION * dt * 0.18;
  actor.moveMomentumZ = (actor.moveMomentumZ ?? 0) + downhillZ * TERRAIN_SLIDE_ACCELERATION * dt * 0.18;
  if (actor === state.player) actor.terrainBlocked = true;
}

function killUphillMomentum(actor: WorldActor, uphillX: number, uphillZ: number): void {
  const momentum = (actor.moveMomentumX ?? 0) * uphillX + (actor.moveMomentumZ ?? 0) * uphillZ;
  if (momentum > 0) {
    actor.moveMomentumX = (actor.moveMomentumX ?? 0) - uphillX * momentum;
    actor.moveMomentumZ = (actor.moveMomentumZ ?? 0) - uphillZ * momentum;
  }
  const knock = (actor.knockX ?? 0) * uphillX + (actor.knockZ ?? 0) * uphillZ;
  if (knock > 0) {
    actor.knockX -= uphillX * knock;
    actor.knockZ -= uphillZ * knock;
  }
}

function capActorHorizontalSpeed(actor: WorldActor, maxSpeed: number): void {
  const speed = Math.hypot(actor.moveMomentumX ?? 0, actor.moveMomentumZ ?? 0);
  if (speed <= maxSpeed || speed <= 0.001) return;
  const scale = maxSpeed / speed;
  actor.moveMomentumX = (actor.moveMomentumX ?? 0) * scale;
  actor.moveMomentumZ = (actor.moveMomentumZ ?? 0) * scale;
}

function spawnSlopeDust(actor: WorldActor, dt: number, color: Three.ColorRepresentation = "#b9a879"): void {
  actor.slopeDustClock = Math.max(0, (actor.slopeDustClock ?? 0) - dt);
  if (actor.slopeDustClock > 0) return;
  actor.slopeDustClock = 0.18;
  spawnEffect("jumpDust", actor.x, actor.z, 0.22, {
    particles: 5,
    color,
    y: 0.16,
    speed: 1.8,
    size: 0.15
  });
}

function resolveGroundActorTerrainMotion(actor: WorldActor, beforeX: number, beforeZ: number, dt: number): void {
  if (!actor) return;
  const moved = worldDeltaInto(tempWorldDelta, beforeX, beforeZ, actor.x, actor.z);
  const distance = Math.hypot(moved.dx, moved.dz);
  const gradient = terrainGradientAt(actor.x, actor.z);
  if (distance <= 0.0001) {
    if (gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO) slideActorDownSlope(actor, gradient, dt);
    return;
  }
  const dirX = moved.dx / distance;
  const dirZ = moved.dz / distance;
  const beforeGround = terrainHeightAt(beforeX, beforeZ);
  const afterGround = terrainHeightAt(actor.x, actor.z);
  actor.groundY = afterGround;
  const pathSlope = (afterGround - beforeGround) / distance;
  if (gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO) {
    const uphillX = gradient.x / gradient.ratio;
    const uphillZ = gradient.z / gradient.ratio;
    const uphillMotion = dirX * uphillX + dirZ * uphillZ;
    if (uphillMotion > 0.04) {
      killUphillMomentum(actor, uphillX, uphillZ);
      actor.x = wrapWorld(beforeX - uphillX * Math.min(0.2, (actor.speed ?? 5) * dt * 0.32));
      actor.z = wrapWorld(beforeZ - uphillZ * Math.min(0.2, (actor.speed ?? 5) * dt * 0.32));
      return;
    }
  }
  if (pathSlope < -0.02) {
    actor.x = wrapWorld(actor.x + dirX * Math.min(0.18, -pathSlope * dt * TERRAIN_DOWNHILL_ACCELERATION * 0.12));
    actor.z = wrapWorld(actor.z + dirZ * Math.min(0.18, -pathSlope * dt * TERRAIN_DOWNHILL_ACCELERATION * 0.12));
  } else if (pathSlope > 0.02) {
    const loss = clamp(pathSlope * 0.18, 0, 0.28);
    actor.x = wrapWorld(beforeX + moved.dx * (1 - loss));
    actor.z = wrapWorld(beforeZ + moved.dz * (1 - loss));
  }
}

function updatePlayerMomentum(player: Player, desiredVx: number, desiredVz: number, hasInput: boolean, dt: number): void {
  if (hasInput) {
    const merge = Math.min(1, dt / PLAYER_MOMENTUM_BUILD_SECONDS);
    player.moveMomentumX = (player.moveMomentumX ?? 0) + desiredVx * merge;
    player.moveMomentumZ = (player.moveMomentumZ ?? 0) + desiredVz * merge;
    capPlayerMomentum(player);
  } else {
    dampPlayerMomentum(player, dt);
  }
  updateMomentumDust(player, dt);
}

function playerMomentumMaxSpeed(player: Player): number {
  return Math.max(0.001, (player.speed ?? 0) * (1 + PLAYER_MOMENTUM_SPEED_BONUS_MULTIPLIER));
}

function capPlayerMomentum(player: Player): void {
  const maxSpeed = playerMomentumMaxSpeed(player);
  const speed = Math.hypot(player.moveMomentumX ?? 0, player.moveMomentumZ ?? 0);
  if (speed <= maxSpeed) return;
  const scale = maxSpeed / speed;
  player.moveMomentumX *= scale;
  player.moveMomentumZ *= scale;
}

function dampPlayerMomentum(player: Player, dt: number): void {
  const vx = player.moveMomentumX ?? 0;
  const vz = player.moveMomentumZ ?? 0;
  const speed = Math.hypot(vx, vz);
  if (speed <= 0.001) {
    player.moveMomentumX = 0;
    player.moveMomentumZ = 0;
    return;
  }
  const nextSpeed = Math.max(0, speed - (playerMomentumMaxSpeed(player) / PLAYER_MOMENTUM_DAMP_SECONDS) * dt);
  const scale = nextSpeed / speed;
  player.moveMomentumX = vx * scale;
  player.moveMomentumZ = vz * scale;
}

function updateMomentumDust(player: Player, dt: number): void {
  if (PERF_FLAGS.benchWalkOnly) return;
  const speed = Math.hypot(player.moveMomentumX ?? 0, player.moveMomentumZ ?? 0);
  if (!player.grounded || speed < (player.speed ?? 0) * PLAYER_MOMENTUM_DUST_THRESHOLD) {
    player.momentumDustClock = Math.min(player.momentumDustClock ?? 0, PLAYER_MOMENTUM_DUST_INTERVAL);
    return;
  }
  player.momentumDustClock = Math.max(0, (player.momentumDustClock ?? 0) - dt);
  if (player.momentumDustClock > 0) return;
  player.momentumDustClock = PLAYER_MOMENTUM_DUST_INTERVAL;
  const backX = speed > 0 ? -(player.moveMomentumX ?? 0) / speed : 0;
  const backZ = speed > 0 ? -(player.moveMomentumZ ?? 0) / speed : 0;
  spawnEffect("jumpDust", wrapWorld(player.x + backX * 0.5), wrapWorld(player.z + backZ * 0.5), 0.26, {
    particles: 9,
    color: "#d0b985",
    y: 0.16,
    speed: 2.05,
    size: 0.18
  });
}

function updatePlayerAnimationState(player: Player, dt: number, moving: boolean): void {
  if ((player.animLock ?? 0) <= 0) player.overlayAnimation = null;
  const desired = resolvePlayerAnimationState(player, moving);
  const locked = (player.animLock ?? 0) > 0;
  const preserveLocked = locked && shouldPreserveLockedPlayerAnimation(player.activeAnimation, player.grounded);
  if (player.overlayAnimation && locked) {
    player.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(player, desired);
  } else if (!player.grounded && desired === "fall" && !preserveLocked && player.activeAnimation !== "fall") {
    playActorAnimation(player, "fall", 0.12);
  } else if (player.activeAnimationSource === "procedural" && locked) {
    player.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(player, desired);
  } else if (!preserveLocked && player.activeAnimation !== desired) {
    playActorAnimation(player, desired, desired === "fall" ? 0.12 : 0.08);
  }
  player.animationState = player.overlayAnimation && locked ? desired : preserveLocked ? player.activeAnimation : desired;
  if (player.engineMotion) {
    syncPlayerEngineMotion(player, dt);
    return;
  }
  clearProceduralPoseOverlay(player.proceduralPose);
  player.animator?.update(dt);
  applyProceduralPose(player, dt, moving);
}

function syncPlayerEngineMotion(player: Player, dt: number): void {
  const motion = player.engineMotion;
  if (!motion) return;
  const rootY = actorFeetY(player);
  playerMotionPosition[0] = player.x;
  playerMotionPosition[1] = rootY;
  playerMotionPosition[2] = player.z;
  playerMotionResolvedDelta[0] = worldAxisDelta(player.engineMotionLastX, player.x);
  playerMotionResolvedDelta[1] = rootY - player.engineMotionLastY;
  playerMotionResolvedDelta[2] = worldAxisDelta(player.engineMotionLastZ, player.z);
  playerMotionDesiredVelocity[0] = player.moveMomentumX ?? 0;
  playerMotionDesiredVelocity[1] = 0;
  playerMotionDesiredVelocity[2] = player.moveMomentumZ ?? 0;
  const facingAngle = player.facingAngle ?? 0;
  playerMotionFacing[0] = Math.cos(facingAngle);
  playerMotionFacing[1] = 0;
  playerMotionFacing[2] = Math.sin(facingAngle);
  let aimX = worldAxisDelta(player.x, pointer.worldX);
  let aimZ = worldAxisDelta(player.z, pointer.worldZ);
  const aimLength = Math.hypot(aimX, aimZ);
  if (aimLength <= 1e-5) {
    aimX = playerMotionFacing[0];
    aimZ = playerMotionFacing[2];
  } else {
    aimX /= aimLength;
    aimZ /= aimLength;
  }
  const aimDistance = 8;
  playerMotionAimTarget[0] = player.x + aimX * aimDistance;
  playerMotionAimTarget[1] = rootY + player.engineMotionAimHeight;
  playerMotionAimTarget[2] = player.z + aimZ * aimDistance;
  const gradient = terrainGradientAt(player.x, player.z);
  playerMotionGroundNormal[0] = -gradient.x;
  playerMotionGroundNormal[1] = 1;
  playerMotionGroundNormal[2] = -gradient.z;
  motion.sync({
    position: playerMotionPosition,
    resolvedDelta: playerMotionResolvedDelta,
    desiredVelocity: playerMotionDesiredVelocity,
    facing: playerMotionFacing,
    aimTarget: playerMotionAimTarget,
    grounded: player.grounded,
    groundNormal: playerMotionGroundNormal
  }, dt);
  player.engineMotionLastX = player.x;
  player.engineMotionLastY = rootY;
  player.engineMotionLastZ = player.z;
  player.activeAnimationSource = "engine-motion";
  player.proceduralMode = "semantic";
}

function syncActorBaseAnimationState(actor: ActorAnimationState, desired: string): void {
  actor.activeAnimation = actor.animator?.current ?? desired;
  actor.activeAnimationSource = resolveAnimationSource(actor.activeAnimation) ?? actor.activeAnimationSource;
}

function resolvePlayerAnimationState(player: Player, moving: boolean): string {
  if (!player.grounded) {
    return player.activeAnimation === "jump" && (player.animLock ?? 0) > 0 ? "jump" : "fall";
  }
  return moving ? "run" : "idle";
}

function shouldPreserveLockedPlayerAnimation(name: string | null | undefined, grounded: boolean): boolean {
  if (!name) return false;
  if (!grounded) return name === "jump" || name === "hit" || name === "death";
  return ["shoot", "cast", "land", "hit", "death", "celebrate", "interact"].includes(name);
}

function playerJumpStats(): PlayerJumpStats {
  const stats = state.progressionStats ?? resolveProgressionStats();
  return {
    heightMultiplier: stats.jumpHeightMultiplier ?? 1,
    gravityMultiplier: stats.gravityMultiplier ?? 1,
    maxJumps: PLAYER_MAX_JUMPS + Math.max(0, Math.floor(stats.maxJumpsFlat ?? 0))
  };
}

function playerJumpVelocity(doubleJump = false): number {
  const stats = playerJumpStats();
  const base = doubleJump ? PLAYER_DOUBLE_JUMP_VELOCITY : PLAYER_JUMP_VELOCITY;
  return base * Math.sqrt(Math.max(0.05, stats.heightMultiplier * stats.gravityMultiplier));
}

function playerGravity(): number {
  return PLAYER_GRAVITY * playerJumpStats().gravityMultiplier;
}

function attemptPlayerJump(): void {
  const player = state.player;
  const jumpStats = playerJumpStats();
  if (!player || player.hp <= 0 || player.jumpsUsed >= jumpStats.maxJumps) return;
  const doubleJump = !player.grounded;
  player.jumpVelocityY = playerJumpVelocity(doubleJump);
  player.grounded = false;
  player.jumpsUsed += 1;
  player.animLock = doubleJump ? 0.5 : 0.42;
  playActorAnimation(player, "jump", 0.04);
  spawnPulseRing(player.x, player.z, doubleJump ? "#bff7ff" : "#d7ff8d", 0.28, doubleJump ? 1 : 0.72, doubleJump ? 3.8 : 2.7);
  if (doubleJump) spawnAirPuff(player, 7);
  else spawnJumpDustBurst(player, 13);
  playSynthCue("jump", doubleJump ? 1.1 : 0.9);
}

function updatePlayerJumpPhysics(player: Player, dt: number): void {
  const floatAssist = state.time < (player.floatAssistUntil ?? 0);
  const gravityScale = floatAssist ? 0.32 : 1;
  player.jumpVelocityY -= playerGravity() * gravityScale * dt;
  if (floatAssist && player.jumpVelocityY < -1.35) player.jumpVelocityY = -1.35;
  player.jumpY += player.jumpVelocityY * dt;
  if (player.jumpY > 0) {
    spawnAirborneTrail(player, dt);
    return;
  }
  const landed = !player.grounded;
  player.jumpY = 0;
  player.jumpVelocityY = 0;
  player.grounded = true;
  player.jumpsUsed = 0;
  player.jumpTrailClock = 0;
  if (landed) {
    player.animLock = Math.max(player.animLock ?? 0, 0.24);
    player.animationState = "land";
    playActorAnimation(player, "land", 0.035);
    spawnPulseRing(player.x, player.z, "#d7ff8d", 0.18, 0.52, 2.1);
    spawnJumpDustBurst(player, 12);
  }
}

function playerClearsGroundHits(): boolean {
  const player = state.player;
  if (!player) return false;
  const elevation = terrainHeightAt(player.x, player.z) + (player.jumpY ?? 0) - terrainBaseHeightAt(player.x, player.z);
  return elevation >= PLAYER_AIRBORNE_HIT_CLEARANCE;
}

function spawnJumpDustBurst(player: Player, particles = 12): void {
  spawnEffect("jumpDust", player.x, player.z, 0.42, {
    particles,
    color: "#b9a879",
    y: 0.18,
    speed: 2.7,
    size: 0.22
  });
}

function spawnAirPuff(player: Player, particles = 6): void {
  spawnEffect("airTrail", player.x, player.z, 0.34, {
    particles,
    color: "#d8d1b4",
    y: 0.72 + player.jumpY * 0.72,
    speed: 1,
    size: 0.16
  });
}

function spawnAirborneTrail(player: Player, dt: number): void {
  player.jumpTrailClock = Math.max(0, (player.jumpTrailClock ?? 0) - dt);
  if (player.jumpTrailClock > 0) return;
  player.jumpTrailClock = PLAYER_AIR_TRAIL_INTERVAL;
  spawnAirPuff(player, 1);
}

function updateWeapons(dt: number): void {
  if (PERF_FLAGS.benchWalkOnly || state.benchStress?.quietCombat) return;
  const origin = state.player;
  if (!origin) return;
  for (const weaponId of state.weaponSlots) {
    const weapon = getWeaponRuntime(weaponId);
    if (!weapon) continue;
    const remaining = (state.weaponCooldowns.get(weaponId) ?? 0) - dt;
    if (remaining > 0) {
      state.weaponCooldowns.set(weaponId, remaining);
      continue;
    }
    measureTelemetryPhase("weaponFire", () => fireWeapon(weapon, resolveWeaponAim(weapon, origin).angle));
    state.weaponCooldowns.set(weaponId, weapon.cooldown);
  }
}

function resolveWeaponAim(weapon: WeaponRuntime, origin: Player): WeaponAim {
  const manualAngle = angleTo(origin.x, origin.z, pointer.worldX, pointer.worldZ);
  if (isManualAimActive()) return { angle: manualAngle, mode: "manual", target: null };
  const target = selectWeaponTarget(weapon, origin);
  return target
    ? { angle: angleTo(origin.x, origin.z, target.x, target.z), mode: "auto", target }
    : { angle: manualAngle, mode: "manual-fallback", target: null };
}

function isManualAimActive(now = state.time): boolean {
  return now < (pointer.manualAimUntil ?? 0);
}

function markManualAim(seconds = MANUAL_AIM_PRIORITY_SECONDS): void {
  pointer.manualAimUntil = Math.max(pointer.manualAimUntil ?? 0, state.time + seconds);
}

function selectWeaponTarget(weapon: WeaponRuntime, origin: Player): WorldPoint | null {
  if (weapon.id === "plagueVial") return densestEnemyCluster(origin.x, origin.z, weapon.range);
  if (weapon.id === "batSwarm") return lowestHealthEnemy(origin.x, origin.z, weapon.range);
  if (weapon.id === "coffinLid") {
    const mx = origin.moveMomentumX ?? 0;
    const mz = origin.moveMomentumZ ?? 0;
    if (Math.hypot(mx, mz) > 0.08) return { x: wrapWorld(origin.x + mx * 10), z: wrapWorld(origin.z + mz * 10) };
  }
  return nearestEnemy(origin.x, origin.z, weapon.range);
}

function densestEnemyCluster(x: number, z: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = -1;
  const candidates = queryLiveEnemies(x, z, range);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    let score = enemy.boss ? 3 : 1;
    const nearby = queryLiveEnemies(enemy.x, enemy.z, 5.3, state.enemySelectionScratch);
    for (const other of nearby) {
      if (other === enemy || other.hp <= 0) continue;
      score += other.boss ? 2.4 : 1;
    }
    if (score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best ?? nearestEnemy(x, z, range);
}

function lowestHealthEnemy(x: number, z: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const rangeSq = range * range;
  const candidates = queryLiveEnemies(x, z, range);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const d2 = worldDistanceSquared(x, z, enemy.x, enemy.z);
    const healthRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
    const score = healthRatio + d2 / Math.max(1, rangeSq) * 0.18 - (enemy.boss ? 0.16 : 0);
    if (score < bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

function countCombatObjects(kind: string | undefined, list: ReadonlyArray<{ kind?: string }> = state.bullets): number {
  let count = 0;
  for (const item of list) {
    if (item.kind === kind) count += 1;
  }
  return count;
}

function addCombatBullet(bullet: CombatBullet): boolean {
  const cap = (bullet.kind ? SPECIAL_WEAPON_OBJECT_CAPS[bullet.kind] : undefined) ?? COMBAT_BULLET_CAP;
  if (state.bullets.length >= COMBAT_BULLET_CAP || countCombatObjects(bullet.kind) >= cap) {
    if (bullet.mesh) scene.remove(bullet.mesh);
    return false;
  }
  state.bullets.push(bullet);
  return true;
}

function fireSpecialWeapon(weapon: WeaponRuntime, aimAngle: number): boolean {
  const player = state.player;
  if (!player) return false;
  if (!["graveLantern", "plagueVial", "coffinLid", "batSwarm", "funeralBell", "reaperScythe"].includes(weapon.id)) return false;
  state.activeWeaponId = weapon.id;
  updatePlayerWeaponVisual(aimAngle);
  player.animLock = Math.max(player.animLock ?? 0, Math.min(0.24, weapon.cooldown * 0.5));
  if (weapon.id === "graveLantern") return fireLanternAura(weapon);
  if (weapon.id === "plagueVial") return firePlaguePools(weapon);
  if (weapon.id === "coffinLid") return fireCoffinBoomerang(weapon, aimAngle);
  if (weapon.id === "batSwarm") return fireBatSwarm(weapon, aimAngle);
  if (weapon.id === "funeralBell") return fireFuneralBell(weapon);
  if (weapon.id === "reaperScythe") return fireReaperSweep(weapon, aimAngle);
  return false;
}

function fireLanternAura(weapon: WeaponRuntime): boolean {
  const player = state.player;
  if (!player) return false;
  const radius = Math.min(18, Math.max(4.8, (weapon.specialRadius ?? weapon.range * 0.32) * (weapon.evolved ? 1.18 : 1)));
  const hits = applyAreaWeaponDamage(weapon, player.x, player.z, radius, {
    damageScale: weapon.evolved ? 1.18 : 0.82,
    slowSeconds: weapon.evolved ? 0.42 : 0.22,
    knockbackScale: 0.55,
    hitLimit: weapon.evolved ? Number.POSITIVE_INFINITY : Math.max(5, weapon.pellets * 3)
  });
  state.activeWeaponId = weapon.id;
  updatePlayerWeaponVisual(angleTo(player.x, player.z, pointer.worldX, pointer.worldZ));
  state.muzzleFlash = Math.max(state.muzzleFlash, weapon.evolved ? 1.1 : 0.72);
  playActorAnimation(player, "cast", 0.03);
  spawnPulseRing(player.x, player.z, weapon.color, weapon.evolved ? 0.54 : 0.36, 1, radius * 0.58);
  spawnOrbitFlames(weapon, radius, Math.min(8, Math.max(3, weapon.pellets + (weapon.evolved ? 2 : 0))));
  playSynthCue("shot", hits ? 1.1 : 0.75, { weaponId: weapon.id, color: weapon.color });
  return true;
}

function spawnOrbitFlames(weapon: WeaponRuntime, radius: number, count: number): void {
  const player = state.player;
  if (!player) return;
  for (let i = 0; i < count; i += 1) {
    const angle = state.time * 2.1 + (i / count) * Math.PI * 2;
    spawnEffect("muzzle", player.x + Math.cos(angle) * radius * 0.58, player.z + Math.sin(angle) * radius * 0.58, 0.26, {
      angle,
      color: weapon.color,
      particles: 5,
      y: 1.05,
      speed: 2.1,
      size: 0.22
    });
  }
}

function firePlaguePools(weapon: WeaponRuntime): boolean {
  const targets = selectClusterTargets(Math.min(6, Math.max(1, weapon.pellets)), weapon.range);
  const poolRadius = Math.min(8.5, weapon.poolRadius ?? (3.4 + weapon.level * 0.22));
  const poolLife = (weapon.poolSeconds ?? (weapon.evolved ? 5.8 : 4.2)) * ((state.progressionStats ?? resolveProgressionStats()).effectDurationMultiplier ?? 1);
  const tickEvery = Math.max(0.16, weapon.tickInterval ?? (weapon.evolved ? 0.24 : 0.35));
  for (const [index, target] of targets.entries()) {
    const offsetAngle = index * 2.399963229728653;
    const x = wrapWorld(target.x + Math.cos(offsetAngle) * Math.min(2.8, index * 0.7));
    const z = wrapWorld(target.z + Math.sin(offsetAngle) * Math.min(2.8, index * 0.7));
    addWeaponZone({
      kind: weapon.evolved ? "moldBloom" : "plaguePool",
      weaponId: weapon.id,
      x,
      z,
      radius: poolRadius + (weapon.evolved ? 1.2 : 0),
      ttl: poolLife,
      tickEvery: weapon.evolved ? Math.max(0.14, tickEvery * 0.8) : tickEvery,
      damage: weapon.damage * (weapon.evolved ? 0.34 : 0.26),
      slowSeconds: weapon.evolved ? 0.72 : 0.46,
      color: weapon.evolved ? "#5f4535" : weapon.color
    });
    spawnEffect("blast", x, z, 0.24, { color: weapon.color, particles: 9, speed: 3.2, size: 0.28 });
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(state.player, "grenadeThrow", 0.035);
  playSynthCue("shot", 0.95, { weaponId: weapon.id, color: weapon.color });
  return true;
}

function selectClusterTargets(count: number, range: number): WorldPoint[] {
  const player = state.player;
  if (!player) return [];
  const candidates = queryLiveEnemies(player.x, player.z, range);
  const selected = clusterTargetScratch;
  const scores = state.enemyDistanceScratch;
  selected.length = 0;
  scores.length = 0;
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    let nearby = enemy.boss ? 3 : 0;
    const cluster = queryLiveEnemies(enemy.x, enemy.z, 7.5, state.enemyClusterScratch);
    for (const other of cluster) {
      if (other !== enemy && other.hp > 0) nearby += other.boss ? 3 : 1;
    }
    insertScoredEnemy(enemy, nearby, count, selected, scores, true);
  }
  if (!selected.length) {
    selected.push({ x: pointer.worldX, z: pointer.worldZ });
  }
  return selected;
}

function insertScoredEnemy<T>(
  enemy: T,
  score: number,
  limit: number,
  selected: T[],
  scores: number[],
  descending = false
): void {
  let index = selected.length;
  while (index > 0 && (descending ? score > scores[index - 1] : score < scores[index - 1])) index -= 1;
  if (index >= limit) return;
  selected.splice(index, 0, enemy);
  scores.splice(index, 0, score);
  if (selected.length > limit) {
    selected.length = limit;
    scores.length = limit;
  }
}

function fireCoffinBoomerang(weapon: WeaponRuntime, aimAngle: number): boolean {
  const muzzle = getPlayerWeaponMuzzlePosition(aimAngle);
  const color = weapon.color;
  const count = Math.max(1, Math.min(3, weapon.pellets));
  const projectileSize = Math.max(0.45, weapon.projectileSizeMultiplier ?? 1);
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) * Math.min(0.42, Math.max(0.12, weapon.spread || 0.18));
    const angle = aimAngle + spread;
    const mesh = createBoomerangVisual(weapon, angle);
    mesh.scale.setScalar(projectileSize);
    const x = wrapWorld(muzzle.x + Math.cos(angle) * 0.24);
    const z = wrapWorld(muzzle.z + Math.sin(angle) * 0.24);
    const position = renderPosition(x, z);
    mesh.position.set(position.x, muzzle.y, position.z);
    scene.add(mesh);
    addCombatBullet({
      kind: "boomerang",
      weaponId: weapon.id,
      x,
      z,
      y: muzzle.y,
      heightOffset: PROJECTILE_HEIGHT_OFFSET,
      vx: Math.cos(angle) * weapon.speed,
      vz: Math.sin(angle) * weapon.speed,
      mesh,
      color,
      damage: weapon.damage,
      damageType: weapon.damageType,
      eliteDamageMultiplier: weapon.eliteDamageMultiplier,
      critChance: weapon.critChance,
      critMultiplier: weapon.critMultiplier,
      radius: Math.max(weapon.evolved ? 1.05 : 0.82, (weapon.width ?? 1.8) * 0.48),
      pierce: weapon.evolved ? 999 : Math.max(8, weapon.pierce),
      ttl: weapon.evolved ? 2.9 : 2.35,
      outboundSeconds: weapon.evolved ? 0.8 : 0.68,
      speed: weapon.speed,
      returnSpeed: weapon.returnSpeed,
      knockback: weapon.knockback * 1.2,
      splashDamageMultiplier: weapon.splashDamageMultiplier,
      splashRadius: weapon.splashRadius,
      hitEnemies: new Set()
    });
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(state.player, "shieldOneShot", 0.03);
  spawnEffect("muzzle", muzzle.x, muzzle.z, 0.18, { angle: aimAngle, color, particles: 8, worldY: muzzle.y, speed: 5.2 });
  playSynthCue("shot", 1, { weaponId: weapon.id, color });
  return true;
}

function createBoomerangVisual(weapon: WeaponRuntime, angle: number): Three.Group {
  const group = new THREE.Group();
  const material = getEffectMaterial(new THREE.Color(weapon.color), 0.74);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.18, 0.62), material);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.05, 0.76), getEffectMaterial(new THREE.Color("#f4d5aa"), 0.46));
  group.add(lid, edge);
  group.rotation.y = -angle;
  group.rotation.z = Math.PI * 0.04;
  return group;
}

function fireBatSwarm(weapon: WeaponRuntime, aimAngle: number): boolean {
  const muzzle = getPlayerWeaponMuzzlePosition(aimAngle);
  const count = Math.max(2, Math.min(9, weapon.pellets + (weapon.evolved ? 2 : 0)));
  const projectileSize = Math.max(0.45, weapon.projectileSizeMultiplier ?? 1);
  for (let i = 0; i < count; i += 1) {
    const angle = aimAngle + (i - (count - 1) / 2) * 0.28;
    const mesh = createBatProjectileVisual(weapon, angle);
    mesh.scale.multiplyScalar(projectileSize);
    const x = wrapWorld(muzzle.x + Math.cos(angle) * 0.35);
    const z = wrapWorld(muzzle.z + Math.sin(angle) * 0.35);
    const position = renderPosition(x, z);
    const heightOffset = PROJECTILE_HEIGHT_OFFSET + 0.18 + (i % 3) * 0.08;
    const y = projectileYAt(x, z, heightOffset);
    mesh.position.set(position.x, y, position.z);
    scene.add(mesh);
    addCombatBullet({
      kind: "homing",
      weaponId: weapon.id,
      x,
      z,
      y,
      heightOffset,
      vx: Math.cos(angle) * (weapon.summonSpeed ?? weapon.speed),
      vz: Math.sin(angle) * (weapon.summonSpeed ?? weapon.speed),
      mesh,
      color: weapon.evolved ? "#ff4f7b" : weapon.color,
      damage: weapon.damage * (weapon.evolved ? 1.14 : 0.92),
      damageType: weapon.damageType,
      eliteDamageMultiplier: weapon.eliteDamageMultiplier,
      critChance: (weapon.critChance ?? 0) + 0.04,
      critMultiplier: weapon.critMultiplier,
      radius: (weapon.evolved ? 0.56 : 0.42) * projectileSize,
      pierce: weapon.evolved ? 2 : 1,
      ttl: (weapon.summonSeconds ?? (weapon.evolved ? 4.8 : 3.8)) * (weapon.evolved ? 1.08 : 1),
      speed: (weapon.summonSpeed ?? weapon.speed) * (weapon.evolved ? 1.08 : 1),
      biteCooldown: weapon.biteCooldown,
      turnRate: weapon.evolved ? 9.5 : 7,
      knockback: weapon.knockback * 0.72,
      splashDamageMultiplier: weapon.splashDamageMultiplier,
      splashRadius: weapon.splashRadius,
      hitEnemies: new Set()
    });
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(state.player, "microDroneSpawn", 0.035);
  spawnEffect("muzzle", muzzle.x, muzzle.z, 0.24, { angle: aimAngle, color: weapon.color, particles: 15, worldY: muzzle.y, speed: 4.4 });
  playSynthCue("shot", 0.88, { weaponId: weapon.id, color: weapon.color });
  return true;
}

function createBatProjectileVisual(weapon: WeaponRuntime, angle: number): Three.Group {
  const group = createProjectileVisual({ ...weapon, color: weapon.evolved ? "#ff4f7b" : "#7a3550" }, angle);
  group.scale.set(0.82, 0.62, 0.82);
  return group;
}

function fireFuneralBell(weapon: WeaponRuntime): boolean {
  const player = state.player;
  if (!player) return false;
  const radius = Math.min(24, (weapon.pulseRadius ?? (7.2 + weapon.level * 0.72)) + (weapon.evolved ? 2.4 : 0));
  const hits = applyAreaWeaponDamage(weapon, player.x, player.z, radius, {
    damageScale: weapon.evolved ? 1.25 : 0.95,
    slowSeconds: weapon.evolved ? 0.95 : 0.58,
    knockbackScale: weapon.evolved ? 1.75 : 1.35
  });
  state.activeWeaponId = weapon.id;
  playActorAnimation(player, "singularityChannelStart", 0.035);
  spawnPulseRing(player.x, player.z, weapon.color, 0.5, 1.2, radius * 0.52);
  spawnPulseRing(player.x, player.z, "#fff2b8", 0.28, 0.7, radius * 0.32);
  for (let i = 1; i < Math.min(weapon.pellets, 4); i += 1) {
    spawnPulseRing(player.x, player.z, i % 2 ? "#fff2b8" : weapon.color, 0.32, 0.9 + i * 0.18, radius * (0.34 + i * 0.08));
  }
  playSynthCue("shot", hits ? 1.15 : 0.9, { weaponId: weapon.id, color: weapon.color });
  pulseShake(0.16, 0.18);
  return true;
}

function fireReaperSweep(weapon: WeaponRuntime, aimAngle: number): boolean {
  const player = state.player;
  if (!player) return false;
  const range = Math.min(25, (weapon.sweepRadius ?? (10 + weapon.level * 0.72)) + (weapon.evolved ? 2.6 : 0));
  const halfAngle = Math.min(1.35, (weapon.sweepArc ?? (weapon.evolved ? 2.24 : 1.64)) * 0.5);
  let hits = 0;
  const candidates = queryLiveEnemies(player.x, player.z, range);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const delta = worldDeltaInto(tempWorldDelta, player.x, player.z, enemy.x, enemy.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const along = dx * Math.cos(aimAngle) + dz * Math.sin(aimAngle);
    if (along < -1 || along > range) continue;
    const angle = Math.abs(normalizeAngle(Math.atan2(dz, dx) - aimAngle));
    if (angle > halfAngle) continue;
    const executeDamage = enemy.hp <= (enemy.maxHp ?? enemy.hp) * (weapon.executeRatio ?? 0.08) ? enemy.hp + 1 : 0;
    const dealt = applyWeaponDamage(enemy, weapon, Math.max(executeDamage, weapon.damage * (weapon.evolved ? 1.28 : 1.05)), {
      hitX: Math.cos(aimAngle),
      hitZ: Math.sin(aimAngle),
      knockbackScale: weapon.evolved ? 1.4 : 1.05,
      slowSeconds: weapon.evolved ? 0.55 : 0.32
    });
    if (dealt > 0) hits += 1;
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(player, "swordAttack", 0.025);
  spawnSweepVisual(player.x, player.z, aimAngle, range, halfAngle, weapon.color);
  playSynthCue("shot", hits ? 1.2 : 0.82, { weaponId: weapon.id, color: weapon.color });
  return true;
}

function updateWeaponZones(dt: number): void {
  for (let i = state.weaponZones.length - 1; i >= 0; i -= 1) {
    const zone = state.weaponZones[i];
    if (!zone) continue;
    zone.ttl -= dt;
    zone.age += dt;
    zone.tickClock -= dt;
    const position = renderPositionInto(tempRenderPosition, zone.x, zone.z);
    zone.mesh.position.set(position.x, terrainHeightAt(zone.x, zone.z) + 0.06, position.z);
    zone.mesh.material.opacity = (zone.opacity ?? 0.22) * clamp01(zone.ttl / Math.max(0.001, zone.life)) * (0.78 + Math.sin((zone.age + zone.seed) * 5) * 0.18);
    zone.mesh.rotation.z += dt * (zone.kind === "moldBloom" ? 0.38 : 0.18);
    if (zone.tickClock <= 0) {
      zone.tickClock += zone.tickEvery;
      const weapon = getWeaponRuntime(zone.weaponId) ?? passiveWeapon(zone.weaponId, zone.color, zone.damageType ?? "arcane");
      if (weapon) {
        applyAreaWeaponDamage(weapon, zone.x, zone.z, zone.radius, {
          damageOverride: zone.damage,
          slowSeconds: zone.slowSeconds,
          knockbackScale: 0.28,
          color: zone.color
        });
      }
    }
    if (zone.ttl <= 0) removeFromList(state.weaponZones, i);
  }
}

function addWeaponZone(zone: WeaponZoneSpec): boolean {
  const cap = SPECIAL_WEAPON_OBJECT_CAPS[zone.kind] ?? SPECIAL_WEAPON_OBJECT_CAPS.plaguePool ?? 36;
  if (state.weaponZones.length >= cap || countCombatObjects(zone.kind, state.weaponZones) >= cap) return false;
  const color = new THREE.Color(zone.color ?? "#74c96b");
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(zone.radius, 48),
    getEffectMaterial(color, zone.kind === "moldBloom" ? 0.28 : 0.22)
  );
  mesh.rotation.x = -Math.PI / 2;
  const position = renderPositionInto(tempRenderPosition, zone.x, zone.z);
  mesh.position.set(position.x, terrainHeightAt(zone.x, zone.z) + 0.06, position.z);
  scene.add(mesh);
  state.weaponZones.push({
    ...zone,
    mesh,
    age: 0,
    life: zone.ttl,
    tickClock: 0.04,
    opacity: zone.kind === "moldBloom" ? 0.28 : 0.22,
    seed: Math.random() * 10
  });
  return true;
}

function applyAreaWeaponDamage(
  weapon: DamageWeapon,
  x: number,
  z: number,
  radius: number,
  options: AreaWeaponDamageOptions = {}
): number {
  let hits = 0;
  const hitLimit = options.hitLimit ?? Number.POSITIVE_INFINITY;
  const candidates = queryLiveEnemies(x, z, radius);
  const selected = Number.isFinite(hitLimit) ? state.enemySelectionScratch : candidates;
  if (selected === state.enemySelectionScratch) {
    const distances = state.enemyDistanceScratch;
    selected.length = 0;
    distances.length = 0;
    for (const enemy of candidates) {
      if (enemy.hp <= 0 || !areaOverlapsEnemyY(x, z, enemy)) continue;
      const distanceSq = worldDistanceSquared(x, z, enemy.x, enemy.z);
      insertScoredEnemy(enemy, distanceSq, hitLimit, selected, distances);
    }
  }
  for (const enemy of selected) {
    if (hits >= (options.hitLimit ?? Number.POSITIVE_INFINITY)) break;
    if (enemy.hp <= 0 || !areaOverlapsEnemyY(x, z, enemy)) continue;
    const delta = worldDeltaInto(tempWorldDelta, x, z, enemy.x, enemy.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const distance = Math.hypot(dx, dz) || 1;
    const dealt = applyWeaponDamage(enemy, weapon, options.damageOverride ?? weapon.damage * (options.damageScale ?? 1), {
      hitX: dx / distance,
      hitZ: dz / distance,
      knockbackScale: options.knockbackScale ?? 1,
      slowSeconds: options.slowSeconds ?? 0.2,
      color: options.color ?? weapon.color
    });
    if (dealt > 0) hits += 1;
  }
  return hits;
}

function areaOverlapsEnemyY(x: number, z: number, enemy: Enemy, height = 4.8): boolean {
  const base = terrainHeightAt(x, z);
  const enemyBase = actorFeetY(enemy);
  return verticalRangesOverlap(base, base + height, enemyBase, enemyBase + actorVerticalHeight(enemy), 0.35);
}

function applyWeaponDamage(
  enemy: Enemy,
  weapon: DamageWeapon,
  baseDamage: number,
  options: WeaponDamageOptions = {}
): number {
  const eliteTarget = enemy.boss || resolveEnemySpawnRank(enemy.typeId) >= 0.66;
  const crit = Math.random() < (weapon.critChance ?? 0);
  const dealtDamage = baseDamage * (eliteTarget ? (weapon.eliteDamageMultiplier ?? 1) : 1) * (crit ? (weapon.critMultiplier ?? 1.75) : 1);
  enemy.hp -= dealtDamage;
  enemy.slow = Math.max(enemy.slow ?? 0, options.slowSeconds ?? 0.12);
  const hitX = options.hitX ?? 0;
  const hitZ = options.hitZ ?? 0;
  const force = ((weapon.knockback ?? 2) * (options.knockbackScale ?? 1)) / Math.max(0.65, enemy.radius * (enemy.boss ? 2.1 : 0.82));
  enemy.knockX = (enemy.knockX ?? 0) + hitX * force;
  enemy.knockZ = (enemy.knockZ ?? 0) + hitZ * force;
  enemy.lastHit = { x: hitX, z: hitZ, force: Math.max(force, Math.min(7, dealtDamage / 5)) };
  enemy.healthBarTimer = HEALTH_BAR_VISIBLE_SECONDS;
  updateEnemyHealthBar(enemy, 0);
  if (dealtDamage >= 22 || crit || Math.random() < 0.12) {
    spawnFloatingText(`${crit ? "CRIT " : ""}${Math.round(dealtDamage)}`, enemy.x, enemy.z, crit ? "#fff4a6" : (options.color ?? weapon.color), crit ? 1.14 : 0.96, { targetHeight: actorFloatingTextHeight(enemy) });
  }
  if (crit || dealtDamage >= Math.max(24, enemy.maxHp * 0.32)) {
    const impactColor = crit ? "#fff2a8" : (options.color ?? weapon.color);
    spawnPulseRing(enemy.x, enemy.z, impactColor, crit ? 0.42 : 0.3, 0.78, crit ? 2.6 : 1.8);
    spawnEffect("hit", enemy.x, enemy.z, crit ? 0.48 : 0.36, { color: impactColor, particles: crit ? 15 : 10, speed: crit ? 7.2 : 5.8, size: crit ? 0.36 : 0.28 });
  }
  return dealtDamage;
}

function spawnSweepVisual(
  x: number,
  z: number,
  angle: number,
  range: number,
  halfAngle: number,
  colorValue: Three.ColorRepresentation
): void {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(-halfAngle) * range, Math.sin(-halfAngle) * range);
  shape.absarc(0, 0, range, -halfAngle, halfAngle, false);
  shape.lineTo(0, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), getEffectMaterial(new THREE.Color(colorValue), 0.28));
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -angle;
  const position = renderPosition(x, z);
  mesh.position.set(position.x, terrainHeightAt(x, z) + 0.12, position.z);
  scene.add(mesh);
  state.effects.push({ mesh, t: 0, life: 0.28, baseScale: 1, expand: 0.14 });
  spawnEffect("muzzle", wrapWorld(x + Math.cos(angle) * 2.2), wrapWorld(z + Math.sin(angle) * 2.2), 0.22, { angle, color: colorValue, particles: 12, y: 0.9, speed: 6.4, size: 0.24 });
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function updateEnemies(dt: number): void {
  const player = state.player;
  if (!player) return;
  resetEnemyBillboardBatches();
  const enemyCount = state.enemies.length;
  const terrainNearRadius = enemyCount >= 260 ? PERF_FLAGS.enemyDenseTerrainNearRadius : PERF_FLAGS.enemyTerrainNearRadius;
  let terrainBudget = Math.min(enemyCount, Math.max(0, Math.floor(PERF_FLAGS.enemyTerrainBudget)));
  let animatedMeshBudget = enemyCount >= ANIMATED_ENEMY_DENSE_COUNT ? ANIMATED_ENEMY_DENSE_MESH_BUDGET : Number.POSITIVE_INFINITY;
  const useRemotePlayers = remotePlayers.size > 0;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    if (!enemy) continue;
    const movement: { target: EnemyTarget; dx: number; dz: number; distance: number } = measureTelemetryPhase("enemyMove", () => {
      const target = useRemotePlayers ? nearestPlayer(enemy.x, enemy.z, player) : player;
      const delta = worldDeltaInto(tempWorldDelta, enemy.x, enemy.z, target.x, target.z);
      const dx = delta.dx;
      const dz = delta.dz;
      const distance = Math.hypot(dx, dz) || 1;
      return { target, dx, dz, distance };
    });
    const { target, dx, dz, distance } = movement;
    if (enemy.animated && enemy.mesh) {
      const useMesh = enemy.boss
        || enemyCount < ANIMATED_ENEMY_DENSE_COUNT
        || (distance < ANIMATED_ENEMY_DENSE_MESH_RADIUS && animatedMeshBudget > 0);
      enemy.renderAsBillboard = !useMesh;
      enemy.mesh.visible = useMesh;
      if (useMesh && !enemy.boss && enemyCount >= ANIMATED_ENEMY_DENSE_COUNT) animatedMeshBudget -= 1;
    }
    const speed = enemy.speed * (enemy.slow > 0 ? 0.55 : 1);
    const beforeX = enemy.x;
    const beforeZ = enemy.z;
    enemy.x += (dx / distance) * speed * dt;
    enemy.z += (dz / distance) * speed * dt;
    enemy.x += (enemy.knockX ?? 0) * dt;
    enemy.z += (enemy.knockZ ?? 0) * dt;
    const knockDamping = Math.max(0, 1 - KNOCKBACK_DECAY * dt);
    enemy.knockX = Math.abs(enemy.knockX ?? 0) < KNOCKBACK_STOP_SPEED ? 0 : (enemy.knockX ?? 0) * knockDamping;
    enemy.knockZ = Math.abs(enemy.knockZ ?? 0) < KNOCKBACK_STOP_SPEED ? 0 : (enemy.knockZ ?? 0) * knockDamping;
    wrapEntity(enemy);
    const preciseTerrain = enemy.animated || enemy.boss || distance < terrainNearRadius || !enemy.batchKey;
    enemy.terrainClock = Math.max(0, (enemy.terrainClock ?? ((enemy.seed ?? i) % ENEMY_TERRAIN_STEP_SECONDS)) - dt);
    const refreshTerrain = preciseTerrain || (enemy.terrainClock <= 0 && terrainBudget > 0);
    if (refreshTerrain) {
      if (!preciseTerrain) terrainBudget -= 1;
      enemy.terrainClock = preciseTerrain ? 0 : Math.max(0.016, PERF_FLAGS.enemyTerrainStepSeconds) + ((enemy.seed ?? i) % 0.035);
      measureTelemetryPhase("enemyTerrainCollision", () => {
        resolveGroundActorTerrainMotion(enemy, beforeX, beforeZ, dt);
        if (PERF_FLAGS.farEnemyPropCollision || preciseTerrain) resolvePropCollisions(enemy);
      });
    } else if (typeof enemy.groundY !== "number" || !Number.isFinite(enemy.groundY)) {
      enemy.groundY = terrainHeightAt(enemy.x, enemy.z);
    }
    enemy.slow = Math.max(0, enemy.slow - dt);
    measureTelemetryPhase("enemyAnimation", () => updateEnemyAnimation(enemy, dt));
    setActorPosition(enemy, enemy.x, enemy.z);
    setActorFacing(enemy, Math.atan2(dz, dx));
    if (PERF_FLAGS.enemyHealthBars) measureTelemetryPhase("enemyHealthBars", () => updateEnemyHealthBar(enemy, dt));
    else removeEnemyHealthBar(enemy);
    if (!enemy.animated && enemy.mesh) enemy.mesh.scale.setScalar(enemy.scale * (1 + Math.sin(state.time * 5 + enemy.seed) * 0.035));
    if (distance < enemy.radius + target.radius) {
      if (target === player && actorsOverlapY(player, enemy)) damagePlayer(enemy.touch, { source: enemy });
      enemy.slow = 0.35;
    }
    if (enemy.hp <= 0) {
      killEnemy(i);
      continue;
    }
    measureTelemetryPhase("enemyBillboards", () => queueEnemyBillboardBatch(enemy));
  }
  measureTelemetryPhase("enemyBillboards", commitEnemyBillboardBatches);
  rebuildEnemySpatialGrid();
}

function updateEnemyAnimation(enemy: Enemy, dt: number): void {
  if (!enemy.animated && !enemy.animator && !enemy.proceduralPose) {
    enemy.activeAnimation = "run";
    enemy.activeAnimationSource = "billboard";
    return;
  }
  if (enemy.renderAsBillboard) {
    enemy.activeAnimation = "run";
    enemy.activeAnimationSource = "billboard-lod";
    return;
  }
  const step = enemy.animStep ?? (enemy.boss ? BOSS_ANIMATION_STEP_SECONDS : ENEMY_ANIMATION_STEP_SECONDS);
  enemy.animClock = (enemy.animClock ?? ((enemy.seed ?? 0) % step)) - dt;
  if (enemy.animClock > 0) return;
  const elapsed = Math.min(step * 2.5, step + Math.max(0, -enemy.animClock));
  enemy.animClock += step;
  if (enemy.animClock < 0) enemy.animClock = ((enemy.seed ?? 0) % step);
  updateActorAnimation(enemy, elapsed, true);
}

function resetEnemyBillboardBatches(): void {
  for (const batch of state.enemyBillboardBatches.values()) batch.count = 0;
}

function commitEnemyBillboardBatches(): void {
  for (const batch of state.enemyBillboardBatches.values()) {
    batch.mesh.count = batch.count;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

function queueEnemyBillboardBatch(enemy: Enemy): void {
  const batchKey = enemy.batchKey ?? (enemy.renderAsBillboard ? enemy.textureKey : null);
  if (!batchKey) return;
  const batch = getEnemyBillboardBatch(batchKey);
  if (batch.count >= batch.capacity) return;
  const position = renderPositionInto(tempRenderPosition, enemy.x, enemy.z);
  tempVec.set(position.x, actorGroundHeight(enemy) + PLAYER_HEIGHT_WORLD * enemy.scale * 0.5, position.z);
  tempQuaternion.copy(camera.quaternion);
  const pulse = 1 + Math.sin(state.time * 5 + enemy.seed) * 0.035;
  tempScale.set(2.7 * enemy.scale * pulse, PLAYER_HEIGHT_WORLD * enemy.scale * pulse, 1);
  tempMatrix.compose(tempVec, tempQuaternion, tempScale);
  batch.mesh.setMatrixAt(batch.count, tempMatrix);
  batch.count += 1;
}

function getEnemyBillboardBatch(textureKey: string): InstanceBatch {
  let batch = state.enemyBillboardBatches.get(textureKey);
  if (batch) return batch;
  const texture = state.textures[textureKey] ?? state.textures.zombieA;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.08,
    depthWrite: true,
    side: THREE.FrontSide
  });
  telemetry.materialCreates += 1;
  const mesh = new THREE.InstancedMesh(geometry, material, ENEMY_BILLBOARD_BATCH_CAPACITY);
  telemetry.meshCreates += 1;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
  scene.add(mesh);
  batch = { mesh, count: 0, capacity: ENEMY_BILLBOARD_BATCH_CAPACITY };
  state.enemyBillboardBatches.set(textureKey, batch);
  return batch;
}

function updateEnemyHealthBar(enemy: Enemy, dt: number): void {
  if (!enemy?.maxHp || enemy.maxHp <= 0) return;
  enemy.healthBarTimer = Math.max(0, (enemy.healthBarTimer ?? 0) - dt);
  if (enemy.hp >= enemy.maxHp || enemy.healthBarTimer <= 0 || enemy.hp <= 0) {
    removeEnemyHealthBar(enemy);
    return;
  }
  const bar = ensureEnemyHealthBar(enemy);
  const ratio = clamp01(enemy.hp / enemy.maxHp);
  const position = renderPositionInto(tempRenderPosition, enemy.x, enemy.z);
  bar.root.position.set(position.x, actorGroundHeight(enemy) + PLAYER_HEIGHT_WORLD * enemy.scale + 0.56, position.z);
  bar.root.quaternion.copy(camera.quaternion);
  bar.root.scale.set(Math.max(1.25, enemy.scale * 1.8), 0.16, 1);
  bar.fill.scale.x = ratio;
  bar.fill.position.x = (ratio - 1) * 0.5;
  bar.fill.material.color.setHex(ratio > 0.55 ? 0xb9ff6e : ratio > 0.25 ? 0xffc45f : 0xff5f4d);
}

function ensureEnemyHealthBar(enemy: Enemy): EnemyHealthBar {
  if (enemy.healthBar) return enemy.healthBar;
  const pooled = state.enemyHealthBarPool.pop();
  if (pooled) {
    pooled.root.visible = true;
    scene.add(pooled.root);
    enemy.healthBar = pooled;
    return enemy.healthBar;
  }
  const root = new THREE.Group();
  const back = new THREE.Mesh(getHealthBarGeometry(), getHealthBarBackMaterial());
  const fillMaterial = getHealthBarFillMaterial().clone();
  telemetry.materialCreates += 1;
  const fill = new THREE.Mesh(getHealthBarGeometry(), fillMaterial);
  back.position.z = -0.01;
  fill.position.z = 0.01;
  root.add(back, fill);
  scene.add(root);
  enemy.healthBar = { root, fill };
  return enemy.healthBar;
}

function removeEnemyHealthBar(enemy: Enemy): void {
  if (!enemy?.healthBar) return;
  scene.remove(enemy.healthBar.root);
  enemy.healthBar.root.visible = false;
  state.enemyHealthBarPool.push(enemy.healthBar);
  enemy.healthBar = null;
}

function getHealthBarGeometry(): Three.BufferGeometry {
  return requireRuntimeInstance(
    state.renderCache.get("geometry:enemyHealthBar", () => new THREE.PlaneGeometry(1, 1)),
    THREE.BufferGeometry,
    "Enemy health bar geometry"
  );
}

function getHealthBarBackMaterial(): Three.MeshBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get("material:enemyHealthBarBack", () => new THREE.MeshBasicMaterial({
    color: 0x160d0b,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  })), THREE.MeshBasicMaterial, "Enemy health bar back material");
}

function getHealthBarFillMaterial(): Three.MeshBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get("material:enemyHealthBarFill", () => new THREE.MeshBasicMaterial({
    color: 0xb9ff6e,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  })), THREE.MeshBasicMaterial, "Enemy health bar fill material");
}

function resetPickupBatches(): void {
  for (const batch of state.pickupBatches.values()) batch.count = 0;
}

function commitPickupBatches(): void {
  for (const batch of state.pickupBatches.values()) {
    batch.mesh.count = batch.count;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

function queuePickupBatch(pickup: Pickup): void {
  const batch = getPickupBatch(pickup.kind, pickup.texture);
  if (batch.count >= batch.capacity) return;
  const pickupPosition = renderPositionInto(tempRenderPosition, pickup.x, pickup.z);
  const y = pickupY(pickup);
  tempVec.set(pickupPosition.x, y, pickupPosition.z);
  tempQuaternion.copy(camera.quaternion);
  const pulse = 1 + Math.sin(pickup.t * 5) * 0.06;
  tempScale.set(batch.width * pickup.scale * pulse, batch.height * pickup.scale * pulse, 1);
  tempMatrix.compose(tempVec, tempQuaternion, tempScale);
  batch.mesh.setMatrixAt(batch.count, tempMatrix);
  batch.count += 1;
}

function getPickupBatch(kind: Pickup["kind"], texture: Three.Texture): PickupInstanceBatch {
  let batch = state.pickupBatches.get(kind);
  if (batch) return batch;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    blending: kind === "xp" || kind === "magnet" ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  telemetry.materialCreates += 1;
  const mesh = new THREE.InstancedMesh(geometry, material, PICKUP_BATCH_CAPACITY);
  telemetry.meshCreates += 1;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const width = kind === "weapon" ? 1.25 : kind === "heal" ? 1.05 : kind === "magnet" ? 1.12 : 0.96;
  const height = kind === "weapon" ? 1.25 : kind === "heal" ? 1.05 : kind === "magnet" ? 1.12 : 0.96;
  batch = { mesh, count: 0, capacity: PICKUP_BATCH_CAPACITY, width, height };
  state.pickupBatches.set(kind, batch);
  return batch;
}

function pickupY(pickup: Pickup): number {
  if (!Number.isFinite(pickup.groundY)) pickup.groundY = terrainHeightAt(pickup.x, pickup.z);
  return pickup.groundY + 1.15 + Math.sin(pickup.t * 5) * 0.18;
}

function updateBullets(dt: number): void {
  const player = state.player;
  if (!player) return;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    if (!bullet) continue;
    bullet.age = (bullet.age ?? 0) + dt;
    updateSpecialBulletMotion(bullet, dt);
    bullet.x += bullet.vx * dt;
    bullet.z += bullet.vz * dt;
    wrapEntity(bullet);
    bullet.ttl -= dt;
    bullet.y = projectileYAt(bullet.x, bullet.z, bullet.heightOffset ?? PROJECTILE_HEIGHT_OFFSET);
    const bulletPosition = renderPositionInto(tempRenderPosition, bullet.x, bullet.z);
    bullet.mesh.position.set(bulletPosition.x, bullet.y ?? 1.1, bulletPosition.z);
    bullet.mesh.rotation.y = -Math.atan2(bullet.vz, bullet.vx);
    let hit = false;
    const candidates = measureTelemetryPhase("bulletTargeting", () => queryLiveEnemies(bullet.x, bullet.z, bullet.radius));
    measureTelemetryPhase("bulletHits", () => {
      for (const enemy of candidates) {
        if (enemy.hp <= 0) continue;
        if (bullet.kind && bullet.hitEnemies.has(enemy)) continue;
        if (!bulletOverlapsEnemyY(bullet, enemy)) continue;
        if (worldDistanceSquared(enemy.x, enemy.z, bullet.x, bullet.z) < (enemy.radius + bullet.radius) ** 2) {
          const bulletSpeed = Math.max(1, bullet.speed ?? Math.hypot(bullet.vx, bullet.vz));
          const hitX = bullet.vx / bulletSpeed;
          const hitZ = bullet.vz / bulletSpeed;
          const dealtDamage = applyWeaponDamage(enemy, bullet, bullet.damage, { hitX, hitZ, knockbackScale: 1, slowSeconds: bullet.kind === "homing" ? 0.28 : 0.12, color: bullet.color });
          applyProjectileSplashDamage(bullet, enemy, dealtDamage, hitX, hitZ);
          if (bullet.kind) bullet.hitEnemies.add(enemy);
          bullet.pierce -= 1;
          spawnEffect("hit", enemy.x, enemy.z, 0.34, { angle: Math.atan2(bullet.vz, bullet.vx), color: bullet.color });
          playSynthCue("hit", Math.min(1.4, dealtDamage / 16), { color: bullet.color });
          hit = bullet.pierce <= 0;
          if (hit) break;
        }
      }
    });
    if (!hit && bullet.kind === "boomerang" && bullet.returning && worldDistanceSquared(bullet.x, bullet.z, player.x, player.z) <= 1.4 ** 2) hit = true;
    if (hit || bullet.ttl <= 0) removeFromList(state.bullets, i);
  }
}

function bulletOverlapsEnemyY(bullet: CombatBullet, enemy: Enemy): boolean {
  const bulletY = bullet.y ?? projectileYAt(bullet.x, bullet.z, bullet.heightOffset ?? PROJECTILE_HEIGHT_OFFSET);
  const enemyBase = actorFeetY(enemy);
  const enemyTop = enemyBase + actorVerticalHeight(enemy);
  return bulletY >= enemyBase - PROJECTILE_VERTICAL_HIT_PAD && bulletY <= enemyTop + PROJECTILE_VERTICAL_HIT_PAD;
}

function applyProjectileSplashDamage(
  bullet: CombatBullet,
  primaryEnemy: Enemy,
  dealtDamage: number,
  hitX: number,
  hitZ: number
): number {
  const splashRatio = Math.max(0, bullet.splashDamageMultiplier ?? 0);
  if (splashRatio <= 0) return 0;
  const radius = Math.max(1.2, bullet.splashRadius ?? 2.4);
  let hits = 0;
  const candidates = queryLiveEnemies(primaryEnemy.x, primaryEnemy.z, radius);
  for (const enemy of candidates) {
    if (enemy === primaryEnemy || enemy.hp <= 0) continue;
    if (!actorsOverlapY(primaryEnemy, enemy, 0.6)) continue;
    if (worldDistanceSquared(enemy.x, enemy.z, primaryEnemy.x, primaryEnemy.z) > (radius + enemy.radius) ** 2) continue;
    applyWeaponDamage(enemy, bullet, Math.max(1, dealtDamage * splashRatio), {
      hitX,
      hitZ,
      knockbackScale: 0.35,
      slowSeconds: 0.08,
      color: bullet.color
    });
    hits += 1;
    if (hits >= 8) break;
  }
  if (hits > 0) {
    spawnPulseRing(primaryEnemy.x, primaryEnemy.z, bullet.color, 0.18, 0.45, radius * 0.72);
  }
  return hits;
}

function updateSpecialBulletMotion(bullet: CombatBullet, dt: number): void {
  if (bullet.kind === "homing") {
    const target = lowestHealthEnemy(bullet.x, bullet.z, 34) ?? nearestEnemy(bullet.x, bullet.z, 34);
    if (!target) return;
    const delta = worldDeltaInto(tempWorldDelta, bullet.x, bullet.z, target.x, target.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const distance = Math.hypot(dx, dz) || 1;
    const desiredVx = (dx / distance) * (bullet.speed ?? 16);
    const desiredVz = (dz / distance) * (bullet.speed ?? 16);
    const steer = clamp((bullet.turnRate ?? 6) * dt, 0, 1);
    bullet.vx += (desiredVx - bullet.vx) * steer;
    bullet.vz += (desiredVz - bullet.vz) * steer;
    return;
  }
  if (bullet.kind === "boomerang") {
    if (!bullet.returning && (bullet.age ?? 0) >= (bullet.outboundSeconds ?? 0.7)) {
      bullet.returning = true;
      bullet.hitEnemies.clear();
    }
    if (!bullet.returning) {
      bullet.mesh.rotation.z += dt * 8;
      return;
    }
    const player = state.player;
    if (!player) return;
    const delta = worldDeltaInto(tempWorldDelta, bullet.x, bullet.z, player.x, player.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const distance = Math.hypot(dx, dz) || 1;
    const speed = bullet.returnSpeed ?? ((bullet.speed ?? 14) * 1.18);
    bullet.vx = (dx / distance) * speed;
    bullet.vz = (dz / distance) * speed;
    bullet.mesh.rotation.z -= dt * 10;
  }
}

function updatePickups(dt: number): void {
  const player = state.player;
  if (!player) return;
  resetPickupBatches();
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = state.pickups[i];
    if (!pickup) continue;
    pickup.t += dt;
    pickup.ttl -= dt;
    if (pickup.ttl <= 0) {
      removeFromList(state.pickups, i);
      continue;
    }
    if (pickup.kind !== "magnet" && (pickup.magnetized || state.time < state.magnetPullUntil)) {
      pullPickupTowardPlayer(pickup, dt);
      updateMagnetPullVisual(pickup, dt);
    }
    const collectRadius = getPickupCollectRadius();
    if (worldDistanceSquared(pickup.x, pickup.z, player.x, player.z) < collectRadius ** 2) {
      collectPickup(pickup);
      removeFromList(state.pickups, i);
      continue;
    }
    if (pickup.mesh) {
      const pickupPosition = renderPositionInto(tempRenderPosition, pickup.x, pickup.z);
      pickup.mesh.position.set(pickupPosition.x, pickupY(pickup), pickupPosition.z);
      pickup.mesh.rotation.y += dt * (pickup.kind === "weapon" ? 1.5 : 1.05);
      forEachObjectMaterial(pickup.mesh, (material) => {
        if ("rotation" in material && typeof material.rotation === "number") material.rotation += dt * 0.8;
      });
      pickup.light?.position.set(pickupPosition.x, pickup.mesh.position.y, pickupPosition.z);
      if (pickup.light) pickup.light.intensity = (pickup.kind === "xp" ? 0.75 : 1.2) + Math.sin(pickup.t * 4) * 0.25;
    } else {
      queuePickupBatch(pickup);
    }
  }
  updatePickupLightPool();
  commitPickupBatches();
}

function activatePickupMagnet(): void {
  const player = state.player;
  if (!player) return;
  state.magnetPullUntil = Math.max(state.magnetPullUntil ?? 0, state.time + MAGNET_PICKUP_SECONDS);
  for (const pickup of state.pickups) {
    if (pickup.kind !== "magnet") {
      pickup.magnetized = true;
      pickup.magnetTrailClock = 0;
    }
  }
  spawnPulseRing(player.x, player.z, "#9fe8ff", 0.22, 2.1, 8.8);
}

function pullPickupTowardPlayer(pickup: Pickup, dt: number): void {
  const player = state.player;
  if (!player) return;
  const delta = worldDeltaInto(tempWorldDelta, pickup.x, pickup.z, player.x, player.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.001) return;
  const speed = MAGNET_PICKUP_SPEED * (pickup.kind === "weapon" ? 0.7 : 1);
  const step = Math.min(distance, speed * dt);
  pickup.x = wrapWorld(pickup.x + (dx / distance) * step);
  pickup.z = wrapWorld(pickup.z + (dz / distance) * step);
  pickup.groundY = terrainHeightAt(pickup.x, pickup.z);
}

function updateMagnetPullVisual(pickup: Pickup, dt: number): void {
  pickup.magnetTrailClock = Math.max(0, (pickup.magnetTrailClock ?? 0) - dt);
  if (pickup.magnetTrailClock > 0) return;
  pickup.magnetTrailClock = 0.08;
  spawnEffect("airTrail", pickup.x, pickup.z, 0.26, {
    particles: 2,
    color: "#9fe8ff",
    y: 0.72,
    speed: 0.72,
    size: pickup.kind === "weapon" ? 0.2 : 0.16
  });
}

function updatePickupLightPool(): void {
  const player = state.player;
  if (!player) return;
  const lights = state.lights.pickupLights ?? [];
  let lightIndex = 0;
  for (const light of lights) light.intensity = 0;
  for (const pickup of state.pickups) {
    if (lightIndex >= lights.length) break;
    const distanceSq = worldDistanceSquared(player.x, player.z, pickup.x, pickup.z);
    if (distanceSq > 55 ** 2) continue;
    if (pickup.kind === "xp" && lightIndex > Math.floor(lights.length / 2)) continue;
    const light = lights[lightIndex];
    if (!light) break;
    const pickupPosition = renderPositionInto(tempRenderPosition, pickup.x, pickup.z);
    const color = pickup.kind === "weapon" ? 0xffc45c : pickup.kind === "heal" ? 0xa5ff8e : pickup.kind === "magnet" ? 0x9fe8ff : 0x7bd6ff;
    light.color.setHex(color);
    light.position.set(pickupPosition.x, pickup.mesh?.position.y ?? pickupY(pickup), pickupPosition.z);
    light.intensity = pickup.kind === "weapon" ? 1.55 : pickup.kind === "heal" ? 1.1 : pickup.kind === "magnet" ? 1.35 : 0.68;
    lightIndex += 1;
  }
}

function updateEffects(dt: number): void {
  measureTelemetryPhase("particleUpdateBatched", () => updateBatchedParticles(dt));
  measureTelemetryPhase("particleUpdateScene", () => updateSceneEffects(dt));
  state.muzzleFlash = Math.max(0, state.muzzleFlash - dt * 9);
  if (state.lights.muzzle) state.lights.muzzle.intensity = state.muzzleFlash * 10.5;
}

function updateSceneEffects(dt: number): void {
  updateTimedEffectQueue(state.effects, dt, {
    getElapsed: (effect) => effect.t,
    setElapsed: (effect, elapsed) => {
      effect.t = elapsed;
    },
    getLifetime: (effect) => effect.life,
    onUpdate: ({ effect, delta, progress }) => {
      const fade = Math.max(0, 1 - progress);
      setEffectOpacity(effect.mesh, fade);
      if (effect.sparks) {
        for (const spark of effect.sparks) {
          spark.vy -= 9.5 * delta;
          spark.mesh.position.x += spark.vx * delta;
          spark.mesh.position.y = Math.max(0.08, spark.mesh.position.y + spark.vy * delta);
          spark.mesh.position.z += spark.vz * delta;
          spark.mesh.rotation.x += spark.rx * delta;
          spark.mesh.rotation.y += spark.ry * delta;
        }
      } else {
        effect.mesh.scale.setScalar(effect.baseScale * (1 + progress * effect.expand));
      }
    },
    onExpire: (effect) => {
      if (effect.mesh) scene.remove(effect.mesh);
      if (effect.light) scene.remove(effect.light);
    }
  });
}

function updateRagdolls(dt: number): void {
  for (let i = state.ragdolls.length - 1; i >= 0; i -= 1) {
    const ragdoll = state.ragdolls[i];
    if (!ragdoll) continue;
    if (ragdoll.update(dt)) continue;
    scene.remove(ragdoll.root);
    state.ragdolls.splice(i, 1);
  }
}

function updateBossAttacks(dt: number): void {
  for (const boss of state.enemies) {
    if (!boss.boss || boss.hp <= 0) continue;
    boss.nextAttack -= dt;
    if (boss.nextAttack > 0) continue;
    const kind = resolveBossAttackKind(boss);
    if (kind === "dash") spawnBossDash(boss);
    else if (kind === "nova") spawnBossNova(boss);
    else spawnBossSlam(boss);
    const ramp = Math.min(1, state.time / SPAWN_PACING.rampSeconds);
    boss.nextAttack = BOSS_ATTACKS.cooldownSeconds - (BOSS_ATTACKS.cooldownSeconds - BOSS_ATTACKS.cooldownMinSeconds) * ramp;
  }
}

function resolveBossAttackKind(boss: Enemy): "slam" | "dash" | "nova" {
  const cycle = Math.floor(state.time / 6 + boss.seed) % 3;
  return cycle === 0 ? "slam" : cycle === 1 ? "dash" : "nova";
}

function spawnBossSlam(boss: Enemy): void {
  const target = state.player;
  if (!target) return;
  const radius = Math.max(4.8, boss.radius * BOSS_ATTACKS.slamRadiusMultiplier);
  addAttackIndicator({
    kind: "slam",
    x: target.x,
    z: target.z,
    radius,
    damage: boss.touch * 2.2,
    windup: BOSS_ATTACKS.windupSeconds,
    ttl: BOSS_ATTACKS.windupSeconds + BOSS_ATTACKS.hitFlashSeconds
  });
}

function spawnBossNova(boss: Enemy): void {
  addAttackIndicator({
    kind: "nova",
    x: boss.x,
    z: boss.z,
    radius: BOSS_ATTACKS.novaRadius + boss.radius * 1.4,
    damage: boss.touch * 1.7,
    windup: BOSS_ATTACKS.windupSeconds * 0.95,
    ttl: BOSS_ATTACKS.windupSeconds + BOSS_ATTACKS.hitFlashSeconds
  });
}

function spawnBossDash(boss: Enemy): void {
  const player = state.player;
  if (!player) return;
  const angle = angleTo(boss.x, boss.z, player.x, player.z);
  const length = BOSS_ATTACKS.dashLength + boss.radius * 2.3;
  const width = Math.max(3.2, boss.radius * BOSS_ATTACKS.dashWidthMultiplier);
  addAttackIndicator({
    kind: "dash",
    x: wrapWorld(boss.x + Math.cos(angle) * length * 0.5),
    z: wrapWorld(boss.z + Math.sin(angle) * length * 0.5),
    originX: boss.x,
    originZ: boss.z,
    angle,
    length,
    width,
    damage: boss.touch * 2,
    windup: BOSS_ATTACKS.windupSeconds * 0.82,
    ttl: BOSS_ATTACKS.windupSeconds + BOSS_ATTACKS.hitFlashSeconds
  });
}

function addAttackIndicator(indicator: AttackIndicatorSpec): void {
  let mesh: IndicatorMesh;
  if (indicator.kind === "dash") {
    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(indicator.length, indicator.width),
      new THREE.MeshBasicMaterial({ color: 0xff5d4d, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -indicator.angle;
  } else {
    mesh = new THREE.Mesh(
      new THREE.CircleGeometry(indicator.radius, 48),
      new THREE.MeshBasicMaterial({ color: indicator.kind === "nova" ? 0xff9a45 : 0xff5d4d, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
  }
  const position = renderPositionInto(tempRenderPosition, indicator.x, indicator.z);
  mesh.position.set(position.x, terrainHeightAt(indicator.x, indicator.z) + 0.07, position.z);
  scene.add(mesh);
  state.attackIndicators.push({ ...indicator, mesh, t: 0, applied: false });
  playSynthCue("telegraph", indicator.kind === "dash" ? 1.1 : 0.9);
}

function updateAttackIndicators(dt: number): void {
  for (let i = state.attackIndicators.length - 1; i >= 0; i -= 1) {
    const indicator = state.attackIndicators[i];
    if (!indicator) continue;
    indicator.t += dt;
    const position = renderPositionInto(tempRenderPosition, indicator.x, indicator.z);
    indicator.mesh.position.set(position.x, terrainHeightAt(indicator.x, indicator.z) + 0.07, position.z);
    const armed = indicator.t >= indicator.windup;
    indicator.mesh.material.opacity = armed ? 0.72 : 0.18 + Math.sin(indicator.t * 18) * 0.12;
    if (armed && !indicator.applied) {
      indicator.applied = true;
      if (attackHitsPlayer(indicator)) {
        damagePlayer(indicator.damage, {
          sourceX: indicator.originX ?? indicator.x,
          sourceZ: indicator.originZ ?? indicator.z,
          knockbackForce: indicator.kind === "dash" ? 34 : 26
        });
        pulseShake(0.28, 0.5);
      }
      spawnEffect("blast", indicator.x, indicator.z, 0.26, { color: indicator.kind === "nova" ? "#ff9a45" : "#ff5d4d" });
      spawnPulseRing(indicator.x, indicator.z, indicator.kind === "nova" ? "#ff9a45" : "#ff5d4d", 0.34, indicator.kind === "dash" ? 1.5 : Math.max(1.2, indicator.radius * 0.25), 3.8);
      playSynthCue("slam", indicator.kind === "nova" ? 1.2 : 1);
    }
    if (indicator.t >= indicator.ttl) removeFromList(state.attackIndicators, i);
  }
}

function attackHitsPlayer(indicator: AttackIndicator): boolean {
  const player = state.player;
  if (!player || playerClearsGroundHits()) return false;
  if (indicator.kind !== "dash") {
    return worldDistanceSquared(indicator.x, indicator.z, player.x, player.z) <= indicator.radius ** 2;
  }
  const delta = worldDeltaInto(tempWorldDelta, indicator.originX, indicator.originZ, player.x, player.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const along = dx * Math.cos(indicator.angle) + dz * Math.sin(indicator.angle);
  const lateral = -dx * Math.sin(indicator.angle) + dz * Math.cos(indicator.angle);
  return along >= 0 && along <= indicator.length && Math.abs(lateral) <= indicator.width * 0.5;
}

function updateHazards(dt: number): void {
  const player = state.player;
  if (!player) return;
  for (const hazard of state.hazards) {
    hazard.mesh.material.opacity = 0.18 + Math.sin(state.time * 2 + hazard.seed) * 0.04;
    hazard.damageClock = Math.max(0, (hazard.damageClock ?? 0) - dt);
    const playerInside = !playerClearsGroundHits() && worldDistanceSquared(player.x, player.z, hazard.x, hazard.z) < hazard.radius ** 2;
    if (playerInside && hazard.damageClock <= 0) {
      damagePlayer((hazard.dps ?? 0) * HAZARD_DAMAGE_TICK_SECONDS, {
        knockback: false,
        invulnSeconds: HAZARD_DAMAGE_TICK_SECONDS * 0.9,
        minDamage: 0.25
      });
      hazard.damageClock = HAZARD_DAMAGE_TICK_SECONDS;
    } else if (!playerInside) {
      hazard.damageClock = Math.min(hazard.damageClock, 0.08);
    }
    const candidates = queryLiveEnemies(hazard.x, hazard.z, hazard.radius);
    for (const enemy of candidates) {
      if (enemy.hp > 0) enemy.slow = Math.max(enemy.slow, 0.3);
    }
  }
}

function updateNetwork(dt: number): void {
  const player = state.player;
  if (!networkClient || !state.online || !player) return;
  networkClock -= dt;
  if (networkClock > 0) return;
  networkClock = 0.08;
  const aim = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const weapons = state.weaponSlots.map((id) => ({
    id,
    level: getWeaponLevel(id),
    evolved: state.evolvedWeapons.has(id)
  }));
  const passives = state.passiveSlots.map((id) => ({
    id,
    level: state.passiveLevels.get(id) ?? 1,
    effects: passiveTeamworkEffectIds(id)
  }));
  networkClient.sendInput?.({
    id: state.playerId,
    name: player.name,
    classId: state.selectedClassId,
    x: round(player.x),
    y: round(player.z),
    z: round(player.z),
    angle: aim,
    hp: Math.max(0, Math.round(player.hp)),
    alive: player.hp > 0,
    weapons,
    passives
  });
}

function networkPlayerEntries(snapshot: unknown): Array<[string, Record<string, unknown>]> {
  if (!isRecord(snapshot)) return [];
  const nestedState = isRecord(snapshot.state) ? snapshot.state : null;
  const players = snapshot.players ?? nestedState?.players;
  const entries: Array<[string, Record<string, unknown>]> = [];
  if (Array.isArray(players)) {
    for (const player of players) {
      if (!isRecord(player)) continue;
      entries.push([typeof player.id === "string" ? player.id : "", player]);
    }
    return entries;
  }
  if (!isRecord(players)) return entries;
  for (const [id, player] of Object.entries(players)) {
    if (isRecord(player)) entries.push([id, player]);
  }
  return entries;
}

function progressionItemIdentity(rawItem: unknown): { id: string; value: Record<string, unknown> | null } | null {
  if (typeof rawItem === "string") return { id: rawItem, value: null };
  if (!isRecord(rawItem)) return null;
  const id = rawItem.id ?? rawItem.weaponId ?? rawItem.passiveId;
  return typeof id === "string" ? { id, value: rawItem } : null;
}

function progressionItemLevel(value: Record<string, unknown> | null): number {
  return Math.max(1, Math.min(99, Math.floor(Number(value?.level ?? value?.lvl ?? 1) || 1)));
}

function normalizeRemoteWeapons(value: unknown): RemoteWeaponProgression[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: RemoteWeaponProgression[] = [];
  for (const rawItem of value.slice(0, 16)) {
    const identity = progressionItemIdentity(rawItem);
    if (!identity || seen.has(identity.id)) continue;
    seen.add(identity.id);
    const evolved = identity.value?.evolved;
    items.push({
      id: identity.id,
      level: progressionItemLevel(identity.value),
      evolved: evolved === true || evolved === 1 || evolved === "true"
    });
  }
  return items;
}

function normalizeRemotePassives(value: unknown): RemotePassiveProgression[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: RemotePassiveProgression[] = [];
  for (const rawItem of value.slice(0, 16)) {
    const identity = progressionItemIdentity(rawItem);
    if (!identity || seen.has(identity.id)) continue;
    seen.add(identity.id);
    const effects = identity.value?.effects;
    items.push({
      id: identity.id,
      level: progressionItemLevel(identity.value),
      ...(Array.isArray(effects)
        ? { effects: effects.filter((effectId): effectId is string => typeof effectId === "string").slice(0, 8) }
        : {})
    });
  }
  return items;
}

function applyNetworkSnapshot(snapshot: unknown): void {
  if (!state.online) {
    clearRemotePlayers();
    return;
  }
  const entries = networkPlayerEntries(snapshot);
  const localIds = new Set<string>();
  if (state.playerId) localIds.add(state.playerId);
  if (networkClient?.playerId) localIds.add(networkClient.playerId);
  const seen = new Set<string>();
  for (const [id, player] of entries) {
    const playerId = typeof player.id === "string" ? player.id : null;
    if ((playerId && localIds.has(playerId)) || localIds.has(id)) continue;
    const remoteId = playerId ?? id;
    if (!remoteId) continue;
    const progression = isRecord(player.progression) ? player.progression : {};
    const rawClassId = typeof player.classId === "string" ? player.classId
      : typeof player.selectedClassId === "string" ? player.selectedClassId
        : typeof progression.classId === "string" ? progression.classId
          : typeof progression.selectedClassId === "string" ? progression.selectedClassId
            : null;
    const weaponInput = player.weapons ?? progression.weapons;
    const passiveInput = player.passives ?? player.passiveItems ?? progression.passives ?? progression.passiveItems;
    seen.add(remoteId);
    let remote = remotePlayers.get(remoteId);
    if (!remote) {
      const actor = createActorVisual("ally", state.textures.ally, 2.7, 3.8, 0.030);
      remote = {
        mesh: actor.mesh,
        animator: actor.animator,
        animatorRoot: actor.animatorRoot,
        animated: actor.animated,
        proceduralPose: actor.proceduralPose,
        proceduralMode: actor.proceduralMode,
        activeAnimation: actor.activeAnimation,
        activeAnimationSource: actor.activeAnimationSource,
        overlayAnimation: actor.overlayAnimation ?? null,
        animationClock: actor.animationClock,
        lastX: null,
        lastZ: null,
        classId: null,
        classColor: "#7bd6ff",
        weapons: [],
        passives: [],
        appliedClassColor: null,
        appliedProgressionTintKey: null
      };
      scene.add(remote.mesh);
      remotePlayers.set(remoteId, remote);
    }
    const classId = rawClassId ?? remote.classId ?? null;
    const playerClass = classId ? playerClassesById.get(classId) : null;
    const classColor = playerClass?.color ?? "#7bd6ff";
    const weapons = weaponInput === undefined ? remote.weapons : normalizeRemoteWeapons(weaponInput);
    const passives = passiveInput === undefined ? remote.passives : normalizeRemotePassives(passiveInput);
    remote.classId = classId;
    remote.classColor = classColor;
    remote.weapons = weapons;
    remote.passives = passives;
    const progressionPower = clamp01((weapons.reduce((sum, weapon) => sum + weapon.level + (weapon.evolved ? 2 : 0), 0) + passives.reduce((sum, passive) => sum + passive.level, 0)) / 48);
    const progressionTintKey = `${classColor}|${weapons.map((weapon) => `${weapon.id}:${weapon.level}:${weapon.evolved ? 1 : 0}`).join(",")}|${passives.map((passive) => `${passive.id}:${passive.level}`).join(",")}`;
    remote.mesh.name = `remote-ally-${remoteId}`;
    remote.mesh.userData = {
      ...(remote.mesh.userData ?? {}),
      networkProgression: {
        classId,
        className: playerClass?.name ?? classId ?? "Ally",
        weapons,
        passives
      }
    };
    if (remote.appliedProgressionTintKey !== progressionTintKey) {
      remote.appliedClassColor = classColor;
      remote.appliedProgressionTintKey = progressionTintKey;
      const tint = new THREE.Color(classColor);
      const colorStrength = 0.16 + progressionPower * 0.12;
      const emissiveStrength = 0.10 + progressionPower * 0.08;
      const tintMaterial = (material: Three.Material): void => {
        const userData = isRecord(material.userData) ? material.userData : {};
        material.userData = userData;
        if ("color" in material && material.color instanceof THREE.Color) {
          const baseColor = userData.baseNetworkColor instanceof THREE.Color
            ? userData.baseNetworkColor
            : material.color.clone();
          userData.baseNetworkColor = baseColor;
          material.color.copy(baseColor).lerp(tint, colorStrength);
        }
        if ("emissive" in material && material.emissive instanceof THREE.Color) {
          const baseEmissive = userData.baseNetworkEmissive instanceof THREE.Color
            ? userData.baseNetworkEmissive
            : material.emissive.clone();
          userData.baseNetworkEmissive = baseEmissive;
          material.emissive.copy(baseEmissive).lerp(tint, emissiveStrength);
        }
      };
      remote.mesh.traverse((child) => forEachObjectMaterial(child, tintMaterial));
    }
    const x = Number(player.x ?? 0);
    const z = Number(player.z ?? player.y ?? 0);
    remote.mesh.position.set(x, terrainHeightAt(x, z) + (remote.animated ? 0 : 1.6), z);
    const moved = remote.lastX === null || remote.lastZ === null || distanceSquared(remote.lastX, remote.lastZ, x, z) > 0.01;
    updateActorAnimation(remote, 0.08, moved);
    remote.lastX = x;
    remote.lastZ = z;
  }
  for (const [id, remote] of remotePlayers) {
    if (seen.has(id)) continue;
    scene.remove(remote.mesh);
    remotePlayers.delete(id);
  }
}

function clearRemotePlayers(): void {
  for (const remote of remotePlayers.values()) scene.remove(remote.mesh);
  remotePlayers.clear();
  clearAllyRings();
}

function updateCamera(dt: number): void {
  const targetX = state.player?.x ?? 0;
  const targetZ = state.player?.z ?? 0;
  const shake = state.shake > 0 ? state.shakePower * state.shake * 0.4 : 0;
  state.shake = Math.max(0, state.shake - dt * 2.4);
  measureTelemetryPhase("cameraLights", () => {
    if (state.lights.moon) {
      const orbit = state.time * 0.045;
      state.lights.moon.position.set(Math.cos(orbit) * 34, 34 + Math.sin(orbit * 0.7) * 5, Math.sin(orbit) * 34);
    }
    if (state.lights.sun) {
      const orbit = state.time * 0.035 + Math.PI;
      state.lights.sun.position.set(Math.cos(orbit) * 30, 19 + Math.sin(orbit * 0.6) * 2, Math.sin(orbit) * 30);
    }
    if (state.lights.cryptFill) state.lights.cryptFill.intensity = 1.05 + Math.sin(state.time * 0.65) * 0.22;
    if (state.lights.rim) state.lights.rim.intensity = 1.55 + Math.sin(state.time * 0.9) * 0.42;
    if (state.lights.playerGlow && state.player) {
      state.lights.playerGlow.position.set(state.player.x, actorGroundHeight(state.player) + 2.15 + (state.player.jumpY ?? 0), state.player.z);
      state.lights.playerGlow.intensity = 1.45 + Math.sin(state.time * 5.4) * 0.28;
    }
  });
  measureTelemetryPhase("propGlows", updatePropGlows);
  measureTelemetryPhase("groundTiles", updateGroundTilePatch);
  measureTelemetryPhase("staticVisuals", () => updateWrappedStaticVisuals(dt));
  const rig = cameraRig;
  if (!rig) return;
  measureTelemetryPhase("cameraRig", () => {
    applyGamepadCameraOrbit(dt);
    dampCameraRigState(dt);
    updateCameraObstacles();
    rig
      .setOffset(resolveCameraOffset().x, tempCameraOffset.y, tempCameraOffset.z)
      .setTarget(tempCameraTarget.set(targetX, CAMERA_TARGET_HEIGHT + actorGroundHeight(state.player) + (state.player?.jumpY ?? 0), targetZ))
      .update(dt, cameraObstacleBuffer);
    rig.getDesiredPosition(tempCameraDesired);
    const cameraFocusX = tempCameraTarget.x;
    const cameraFocusY = tempCameraTarget.y + CAMERA_LOOK_AT_HEIGHT;
    const cameraFocusZ = tempCameraTarget.z;
    const actualCameraDistance = Math.hypot(camera.position.x - cameraFocusX, camera.position.y - cameraFocusY, camera.position.z - cameraFocusZ);
    cameraBlocked = actualCameraDistance < cameraDistance - 0.25;
    if (shake > 0) {
      rig.applyShake((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake);
    }
    cameraRigSnapshot = readCameraRigSnapshot();
    setAimFromCamera();
    updateCameraOccluderFade();
    syncReticleToAimWorld();
  });
}

function applyGamepadCameraOrbit(dt: number): void {
  if (!cameraRig || gamepadState.inputMode !== "controller") return;
  if (Math.abs(gamepadState.lookX) <= 0.001 && Math.abs(gamepadState.lookY) <= 0.001) return;
  markManualAim();
  const sensitivity = state.settings.stickSensitivity;
  const pitchSign = state.settings.invertY ? -1 : 1;
  desiredCameraYaw -= gamepadState.lookX * CAMERA_STICK_YAW_SPEED * dt * sensitivity;
  desiredCameraPitch = clamp(desiredCameraPitch + gamepadState.lookY * CAMERA_STICK_PITCH_SPEED * dt * sensitivity * pitchSign, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
}

function updateCameraObstacles(): void {
  if (!cameraRig || !state.player) return;
  cameraObstacleBuffer.length = 0;
  const props = PERF_FLAGS.staticPropBsp ? state.visibleStaticProps : state.props;
  for (const prop of props) {
    if (prop.visible === false) continue;
    const collider = prop.userData?.collider;
    if (!collider?.blocking) continue;
    const worldX = prop.userData?.worldX;
    const worldZ = prop.userData?.worldZ;
    if (typeof worldX !== "number" || typeof worldZ !== "number") continue;
    const position = renderPosition(worldX, worldZ);
    if (distanceSquared(position.x, position.z, state.player.x, state.player.z) > CAMERA_VIEW_RADIUS * CAMERA_VIEW_RADIUS) continue;
    cameraObstacleBuffer.push(prop);
  }
}

function updateCameraOccluderFade(): void {
  if (!cameraRigSnapshot || !state.player) return;
  const fromX = camera.position.x;
  const fromZ = camera.position.z;
  const toX = cameraRigSnapshot.lookAt[0];
  const toZ = cameraRigSnapshot.lookAt[2];
  const props = PERF_FLAGS.staticPropBsp ? state.visibleStaticProps : state.props;
  for (const prop of props) {
    const collider = prop.userData?.collider;
    if (!collider?.blocking || prop.visible === false) {
      setPropOccluderOpacity(prop, 1);
      continue;
    }
    const worldX = prop.userData?.worldX;
    const worldZ = prop.userData?.worldZ;
    if (typeof worldX !== "number" || typeof worldZ !== "number") {
      setPropOccluderOpacity(prop, 1);
      continue;
    }
    const position = renderPosition(worldX, worldZ);
    const radius = resolveCameraObstacleRadius(collider) + CAMERA_OCCLUDER_FADE_EXTRA_RADIUS;
    const distanceSq = pointSegmentDistanceSquared(position.x, position.z, fromX, fromZ, toX, toZ);
    setPropOccluderOpacity(prop, distanceSq <= radius * radius ? CAMERA_OCCLUDER_FADE_OPACITY : 1);
  }
}

function resolveCameraObstacleRadius(collider: PropCollider): number {
  return collider.kind === "box"
    ? Math.hypot(collider.halfX ?? 1, collider.halfZ ?? 1)
    : collider.radius ?? 1;
}

function pointSegmentDistanceSquared(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.000001) return distanceSquared(px, pz, ax, az);
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1);
  const x = ax + dx * t;
  const z = az + dz * t;
  return distanceSquared(px, pz, x, z);
}

function setPropOccluderOpacity(prop: Three.Object3D, amount: number): void {
  const opacity = clamp(amount, 0, 1);
  prop.userData = prop.userData ?? {};
  if (Math.abs((prop.userData.occluderOpacity ?? 1) - opacity) < 0.001) return;
  prop.userData.occluderOpacity = opacity;
  prop.traverse((child) => forEachObjectMaterial(child, (material) => {
    preparePropOccluderMaterial(material, true);
    const baseOpacity = typeof material.userData.baseOccluderOpacity === "number"
      ? material.userData.baseOccluderOpacity
      : 1;
    material.opacity = baseOpacity * opacity;
  }));
}

function preparePropOccluderMaterials(root: Three.Object3D): void {
  root.traverse((child) => forEachObjectMaterial(child, (material) => preparePropOccluderMaterial(material)));
}

function preparePropOccluderMaterial(material: Three.Material, enableFade = false): void {
  material.userData = material.userData ?? {};
  if (material.userData.baseOccluderOpacity === undefined) material.userData.baseOccluderOpacity = material.opacity ?? 1;
  if (!enableFade) return;
  if (material.userData.occluderFadePrepared) return;
  material.userData.occluderFadePrepared = true;
  material.transparent = true;
  material.depthWrite = true;
  material.needsUpdate = true;
}

function setAimFromCamera(): void {
  if (!state.player) return;
  const yaw = cameraRigSnapshot?.yaw ?? cameraYaw;
  const aimX = -Math.sin(yaw);
  const aimZ = -Math.cos(yaw);
  setAimWorld(state.player.x + aimX * CAMERA_AIM_DISTANCE, state.player.z + aimZ * CAMERA_AIM_DISTANCE);
}

function fireWeapon(weapon: WeaponRuntime, aimAngle: number): void {
  const player = state.player;
  if (!player || fireSpecialWeapon(weapon, aimAngle)) return;
  state.activeWeaponId = weapon.id;
  updatePlayerWeaponVisual(aimAngle);
  const projectileSize = Math.max(0.45, weapon.projectileSizeMultiplier ?? 1);
  const muzzle = getPlayerWeaponMuzzlePosition(aimAngle);
  const flashX = muzzle.x;
  const flashZ = muzzle.z;
  if (state.lights.muzzle) {
    const flashPosition = renderPosition(flashX, flashZ);
    state.lights.muzzle.position.set(flashPosition.x, muzzle.y, flashPosition.z);
  }
  state.muzzleFlash = Math.max(state.muzzleFlash, weapon.id === "shotgun" ? 1.4 : 0.85);
  player.animLock = Math.max(player.animLock ?? 0, Math.min(0.22, weapon.cooldown * 0.55));
  playActorAnimation(player, weapon.id === "flame" ? "cast" : "shoot", 0.025);
  for (let i = 0; i < weapon.pellets; i += 1) {
    const spread = (i - (weapon.pellets - 1) / 2) * (weapon.spread / Math.max(1, weapon.pellets - 1 || 1));
    const angle = aimAngle + spread + (Math.random() - 0.5) * weapon.spread * 0.22;
    const vx = Math.cos(angle) * weapon.speed;
    const vz = Math.sin(angle) * weapon.speed;
    const mesh = createProjectileVisual(weapon, angle);
    const x = wrapWorld(muzzle.x + Math.cos(angle) * 0.12);
    const z = wrapWorld(muzzle.z + Math.sin(angle) * 0.12);
    const bulletPosition = renderPositionInto(tempRenderPosition, x, z);
    mesh.position.set(bulletPosition.x, muzzle.y, bulletPosition.z);
    scene.add(mesh);
    addCombatBullet({
      x,
      z,
      y: muzzle.y,
      heightOffset: PROJECTILE_HEIGHT_OFFSET,
      vx,
      vz,
      mesh,
      color: weapon.color,
      damage: weapon.damage,
      damageType: weapon.damageType,
      eliteDamageMultiplier: weapon.eliteDamageMultiplier,
      critChance: weapon.critChance,
      critMultiplier: weapon.critMultiplier,
      radius: (weapon.evolved ? 0.44 : 0.35) * projectileSize,
      pierce: weapon.pierce,
      ttl: weapon.range / weapon.speed,
      speed: weapon.speed,
      knockback: weapon.knockback,
      splashDamageMultiplier: weapon.splashDamageMultiplier,
      splashRadius: weapon.splashRadius
    });
  }
  spawnEffect("muzzle", flashX, flashZ, 0.22, { angle: aimAngle, color: weapon.color, worldY: muzzle.y });
  spawnBeamPreview(muzzle, aimAngle, Math.min(weapon.range, weapon.id === "shotgun" ? 10 : 18), weapon.color);
  playSynthCue("shot", 1, { weaponId: weapon.id, color: weapon.color });
}

function spawnEnemy(typeId: string, options: { boss?: boolean } = {}): Enemy {
  const spec = data.enemies[typeId] ?? Object.values(data.enemies)[0];
  if (!spec) throw new Error(`Cannot spawn enemy ${typeId}: no enemy definitions are loaded.`);
  const angle = runRandom() * Math.PI * 2;
  const radius = data.arena.spawnRadius + runRandom() * 10;
  const origin = state.player ?? { x: 0, z: 0 };
  const x = wrapWorld(origin.x + Math.cos(angle) * radius);
  const z = wrapWorld(origin.z + Math.sin(angle) * radius);
  const textureKey = pickEnemySkin(spec.texture ?? "zombieA");
  const baseScale = Math.max(1.05, spec.radius);
  const displayScale = baseScale * (options.boss ? BOSS_PACING.sizeMultiplier : 1);
  const actorScale = PLAYER_MODEL_SCALE * displayScale;
  const animatedEnemyCount = state.enemies.reduce((count, enemy) => count + (enemy.animated && !enemy.boss ? 1 : 0), 0);
  const useAnimatedActor = options.boss || animatedEnemyCount < MAX_ANIMATED_ENEMIES;
  const curseMultiplier = Math.max(0.25, (state.progressionStats ?? resolveProgressionStats()).curseMultiplier ?? 1);
  const maxHp = spec.hp * (1 + state.time / 340) * (options.boss ? BOSS_PACING.healthMultiplier : 1) * curseMultiplier;
  const actor: ActorAnimationState = useAnimatedActor
    ? createActorVisual(textureKey, state.textures[textureKey] ?? state.textures.zombieA, 2.7 * displayScale, PLAYER_HEIGHT_WORLD * displayScale, actorScale, {
      allowAnimated: true,
      castShadow: options.boss,
      receiveShadow: false
    })
    : {
      mesh: null,
      animator: null,
      animatorRoot: null,
      animated: false,
      proceduralPose: null,
      proceduralMode: "none",
      activeAnimation: "idle",
      activeAnimationSource: null,
      overlayAnimation: null,
      animationClock: 0
    };
  const enemy: Enemy = {
    typeId,
    boss: Boolean(options.boss),
    x,
    y: z,
    z,
    mesh: actor.mesh,
    batchKey: actor.mesh ? null : textureKey,
    animator: actor.animator,
    animatorRoot: actor.animatorRoot,
    animated: actor.animated,
    proceduralPose: actor.proceduralPose,
    proceduralMode: actor.proceduralMode,
    activeAnimation: actor.activeAnimation,
    activeAnimationSource: actor.activeAnimationSource,
    overlayAnimation: actor.overlayAnimation ?? null,
    animationClock: actor.animationClock,
    hp: maxHp,
    maxHp,
    speed: spec.speed * (1 + state.time / 520) * (options.boss ? BOSS_PACING.speedMultiplier : 1),
    touch: resolveEnemyTouchDamage(typeId, Boolean(options.boss)),
    radius: displayScale,
    score: spec.score * (options.boss ? 12 : 1),
    scale: displayScale,
    slow: 0,
    knockX: 0,
    knockZ: 0,
    textureKey,
    animClock: runRandom() * ENEMY_ANIMATION_STEP_SECONDS,
    animStep: options.boss ? BOSS_ANIMATION_STEP_SECONDS : ENEMY_ANIMATION_STEP_SECONDS,
    nextAttack: options.boss ? state.time + BOSS_ATTACKS.firstAttackDelaySeconds : Number.POSITIVE_INFINITY,
    seed: runRandom() * 99,
    lastHit: { x: -Math.cos(angle), z: -Math.sin(angle), force: 1 }
  };
  setActorPosition(enemy, x, z);
  playActorAnimation(enemy, "run", 0.02);
  if (enemy.mesh) scene.add(enemy.mesh);
  state.enemies.push(enemy);
  markEnemySpatialDirty();
  return enemy;
}

function pickEnemySkin(textureKey: string): string {
  if (textureKey === "zombieA") return runRandom() < 0.48 ? "zombieA" : "zombieB";
  return textureKey;
}

function resolveEnemyTouchDamage(typeId: string, boss = false): number {
  const rank = clamp01(resolveEnemySpawnRank(typeId) + (boss ? 0.12 : 0));
  return Math.round(ENEMY_CONTACT_DAMAGE_MIN + (ENEMY_CONTACT_DAMAGE_MAX - ENEMY_CONTACT_DAMAGE_MIN) * rank);
}

function resolveEnemySpawnRank(typeId: string): number {
  const waves = data.waves ?? [];
  const waveCount = Math.max(1, waves.length - 1);
  const firstWave = waves.findIndex((wave) => {
    if (wave.eliteId === typeId) return true;
    return (wave.mix ?? []).some(([id]) => id === typeId);
  });
  if (firstWave >= 0) return waveCount <= 0 ? 0 : firstWave / waveCount;
  const sorted = Object.entries(data.enemies ?? {}).sort((a, b) => enemyRankWeight(a[1]) - enemyRankWeight(b[1]));
  const index = sorted.findIndex(([id]) => id === typeId);
  if (index < 0 || sorted.length <= 1) return 0;
  return index / (sorted.length - 1);
}

function enemyRankWeight(enemy: EnemyDefinition): number {
  return (enemy.score ?? 1) * 7 + (enemy.hp ?? 1) * 0.08 + (enemy.speed ?? 1) * 1.6 + (enemy.radius ?? 1) * 2;
}

function getEnemyDamageTable(): Record<string, { rank: number; touch: number; bossTouch: number }> {
  return Object.fromEntries(Object.keys(data.enemies ?? {}).map((id) => [
    id,
    {
      rank: round(resolveEnemySpawnRank(id)),
      touch: resolveEnemyTouchDamage(id, false),
      bossTouch: resolveEnemyTouchDamage(id, true)
    }
  ]));
}

function powerupDropChance(baseChance: number, enemy: Enemy | null = null): number {
  const luck = Math.max(0, (state.progressionStats ?? resolveProgressionStats()).luckMultiplier ?? 1);
  const bossMultiplier = enemy?.boss ? 4 : 1;
  return clamp01((baseChance ?? 0) * POWERUP_DROP_MULTIPLIER * luck * bossMultiplier);
}

function xpDropChance(): number {
  const luck = Math.max(0, (state.progressionStats ?? resolveProgressionStats()).luckMultiplier ?? 1);
  return clamp01(XP_DROP_CHANCE * luck);
}

function killEnemy(index: number): void {
  const enemy = state.enemies[index];
  if (!enemy) return;
  const eliteDeath = enemy.boss || resolveEnemySpawnRank(enemy.typeId) >= 0.66;
  state.kills += 1;
  registerComboKill(enemy);
  triggerBloodHourglassDeathBloom(enemy);
  if (runRandom() < xpDropChance()) spawnPickup("xp", enemy.x, enemy.z);
  if (runRandom() < powerupDropChance(0.07, enemy)) spawnPickup("weapon", enemy.x, enemy.z);
  if (runRandom() < powerupDropChance(data.pickupChances.magnet ?? MAGNET_DROP_CHANCE, enemy)) spawnPickup("magnet", enemy.x, enemy.z);
  if (runRandom() < powerupDropChance(data.pickupChances.heal ?? 0, enemy)) spawnPickup("heal", enemy.x, enemy.z);
  spawnEnemyRagdoll(enemy);
  spawnEffect("blast", enemy.x, enemy.z, eliteDeath ? 0.56 : 0.42, { color: eliteDeath ? "#ffd27d" : "#bfff88", particles: eliteDeath ? 26 : 17, speed: eliteDeath ? 8.6 : 6.2, size: eliteDeath ? 0.58 : 0.42 });
  spawnPulseRing(enemy.x, enemy.z, enemy.boss ? "#ff5dff" : eliteDeath ? "#ffd27d" : "#caff78", enemy.boss ? 0.62 : eliteDeath ? 0.46 : 0.34, enemy.boss ? 2.7 : eliteDeath ? 1.75 : 1.1, enemy.boss ? 6.4 : eliteDeath ? 4.4 : 3.2);
  spawnFloatingText(enemy.boss ? "BOSS DOWN" : eliteDeath ? "ELITE DOWN" : "+1", enemy.x, enemy.z, enemy.boss ? "#ffd0ff" : eliteDeath ? "#ffd27d" : "#d7ff8d", enemy.boss ? 1.28 : eliteDeath ? 1.14 : 0.94, { targetHeight: actorFloatingTextHeight(enemy, 0.55) });
  playSynthCue(enemy.boss ? "bossKill" : "kill", enemy.boss ? 1.5 : 1);
  removeFromList(state.enemies, index);
  markEnemySpatialDirty();
  pulseShake(eliteDeath ? 0.26 : 0.16, eliteDeath ? 0.38 : 0.22);
}

function spawnEnemyRagdoll(enemy: Enemy): void {
  try {
    const force = enemy.lastHit ?? { x: 0, z: 0, force: 1 };
    const position = renderPosition(enemy.x, enemy.z);
    const rawRagdoll = threeView.createRagdoll({
      position: [position.x, actorGroundHeight(enemy) + 0.05, position.z],
      incomingForce: [force.x * force.force, 1.6, force.z * force.force],
      color: enemy.typeId?.includes("brute") ? "#8d6f42" : "#6f9c61",
      material: getRagdollMaterial(enemy.textureKey ?? pickEnemySkin("zombieA")),
      scale: enemy.scale * 1.05,
      ttl: 3.2,
      spread: 4.2,
      bounce: 0.24
    });
    const root = requireRuntimeInstance(rawRagdoll.root, THREE.Object3D, "Arena ragdoll root");
    const ragdoll: ArenaRagdoll = { ...rawRagdoll, root };
    scene.add(root);
    state.ragdolls.push(ragdoll);
  } catch {
    // Ragdoll support is optional if the host swaps in a minimal Three build.
  }
}

function getRagdollMaterial(textureKey: string): Three.MeshStandardMaterial {
  return cachedMeshStandardMaterial(`material:ragdoll:${textureKey}`, () => {
    telemetry.materialCreates += 1;
    return new THREE.MeshStandardMaterial({
      map: state.textures[textureKey] ?? state.textures.zombieA,
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.02
    });
  });
}

function resolveWeaponDropPayload(): StatLevelChoice {
  return rollChestStatReward();
}

function maxDropsOnGround(): number {
  return Math.max(1, Math.floor(Number(data.balance?.run?.maxDropsOnGround ?? 90) || 90));
}

function pickupTtlSeconds(kind: Pickup["kind"]): number {
  const definitions = Object.values(data.pickups ?? {});
  const match = definitions.find((pickup) => {
    if (!pickup || typeof pickup !== "object") return false;
    if (kind === "xp") return pickup.tags?.includes?.("xp");
    if (kind === "heal") return pickup.tags?.includes?.("heal");
    if (kind === "magnet") return pickup.tags?.includes?.("magnet");
    if (kind === "weapon") return pickup.tags?.includes?.("upgrade") || pickup.tags?.includes?.("temporary-weapon");
    return pickup.id === kind;
  });
  const fallback = kind === "weapon" ? 120 : kind === "magnet" ? 24 : kind === "heal" ? 30 : 68;
  return Math.max(4, Number(match?.lifetimeSeconds ?? fallback) || fallback);
}

function trimPickupOverflowForSpawn(): void {
  if (state.benchStress) return;
  const cap = maxDropsOnGround();
  while (state.pickups.length >= cap) {
    let removeIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < state.pickups.length; i += 1) {
      const pickup = state.pickups[i];
      const age = state.time - (pickup.spawnedAt ?? state.time);
      const distanceScore = state.player ? worldDistanceSquared(state.player.x, state.player.z, pickup.x, pickup.z) / 10000 : 0;
      const score = age + distanceScore;
      if (score > bestScore) {
        bestScore = score;
        removeIndex = i;
      }
    }
    removeFromList(state.pickups, removeIndex);
  }
}

function spawnPickup(kind: Pickup["kind"], x: number, z: number): void {
  trimPickupOverflowForSpawn();
  let texture = state.textures.shard;
  let scale = 1.4;
  let payload: StatLevelChoice | null = null;
  if (kind === "heal") {
    texture = state.textures.heal;
    scale = 1.55;
  } else if (kind === "magnet") {
    texture = state.textures.magnet;
    scale = 2.15;
  } else if (kind === "weapon") {
    texture = state.textures.crate;
    scale = 1.75;
    payload = resolveWeaponDropPayload();
  }
  scale *= PICKUP_VISUAL_SCALE_MULTIPLIER;
  x = wrapWorld(x);
  z = wrapWorld(z);
  const groundY = terrainHeightAt(x, z);
  let mesh = null;
  if (!PERF_FLAGS.batchPickups) {
    mesh = createPickupVisual(kind, texture, scale, payload);
    const pickupPosition = renderPosition(x, z);
    mesh.position.set(pickupPosition.x, groundY + 1.15, pickupPosition.z);
    scene.add(mesh);
  }
  state.pickups.push({
    kind,
    payload,
    x,
    z,
    mesh,
    light: null,
    groundY,
    texture,
    scale,
    t: Math.random() * 4,
    spawnedAt: state.time,
    ttl: state.benchStress ? Number.POSITIVE_INFINITY : pickupTtlSeconds(kind),
    magnetTrailClock: 0
  });
}

function collectPickup(pickup: Pickup): void {
  const player = state.player;
  if (!player) return;
  if (pickup.kind === "xp") {
    grantXp(1);
    playSynthCue("pickup", 0.65, { kind: "xp" });
  } else if (pickup.kind === "heal") {
    const heal = Math.round(28 * ((state.progressionStats ?? resolveProgressionStats()).healMultiplier ?? 1));
    player.hp = Math.min(player.maxHp, player.hp + heal);
    toast("Field vial sealed the cut.");
    pulseOverlay("gold");
    spawnFloatingText("+HP", pickup.x, pickup.z, "#9dff8d", 1.1, { targetHeight: pickupFloatingTextHeight(pickup) });
    playSynthCue("pickup", 1.1, { kind: "heal" });
  } else if (pickup.kind === "magnet") {
    activatePickupMagnet();
    toast("Magnet bone called loose shards.");
    pulseOverlay("gold");
    spawnFloatingText("MAGNET", pickup.x, pickup.z, "#9fe8ff", 1.15, { targetHeight: pickupFloatingTextHeight(pickup) });
    spawnPulseRing(player.x, player.z, "#9fe8ff", 0.5, 1.1, 6.4);
    playSynthCue("pickup", 1.2, { kind: "magnet" });
  } else if (pickup.kind === "weapon") {
    const reward = pickup.payload ?? rollChestStatReward();
    state.statBonuses.push(reward.bonus);
    applyProgressionStats();
    player.animLock = 0.45;
    playActorAnimation(player, "interact", 0.04);
    toast(`${reward.title}: ${reward.description}`);
    showCenterBanner("Cursed Cache", `${reward.title}: ${reward.description}`);
    pulseOverlay("gold");
    spawnPulseRing(player.x, player.z, reward.color ?? "#ffd27a", 0.56, 1.2, 5.2);
    spawnFloatingText(reward.description, pickup.x, pickup.z, reward.color ?? "#ffd27a", 1.15, { targetHeight: pickupFloatingTextHeight(pickup) });
    playSynthCue("weapon");
    lastWeaponHudKey = "";
  }
}

function damagePlayer(amount: number, options: PlayerDamageOptions = {}): void {
  const player = state.player;
  if (!player) return;
  if (amount <= 0) return;
  if (PERF_FLAGS.benchInvulnerable) return;
  if (player.invuln > 0 || player.hp <= 0) return;
  const stats = state.progressionStats ?? resolveProgressionStats();
  const reduction = Math.min(data.balance?.combat?.armorReductionCap ?? 0.55, player.armor * (data.balance?.combat?.armorDamageReductionPerPoint ?? 0.018));
  const effectiveAmount = Math.max(options.minDamage ?? 1, amount * (1 - reduction));
  player.hp -= effectiveAmount;
  player.invuln = options.invulnSeconds ?? PLAYER_DAMAGE_IMMUNE_SECONDS;
  applyPlayerDamageKnockback(options, effectiveAmount);
  if (options.source && stats.contactThornsDamage > 0) {
    options.source.hp -= stats.contactThornsDamage;
    options.source.healthBarTimer = HEALTH_BAR_VISIBLE_SECONDS;
    spawnFloatingText(`${Math.round(stats.contactThornsDamage)}`, options.source.x, options.source.z, "#d7ff8d", 0.94, { targetHeight: actorFloatingTextHeight(options.source) });
  }
  player.animLock = Math.max(player.animLock ?? 0, 0.28);
  playActorAnimation(player, "hit", 0.035);
  pulseOverlay("danger");
  playSynthCue("damage", Math.min(1.4, effectiveAmount / 16));
  spawnFloatingText(`-${Math.max(1, Math.round(effectiveAmount))}`, player.x, player.z, "#ff6b5e", 1.1, { targetHeight: actorFloatingTextHeight(player) });
  spawnDamageDirectionWedge(options);
  pulseShake(0.22, 0.34);
  if (player.hp <= 0) {
    player.hp = 0;
    player.animLock = 1.2;
    playActorAnimation(player, "death", 0.04);
    state.running = false;
    state.paused = false;
    state.pausePanel = "root";
    renderPauseUi();
    ui.menu.classList.remove("hidden");
    document.body.classList.add("menu-open");
    document.body.classList.remove("run-active", "pause-open");
    ui.soloButton.textContent = "Retry Solo";
    showCenterBanner("Overrun", `${state.kills} kills. The gate opens again.`);
    playSynthCue("death");
    focusRetryAction();
    toast("Overrun. Retry Solo is armed.");
  }
}

function focusRetryAction(): void {
  clearControllerFocus();
  ui.soloButton?.classList.add("controller-focus");
  ui.soloButton?.focus?.({ preventScroll: true });
  const targets = menuTargets();
  const retryIndex = targets.indexOf(ui.soloButton);
  if (retryIndex >= 0) gamepadState.menuIndex = retryIndex;
}

function applyPlayerDamageKnockback(options: PlayerDamageOptions, amount: number): void {
  if (options.knockback === false) return;
  const player = state.player;
  if (!player) return;
  const sourceX = options.sourceX ?? options.source?.x;
  const sourceZ = options.sourceZ ?? options.source?.z;
  if (typeof sourceX !== "number" || typeof sourceZ !== "number") return;
  const delta = worldDeltaInto(tempWorldDelta, sourceX, sourceZ, player.x, player.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const distance = Math.hypot(dx, dz) || 1;
  const resist = clamp(player.knockbackResist ?? 0, 0, 0.8);
  const force = (options.knockbackForce ?? Math.min(36, PLAYER_CONTACT_KNOCKBACK_BASE + Math.max(0, amount) * 0.09)) * (1 - resist);
  player.knockX = (player.knockX ?? 0) + (dx / distance) * force;
  player.knockZ = (player.knockZ ?? 0) + (dz / distance) * force;
}

function addHazard(hazard: HazardDefinition): void {
  const color = hazard.kind === "rotMist" || hazard.kind === "graveGas" ? 0x79c864 : 0xb9a86c;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(hazard.radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  const position = renderPositionInto(tempRenderPosition, hazard.x, hazard.z);
  mesh.position.set(position.x, terrainBaseHeightAt(hazard.x, hazard.z) + 0.05, position.z);
  scene.add(mesh);
  state.hazards.push({ ...hazard, mesh, seed: Math.random() * 30, damageClock: 0 });
}

function addFallbackProp(prop: ArenaPropDefinition): void {
  const group = new THREE.Group();
  const position = renderPositionInto(tempRenderPosition, prop.x, prop.z);
  group.position.set(position.x, terrainHeightAt(prop.x, prop.z), position.z);
  group.rotation.y = prop.rot ?? 0;
  group.scale.setScalar(resolvePropScale(prop));
  let mesh;
  if (prop.model.includes("pine")) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.4, 7), new THREE.MeshStandardMaterial({ color: 0x3c2b1f }));
    trunk.position.y = 1.2;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x263f2c }));
    leaves.position.y = 3.4;
    group.add(trunk, leaves);
  } else if (prop.model.includes("crypt")) {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.2, 3.1), new THREE.MeshStandardMaterial({ color: 0x6d6d63, roughness: 0.9 }));
    mesh.position.y = 1.1;
    group.add(mesh);
  } else if (prop.model.includes("coffin")) {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x4b3427, roughness: 0.85 }));
    mesh.position.y = 0.35;
    group.add(mesh);
  } else if (prop.model.includes("rock")) {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshStandardMaterial({ color: 0x565f58, roughness: 0.95 }));
    mesh.scale.set(1.2, 0.42, 0.85);
    mesh.position.y = 0.22;
    group.add(mesh);
  } else if (prop.model.includes("grass")) {
    mesh = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 7), new THREE.MeshStandardMaterial({ color: 0x385f34, roughness: 0.9 }));
    mesh.position.y = 0.45;
    group.add(mesh);
  } else if (prop.model.includes("wall") || prop.model.includes("doorway")) {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.25, 0.42), new THREE.MeshStandardMaterial({ color: 0x59625a, roughness: 0.92 }));
    mesh.position.y = 0.62;
    group.add(mesh);
  } else if (prop.model.includes("shovel") || prop.model.includes("tool")) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0x5a4029, roughness: 0.8 }));
    handle.rotation.z = Math.PI / 2.8;
    handle.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.52), new THREE.MeshStandardMaterial({ color: 0x9a9f96, roughness: 0.72 }));
    head.position.set(0.55, 0.18, 0);
    group.add(handle, head);
  } else if (prop.model.includes("lantern") || prop.model.includes("campfire")) {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x6f4b29, roughness: 0.7 }));
    mesh.position.y = 0.35;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb15d }));
    flame.position.y = 0.85;
    group.add(mesh, flame);
  } else if (prop.model.includes("fence")) {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.16), new THREE.MeshStandardMaterial({ color: 0x252923, roughness: 0.85 }));
    mesh.position.y = 0.6;
    group.add(mesh);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.42), new THREE.MeshStandardMaterial({ color: 0x777568, roughness: 0.95 }));
    mesh.position.y = 0.85;
    group.add(mesh);
  }
  prepareThreeObject3D(group, { castShadow: true, receiveShadow: true });
  preparePropOccluderMaterials(group);
  group.visible = false;
  scene.add(group);
  configurePropCollision(prop, group);
  addPropGlow(prop, group);
  setPropVisible(group, false);
  state.props.push(group);
  state.propVisibilityBspDirty = true;
}

function addPropGlow(prop: ArenaPropDefinition, parent: Three.Object3D): void {
  const isFire = prop.model.includes("lantern") || prop.model.includes("campfire") || prop.model.includes("pumpkin");
  if (!isFire) return;
  const color = prop.model.includes("campfire") ? 0xff8844 : prop.model.includes("pumpkin") ? 0xff7a35 : 0xffc06a;
  const baseIntensity = prop.model.includes("campfire") ? 4.4 : 2.6;
  const light = new THREE.PointLight(color, baseIntensity, prop.model.includes("campfire") ? 22 : 15, 2);
  const position = renderPositionInto(tempRenderPosition, prop.x, prop.z);
  light.position.set(position.x, terrainHeightAt(prop.x, prop.z) + 1.3, position.z);
  light.userData = { baseIntensity, seed: Math.random() * 100 };
  scene.add(light);
  parent.userData = parent.userData ?? {};
  parent.userData.light = light;
}

function updatePropGlows(): void {
  const props = PERF_FLAGS.staticPropBsp ? state.visibleStaticProps : state.props;
  for (const prop of props) {
    const light = prop.userData?.light;
    if (!(light instanceof THREE.PointLight)) continue;
    const baseIntensity = typeof light.userData.baseIntensity === "number" ? light.userData.baseIntensity : 1;
    const seed = typeof light.userData.seed === "number" ? light.userData.seed : 0;
    light.intensity = baseIntensity * (0.86 + Math.sin(state.time * 5.2 + seed) * 0.14);
  }
}

function revealLazyProps(options: { initial?: boolean; force?: boolean } = {}): void {
  const player = state.player;
  if (!player || !state.pendingProps.length) return;
  const initial = Boolean(options.initial);
  const force = Boolean(options.force);
  let remaining = force || initial ? Number.POSITIVE_INFINITY : LAZY_PROP_REVEAL_BUDGET;
  const heading = initial ? null : getLazyPropHeading();
  for (let i = state.pendingProps.length - 1; i >= 0; i -= 1) {
    if (remaining <= 0) break;
    const prop = state.pendingProps[i];
    if (!prop) continue;
    const delta = worldDeltaInto(tempWorldDelta, player.x, player.z, prop.x, prop.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const distanceSq = dx * dx + dz * dz;
    let shouldReveal = distanceSq <= LAZY_PROP_NEAR_RADIUS * LAZY_PROP_NEAR_RADIUS;
    if (initial) {
      shouldReveal = distanceSq <= LAZY_PROP_INITIAL_RADIUS * LAZY_PROP_INITIAL_RADIUS;
    } else if (!shouldReveal && heading && distanceSq <= LAZY_PROP_AHEAD_RADIUS * LAZY_PROP_AHEAD_RADIUS) {
      const distance = Math.sqrt(distanceSq) || 1;
      const dot = (dx / distance) * heading.x + (dz / distance) * heading.z;
      shouldReveal = dot >= LAZY_PROP_AHEAD_DOT;
    }
    if (!shouldReveal) continue;
    state.pendingProps.splice(i, 1);
    materializeProp(prop);
    remaining -= 1;
  }
}

function resetLazyProps(): void {
  for (const prop of state.props) {
    if (prop.userData?.light) scene.remove(prop.userData.light);
    scene.remove(prop);
  }
  state.props.length = 0;
  resetPropCollisionIndex();
  resetPropVisibilityIndex();
  state.pendingProps = [...data.props];
  revealLazyProps({ initial: true, force: true });
}

function revealAllPendingProps(): void {
  while (state.pendingProps.length) {
    const prop = state.pendingProps.pop();
    if (prop) materializeProp(prop);
  }
  updateWrappedStaticVisuals(0, true);
}

function getLazyPropHeading(): WorldPoint {
  const player = state.player;
  const vx = player?.moveMomentumX ?? 0;
  const vz = player?.moveMomentumZ ?? 0;
  const speed = Math.hypot(vx, vz);
  if (speed > 0.12) return { x: vx / speed, z: vz / speed };
  const yaw = cameraRigSnapshot?.yaw ?? cameraYaw;
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

function materializeProp(prop: ArenaPropDefinition): void {
  const source = state.propAssetMode === "model" ? state.modelCache.get(prop.model) : null;
  if (!source) {
    addFallbackProp(prop);
    return;
  }
  addModelPropClone(prop, source);
}

function addModelPropClone(prop: ArenaPropDefinition, source: Three.Object3D): void {
  const clone = clonePreparedThreeObject(source, {
    scale: resolvePropScale(prop) * (source.userData?.importScale ?? 1),
    castShadow: true,
    receiveShadow: true
  });
  const position = renderPositionInto(tempRenderPosition, prop.x, prop.z);
  clone.position.set(position.x, terrainHeightAt(prop.x, prop.z), position.z);
  clone.rotation.y = prop.rot ?? 0;
  clone.visible = false;
  preparePropOccluderMaterials(clone);
  attachStaticPropLodGeometries(clone);
  configurePropCollision(prop, clone);
  scene.add(clone);
  addPropGlow(prop, clone);
  setPropVisible(clone, false);
  state.props.push(clone);
  state.propVisibilityBspDirty = true;
}

function attachStaticPropLodGeometries(root: Three.Object3D): void {
  if (!PERF_FLAGS.staticPropLod || !state.propLodGeometries.size) return;
  let attached = false;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry)) return;
    const lod = state.propLodGeometries.get(child.geometry);
    if (!lod) return;
    child.userData = child.userData ?? {};
    child.userData.lodGeometries = lod;
    attached = true;
  });
  if (attached) {
    root.userData = root.userData ?? {};
    root.userData.activeLod = null;
    root.userData.hasGeometryLod = true;
  }
}

function resolvePropScale(prop: ArenaPropDefinition): number {
  const model = String(prop.model ?? "").toLowerCase();
  let category = 1;
  if (model.includes("grave") || model.includes("stone")) category = 2.2;
  if (model.includes("crypt")) category = 1.2;
  if (model.includes("ruin")) category = 1.0;
  if (model.includes("coffin")) category = 2.35;
  if (model.includes("pine") || model.includes("tree")) category = 0.8;
  if (model.includes("rock")) category = 3.35;
  if (model.includes("grass")) category = 4.25;
  if (model.includes("pumpkin")) category = 4;
  if (model.includes("lantern") || model.includes("campfire") || model.includes("barrel")) category = 3.8;
  if (!model.includes("ruin") && (model.includes("fence") || model.includes("wall") || model.includes("doorway"))) category = 0.9;
  if (model.includes("shovel") || model.includes("tool")) category = 4.35;
  return (prop.scale ?? 1) * PROP_READABILITY_SCALE * category;
}

function configurePropCollision(prop: ArenaPropDefinition, object: Three.Object3D): void {
  object.userData = object.userData ?? {};
  object.userData.model = prop.model;
  object.userData.sourceProp = prop;
  object.userData.worldX = prop.x;
  object.userData.worldZ = prop.z;
  object.userData.groundY = terrainHeightAt(prop.x, prop.z);
  object.userData.collider = resolvePropCollider(prop);
  registerPropCollisionItem(object, prop.x, prop.z, object.userData.collider);
}

function resolvePropCollider(prop: ArenaPropDefinition): PropCollider {
  const model = String(prop.model ?? "").toLowerCase();
  const scale = resolvePropScale(prop);
  if (model.includes("grass") || model.includes("shovel") || model.includes("tool")) {
    return { blocking: false, kind: "circle", radius: Math.min(1.2, scale * 0.18), height: 0.55, rot: prop.rot ?? 0 };
  }
  if (model.includes("fence") || model.includes("wall") || model.includes("doorway")) {
    return { blocking: true, kind: "box", halfX: Math.min(6.8, scale * 1.85), halfZ: Math.min(1.15, scale * 0.24), height: Math.min(4.6, Math.max(1.2, scale * 1.35)), rot: prop.rot ?? 0 };
  }
  if (model.includes("crypt") || model.includes("ruin")) {
    return { blocking: true, kind: "box", halfX: Math.min(5.8, scale * 1.35), halfZ: Math.min(5.2, scale * 1.2), height: Math.min(8.8, Math.max(2.6, scale * 2.2)), rot: prop.rot ?? 0 };
  }
  if (model.includes("coffin") || model.includes("tree-log")) {
    return { blocking: true, kind: "box", halfX: Math.min(4.8, scale * 1.1), halfZ: Math.min(2.8, scale * 0.56), height: Math.min(2.2, Math.max(0.75, scale * 0.42)), rot: prop.rot ?? 0 };
  }
  let radius = 0.72;
  let height = 2;
  if (model.includes("pine") || model.includes("tree")) radius = 1.05;
  if (model.includes("pine") || model.includes("tree")) height = Math.min(9.5, Math.max(3.8, scale * 4.4));
  else if (model.includes("rock")) {
    radius = 0.78;
    height = Math.min(2.4, Math.max(0.65, scale * 0.52));
  } else if (model.includes("campfire")) {
    radius = 0.88;
    height = 1.25;
  } else if (model.includes("barrel")) {
    radius = 0.66;
    height = 1.55;
  } else if (model.includes("pumpkin") || model.includes("lantern")) {
    radius = 0.44;
    height = 1.05;
  } else if (model.includes("grave") || model.includes("stone")) {
    radius = 0.74;
    height = Math.min(3.4, Math.max(1.4, scale * 0.78));
  }
  return { blocking: true, kind: "circle", radius: Math.min(3.4, scale * radius), height, rot: prop.rot ?? 0 };
}

function resetPropCollisionIndex(): void {
  state.propCollisionItems.length = 0;
  state.propCollisionGrid.clear();
  state.propCollisionGridDirty = true;
}

function resetPropVisibilityIndex(): void {
  state.propVisibilityBsp.clear();
  state.propVisibilityCandidates.length = 0;
  state.visibleStaticProps.clear();
  state.nextVisibleStaticProps.clear();
  state.propVisibilityBspDirty = true;
}

function rebuildPropVisibilityBsp(): void {
  const items = state.props.map((prop) => ({
    value: prop,
    center: [prop.userData?.worldX ?? prop.position.x, 0, prop.userData?.worldZ ?? prop.position.z] as [number, number, number],
  }));
  state.propVisibilityBsp.rebuild(items);
  state.propVisibilityBspDirty = false;
}

function updateStaticPropVisibility(): void {
  const player = state.player;
  if (!player) return;
  if (!PERF_FLAGS.staticPropBsp) {
    updateStaticPropVisibilityByScan();
    return;
  }
  if (state.propVisibilityBspDirty) rebuildPropVisibilityBsp();
  const nextVisible = state.nextVisibleStaticProps;
  nextVisible.clear();
  const offsets = toroidalWorld.visibleDuplicateOffsets(
    [player.x, 0, player.z],
    STATIC_VISIBILITY_QUERY_RADIUS,
    { includeOrigin: true }
  );
  for (const offset of offsets) {
    const queryX = player.x - offset[0];
    const queryZ = player.z - offset[2];
    const candidates = state.propVisibilityBsp.querySphere(
      [queryX, 0, queryZ],
      STATIC_VISIBILITY_QUERY_RADIUS,
      state.propVisibilityCandidates
    );
    for (const prop of candidates) {
      const worldX = prop.userData?.worldX;
      const worldZ = prop.userData?.worldZ;
      if (typeof worldX !== "number" || typeof worldZ !== "number") continue;
      const delta = worldDeltaInto(tempWorldDelta, player.x, player.z, worldX, worldZ);
      if (Math.abs(delta.dx) > STATIC_VISIBILITY_RADIUS || Math.abs(delta.dz) > STATIC_VISIBILITY_RADIUS) continue;
      nextVisible.add(prop);
      showStaticProp(prop, delta);
    }
  }
  for (const prop of state.visibleStaticProps) {
    if (!nextVisible.has(prop)) setPropVisible(prop, false);
  }
  const previousVisible = state.visibleStaticProps;
  state.visibleStaticProps = nextVisible;
  state.nextVisibleStaticProps = previousVisible;
}

function updateStaticPropVisibilityByScan(): void {
  const player = state.player;
  if (!player) return;
  for (const prop of state.props) {
    const worldX = prop.userData?.worldX;
    const worldZ = prop.userData?.worldZ;
    if (typeof worldX !== "number" || typeof worldZ !== "number") continue;
    const delta = worldDeltaInto(tempWorldDelta, player.x, player.z, worldX, worldZ);
    const visible = Math.abs(delta.dx) <= STATIC_VISIBILITY_RADIUS && Math.abs(delta.dz) <= STATIC_VISIBILITY_RADIUS;
    if (!visible) {
      setPropVisible(prop, false);
      continue;
    }
    showStaticProp(prop, delta);
  }
}

function showStaticProp(prop: Three.Object3D, delta: WorldDelta): void {
  const player = state.player;
  if (!player) return;
  const positionX = player.x + delta.dx;
  const positionZ = player.z + delta.dz;
  const worldX = prop.userData?.worldX ?? prop.position.x;
  const worldZ = prop.userData?.worldZ ?? prop.position.z;
  updateStaticPropLod(prop, Math.hypot(delta.dx, delta.dz));
  setPropVisible(prop, true);
  const groundY = prop.userData?.groundY ?? terrainHeightAt(worldX, worldZ);
  const moved = Math.abs(prop.position.x - positionX) > 0.001
    || Math.abs(prop.position.y - groundY) > 0.001
    || Math.abs(prop.position.z - positionZ) > 0.001;
  if (moved) {
    prop.position.x = positionX;
    prop.position.y = groundY;
    prop.position.z = positionZ;
    prop.updateMatrixWorld?.(true);
  }
  const light = prop.userData?.light;
  if (light instanceof THREE.Object3D) light.position.set(positionX, groundY + 1.3, positionZ);
}

function updateStaticPropLod(prop: Three.Object3D, distance: number): void {
  if (!prop.userData?.hasGeometryLod) return;
  const nextLod = distance <= STATIC_PROP_LOD_MID_DISTANCE
    ? "high"
    : distance <= STATIC_PROP_LOD_LOW_DISTANCE
      ? "mid"
      : "low";
  if (prop.userData.activeLod === nextLod) return;
  prop.userData.activeLod = nextLod;
  prop.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const lodGeometries = child.userData?.lodGeometries;
    if (!lodGeometries) return;
    child.geometry = lodGeometries[nextLod] ?? lodGeometries.high;
  });
}

function setPropVisible(prop: Three.Object3D, visible: boolean): void {
  prop.visible = visible;
  const light = prop.userData?.light;
  if (light instanceof THREE.Object3D) light.visible = visible;
}

function registerPropCollisionItem(prop: Three.Object3D, worldX: number, worldZ: number, collider: PropCollider): void {
  if (!collider?.blocking) return;
  const storedGroundY = prop.userData?.groundY;
  const baseY = typeof storedGroundY === "number" && Number.isFinite(storedGroundY) ? storedGroundY : terrainHeightAt(worldX, worldZ);
  collider.baseY = baseY;
  collider.topY = baseY + Math.max(0.1, collider.height ?? 2);
  prop.userData = prop.userData ?? {};
  prop.userData.groundY = baseY;
  if (collider.kind === "box") {
    collider.cos = Math.cos(collider.rot);
    collider.sin = Math.sin(collider.rot);
  }
  const item = {
    prop,
    x: worldX,
    z: worldZ,
    y: worldZ,
    collider,
    radius: resolvePropCollisionRadius(collider)
  };
  state.propCollisionItems.push(item);
  state.propCollisionGridDirty = true;
}

function resolvePropCollisionRadius(collider: PropCollider): number {
  return collider.kind === "box"
    ? Math.hypot(collider.halfX ?? 1, collider.halfZ ?? 1)
    : collider.radius ?? 1;
}

function rebuildPropCollisionGrid(): void {
  state.propCollisionGrid.rebuild(state.propCollisionItems);
  state.propCollisionGridDirty = false;
}

function queryPropCollisionItems(actor: WorldActor, actorRadius: number): PropCollisionItem[] | null {
  if (!PERF_FLAGS.propCollisionGrid) return null;
  if (state.propCollisionGridDirty) rebuildPropCollisionGrid();
  if (!state.propCollisionGrid.size()) return [];
  return state.propCollisionGrid.queryCircle({
    x: actor.x,
    y: actor.z,
    radius: actorRadius + PROP_COLLISION_PUSH_EPSILON
  }, state.propCollisionCandidates);
}

function resolvePropCollisions(actor: WorldActor): void {
  if (!Number.isFinite(actor.x) || !Number.isFinite(actor.z)) return;
  const actorRadius = actor.radius ?? PLAYER_RADIUS;
  const indexedItems = measureTelemetryPhase("propCollisionQuery", () => queryPropCollisionItems(actor, actorRadius));
  if (indexedItems) {
    measureTelemetryPhase("propCollisionResolve", () => {
      for (const item of indexedItems) {
        if (item.collider.kind === "box") resolveBoxPropCollision(actor, actorRadius, item.x, item.z, item.collider);
        else resolveCirclePropCollision(actor, actorRadius, item.x, item.z, item.collider);
      }
    });
    wrapEntity(actor);
    return;
  }
  measureTelemetryPhase("propCollisionResolve", () => {
    for (const prop of state.props) {
      const collider = prop.userData?.collider;
      if (!collider?.blocking) continue;
      const worldX = prop.userData?.worldX;
      const worldZ = prop.userData?.worldZ;
      if (typeof worldX !== "number" || typeof worldZ !== "number") continue;
      if (collider.kind === "box") resolveBoxPropCollision(actor, actorRadius, worldX, worldZ, collider);
      else resolveCirclePropCollision(actor, actorRadius, worldX, worldZ, collider);
    }
  });
  wrapEntity(actor);
}

function actorOverlapsPropY(actor: WorldActor, propX: number, propZ: number, collider: PropCollider): boolean {
  const propBase = typeof collider.baseY === "number" && Number.isFinite(collider.baseY) ? collider.baseY : terrainHeightAt(propX, propZ);
  const propTop = typeof collider.topY === "number" && Number.isFinite(collider.topY) ? collider.topY : propBase + Math.max(0.1, collider.height);
  const actorBase = actorFeetY(actor);
  const actorTop = actorBase + actorVerticalHeight(actor);
  return verticalRangesOverlap(actorBase, actorTop, propBase, propTop, 0.18);
}

function resolveCirclePropCollision(actor: WorldActor, actorRadius: number, propX: number, propZ: number, collider: CircleCollider): void {
  const delta = worldDeltaInto(tempWorldDelta, propX, propZ, actor.x, actor.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const radius = actorRadius + collider.radius;
  if (Math.abs(dx) > radius || Math.abs(dz) > radius) return;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) return;
  if (!actorOverlapsPropY(actor, propX, propZ, collider)) return;
  const dist = Math.sqrt(distSq) || 1;
  const push = radius - dist + PROP_COLLISION_PUSH_EPSILON;
  actor.x = wrapWorld(actor.x + (dx / dist) * push);
  actor.z = wrapWorld(actor.z + (dz / dist) * push);
}

function resolveBoxPropCollision(actor: WorldActor, actorRadius: number, propX: number, propZ: number, collider: BoxCollider): void {
  const delta = worldDeltaInto(tempWorldDelta, propX, propZ, actor.x, actor.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const outer = Math.max(collider.halfX, collider.halfZ) + actorRadius;
  if (Math.abs(dx) > outer || Math.abs(dz) > outer) return;
  const cos = collider.cos ?? Math.cos(collider.rot);
  const sin = collider.sin ?? Math.sin(collider.rot);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const nearX = clamp(localX, -collider.halfX, collider.halfX);
  const nearZ = clamp(localZ, -collider.halfZ, collider.halfZ);
  let pushX = localX - nearX;
  let pushZ = localZ - nearZ;
  const distSq = pushX * pushX + pushZ * pushZ;
  if (distSq > actorRadius * actorRadius) return;
  if (!actorOverlapsPropY(actor, propX, propZ, collider)) return;
  let pushAmount;
  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    pushAmount = actorRadius - dist + PROP_COLLISION_PUSH_EPSILON;
    pushX /= dist;
    pushZ /= dist;
  } else {
    const penX = collider.halfX + actorRadius - Math.abs(localX);
    const penZ = collider.halfZ + actorRadius - Math.abs(localZ);
    if (penX < penZ) {
      pushX = localX < 0 ? -1 : 1;
      pushZ = 0;
      pushAmount = penX + PROP_COLLISION_PUSH_EPSILON;
    } else {
      pushX = 0;
      pushZ = localZ < 0 ? -1 : 1;
      pushAmount = penZ + PROP_COLLISION_PUSH_EPSILON;
    }
  }
  const worldPushX = pushX * cos - pushZ * sin;
  const worldPushZ = pushX * sin + pushZ * cos;
  actor.x = wrapWorld(actor.x + worldPushX * pushAmount);
  actor.z = wrapWorld(actor.z + worldPushZ * pushAmount);
}

function updateWrappedStaticVisuals(dt = 0, force = false): void {
  const player = state.player;
  if (!player) return;
  state.staticWrapClock -= dt;
  const movedSq = distanceSquared(state.lastStaticWrapX, state.lastStaticWrapZ, player.x, player.z);
  if (!force && state.staticWrapClock > 0 && movedSq < STATIC_WRAP_MOVE_THRESHOLD ** 2) return;
  state.staticWrapClock = STATIC_WRAP_UPDATE_INTERVAL;
  state.lastStaticWrapX = player.x;
  state.lastStaticWrapZ = player.z;
  revealLazyProps();
  const activeGroundOffsets = toroidalWorld.visibleDuplicateOffsets([player.x, 0, player.z], CAMERA_VIEW_RADIUS);
  for (const copy of state.loopGroundCopies) {
    copy.visible = activeGroundOffsets.some((offset) => offset[0] === copy.position.x && offset[2] === copy.position.z);
  }
  updateStaticPropVisibility();
  updateTraversalToolVisuals(dt);
  for (const hazard of state.hazards) {
    const position = renderPositionInto(tempRenderPosition, hazard.x, hazard.z);
    hazard.mesh.position.x = position.x;
    hazard.mesh.position.y = terrainBaseHeightAt(hazard.x, hazard.z) + 0.05;
    hazard.mesh.position.z = position.z;
  }
}

async function loadOptionalModels(): Promise<void> {
  state.optionalModelsLoading = true;
  state.optionalModelsReady = false;
  try {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      const normalized = url.replace(/\\/g, "/");
      if (normalized.toLowerCase().includes("colormap.png")) {
        return new URL(modelTextureOverride, location.href).href;
      }
      return url;
    });
    gltfLoader = new runtimeThreeModules.GLTFLoader(manager);
    if (!fbxLoader) fbxLoader = new runtimeThreeModules.FBXLoader();
  } catch {
    state.optionalModelsLoading = false;
    state.optionalModelsReady = true;
    return;
  }
  try {
    for (const [name, paths] of Object.entries(modelPaths)) {
      const model = await loadFirstModel(paths);
      if (model) state.modelCache.set(name, model);
    }
    await bakeStaticPropLodSources();
    for (const [id, paths] of Object.entries(weaponModelPaths)) {
      const model = await loadFirstModel(paths);
      if (model) state.modelCache.set(`weapon:${id}`, model);
    }
    for (const [kind, paths] of Object.entries(pickupModelPaths)) {
      const model = await loadFirstModel(paths);
      if (model) state.modelCache.set(`pickup:${kind}`, model);
    }
    await loadUniversalAnimationMetadata();
    if (PERF_FLAGS.staticModelProps && state.modelCache.size) {
      const loadedProps = state.props
        .map((prop) => prop.userData?.sourceProp as unknown)
        .filter(isArenaPropDefinition);
      beginOptionalModelUpgrade(loadedProps);
      if (!state.running) continueOptionalModelUpgrade();
    }
  } finally {
    state.optionalModelsLoading = false;
    state.optionalModelsReady = true;
  }
}

function beginOptionalModelUpgrade(loadedProps: ArenaPropDefinition[]): void {
  if (!loadedProps.length) return;
  state.pendingModelUpgrade = true;
  state.pendingModelUpgradeProps = loadedProps;
  state.pendingModelUpgradeIndex = 0;
}

function continueOptionalModelUpgrade(force = false): void {
  if (!state.pendingModelUpgrade || state.running) return;
  const started = performance.now();
  if (state.pendingModelUpgradeIndex === 0) {
    state.propAssetMode = "model";
    for (const loaded of state.props) {
      if (loaded.userData?.light) scene.remove(loaded.userData.light);
      scene.remove(loaded);
    }
    state.props.length = 0;
    resetPropCollisionIndex();
    resetPropVisibilityIndex();
  }
  while (state.pendingModelUpgradeIndex < state.pendingModelUpgradeProps.length) {
    materializeProp(state.pendingModelUpgradeProps[state.pendingModelUpgradeIndex]);
    state.pendingModelUpgradeIndex += 1;
    if (!force && performance.now() - started >= OPTIONAL_MODEL_UPGRADE_BUDGET_MS) return;
  }
  state.pendingModelUpgrade = false;
  state.pendingModelUpgradeProps = [];
  state.pendingModelUpgradeIndex = 0;
  updateWrappedStaticVisuals(0, true);
  refreshDynamicAssetVisuals();
  warmSceneShaders();
}

function warmSceneShaders(): void {
  // Full-scene compile can block the main thread for seconds after optional model swaps.
  // Let shaders compile with the incremental render path instead.
}

function loadFirstModel(paths: readonly string[]): Promise<Three.Object3D | null> {
  return loadFirstThreeAsset(paths, loadModel, { fallback: null });
}

async function loadModel(path: string): Promise<Three.Object3D> {
  if (path.endsWith(".fbx")) return loadFbxModel(path);
  modelTextureOverride = path.includes("/props/kenney/") ? "assets/usable/textures/kenney/survival-variation-a.png" : "assets/usable/textures/kenney/graveyard-colormap.png";
  if (!gltfLoader) throw new Error("GLTFLoader unavailable");
  const gltf = await loadThreeLoaderAsset(gltfLoader, path);
  prepareImportedModel(gltf.scene, path);
  return gltf.scene;
}

async function loadFbxModel(path: string): Promise<Three.Object3D> {
  if (!fbxLoader) return Promise.reject(new Error("FBXLoader unavailable"));
  const model = await loadThreeLoaderAsset(fbxLoader, path);
  prepareImportedModel(model, path);
  return model;
}

function prepareImportedModel(model: Three.Object3D, path: string): void {
  const texture = path.includes("/ruin-low-poly/") ? state.textures.ruin : path.includes("/treasure-low-poly/") ? state.textures.treasure : null;
  prepareThreeObject3D(model, {
    castShadow: true,
    receiveShadow: true,
    material: () => {
      if (!texture) return undefined;
      return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.78, metalness: path.includes("/treasure-low-poly/") ? 0.18 : 0.04 });
    }
  });
  normalizeLargeImportedProp(model, path);
}

async function bakeStaticPropLodSources(): Promise<void> {
  state.propLodGeometries.clear();
  state.propLodStats = { ready: false, sources: 0, geometries: 0, skipped: 0, ms: 0 };
  if (!PERF_FLAGS.staticPropLod) {
    state.propLodStats.ready = true;
    return;
  }
  const started = performance.now();
  const geometryCache = new Map<Three.BufferGeometry, {
    high: Three.BufferGeometry;
    mid: Promise<Three.BufferGeometry>;
    low: Promise<Three.BufferGeometry>;
  }>();
  const propModels = new Set(data.props.map((prop) => prop.model));
  for (const modelName of propModels) {
    const high = state.modelCache.get(modelName);
    if (!high?.traverse) continue;
    await waitForIdleBakeSlice();
    const baked = await bakeStaticPropGeometryLods(high, geometryCache);
    state.propLodStats.sources += 1;
    state.propLodStats.geometries += baked.geometries;
    state.propLodStats.skipped += baked.skipped;
  }
  state.propLodStats.ready = true;
  state.propLodStats.ms = Math.round((performance.now() - started) * 10) / 10;
}

async function bakeStaticPropGeometryLods(
  source: Three.Object3D,
  geometryCache: Map<Three.BufferGeometry, {
    high: Three.BufferGeometry;
    mid: Promise<Three.BufferGeometry>;
    low: Promise<Three.BufferGeometry>;
  }>
): Promise<{ geometries: number; skipped: number }> {
  const jobs: Promise<void>[] = [];
  let geometries = 0;
  let skipped = 0;
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry) || !child.geometry.attributes.position) return;
    const original = child.geometry;
    if (state.propLodGeometries.has(original)) return;
    let baked = geometryCache.get(original);
    if (!baked) {
      baked = {
        high: original,
        mid: simplifyStaticPropGeometry(original, STATIC_PROP_LOD_MID_RATIO),
        low: simplifyStaticPropGeometry(original, STATIC_PROP_LOD_LOW_RATIO)
      };
      geometryCache.set(original, baked);
    }
    jobs.push(Promise.all([baked.mid, baked.low]).then(([mid, low]) => {
      state.propLodGeometries.set(original, { high: original, mid, low });
      geometries += Number(mid !== original) + Number(low !== original);
      skipped += Number(mid === original) + Number(low === original);
    }));
  });
  await Promise.all(jobs);
  return { geometries, skipped };
}

function simplifyStaticPropGeometry(geometry: Three.BufferGeometry, ratio: number): Promise<Three.BufferGeometry> {
  return simplifyThreeBufferGeometry(geometry, {
    THREE: threeView.THREE,
    ratio,
    targetError: ratio <= STATIC_PROP_LOD_LOW_RATIO ? 0.8 : 0.35,
    preserveGroups: true,
    computeVertexNormals: true,
    computeBounds: true
  }).catch(() => geometry);
}

function waitForIdleBakeSlice(): Promise<void> {
  if (typeof requestIdleCallback === "function") {
    return new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 32 }));
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function normalizeLargeImportedProp(model: Three.Object3D, path: string): void {
  model.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const targetMaxDimension = path.includes("/ruin-low-poly/")
    ? RUIN_IMPORT_TARGET_MAX_DIMENSION
    : maxDimension > 12
      ? LARGE_IMPORT_TARGET_MAX_DIMENSION
      : null;
  if (!targetMaxDimension || !Number.isFinite(maxDimension) || maxDimension <= targetMaxDimension) return;
  const importScale = targetMaxDimension / maxDimension;
  model.userData = model.userData ?? {};
  model.userData.importScale = importScale;
  model.userData.originalMaxDimension = maxDimension;
  model.scale.multiplyScalar(importScale);
  model.updateMatrixWorld?.(true);
}

async function loadUniversalAnimationMetadata(): Promise<void> {
  if (!gltfLoader || !state.actorAssets || state.actorAssets.universalClipNames?.length) return;
  const names: string[] = [];
  for (const path of universalAnimationPaths) {
    try {
      const gltf = await loadThreeLoaderAsset(gltfLoader, path);
      names.push(...(gltf.animations ?? []).map((clip) => clip.name).filter(Boolean));
    } catch {
      continue;
    }
  }
  state.actorAssets.universalClipNames = names;
}

function makeBillboard(texture: Three.Texture, width: number, height: number): Three.Sprite {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  telemetry.materialCreates += 1;
  const sprite = new THREE.Sprite(material);
  telemetry.meshCreates += 1;
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, 0.12);
  return sprite;
}

function createPickupVisual(
  kind: Pickup["kind"],
  fallbackTexture: Three.Texture,
  scale: number,
  payload: StatLevelChoice | null = null
): Three.Object3D {
  if (kind === "weapon") {
    const weaponDrop = createWeaponDropVisual(payload);
    if (weaponDrop) return weaponDrop;
  }
  const importedScale = kind === "weapon" ? 0.18 : kind === "heal" ? 0.13 : kind === "magnet" ? 0.13 : 0.11;
  const model = cloneCachedModel(`pickup:${kind}`, importedScale);
  if (model) {
    model.position.y = kind === "weapon" ? -0.28 : -0.12;
    model.userData.importedModel = true;
    if (kind !== "xp" && kind !== "magnet") return model;
    const group = new THREE.Group();
    group.add(model);
    addPickupAura(group, kind === "magnet" ? "#9fe8ff" : "#7bd6ff", kind === "magnet" ? 0.7 : 0.58, 0.18);
    group.userData.importedModel = true;
    return group;
  }
  const billboardScale = kind === "weapon" ? 2.6 : kind === "heal" ? 2.1 : 1.8;
  const billboard = makeBillboard(fallbackTexture, Math.max(scale, billboardScale), Math.max(scale, billboardScale));
  billboard.userData.importedModel = false;
  return billboard;
}

function createWeaponDropVisual(payload: StatLevelChoice | null): Three.Group | null {
  const chest = cloneCachedModel("pickup:weapon", 0.28);
  if (!chest) return null;
  const group = new THREE.Group();
  chest.position.set(0, -0.32, 0);
  group.add(chest);
  const color = payload?.color ?? "#ffd27a";
  addPickupAura(group, color, 0.8, 0.24);
  group.userData.importedModel = true;
  return group;
}

function addPickupAura(group: Three.Group, colorValue: Three.ColorRepresentation, radius: number, y: number): void {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.035, 6, 28),
    getEffectMaterial(new THREE.Color(colorValue), 0.44)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.38, 12, 8), getEffectMaterial(new THREE.Color(colorValue), 0.32));
  glow.position.y = y + 0.06;
  group.add(ring, glow);
}

function refreshDynamicAssetVisuals(): void {
  if (state.currentWeaponVisual?.mesh) {
    scene.remove(state.currentWeaponVisual.mesh);
    state.currentWeaponVisual = null;
    updatePlayerWeaponVisual();
  }
  for (const pickup of state.pickups) {
    if (!pickup.mesh) continue;
    if (pickup.mesh.userData?.importedModel) continue;
    const replacement = createPickupVisual(pickup.kind, pickup.texture, pickup.scale, pickup.payload);
    if (!replacement.userData?.importedModel) continue;
    replacement.position.copy(pickup.mesh.position);
    scene.remove(pickup.mesh);
    scene.add(replacement);
    pickup.mesh = replacement;
  }
}

function updatePlayerWeaponVisual(forcedAngle: number | null = null): void {
  const player = state.player;
  if (!player) return;
  const weaponId = state.activeWeaponId ?? state.weaponSlots[0];
  if (!weaponId) return;
  if (state.currentWeaponVisual?.id !== weaponId) {
    if (state.currentWeaponVisual?.mesh) scene.remove(state.currentWeaponVisual.mesh);
    const mesh = createWeaponVisual(weaponId);
    scene.add(mesh);
    state.currentWeaponVisual = { id: weaponId, mesh };
  }
  const angle = forcedAngle ?? angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const mesh = state.currentWeaponVisual?.mesh;
  if (!mesh) return;
  const handPosition = getPlayerWeaponHandPosition(angle);
  mesh.position.copy(handPosition);
  mesh.rotation.y = -angle;
  mesh.visible = state.running;
}

function getPlayerWeaponHandPosition(angle: number): Three.Vector3 {
  const player = state.player;
  if (!player) return tempVec.set(0, PROJECTILE_HEIGHT_OFFSET, 0);
  const hand = player.handAnchor;
  if (player.animated && hand) {
    hand.getWorldPosition(tempVec);
    tempVec.x += Math.cos(angle) * 0.12;
    tempVec.y += 0.04;
    tempVec.z += Math.sin(angle) * 0.12;
    return tempVec;
  }
  tempVec.set(
    player.x + Math.cos(angle) * 0.46,
    actorGroundHeight(player) + 1.34 + player.jumpY,
    player.z + Math.sin(angle) * 0.46
  );
  return tempVec;
}

function getPlayerWeaponMuzzlePosition(angle: number): WorldPosition3D {
  const handPosition = getPlayerWeaponHandPosition(angle);
  const x = wrapWorld(handPosition.x + Math.cos(angle) * 0.46);
  const z = wrapWorld(handPosition.z + Math.sin(angle) * 0.46);
  return {
    x,
    y: projectileYAt(x, z),
    z
  };
}

function projectileYAt(x: number, z: number, heightOffset = PROJECTILE_HEIGHT_OFFSET): number {
  return terrainHeightAt(x, z) + heightOffset;
}

function createWeaponVisual(weaponId: string): Three.Group {
  const group = new THREE.Group();
  const weapon = weaponsById.get(weaponId);
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2d1d, roughness: 0.76, metalness: 0.04 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x59616a, roughness: 0.34, metalness: 0.72 });
  const cord = new THREE.LineBasicMaterial({ color: 0xc6bda5 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.18), wood);
  stock.position.set(0.28, -0.02, 0);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.055, 0.075), steel);
  rail.position.set(0.4, 0.09, 0);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.16), wood);
  grip.position.set(-0.08, -0.2, 0);
  grip.rotation.z = -0.24;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 1.45), steel);
  bow.position.set(0.86, 0.08, 0);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.35, 6), steel);
  bolt.rotation.z = Math.PI / 2;
  bolt.position.set(0.58, 0.16, 0);
  const stringGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.86, 0.08, -0.72),
    new THREE.Vector3(0.18, 0.11, 0),
    new THREE.Vector3(0.86, 0.08, 0.72)
  ]);
  const string = new THREE.Line(stringGeometry, cord);
  group.add(stock, rail, grip, bow, bolt, string);
  const glowColor = new THREE.Color(weapon?.color ?? (weaponId === "flame" ? "#ff743d" : "#ffe09a"));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), getEffectMaterial(glowColor, 0.72));
  glow.position.set(0.94, 0.14, 0);
  group.add(glow);
  group.scale.setScalar(1.08);
  return group;
}

function getWeaponVisualProfile(weaponId: string): WeaponVisualProfile {
  const profile = weaponVisualProfiles[weaponId] ?? weaponVisualProfiles.default;
  if (!profile) throw new Error("Default weapon visual profile is missing.");
  return profile;
}

function cloneCachedModel(key: string, scale = 1): Three.Object3D | null {
  const source = state.modelCache.get(key);
  if (!source) return null;
  return clonePreparedThreeObject(source, {
    scale,
    castShadow: true,
    receiveShadow: true
  });
}

function createProjectileVisual(weapon: WeaponRuntime, angle: number): Three.Group {
  const group = new THREE.Group();
  telemetry.meshCreates += 1;
  const color = new THREE.Color(weapon.color);
  const trail = new THREE.Mesh(getBulletTrailGeometry(), getTrailMaterial(weapon.color));
  trail.rotation.z = Math.PI / 2;
  trail.position.x = -0.92;
  trail.scale.set(weapon.id === "shotgun" ? 0.86 : 1.2, weapon.id === "rifle" ? 1.8 : 1.18, 1.18);
  const core = new THREE.Mesh(getBulletGeometry(), getBulletMaterial(weapon.color));
  const halo = new THREE.Mesh(getEffectGeometry("muzzle"), getEffectMaterial(color, 0.28));
  halo.scale.setScalar(weapon.id === "flame" ? 1.7 : 1.05);
  group.add(trail, core, halo);
  group.rotation.y = -angle;
  group.scale.setScalar(Math.max(0.45, weapon.projectileSizeMultiplier ?? 1));
  return group;
}

function getBatchedParticlePool(create = true): ParticlePool | null {
  if (state.particlePool || !create) return state.particlePool;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide
  });
  telemetry.materialCreates += 1;
  const mesh = new THREE.InstancedMesh(geometry, material, PARTICLE_POOL_CAPACITY);
  telemetry.meshCreates += 1;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
  scene.add(mesh);
  state.particlePool = {
    mesh,
    count: 0,
    capacity: PARTICLE_POOL_CAPACITY,
    x: new Float32Array(PARTICLE_POOL_CAPACITY),
    y: new Float32Array(PARTICLE_POOL_CAPACITY),
    z: new Float32Array(PARTICLE_POOL_CAPACITY),
    vx: new Float32Array(PARTICLE_POOL_CAPACITY),
    vy: new Float32Array(PARTICLE_POOL_CAPACITY),
    vz: new Float32Array(PARTICLE_POOL_CAPACITY),
    age: new Float32Array(PARTICLE_POOL_CAPACITY),
    life: new Float32Array(PARTICLE_POOL_CAPACITY),
    size: new Float32Array(PARTICLE_POOL_CAPACITY),
    groundY: new Float32Array(PARTICLE_POOL_CAPACITY),
    r: new Float32Array(PARTICLE_POOL_CAPACITY),
    g: new Float32Array(PARTICLE_POOL_CAPACITY),
    b: new Float32Array(PARTICLE_POOL_CAPACITY)
  };
  return state.particlePool;
}

function clearBatchedParticles(): void {
  const pool = getBatchedParticlePool(false);
  if (!pool) return;
  pool.count = 0;
  pool.mesh.count = 0;
  pool.mesh.instanceMatrix.needsUpdate = true;
}

function spawnBatchedEffect(kind: EffectKind, x: number, z: number, life: number, options: EffectOptions = {}): void {
  const color = tempColor.set(options.color ?? (kind === "muzzle" ? 0xffd37d : kind === "hit" ? 0xbfff88 : 0xff7842));
  const angle = options.angle ?? 0;
  const particles = Math.max(1, Math.floor(options.particles ?? (kind === "muzzle" ? 11 : kind === "hit" ? 8 : 16)));
  const speed = options.speed ?? (kind === "muzzle" ? 7.8 : kind === "hit" ? 5.5 : kind === "jumpDust" ? 2.7 : kind === "airTrail" ? 0.7 : 6.4);
  const baseSize = options.size ?? (kind === "muzzle" ? 0.36 : kind === "hit" ? 0.3 : kind === "jumpDust" ? 0.22 : kind === "airTrail" ? 0.13 : 0.48);
  const y = options.worldY ?? (terrainHeightAt(x, z) + (options.y ?? (kind === "muzzle" ? 1.45 : kind === "jumpDust" ? 0.18 : kind === "airTrail" ? 1.4 : 1.2)));
  for (let i = 0; i < particles; i += 1) {
    const spread = kind === "muzzle"
      ? angle + (Math.random() - 0.5) * 0.9
      : kind === "jumpDust"
        ? Math.random() * Math.PI * 2
        : angle + (Math.random() - 0.5) * Math.PI * 1.45;
    const velocity = speed * (0.35 + Math.random() * 0.9);
    addBatchedParticle({
      x,
      y: y + (Math.random() - 0.5) * (kind === "airTrail" ? 0.08 : 0.22),
      z,
      vx: Math.cos(spread) * velocity,
      vy: kind === "jumpDust" ? 0.28 + Math.random() * 0.72 : kind === "airTrail" ? -0.12 + Math.random() * 0.22 : (kind === "blast" ? 2.4 : 1.4) + Math.random() * 2.4,
      vz: Math.sin(spread) * velocity,
      life: life * (0.72 + Math.random() * 0.58),
      size: baseSize * (0.65 + Math.random() * 1.2),
      r: color.r,
      g: color.g,
      b: color.b
    });
  }
}

function addBatchedParticle(particle: BatchedParticle): boolean {
  const pool = getBatchedParticlePool();
  if (!pool || pool.count >= pool.capacity) return false;
  const index = pool.count;
  pool.count += 1;
  const x = wrapWorld(particle.x);
  const z = wrapWorld(particle.z);
  pool.x[index] = x;
  pool.y[index] = particle.y;
  pool.z[index] = z;
  pool.vx[index] = particle.vx;
  pool.vy[index] = particle.vy;
  pool.vz[index] = particle.vz;
  pool.age[index] = 0;
  pool.life[index] = Math.max(0.04, particle.life);
  pool.size[index] = particle.size;
  pool.groundY[index] = typeof particle.groundY === "number" && Number.isFinite(particle.groundY) ? particle.groundY : terrainHeightAt(x, z);
  pool.r[index] = particle.r;
  pool.g[index] = particle.g;
  pool.b[index] = particle.b;
  telemetry.particleCreates += 1;
  return true;
}

function updateBatchedParticles(dt: number): void {
  const pool = getBatchedParticlePool(false);
  if (!pool) return;
  let index = 0;
  while (index < pool.count) {
    pool.age[index] += dt;
    if (pool.age[index] >= pool.life[index]) {
      removeBatchedParticle(index);
      continue;
    }
    pool.vy[index] -= 9.5 * dt;
    pool.x[index] = wrapWorld(pool.x[index] + pool.vx[index] * dt);
    pool.y[index] = Math.max(pool.groundY[index] + 0.08, pool.y[index] + pool.vy[index] * dt);
    pool.z[index] = wrapWorld(pool.z[index] + pool.vz[index] * dt);
    const progress = pool.age[index] / pool.life[index];
    const fade = Math.max(0, 1 - progress);
    const position = renderPositionInto(tempRenderPosition, pool.x[index], pool.z[index]);
    tempVec.set(position.x, pool.y[index], position.z);
    tempQuaternion.copy(camera.quaternion);
    const size = pool.size[index] * (0.35 + fade * 0.9);
    tempScale.set(size, size, 1);
    tempMatrix.compose(tempVec, tempQuaternion, tempScale);
    pool.mesh.setMatrixAt(index, tempMatrix);
    tempColor.setRGB(pool.r[index] * fade, pool.g[index] * fade, pool.b[index] * fade);
    pool.mesh.setColorAt?.(index, tempColor);
    index += 1;
  }
  pool.mesh.count = pool.count;
  pool.mesh.instanceMatrix.needsUpdate = true;
  if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
}

function removeBatchedParticle(index: number): void {
  const pool = getBatchedParticlePool(false);
  if (!pool) return;
  const last = pool.count - 1;
  if (index !== last) {
    pool.x[index] = pool.x[last];
    pool.y[index] = pool.y[last];
    pool.z[index] = pool.z[last];
    pool.vx[index] = pool.vx[last];
    pool.vy[index] = pool.vy[last];
    pool.vz[index] = pool.vz[last];
    pool.age[index] = pool.age[last];
    pool.life[index] = pool.life[last];
    pool.size[index] = pool.size[last];
    pool.groundY[index] = pool.groundY[last];
    pool.r[index] = pool.r[last];
    pool.g[index] = pool.g[last];
    pool.b[index] = pool.b[last];
  }
  pool.count = last;
}

function spawnEffect(kind: EffectKind, x: number, z: number, life: number, options: EffectOptions = {}): void {
  telemetry.effectCreates += 1;
  if (PERF_FLAGS.batchParticles) {
    measureTelemetryPhase("particleSpawnBatched", () => spawnBatchedEffect(kind, x, z, life, options));
    return;
  }
  measureTelemetryPhase("particleSpawnScene", () => spawnSceneEffect(kind, x, z, life, options));
}

function spawnSceneEffect(kind: EffectKind, x: number, z: number, life: number, options: EffectOptions = {}): void {
  const angle = options.angle ?? 0;
  const color = new THREE.Color(options.color ?? (kind === "muzzle" ? 0xffd37d : kind === "hit" ? 0xbfff88 : 0xff7842));
  const group = new THREE.Group();
  const sparks: SceneSpark[] = [];
  let expand = 1.7;
  if (kind === "muzzle") {
    const core = new THREE.Mesh(getEffectGeometry("muzzle"), getEffectMaterial(color, 0.96));
    core.scale.setScalar(1.45);
    const cone = new THREE.Mesh(getConeGeometry(), getEffectMaterial(color, 0.78));
    cone.rotation.z = -Math.PI / 2;
    cone.position.x = 0.5;
    cone.scale.set(1.35, 0.9, 1.35);
    group.add(core, cone);
    createSparks(group, sparks, color, 11, angle, 6.5);
    group.rotation.y = -angle;
    expand = 2.4;
  } else if (kind === "hit") {
    const core = new THREE.Mesh(getEffectGeometry("hit"), getEffectMaterial(color, 0.92));
    group.add(core);
    createSparks(group, sparks, color, 14, angle, 5.2);
    expand = 1.55;
  } else if (kind === "jumpDust" || kind === "airTrail") {
    createSparks(group, sparks, color, particlesForEffect(kind, options), angle, options.speed ?? (kind === "jumpDust" ? 2.7 : 0.7), {
      fullCircle: kind === "jumpDust",
      startSpread: kind === "airTrail" ? 0.08 : 0.22,
      verticalBase: kind === "jumpDust" ? 0.28 : -0.12,
      verticalRandom: kind === "jumpDust" ? 0.72 : 0.22,
      scale: options.size ?? (kind === "jumpDust" ? 0.22 : 0.13)
    });
    expand = kind === "jumpDust" ? 1.2 : 0.6;
  } else {
    const blast = new THREE.Mesh(getEffectGeometry("blast"), getEffectMaterial(color, 0.72));
    const ring = new THREE.Mesh(getRingGeometry(), getEffectMaterial(color, 0.48));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.9;
    group.add(blast, ring);
    createSparks(group, sparks, color, 14, angle, 5.2);
    expand = 3.4;
  }
  const position = renderPositionInto(tempRenderPosition, x, z);
  const y = options.worldY ?? (terrainHeightAt(x, z) + (options.y ?? (kind === "muzzle" ? 1.45 : kind === "jumpDust" ? 0.18 : kind === "airTrail" ? 1.4 : 1.2)));
  group.position.set(position.x, y, position.z);
  scene.add(group);
  state.effects.push({ mesh: group, sparks, t: 0, life, baseScale: group.scale.x, expand });
}

function particlesForEffect(kind: EffectKind, options: EffectOptions = {}): number {
  return Math.max(1, Math.floor(options.particles ?? (kind === "airTrail" ? 1 : kind === "jumpDust" ? 12 : 14)));
}

function createSparks(
  group: Three.Group,
  sparks: SceneSpark[],
  color: Three.Color,
  count: number,
  angle: number,
  speed: number,
  options: SparkOptions = {}
): void {
  for (let i = 0; i < count; i += 1) {
    const spread = options.fullCircle ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * Math.PI * 1.15;
    const mesh = new THREE.Mesh(getSparkGeometry(), getSparkMaterial(color));
    const startSpread = options.startSpread ?? 0.22;
    mesh.position.set((Math.random() - 0.5) * startSpread, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * startSpread);
    mesh.scale.setScalar(options.scale ? options.scale * (0.7 + Math.random() * 0.7) : 0.55 + Math.random() * 0.75);
    group.add(mesh);
    sparks.push({
      mesh,
      vx: Math.cos(spread) * (speed * (0.45 + Math.random() * 0.85)),
      vz: Math.sin(spread) * (speed * (0.45 + Math.random() * 0.85)),
      vy: (options.verticalBase ?? 1.8) + Math.random() * (options.verticalRandom ?? 2.5),
      rx: (Math.random() - 0.5) * 10,
      ry: (Math.random() - 0.5) * 10
    });
  }
}

function setEffectOpacity(mesh: Three.Object3D, opacity: number): void {
  mesh.traverse((child) => forEachObjectMaterial(child, (material) => {
    material.transparent = true;
    const opacityBase = typeof material.userData?.opacityBase === "number" ? material.userData.opacityBase : 1;
    material.opacity = opacity * opacityBase;
  }));
}

function spawnPulseRing(x: number, z: number, colorValue: Three.ColorRepresentation = "#caff78", life = 0.36, baseScale = 1, expand = 3.2): void {
  telemetry.effectCreates += 1;
  if (PERF_FLAGS.pulseRingsBatched) {
    measureTelemetryPhase("particleSpawnBatched", () => spawnBatchedEffect("blast", x, z, Math.max(0.12, life), {
      color: colorValue,
      particles: Math.max(8, Math.round(10 * baseScale)),
      speed: Math.max(2.4, expand * 1.4),
      size: Math.max(0.18, baseScale * 0.28)
    }));
    return;
  }
  const color = new THREE.Color(colorValue);
  const ring = new THREE.Mesh(getRingGeometry(), getEffectMaterial(color, 0.72));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(baseScale);
  const position = renderPositionInto(tempRenderPosition, x, z);
  ring.position.set(position.x, terrainHeightAt(x, z) + 0.09, position.z);
  scene.add(ring);
  state.effects.push({ mesh: ring, t: 0, life, baseScale, expand });
}

function spawnBeamPreview(muzzle: WorldPosition3D, angle: number, length: number, colorValue: Three.ColorRepresentation = "#ffd782"): void {
  telemetry.effectCreates += 1;
  const geometry = cachedGeometry("geometry:indicator:beamPreview", () => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0)
  ]));
  const line = new THREE.Line(geometry, getLineEffectMaterial(colorValue, 0.78));
  const position = renderPosition(muzzle.x, muzzle.z);
  line.position.set(position.x, muzzle.y ?? 1.35, position.z);
  line.rotation.y = -angle;
  line.scale.set(length, 1, 1);
  scene.add(line);
  state.effects.push({ mesh: line, t: 0, life: 0.11, baseScale: 1, expand: 0 });
}

function spawnDamageDirectionWedge(options: PlayerDamageOptions = {}): void {
  const player = state.player;
  const sourceX = options.sourceX ?? options.source?.x;
  const sourceZ = options.sourceZ ?? options.source?.z;
  if (!player || typeof sourceX !== "number" || typeof sourceZ !== "number") return;
  telemetry.effectCreates += 1;
  const angle = angleTo(player.x, player.z, sourceX, sourceZ);
  const wedge = new THREE.Mesh(getDamageWedgeGeometry(), createIndicatorMaterial("#ff5d4d", 0.66));
  const position = renderPosition(player.x, player.z);
  wedge.position.set(position.x, actorGroundHeight(player) + 0.155, position.z);
  wedge.rotation.x = -Math.PI / 2;
  wedge.rotation.z = -angle;
  scene.add(wedge);
  state.effects.push({ mesh: wedge, t: 0, life: 0.38, baseScale: 1, expand: 0.24 });
}

function getDamageWedgeGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:indicator:damageWedge", () => {
    const shape = new THREE.Shape();
    const inner = 1.05;
    const outer = 4.6;
    const half = 0.34;
    shape.moveTo(Math.cos(-half) * inner, Math.sin(-half) * inner);
    shape.lineTo(Math.cos(-half) * outer, Math.sin(-half) * outer);
    shape.lineTo(outer, 0);
    shape.lineTo(Math.cos(half) * outer, Math.sin(half) * outer);
    shape.lineTo(Math.cos(half) * inner, Math.sin(half) * inner);
    shape.lineTo(Math.cos(-half) * inner, Math.sin(-half) * inner);
    return new THREE.ShapeGeometry(shape);
  });
}

function getLineEffectMaterial(colorValue: Three.ColorRepresentation, opacity: number): Three.LineBasicMaterial {
  return cachedLineBasicMaterial(`material:lineEffect:${String(colorValue)}:${opacity}`, () => {
    telemetry.materialCreates += 1;
    const material = new THREE.LineBasicMaterial({
      color: colorValue,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    material.userData = { opacityBase: opacity };
    return material;
  });
}

function ensureAudio(): boolean {
  const context = arenaAudioRuntime.ensure(currentAudioMix());
  if (!context) return false;
  if (!audio.noiseBuffer) {
    audio.noiseBuffer = createNoiseBuffer(context);
    audio.nextBeatAt = context.currentTime + 0.05;
    audio.beat = 0;
  }
  return true;
}

function currentAudioMix() {
  return {
    master: state.settings.masterVolume,
    music: state.settings.musicVolume,
    sfx: state.settings.sfxVolume,
    muted: state.settings.muted,
  };
}

function applyAudioSettings(): void {
  arenaAudioRuntime.apply(currentAudioMix());
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 1.2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    last = last * 0.72 + (Math.random() * 2 - 1) * 0.28;
    data[i] = last;
  }
  return buffer;
}

function updateAudio(): void {
  const context = arenaAudioRuntime.graph.context;
  if (!context || context.state !== "running" || !arenaAudioRuntime.graph.music || !state.running) return;
  const now = context.currentTime;
  if (audio.nextBeatAt <= 0 || audio.nextBeatAt < now - 0.5) audio.nextBeatAt = now + 0.02;
  while (audio.nextBeatAt < now + 0.18) {
    scheduleMusicBeat(audio.nextBeatAt, audio.beat);
    audio.nextBeatAt += 0.3;
    audio.beat += 1;
  }
}

function scheduleMusicBeat(time: number, beat: number): void {
  const roots = [55, 55, 65.41, 49, 58.27, 55, 73.42, 65.41];
  const root = roots[Math.floor(beat / 4) % roots.length] ?? 55;
  const pressure = Math.min(1, state.time / 420);
  if (beat % 4 === 0) {
    scheduleTone(time, root, 0.42, {
      type: "sawtooth",
      gain: 0.032 + pressure * 0.018,
      endFreq: root * 0.985,
      dest: arenaAudioRuntime.graph.music
    });
  }
  if (beat % 2 === 0) {
    const note = root * (beat % 8 === 6 ? 5.62 : 4);
    scheduleTone(time + 0.03, note, 0.09, {
      type: "triangle",
      gain: 0.018 + pressure * 0.012,
      endFreq: note * 1.01,
      dest: arenaAudioRuntime.graph.music
    });
  }
  if (beat % 4 === 2) {
    scheduleNoise(time + 0.01, 0.035, {
      gain: 0.016 + pressure * 0.012,
      frequency: 5200,
      type: "highpass",
      dest: arenaAudioRuntime.graph.music
    });
  }
  if (state.combo >= 6 && beat % 2 === 1) {
    scheduleTone(time + 0.11, root * 7.5, 0.055, {
      type: "square",
      gain: Math.min(0.026, 0.01 + state.combo * 0.0014),
      endFreq: root * 8.2,
      dest: arenaAudioRuntime.graph.music
    });
  }
}

function playSynthCue(kind: SynthCueKind, intensity = 1, options: SynthCueOptions = {}): void {
  const context = arenaAudioRuntime.graph.context;
  if (!context || !arenaAudioRuntime.graph.sfx) return;
  context.resume?.().catch(() => undefined);
  const now = context.currentTime;
  const gain = Math.max(0.05, intensity);
  if (kind === "shot") {
    if (now < audio.shotGateAt) return;
    audio.shotGateAt = now + 0.035;
    const weaponId = String(options.weaponId ?? "");
    const base = weaponId.includes("Stake") || weaponId.includes("rifle") ? 290 : weaponId.includes("Lantern") || weaponId.includes("flame") ? 170 : 235;
    scheduleNoise(now, 0.028, { gain: 0.034 * gain, frequency: 1900, type: "highpass" });
    scheduleTone(now, base, 0.055, { type: "square", gain: 0.04 * gain, endFreq: base * 0.56 });
    return;
  }
  if (kind === "hit") {
    if (now < audio.hitGateAt) return;
    audio.hitGateAt = now + 0.024;
    scheduleTone(now, 620 + Math.random() * 140, 0.045, { type: "triangle", gain: 0.022 * gain, endFreq: 420 });
    scheduleNoise(now, 0.025, { gain: 0.02 * gain, frequency: 2800, type: "bandpass" });
    return;
  }
  if (kind === "pickup") {
    if (now < audio.pickupGateAt) return;
    audio.pickupGateAt = now + 0.045;
    const base = options.kind === "heal" ? 520 : 880;
    scheduleTone(now, base, 0.07, { type: "sine", gain: 0.035 * gain, endFreq: base * 1.55 });
    scheduleTone(now + 0.045, base * 1.5, 0.08, { type: "triangle", gain: 0.026 * gain, endFreq: base * 1.9 });
    return;
  }
  if (kind === "kill") {
    scheduleTone(now, 190 + Math.random() * 30, 0.12, { type: "sawtooth", gain: 0.05 * gain, endFreq: 84 });
    scheduleNoise(now, 0.07, { gain: 0.04 * gain, frequency: 680, type: "lowpass" });
    return;
  }
  if (kind === "bossKill") {
    scheduleTone(now, 98, 0.32, { type: "sawtooth", gain: 0.08 * gain, endFreq: 52 });
    scheduleTone(now + 0.08, 392, 0.28, { type: "triangle", gain: 0.055 * gain, endFreq: 784 });
    scheduleNoise(now, 0.22, { gain: 0.07 * gain, frequency: 900, type: "lowpass" });
    return;
  }
  if (kind === "level" || kind === "weapon") {
    const notes = kind === "weapon" ? [392, 587.33, 783.99] : [329.63, 493.88, 659.25, 987.77];
    notes.forEach((note, index) => {
      scheduleTone(now + index * 0.055, note, 0.16, { type: "triangle", gain: 0.045 * gain, endFreq: note * 1.02 });
    });
    return;
  }
  if (kind === "start" || kind === "wave") {
    scheduleTone(now, 146.83, 0.24, { type: "sine", gain: 0.055 * gain, endFreq: 220 });
    scheduleTone(now + 0.08, 440, 0.18, { type: "triangle", gain: 0.038 * gain, endFreq: 660 });
    scheduleNoise(now, 0.16, { gain: 0.026 * gain, frequency: 1400, type: "bandpass" });
    return;
  }
  if (kind === "boss") {
    scheduleTone(now, 73.42, 0.52, { type: "sawtooth", gain: 0.08 * gain, endFreq: 49 });
    scheduleNoise(now, 0.36, { gain: 0.055 * gain, frequency: 520, type: "lowpass" });
    return;
  }
  if (kind === "telegraph") {
    scheduleTone(now, 220, 0.12, { type: "sine", gain: 0.028 * gain, endFreq: 196 });
    return;
  }
  if (kind === "jump") {
    scheduleTone(now, 330, 0.09, { type: "triangle", gain: 0.026 * gain, endFreq: 520 });
    scheduleTone(now + 0.035, 520, 0.08, { type: "sine", gain: 0.018 * gain, endFreq: 760 });
    return;
  }
  if (kind === "slam") {
    scheduleTone(now, 82.41, 0.18, { type: "sawtooth", gain: 0.07 * gain, endFreq: 45 });
    scheduleNoise(now, 0.12, { gain: 0.058 * gain, frequency: 430, type: "lowpass" });
    return;
  }
  if (kind === "damage") {
    scheduleTone(now, 110, 0.16, { type: "square", gain: 0.055 * gain, endFreq: 72 });
    scheduleNoise(now, 0.08, { gain: 0.05 * gain, frequency: 620, type: "bandpass" });
    return;
  }
  if (kind === "death") {
    scheduleTone(now, 146.83, 0.54, { type: "sawtooth", gain: 0.075 * gain, endFreq: 46.25 });
    scheduleNoise(now, 0.5, { gain: 0.045 * gain, frequency: 360, type: "lowpass" });
  }
}

function scheduleTone(time: number, frequency: number, duration: number, options: ToneOptions = {}): void {
  const context = arenaAudioRuntime.graph.context;
  const destination = options.dest ?? arenaAudioRuntime.graph.sfx;
  if (!context || !destination) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attack = Math.max(0.002, options.attack ?? 0.006);
  const release = Math.max(0.01, options.release ?? 0.045);
  const peak = Math.max(0.0001, options.gain ?? 0.04);
  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), time);
  if (options.endFreq) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(time);
  oscillator.stop(time + duration + release + 0.03);
}

function scheduleNoise(time: number, duration: number, options: NoiseOptions = {}): void {
  const context = arenaAudioRuntime.graph.context;
  const destination = options.dest ?? arenaAudioRuntime.graph.sfx;
  if (!context || !audio.noiseBuffer || !destination) return;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const attack = Math.max(0.002, options.attack ?? 0.004);
  const release = Math.max(0.01, options.release ?? 0.035);
  source.buffer = audio.noiseBuffer;
  source.loop = true;
  filter.type = options.type ?? "bandpass";
  filter.frequency.setValueAtTime(options.frequency ?? 1200, time);
  filter.Q.value = options.q ?? 0.8;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain ?? 0.03), time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(time);
  source.stop(time + duration + release + 0.03);
}

function pulseOverlay(kind: "danger" | "gold" | "level"): void {
  if (!ui.fxOverlay) return;
  const className = `flash-${kind}`;
  ui.fxOverlay.classList.remove("flash-danger", "flash-gold", "flash-level");
  void ui.fxOverlay.offsetWidth;
  ui.fxOverlay.classList.add(className);
}

function showCenterBanner(title: string, subtitle = ""): void {
  if (!ui.centerBanner) return;
  if (shouldSuppressNonCriticalReward(title)) return;
  ui.centerBanner.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = title;
  ui.centerBanner.append(strong);
  if (subtitle) {
    const span = document.createElement("span");
    span.textContent = subtitle;
    ui.centerBanner.append(span);
  }
  ui.centerBanner.classList.add("show");
  clearTimeout(centerBannerTimeout);
  centerBannerTimeout = setTimeout(() => ui.centerBanner?.classList.remove("show"), 1900);
}

function spawnFloatingText(
  text: string,
  x: number,
  z: number,
  colorValue: Three.ColorRepresentation = "#fff3a0",
  scale = 1,
  options: FloatingTextOptions = {}
): void {
  if (shouldSuppressNonCriticalReward(text)) return;
  const color = typeof colorValue === "string"
    ? colorValue
    : `#${new THREE.Color(colorValue).getHexString()}`;
  floatingTextLayer?.spawn({
    text,
    position: [wrapWorld(x), terrainHeightAt(x, z) + (options.y ?? 0), wrapWorld(z)],
    color,
    scale,
    targetHeight: options.targetHeight ?? PLAYER_HEIGHT_WORLD + 0.35,
    baseFontPx: options.baseFontPx,
    lifeSeconds: options.lifeSeconds,
    rise: options.rise,
    screenRisePx: options.screenRisePx,
    growScale: options.growScale
  });
}

function shouldSuppressNonCriticalReward(text: string): boolean {
  if (!state.running || !isHighCombatPressure()) return false;
  return /^(NEW WEAPON|UPGRADE|MAGNET|LEVEL UP|\+4 shards|Weapon Upgrade|Weapon Unlocked)$/i.test(String(text ?? "").trim());
}

function isHighCombatPressure(): boolean {
  if (!state.player) return false;
  let close = 0;
  let near = 0;
  const candidates = queryLiveEnemies(state.player.x, state.player.z, 32);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const distanceSq = worldDistanceSquared(state.player.x, state.player.z, enemy.x, enemy.z);
    if (distanceSq <= 18 ** 2) close += 1;
    if (distanceSq <= 32 ** 2) near += 1;
    if (close >= 3 || near >= 10) return true;
  }
  return false;
}

function updateFloatingTexts(dt: number): void {
  floatingTextLayer?.update(dt);
}

function clearFloatingTexts(): void {
  floatingTextLayer?.clear();
}

function actorFloatingTextHeight(actor: WorldActor, extra = 0.35): number {
  return Math.max(1.5, PLAYER_HEIGHT_WORLD * (actor?.scale ?? 1) + (actor?.jumpY ?? 0) + extra);
}

function pickupFloatingTextHeight(pickup: Pickup): number {
  return Math.max(1.55, 1.15 + (pickup?.scale ?? 1) * 0.55);
}

function registerComboKill(enemy: Enemy): void {
  state.combo += 1;
  state.comboTimer = COMBO_TIMEOUT_SECONDS;
  if (state.combo > 0 && state.combo % 8 === 0) {
    spawnFloatingText(`${state.combo} CHAIN`, enemy.x, enemy.z, "#ffd86a", 1.18, { targetHeight: actorFloatingTextHeight(enemy, 0.62) });
    playSynthCue("pickup", 1.15, { kind: "xp" });
  }
  updateComboReadout();
}

function updateCombo(dt: number): void {
  if (state.combo <= 0) return;
  state.comboTimer -= dt;
  if (state.comboTimer <= 0) {
    state.combo = 0;
    state.comboTimer = 0;
  }
  updateComboReadout();
}

function updateComboReadout(): void {
  if (!ui.comboText) return;
  if (state.combo < 3) {
    ui.comboText.classList.remove("show");
    ui.comboText.textContent = "";
    return;
  }
  ui.comboText.textContent = `${state.combo}x chain`;
  ui.comboText.classList.add("show");
}

function getBulletGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:bullet", () => new THREE.SphereGeometry(0.22, 12, 8));
}

function getBulletTrailGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:bulletTrail", () => new THREE.CylinderGeometry(0.055, 0.2, 1.85, 8, 1, true));
}

function getSparkGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:spark", () => new THREE.BoxGeometry(0.12, 0.045, 0.045));
}

function getBulletMaterial(colorValue: Three.ColorRepresentation): Three.MeshBasicMaterial {
  return cachedMeshBasicMaterial(`material:bullet:${String(colorValue)}`, () => getEffectMaterial(new THREE.Color(colorValue), 1));
}

function getTrailMaterial(colorValue: Three.ColorRepresentation): Three.MeshBasicMaterial {
  return cachedMeshBasicMaterial(`material:trail:${String(colorValue)}`, () => getEffectMaterial(new THREE.Color(colorValue), 0.42));
}

function getSparkMaterial(color: Three.Color): Three.MeshBasicMaterial {
  return cachedMeshBasicMaterial(`material:spark:${color.getHexString()}`, () => getEffectMaterial(color, 0.92));
}

function getEffectMaterial(color: Three.ColorRepresentation, opacity: number): Three.MeshBasicMaterial {
  telemetry.materialCreates += 1;
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  material.userData = { opacityBase: opacity };
  return material;
}

function getEffectGeometry(kind: EffectKind): Three.BufferGeometry {
  return cachedGeometry(`geometry:effect:${kind}`, () => {
    const radius = kind === "muzzle" ? 0.28 : kind === "blast" ? 0.72 : 0.46;
    return new THREE.SphereGeometry(radius, kind === "muzzle" ? 10 : 14, kind === "muzzle" ? 8 : 10);
  });
}

function getConeGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:effect:muzzleCone", () => new THREE.ConeGeometry(0.35, 0.95, 7, 1, true));
}

function getRingGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:effect:blastRing", () => new THREE.RingGeometry(0.55, 1.05, 28));
}

function rebuildEnemySpatialGrid(): void {
  const items = state.enemySpatialItems;
  items.length = 0;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.y = enemy.z;
    items.push(enemy);
  }
  state.enemySpatialGrid.rebuild(items);
  state.enemySpatialDirty = false;
}

function markEnemySpatialDirty(): void {
  state.enemySpatialDirty = true;
}

function queryLiveEnemies(x: number, z: number, range: number, out: Enemy[] = state.enemySpatialCandidates): Enemy[] {
  if (state.enemySpatialDirty || state.enemySpatialGrid.size() !== state.enemySpatialItems.length) rebuildEnemySpatialGrid();
  return state.enemySpatialGrid.queryCircle({ x, y: z, radius: Math.max(0, range) }, out);
}

function nearestEnemy(x: number, z: number, range: number): Enemy | null {
  const candidates = queryLiveEnemies(x, z, range);
  let best = null;
  let bestDistanceSq = range * range;
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const distanceSq = worldDistanceSquared(x, z, enemy.x, enemy.z);
    if (distanceSq <= bestDistanceSq) {
      best = enemy;
      bestDistanceSq = distanceSq;
    }
  }
  return best;
}

function nearestPlayer(x: number, z: number, fallback: Player): EnemyTarget {
  if (remotePlayers.size === 0) return fallback;
  let best: EnemyTarget = fallback;
  let bestDist = worldDistanceSquared(x, z, fallback.x, fallback.z);
  for (const remote of remotePlayers.values()) {
    const rx = remote.mesh.position.x;
    const rz = remote.mesh.position.z;
    const d2 = worldDistanceSquared(x, z, rx, rz);
    if (d2 < bestDist) {
      bestDist = d2;
      best = { x: rx, z: rz, radius: 1 };
    }
  }
  return best;
}

function angleTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(worldAxisDelta(az, bz), worldAxisDelta(ax, bx));
}

function distanceSquared(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

function getWorldSize(): number {
  return WORLD_SIZE;
}

function getWorldCenter(): WorldPoint {
  const [minX, minZ] = toroidalWorld.origin;
  return {
    x: minX + toroidalWorld.width / 2,
    z: minZ + toroidalWorld.depth / 2
  };
}

function wrapWorld(value: number): number {
  return wrapValue(value, WORLD_SIZE);
}

function wrapEntity<T extends { x: number; z: number }>(entity: T): void {
  entity.x = wrapWorld(entity.x);
  entity.z = wrapWorld(entity.z);
}

function worldAxisDelta(from: number, to: number): number {
  let delta = to - from;
  if (delta > WORLD_HALF_SIZE) delta -= WORLD_SIZE;
  else if (delta < -WORLD_HALF_SIZE) delta += WORLD_SIZE;
  return delta;
}

function worldDeltaInto(out: WorldDelta, ax: number, az: number, bx: number, bz: number): WorldDelta {
  out.dx = worldAxisDelta(ax, bx);
  out.dz = worldAxisDelta(az, bz);
  return out;
}

function worldDelta(ax: number, az: number, bx: number, bz: number): WorldDelta {
  return { dx: worldAxisDelta(ax, bx), dz: worldAxisDelta(az, bz) };
}

function worldDistanceSquared(ax: number, az: number, bx: number, bz: number): number {
  const dx = worldAxisDelta(ax, bx);
  const dz = worldAxisDelta(az, bz);
  return dx * dx + dz * dz;
}

function renderPosition(x: number, z: number, anchor: Pick<WorldActor, "x" | "z"> | null = state.player): WorldPoint {
  if (!anchor) return { x, z };
  return { x: anchor.x + worldAxisDelta(anchor.x, x), z: anchor.z + worldAxisDelta(anchor.z, z) };
}

function renderPositionInto(out: WorldPoint, x: number, z: number, anchor: Pick<WorldActor, "x" | "z"> | null = state.player): WorldPoint {
  if (!anchor) {
    out.x = x;
    out.z = z;
    return out;
  }
  out.x = anchor.x + worldAxisDelta(anchor.x, x);
  out.z = anchor.z + worldAxisDelta(anchor.z, z);
  return out;
}

function weightedPick(mix: ReadonlyArray<readonly [string, number]>): string {
  const total = mix.reduce((sum, entry) => sum + entry[1], 0);
  let r = runRandom() * total;
  for (const [id, weight] of mix) {
    r -= weight;
    if (r <= 0) return id;
  }
  const fallback = mix[0];
  if (!fallback) throw new Error("Cannot choose from an empty weighted mix.");
  return fallback[0];
}

function updatePointerWorld(clientX: number, clientY: number): void {
  const nx = (clientX / window.innerWidth) * 2 - 1;
  const ny = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(tempPointerNdc.set(nx, ny), camera);
  raycaster.ray.intersectPlane(groundPlane, tempVec);
  setAimWorld(tempVec.x, tempVec.z);
}

function setAimWorld(worldX: number, worldZ: number): void {
  pointer.worldX = wrapWorld(worldX);
  pointer.worldZ = wrapWorld(worldZ);
}

function syncReticleToAimWorld(): void {
  tempVec.set(pointer.worldX, terrainHeightAt(pointer.worldX, pointer.worldZ) + 1, pointer.worldZ).project(camera);
  positionReticle((tempVec.x * 0.5 + 0.5) * window.innerWidth, (-tempVec.y * 0.5 + 0.5) * window.innerHeight);
}

function positionReticle(clientX: number, clientY: number): void {
  if (!ui.reticle) return;
  if (Math.abs(clientX - lastReticleX) < 0.25 && Math.abs(clientY - lastReticleY) < 0.25) return;
  lastReticleX = clientX;
  lastReticleY = clientY;
  ui.reticle.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
}

async function loadFirstTexture(
  textureLoader: Three.TextureLoader,
  paths: readonly string[],
  fallbackCanvas: Three.Texture,
  label = "Loading texture",
  startProgress = 0,
  endProgress = 1
): Promise<Three.Texture> {
  return loadFirstThreeAsset(
    paths,
    (path) => loadThreeLoaderAsset(textureLoader, path, {
      onProgress: (event) => {
        const progress = progressFromLoadEvent(event);
        if (progress === undefined) return;
        reportBootProgress(startProgress + (endProgress - startProgress) * progress, label);
      },
      prepare: (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        reportBootProgress(endProgress, label);
        return texture;
      }
    }),
    { fallback: fallbackCanvas }
  );
}

function solidTexture(colorValue: Three.ColorRepresentation): Three.Texture {
  const normalizedColor = typeof colorValue === "string" || typeof colorValue === "number"
    ? colorValue
    : `#${new THREE.Color(colorValue).getHexString()}`;
  const texture = createSolidThreeTexture(threeView.THREE, normalizedColor, { colorSpace: THREE.SRGBColorSpace });
  return requireRuntimeInstance(texture, THREE.Texture, "Solid texture");
}

function createPickupSpriteTexture(kind: Pickup["kind"]): Three.Texture {
  const fallback = kind === "weapon" ? "#ffd27a" : kind === "heal" ? "#c7ffae" : kind === "magnet" ? "#9fe8ff" : "#7bd6ff";
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return solidTexture(fallback);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(64, 64, 8, 64, 64, 61);
  const glowColor = kind === "weapon" ? "255, 194, 92" : kind === "heal" ? "165, 255, 142" : kind === "magnet" ? "159, 232, 255" : "120, 214, 255";
  glow.addColorStop(0, `rgba(${glowColor}, 0.78)`);
  glow.addColorStop(0.5, `rgba(${glowColor}, 0.22)`);
  glow.addColorStop(1, `rgba(${glowColor}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  if (kind === "weapon") drawWeaponPickupSprite(ctx);
  else if (kind === "heal") drawHealPickupSprite(ctx);
  else if (kind === "magnet") drawMagnetPickupSprite(ctx);
  else drawXpPickupSprite(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawMagnetPickupSprite(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(64, 66);
  ctx.strokeStyle = "rgba(5, 14, 22, 0.72)";
  ctx.lineWidth = 25;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.14, Math.PI * 0.86, true);
  ctx.stroke();
  ctx.strokeStyle = "#8ee8ff";
  ctx.lineWidth = 19;
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.14, Math.PI * 0.86, true);
  ctx.stroke();
  ctx.strokeStyle = "#f8fff2";
  ctx.lineWidth = 19;
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.14, Math.PI * 0.34, true);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.66, Math.PI * 0.86, true);
  ctx.stroke();
  ctx.fillStyle = "#f8fff2";
  drawRoundRect(ctx, -43, -5, 18, 23, 4);
  ctx.fill();
  drawRoundRect(ctx, 25, -5, 18, 23, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(159, 232, 255, 0.82)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 47, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawXpPickupSprite(ctx: CanvasRenderingContext2D): void {
  const crystal = ctx.createLinearGradient(38, 22, 88, 104);
  crystal.addColorStop(0, "#f0fbff");
  crystal.addColorStop(0.38, "#7bd6ff");
  crystal.addColorStop(1, "#235cd8");
  ctx.save();
  ctx.translate(64, 64);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "rgba(3, 11, 18, 0.42)";
  drawRoundRect(ctx, -24, -24, 48, 48, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 251, 255, 0.92)";
  ctx.lineWidth = 4;
  ctx.fillStyle = crystal;
  drawRoundRect(ctx, -20, -20, 40, 40, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(52, 42, 4, 0, Math.PI * 2);
  ctx.arc(76, 86, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(172, 236, 255, 0.76)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(64, 66, 34, 15, -0.45, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHealPickupSprite(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(5, 15, 7, 0.55)";
  ctx.beginPath();
  ctx.arc(64, 64, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(224, 255, 205, 0.92)";
  ctx.lineWidth = 4;
  ctx.fillStyle = "#92f07b";
  ctx.beginPath();
  ctx.arc(64, 64, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f7fff0";
  drawRoundRect(ctx, 57, 42, 14, 44, 4);
  ctx.fill();
  drawRoundRect(ctx, 42, 57, 44, 14, 4);
  ctx.fill();
}

function drawWeaponPickupSprite(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(12, 8, 3, 0.62)";
  drawRoundRect(ctx, 30, 42, 68, 45, 8);
  ctx.fill();
  const chest = ctx.createLinearGradient(34, 38, 88, 90);
  chest.addColorStop(0, "#fff0a8");
  chest.addColorStop(0.46, "#d99134");
  chest.addColorStop(1, "#6f3d1e");
  ctx.fillStyle = chest;
  drawRoundRect(ctx, 35, 45, 58, 38, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 245, 187, 0.92)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "rgba(70, 38, 21, 0.72)";
  ctx.fillRect(35, 60, 58, 6);
  ctx.fillStyle = "#fff0a8";
  drawRoundRect(ctx, 59, 55, 10, 17, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 230, 137, 0.82)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(47, 33);
  ctx.lineTo(83, 92);
  ctx.stroke();
  ctx.fillStyle = "#f9fcff";
  ctx.beginPath();
  ctx.moveTo(43, 28);
  ctx.lineTo(52, 34);
  ctx.lineTo(44, 39);
  ctx.closePath();
  ctx.fill();
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clearList<T extends SceneListItem>(list: T[]): void {
  for (const item of list) {
    if (item.mesh) scene.remove(item.mesh);
    if (item.light) scene.remove(item.light);
    if (item.userData?.light) scene.remove(item.userData.light);
    if (isEnemySceneItem(item)) removeEnemyHealthBar(item);
  }
  list.length = 0;
}

function removeFromList<T extends SceneListItem>(list: T[], index: number): void {
  const [item] = list.splice(index, 1);
  if (item?.mesh) scene.remove(item.mesh);
  if (item?.light) scene.remove(item.light);
  if (item && isEnemySceneItem(item)) removeEnemyHealthBar(item);
}

function updateMinimap(dt = 0, force = false): void {
  const ctx = minimapCtx;
  const player = state.player;
  if (!ctx || !player || !ui.minimapCanvas) return;
  state.minimapClock -= dt;
  if (!force && state.minimapClock > 0) return;
  state.minimapClock = MINIMAP_UPDATE_INTERVAL;
  const canvas = ui.minimapCanvas;
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cz = height / 2;
  const scale = Math.min(width, height) / (MINIMAP_RANGE * 2);
  const worldSize = getWorldSize();
  const halfWorld = worldSize / 2;
  let pointX = 0;
  let pointY = 0;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(3, 8, 7, 0.9)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(210, 244, 158, 0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = (width * i) / 4;
    const y = (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(210, 244, 158, 0.28)";
  ctx.beginPath();
  ctx.arc(cx, cz, MINIMAP_RANGE * scale, 0, Math.PI * 2);
  ctx.stroke();

  const setPoint = (x: number, z: number): boolean => {
    let dx = x - player.x;
    let dz = z - player.z;
    if (dx > halfWorld) dx -= worldSize;
    else if (dx < -halfWorld) dx += worldSize;
    if (dz > halfWorld) dz -= worldSize;
    else if (dz < -halfWorld) dz += worldSize;
    if (Math.abs(dx) > MINIMAP_RANGE || Math.abs(dz) > MINIMAP_RANGE) return false;
    pointX = cx + dx * scale;
    pointY = cz + dz * scale;
    return true;
  };
  const drawCircle = (x: number, z: number, radius: number, fill: string, stroke: string | null = null): void => {
    if (!setPoint(x, z)) return;
    ctx.beginPath();
    ctx.arc(pointX, pointY, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  const drawSquare = (x: number, z: number, size: number, fill: string): void => {
    if (!setPoint(x, z)) return;
    ctx.fillStyle = fill;
    ctx.fillRect(pointX - size / 2, pointY - size / 2, size, size);
  };

  for (const hazard of state.hazards) drawCircle(hazard.x, hazard.z, Math.max(3, hazard.radius * scale), "rgba(190, 210, 100, 0.28)", "rgba(230, 240, 150, 0.38)");
  const pickupStep = Math.max(1, Math.ceil(state.pickups.length / MINIMAP_MAX_PICKUPS));
  for (let i = 0; i < state.pickups.length; i += pickupStep) {
    const pickup = state.pickups[i];
    if (!pickup) continue;
    drawSquare(pickup.x, pickup.z, pickup.kind === "weapon" ? 6 : 4, pickup.kind === "weapon" ? "#ffd27a" : pickup.kind === "heal" ? "#8dff9d" : pickup.kind === "magnet" ? "#9fe8ff" : "#c8ff7d");
  }
  for (const tool of state.traversalTools) drawSquare(tool.x, tool.z, 5, tool.color ?? "#bff7ff");
  for (const indicator of state.attackIndicators) {
    const fill = indicator.kind === "nova" ? "rgba(255, 145, 61, 0.44)" : "rgba(255, 83, 74, 0.42)";
    if (indicator.kind === "dash") {
      if (!setPoint(indicator.x, indicator.z)) continue;
      ctx.save();
      ctx.translate(pointX, pointY);
      ctx.rotate(indicator.angle);
      ctx.fillStyle = fill;
      ctx.fillRect(-indicator.length * scale * 0.5, -indicator.width * scale * 0.5, indicator.length * scale, indicator.width * scale);
      ctx.restore();
    } else {
      drawCircle(indicator.x, indicator.z, Math.max(4, indicator.radius * scale), fill);
    }
  }
  const enemyStep = Math.max(1, Math.ceil(state.enemies.length / MINIMAP_MAX_ENEMIES));
  for (let i = 0; i < state.enemies.length; i += 1) {
    const enemy = state.enemies[i];
    if (!enemy) continue;
    if (!enemy.boss && i % enemyStep !== 0) continue;
    const radius = enemy.boss ? 6 : Math.max(2.6, enemy.radius * 1.9);
    drawCircle(enemy.x, enemy.z, radius, enemy.boss ? "#d05cff" : "#ff6658", enemy.boss ? "#ffd6ff" : null);
  }

  const aim = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  ctx.save();
  ctx.translate(cx, cz);
  ctx.rotate(aim);
  ctx.fillStyle = "#d7ff7d";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function recordTelemetry(sample: TelemetrySample, dt: number): void {
  if (!telemetry.enabled) return;
  const heapBytes = readHeapBytes();
  const heapDeltaBytes = heapBytes > 0 && telemetry.lastHeapBytes > 0 ? heapBytes - telemetry.lastHeapBytes : 0;
  const materialCreateDelta = Math.max(0, telemetry.materialCreates - telemetry.lastMaterialCreates);
  const meshCreateDelta = Math.max(0, telemetry.meshCreates - telemetry.lastMeshCreates);
  const effectCreateDelta = Math.max(0, telemetry.effectCreates - telemetry.lastEffectCreates);
  const particleCreateDelta = Math.max(0, telemetry.particleCreates - telemetry.lastParticleCreates);
  telemetry.metrics.record("frame.ms", sample.frameMs);
  telemetry.metrics.record("update.ms", sample.updateMs);
  telemetry.metrics.record("camera.ms", sample.cameraMs);
  telemetry.metrics.record("render.ms", sample.renderMs);
  telemetry.metrics.record("dt.ms", sample.dtMs);
  telemetry.metrics.record("raw-dt.ms", sample.rawDtMs);
  telemetry.metrics.record("frame-gap.ms", sample.frameGapMs);
  telemetry.metrics.record("heap.bytes", heapBytes);
  telemetry.metrics.record("heap-delta.bytes", heapDeltaBytes);
  if (heapDeltaBytes > 0) telemetry.metrics.record("heap-positive-delta.bytes", heapDeltaBytes);
  telemetry.metrics.record("created.materials", materialCreateDelta);
  telemetry.metrics.record("created.meshes", meshCreateDelta);
  telemetry.metrics.record("created.effects", effectCreateDelta);
  telemetry.metrics.record("created.particles", particleCreateDelta);
  let topPhase = "";
  let topPhaseMs = 0;
  for (const name of TELEMETRY_PHASE_NAMES) {
    const phaseMs = telemetry.phaseScratch[name] ?? 0;
    telemetry.metrics.record(`phase.${name}.ms`, phaseMs);
    if (phaseMs > topPhaseMs) {
      topPhase = name;
      topPhaseMs = phaseMs;
    }
    telemetry.phaseScratch[name] = 0;
  }
  telemetry.count = Math.min(TELEMETRY_SAMPLE_COUNT, telemetry.count + 1);
  telemetry.totalFrames += 1;
  telemetry.longFramesOverBudget += sample.frameMs > TELEMETRY_FRAME_BUDGET_MS ? 1 : 0;
  telemetry.longFramesOver33 += sample.frameMs > 33.33 ? 1 : 0;
  telemetry.longFramesOver50 += sample.frameMs > 50 ? 1 : 0;
  telemetry.longFramesOver100 += sample.frameMs > 100 ? 1 : 0;
  telemetry.skippedFrames += skippedFramesFromGap(sample.frameGapMs);
  telemetry.dtClampFrames += sample.rawDtMs > sample.dtMs + 0.1 ? 1 : 0;
  telemetry.maxFrameGapMs = Math.max(telemetry.maxFrameGapMs, sample.frameGapMs);
  telemetry.maxFrameMs = Math.max(telemetry.maxFrameMs, sample.frameMs);
  telemetry.maxUpdateMs = Math.max(telemetry.maxUpdateMs, sample.updateMs);
  telemetry.maxRenderMs = Math.max(telemetry.maxRenderMs, sample.renderMs);
  telemetry.lastHeapBytes = heapBytes;
  telemetry.lastMaterialCreates = telemetry.materialCreates;
  telemetry.lastMeshCreates = telemetry.meshCreates;
  telemetry.lastEffectCreates = telemetry.effectCreates;
  telemetry.lastParticleCreates = telemetry.particleCreates;
  recordSlowFrame(sample, topPhase, topPhaseMs, heapDeltaBytes);
  telemetry.clock -= dt;
  if (telemetry.clock > 0) return;
  telemetry.clock = TELEMETRY_UPDATE_INTERVAL;
  if (!PERF_FLAGS.telemetryPanel) return;
  updateTelemetryPanel();
}

function updateTelemetryPanel(): void {
  if (!ui.telemetryPanel || telemetry.count === 0) return;
  const snapshot = getTelemetrySnapshot();
  const counters = snapshot.counters;
  const renderStats = snapshot.render;
  const info = renderer.info;
  const text = [
    `FPS ${snapshot.fps.p50}  p95 ${snapshot.fps.p95}`,
    `frame ${formatMs(snapshot.frameMs.p50)}/${formatMs(snapshot.frameMs.p95)}ms`,
    `update ${formatMs(snapshot.updateMs.p50)}/${formatMs(snapshot.updateMs.p95)}`,
    `camera ${formatMs(snapshot.cameraMs.p50)}/${formatMs(snapshot.cameraMs.p95)}`,
    `render ${formatMs(snapshot.renderMs.p50)}/${formatMs(snapshot.renderMs.p95)}`,
    `gap ${formatMs(snapshot.frameGapMs.p95)} skip ${snapshot.frameBudget.skippedFrames} clamp ${snapshot.frameBudget.dtClampFrames}`,
    `hot ${snapshot.hotPhases.slice(0, 3).map((phase) => `${phase.name}:${formatMs(phase.p95)}`).join(" ")}`,
    `draw ${renderStats.calls} tri ${renderStats.triangles} prog ${renderStats.programs}`,
    `geo ${renderStats.geometries} tex ${renderStats.textures} heap ${snapshot.heap}`,
    `enemy ${counters.enemies}/${counters.animatedEnemies}/${counters.batchedEnemies} bullet ${counters.bullets}`,
    `pick ${counters.pickups}/${counters.batchedPickups} fx ${counters.effects}/${counters.particles} rag ${counters.ragdolls}`,
    `prop ${counters.visibleProps}/${counters.props}/${counters.totalProps} mat+ ${telemetry.materialCreates} mesh+ ${telemetry.meshCreates} fx+ ${telemetry.effectCreates}/${telemetry.particleCreates}`
  ].join("\n");
  if (text !== telemetry.lastText) {
    telemetry.lastText = text;
    ui.telemetryPanel.textContent = text;
  }
}

function playerEngineMotionSnapshot(
  snapshot: ThreeArenaPlayerMotionSnapshot | null = state.player?.engineMotion?.snapshot() ?? null,
) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    lastPresentation: {
      landSource: state.player?.engineMotionLandSource ?? null,
      recoilSource: state.player?.engineMotionRecoilSource ?? null,
    },
  };
}

function getTelemetrySnapshot() {
  const metricSeries = telemetry.metrics.snapshot().series;
  const info = renderer.info;
  const memory = info.memory;
  const renderInfo = info.render;
  const heapMemory = (performance as BrowserPerformance).memory;
  const heap = heapMemory?.usedJSHeapSize ? `${Math.round(heapMemory.usedJSHeapSize / 1048576)}mb` : "n/a";
  const animatedEnemies = state.enemies.reduce((sum, enemy) => sum + (enemy.animated ? 1 : 0), 0);
  const animatedBillboardLod = state.enemies.reduce((sum, enemy) => sum + (enemy.renderAsBillboard ? 1 : 0), 0);
  const visibleAnimatedMeshes = state.enemies.reduce((sum, enemy) => sum + (enemy.animated && enemy.mesh?.visible !== false ? 1 : 0), 0);
  const runningEnemyAnimations = state.enemies.reduce((sum, enemy) => sum + (enemy.activeAnimation === "run" ? 1 : 0), 0);
  const visibleProps = PERF_FLAGS.staticPropBsp
    ? state.visibleStaticProps.size
    : state.props.reduce((sum, prop) => sum + (prop.visible === false ? 0 : 1), 0);
  const collidableProps = state.props.reduce((sum, prop) => sum + (prop.userData?.collider?.blocking ? 1 : 0), 0);
  const enemyBatchInstances = [...state.enemyBillboardBatches.values()].reduce((sum, batch) => sum + batch.count, 0);
  const pickupBatchInstances = [...state.pickupBatches.values()].reduce((sum, batch) => sum + batch.count, 0);
  const particleCount = state.particlePool?.count ?? 0;
  const frameStats = metricStats(metricSeries["frame.ms"]);
  const frameP50 = frameStats.p50;
  const frameP95 = frameStats.p95;
  const phaseMs = buildPhaseTelemetrySnapshot(metricSeries);
  const hotPhases = Object.entries(phaseMs)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((left, right) => right.p95 - left.p95)
    .slice(0, 12);
  const clipSources = state.actorAssets?.clipSources ? [...state.actorAssets.clipSources.values()] : [];
  const universalClipCount = clipSources.filter((source) => source === "universal").length;
  const kenneyClipCount = clipSources.filter((source) => source === "kenney").length;
  return {
    samples: telemetry.count,
    fps: {
      p50: Number(formatFps(frameP50)),
      p95: Number(formatFps(frameP95))
    },
    frameMs: {
      p50: frameP50,
      p95: frameP95,
      p99: frameStats.p99
    },
    updateMs: metricStats(metricSeries["update.ms"]),
    cameraMs: metricStats(metricSeries["camera.ms"]),
    renderMs: metricStats(metricSeries["render.ms"]),
    rawDtMs: metricStats(metricSeries["raw-dt.ms"]),
    frameGapMs: metricStats(metricSeries["frame-gap.ms"]),
    phaseMs,
    hotPhases,
    frameBudget: {
      targetMs: round(TELEMETRY_FRAME_BUDGET_MS),
      totalFrames: telemetry.totalFrames,
      overBudgetFrames: telemetry.longFramesOverBudget,
      over33MsFrames: telemetry.longFramesOver33,
      over50MsFrames: telemetry.longFramesOver50,
      over100MsFrames: telemetry.longFramesOver100,
      skippedFrames: telemetry.skippedFrames,
      dtClampFrames: telemetry.dtClampFrames,
      maxFrameGapMs: round(telemetry.maxFrameGapMs),
      maxFrameMs: round(telemetry.maxFrameMs),
      maxUpdateMs: round(telemetry.maxUpdateMs),
      maxRenderMs: round(telemetry.maxRenderMs)
    },
    slowFrames: telemetry.slowFrames.slice(),
    allocation: {
      heapBytes: metricStats(metricSeries["heap.bytes"]),
      heapDeltaBytes: metricStats(metricSeries["heap-delta.bytes"]),
      positiveHeapDeltaBytes: positiveMetricStats(metricSeries["heap-positive-delta.bytes"]),
      createdPerFrame: {
        materials: metricStats(metricSeries["created.materials"]),
        meshes: metricStats(metricSeries["created.meshes"]),
        effects: metricStats(metricSeries["created.effects"]),
        particles: metricStats(metricSeries["created.particles"])
      }
    },
    render: {
      calls: renderInfo.calls ?? 0,
      triangles: renderInfo.triangles ?? 0,
      points: renderInfo.points ?? 0,
      lines: renderInfo.lines ?? 0,
      programs: info.programs?.length ?? 0,
      geometries: memory.geometries ?? 0,
      textures: memory.textures ?? 0
    },
    counters: {
      enemies: state.enemies.length,
      animatedEnemies,
      visibleAnimatedMeshes,
      animatedBillboardLod,
      batchedEnemies: enemyBatchInstances,
      bullets: state.bullets.length,
      weaponZones: state.weaponZones.length,
      pickups: state.pickups.length,
      batchedPickups: pickupBatchInstances,
      effects: state.effects.length,
      particles: particleCount,
      ragdolls: state.ragdolls.length,
      attackIndicators: state.attackIndicators.length,
      props: state.props.length,
      pendingProps: state.pendingProps.length,
      totalProps: state.props.length + state.pendingProps.length,
      visibleProps,
      collidableProps,
      traversalTools: state.traversalTools.length,
      groundTileInstances: GROUND_TILE_PATCH_AXIS * GROUND_TILE_PATCH_AXIS
    },
    camera: camera ? {
      x: round(camera.position.x),
      y: round(camera.position.y),
      z: round(camera.position.z),
      rig: cameraRigSnapshot ? {
        yaw: round(cameraRigSnapshot.yaw),
        pitch: round(cameraRigSnapshot.pitch),
        distance: round(cameraRigSnapshot.distance),
        blocked: cameraRigSnapshot.blocked
      } : null
    } : null,
    animation: {
      player: state.player?.activeAnimation ?? null,
      playerState: state.player?.animationState ?? null,
      playerOverlay: state.player?.overlayAnimation ?? null,
      playerSource: state.player?.activeAnimationSource ?? null,
      playerLock: round(state.player?.animLock ?? 0),
      playerProcedural: Boolean(state.player?.proceduralPose),
      playerProceduralMode: state.player?.proceduralMode ?? null,
      engineMotion: playerEngineMotionSnapshot(),
      runningEnemyAnimations,
      animatedEnemies,
      clips: {
        total: state.actorAssets?.clips?.length ?? 0,
        kenney: kenneyClipCount,
        universal: universalClipCount
      },
      universalAvailable: state.actorAssets?.universalClipNames?.length ?? 0,
      universalRetargeted: state.actorAssets?.retargetedUniversalClipNames ?? [],
      retargetFailures: state.actorAssets?.retargetFailures ?? [],
      played: { ...state.animationPlayCounts },
      lastPlayed: state.lastAnimationPlay
    },
    movement: {
      momentumSpeed: state.player ? round(Math.hypot(state.player.moveMomentumX ?? 0, state.player.moveMomentumZ ?? 0)) : 0,
      momentumMax: state.player ? round(playerMomentumMaxSpeed(state.player)) : 0,
      grounded: Boolean(state.player?.grounded),
      jumpY: round(state.player?.jumpY ?? 0),
      groundY: round(actorGroundHeight(state.player)),
      slopeRatio: round(state.player?.terrainSlope ?? 0),
      slopeDegrees: round(Math.atan(state.player?.terrainSlope ?? 0) * 180 / Math.PI),
      terrainBlocked: Boolean(state.player?.terrainBlocked),
      wallRunClock: round(state.player?.wallRunClock ?? 0),
      floatAssist: Math.max(0, round((state.player?.floatAssistUntil ?? 0) - state.time)),
      maxJumps: playerJumpStats().maxJumps
    },
    pickupsState: {
      magnetActive: state.time < (state.magnetPullUntil ?? 0),
      magnetized: state.pickups.filter((pickup) => pickup.magnetized).length
    },
    assets: {
      optionalModelsLoading: state.optionalModelsLoading,
      optionalModelsReady: state.optionalModelsReady,
      modelCacheSize: state.modelCache.size,
      propAssetMode: state.propAssetMode,
      propLod: { ...state.propLodStats }
    },
    tuning: {
      enemyDamage: getEnemyDamageTable(),
      gravity: round(playerGravity()),
      gravityBase: PLAYER_GRAVITY_BASE,
      jumpHeightMultiplier: round(playerJumpStats().heightMultiplier),
      gravityMultiplier: round(playerJumpStats().gravityMultiplier),
      magnetDropChance: MAGNET_DROP_CHANCE,
      magnetSeconds: MAGNET_PICKUP_SECONDS,
      momentumDampSeconds: PLAYER_MOMENTUM_DAMP_SECONDS,
      momentumDustThreshold: PLAYER_MOMENTUM_DUST_THRESHOLD
    },
    created: {
      materials: telemetry.materialCreates,
      meshes: telemetry.meshCreates,
      effects: telemetry.effectCreates,
      particles: telemetry.particleCreates
    },
    heap,
    heapBytes: heapMemory?.usedJSHeapSize ?? null,
    perfFlags: { ...PERF_FLAGS },
    time: state.time,
    running: state.running
  };
}

type ArenaGlobals = typeof globalThis & {
  __threeArenaTelemetrySnapshot?: unknown;
  __threeArenaBenchStress?: unknown;
  __threeArenaBenchResetTelemetry?: unknown;
  __threeArenaBenchWalkSimulation?: unknown;
  __threeArenaDebug?: unknown;
};

function requireActivePlayer(): Player {
  if (!state.player) throw new Error("The Three Arena player is not initialized.");
  return state.player;
}

const arenaGlobals = globalThis as ArenaGlobals;
arenaGlobals.__threeArenaTelemetrySnapshot = getTelemetrySnapshot;
arenaGlobals.__threeArenaBenchStress = runBenchStress;
arenaGlobals.__threeArenaBenchResetTelemetry = resetTelemetrySamples;
arenaGlobals.__threeArenaBenchWalkSimulation = runBenchWalkSimulation;
arenaGlobals.__threeArenaDebug = {
  start: () => {
    if (!state.running) startGame(false);
    return getTelemetrySnapshot();
  },
  restart: () => {
    startGame(false);
    return getTelemetrySnapshot();
  },
  spawnPickup: (kind: Pickup["kind"] = "magnet", distance = 7) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    const angle = state.time * 1.7;
    spawnPickup(kind, player.x + Math.cos(angle) * distance, player.z + Math.sin(angle) * distance);
    return getTelemetrySnapshot();
  },
  activateMagnet: (count = 12) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963229728653;
      const radius = 10 + (i % 5) * 3;
      spawnPickup(i % 6 === 0 ? "heal" : "xp", player.x + Math.cos(angle) * radius, player.z + Math.sin(angle) * radius);
    }
    activatePickupMagnet();
    return getTelemetrySnapshot();
  },
  levelChoice: () => {
    if (!state.running && !state.levelChoice) startGame(false);
    grantXp(state.nextXp - state.xp);
    return {
      level: state.level,
      choices: state.levelChoice?.choices?.map((choice) => ({ kind: choice.kind, title: choice.title, badge: choice.badge })) ?? [],
      snapshot: getTelemetrySnapshot()
    };
  },
  chooseLevel: (index = 0) => {
    applyLevelChoice(index);
    return getTelemetrySnapshot();
  },
  damageTable: getEnemyDamageTable,
  spawnEnemy: (typeId = Object.keys(data.enemies)[0] ?? "shambler", options: { boss?: boolean } = {}) => {
    if (!state.running) startGame(false);
    const enemy = spawnEnemy(typeId, options);
    return { typeId, touch: enemy.touch, rank: resolveEnemySpawnRank(typeId), snapshot: getTelemetrySnapshot() };
  },
  fire: (weaponId: string | undefined = state.activeWeaponId ?? state.weaponSlots[0], angle = 0) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    const weapon = getWeaponRuntime(weaponId) ?? getWeaponRuntime(state.activeWeaponId ?? state.weaponSlots[0]);
    if (!weapon) return null;
    state.activeWeaponId = weapon.id;
    updatePlayerWeaponVisual(angle);
    const hand = getPlayerWeaponHandPosition(angle);
    const handPosition = { x: round(hand.x), y: round(hand.y), z: round(hand.z) };
    const muzzle = getPlayerWeaponMuzzlePosition(angle);
    const bulletCountBefore = state.bullets.length;
    fireWeapon(weapon, angle);
    const bullet = state.bullets.length > bulletCountBefore ? state.bullets[state.bullets.length - 1] : null;
    return {
      weaponId: weapon.id,
      hand: handPosition,
      muzzle: { x: round(muzzle.x), y: round(muzzle.y), z: round(muzzle.z) },
      bullet: bullet ? { x: round(bullet.x), y: round(bullet.y ?? 0), z: round(bullet.z) } : null,
      player: { x: round(player.x), y: round(player.jumpY), z: round(player.z) }
    };
  },
  aimAt: (angle = 0, seconds = MANUAL_AIM_PRIORITY_SECONDS) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    setAimWorld(player.x + Math.cos(angle) * CAMERA_AIM_DISTANCE, player.z + Math.sin(angle) * CAMERA_AIM_DISTANCE);
    markManualAim(seconds);
    syncReticleToAimWorld();
    return {
      angle: round(angle),
      manualAimUntil: round(pointer.manualAimUntil),
      active: isManualAimActive()
    };
  },
  aimResolution: (weaponId: string | undefined = state.activeWeaponId ?? state.weaponSlots[0]) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    const weapon = getWeaponRuntime(weaponId) ?? getWeaponRuntime(state.activeWeaponId ?? state.weaponSlots[0]);
    if (!weapon) return null;
    const resolved = resolveWeaponAim(weapon, player);
    return {
      weaponId: weapon.id,
      mode: resolved.mode,
      angle: round(resolved.angle),
      manualAimActive: isManualAimActive(),
      target: resolved.target ? {
        typeId: "typeId" in resolved.target && typeof resolved.target.typeId === "string" ? resolved.target.typeId : null,
        x: round(resolved.target.x),
        z: round(resolved.target.z)
      } : null
    };
  },
  propBounds: () => state.props.map((prop) => {
    prop.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(prop);
    const size = box.getSize(new THREE.Vector3());
    return {
      model: prop.userData?.model ?? null,
      max: round(Math.max(size.x, size.y, size.z)),
      x: round(size.x),
      y: round(size.y),
      z: round(size.z),
      importScale: prop.userData?.importScale ?? null
    };
  }).sort((a, b) => b.max - a.max).slice(0, 12),
  traversalTools: () => state.traversalTools.map((tool) => ({
    type: tool.type,
    x: round(tool.x),
    z: round(tool.z),
    y: round(terrainHeightAt(tool.x, tool.z)),
    targetY: round(terrainHeightAt(tool.targetX ?? tool.x, tool.targetZ ?? tool.z)),
    cooldown: round(tool.cooldown ?? 0)
  })),
  terrainAt: (x = state.player?.x ?? 0, z = state.player?.z ?? 0) => {
    const gradient = terrainGradientAt(x, z);
    return {
      x: round(x),
      z: round(z),
      y: round(terrainHeightAt(x, z)),
      slopeRatio: round(gradient.ratio),
      slopeDegrees: round(gradient.angle * 180 / Math.PI)
    };
  },
  jump: () => {
    if (!state.running) startGame(false);
    attemptPlayerJump();
    return getTelemetrySnapshot();
  },
  probeEngineMotionAim: (pitchRadians = Math.PI * 0.4) => {
    const player = requireActivePlayer();
    if (!player.engineMotion) return null;
    return playerEngineMotionSnapshot(player.engineMotion.probeAim(pitchRadians));
  },
  probeEngineMotionRecoil: () => {
    const player = requireActivePlayer();
    if (!player.engineMotion) return null;
    const before = playerEngineMotionSnapshot(player.engineMotion.snapshot());
    player.engineMotionRecoilSource = "engine-motion";
    const after = playerEngineMotionSnapshot(player.engineMotion.recoil());
    return { before, after };
  },
  platformLandingProbe: runPlatformLandingProbe,
  settings: () => ({ ...state.settings }),
  setSettings: (patch: Partial<Settings> = {}) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!isSettingKey(key)) continue;
      if (key === "invertY" || key === "muted") state.settings[key] = Boolean(value);
      else if (isNumericSettingKey(key)) {
        const [min, max] = settingRange(key);
        state.settings[key] = clamp(Number(value), min, max);
      }
    }
    renderSettingsControls();
    applyAudioSettings();
    saveSettings();
    return { ...state.settings };
  },
  audioGains: () => ({
    master: arenaAudioRuntime.graph.master?.gain.value ?? null,
    music: arenaAudioRuntime.graph.music?.gain.value ?? null,
    sfx: arenaAudioRuntime.graph.sfx?.gain.value ?? null
  }),
  snapshot: getTelemetrySnapshot
};

async function runBenchWalkSimulation(options: { ms?: number; render?: boolean } = {}) {
  const ms = Math.max(0, Number(options.ms ?? 60_000));
  const renderScene = options.render !== false;
  const dt = 1 / 60;
  const frameGapMs = 1000 / 60;
  const frames = Math.ceil(ms / frameGapMs);
  keys.add("KeyW");
  setInputMode("keyboard");
  resetTelemetrySamples();
  for (let frame = 0; frame < frames; frame += 1) {
    const frameStart = performance.now();
    const updateStart = frameStart;
    if (state.running) updateGame(dt);
    const updateEnd = performance.now();
    updateCamera(dt);
    measureTelemetryPhase("visualIndicators", () => updateVisualIndicators(dt));
    measureTelemetryPhase("floatingTexts", () => updateFloatingTexts(dt));
    const cameraEnd = performance.now();
    if (renderScene) threeView.render();
    const renderEnd = performance.now();
    recordTelemetry({
      frameMs: renderEnd - frameStart,
      updateMs: updateEnd - updateStart,
      cameraMs: cameraEnd - updateEnd,
      renderMs: renderEnd - cameraEnd,
      dtMs: frameGapMs,
      rawDtMs: frameGapMs,
      frameGapMs
    }, dt);
    if ((frame & 63) === 63) await Promise.resolve();
  }
  keys.delete("KeyW");
  arenaFrameDriver.reset(performance.now());
  telemetry.lastFrameStart = performance.now();
  return getTelemetrySnapshot();
}

function runBenchStress(config: Partial<BenchStress> & { time?: number } = {}) {
  if (!state.running) startGame(false);
  keys.clear();
  document.body.classList.add("run-active");
  document.body.classList.remove("menu-open", "pause-open");
  ui.menu.classList.add("hidden");
  state.paused = false;
  state.pausePanel = "root";
  renderPauseUi();
  state.pendingLevelChoices = 0;
  state.resumeAfterLevelChoice = false;
  closeLevelChoice();
  state.running = true;
  state.xp = 0;
  state.level = data.progression?.startLevel ?? 1;
  state.nextXp = xpForLevel(state.level);
  state.magnetPullUntil = 0;
  state.combo = 0;
  state.comboTimer = 0;
  updateComboReadout();
  clearFloatingTexts();
  if (state.player) {
    const center = getWorldCenter();
    state.player.x = center.x;
    state.player.z = center.z;
    state.player.hp = state.player.maxHp;
    state.player.invuln = 0;
    state.player.animLock = 0;
    state.player.jumpY = 0;
    state.player.jumpVelocityY = 0;
    state.player.jumpsUsed = 0;
    state.player.grounded = true;
    state.player.moveMomentumX = 0;
    state.player.moveMomentumZ = 0;
    state.player.knockX = 0;
    state.player.knockZ = 0;
    setActorPosition(state.player, center.x, center.z);
    playActorAnimation(state.player, "idle", 0.02);
  }
  state.benchStress = {
    quietCombat: config.quietCombat !== false,
    enemies: Math.max(0, Math.floor(config.enemies ?? 120)),
    pickups: Math.max(0, Math.floor(config.pickups ?? 36)),
    effects: Math.max(0, Math.floor(config.effects ?? 0)),
    allProps: Boolean(config.allProps)
  };
  if (state.benchStress.quietCombat) {
    state.weaponSlots = [];
    state.activeWeaponId = null;
    state.weaponCooldowns.clear();
    if (state.currentWeaponVisual?.mesh) state.currentWeaponVisual.mesh.visible = false;
  }
  clearList(state.enemies);
  resetEnemyBillboardBatches();
  commitEnemyBillboardBatches();
  markEnemySpatialDirty();
  clearList(state.bullets);
  clearList(state.weaponZones);
  clearList(state.pickups);
  resetPickupBatches();
  commitPickupBatches();
  clearList(state.effects);
  clearBatchedParticles();
  clearList(state.attackIndicators);
  for (const ragdoll of state.ragdolls) scene.remove(ragdoll.root);
  state.ragdolls.length = 0;
  if (state.benchStress.allProps) revealAllPendingProps();
  const count = state.benchStress.enemies;
  const mix = data.waves[state.waveIndex]?.mix ?? [["shambler", 1]];
  const center = state.player ?? getWorldCenter();
  for (let i = 0; i < count; i += 1) {
    const type = mix[i % mix.length]?.[0] ?? Object.keys(data.enemies)[0];
    spawnEnemy(type);
    const enemy = state.enemies[state.enemies.length - 1];
    const angle = i * 2.399963229728653;
    const radius = 16 + (i % 12) * 3.8 + Math.floor(i / 12) * 1.4;
    enemy.x = wrapWorld(center.x + Math.cos(angle) * radius);
    enemy.z = wrapWorld(center.z + Math.sin(angle) * radius);
    enemy.hp = 1_000_000;
    enemy.touch = 0;
    setActorPosition(enemy, enemy.x, enemy.z);
    setActorFacing(enemy, angleTo(enemy.x, enemy.z, center.x, center.z));
  }
  resetEnemyBillboardBatches();
  for (const enemy of state.enemies) queueEnemyBillboardBatch(enemy);
  commitEnemyBillboardBatches();
  rebuildEnemySpatialGrid();
  const pickups = state.benchStress.pickups;
  const pickupStartRadius = getPickupCollectRadius() + 8;
  while (state.pickups.length < pickups) {
    const i = state.pickups.length;
    const angle = i * 2.399963229728653;
    const radius = pickupStartRadius + 5 + (Math.floor(i / 40) % 8) * 3.2 + (i % 5) * 0.18;
    spawnPickup(i % 13 === 0 ? "magnet" : i % 11 === 0 ? "weapon" : i % 7 === 0 ? "heal" : "xp", center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius);
  }
  const effects = state.benchStress.effects;
  for (let i = 0; i < effects; i += 1) {
    const angle = i * 2.399963229728653;
    const radius = 6 + (i % 32) * 1.25;
    const color = i % 5 === 0 ? "#ff7842" : i % 3 === 0 ? "#ffd37d" : "#bfff88";
    if (PERF_FLAGS.batchParticles) {
      tempColor.set(color);
      addBatchedParticle({
        x: center.x + Math.cos(angle) * radius,
        y: 0.8 + (i % 6) * 0.13,
        z: center.z + Math.sin(angle) * radius,
        vx: Math.cos(angle) * (0.5 + (i % 7) * 0.08),
        vy: 0.4 + (i % 5) * 0.06,
        vz: Math.sin(angle) * (0.5 + (i % 7) * 0.08),
        life: 30,
        size: 0.26 + (i % 4) * 0.05,
        r: tempColor.r,
        g: tempColor.g,
        b: tempColor.b
      });
    } else {
      spawnEffect("hit", center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius, 30, { color, particles: 1 });
    }
  }
  resetPickupBatches();
  for (const pickup of state.pickups) {
    if (!pickup.mesh) queuePickupBatch(pickup);
  }
  commitPickupBatches();
  updateBatchedParticles(0);
  state.time = Math.max(state.time, config.time ?? 120);
  state.minimapClock = 0;
  state.hudClock = 0;
  resetTelemetrySamples();
  updateMinimap(0, true);
  updateHud(0, true);
  return getTelemetrySnapshot();
}

function resetTelemetrySamples(): void {
  telemetry.metrics.reset();
  telemetry.count = 0;
  telemetry.totalFrames = 0;
  telemetry.longFramesOverBudget = 0;
  telemetry.longFramesOver33 = 0;
  telemetry.longFramesOver50 = 0;
  telemetry.longFramesOver100 = 0;
  telemetry.skippedFrames = 0;
  telemetry.dtClampFrames = 0;
  telemetry.maxFrameGapMs = 0;
  telemetry.maxFrameMs = 0;
  telemetry.maxUpdateMs = 0;
  telemetry.maxRenderMs = 0;
  telemetry.lastFrameStart = performance.now();
  telemetry.lastHeapBytes = readHeapBytes();
  telemetry.lastMaterialCreates = telemetry.materialCreates;
  telemetry.lastMeshCreates = telemetry.meshCreates;
  telemetry.lastEffectCreates = telemetry.effectCreates;
  telemetry.lastParticleCreates = telemetry.particleCreates;
  telemetry.slowFrames.length = 0;
  telemetry.clock = 0;
  telemetry.lastText = "";
  for (const name of TELEMETRY_PHASE_NAMES) {
    telemetry.phaseScratch[name] = 0;
  }
}

function findPlatformLandingProbe() {
  const half = getWorldSize() / 2;
  const minGX = Math.floor(-half / TERRAIN_PLATFORM_CELL_SIZE) - 1;
  const maxGX = Math.ceil(half / TERRAIN_PLATFORM_CELL_SIZE) + 1;
  for (let gx = minGX; gx <= maxGX; gx += 1) {
    for (let gz = minGX; gz <= maxGX; gz += 1) {
      const cell = terrainPlatformCellAt(gx, gz);
      if (!cell) continue;
      for (let index = 0; index < 12; index += 1) {
        const angle = (Math.PI * 2 * index) / 12;
        const dirX = Math.cos(angle);
        const dirZ = Math.sin(angle);
        const beforeX = cell.centerX + dirX * (cell.radius + 0.7);
        const beforeZ = cell.centerZ + dirZ * (cell.radius + 0.7);
        const afterX = cell.centerX + dirX * (cell.radius - 0.7);
        const afterZ = cell.centerZ + dirZ * (cell.radius - 0.7);
        if (Math.abs(beforeX) > half - 2 || Math.abs(beforeZ) > half - 2 || Math.abs(afterX) > half - 2 || Math.abs(afterZ) > half - 2) continue;
        const beforeGround = terrainHeightAt(beforeX, beforeZ);
        const afterGround = terrainHeightAt(afterX, afterZ);
        if (afterGround - beforeGround < 6) continue;
        return { beforeX, beforeZ, afterX, afterZ, beforeGround, afterGround };
      }
    }
  }
  return null;
}

function runPlatformLandingProbe() {
  if (!state.running) startGame(false);
  const probe = findPlatformLandingProbe();
  if (!probe || !state.player) return { ok: false, reason: "no raised platform edge found" };
  const player = state.player;
  player.x = probe.beforeX;
  player.z = probe.beforeZ;
  player.jumpY = probe.afterGround - probe.beforeGround + 0.48;
  player.jumpVelocityY = 4.2;
  player.grounded = false;
  player.jumpsUsed = 1;
  player.wallRunClock = 0;
  player.terrainBlocked = false;
  player.moveMomentumX = probe.afterX - probe.beforeX;
  player.moveMomentumZ = probe.afterZ - probe.beforeZ;
  player.knockX = 0;
  player.knockZ = 0;
  const beforeFeetY = actorFeetY(player);
  player.x = probe.afterX;
  player.z = probe.afterZ;
  resolvePlayerTerrainMotion(player, probe.beforeX, probe.beforeZ, beforeFeetY, 1 / 60);
  setActorPosition(player, player.x, player.z);
  const feetY = actorFeetY(player);
  const ok = !player.terrainBlocked && (player.wallRunClock ?? 0) <= 0 && feetY >= probe.afterGround - TERRAIN_PLATFORM_LAND_SNAP;
  return {
    ok,
    beforeGround: round(probe.beforeGround),
    afterGround: round(probe.afterGround),
    feetY: round(feetY),
    jumpY: round(player.jumpY ?? 0),
    wallRunClock: round(player.wallRunClock ?? 0),
    terrainBlocked: Boolean(player.terrainBlocked),
    grounded: Boolean(player.grounded)
  };
}

function readHeapBytes(): number {
  return (performance as BrowserPerformance).memory?.usedJSHeapSize ?? 0;
}

function recordSlowFrame(sample: TelemetrySample, topPhase: string, topPhaseMs: number, heapDeltaBytes: number): void {
  if (sample.frameMs <= TELEMETRY_FRAME_BUDGET_MS) return;
  const entry = {
    time: round(state.time),
    frameMs: round(sample.frameMs),
    updateMs: round(sample.updateMs),
    renderMs: round(sample.renderMs),
    gapMs: round(sample.frameGapMs),
    rawDtMs: round(sample.rawDtMs),
    topPhase,
    topPhaseMs: round(topPhaseMs),
    heapDeltaBytes: Math.round(heapDeltaBytes),
    enemies: state.enemies.length,
    bullets: state.bullets.length,
    pickups: state.pickups.length,
    particles: state.particlePool?.count ?? 0,
    props: state.props.length,
    pendingProps: state.pendingProps.length
  };
  telemetry.slowFrames.push(entry);
  telemetry.slowFrames.sort((left, right) => right.frameMs - left.frameMs);
  telemetry.slowFrames.length = Math.min(telemetry.slowFrames.length, 24);
}

function skippedFramesFromGap(frameGapMs: number): number {
  if (!Number.isFinite(frameGapMs) || frameGapMs <= TELEMETRY_FRAME_BUDGET_MS * 1.5) return 0;
  return Math.max(0, Math.floor(frameGapMs / TELEMETRY_FRAME_BUDGET_MS) - 1);
}

function buildPhaseTelemetrySnapshot(series: Record<string, MetricSummary>): Record<string, SampleStats> {
  const result: Record<string, SampleStats> = {};
  for (const name of TELEMETRY_PHASE_NAMES) result[name] = metricStats(series[`phase.${name}.ms`]);
  return result;
}

function metricStats(summary: MetricSummary | undefined): SampleStats {
  if (!summary) return { p50: 0, p95: 0, p99: 0, avg: 0, max: 0 };
  return {
    p50: summary.p50,
    p95: summary.p95,
    p99: summary.p99,
    avg: summary.average,
    max: summary.max,
  };
}

function positiveMetricStats(summary: MetricSummary | undefined): PositiveSampleStats {
  return { ...metricStats(summary), count: summary?.count ?? 0 };
}

function formatMs(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

function formatFps(frameMs: number): string {
  return frameMs > 0 ? String(Math.round(1000 / frameMs)) : "0";
}

function updateHud(dt = 0, force = false): void {
  const player = state.player;
  if (!player) return;
  state.hudClock -= dt;
  if (!force && state.hudClock > 0) return;
  state.hudClock = HUD_UPDATE_INTERVAL;
  const wave = data.waves[state.waveIndex] ?? data.waves[0];
  ui.hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  if (ui.hpFill) ui.hpFill.style.transform = `scaleX(${clamp01(player.hp / Math.max(1, player.maxHp))})`;
  ui.killsText.textContent = String(state.kills);
  ui.waveText.textContent = `${state.waveIndex + 1}: ${wave.name}`;
  ui.levelText.textContent = String(state.level);
  if (ui.xpText) ui.xpText.textContent = `${state.xp}/${state.nextXp}`;
  if (ui.xpFill) ui.xpFill.style.transform = `scaleX(${clamp01(state.xp / Math.max(1, state.nextXp))})`;
  if (ui.classText) {
    ui.classText.textContent = `${selectedClass()?.name ?? "Survivor"} L${selectedClassLevel()}`;
    ui.classText.closest<HTMLElement>(".pill")?.style.setProperty("--class-color", selectedClass()?.color ?? "#d7ff8d");
  }
  ui.objectiveText.textContent = data.objectives[Math.min(state.waveIndex, data.objectives.length - 1)] ?? "Survive.";
  const weaponKey = `${state.weaponSlots.map((id) => `${id}:${getWeaponLevel(id)}:${state.evolvedWeapons.has(id) ? "e" : ""}`).join("|")}@${state.activeWeaponId ?? ""}`;
  if (force || weaponKey !== lastWeaponHudKey) {
    lastWeaponHudKey = weaponKey;
    ui.weaponText.textContent = "";
    for (const id of state.weaponSlots) {
      const weapon = getWeaponRuntime(id);
      const item = document.createElement("div");
      item.className = `pill weapon-pill${id === state.activeWeaponId ? " active-weapon" : ""}`;
      item.style.setProperty("--weapon-color", weapon?.color ?? "#d5ff8d");
      item.dataset.weaponId = id;
      item.dataset.weaponIcon = weaponIconPath(id, Boolean(weapon?.evolved));
      item.dataset.weaponLevel = String(getWeaponLevel(id));
      item.dataset.weaponState = weapon?.evolved ? "EVO" : (weapon?.stateLabel ?? "");
      item.title = `${weapon?.name ?? id} L${getWeaponLevel(id)}${weapon?.evolved ? " EVO" : ""}`;
      const glyph = document.createElement("span");
      glyph.className = "weapon-glyph";
      glyph.textContent = weapon?.label ?? (weapon?.name ?? id).slice(0, 2).toUpperCase();
      const strong = document.createElement("strong");
      strong.textContent = weapon?.name ?? id;
      item.append(glyph);
      item.append(strong);
      ui.weaponText.append(item);
    }
  }
  const passiveKey = state.passiveSlots.map((id) => `${id}:${state.passiveLevels.get(id) ?? 0}:${passiveTeamworkEffectIds(id).join(",")}`).join("|");
  if (ui.passiveText && (force || passiveKey !== lastPassiveHudKey)) {
    lastPassiveHudKey = passiveKey;
    ui.passiveText.textContent = "";
    for (const id of state.passiveSlots) {
      const passive = passiveItemsById.get(id);
      const chip = document.createElement("div");
      chip.className = "passive-chip";
      chip.style.setProperty("--passive-color", passive?.visual?.color ?? "#d7ff8d");
      const effects = passiveTeamworkEffectIds(id)
        .map((effectId) => PASSIVE_TEAMWORK_EFFECTS.find((effect) => effect.id === effectId)?.title)
        .filter(Boolean);
      chip.title = `${passive?.name ?? id} L${state.passiveLevels.get(id) ?? 1}${effects.length ? `: ${effects.join(", ")}` : ""}`;
      chip.setAttribute("aria-label", chip.title);
      const icon = document.createElement("span");
      icon.className = "passive-icon";
      icon.setAttribute("aria-hidden", "true");
      const image = document.createElement("img");
      image.alt = "";
      image.src = passiveIconPath(id);
      icon.append(image);
      const level = document.createElement("span");
      level.textContent = `L${state.passiveLevels.get(id) ?? 1}`;
      chip.append(icon, level);
      ui.passiveText.append(chip);
    }
  }
}

function toast(text: string): void {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.remove("show"), 1700);
}

function pulseShake(duration: number, power: number): void {
  state.shake = Math.max(state.shake, duration);
  state.shakePower = Math.max(state.shakePower, power);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, String(step).split(".")[1]?.length ?? 0);
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function onResize(): void {
  threeView.resize(window.innerWidth, window.innerHeight);
}

function defaultWsUrl(): string {
  const explicit = PERF_QUERY.get("ws") || PERF_QUERY.get("server");
  if (explicit) return explicit;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const staticPort = Number(location.port || (location.protocol === "https:" ? 443 : 80));
  const wsPort = Number.isFinite(staticPort) && staticPort > 0 ? staticPort + 1 : 8794;
  return `${protocol}://${location.hostname}:${wsPort}`;
}
