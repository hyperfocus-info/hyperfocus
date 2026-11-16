import { isObject as isRecord } from "@hyperfocus/utilities/records";
import { TELEMETRY_FRAME_BUDGET_MS, TELEMETRY_PHASE_NAMES, TERRAIN_PLATFORM_CELL_SIZE, TERRAIN_PLATFORM_LAND_SNAP } from "./constants.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const actorFeetY = runtimeCallback("terrain", "actorFeetY");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const terrainPlatformCellAt = runtimeCallback("terrain", "terrainPlatformCellAt");
const getWorldSize = runtimeCallback("worldMath", "getWorldSize");
const setActorPosition = runtimeCallback("actorAnimation", "setActorPosition");
const round = runtimeCallback("hud", "round");
const resolvePlayerTerrainMotion = runtimeCallback("playerUpdate", "resolvePlayerTerrainMotion");
const startGame = runtimeCallback("runLifecycle", "startGame");
import type { MetricSummary } from "@hyperfocus/engine";
import { state } from "./arena-state.ts";
import { telemetry } from "./telemetry-core.ts";
import type { PositiveSampleStats, SampleStats, TelemetrySample } from "./telemetry-types.ts";

export function resetTelemetrySamples(): void {
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

export function findPlatformLandingProbe() {
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

export function runPlatformLandingProbe() {
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
  resolvePlayerTerrainMotion(player, probe.beforeX, probe.beforeZ, beforeFeetY, 0.016666666666666666);
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

export function readHeapBytes(): number {
  const memory: unknown = Reflect.get(performance, "memory");
  return isRecord(memory) && typeof memory.usedJSHeapSize === "number" ? memory.usedJSHeapSize : 0;
}



export function recordSlowFrame(sample: TelemetrySample, topPhase: string, topPhaseMs: number, heapDeltaBytes: number): void {
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

export function skippedFramesFromGap(frameGapMs: number): number {
  if (!Number.isFinite(frameGapMs) || frameGapMs <= TELEMETRY_FRAME_BUDGET_MS * 1.5) return 0;
  return Math.max(0, Math.floor(frameGapMs / TELEMETRY_FRAME_BUDGET_MS) - 1);
}

export function buildPhaseTelemetrySnapshot(series: Record<string, MetricSummary>): Record<string, SampleStats> {
  const result: Record<string, SampleStats> = {};
  for (const name of TELEMETRY_PHASE_NAMES) result[name] = metricStats(series[`phase.${name}.ms`]);
  return result;
}

export function metricStats(summary: MetricSummary | undefined): SampleStats {
  if (!summary) return { p50: 0, p95: 0, p99: 0, avg: 0, max: 0 };
  return {
    p50: summary.p50,
    p95: summary.p95,
    p99: summary.p99,
    avg: summary.average,
    max: summary.max,
  };
}

export function positiveMetricStats(summary: MetricSummary | undefined): PositiveSampleStats {
  return { ...metricStats(summary), count: summary?.count ?? 0 };
}

export function formatMs(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

export function formatFps(frameMs: number): string {
  return frameMs > 0 ? String(Math.round(1000 / frameMs)) : "0";
}
