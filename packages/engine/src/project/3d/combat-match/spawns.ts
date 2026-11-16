import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DSnapshot } from '../../runtime-3d.ts';
import type { CombatProject3D } from '../combat-declaration.ts';
import { hypot } from '../../../math/simulation.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import { samplePlatformPosition3D, samplePlatformRotation3D } from '../motion/platform-motion.ts';
import { combatArenaLayout } from './arena-layouts.ts';
import { combatWeaponLayout } from './weapon-layouts.ts';

/** Authored layouts apply at match boundaries, never during a round recovery. */
export function combatSpawnWorld(options: { definition: CombatProject3D; world: Hyperfocus3DSnapshot; index: number; declaration?: Readonly<Hyperfocus3DDeclaration>; layoutOnly?: boolean }) {
  const spawn = options.layoutOnly ? undefined : options.definition.spawns?.[options.index % options.definition.spawns.length];
  const layout = combatWeaponLayout(options.definition, options.index);
  const arena = combatArenaLayout(options.definition, options.index);
  if (!spawn && !layout && !arena) return options.world;
  const world = structuredClone(options.world);
  world.motionSeed = options.index >>> 0;
  for (const entity of options.declaration?.scenes.find(scene => scene.id === world.sceneId)?.entities ?? []) {
    if (entity.animation?.kind !== 'ping-pong' || entity.animation.travelSeconds === undefined) continue;
    const pose = world.entities.find(pose => pose.id === entity.id);
    if (pose) { pose.position = samplePlatformPosition3D(entity, world.tick, world.motionSeed);pose.rotationY = samplePlatformRotation3D(entity, world.tick, world.motionSeed);delete pose.rotation; }
  }
  if (spawn) for (const [index, fighter] of options.definition.fighters.entries()) world.entities.find(entity => entity.id === fighter.entityId)!.position = [...spawn.positions[index]!];
  for (const prop of [...spawn?.props ?? [], ...layout?.props ?? [], ...arena?.props ?? []]) {
    const entity = world.entities.find(entity => entity.id === prop.entityId);
    if (!entity) throw new Error(`Starting location prop ${prop.entityId} is missing.`);
    entity.position = [...prop.position];
  }
  return world;
}

/** Match-index selection adds no hidden random state to rollback or replay. */
export function combatRoundSpawn(options: { definition: CombatProject3D; world: Hyperfocus3DSnapshot; state: CombatSnapshot; completedMatches: number; declaration?: Readonly<Hyperfocus3DDeclaration> }) {
  const spawn = options.definition.spawns?.[options.completedMatches % options.definition.spawns.length];
  const world = combatSpawnWorld({ definition: options.definition, world: options.world, index: options.completedMatches, declaration: options.declaration }), state = structuredClone(options.state);
  if (!spawn) return { world, state };
  for (const [index, fighter] of options.definition.fighters.entries()) {
    const position = spawn.positions[index]!;
    world.entities.find(entity => entity.id === fighter.entityId)!.position = [...position];
    const actor = state.fighters.find(actor => actor.id === fighter.entityId)!;
    actor.position = { x: position[0], y: position[1], z: position[2] };
    const target = spawn.positions.find((_, slot) => slot !== index);
    if (target) {
      const x = target[0] - position[0] || (target[2] !== position[2] ? 0 : 1), z = target[2] - position[2], length = hypot(x, z);
      actor.facing = { x: x / length, y: 0, z: z / length };
    }
  }
  return { world, state };
}
