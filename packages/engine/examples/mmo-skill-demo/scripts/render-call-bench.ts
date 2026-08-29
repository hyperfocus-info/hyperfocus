import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRenderer } from "../src/client/render.ts";
import type { RenderRecordStrategy } from "@hyperfocus/engine/render";
import { buildTiles } from "../src/client/world.ts";
import {
  createBenchmarkImage,
  createRenderBenchSurface,
  forceBenchmarkGc,
  readClientRenderTelemetry,
  setBenchmarkGlobal,
} from "./render-bench-support.ts";
import { getMmoSkillDemoAnchorTile, mmoSkillDemoRegionConfig } from "../src/data/world.ts";
import { createMmoSkillDemoState } from "../src/shared-world-state.ts";
import { upsertMmoSkillDemoEntity } from "../src/shared-entity-registry.ts";
import { type HazardEntity, type LootEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity } from "../src/shared-contracts.ts";

type BenchConfig = {
  frames: number;
  warmup: number;
  players: number;
  npcs: number;
  hazards: number;
  loots: number;
  effects: number;
  width: number;
  height: number;
  map: "none" | "minimap" | "world";
  drawDataCaches: "auto" | "always" | "never";
  renderRecordStrategy: RenderRecordStrategy;
  experiment: string;
  out: string;
};

type Summary = {
  min: number;
  p50: number;
  p95: number;
  max: number;
  avg: number;
};
export type RenderCallBenchReport = {
  createdAt: string;
  config: BenchConfig;
  frameMs: Summary;
  drawn: Summary;
  canvasOperations: Summary;
  heapStartMb: number;
  heapEndMb: number;
  heapDeltaMb: number;
};

const DEFAULT_OUT = resolve(import.meta.dir, "..", ".local", "render-call-bench.json");
export const RENDER_FRAME_P95_TARGET_MS = 12;
export const MAP_OVERHEAD_P95_TARGET_MS = 3;
const OAKHAVEN_TILE = getMmoSkillDemoAnchorTile("oakhaven");
const CENTER = {
  x: (OAKHAVEN_TILE.x + 0.5) * mmoSkillDemoRegionConfig.tileSize,
  y: (OAKHAVEN_TILE.y + 0.5) * mmoSkillDemoRegionConfig.tileSize,
  zoneId: "ashwood" as const
};

function integerArg(name: string, fallback: number, minimum: number) {
  const prefix = `--${name}=`;
  const match = Bun.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  const value = Number(match.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`--${name} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function stringArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return Bun.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function optionalNumberArg(name: string) {
  const value = stringArg(name, "");
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`--${name} must be a positive finite number`);
  return number;
}

function mapArg(): BenchConfig["map"] {
  const value = stringArg("map", "minimap");
  return value === "none" || value === "minimap" || value === "world" ? value : "minimap";
}

function drawDataCachesArg(): BenchConfig["drawDataCaches"] {
  const value = stringArg("draw-caches", "never");
  return value === "auto" || value === "always" || value === "never" ? value : "auto";
}

function renderRecordStrategyArg(): RenderRecordStrategy {
  const value = stringArg("render-records", "fresh");
  return value === "clear" || value === "fresh" || value === "overwrite" ? value : "fresh";
}

export function renderCallBenchConfig(overrides: Partial<BenchConfig> = {}): BenchConfig {
  const config = {
    frames: integerArg("frames", 1200, 1),
    warmup: integerArg("warmup", 120, 0),
    players: integerArg("players", 20, 1),
    npcs: integerArg("npcs", 180, 0),
    hazards: integerArg("hazards", 120, 0),
    loots: integerArg("loots", 90, 0),
    effects: integerArg("effects", 64, 0),
    width: integerArg("width", 960, 1),
    height: integerArg("height", 540, 1),
    map: mapArg(),
    drawDataCaches: drawDataCachesArg(),
    renderRecordStrategy: renderRecordStrategyArg(),
    experiment: stringArg("experiment", "combined"),
    out: stringArg("out", DEFAULT_OUT),
    ...overrides
  };
  validateBenchConfig(config);
  return config;
}

function validateBenchConfig(config: BenchConfig) {
  for (const [name, value, minimum] of [
    ["frames", config.frames, 1],
    ["warmup", config.warmup, 0],
    ["players", config.players, 1],
    ["npcs", config.npcs, 0],
    ["hazards", config.hazards, 0],
    ["loots", config.loots, 0],
    ["effects", config.effects, 0],
    ["width", config.width, 1],
    ["height", config.height, 1]
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be a safe integer >= ${minimum}`);
  }
  if (!config.out) throw new Error("out must not be empty");
}

