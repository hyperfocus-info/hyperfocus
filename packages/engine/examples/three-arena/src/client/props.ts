import { CAMERA_VIEW_RADIUS, LAZY_PROP_AHEAD_DOT, LAZY_PROP_AHEAD_RADIUS, LAZY_PROP_INITIAL_RADIUS, LAZY_PROP_NEAR_RADIUS, LAZY_PROP_REVEAL_BUDGET, PLAYER_RADIUS, PROP_COLLISION_PUSH_EPSILON, PROP_READABILITY_SCALE, STATIC_PROP_LOD_LOW_DISTANCE, STATIC_PROP_LOD_MID_DISTANCE, STATIC_VISIBILITY_QUERY_RADIUS, STATIC_VISIBILITY_RADIUS, STATIC_WRAP_MOVE_THRESHOLD, STATIC_WRAP_UPDATE_INTERVAL } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const actorFeetY = runtimeCallback("terrain", "actorFeetY");
const actorVerticalHeight = runtimeCallback("terrain", "actorVerticalHeight");
const terrainBaseHeightAt = runtimeCallback("terrain", "terrainBaseHeightAt");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const updateTraversalToolVisuals = runtimeCallback("terrain", "updateTraversalToolVisuals");
const verticalRangesOverlap = runtimeCallback("terrain", "verticalRangesOverlap");
const clamp = runtimeCallback("hud", "clamp");
const preparePropOccluderMaterials = runtimeCallback("networkAndCamera", "preparePropOccluderMaterials");
const distanceSquared = runtimeCallback("worldMath", "distanceSquared");
const renderPositionInto = runtimeCallback("worldMath", "renderPositionInto");
const worldDeltaInto = runtimeCallback("worldMath", "worldDeltaInto");
const wrapEntity = runtimeCallback("worldMath", "wrapEntity");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import { clonePreparedThreeObject, prepareThreeObject3D } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { THREE } from "./boot-and-dom.ts";
import { data, toroidalWorld } from "./content-runtime.ts";
import { cameraRigSnapshot, cameraYaw, scene, tempRenderPosition, tempWorldDelta } from "./runtime-context.ts";
import { measureTelemetryPhase } from "./telemetry-core.ts";
import type { ArenaPropDefinition, HazardDefinition } from "./content-types.ts";
import type { BoxCollider, CircleCollider, PropCollider, PropCollisionItem, WorldActor, WorldDelta, WorldPoint } from "./runtime-types.ts";

