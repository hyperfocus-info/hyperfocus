import { runtimeThreeModules, THREE } from "./boot-and-dom.ts";
import { LARGE_IMPORT_TARGET_MAX_DIMENSION, OPTIONAL_MODEL_UPGRADE_BUDGET_MS, RUIN_IMPORT_TARGET_MAX_DIMENSION, STATIC_PROP_LOD_LOW_RATIO, STATIC_PROP_LOD_MID_RATIO } from "./constants.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const isArenaPropDefinition = runtimeCallback("contentUi", "isArenaPropDefinition");
const materializeProp = runtimeCallback("props", "materializeProp");
const resetPropCollisionIndex = runtimeCallback("props", "resetPropCollisionIndex");
const resetPropVisibilityIndex = runtimeCallback("props", "resetPropVisibilityIndex");
const updateWrappedStaticVisuals = runtimeCallback("props", "updateWrappedStaticVisuals");
const getEffectMaterial = runtimeCallback("renderCache", "getEffectMaterial");
const cloneCachedModel = runtimeCallback("weaponVisuals", "cloneCachedModel");
const createWeaponVisual = runtimeCallback("weaponVisuals", "createWeaponVisual");
const getPlayerWeaponHandPosition = runtimeCallback("weaponVisuals", "getPlayerWeaponHandPosition");
const angleTo = runtimeCallback("worldMath", "angleTo");
import { PERF_FLAGS } from "./environment.ts";
import { telemetry } from "./telemetry-core.ts";
import { loadFirstThreeAsset, loadThreeLoaderAsset, prepareThreeObject3D, simplifyThreeBufferGeometry } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { modelPaths, pickupModelPaths, universalAnimationPaths, weaponModelPaths } from "./asset-catalog.ts";
import { data } from "./content-runtime.ts";
import { fbxLoader, gltfLoader, modelTextureOverride, pointer, renderContext, scene } from "./runtime-context.ts";
import type { ArenaPropDefinition, StatLevelChoice } from "./content-types.ts";
import type { Pickup } from "./runtime-types.ts";

export async function loadOptionalModels(): Promise<void> {
  state.optionalModelsLoading = true;
  state.optionalModelsReady = false;
  try {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      const normalized = url.replace(/\\/g, "/");
      if (normalized.toLowerCase().includes("colormap.png")) {
        return new URL(modelTextureOverride, location.href).href;
      }
      return url;
    });
    renderContext.gltfLoader = new runtimeThreeModules.GLTFLoader(manager);
    if (!fbxLoader) renderContext.fbxLoader = new runtimeThreeModules.FBXLoader();
  } catch {
    state.optionalModelsLoading = false;
    state.optionalModelsReady = true;
    return;
  }
  try {
    for (const [name, paths] of Object.entries(modelPaths)) {
      const model = await loadFirstModel(paths);
      if (model) state.modelCache.set(name, model);
    }
    await bakeStaticPropLodSources();
    for (const [id, paths] of Object.entries(weaponModelPaths)) {
      const model = await loadFirstModel(paths);
      if (model) state.modelCache.set(`weapon:${id}`, model);
    }
    for (const [kind, paths] of Object.entries(pickupModelPaths)) {
      const model = await loadFirstModel(paths);
      if (model) state.modelCache.set(`pickup:${kind}`, model);
    }
    await loadUniversalAnimationMetadata();
    if (PERF_FLAGS.staticModelProps && state.modelCache.size) {
      const loadedProps = state.props
        .map((prop) => prop.userData?.sourceProp)
        .filter(isArenaPropDefinition);
      beginOptionalModelUpgrade(loadedProps);
      if (!state.running) continueOptionalModelUpgrade();
    }
  } finally {
    state.optionalModelsLoading = false;
    state.optionalModelsReady = true;
  }
}

export function beginOptionalModelUpgrade(loadedProps: ArenaPropDefinition[]): void {
  if (!loadedProps.length) return;
  state.pendingModelUpgrade = true;
  state.pendingModelUpgradeProps = loadedProps;
  state.pendingModelUpgradeIndex = 0;
}

export function continueOptionalModelUpgrade(force = false): void {
  if (!state.pendingModelUpgrade || state.running) return;
  const started = performance.now();
  if (state.pendingModelUpgradeIndex === 0) {
    state.propAssetMode = "model";
    for (const loaded of state.props) {
      if (loaded.userData?.light) scene.remove(loaded.userData.light);
      scene.remove(loaded);
    }
    state.props.length = 0;
    resetPropCollisionIndex();
    resetPropVisibilityIndex();
  }
  while (state.pendingModelUpgradeIndex < state.pendingModelUpgradeProps.length) {
    materializeProp(state.pendingModelUpgradeProps[state.pendingModelUpgradeIndex]);
    state.pendingModelUpgradeIndex += 1;
    if (!force && performance.now() - started >= OPTIONAL_MODEL_UPGRADE_BUDGET_MS) return;
  }
  state.pendingModelUpgrade = false;
  state.pendingModelUpgradeProps = [];
  state.pendingModelUpgradeIndex = 0;
  updateWrappedStaticVisuals(0, true);
  refreshDynamicAssetVisuals();
  warmSceneShaders();
}

