import { PARTICLE_POOL_CAPACITY } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const cachedGeometry = runtimeCallback("contentUi", "cachedGeometry");
const forEachObjectMaterial = runtimeCallback("contentUi", "forEachObjectMaterial");
const getDamageWedgeGeometry = runtimeCallback("effectsMaterials", "getDamageWedgeGeometry");
const getLineEffectMaterial = runtimeCallback("effectsMaterials", "getLineEffectMaterial");
const getEffectGeometry = runtimeCallback("renderCache", "getEffectGeometry");
const getEffectMaterial = runtimeCallback("renderCache", "getEffectMaterial");
const getSparkGeometry = runtimeCallback("renderCache", "getSparkGeometry");
const getSparkMaterial = runtimeCallback("renderCache", "getSparkMaterial");
const createIndicatorMaterial = runtimeCallback("sceneSetup", "createIndicatorMaterial");
const angleTo = runtimeCallback("worldMath", "angleTo");
const getConeGeometry = runtimeCallback("worldMath", "getConeGeometry");
const getRingGeometry = runtimeCallback("worldMath", "getRingGeometry");
const renderPosition = runtimeCallback("worldMath", "renderPosition");
const renderPositionInto = runtimeCallback("worldMath", "renderPositionInto");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { THREE } from "./boot-and-dom.ts";
import { camera, scene, tempColor, tempMatrix, tempQuaternion, tempRenderPosition, tempScale, tempVec } from "./runtime-context.ts";
import { measureTelemetryPhase, telemetry } from "./telemetry-core.ts";
import type { BatchedParticle, EffectKind, EffectOptions, ParticlePool, PlayerDamageOptions, SceneSpark, SparkOptions, WorldPosition3D } from "./runtime-types.ts";

export function getBatchedParticlePool(create = true): ParticlePool | null {
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

export function clearBatchedParticles(): void {
  const pool = getBatchedParticlePool(false);
  if (!pool) return;
  pool.count = 0;
  pool.mesh.count = 0;
  pool.mesh.instanceMatrix.needsUpdate = true;
}

export function spawnBatchedEffect(kind: EffectKind, x: number, z: number, life: number, options: EffectOptions = {}): void {
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

export function addBatchedParticle(particle: BatchedParticle): boolean {
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

export function updateBatchedParticles(dt: number): void {
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

export function removeBatchedParticle(index: number): void {
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

export function spawnEffect(kind: EffectKind, x: number, z: number, life: number, options: EffectOptions = {}): void {
  telemetry.effectCreates += 1;
  if (PERF_FLAGS.batchParticles) {
    measureTelemetryPhase("particleSpawnBatched", () => spawnBatchedEffect(kind, x, z, life, options));
    return;
  }
  measureTelemetryPhase("particleSpawnScene", () => spawnSceneEffect(kind, x, z, life, options));
}

export function spawnSceneEffect(kind: EffectKind, x: number, z: number, life: number, options: EffectOptions = {}): void {
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

export function particlesForEffect(kind: EffectKind, options: EffectOptions = {}): number {
  return Math.max(1, Math.floor(options.particles ?? (kind === "airTrail" ? 1 : kind === "jumpDust" ? 12 : 14)));
}

export function createSparks(
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

export function setEffectOpacity(mesh: Three.Object3D, opacity: number): void {
  mesh.traverse((child) => forEachObjectMaterial(child, (material) => {
    material.transparent = true;
    const opacityBase = typeof material.userData?.opacityBase === "number" ? material.userData.opacityBase : 1;
    material.opacity = opacity * opacityBase;
  }));
}

export function spawnPulseRing(x: number, z: number, colorValue: Three.ColorRepresentation = "#caff78", life = 0.36, baseScale = 1, expand = 3.2): void {
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

export function spawnBeamPreview(muzzle: WorldPosition3D, angle: number, length: number, colorValue: Three.ColorRepresentation = "#ffd782"): void {
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

export function spawnDamageDirectionWedge(options: PlayerDamageOptions = {}): void {
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
