import { hypot, sin, cos } from '../../../math/simulation.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { WeaponState } from '../combat-interaction/weapons/utility.ts';
import type { MaterialLook3D } from '../../../render/materials/3d-presets.ts';
import type { createCutawayFade } from './cutaways/cutaway-fade.ts';
import { createSightVolumePlanes3D } from './cutaways/sight-volume.ts';
import { aabbIntersectsFrustum3D } from '../../../render/3d-core.ts';
import { cutawaySceneBindings } from './cutaways/scene-bindings.ts';
import { anyTargetIntersects } from '../../../physics/target-rays.ts';
import { createPartitionedTargetRayQuery3D, type TargetPartitionWork } from './cutaways/target-partitions.ts';
import type { PreparedTargetRayQuery3D } from '../../../physics/target-rays.ts';
import { appendCombatCueTargets } from './cutaways/combat-cue-targets.ts';

type Vec = [number, number, number];
const bases = new WeakMap<Hyperfocus3DEvaluatedFrame, Map<string, number>>();
const batchGroups = new WeakMap<ReadonlyMap<string, string>, readonly string[][]>();
type Bounds = { scale: Vec; radius: number; rotation?: [number, number, number, number]; half?: Vec };
const radiusCaches = new WeakMap<ReadonlyMap<string, string>, Map<string, Bounds>>();
// Small counters need a visible support beneath opaque pickups. Tall/stacked
// architecture needs a much lighter cutaway to preserve articulated fighters.
function cutawayOpacity(entity: Hyperfocus3DEvaluatedFrame['entities'][number]) {
  return Math.max(...entity.scale) <= 2 && entity.scale[1] <= Math.min(entity.scale[0], entity.scale[2]) * .9 ? .16 : .035;
}

/** Call after the final camera and articulated pose. Authored scenery opts in. */
export function presentCombatObstructions3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; viewportAspect?: number; materialIds?: ReadonlyMap<string, string>; weapons?: readonly WeaponState[]; fade?: ReturnType<typeof createCutawayFade>;
  targetRayStrategy?: 'original' | 'partitioned'; onTargetPartitionWork?: (work: Readonly<TargetPartitionWork>) => void;
  targetRayQuery?: PreparedTargetRayQuery3D;
}) {
  presentBoundCombatObstructions3D(options, cutawaySceneBindings(options.frame, options.materialIds));
}

