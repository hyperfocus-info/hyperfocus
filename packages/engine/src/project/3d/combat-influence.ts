import { hypot } from '../../math/simulation.ts';
import { steerCombatImpulse } from '../../combat/input.ts';
import type { CombatConfig, CombatVector } from '../../combat/config.ts';
import type { CombatEvent, CombatSnapshot } from '../../combat/state.ts';
import type { RigidWorld3D } from '../../physics/rigid-3d.ts';
import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireNumber } from '@hyperfocus/utilities/validation';
import { readCombatVector } from '../../combat/observation-readers.ts';

type Pending = { id: string; remaining: number; base: CombatVector; applied: CombatVector; direction: CombatVector };

export function readCombatInfluenceState3D(value: unknown): Pending[] {
  return requireArray(value).map(value => { const row = requireRecord(value);return { ...row, id: requireText(row.id), remaining: requireNumber(row.remaining), base: readCombatVector(row.base), applied: readCombatVector(row.applied), direction: readCombatVector(row.direction) }; });
}

/** Correct one existing launch, never stack steering forces or rewind through walls. */
export function createCombatInfluence3D(options: { world: RigidWorld3D; config: CombatConfig; fighterIds: readonly string[] }) {
  const { world, config, fighterIds } = options;
  let pending: Pending[] = [];
  return {
    capture: () => structuredClone(pending),
    reset() { pending = []; },
    validate(value: unknown): Pending[] {
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.length > fighterIds.length || new Set(value.map(row => row?.id)).size !== value.length) throw Error('Invalid saved launch influence');
      for (const row of value) {
        if (!fighterIds.includes(row?.id) || !Number.isSafeInteger(row.remaining) || row.remaining < 1 || row.remaining > (config.lateInfluenceFrames ?? 0)) throw Error('Invalid saved influence window');
        for (const key of ['base', 'applied', 'direction']) if (!row[key] || !['x', 'y', 'z'].every(axis => typeof row[key][axis] === 'number' && Number.isFinite(row[key][axis]) && Math.abs(row[key][axis]) <= 10000)) throw Error('Invalid saved influence vector');
        if (hypot(row.direction.x, row.direction.y, row.direction.z) > 1.000001) throw Error('Invalid saved influence direction');
      }
      return readCombatInfluenceState3D(value);
    },
    restore(value: Pending[]) { pending = structuredClone(value); },
    contact(events: readonly CombatEvent[], state: CombatSnapshot) {
      for (const event of events) {
        if (!['hit', 'bounce', 'tech', 'block', 'parry', 'guard-break', 'escape'].includes(event.kind)) continue;
        pending = pending.filter(row => row.id !== event.targetId);
        const fighter = state.fighters.find(fighter => fighter.id === event.targetId);
        if (event.kind !== 'hit' || !fighter || fighter.health <= 0 || fighter.stunKind !== 'hit' || !(config.lateInfluenceFrames ?? 0) || !hypot(event.impulse.x, event.impulse.y, event.impulse.z)) continue;
        pending.push({ id: fighter.id, remaining: config.lateInfluenceFrames!, base: { ...event.baseImpulse ?? event.impulse }, applied: { ...event.impulse }, direction: { ...fighter.influenceDirection } });
      }
    },
    step(directions: ReadonlyMap<string, CombatVector>, frozen: boolean, collisions: readonly { fighterId: string }[] = []) {
      pending = pending.filter(row => !collisions.some(collision => collision.fighterId === row.id));
      for (const row of pending) {
        const direction = directions.get(row.id) ?? row.direction;
        const next = steerCombatImpulse(row.base, direction, config.directionalInfluence ?? 0);
        world.applyImpulse(row.id, next.x - row.applied.x, next.y - row.applied.y, next.z - row.applied.z);
        row.applied = next;row.direction = { ...direction };
        if (!frozen) row.remaining--;
      }
      pending = pending.filter(row => row.remaining > 0);
    },
  };
}
