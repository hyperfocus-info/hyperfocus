import { PERF_FLAGS } from "./environment.ts";

export const MAP_LINEAR_MULTIPLIER = 10;
export const CAMERA_VIEW_RADIUS = 72;
export const STATIC_VISIBILITY_RADIUS = 128;
export const STATIC_VISIBILITY_QUERY_RADIUS = STATIC_VISIBILITY_RADIUS * Math.SQRT2;
export const STATIC_PROP_LOD_MID_DISTANCE = 15;
export const STATIC_PROP_LOD_LOW_DISTANCE = 30;
export const STATIC_PROP_LOD_MID_RATIO = 0.5;
export const STATIC_PROP_LOD_LOW_RATIO = 0.25;
export const LAZY_PROP_INITIAL_RADIUS = STATIC_VISIBILITY_RADIUS * 0.78;
export const LAZY_PROP_NEAR_RADIUS = STATIC_VISIBILITY_RADIUS * 0.96;
export const LAZY_PROP_AHEAD_RADIUS = STATIC_VISIBILITY_RADIUS + 126;
export const LAZY_PROP_AHEAD_DOT = -0.12;
export const MINIMAP_RANGE = 150;
export const MINIMAP_UPDATE_INTERVAL = 0.2;
export const MINIMAP_MAX_PICKUPS = 120;
export const MINIMAP_MAX_ENEMIES = 180;
export const HUD_UPDATE_INTERVAL = 0.12;
export const TELEMETRY_UPDATE_INTERVAL = 0.5;
export const TELEMETRY_SAMPLE_COUNT = 360;
export const TELEMETRY_FRAME_BUDGET_MS = 16.666666666666668;
export const TELEMETRY_PHASE_NAMES = [
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
export const STATIC_WRAP_UPDATE_INTERVAL = 0.08;
export const STATIC_WRAP_MOVE_THRESHOLD = 1.4;
export const PROP_COLLISION_CELL_SIZE = 18;
export const ENEMY_SPATIAL_CELL_SIZE = 18;
export const LAZY_PROP_REVEAL_BUDGET = 10;
export const OPTIONAL_MODEL_UPGRADE_BUDGET_MS = 4;
export const GROUND_TILE_SIZE = 3.8;
export const GROUND_TILE_PATCH_AXIS = 39;
export const GROUND_TILE_BASE_HEIGHT = 0.026;
export const TERRAIN_HILL_HEIGHT = 15.5;
export const TERRAIN_HILL_FREQUENCY = 0.0105;
export const TERRAIN_MOUNTAIN_HEIGHT = 19.5;
export const TERRAIN_START_CLEAR_RADIUS = 42;
export const TERRAIN_PLATFORM_CELL_SIZE = 66;
export const TERRAIN_PLATFORM_DENSITY = 0.31;
export const TERRAIN_PLATFORM_RADIUS_MIN = 10.5;
export const TERRAIN_PLATFORM_RADIUS_MAX = 20.5;
export const TERRAIN_PLATFORM_HEIGHT_MIN = 12;
export const TERRAIN_PLATFORM_HEIGHT_MAX = 27;
export const TERRAIN_PLATFORM_EDGE_PAD = 1.15;
export const TERRAIN_GRADIENT_SAMPLE = 1.85;
export const TERRAIN_HEIGHT_CACHE_STEP = 0.5;
export const TERRAIN_CACHE_KEY_STRIDE = 8192;
export const TERRAIN_HEIGHT_CACHE_MAX_ENTRIES = 4096;
export const TERRAIN_PLATFORM_CELL_CACHE_MAX_ENTRIES = 4096;
export const TERRAIN_WALKABLE_SLOPE_RATIO = Math.tan(Math.PI / 4);
export const TERRAIN_UPHILL_POSITION_LOSS = 0.34;
export const TERRAIN_DOWNHILL_ACCELERATION = 12.5;
export const TERRAIN_SLIDE_ACCELERATION = 17.5;
export const TERRAIN_DROP_AIR_HEIGHT = 3.2;
export const TERRAIN_WALL_RUN_TRANSFER = 0.82;
export const TERRAIN_WALL_RUN_SECONDS = 0.36;
export const TERRAIN_PLATFORM_LAND_SNAP = 0.32;
export const TRAVERSAL_TOOL_COUNT = 25;
export const TRAVERSAL_TOOL_TRIGGER_RADIUS = 3.2;
export const TRAVERSAL_TOOL_COOLDOWN_SECONDS = 1.35;
export const TRAVERSAL_TOOL_TYPES = ["spring", "floatPlatform", "zipline", "teleporter", "windLift"] as const;
export const MAX_ANIMATED_ENEMIES = PERF_FLAGS.maxAnimatedEnemies;
export const ENEMY_BILLBOARD_BATCH_CAPACITY = 768;
export const ENEMY_TERRAIN_NEAR_RADIUS = 16;
export const ENEMY_TERRAIN_DENSE_NEAR_RADIUS = 8;
export const ENEMY_TERRAIN_STEP_SECONDS = 0.16;
export const ENEMY_TERRAIN_UPDATE_BUDGET_PER_FRAME = 32;
export const ANIMATED_ENEMY_DENSE_COUNT = 120;
export const ANIMATED_ENEMY_DENSE_MESH_BUDGET = 8;
export const ANIMATED_ENEMY_DENSE_MESH_RADIUS = 34;
export const PICKUP_BATCH_CAPACITY = 768;
export const PARTICLE_POOL_CAPACITY = 8192;
export const ENEMY_ANIMATION_STEP_SECONDS = 0.08;
export const BOSS_ANIMATION_STEP_SECONDS = 0.04;
export const PICKUP_LIGHT_POOL_SIZE = 6;
export const PROP_READABILITY_SCALE = 1.75;
export const RUIN_IMPORT_TARGET_MAX_DIMENSION = 1.25;
export const LARGE_IMPORT_TARGET_MAX_DIMENSION = 1.4;
export const PLAYER_HEIGHT_WORLD = 3.9;
export const PLAYER_MODEL_SCALE = 0.03;
export const PLAYER_RADIUS = 1;
export const PROJECTILE_HEIGHT_OFFSET = 1.28;
export const PROJECTILE_VERTICAL_HIT_PAD = 0.78;
export const PLAYER_GRAVITY_BASE = 11.8;
export const PLAYER_GRAVITY = PLAYER_GRAVITY_BASE * 1.5 * 1.33 * 2;
export const PLAYER_JUMP_HEIGHT_MULTIPLIER = 3;
export const PLAYER_JUMP_VELOCITY_BASE = 7.4;
export const PLAYER_DOUBLE_JUMP_VELOCITY_BASE = 6.6;
export const PLAYER_JUMP_POWER_MULTIPLIER = 1.5;
export const PLAYER_JUMP_VELOCITY = PLAYER_JUMP_VELOCITY_BASE * Math.sqrt(PLAYER_JUMP_HEIGHT_MULTIPLIER * (PLAYER_GRAVITY / PLAYER_GRAVITY_BASE)) * PLAYER_JUMP_POWER_MULTIPLIER;
export const PLAYER_DOUBLE_JUMP_VELOCITY = PLAYER_DOUBLE_JUMP_VELOCITY_BASE * Math.sqrt(PLAYER_JUMP_HEIGHT_MULTIPLIER * (PLAYER_GRAVITY / PLAYER_GRAVITY_BASE)) * PLAYER_JUMP_POWER_MULTIPLIER;
export const PLAYER_MAX_JUMPS = 2;
export const PLAYER_AIRBORNE_HIT_CLEARANCE = 0.85;
export const PLAYER_AIR_TRAIL_INTERVAL = 0.045;
export const PLAYER_DAMAGE_IMMUNE_SECONDS = 1;
export const PLAYER_MOMENTUM_BUILD_SECONDS = 0.18;
export const PLAYER_MOMENTUM_DAMP_SECONDS = 0.5;
export const PLAYER_MOMENTUM_DUST_THRESHOLD = 0.8;
export const PLAYER_MOMENTUM_DUST_INTERVAL = 0.25;
export const PLAYER_MOMENTUM_SPEED_BONUS_MULTIPLIER = 1;
export const PLAYER_KNOCKBACK_DECAY = 8.4;
export const PLAYER_KNOCKBACK_STOP_SPEED = 0.04;
export const PLAYER_CONTACT_KNOCKBACK_BASE = 14;
export const ENEMY_CONTACT_DAMAGE_MIN = 25;
export const ENEMY_CONTACT_DAMAGE_MAX = 75;
export const HAZARD_DAMAGE_TICK_SECONDS = 0.5;
export const HEALTH_VIAL_DROP_MULTIPLIER = 0.2;
export const MAGNET_DROP_CHANCE = 0.075;
export const MAGNET_PICKUP_SECONDS = 4.25;
export const MAGNET_PICKUP_SPEED = 92;
export const BLACK_GARLIC_COOLDOWN_MULTIPLIER = 0.5;
export const BLACK_GARLIC_RANGE_MULTIPLIER = 1.5;
export const PICKUP_VISUAL_SCALE_MULTIPLIER = 3;
export const PICKUP_COLLECT_RADIUS_MULTIPLIER = 4.5;
export const CAMERA_BASE_DISTANCE = 55;
export const CAMERA_DEFAULT_PITCH = 0.72;
export const CAMERA_MIN_PITCH = 0.18;
export const CAMERA_MAX_PITCH = 1.15;
export const CAMERA_MIN_DISTANCE = 22;
export const CAMERA_MAX_DISTANCE = 82;
export const CAMERA_TARGET_HEIGHT = 1.45;
export const CAMERA_LOOK_AT_HEIGHT = 0.28;
export const CAMERA_MOUSE_YAW_SPEED = 0.00192;
export const CAMERA_MOUSE_PITCH_SPEED = 0.00168;
export const CAMERA_STICK_YAW_SPEED = 1.62;
export const CAMERA_STICK_PITCH_SPEED = 1.35;
export const CAMERA_FOLLOW_SMOOTHING_SECONDS = 0.37;
export const CAMERA_ROTATION_SMOOTHING_SECONDS = 0.25;
export const CAMERA_DISTANCE_SMOOTHING_SECONDS = 0.43;
export const CAMERA_COLLISION_SMOOTHING_SECONDS = 0.27;
export const CAMERA_OBSTACLE_RADIUS = 1.15;
export const CAMERA_OBSTACLE_MIN_DISTANCE = 8;
export const CAMERA_AIM_DISTANCE = 18;
export const CAMERA_OCCLUDER_FADE_OPACITY = 0.025;
export const CAMERA_OCCLUDER_FADE_EXTRA_RADIUS = 8.5;
export const PICKUP_COLLECT_RADIUS = 3.08 * PICKUP_COLLECT_RADIUS_MULTIPLIER;
export const ENEMY_HEALTH_BASE_MULTIPLIER = 3.2;
export const KNOCKBACK_DECAY = 10.5;
export const KNOCKBACK_STOP_SPEED = 0.03;
export const HEALTH_BAR_VISIBLE_SECONDS = 2.4;
export const PROP_COLLISION_PUSH_EPSILON = 0.02;
export const COMBO_TIMEOUT_SECONDS = 2.45;
export const FLOAT_TEXT_LIFE_SECONDS = 0.82;
export const SYNTH_MASTER_VOLUME = 0.48;
export const SPAWN_PACING = {
  rampSeconds: 600,
  minRateMultiplier: 2,
  maxRateMultiplier: 10,
  minSpawnIntervalSeconds: 0.075,
  activeCapMultiplierAtMax: 1.85,
  hardActiveEnemyCap: 260
};
export const BOSS_PACING = {
  firstBossSecond: 60,
  intervalSeconds: 60,
  sizeMultiplier: 2.5,
  healthMultiplier: 10,
  speedMultiplier: 0.72,
  contactDamageMultiplier: 1.35,
  maxActiveBosses: 3
};
export const BOSS_ATTACKS = {
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
export const COMBAT_VISUALS = {
  aimConeLength: 18,
  aimConeHalfAngle: 0.22,
  targetLockRange: 38,
  offscreenArrowRange: CAMERA_VIEW_RADIUS * 1.18,
  maxOffscreenArrows: 8
};
export const COMBAT_BULLET_CAP = 240;
export const SPECIAL_WEAPON_OBJECT_CAPS: Partial<Record<string, number>> = {
  orbit: 28,
  plagueVial: 24,
  plaguePool: 36,
  moldBloom: 36,
  boomerang: 18,
  bat: 42,
  pulse: 18
};

export const FALLBACK_DATA = {
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