/** Internal synchronous seam: camera clearance may change the camera, never bound topology. */
export function presentBoundCombatObstructions3D(options: Parameters<typeof presentCombatObstructions3D>[0], bindings: ReturnType<typeof cutawaySceneBindings>) {
  const { frame, state } = options;
  if (options.targetRayStrategy !== undefined && options.targetRayStrategy !== 'original' && options.targetRayStrategy !== 'partitioned') throw new TypeError('Unsupported obstruction target-ray strategy');
  let radii = options.materialIds ? radiusCaches.get(options.materialIds) : undefined;
  if (!radii && options.materialIds) { radii = new Map();radiusCaches.set(options.materialIds, radii); }
  const radiusOf = (entity: typeof frame.entities[number]) => {
    const previous = radii?.get(entity.id), scale = entity.scale;
    if (previous && previous.scale[0] === scale[0] && previous.scale[1] === scale[1] && previous.scale[2] === scale[2]) return previous.radius;
    const radius = hypot(...scale);
    // Only authored identities are retained; transient effects cannot grow this cache.
    if (options.materialIds?.has(entity.id)) radii!.set(entity.id, { scale: [...scale], radius });
    return radius;
  };
  const entities = { get: (id: string) => { const slot = bindings.entities.get(id);return slot === undefined ? undefined : frame.entities[slot]; } };
  const materials = { get: (id: string) => { const slot = bindings.materials.get(id);return slot === undefined ? undefined : frame.materials[slot]; } };
  const groups = options.materialIds ? opaqueGroups(frame, options.materialIds) : [];
  const followers = bindings.followers;
  const fighterRoots = state.fighters.flatMap(fighter => { const root = entities.get(fighter.id);return root ? [root] : []; });
  const cutaway = (entity: typeof frame.entities[number]) => {
    // Keep a physical support readable beneath opaque stock, even on wide counters.
    const supportsStock = entity.scale[1] <= 1 && (options.weapons ?? []).some(weapon => !weapon.owner && !weapon.projectileOwner && weapon.active !== false && weapon.durability > 0
      && Math.abs(weapon.position.x - entity.position[0]) <= entity.scale[0] + .1 && Math.abs(weapon.position.z - entity.position[2]) <= entity.scale[2] + .1
      && Math.abs(weapon.position.y - entity.position[1] - entity.scale[1]) <= .5);
    return supportsStock ? .42 : cutawayOpacity(entity);
  };
  const targets: Vec[] = [];
  const viewX = frame.camera.target[0] - frame.camera.position[0], viewZ = frame.camera.target[2] - frame.camera.position[2];
  const viewLength = hypot(viewX, viewZ), rightX = viewLength > 1e-8 ? -viewZ / viewLength : 1, rightZ = viewLength > 1e-8 ? viewX / viewLength : 0;
  const sample = (position: Vec, radius: number, height = 0) => {
    targets.push(position, [position[0] + rightX * radius, position[1], position[2] + rightZ * radius],
      [position[0] - rightX * radius, position[1], position[2] - rightZ * radius]);
    if (height > 0) targets.push([position[0], position[1] + height, position[2]], [position[0], position[1] - height, position[2]]);
  };
  for (const root of fighterRoots) {
    for (const y of [-.55, .3, .85]) sample([root.position[0], root.position[1] + y, root.position[2]], .32);
  }
  // Root-only rays miss extended kicks, leaning heads and knocked-down limbs.
  // Sample visible body pieces; combat cue envelopes are added separately below.
  for (const slot of bindings.limbs) {
    const entity = frame.entities[slot]!;
    if (!entity.visible || !state.fighters.some(fighter => entity.id.startsWith(`${fighter.id}:`))) continue;
    const radius = Math.min(.4, hypot(...entity.scale));
    const [x, y, z, w] = entity.rotation;
    const height = Math.min(.45, Math.abs(2 * (x * y + z * w)) * entity.scale[0]
      + Math.abs(1 - 2 * (x * x + z * z)) * entity.scale[1] + Math.abs(2 * (y * z - x * w)) * entity.scale[2] + .04);
    sample(entity.position, radius, height);
  }
  appendCombatCueTargets(targets, frame.entities, bindings.cues, fighterRoots);
  // Secondary sightlines reveal immediate tactical choices without expanding
  // the fighter-led camera or clearing desks across the whole city.
  const pickups: Array<{ weapon: WeaponState; distance: number }> = [];
  for (const weapon of options.weapons ?? []) {
    if (weapon.active === false || weapon.owner || weapon.projectileOwner || weapon.durability <= 0) continue;
    let distance = Infinity;
    for (const root of fighterRoots) {
      if (Math.abs(weapon.position.y - (root.position[1] - .85)) > 1.5) continue;
      const dx = weapon.position.x - root.position[0], dz = weapon.position.z - root.position[2];
      distance = Math.min(distance, dx * dx + dz * dz);
    }
    if (distance > 36) continue;
    let index = 0;
    while (index < pickups.length && (pickups[index]!.distance < distance
      || pickups[index]!.distance === distance && pickups[index]!.weapon.id < weapon.id)) index++;
    if (index >= 4) continue;
    pickups.splice(index, 0, { weapon, distance });if (pickups.length > 4) pickups.pop();
  }
  const fighterTargetCount = targets.length;
  for (const { weapon } of pickups) sample([weapon.position.x, weapon.position.y + .12, weapon.position.z], .2, .1);
  if (options.targetRayQuery && options.targetRayStrategy === 'partitioned') throw Error('Choose one prepared target-ray owner');
  const partition = options.targetRayStrategy === 'partitioned'
    ? createPartitionedTargetRayQuery3D(frame.camera.position, frame.camera.target, targets, { diagnostics: !!options.onTargetPartitionWork }) : undefined;
  const query = options.targetRayQuery;
  query?.prepare(frame.camera.position, frame.camera.target, targets);
  const testTargets = query ? (eye: Vec, count: number, entity: typeof frame.entities[number], padding: number) => query.test(eye, entity, count, padding)
    : partition ? partition.test : (eye: Vec, count: number, entity: typeof frame.entities[number], padding: number) => anyTargetIntersects(eye, targets, count, entity, padding);
  try {
  const sightPlanes = createSightVolumePlanes3D(frame.camera.position, frame.camera.target, targets);
  const sightMin: Vec = [...frame.camera.position], sightMax: Vec = [...frame.camera.position];
  for (const target of targets) for (let axis = 0; axis < 3; axis++) {
    sightMin[axis] = Math.min(sightMin[axis]!, target[axis]!);sightMax[axis] = Math.max(sightMax[axis]!, target[axis]!);
  }
  // Legacy box cages crossed the fighters as bright ankle/head bands. The faded
  // surface supplies the boundary cue; keep old authored cage meshes dormant.
  for (const slot of bindings.edges) frame.entities[slot]!.visible = false;
  let opacity = bases.get(frame);
  if (!opacity) { opacity = new Map(frame.materials.map(m => [m.id, m.look.opacity]));bases.set(frame, opacity); }
  // Scratch belongs to this presentation call; no evaluated frame retains it.
  const eye: Vec = [0, 0, 0], worldMin: Vec = [0, 0, 0], worldMax: Vec = [0, 0, 0];
  const obstructs = (entity: typeof frame.entities[number]) => {
    if (!entity.visible) return false;
    const supportingSlab = Math.abs(entity.rotation[0]) + Math.abs(entity.rotation[2]) < .001
      && entity.scale[1] <= Math.min(entity.scale[0], entity.scale[2]) * .2
      && fighterRoots.length > 0 && fighterRoots.every(root => root.position[1] >= entity.position[1] + entity.scale[1]);
    if (supportingSlab) return false;
    // Most opted-in city pieces are distant scenery. A rotation-independent
    // broadphase skips their limb rays without allocating transformed samples.
    const radius = radiusOf(entity);
    for (let axis = 0; axis < 3; axis++) if (entity.position[axis]! + radius < sightMin[axis]! - 3 || entity.position[axis]! - radius > sightMax[axis]! + 3) return false;
    // A sphere around a long wall/roof admits many distant ray tests. A cached
    // rotated box is tighter. Three units retain lens clearance and exceed the
    // .35 local ray padding even after rotation. Non-unit inputs keep the old path.
    const bounds = radii?.get(entity.id);
    const half = bounds && worldHalf(entity, bounds);
    if (half) for (let axis = 0; axis < 3; axis++) if (entity.position[axis]! + half[axis]! < sightMin[axis]! - 3 || entity.position[axis]! - half[axis]! > sightMax[axis]! + 3) return false;
    writeLocal(frame.camera.position, entity, eye);
    // A close ceiling can fill a third of the screen without crossing a body
    // ray. Cut back large foreground architecture around the lens as well.
    // Supporting floors remain opaque; this never changes collision or camera.
    if (Math.max(...entity.scale) >= 3 && hypot(Math.max(0, Math.abs(eye[0]) - entity.scale[0]),
      Math.max(0, Math.abs(eye[1]) - entity.scale[1]), Math.max(0, Math.abs(eye[2]) - entity.scale[2])) < 3) return true;
    if (half && sightPlanes) {
      // A rotated .35 local padding expands each world axis by at most sqrt(3)
      // times that amount. Keep close ceilings above, and non-unit rotations on
      // their existing path. This only rejects boxes missing every sampled ray.
      const padding = options.fade ? .606217782649107 : 0;
      for (let axis = 0; axis < 3; axis++) {
        const extent = half[axis]! + padding + (1 + Math.abs(entity.position[axis]!)) * 1e-8;
        worldMin[axis] = entity.position[axis]! - extent;worldMax[axis] = entity.position[axis]! + extent;
      }
      if (!aabbIntersectsFrustum3D(sightPlanes, worldMin, worldMax)) return false;
    }
    // Pickup rays reveal local cover, not whole homes or their broad roof slabs.
    // Fighter rays retain full coverage regardless of the scenery's size.
    const pickupCover = Math.max(...entity.scale) <= 3;
    return testTargets(eye, pickupCover ? targets.length : fighterTargetCount, entity, options.fade ? .35 : 0);
  };
  for (const { slot, owner } of bindings.solids) {
    const material = frame.materials[slot]!, entity = entities.get(owner);
    if (!entity) continue;
    const blocked = obstructs(entity);
    const target = blocked ? cutaway(entity) : opacity.get(material.id)!;
    applyOpacity(material, options.fade?.sample(material.id, target, frame.timeSeconds) ?? target, opacity.get(material.id)!);
  }
  // Authored trims keep their own colors while following one solid's visibility.
  // Evaluate after every solid so declaration order cannot leave a one-frame seam.
  const presentedFollowers = new Set<string>(), visitingFollowers = new Set<string>();
  const presentFollower = (material: typeof frame.materials[number]) => {
    const follower = bindings.followerMaterials.get(material.id);
    if (!follower || presentedFollowers.has(material.id)) return;
    if (visitingFollowers.has(material.id)) throw Error(`Cyclic scenery fade ownership: ${material.id}.`);
    visitingFollowers.add(material.id);
    const { owner } = follower;
    const entity = entities.get(owner);
    const source = materials.get(options.materialIds?.get(owner) ?? `${owner}:occlusion`);
    if (source) presentFollower(source);
    const pieces = followers.get(material.id);
    // Old authored followers encode one entity directly; shared district trim
    // supplies its instances through the immutable authored material map.
    const piece = pieces ? undefined : entities.get(follower.piece);
    const ownerWeight = source ? source.look.opacity / Math.max(.001, opacity.get(source.id) ?? 1) : 1;
    let blockedWeight = 1;
    if (pieces) { for (const slot of pieces) { const part = frame.entities[slot]!;if (obstructs(part)) blockedWeight = Math.min(blockedWeight, cutaway(part)); } }
    else if (piece && obstructs(piece)) blockedWeight = cutaway(piece);
    // Owner fading is already smooth; apply history only to independently obstructing trim.
    const independent = (opacity.get(material.id) ?? 1) * blockedWeight;
    const faded = options.fade?.sample(material.id, independent, frame.timeSeconds) ?? independent;
    applyOpacity(material, entity?.visible === false ? 0 : Math.min((opacity.get(material.id) ?? 1) * ownerWeight, faded), opacity.get(material.id) ?? 1);
    visitingFollowers.delete(material.id); presentedFollowers.add(material.id);
  };
  for (const { slot } of bindings.followerMaterials.values()) presentFollower(frame.materials[slot]!);
  cullCityProps(frame, options.viewportAspect ?? 1.7777777777777777, radiusOf, bindings.props);
  if (options.materialIds) batchOpaqueCity(frame, bindings, groups, materials);
  if (partition) options.onTargetPartitionWork?.(partition.work);
  } finally { query?.release(); }
}

