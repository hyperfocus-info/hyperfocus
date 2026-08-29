import { GROUND_TILE_BASE_HEIGHT, GROUND_TILE_PATCH_AXIS, GROUND_TILE_SIZE, PLAYER_HEIGHT_WORLD, STATIC_VISIBILITY_RADIUS, TERRAIN_CACHE_KEY_STRIDE, TERRAIN_GRADIENT_SAMPLE, TERRAIN_HEIGHT_CACHE_MAX_ENTRIES, TERRAIN_HEIGHT_CACHE_STEP, TERRAIN_HILL_FREQUENCY, TERRAIN_HILL_HEIGHT, TERRAIN_MOUNTAIN_HEIGHT, TERRAIN_PLATFORM_CELL_CACHE_MAX_ENTRIES, TERRAIN_PLATFORM_CELL_SIZE, TERRAIN_PLATFORM_DENSITY, TERRAIN_PLATFORM_EDGE_PAD, TERRAIN_PLATFORM_HEIGHT_MAX, TERRAIN_PLATFORM_HEIGHT_MIN, TERRAIN_PLATFORM_RADIUS_MAX, TERRAIN_PLATFORM_RADIUS_MIN, TERRAIN_START_CLEAR_RADIUS, TRAVERSAL_TOOL_COOLDOWN_SECONDS, TRAVERSAL_TOOL_COUNT, TRAVERSAL_TOOL_TRIGGER_RADIUS, TRAVERSAL_TOOL_TYPES } from "./constants.ts";
import type * as Three from "three";
import { runtimeCallback } from "./runtime-ports.ts";
const setActorPosition = runtimeCallback("actorAnimation", "setActorPosition");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const clamp01 = runtimeCallback("hud", "clamp01");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const capActorHorizontalSpeed = runtimeCallback("playerUpdate", "capActorHorizontalSpeed");
const playerJumpStats = runtimeCallback("playerUpdate", "playerJumpStats");
const playerJumpVelocity = runtimeCallback("playerUpdate", "playerJumpVelocity");
const playerMomentumMaxSpeed = runtimeCallback("playerUpdate", "playerMomentumMaxSpeed");
const addHazard = runtimeCallback("props", "addHazard");
const revealLazyProps = runtimeCallback("props", "revealLazyProps");
const spawnFloatingText = runtimeCallback("rewardFeedback", "spawnFloatingText");
const createIndicatorMaterial = runtimeCallback("sceneSetup", "createIndicatorMaterial");
const getWorldSize = runtimeCallback("worldMath", "getWorldSize");
const renderPosition = runtimeCallback("worldMath", "renderPosition");
const worldDelta = runtimeCallback("worldMath", "worldDelta");
const worldDistanceSquared = runtimeCallback("worldMath", "worldDistanceSquared");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import { state } from "./arena-state.ts";
import { THREE } from "./boot-and-dom.ts";
import { data } from "./content-runtime.ts";
import { scene } from "./runtime-context.ts";
import type { TerrainPlatformCell, TraversalHeightDelta, TraversalSpawn, TraversalTool, TraversalToolType, WorldActor } from "./runtime-types.ts";
import { terrainSeed } from "./terrain-math.ts";

export { terrainSeed } from "./terrain-math.ts";