function round(value: number, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function summarize(values: readonly number[]): Summary {
  if (!values.length) return { min: 0, p50: 0, p95: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  return {
    min: round(sorted[0]),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted[sorted.length - 1]),
    avg: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length)
  };
}

function heapMb() {
  return round(process.memoryUsage().heapUsed / 1024 / 1024, 2);
}

function fakeImages() {
  const icon = createBenchmarkImage(32, 32);
  return {
    hero: createBenchmarkImage(176, 44),
    goldIcon: icon,
    ironOreIcon: icon,
    silkThreadIcon: icon,
    gladeBerryIcon: icon,
    cinderAleIcon: icon,
    speedPotionIcon: icon,
    bootsIcon: icon,
    ironChestIcon: icon,
    ringFocusIcon: icon,
    brokenHiltIcon: icon,
    hatchetIcon: icon,
    pickaxeIcon: icon,
    ashLogsIcon: icon,
    captainsMapIcon: icon,
    uniqueCapeIcon: icon,
    renownIcon: icon,
    eliteWeaponIcon: icon,
    cursedIdolIcon: icon,
    tree1: createBenchmarkImage(42, 48),
    tree2: createBenchmarkImage(42, 48),
    tree3: createBenchmarkImage(42, 48),
    stone1: createBenchmarkImage(34, 28),
    stone2: createBenchmarkImage(34, 28),
    resourceStones: createBenchmarkImage(34, 28),
    land: createBenchmarkImage(32, 32),
    road: createBenchmarkImage(32, 32),
    lake: createBenchmarkImage(32, 32),
    npcBlacksmith: createBenchmarkImage(128, 32),
    merchantJeweler: createBenchmarkImage(128, 32),
    allyRobber: createBenchmarkImage(128, 32),
    allyAssassin: createBenchmarkImage(128, 32),
    allyThug: createBenchmarkImage(128, 32),
    trainerSage: createBenchmarkImage(128, 32),
    bossWarlord: createBenchmarkImage(192, 48),
    bossVikingLeader: createBenchmarkImage(192, 48),
    bossGiantGoblin: createBenchmarkImage(192, 48),
    bossDragon: createBenchmarkImage(192, 48),
    enemyShamanGoblin: createBenchmarkImage(128, 32),
    enemyChiefGoblin: createBenchmarkImage(128, 32),
    enemyGoblin: createBenchmarkImage(128, 32),
    monster: createBenchmarkImage(128, 32)
  };
}

