import { hypot } from '../../../math/simulation.ts';
import type { CombatConfig, CombatVector } from '../../../combat/config.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import type { CombatEnvironment } from './config.ts';
import { createWeaponSurfaceProbe } from '../combat-interaction/surfaces.ts';
import { createCombatObstaclePlanner } from './obstacle-route.ts';

export type CombatBreachDecision = { direction: CombatVector; moveId?: string };

/** Compare walking around a live wall with opening it through an ordinary paid strike. */
export function createCombatBreachRoute(options: { world: RigidWorld3D; bodyIds: readonly string[]; environment: CombatEnvironment; config: CombatConfig; indirectMoveIds?: readonly string[]; speed: number }) {
  const indirect = new Set(options.indirectMoveIds);
  const intact = createCombatObstaclePlanner(options), opened = createCombatObstaclePlanner(options);
  const probe = createWeaponSurfaceProbe(options.world, options.bodyIds.filter(id => options.world.body(id)?.type !== 'dynamic'));
  return (fighterId: string, targetId: string, stamina: number, delay: number): CombatBreachDecision | undefined => {
    const actor = options.world.body(fighterId), target = options.world.body(targetId);
    if (!actor || !target || Math.abs(actor.y - target.y) > 1.25) return;
    const from = { x: actor.x, y: actor.y, z: actor.z }, to = { x: target.x, y: actor.y, z: target.z };
    const hit = probe(from, to);
    const surface = hit && options.environment.surfaces.find(surface => surface.entityId === hit.id);
    if (!hit || !surface || surface.trigger.kind !== 'impact' || surface.stopMotionIds) return;
    const threshold = surface.trigger.minSpeed;
    const moves = options.config.moves.filter(move => !indirect.has(move.id) && !move.weaponAttack && !move.dashAttack && !move.special && !move.armoredEscape && !move.airborne && !move.drive && !move.stringOnly && move.command.length === 1
      && (!move.direction || move.direction === 'neutral' || move.direction === 'toward') && move.damage > 0 && move.impulse >= threshold && stamina >= (move.staminaCost ?? 0));
    moves.sort((a, b) => a.startupFrames + a.activeFrames + a.recoveryFrames - b.startupFrames - b.activeFrames - b.recoveryFrames || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const move = moves[0];if (!move) return;
    const around = intact(fighterId, targetId), through = opened(fighterId, targetId, undefined, hit.id);
    if (!through) return;
    const attackSeconds = (delay + move.startupFrames + move.activeFrames + move.recoveryFrames) / 60;
    if (through.distance / options.speed + attackSeconds >= (around?.distance ?? Infinity) / options.speed) return;
    const x = target.x - actor.x, z = target.z - actor.z, distance = hypot(x, z) || 1;
    const direction = { x: x / distance, y: 0, z: z / distance };
    const reach = move.reach + move.hitRadius;
    return { direction, ...(hypot(hit.position.x - actor.x, hit.position.z - actor.z) < reach - .12 ? { moveId: move.id } : {}) };
  };
}