export function setupArena(): void {
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

export function addLoopGroundCopies(sourceGround: Three.Mesh, worldSize: number): void {
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

export function addLoopBoundary(worldSize: number): void {
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

export function addGroundTileField(): void {
  const palette = [0x26352f, 0x293832, 0x243437, 0x30372f];
  const platformPalette = [0x4b525d, 0x515964, 0x474f5a];
  const geometry = new THREE.BoxGeometry(GROUND_TILE_SIZE * 0.985, GROUND_TILE_BASE_HEIGHT, GROUND_TILE_SIZE * 0.985);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, emissive: 0x030807, emissiveIntensity: 0.06, transparent: true, opacity: 0.68 });
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

export function updateGroundTilePatch(force = false): void {
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
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, jitter * 0.025, 0)),
        new THREE.Vector3(1, thickness / GROUND_TILE_BASE_HEIGHT, 1)
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

export function tileJitter(gx: number, gz: number): number {
  return Math.sin(gx * 17.13 + gz * 4.77);
}

export function terrainBaseHeightAt(x: number, z: number): number {
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

export function terrainPlatformCellAt(gx: number, gz: number): TerrainPlatformCell | null {
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

export function terrainPlatformHeightAt(x: number, z: number): number | null {
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

export function terrainHeightAt(x: number, z: number): number {
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

export function actorGroundHeight(actor: WorldActor | null | undefined): number {
  if (!actor) return 0;
  if (actor !== state.player && typeof actor.groundY === "number" && Number.isFinite(actor.groundY)) return actor.groundY;
  const groundY = terrainHeightAt(actor.x ?? 0, actor.z ?? 0);
  if (actor !== state.player) actor.groundY = groundY;
  return groundY;
}

export function actorFeetY(actor: WorldActor | null | undefined): number {
  if (!actor) return 0;
  return actorGroundHeight(actor) + (actor.jumpY ?? 0);
}

export function actorVerticalHeight(actor: WorldActor | null | undefined): number {
  return PLAYER_HEIGHT_WORLD * Math.max(0.45, actor?.scale ?? 1);
}

export function verticalRangesOverlap(minA: number, maxA: number, minB: number, maxB: number, pad = 0.12): boolean {
  return minA <= maxB + pad && maxA >= minB - pad;
}

export function actorsOverlapY(a: WorldActor, b: WorldActor, pad = 0.24): boolean {
  const aMin = actorFeetY(a);
  const bMin = actorFeetY(b);
  return verticalRangesOverlap(aMin, aMin + actorVerticalHeight(a), bMin, bMin + actorVerticalHeight(b), pad);
}

export function terrainGradientAt(x: number, z: number, sample = TERRAIN_GRADIENT_SAMPLE): { x: number; z: number; ratio: number; angle: number } {
  const sx = Math.max(0.4, sample);
  const sz = Math.max(0.4, sample);
  const gx = (terrainHeightAt(wrapWorld(x + sx), z) - terrainHeightAt(wrapWorld(x - sx), z)) / (sx * 2);
  const gz = (terrainHeightAt(x, wrapWorld(z + sz)) - terrainHeightAt(x, wrapWorld(z - sz))) / (sz * 2);
  return { x: gx, z: gz, ratio: Math.hypot(gx, gz), angle: Math.atan(Math.hypot(gx, gz)) };
}

export function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function addTraversalTools(): void {
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

export function buildTraversalToolSpawns(count: number): TraversalSpawn[] {
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

export function largestHeightDeltaAround(x: number, z: number): TraversalHeightDelta {
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

export function selectSeparatedTraversalSpawns(
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

export function traversalToolColor(type: TraversalToolType): string {
  if (type === "spring") return "#bff7ff";
  if (type === "floatPlatform") return "#d7ff8d";
  if (type === "zipline") return "#ffd27a";
  if (type === "teleporter") return "#d6b2ff";
  return "#9fe8ff";
}

export function createTraversalToolVisual(type: TraversalToolType, colorValue: Three.ColorRepresentation): Three.Group {
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

export function updateTraversalTools(dt: number): void {
  for (const tool of state.traversalTools) {
    tool.cooldown = Math.max(0, (tool.cooldown ?? 0) - dt);
    updateTraversalToolVisual(tool, dt);
    if (!state.running || !state.player || state.player.hp <= 0 || tool.cooldown > 0) continue;
    if (worldDistanceSquared(state.player.x, state.player.z, tool.x, tool.z) > tool.radius * tool.radius) continue;
    activateTraversalTool(tool);
  }
}

export function updateTraversalToolVisuals(dt = 0): void {
  for (const tool of state.traversalTools) updateTraversalToolVisual(tool, dt);
}

export function updateTraversalToolVisual(tool: TraversalTool, dt = 0, force = false): void {
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

export function traversalToolYOffset(type: TraversalToolType): number {
  if (type === "zipline") return 0.06;
  if (type === "floatPlatform") return 1.05;
  if (type === "teleporter") return 0.08;
  return 0.04;
}

export function traversalToolRotationSpeed(type: TraversalToolType): number {
  if (type === "spring") return 1.2;
  if (type === "teleporter") return 1.55;
  if (type === "windLift") return 0.9;
  return 0.2;
}

export function activateTraversalTool(tool: TraversalTool): void {
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

export function traversalToolLabel(type: TraversalToolType): string {
  if (type === "spring") return "SPRING";
  if (type === "floatPlatform") return "FLOAT";
  if (type === "zipline") return "ZIP";
  if (type === "teleporter") return "BLINK";
  return "LIFT";
}
