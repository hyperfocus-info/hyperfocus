import type { ThreeArenaPlayerMotionSnapshot } from "../player-motion.ts";
import { GROUND_TILE_PATCH_AXIS, MAGNET_DROP_CHANCE, MAGNET_PICKUP_SECONDS, PLAYER_GRAVITY_BASE, PLAYER_MOMENTUM_DAMP_SECONDS, PLAYER_MOMENTUM_DUST_THRESHOLD, TELEMETRY_FRAME_BUDGET_MS, TELEMETRY_PHASE_NAMES, TELEMETRY_SAMPLE_COUNT, TELEMETRY_UPDATE_INTERVAL } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const getEnemyDamageTable = runtimeCallback("spawnAndDamage", "getEnemyDamageTable");
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const round = runtimeCallback("hud", "round");
const playerGravity = runtimeCallback("playerUpdate", "playerGravity");
const playerJumpStats = runtimeCallback("playerUpdate", "playerJumpStats");
const playerMomentumMaxSpeed = runtimeCallback("playerUpdate", "playerMomentumMaxSpeed");
const buildPhaseTelemetrySnapshot = runtimeCallback("telemetryStats", "buildPhaseTelemetrySnapshot");
const formatFps = runtimeCallback("telemetryStats", "formatFps");
const formatMs = runtimeCallback("telemetryStats", "formatMs");
const metricStats = runtimeCallback("telemetryStats", "metricStats");
const positiveMetricStats = runtimeCallback("telemetryStats", "positiveMetricStats");
const readHeapBytes = runtimeCallback("telemetryStats", "readHeapBytes");
const recordSlowFrame = runtimeCallback("telemetryStats", "recordSlowFrame");
const skippedFramesFromGap = runtimeCallback("telemetryStats", "skippedFramesFromGap");
import { state } from "./arena-state.ts";
import { camera, cameraRigSnapshot, renderer } from "./runtime-context.ts";
import { telemetry } from "./telemetry-core.ts";
import { ui } from "./user-interface.ts";
import type { TelemetrySample } from "./telemetry-types.ts";

export function recordTelemetry(sample: TelemetrySample, dt: number): void {
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

export function updateTelemetryPanel(): void {
  if (!ui.telemetryPanel || telemetry.count === 0) return;
  const snapshot = getTelemetrySnapshot();
  const counters = snapshot.counters;
  const renderStats = snapshot.render;
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

export function playerEngineMotionSnapshot(
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

export function getTelemetrySnapshot() {
  const metricSeries = telemetry.metrics.snapshot().series;
  const info = renderer.info;
  const memory = info.memory;
  const renderInfo = info.render;
  const heapBytes = readHeapBytes();
  const heap = heapBytes > 0 ? `${Math.round(heapBytes / 1048576)}mb` : "n/a";
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
    heapBytes: heapBytes > 0 ? heapBytes : null,
    perfFlags: { ...PERF_FLAGS },
    time: state.time,
    running: state.running
  };
}