function player(id: string, index: number): PlayerEntity {
  const angle = (Math.PI * 2 * index) / 20;
  const weapon = ["mace", "bow", "staff", "wand", "twin-blades", "blade"][index % 6] ?? "mace";
  const ability = ["space-rush", "mace-pummel", "bow-quick-shot", "staff-meteor", "wand-hex", "blade-cleave"][index % 6] ?? "mace-pummel";
  return {
    id,
    entityType: "player",
    name: `Bench ${index}`,
    x: CENTER.x + Math.cos(angle) * (28 + index * 3),
    y: CENTER.y + Math.sin(angle) * (24 + index * 2),
    hp: 90,
    maxHp: 100,
    mana: 40,
    maxMana: 80,
    energy: 100,
    maxEnergy: 100,
    combatXp: 0,
    combatLevel: 35,
    miningXp: 0,
    miningLevel: 12,
    woodcuttingXp: 0,
    woodcuttingLevel: 14,
    zoneId: CENTER.zoneId,
    gold: 40,
    renown: 6,
    masteryRank: 2,
    contractId: "ashwood-hunt",
    contractKills: 4,
    contractStreak: 1,
    contractCooldownMs: 0,
    inventory: { "ash-logs": 8, "iron-ore": 4, [weapon]: 1 },
    bank: { "ash-logs": 5, "iron-ore": 3 },
    equipment: { weapon },
    abilitySlots: { LMB: "unlocked", RMB: "unlocked", Space: "unlocked", Q: "unlocked", E: "unlocked", R: "unlocked", [ability]: index % 2 ? "LMB" : "Space" },
    cooldowns: { Space: index % 3 ? 0 : 900 },
    questFlags: { "first-cut": true, "second-cut": true },
    activeQuestId: "wolf-culling",
    dailyQuestDate: "",
    dailyQuestStep: 0,
    dailyQuestProgress: 0,
    dailyQuestCompleted: false,
    dailyQuestResult: "",
    wolfKills: 6,
    batKills: 0,
    bazaarSurvivalMs: 20000,
    dungeonBossKills: 1,
    homeZoneId: "port-marrow",
    escortNpcId: "",
    escortTargetX: 0,
    escortTargetY: 0,
    escortTargetZoneId: CENTER.zoneId,
    escortMs: 0,
    instanceId: "",
    prestigeTitle: index % 5 === 0 ? "Riftbound" : "",
    action: index % 2 ? "lmb" : "space",
    targetId: "bench-npc-0",
    aimX: CENTER.x + 120,
    aimY: CENTER.y,
    guardMs: index % 7 === 0 ? 600 : 0,
    berserkMs: index % 11 === 0 ? 900 : 0,
    cooldownMs: 0,
    equippedWeaponId: weapon,
    activeAbility: ability,
    activeSlot: index % 2 ? "LMB" : "Space",
    activeMs: 180 + index * 5,
    activeDurationMs: ability === "space-rush" ? 5000 : 900,
    chargeMs: ability === "mace-pummel" ? 900 : 0,
    rushDistance: ability === "space-rush" ? 80 : 0,
    abilityVectorX: Math.cos(angle),
    abilityVectorY: Math.sin(angle),
    abilityTickMs: 0,
    abilityHits: "",
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: index % 13 === 0 ? 300 : 0,
    iframeMs: index % 4 === 0 ? 220 : 0,
    castMs: index % 3 === 0 ? 180 : 0,
    damageAmpMs: 0,
    combatFlags: "",
    lastAttackStyle: "",
    visibleCount: 0
  };
}

function npc(index: number): NpcEntity {
  const kind = ["prowling-wolf", "ash-bramble-stalker", "alpha-timberwolf", "crystal-beetle", "sand-wraith", "power-node", "spore-pod", "glass-clone"][index % 8];
  const column = index % 30;
  const row = Math.floor(index / 30);
  const x = CENTER.x - 420 + column * 30;
  const y = CENTER.y - 260 + row * 30;
  const boss = index % 17 === 0;
  return {
    id: `bench-npc-${index}`,
    entityType: "npc",
    kind,
    role: boss ? "boss" : "mob",
    zoneId: CENTER.zoneId,
    elite: boss || index % 9 === 0,
    x,
    y,
    spawnX: x,
    spawnY: y,
    hp: boss ? 260 : 60,
    maxHp: boss ? 260 : 60,
    respawnMs: 0,
    attackCooldownMs: 400,
    projectileCooldownMs: 900,
    phaseMs: (index % 24) * 300,
    summonedBy: "",
    personality: "aggressive-pack-hunter",
    impactType: (["dust", "spark", "sap", "void", "blood"] as const)[index % 5] ?? "dust",
    knockbackModifier: 1,
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: index % 19 === 0 ? 240 : 0,
    slowMs: 0,
    iframeMs: index % 23 === 0 ? 220 : 0,
    castMs: index % 11 === 0 ? 320 : 0,
    damageAmpMs: 0,
    combatState: "",
    combatFlags: index % 10 === 0 ? "hex:2|weakened|antiheal" : "",
    lastAttackStyle: ""
  };
}

