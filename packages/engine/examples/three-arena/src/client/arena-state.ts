import { createArenaAudioRuntime } from "../audio-runtime.ts";
import { BOSS_PACING, ENEMY_SPATIAL_CELL_SIZE, PROP_COLLISION_CELL_SIZE, SYNTH_MASTER_VOLUME } from "./constants.ts";
import { data, DEFAULT_CLASS_ID, WORLD_SIZE } from "./content-runtime.ts";
import type { ClassLoadouts, Settings } from "./content-runtime.ts";
import type { ArenaPropDefinition, ProgressionBonus } from "./content-types.ts";
import { createInitialClassLevels, createInitialClassLoadouts, readSettings } from "./initial-state-storage.ts";
import type { ActiveHazard, ActorAssets, ArenaRagdoll, AttackIndicator, BenchStress, ClassLevelNotice, CombatBullet, Enemy, EnemyHealthBar, GroundTilePatch, InstanceBatch, LevelChoiceState, ParticlePool, Pickup, PickupInstanceBatch, Player, ProgressionStats, PropCollisionItem, SceneEffect, TerrainPlatformCell, TraversalTool, VisualIndicators, WeaponZone } from "./runtime-types.ts";
import { createFixedGridSpatialIndex } from "@hyperfocus/engine";
import type { FixedGridSpatialIndex } from "@hyperfocus/engine";
import { createThreeBspTree3D, createThreeResourceCache } from "@hyperfocus/engine/render/3d";
import type { ThreeBspTree3D, ThreeDisposableResource, ThreeResourceCache } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";

export type ArenaLights = {
  ambient?: Three.HemisphereLight;
  moon?: Three.DirectionalLight;
  rim?: Three.PointLight;
  sun?: Three.DirectionalLight;
  cryptFill?: Three.PointLight;
  muzzle?: Three.PointLight;
  playerGlow?: Three.PointLight;
  pickupLights?: Three.PointLight[];
};

export type ArenaState = {
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
  enemyBulletScratch: Enemy[];
  enemySplashScratch: Enemy[];
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

export const state: ArenaState = {
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
  enemyBulletScratch: [],
  enemySplashScratch: [],
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

export type ArenaAudio = {
  noiseBuffer: AudioBuffer | null;
  nextBeatAt: number;
  beat: number;
  shotGateAt: number;
  hitGateAt: number;
  pickupGateAt: number;
};
export const arenaAudioRuntime = createArenaAudioRuntime(SYNTH_MASTER_VOLUME);
export const audio: ArenaAudio = {
  noiseBuffer: null,
  nextBeatAt: 0,
  beat: 0,
  shotGateAt: 0,
  hitGateAt: 0,
  pickupGateAt: 0
};