export function warmSceneShaders(): void {
  // Full-scene compile can block the main thread for seconds after optional model swaps.
  // Let shaders compile with the incremental render path instead.
}

export function loadFirstModel(paths: readonly string[]): Promise<Three.Object3D | null> {
  return loadFirstThreeAsset(paths, loadModel, { fallback: null });
}

export async function loadModel(path: string): Promise<Three.Object3D> {
  if (path.endsWith(".fbx")) return loadFbxModel(path);
  renderContext.modelTextureOverride = path.includes("/props/kenney/") ? "assets/usable/textures/kenney/survival-variation-a.png" : "assets/usable/textures/kenney/graveyard-colormap.png";
  if (!gltfLoader) throw new Error("GLTFLoader unavailable");
  const gltf = await loadThreeLoaderAsset(gltfLoader, path);
  prepareImportedModel(gltf.scene, path);
  return gltf.scene;
}

export async function loadFbxModel(path: string): Promise<Three.Object3D> {
  if (!fbxLoader) return Promise.reject(new Error("FBXLoader unavailable"));
  const model = await loadThreeLoaderAsset(fbxLoader, path);
  prepareImportedModel(model, path);
  return model;
}

export function prepareImportedModel(model: Three.Object3D, path: string): void {
  const texture = path.includes("/ruin-low-poly/") ? state.textures.ruin : path.includes("/treasure-low-poly/") ? state.textures.treasure : null;
  prepareThreeObject3D(model, {
    castShadow: true,
    receiveShadow: true,
    material: () => {
      if (!texture) return undefined;
      return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.78, metalness: path.includes("/treasure-low-poly/") ? 0.18 : 0.04 });
    }
  });
  normalizeLargeImportedProp(model, path);
}

export async function bakeStaticPropLodSources(): Promise<void> {
  state.propLodGeometries.clear();
  state.propLodStats = { ready: false, sources: 0, geometries: 0, skipped: 0, ms: 0 };
  if (!PERF_FLAGS.staticPropLod) {
    state.propLodStats.ready = true;
    return;
  }
  const started = performance.now();
  const geometryCache = new Map<Three.BufferGeometry, {
    high: Three.BufferGeometry;
    mid: Promise<Three.BufferGeometry>;
    low: Promise<Three.BufferGeometry>;
  }>();
  const propModels = new Set(data.props.map((prop) => prop.model));
  for (const modelName of propModels) {
    const high = state.modelCache.get(modelName);
    if (!high?.traverse) continue;
    await waitForIdleBakeSlice();
    const baked = await bakeStaticPropGeometryLods(high, geometryCache);
    state.propLodStats.sources += 1;
    state.propLodStats.geometries += baked.geometries;
    state.propLodStats.skipped += baked.skipped;
  }
  state.propLodStats.ready = true;
  state.propLodStats.ms = Math.round((performance.now() - started) * 10) / 10;
}

export async function bakeStaticPropGeometryLods(
  source: Three.Object3D,
  geometryCache: Map<Three.BufferGeometry, {
    high: Three.BufferGeometry;
    mid: Promise<Three.BufferGeometry>;
    low: Promise<Three.BufferGeometry>;
  }>
): Promise<{ geometries: number; skipped: number }> {
  const jobs: Promise<void>[] = [];
  let geometries = 0;
  let skipped = 0;
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry) || !child.geometry.attributes.position) return;
    const original = child.geometry;
    if (state.propLodGeometries.has(original)) return;
    let baked = geometryCache.get(original);
    if (!baked) {
      baked = {
        high: original,
        mid: simplifyStaticPropGeometry(original, STATIC_PROP_LOD_MID_RATIO),
        low: simplifyStaticPropGeometry(original, STATIC_PROP_LOD_LOW_RATIO)
      };
      geometryCache.set(original, baked);
    }
    jobs.push(Promise.all([baked.mid, baked.low]).then(([mid, low]) => {
      state.propLodGeometries.set(original, { high: original, mid, low });
      geometries += Number(mid !== original) + Number(low !== original);
      skipped += Number(mid === original) + Number(low === original);
    }));
  });
  await Promise.all(jobs);
  return { geometries, skipped };
}

export function simplifyStaticPropGeometry(geometry: Three.BufferGeometry, ratio: number): Promise<Three.BufferGeometry> {
  return simplifyThreeBufferGeometry(geometry, {
    ratio,
    targetError: ratio <= STATIC_PROP_LOD_LOW_RATIO ? 0.8 : 0.35,
    preserveGroups: true,
    computeVertexNormals: true,
    computeBounds: true
  }).catch(() => geometry);
}

