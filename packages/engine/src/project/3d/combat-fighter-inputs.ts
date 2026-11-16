import { hypot } from '../../math/simulation.ts';
import type { CombatVector } from '../../combat/config.ts';
import type { CombatEvent, CombatSnapshot } from '../../combat/state.ts';
import type { CombatProject3D } from './combat-declaration.ts';
import { createCombatHitstop3D } from './combat-hitstop.ts';
import { object } from './gameplay-contracts.ts';

/** Trusted host input in authored roster order. Transports bind peers to slots separately. */
export type CombatFighterInput3D = { actions: ReadonlySet<string>; direction: CombatVector };

/** Physical intent stays small; held-item resolution selects internal weapon moves. */
export function combatInputActions3D({ definition, rematch = false }: { definition: CombatProject3D; rematch?: boolean }) {
  const weapons = new Set(definition.interactions?.weapons.flatMap(weapon => [weapon.lightMoveId, weapon.heavyMoveId]) ?? []);
  const actions = definition.config.moves.filter(move => !move.weaponAttack && !move.weaponBaseMoveId && !move.weaponSourceMoveId && !weapons.has(move.id)).flatMap(move => move.command);
  return [...new Set([...actions, 'interact', 'guard', 'tech', 'drive', 'jump', 'jump-tap', 'dash', 'lockon', ...(rematch ? ['match:rematch'] : [])])].filter(action => rematch || action !== 'match:rematch');
}

export function createCombatFighterInputs3D(definition: CombatProject3D) {
  const channels = definition.fighters.map(() => createCombatHitstop3D({ scale: definition.config.hitstopScale }));
  let held = definition.fighters.map(() => new Set<string>());
  const commands = new Set(combatInputActions3D({ definition }));
  return {
    checkpoint() {
      const pauses = channels.map(channel => channel.checkpoint()), savedHeld = held.map(actions => [...actions]);
      return { state: { pauses: pauses.map(pause => pause.state), held: savedHeld }, restore() {
        for (const pause of pauses) pause.restore();held = savedHeld.map(actions => new Set(actions));
      } };
    },
    read(inputs?: readonly CombatFighterInput3D[]) {
      if (!inputs || inputs.length !== channels.length) throw new Error('Independent combat inputs require the complete authored roster.');
      return inputs.map((input, index) => {
        const d = input?.direction;
        if (!d || d.y !== 0 || !Number.isFinite(d.x) || !Number.isFinite(d.z) || hypot(d.x, d.z) > 1.000001) throw new Error('Combat direction must be a bounded planar world vector.');
        if (!input.actions || input.actions.size > commands.size || [...input.actions].some(action => !commands.has(action))) throw new Error('Unknown independent combat action.');
        return { actions: new Set([...input.actions].map(action => definition.fighters[index]!.actionPrefix + action)), direction: { ...d } };
      });
    },
    begin(inputs: readonly CombatFighterInput3D[]) { for (const [index, channel] of channels.entries()) channel.begin(inputs[index]!.actions, inputs[index]!.direction); },
    hold(inputs: readonly CombatFighterInput3D[]) { held = inputs.map(input => new Set(input.actions)); },
    resume(inputs: readonly CombatFighterInput3D[]) {
      return new Map(definition.fighters.map((fighter, index) => {
        const channel = channels[index]!, input = inputs[index]!;
        const actions = channel.resume(input.actions, input.direction);
        const control = { actions, previous: held[index]!, direction: channel.direction ?? input.direction, releaseDirection: channel.releaseDirection };
        held[index] = new Set(actions);
        return [fighter.entityId, control];
      }));
    },
    contact(events: readonly CombatEvent[], state: CombatSnapshot) { for (const channel of channels) channel.contact(events, state); },
    reset() { for (const channel of channels) channel.reset();held = channels.map(() => new Set<string>()); },
    capture() { return channels.map((channel, index) => ({ held: [...held[index]!], hitstop: channel.capture() })); },
    validate(value: unknown) {
      if (!Array.isArray(value) || value.length !== channels.length) throw new Error('Invalid independent combat input save.');
      return value.map((raw, index) => {
        const record = object(raw), prefix = definition.fighters[index]!.actionPrefix;
        if (!Array.isArray(record.held) || record.held.length > 256 || !record.held.every((action): action is string => typeof action === 'string' && action.startsWith(prefix) && action.length <= 256)) throw new Error('Invalid saved fighter input.');
        return { held: record.held, hitstop: channels[index]!.validate(record.hitstop) };
      });
    },
    restore(value: Array<{ held: string[]; hitstop: ReturnType<ReturnType<typeof createCombatHitstop3D>['validate']> }>) { for (const [index, channel] of channels.entries()) channel.restore(value[index]!.hitstop);held = value.map(item => new Set(item.held)); },
  };
}
