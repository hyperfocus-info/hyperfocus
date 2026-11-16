import { roundDecimal } from "@hyperfocus/utilities/math";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRenderer, type ClientRenderTelemetry, type RendererOptions } from "../src/client/render.ts";
import { clientImageSources } from "../src/data/assets.ts";
import { getMmoSkillDemoAnchorTile, mmoSkillDemoRegionConfig } from "../src/data/world.ts";
import { worldAreaCaptureAnchors } from "../src/data/world-landmarks.ts";
import { createMmoSkillDemoState } from "../src/shared-world-state.ts";
import { upsertMmoSkillDemoEntity } from "../src/shared-entity-registry.ts";
import { type MmoSkillDemoState, type PlayerEntity } from "../src/shared-contracts.ts";
import { buildTiles } from "../src/client/world.ts";
import {
  createBenchmarkImage,
  createRenderBenchSurface,
  readClientRenderTelemetry,
  setBenchmarkGlobal,
} from "./render-bench-support.ts";

type MapMode = "none" | "minimap" | "world";
type DrawDataCachesMode = "auto" | "always" | "never";
type TerrainExperiment = NonNullable<RendererOptions["terrainExperiment"]>;
type PhaseKey = keyof ClientRenderTelemetry["phaseMs"];
type BenchConfig = {
  frames: number;
  priming: number;
  repeats: number;
  width: number;
  height: number;
  map: MapMode;
  drawDataCaches: DrawDataCachesMode;
  terrainExperiment: TerrainExperiment;
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
type RegionTarget = {
  id: string;
  label: string;
  zoneId: PlayerEntity["zoneId"];
  x: number;
  y: number;
};
type RegionReport = {
  id: string;
  label: string;
  zoneId: PlayerEntity["zoneId"];
  firstFrameMs: Summary;
  frameMs: Summary;
  drawn: Summary;
  calls: Record<string, Summary>;
  phaseMs: Record<PhaseKey, Summary>;
  over16ms: number;
  over33ms: number;
  worstPhase: PhaseKey;
};
type RegionTeleportBenchReport = {
  createdAt: string;
  config: BenchConfig;
  regions: RegionReport[];
  worstFirstFrame: Array<Pick<RegionReport, "id" | "label" | "zoneId" | "firstFrameMs" | "frameMs" | "worstPhase">>;
  worstP95: Array<Pick<RegionReport, "id" | "label" | "zoneId" | "firstFrameMs" | "frameMs" | "worstPhase">>;
};
type RegionAccumulator = {
  region: RegionTarget;
  firstFrameMs: number[];
  frameMs: number[];
  drawn: number[];
  calls: Record<(typeof CALL_KEYS)[number], number[]>;
  phaseMs: Record<PhaseKey, number[]>;
  over16ms: number;
  over33ms: number;
};

const DEFAULT_OUT = resolve(import.meta.dir, "..", ".local", "region-teleport-bench.json");
const PHASE_KEYS: PhaseKey[] = ["setup", "terrain", "world", "hazards", "effects", "hud", "stage", "map"];
const CALL_KEYS = ["terrain", "world", "hazards", "transientHazards", "effects", "reticle", "hud"] as const;

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

function mapArg(): MapMode {
  const value = stringArg("map", "minimap");
  return value === "none" || value === "minimap" || value === "world" ? value : "minimap";
}

function drawDataCachesArg(): DrawDataCachesMode {
  const value = stringArg("draw-caches", "never");
  return value === "auto" || value === "always" || value === "never" ? value : "never";
}

function terrainExperimentArg(): TerrainExperiment {
  const value = stringArg("terrain-experiment", "chunk-sprites");
  if (value === "control" || value === "tile-call-cache" || value === "chunk-sprites") return value;
  throw new Error(`Unknown terrain experiment: ${value}`);
}

function config(): BenchConfig {
  return {
    frames: integerArg("frames", 24, 1),
    priming: integerArg("priming", 24, 0),
    repeats: integerArg("repeats", 3, 1),
    width: integerArg("width", 960, 1),
    height: integerArg("height", 540, 1),
    map: mapArg(),
    drawDataCaches: drawDataCachesArg(),
    terrainExperiment: terrainExperimentArg(),
    experiment: stringArg("experiment", "combined"),
    out: stringArg("out", DEFAULT_OUT)
  };
}

function round(value: number, digits = 3) { return roundDecimal(value, digits); }

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

function fakeImages() {
  return Object.fromEntries(Object.keys(clientImageSources).map((key) => [key, createBenchmarkImage()]));
}

function player(): PlayerEntity {
  return {
    id: "p0",
    entityType: "player",
    name: "Bench",
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    mana: 80,
    maxMana: 80,
    energy: 100,
    maxEnergy: 100,
    combatXp: 0,
    combatLevel: 35,
    miningXp: 0,
    miningLevel: 12,
    woodcuttingXp: 0,
    woodcuttingLevel: 14,
    zoneId: "ashwood",
    gold: 40,
    renown: 6,
    masteryRank: 2,
    contractId: "ashwood-hunt",
    contractKills: 4,
    contractStreak: 1,
    contractCooldownMs: 0,
    inventory: { "ash-logs": 8, "iron-ore": 4, mace: 1 },
    bank: { "ash-logs": 5, "iron-ore": 3 },
    equipment: { weapon: "mace" },
    abilitySlots: { LMB: "unlocked", RMB: "unlocked", Space: "unlocked", Q: "unlocked", E: "unlocked", R: "unlocked", "mace-pummel": "LMB" },
    cooldowns: {},
    questFlags: { "first-cut": true, "second-cut": true, "fast-travel-registered": true },
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
    escortTargetZoneId: "ashwood",
    escortMs: 0,
    instanceId: "",
    prestigeTitle: "",
    action: "idle",
    targetId: "",
    aimX: 0,
    aimY: 0,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
    equippedWeaponId: "mace",
    activeAbility: "",
    activeSlot: "",
    activeMs: 0,
    activeDurationMs: 0,
    chargeMs: 0,
    rushDistance: 0,
    abilityVectorX: 1,
    abilityVectorY: 0,
    abilityTickMs: 0,
    abilityHits: "",
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: 0,
    iframeMs: 0,
    castMs: 0,
    damageAmpMs: 0,
    combatFlags: "",
    lastAttackStyle: "",
    visibleCount: 0
  };
}

function regionTargets(): RegionTarget[] {
  return worldAreaCaptureAnchors.map((area) => {
    const anchor = mmoSkillDemoRegionConfig.anchors.find((candidate) => candidate.id === area.id);
    if (!anchor) throw new Error(`Unknown benchmark anchor: ${area.id}`);
    const tile = getMmoSkillDemoAnchorTile(area.id);
    return {
      id: area.id,
      label: area.label,
      zoneId: anchor.zoneId,
      x: (tile.x + 0.5) * mmoSkillDemoRegionConfig.tileSize,
      y: (tile.y + 0.5) * mmoSkillDemoRegionConfig.tileSize
    };
  });
}

function placePlayer(state: MmoSkillDemoState, actor: PlayerEntity, region: RegionTarget) {
  actor.x = region.x;
  actor.y = region.y;
  actor.zoneId = region.zoneId;
  actor.aimX = region.x + 128;
  actor.aimY = region.y;
  actor.escortTargetZoneId = region.zoneId;
  state.tick += 1;
}

function mapViewFor(mode: MapMode) {
  return {
    minimapOpen: mode === "minimap",
    worldMapOpen: mode === "world"
  };
}

function phaseBuckets(): Record<PhaseKey, number[]> {
  return {
    setup: [],
    terrain: [],
    world: [],
    hazards: [],
    effects: [],
    hud: [],
    stage: [],
    map: []
  };
}

function summarizePhases(values: Record<PhaseKey, number[]>): Record<PhaseKey, Summary> {
  return {
    setup: summarize(values.setup),
    terrain: summarize(values.terrain),
    world: summarize(values.world),
    hazards: summarize(values.hazards),
    effects: summarize(values.effects),
    hud: summarize(values.hud),
    stage: summarize(values.stage),
    map: summarize(values.map)
  };
}

function maxPhase(phaseMs: RegionReport["phaseMs"]) {
  let best: PhaseKey = "setup";
  for (const phase of PHASE_KEYS) if (phaseMs[phase].p95 > phaseMs[best].p95) best = phase;
  return best;
}

function maxCalls(calls: Record<string, number[]>) {
  return Object.fromEntries(Object.entries(calls).map(([key, values]) => [key, summarize(values)]));
}

function makeRegionAccumulator(region: RegionTarget): RegionAccumulator {
  return {
    region,
    firstFrameMs: [],
    frameMs: [],
    drawn: [],
    calls: {
      terrain: [],
      world: [],
      hazards: [],
      transientHazards: [],
      effects: [],
      reticle: [],
      hud: []
    },
    phaseMs: phaseBuckets(),
    over16ms: 0,
    over33ms: 0
  };
}

export async function runRegionTeleportBench(cfg = config()): Promise<RegionTeleportBenchReport> {
  validateConfig(cfg);
  setBenchmarkGlobal("__mmoSkillDemoMapPerfExperiment", cfg.experiment);
  setBenchmarkGlobal("__mmoSkillDemoTerrainPerfExperiment", cfg.terrainExperiment);
  setBenchmarkGlobal("__mmoSkillDemoCollectPhaseTelemetry", true);

  const { canvas } = createRenderBenchSurface(cfg.width, cfg.height);
  const status = { textContent: "", hidden: true };
  const renderer = createRenderer(canvas, status, fakeImages(), buildTiles(), () => "p0", undefined, {
    drawDataCaches: cfg.drawDataCaches,
    terrainExperiment: cfg.terrainExperiment
  });
  const state = createMmoSkillDemoState("ashwood");
  state.roomLabel = "Region Teleport Bench";
  const actor = upsertMmoSkillDemoEntity(state, player());
  if (actor.entityType !== "player") throw new Error("Region benchmark failed to create its player entity.");
  const targets = regionTargets();
  const accumulators = new Map(targets.map((region) => [region.id, makeRegionAccumulator(region)]));
  const view = mapViewFor(cfg.map);
  const debug = {
    connected: true,
    playerId: actor.id,
    receivedSnapshots: 1,
    receivedDeltas: 1,
    interpMode: "bench",
    interpDelayMs: 90,
    interpBufferedFrames: 3,
    telemetry: true,
    stateEffects: 0,
    stateHazards: 0
  };

  const firstTarget = targets[0];
  if (!firstTarget) throw new Error("Region benchmark has no capture targets.");
  placePlayer(state, actor, firstTarget);
  for (let frame = 0; frame < cfg.priming; frame += 1) {
    renderer.drawFrame(state, actor, debug, frame * (16.666666666666668), { x: actor.aimX, y: actor.aimY }, undefined, undefined, view);
  }

  let frameIndex = cfg.priming;
  for (let repeat = 0; repeat < cfg.repeats; repeat += 1) {
    for (const region of targets) {
      const acc = accumulators.get(region.id);
      if (!acc) throw new Error(`Missing accumulator for region: ${region.id}`);
      placePlayer(state, actor, region);
      for (let frame = 0; frame < cfg.frames; frame += 1) {
        const timeMs = frameIndex * (16.666666666666668);
        const start = performance.now();
        renderer.drawFrame(state, actor, debug, timeMs, { x: actor.aimX, y: actor.aimY }, undefined, undefined, view);
        const elapsed = performance.now() - start;
        const telemetry = readClientRenderTelemetry();
        acc.frameMs.push(elapsed);
        if (frame === 0) acc.firstFrameMs.push(elapsed);
        if (elapsed > 16.7) acc.over16ms += 1;
        if (elapsed > 33.3) acc.over33ms += 1;
        acc.drawn.push(telemetry?.drawn ?? 0);
        for (const key of CALL_KEYS) acc.calls[key].push(telemetry?.calls[key] ?? 0);
        for (const phase of PHASE_KEYS) acc.phaseMs[phase].push(telemetry?.phaseMs[phase] ?? 0);
        frameIndex += 1;
      }
      await Promise.resolve();
    }
  }

  const regions: RegionReport[] = [...accumulators.values()].map((acc) => {
    const phaseMs = summarizePhases(acc.phaseMs);
    return {
      id: acc.region.id,
      label: acc.region.label,
      zoneId: acc.region.zoneId,
      firstFrameMs: summarize(acc.firstFrameMs),
      frameMs: summarize(acc.frameMs),
      drawn: summarize(acc.drawn),
      calls: maxCalls(acc.calls),
      phaseMs,
      over16ms: acc.over16ms,
      over33ms: acc.over33ms,
      worstPhase: maxPhase(phaseMs)
    };
  });
  const topFields = (region: RegionReport) => ({
    id: region.id,
    label: region.label,
    zoneId: region.zoneId,
    firstFrameMs: region.firstFrameMs,
    frameMs: region.frameMs,
    worstPhase: region.worstPhase
  });
  const report: RegionTeleportBenchReport = {
    createdAt: new Date().toISOString(),
    config: cfg,
    regions,
    worstFirstFrame: [...regions].sort((a, b) => b.firstFrameMs.max - a.firstFrameMs.max).slice(0, 6).map(topFields),
    worstP95: [...regions].sort((a, b) => b.frameMs.p95 - a.frameMs.p95).slice(0, 6).map(topFields)
  };

  mkdirSync(dirname(cfg.out), { recursive: true });
  writeFileSync(cfg.out, `${JSON.stringify(report, null, 2)}\n`);
  console.info(`region teleport ${cfg.experiment}/${cfg.terrainExperiment} ${cfg.map}: worst first=${report.worstFirstFrame[0]?.label ?? "n/a"} ${report.worstFirstFrame[0]?.firstFrameMs.max ?? 0}ms; worst p95=${report.worstP95[0]?.label ?? "n/a"} ${report.worstP95[0]?.frameMs.p95 ?? 0}ms`);
  for (const region of report.worstP95.slice(0, 4)) {
    console.info(`  ${region.label}: p95=${region.frameMs.p95}ms firstMax=${region.firstFrameMs.max}ms phase=${region.worstPhase}`);
  }
  console.info(`report: ${cfg.out}`);
  return report;
}

function validateConfig(cfg: BenchConfig) {
  for (const [name, value, minimum] of [
    ["frames", cfg.frames, 1],
    ["priming", cfg.priming, 0],
    ["repeats", cfg.repeats, 1],
    ["width", cfg.width, 1],
    ["height", cfg.height, 1]
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be a safe integer >= ${minimum}`);
  }
  if (!cfg.out) throw new Error("out must not be empty");
}

if (import.meta.main) await runRegionTeleportBench();