export function addHazard(hazard: HazardDefinition): void {
  const color = hazard.kind === "rotMist" || hazard.kind === "graveGas" ? 0x79c864 : 0xb9a86c;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(hazard.radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  const position = renderPositionInto(tempRenderPosition, hazard.x, hazard.z);
  mesh.position.set(position.x, terrainBaseHeightAt(hazard.x, hazard.z) + 0.05, position.z);
  scene.add(mesh);
  state.hazards.push({ ...hazard, mesh, seed: Math.random() * 30, damageClock: 0 });
}

export function addFallbackProp(prop: ArenaPropDefinition): void {
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

export function addPropGlow(prop: ArenaPropDefinition, parent: Three.Object3D): void {
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

export function updatePropGlows(): void {
  const props = PERF_FLAGS.staticPropBsp ? state.visibleStaticProps : state.props;
  for (const prop of props) {
    const light = prop.userData?.light;
    if (!(light instanceof THREE.PointLight)) continue;
    const baseIntensity = typeof light.userData.baseIntensity === "number" ? light.userData.baseIntensity : 1;
    const seed = typeof light.userData.seed === "number" ? light.userData.seed : 0;
    light.intensity = baseIntensity * (0.86 + Math.sin(state.time * 5.2 + seed) * 0.14);
  }
}

export function revealLazyProps(options: { initial?: boolean; force?: boolean } = {}): void {
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

export function resetLazyProps(): void {
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

export function revealAllPendingProps(): void {
  while (state.pendingProps.length) {
    const prop = state.pendingProps.pop();
    if (prop) materializeProp(prop);
  }
  updateWrappedStaticVisuals(0, true);
}

export function getLazyPropHeading(): WorldPoint {
  const player = state.player;
  const vx = player?.moveMomentumX ?? 0;
  const vz = player?.moveMomentumZ ?? 0;
  const speed = Math.hypot(vx, vz);
  if (speed > 0.12) return { x: vx / speed, z: vz / speed };
  const yaw = cameraRigSnapshot?.yaw ?? cameraYaw;
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function materializeProp(prop: ArenaPropDefinition): void {
  const source = state.propAssetMode === "model" ? state.modelCache.get(prop.model) : null;
  if (!source) {
    addFallbackProp(prop);
    return;
  }
  addModelPropClone(prop, source);
}

export function addModelPropClone(prop: ArenaPropDefinition, source: Three.Object3D): void {
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

export function attachStaticPropLodGeometries(root: Three.Object3D): void {
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

export function resolvePropScale(prop: ArenaPropDefinition): number {
  const model = String(prop.model ?? "").toLowerCase();
  let category = 1;
  if (model.includes("grave") || model.includes("stone")) category = 0.72;
  if (model.includes("crypt")) category = 1.2;
  if (model.includes("ruin")) category = 1.0;
  if (model.includes("coffin")) category = 1.65;
  if (model.includes("pine") || model.includes("tree")) category = 0.8;
  if (model.includes("rock")) category = 2.1;
  if (model.includes("grass")) category = 4.25;
  if (model.includes("pumpkin")) category = 4;
  if (model.includes("lantern") || model.includes("campfire") || model.includes("barrel")) category = 3.8;
  if (!model.includes("ruin") && (model.includes("fence") || model.includes("wall") || model.includes("doorway"))) category = 0.9;
  if (model.includes("shovel") || model.includes("tool")) category = 4.35;
  return (prop.scale ?? 1) * PROP_READABILITY_SCALE * category;
}

export function configurePropCollision(prop: ArenaPropDefinition, object: Three.Object3D): void {
  object.userData = object.userData ?? {};
  object.userData.model = prop.model;
  object.userData.sourceProp = prop;
  object.userData.worldX = prop.x;
  object.userData.worldZ = prop.z;
  object.userData.groundY = terrainHeightAt(prop.x, prop.z);
  object.userData.collider = resolvePropCollider(prop);
  registerPropCollisionItem(object, prop.x, prop.z, object.userData.collider);
}

export function resolvePropCollider(prop: ArenaPropDefinition): PropCollider {
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

export function resetPropCollisionIndex(): void {
  state.propCollisionItems.length = 0;
  state.propCollisionGrid.clear();
  state.propCollisionGridDirty = true;
}

export function resetPropVisibilityIndex(): void {
  state.propVisibilityBsp.clear();
  state.propVisibilityCandidates.length = 0;
  state.visibleStaticProps.clear();
  state.nextVisibleStaticProps.clear();
  state.propVisibilityBspDirty = true;
}

export function rebuildPropVisibilityBsp(): void {
  const items = state.props.map((prop) => {
    const center: [number, number, number] = [
      prop.userData?.worldX ?? prop.position.x,
      0,
      prop.userData?.worldZ ?? prop.position.z,
    ];
    return { value: prop, center };
  });
  state.propVisibilityBsp.rebuild(items);
  state.propVisibilityBspDirty = false;
}

export function updateStaticPropVisibility(): void {
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

export function updateStaticPropVisibilityByScan(): void {
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

export function showStaticProp(prop: Three.Object3D, delta: WorldDelta): void {
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

export function updateStaticPropLod(prop: Three.Object3D, distance: number): void {
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

export function setPropVisible(prop: Three.Object3D, visible: boolean): void {
  prop.visible = visible;
  const light = prop.userData?.light;
  if (light instanceof THREE.Object3D) light.visible = visible;
}

export function registerPropCollisionItem(prop: Three.Object3D, worldX: number, worldZ: number, collider: PropCollider): void {
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

export function resolvePropCollisionRadius(collider: PropCollider): number {
  return collider.kind === "box"
    ? Math.hypot(collider.halfX ?? 1, collider.halfZ ?? 1)
    : collider.radius ?? 1;
}

export function rebuildPropCollisionGrid(): void {
  state.propCollisionGrid.rebuild(state.propCollisionItems);
  state.propCollisionGridDirty = false;
}

export function queryPropCollisionItems(actor: WorldActor, actorRadius: number): PropCollisionItem[] | null {
  if (!PERF_FLAGS.propCollisionGrid) return null;
  if (state.propCollisionGridDirty) rebuildPropCollisionGrid();
  if (!state.propCollisionGrid.size()) return [];
  return state.propCollisionGrid.queryCircle({
    x: actor.x,
    y: actor.z,
    radius: actorRadius + PROP_COLLISION_PUSH_EPSILON
  }, state.propCollisionCandidates);
}

export function resolvePropCollisions(actor: WorldActor): void {
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

export function actorOverlapsPropY(actor: WorldActor, propX: number, propZ: number, collider: PropCollider): boolean {
  const propBase = typeof collider.baseY === "number" && Number.isFinite(collider.baseY) ? collider.baseY : terrainHeightAt(propX, propZ);
  const propTop = typeof collider.topY === "number" && Number.isFinite(collider.topY) ? collider.topY : propBase + Math.max(0.1, collider.height);
  const actorBase = actorFeetY(actor);
  const actorTop = actorBase + actorVerticalHeight(actor);
  return verticalRangesOverlap(actorBase, actorTop, propBase, propTop, 0.18);
}

export function resolveCirclePropCollision(actor: WorldActor, actorRadius: number, propX: number, propZ: number, collider: CircleCollider): void {
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

export function resolveBoxPropCollision(actor: WorldActor, actorRadius: number, propX: number, propZ: number, collider: BoxCollider): void {
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

export function updateWrappedStaticVisuals(dt = 0, force = false): void {
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