function hazard(index: number): HazardEntity {
  const column = index % 24;
  const row = Math.floor(index / 24);
  const x = CENTER.x - 380 + column * 34;
  const y = CENTER.y - 220 + row * 34;
  return {
    id: `bench-hazard-${index}`,
    entityType: "hazard",
    kind: index % 2 ? "line" : "aoe",
    zoneId: CENTER.zoneId,
    ownerId: index % 5 === 0 ? "p0" : "",
    x,
    y,
    toX: x + 80 + (index % 7) * 8,
    toY: y + (index % 5) * 10,
    radius: 8 + (index % 9),
    windupMs: index % 3 ? 260 : 0,
    lifetimeMs: 900,
    damage: 0,
    knockbackModifier: 1,
    isHeavyImpact: index % 8 === 0,
    armorPierce: false,
    effectKind: ["dust", "spark", "sap", "spore", "void", "root", "meteor", "conewave", "toxicwave"][index % 9],
    text: index % 13 === 0 ? "-9" : "",
    pulse: (index % 10) * 6
  };
}

function loot(index: number): LootEntity {
  const ids = ["gold", "iron-ore", "silk-thread", "glade-berries", "cinder-ale", "speed-potion"];
  return {
    id: `bench-loot-${index}`,
    entityType: "loot",
    itemId: ids[index % ids.length],
    amount: 1 + (index % 8),
    zoneId: CENTER.zoneId,
    x: CENTER.x - 360 + (index % 24) * 32,
    y: CENTER.y - 250 + Math.floor(index / 24) * 32,
    ownerId: "",
    expiresMs: 60000,
    pickupRadius: 32
  };
}

function resource(index: number): ResourceEntity {
  return {
    id: `bench-resource-${index}`,
    entityType: "resource",
    kind: index % 2 ? "ore" : "tree",
    zoneId: CENTER.zoneId,
    x: CENTER.x - 380 + (index % 28) * 30,
    y: CENTER.y - 280 + Math.floor(index / 28) * 34,
    hp: index % 4,
    maxHp: 4,
    depleted: index % 9 === 0,
    respawnMs: 0
  };
}

function populateState(cfg: BenchConfig) {
  const state = createMmoSkillDemoState("ashwood");
  state.roomLabel = "Render Bench";
  state.activePlayers = cfg.players;
  state.worldEventProgress = 3;
  state.worldEventGoal = 12;
  for (let i = 0; i < cfg.players; i += 1) upsertMmoSkillDemoEntity(state, player(`p${i}`, i));
  for (let i = 0; i < cfg.npcs; i += 1) upsertMmoSkillDemoEntity(state, npc(i));
  for (let i = 0; i < cfg.hazards; i += 1) upsertMmoSkillDemoEntity(state, hazard(i));
  for (let i = 0; i < cfg.loots; i += 1) upsertMmoSkillDemoEntity(state, loot(i));
  for (let i = 0; i < Math.min(96, cfg.npcs); i += 1) upsertMmoSkillDemoEntity(state, resource(i));
  state.effects = Array.from({ length: cfg.effects }, (_, index) => ({
    id: `bench-effect-${index}`,
    kind: index % 2 ? "line" : "aoe",
    zoneId: CENTER.zoneId,
    ownerId: "",
    x: CENTER.x - 300 + (index % 16) * 42,
    y: CENTER.y - 190 + Math.floor(index / 16) * 42,
    toX: CENTER.x - 220 + (index % 16) * 42,
    toY: CENTER.y - 150 + Math.floor(index / 16) * 42,
    radius: 10 + (index % 10),
    lifetimeMs: 600,
    ageMs: (index % 10) * 32,
    effectKind: ["spark", "sap", "spore", "void", "meteor"][index % 5],
    text: index % 11 === 0 ? "-7" : "",
    pulse: index * 3,
    priority: 50
  }));
  return state;
}