export function waitForIdleBakeSlice(): Promise<void> {
  if (typeof requestIdleCallback === "function") {
    return new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 32 }));
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function normalizeLargeImportedProp(model: Three.Object3D, path: string): void {
  model.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const targetMaxDimension = path.includes("/ruin-low-poly/")
    ? RUIN_IMPORT_TARGET_MAX_DIMENSION
    : maxDimension > 12
      ? LARGE_IMPORT_TARGET_MAX_DIMENSION
      : null;
  if (!targetMaxDimension || !Number.isFinite(maxDimension) || maxDimension <= targetMaxDimension) return;
  const importScale = targetMaxDimension / maxDimension;
  model.userData = model.userData ?? {};
  model.userData.importScale = importScale;
  model.userData.originalMaxDimension = maxDimension;
  model.scale.multiplyScalar(importScale);
  model.updateMatrixWorld?.(true);
}

export async function loadUniversalAnimationMetadata(): Promise<void> {
  if (!gltfLoader || !state.actorAssets || state.actorAssets.universalClipNames?.length) return;
  const names: string[] = [];
  for (const path of universalAnimationPaths) {
    try {
      const gltf = await loadThreeLoaderAsset(gltfLoader, path);
      names.push(...(gltf.animations ?? []).map((clip) => clip.name).filter(Boolean));
    } catch {
      continue;
    }
  }
  state.actorAssets.universalClipNames = names;
}

export function makeBillboard(texture: Three.Texture, width: number, height: number): Three.Sprite {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  telemetry.materialCreates += 1;
  const sprite = new THREE.Sprite(material);
  telemetry.meshCreates += 1;
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, 0.12);
  return sprite;
}

export function createPickupVisual(
  kind: Pickup["kind"],
  fallbackTexture: Three.Texture,
  scale: number,
  payload: StatLevelChoice | null = null
): Three.Object3D {
  if (kind === "weapon") {
    const weaponDrop = createWeaponDropVisual(payload);
    if (weaponDrop) return weaponDrop;
  }
  const importedScale = kind === "weapon" ? 0.18 : kind === "heal" ? 0.13 : kind === "magnet" ? 0.13 : 0.11;
  const model = cloneCachedModel(`pickup:${kind}`, importedScale);
  if (model) {
    model.position.y = kind === "weapon" ? -0.28 : -0.12;
    model.userData.importedModel = true;
    if (kind !== "xp" && kind !== "magnet") return model;
    const group = new THREE.Group();
    group.add(model);
    addPickupAura(group, kind === "magnet" ? "#9fe8ff" : "#7bd6ff", kind === "magnet" ? 0.7 : 0.58, 0.18);
    group.userData.importedModel = true;
    return group;
  }
  const billboardScale = kind === "weapon" ? 2.6 : kind === "heal" ? 2.1 : 1.8;
  const billboard = makeBillboard(fallbackTexture, Math.max(scale, billboardScale), Math.max(scale, billboardScale));
  billboard.userData.importedModel = false;
  return billboard;
}

export function createWeaponDropVisual(payload: StatLevelChoice | null): Three.Group | null {
  const chest = cloneCachedModel("pickup:weapon", 0.28);
  if (!chest) return null;
  const group = new THREE.Group();
  chest.position.set(0, -0.32, 0);
  group.add(chest);
  const color = payload?.color ?? "#ffd27a";
  addPickupAura(group, color, 0.8, 0.24);
  group.userData.importedModel = true;
  return group;
}

export function addPickupAura(group: Three.Group, colorValue: Three.ColorRepresentation, radius: number, y: number): void {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.035, 6, 28),
    getEffectMaterial(new THREE.Color(colorValue), 0.44)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.38, 12, 8), getEffectMaterial(new THREE.Color(colorValue), 0.32));
  glow.position.y = y + 0.06;
  group.add(ring, glow);
}

export function refreshDynamicAssetVisuals(): void {
  if (state.currentWeaponVisual?.mesh) {
    scene.remove(state.currentWeaponVisual.mesh);
    state.currentWeaponVisual = null;
    updatePlayerWeaponVisual();
  }
  for (const pickup of state.pickups) {
    if (!pickup.mesh) continue;
    if (pickup.mesh.userData?.importedModel) continue;
    const replacement = createPickupVisual(pickup.kind, pickup.texture, pickup.scale, pickup.payload);
    if (!replacement.userData?.importedModel) continue;
    replacement.position.copy(pickup.mesh.position);
    scene.remove(pickup.mesh);
    scene.add(replacement);
    pickup.mesh = replacement;
  }
}

export function updatePlayerWeaponVisual(forcedAngle: number | null = null): void {
  const player = state.player;
  if (!player) return;
  const weaponId = state.activeWeaponId ?? state.weaponSlots[0];
  if (!weaponId) return;
  if (state.currentWeaponVisual?.id !== weaponId) {
    if (state.currentWeaponVisual?.mesh) scene.remove(state.currentWeaponVisual.mesh);
    const mesh = createWeaponVisual(weaponId);
    scene.add(mesh);
    state.currentWeaponVisual = { id: weaponId, mesh };
  }
  const angle = forcedAngle ?? angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const mesh = state.currentWeaponVisual?.mesh;
  if (!mesh) return;
  const handPosition = getPlayerWeaponHandPosition(angle);
  mesh.position.copy(handPosition);
  mesh.rotation.y = -angle;
  mesh.visible = state.running;
}
