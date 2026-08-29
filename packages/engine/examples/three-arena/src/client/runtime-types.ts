import type { ThreeArenaPlayerMotion } from "../player-motion.ts";
import { threeView } from "./boot-context.ts";
import { TRAVERSAL_TOOL_TYPES } from "./constants.ts";
import type { ClassUnlock, HazardDefinition, LevelChoice, ProgressionBonus, StatLevelChoice } from "./content-types.ts";
import type { ThreeRender3DAnimationController } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";

export type RenderableObject = Three.Object3D & {
  material?: Three.Material | Three.Material[];
  geometry?: Three.BufferGeometry;
};

export type ProceduralPosePart = {
  object: Three.Object3D;
  rotation: Three.Euler;
  position: Three.Vector3;
  overlayRotation: { x: number; y: number; z: number };
};

export type ProceduralPose = { parts: Map<string, ProceduralPosePart>; time: number };
export type ArenaAnimationClip = Three.AnimationClip & { userData: Record<string, unknown> };

export type ProceduralMode = "none" | "additive" | "full" | "semantic";

export type ActorAnimationState = {
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

export type ActorVisual = ActorAnimationState & { mesh: RenderableObject };

export type WorldActor = ActorAnimationState & {
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

export type Player = WorldActor & {
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

export type EnemyHealthBar = {
  root: Three.Group;
  fill: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;
};

export type Enemy = WorldActor & {
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

export type BulletBase = {
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

export type OrdinaryBullet = BulletBase & { kind?: undefined };
export type BoomerangBullet = BulletBase & {
  kind: "boomerang";
  weaponId: string;
  outboundSeconds: number;
  returnSpeed?: number;
  hitEnemies: Set<Enemy>;
  returning?: boolean;
};
export type HomingBullet = BulletBase & {
  kind: "homing";
  weaponId: string;
  turnRate: number;
  biteCooldown?: number;
  hitEnemies: Set<Enemy>;
};
export type CombatBullet = OrdinaryBullet | BoomerangBullet | HomingBullet;

export type WeaponZoneKind = "plaguePool" | "moldBloom" | "bloodBloom";
export type WeaponZoneSpec = {
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
export type WeaponZone = WeaponZoneSpec & {
  mesh: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;
  age: number;
  life: number;
  tickClock: number;
  opacity: number;
  seed: number;
};

export type Pickup = {
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

export type SceneSpark = { mesh: Three.Object3D; vx: number; vy: number; vz: number; rx: number; ry: number };
export type SceneEffect = { mesh: Three.Object3D; sparks?: SceneSpark[]; light?: Three.Object3D; t: number; life: number; baseScale: number; expand: number };

export type IndicatorRuntime = {
  mesh: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;
  damage: number;
  windup: number;
  ttl: number;
  t: number;
  applied: boolean;
};
export type RadialIndicator = IndicatorRuntime & {
  kind: "slam" | "nova";
  x: number;
  z: number;
  radius: number;
  originX?: number;
  originZ?: number;
};
export type DashIndicator = IndicatorRuntime & {
  kind: "dash";
  x: number;
  z: number;
  originX: number;
  originZ: number;
  angle: number;
  length: number;
  width: number;
};
export type AttackIndicator = RadialIndicator | DashIndicator;
export type RadialIndicatorSpec = Omit<RadialIndicator, keyof IndicatorRuntime>;
export type DashIndicatorSpec = Omit<DashIndicator, keyof IndicatorRuntime>;
export type AttackIndicatorSpec = (RadialIndicatorSpec | DashIndicatorSpec) & Pick<IndicatorRuntime, "damage" | "windup" | "ttl">;

export type ActiveHazard = HazardDefinition & { mesh: Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>; seed: number; damageClock: number };

export type CircleCollider = {
  kind: "circle";
  blocking: boolean;
  radius: number;
  height: number;
  rot: number;
  baseY?: number;
  topY?: number;
};
export type BoxCollider = {
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
export type PropCollider = CircleCollider | BoxCollider;

export type PropCollisionItem = { prop: Three.Object3D; x: number; y: number; z: number; radius: number; collider: PropCollider };

export type TraversalTool = {
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
export type TraversalToolType = TraversalTool["type"];
export type TraversalHeightDelta = { delta: number; dirX: number; dirZ: number; targetX: number; targetZ: number };
export type TraversalSpawn = TraversalHeightDelta & { x: number; z: number; score: number };
export type TerrainGradient = { x: number; z: number; ratio: number; angle: number };
export type WorldDelta = { dx: number; dz: number };
export type WorldPoint = { x: number; z: number };
export type PlayerJumpStats = { heightMultiplier: number; gravityMultiplier: number; maxJumps: number };
export type WeaponAim = { angle: number; mode: "manual" | "auto" | "manual-fallback"; target: WorldPoint | null };
export type EnemyTarget = Player | { x: number; z: number; radius: number };
export type AreaWeaponDamageOptions = {
  hitLimit?: number;
  damageOverride?: number;
  damageScale?: number;
  knockbackScale?: number;
  slowSeconds?: number;
  color?: Three.ColorRepresentation;
};
export type WeaponDamageOptions = {
  hitX?: number;
  hitZ?: number;
  knockbackScale?: number;
  slowSeconds?: number;
  color?: Three.ColorRepresentation;
};

export type PlayerDamageOptions = {
  minDamage?: number;
  invulnSeconds?: number;
  source?: Enemy;
  sourceX?: number;
  sourceZ?: number;
  knockbackForce?: number;
  knockback?: boolean;
};

export type RemoteWeaponProgression = { id: string; level: number; evolved: boolean };
export type RemotePassiveProgression = { id: string; level: number; effects?: string[] };
export type RemotePlayer = ActorAnimationState & {
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

export type ProgressionStats = Required<Pick<ProgressionBonus,
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

export type Actor = Player | Enemy;

export type LevelChoiceState = { choices: LevelChoice[]; selectedIndex: number };
export type ClassLevelNotice = { classId: string; level: number; unlocked: Array<ClassUnlock & { kind: "weapon" | "passive" }> };
export type InstanceBatch = { mesh: Three.InstancedMesh; count: number; capacity: number; width?: number; height?: number };
export type PickupInstanceBatch = InstanceBatch & { width: number; height: number };
export type ArenaRagdoll = Omit<ReturnType<typeof threeView.createRagdoll>, "root"> & { root: Three.Object3D };
export type GroundTilePatch = { mesh: Three.InstancedMesh; palette: number[]; platformPalette: number[]; lastCenterGX: number; lastCenterGZ: number };
export type TerrainPlatformCell = { centerX: number; centerZ: number; radius: number; radiusSq: number; lift: number; baseHeight: number };
export type ParticlePool = {
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

export type EffectKind = "muzzle" | "hit" | "blast" | "jumpDust" | "airTrail";
export type EffectOptions = {
  color?: Three.ColorRepresentation;
  angle?: number;
  particles?: number;
  speed?: number;
  size?: number;
  y?: number;
  worldY?: number;
};
export type BatchedParticle = {
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
export type SparkOptions = {
  fullCircle?: boolean;
  startSpread?: number;
  verticalBase?: number;
  verticalRandom?: number;
  scale?: number;
};
export type WorldPosition3D = { x: number; y: number; z: number };
export type SynthCueKind = "shot" | "hit" | "pickup" | "kill" | "bossKill" | "level" | "weapon"
  | "start" | "wave" | "boss" | "telegraph" | "jump" | "slam" | "damage" | "death";
export type SynthCueOptions = {
  weaponId?: string;
  kind?: Pickup["kind"];
  color?: Three.ColorRepresentation;
};
export type ToneOptions = {
  attack?: number;
  release?: number;
  gain?: number;
  endFreq?: number;
  type?: OscillatorType;
  dest?: AudioNode | null;
};
export type NoiseOptions = {
  attack?: number;
  release?: number;
  gain?: number;
  frequency?: number;
  q?: number;
  type?: BiquadFilterType;
  dest?: AudioNode | null;
};
export type FloatingTextOptions = {
  y?: number;
  targetHeight?: number;
  baseFontPx?: number;
  lifeSeconds?: number;
  rise?: number;
  screenRisePx?: number;
  growScale?: number;
};
export type SceneListItem = {
  mesh?: Three.Object3D | null;
  light?: Three.Object3D | null;
  userData?: { light?: Three.Object3D };
};

export function isEnemySceneItem(item: SceneListItem): item is Enemy {
  return "typeId" in item && "hp" in item && "maxHp" in item;
}

export type ActorAssets = {
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

export type IndicatorMesh = Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>;

export type VisualIndicators = {
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

export type BenchStress = { quietCombat: boolean; enemies: number; pickups: number; effects: number; allProps: boolean };
export type CameraRigSnapshot = {
  lookAt: [number, number, number];
  desiredPosition: [number, number, number];
  position: [number, number, number];
  yaw: number;
  pitch: number;
  distance: number;
  blocked: boolean;
};