function animateState(state: MmoSkillDemoState, frame: number) {
  state.tick = frame;
  const t = frame * 0.06;
  let index = 0;
  for (const actor of Object.values(state.players)) {
    actor.x = CENTER.x + Math.cos(t + index * 0.37) * (34 + index * 2);
    actor.y = CENTER.y + Math.sin(t + index * 0.31) * (28 + index * 2);
    actor.aimX = CENTER.x + Math.cos(t + index) * 140;
    actor.aimY = CENTER.y + Math.sin(t + index) * 120;
    actor.activeMs = (actor.activeMs + 16) % Math.max(1, actor.activeDurationMs);
    if (actor.activeAbility === "mace-pummel") actor.chargeMs = (actor.chargeMs + 16) % 2400;
    index += 1;
  }
  index = 0;
  for (const hazard of Object.values(state.hazards)) {
    hazard.pulse = (hazard.pulse + 16) % 900;
    hazard.x += Math.sin(t + index) * 0.08;
    hazard.y += Math.cos(t + index) * 0.08;
    index += 1;
  }
  for (const effect of state.effects) effect.ageMs = (effect.ageMs + 16) % effect.lifetimeMs;
}

function makeRenderer(cfg: BenchConfig) {
  const { canvas, operations } = createRenderBenchSurface(cfg.width, cfg.height, true);
  const status = { textContent: "", hidden: true };
  return {
    renderer: createRenderer(canvas, status, fakeImages(), buildTiles(), () => "p0", undefined, {
      drawDataCaches: cfg.drawDataCaches,
      renderRecordStrategy: cfg.renderRecordStrategy
    }),
    operations
  };
}

function mapViewFor(mode: BenchConfig["map"]) {
  return {
    minimapOpen: mode === "minimap",
    worldMapOpen: mode === "world"
  };
}

export async function runRenderCallBench(cfg = renderCallBenchConfig()): Promise<RenderCallBenchReport> {
  setBenchmarkGlobal("__mmoSkillDemoMapPerfExperiment", cfg.experiment);
  const { renderer, operations } = makeRenderer(cfg);
  const state = populateState(cfg);
  const focus = state.players.p0;
  if (!focus) throw new Error("Render benchmark requires player p0.");
  const totalFrames = cfg.frames + cfg.warmup;
  const frameMs: number[] = [];
  const drawn: number[] = [];
  const canvasOperations: number[] = [];
  forceBenchmarkGc();
  const heapStart = heapMb();
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const timeMs = frame * (1000 / 60);
    animateState(state, frame);
    const start = performance.now();
    const operationsBefore = operations();
    renderer.drawFrame(
      state,
      focus,
      { connected: true, playerId: "p0", receivedSnapshots: 1, receivedDeltas: frame, interpMode: "bench", interpDelayMs: 90, interpBufferedFrames: 3 },
      timeMs,
      { x: focus.aimX, y: focus.aimY },
      undefined,
      undefined,
      mapViewFor(cfg.map)
    );
    const elapsed = performance.now() - start;
    if (frame >= cfg.warmup) {
      frameMs.push(elapsed);
      const telemetry = readClientRenderTelemetry();
      drawn.push(telemetry?.drawn ?? 0);
      canvasOperations.push(operations() - operationsBefore);
    }
    if (frame % 240 === 0) await Promise.resolve();
  }
  forceBenchmarkGc();
  const heapEnd = heapMb();
  const report: RenderCallBenchReport = {
    createdAt: new Date().toISOString(),
    config: cfg,
    frameMs: summarize(frameMs),
    drawn: summarize(drawn),
    canvasOperations: summarize(canvasOperations),
    heapStartMb: heapStart,
    heapEndMb: heapEnd,
    heapDeltaMb: round(heapEnd - heapStart, 2)
  };
  mkdirSync(dirname(cfg.out), { recursive: true });
  writeFileSync(cfg.out, `${JSON.stringify(report, null, 2)}\n`);
  console.info(`render ${cfg.frames}f: frame p95=${report.frameMs.p95}ms p50=${report.frameMs.p50}ms drawn p50=${report.drawn.p50} heapDelta=${report.heapDeltaMb}MB`);
  console.info(`report: ${cfg.out}`);
  return report;
}

if (import.meta.main) {
  const report = await runRenderCallBench();
  const referenceP95Ms = optionalNumberArg("reference-p95-ms");
  if (referenceP95Ms !== undefined && report.frameMs.p95 > referenceP95Ms) {
    throw new Error(`reference render p95 ${report.frameMs.p95}ms exceeds ${referenceP95Ms}ms`);
  }
}