function applyOpacity(material: Hyperfocus3DEvaluatedFrame['materials'][number], opacity: number, authoredOpacity: number) {
  const cutaway = opacity > 0 && opacity < Math.min(1, authoredOpacity);
  if (!Object.is(material.look.opacity, opacity) || !!material.look.cutaway !== cutaway) material.look = { ...material.look, opacity, cutaway };
}

function opaqueGroups(frame: Hyperfocus3DEvaluatedFrame, authoredIds: ReadonlyMap<string, string>): readonly string[][] {
  const cached = batchGroups.get(authoredIds);if (cached) return cached;
  // The gameplay map and authored identities are immutable. Cache conservative
  // first-frame equivalence, then verify every current trait again after fading.
  const signatures = new Map<string, string[]>();
  for (const material of frame.materials) {
    if (!material.id.startsWith('tod:city:') || !/:occlusion(?:$|-follow:)/.test(material.id) || material.look.opacity !== 1) continue;
    const signature = JSON.stringify(material.look), ids = signatures.get(signature);
    if (ids) ids.push(material.id);else signatures.set(signature, [material.id]);
  }
  const groups = [...signatures.values()].filter(ids => ids.length > 1);
  batchGroups.set(authoredIds, groups);return groups;
}

function batchOpaqueCity(frame: Hyperfocus3DEvaluatedFrame, bindings: ReturnType<typeof cutawaySceneBindings>, groups: readonly string[][],
  materials: { get(id: string): Hyperfocus3DEvaluatedFrame['materials'][number] | undefined }) {
  const aliases = new Map<string, string>();
  for (const group of groups) {
    const representatives: Hyperfocus3DEvaluatedFrame['materials'] = [];
    for (const id of group) {
      const material = materials.get(id);if (!material || material.look.opacity !== 1) continue;
      const shared = representatives.find(candidate => sameLook(candidate.look, material.look));
      if (shared) aliases.set(id, shared.id);else representatives.push(material);
    }
  }
  for (const slot of bindings.batchEntities) {
    const entity = frame.entities[slot]!, authoredId = bindings.authored[slot]!;
    delete entity.renderMaterialId;
    // Variants can change mesh and material together, including break states.
    // Keep their canonical model appearance independent of this city opt-in.
    if (!entity.variantId) {
      const shared = aliases.get(authoredId);if (shared) entity.renderMaterialId = shared;
    }
  }
}

function sameLook(a: MaterialLook3D, b: MaterialLook3D): boolean {
  if (!!a.cutaway !== !!b.cutaway || a.opacity !== b.opacity || a.metallic !== b.metallic || a.roughness !== b.roughness || a.shading !== b.shading
    || a.shader !== b.shader || a.doubleSided !== b.doubleSided || a.uv.rotation !== b.uv.rotation
    || !sameTuple(a.baseColor, b.baseColor) || !sameTuple(a.emissive, b.emissive)
    || !sameTuple(a.uv.offset, b.uv.offset) || !sameTuple(a.uv.scale, b.uv.scale)) return false;
  for (const slot of ['baseColor', 'metallicRoughness', 'normal', 'occlusion', 'emissive'] as const) if (a.textures[slot] !== b.textures[slot]) return false;
  if (!a.toon || !b.toon) return a.toon === b.toon;
  return a.toon.bands === b.toon.bands && a.toon.rimStrength === b.toon.rimStrength && a.toon.outlineWidth === b.toon.outlineWidth
    && sameTuple(a.toon.shadowColor, b.toon.shadowColor) && sameTuple(a.toon.rimColor, b.toon.rimColor) && sameTuple(a.toon.outlineColor, b.toon.outlineColor);
}

function sameTuple(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

/** Conservative render-only culling; the extra margin retains nearby offscreen shadows. */
function cullCityProps(frame: Hyperfocus3DEvaluatedFrame, aspect: number, radiusOf: (entity: Hyperfocus3DEvaluatedFrame['entities'][number]) => number, slots: readonly number[]) {
  const { camera } = frame, eye = camera.position;
  const f: Vec = [camera.target[0] - eye[0], camera.target[1] - eye[1], camera.target[2] - eye[2]], length = hypot(...f);
  if (length < 1e-8) return;
  for (let i = 0; i < 3; i++) f[i]! /= length;
  const r: Vec = [f[1] * camera.up[2] - f[2] * camera.up[1], f[2] * camera.up[0] - f[0] * camera.up[2], f[0] * camera.up[1] - f[1] * camera.up[0]];
  const width = hypot(...r);if (width < 1e-8) return;
  for (let i = 0; i < 3; i++) r[i]! /= width;
  const u: Vec = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const vertical = (sin(camera.fovYRadians / 2) / cos(camera.fovYRadians / 2)), horizontal = vertical * Math.max(.1, aspect);
  const horizontalNorm = hypot(1, horizontal), verticalNorm = hypot(1, vertical);
  for (const slot of slots) {
    const entity = frame.entities[slot]!;
    if (!entity.visible) continue;
    const x = entity.position[0] - eye[0], y = entity.position[1] - eye[1], z = entity.position[2] - eye[2];
    const depth = x * f[0] + y * f[1] + z * f[2], radius = radiusOf(entity) + 5;
    if (depth + radius < camera.near || depth - radius > camera.far
      || Math.abs(x * r[0] + y * r[1] + z * r[2]) > depth * horizontal + radius * horizontalNorm
      || Math.abs(x * u[0] + y * u[1] + z * u[2]) > depth * vertical + radius * verticalNorm) entity.visible = false;
  }
}

export function intersects(eye: Vec, target: Vec, half: Vec, padding = 0) {
  // A camera already inside an authored ceiling/wall must fade it even when
  // the short exit lies before the usual near-plane intersection tolerance.
  // Supporting floors are excluded by the caller before this test.
  if (eye.every((value, axis) => Math.abs(value) <= half[axis]! + padding)) return true;
  let near = .015, far = .985;
  for (let i = 0; i < 3; i++) {
    const d = target[i]! - eye[i]!;
    if (Math.abs(d) < 1e-8) { if (Math.abs(eye[i]!) > half[i]! + padding) return false;continue; }
    const a = (-half[i]! - padding - eye[i]!) / d, b = (half[i]! + padding - eye[i]!) / d;
    near = Math.max(near, Math.min(a, b));far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return true;
}

export function writeLocal(point: Vec, entity: Pick<Hyperfocus3DEvaluatedFrame['entities'][number], 'position' | 'rotation'>, out: Vec) {
  const x = -entity.rotation[0], y = -entity.rotation[1], z = -entity.rotation[2], w = entity.rotation[3];
  const a = point[0] - entity.position[0], b = point[1] - entity.position[1], c = point[2] - entity.position[2];
  const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  out[0] = a + w * tx + y * tz - z * ty;out[1] = b + w * ty + z * tx - x * tz;out[2] = c + w * tz + x * ty - y * tx;
}

function worldHalf(entity: Hyperfocus3DEvaluatedFrame['entities'][number], bounds: Bounds): Vec | undefined {
  const rotation = entity.rotation, previous = bounds.rotation;
  if (previous && previous.every((value, axis) => value === rotation[axis])) return bounds.half;
  bounds.rotation = [...rotation];bounds.half = undefined;
  const [x, y, z, w] = rotation, [a, b, c] = entity.scale;
  if (a < 0 || b < 0 || c < 0 || Math.abs(x * x + y * y + z * z + w * w - 1) > 1e-10) return;
  const roundoff = (a + b + c) * 1e-9 + 1e-8;
  bounds.half = [
    Math.abs(1 - 2 * (y * y + z * z)) * a + Math.abs(2 * (x * y - z * w)) * b + Math.abs(2 * (x * z + y * w)) * c + roundoff,
    Math.abs(2 * (x * y + z * w)) * a + Math.abs(1 - 2 * (x * x + z * z)) * b + Math.abs(2 * (y * z - x * w)) * c + roundoff,
    Math.abs(2 * (x * z - y * w)) * a + Math.abs(2 * (y * z + x * w)) * b + Math.abs(1 - 2 * (x * x + y * y)) * c + roundoff,
  ];
  return bounds.half;
}
