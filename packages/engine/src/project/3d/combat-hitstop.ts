import { hypot } from '../../math/simulation.ts';
import type { CombatEvent, CombatSnapshot } from '../../combat/state.ts';
import { object } from './gameplay-contracts.ts';
import type { CombatVector } from '../../combat/config.ts';
import { readCombatHitstopState3D } from './combat-hitstop/snapshot.ts';

/** Contact pauses use wall ticks; combat, motion, AI and physics share the freeze. */
export function createCombatHitstop3D({ scale = 1 }: { scale?: number } = {}) {
  let remaining = 0, frozen = false;
  let buffered: string[][] = [];
  let previous: string[] = [];
  let directions: Array<CombatVector | undefined> = [], previousDirection: CombatVector | undefined, resumedDirection: CombatVector | undefined;
  let jumpDirection: CombatVector | undefined;
  const copyDirection = (direction?: CombatVector) => direction && { ...direction };
  const readDirection = (value: unknown) => {
    if (value === undefined || value === null) return undefined;
    const v = object(value);
    if (typeof v.x !== 'number' || typeof v.z !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.z) || v.y !== 0 || hypot(v.x, v.z) > 1.000001) throw new Error('Invalid saved hitstop world direction.');
    return { x: v.x, y: 0, z: v.z };
  };
  let jumpPresses: Array<{ action: string; frames: number }> = [], jumpTaps: string[] = [];
  return {
    checkpoint() {
      const state = structuredClone({ remaining, frozen, buffered, previous, directions, previousDirection, resumedDirection, jumpDirection, jumpPresses, jumpTaps });
      return { state, restore() {
        const copy = structuredClone(state);
        ({ remaining, frozen, buffered, previous, directions, previousDirection, resumedDirection, jumpDirection, jumpPresses, jumpTaps } = copy);
      } };
    },
    get frozen() { return frozen; },
    get pending() { return remaining > 0; },
    get direction() { return copyDirection(resumedDirection); },
    get releaseDirection() { return copyDirection(jumpDirection); },
    capture() { return { remaining, buffered: buffered.map(actions => [...actions]), previous: [...previous], jumpPresses: jumpPresses.map(press => ({ ...press })), jumpTaps: [...jumpTaps], ...(previousDirection ? { directions: directions.map(value => copyDirection(value) ?? null), previousDirection: copyDirection(previousDirection), ...(jumpDirection ? { jumpDirection: copyDirection(jumpDirection) } : {}) } : {}) }; },
    validate(value: unknown): {
      remaining: number; buffered: string[][]; previous: string[]; jumpPresses: Array<{ action: string; frames: number }>; jumpTaps: string[];
      directions?: Array<CombatVector | undefined>; previousDirection?: CombatVector; jumpDirection?: CombatVector;
    } {
      if (value === undefined) return { remaining: 0, buffered: [], previous: [], jumpPresses: [], jumpTaps: [] };
      const record = object(value);
      if (!Number.isInteger(record.remaining) || typeof record.remaining !== 'number' || record.remaining < 0 || record.remaining > 19
        || !Array.isArray(record.buffered) || record.buffered.length > 32
        || record.buffered.some(actions => !Array.isArray(actions) || actions.length > 256 || actions.some(action => typeof action !== 'string' || action.length > 256))) throw new Error('Invalid saved combat hitstop.');
      if (!Array.isArray(record.previous) || record.previous.length > 256 || record.previous.some(action => typeof action !== 'string' || action.length > 256)) throw new Error('Invalid saved hitstop input sample.');
      const presses = record.jumpPresses ?? [], taps = record.jumpTaps ?? [];
      const jump = (action: unknown) => typeof action === 'string' && action.length <= 256 && action.endsWith(':jump');
      if (!Array.isArray(presses) || presses.length > 16 || presses.some(press => !press || !jump(press.action) || !Number.isInteger(press.frames) || press.frames < 0 || press.frames > 16)
        || !Array.isArray(taps) || taps.length > 16 || taps.some(action => !jump(action))) throw new Error('Invalid saved hitstop jump gesture.');
      const samples = record.directions;
      if (samples !== undefined && (!Array.isArray(samples) || samples.length !== record.buffered.length)) throw new Error('Invalid saved hitstop direction samples.');
      const saved = readCombatHitstopState3D({ ...record, jumpPresses: presses, jumpTaps: taps, directions: samples?.map(value => readDirection(value) ?? null), previousDirection: readDirection(record.previousDirection), jumpDirection: readDirection(record.jumpDirection) });
      return { ...saved, directions: saved.directions?.map(readDirection) };
    },
    restore(value: { remaining: number; buffered: string[][]; previous: string[]; jumpPresses?: Array<{ action: string; frames: number }>; jumpTaps?: string[]; directions?: Array<CombatVector | undefined>; previousDirection?: CombatVector; jumpDirection?: CombatVector }) { remaining = value.remaining;previous = [...value.previous];buffered = value.buffered.map(actions => [...actions]);jumpPresses = (value.jumpPresses ?? []).map(press => ({ ...press }));jumpTaps = [...value.jumpTaps ?? []];directions = value.directions?.map(copyDirection) ?? buffered.map(() => undefined);previousDirection = copyDirection(value.previousDirection);jumpDirection = copyDirection(value.jumpDirection);resumedDirection = undefined;frozen = false; },
    reset() { remaining = 0;frozen = false;buffered = [];previous = [];jumpPresses = [];jumpTaps = [];directions = [];previousDirection = undefined;resumedDirection = undefined;jumpDirection = undefined; },
    begin(actions: ReadonlySet<string>, direction?: CombatVector) {
      frozen = remaining > 0;
      if (frozen) {
        for (const press of jumpPresses) { press.frames = Math.min(16, press.frames + 1);if (!actions.has(press.action) && press.frames < 15 && jumpTaps.length < 16 && !jumpTaps.includes(press.action)) jumpTaps.push(press.action); }
        jumpPresses = jumpPresses.filter(press => actions.has(press.action));
        for (const action of actions) if (action.endsWith(':jump') && !previous.includes(action) && jumpPresses.length < 16) { jumpPresses.push({ action, frames: 0 });jumpDirection = copyDirection(direction); }
      }
      if (actions.size !== previous.length || previous.some(action => !actions.has(action)) || direction?.x !== previousDirection?.x || direction?.z !== previousDirection?.z) {
        if (frozen) {
          if (buffered.length < 32) { buffered.push([...actions]);directions.push(copyDirection(direction)); }
        } else {
          // Once play resumes, a new intention wins over older frozen input.
          // Appending while draining would preserve input latency indefinitely.
          // Preserve which physical button completed the gesture. Its movement
          // meaning is resolved after the freeze: ground jump or airborne dash.
          const released = jumpTaps.flatMap(action => {
            let sample: string[] | undefined;
            for (const candidate of buffered) if (candidate.includes(action)) sample = candidate;
            const directions = sample?.filter(key => ['move-up', 'move-down', 'move-left', 'move-right'].includes(key)) ?? [];
            return [`${action}-release`, ...directions.map(key => `${action}-release/${key}`)];
          });
          buffered = released.length ? [[...actions, ...released]] : [];
          directions = buffered.map(() => copyDirection(direction));
        }
      }
      previous = [...actions];
      previousDirection = copyDirection(direction);
      if (!frozen) { jumpPresses = [];jumpTaps = [];return false; }
      remaining--;
      // Prioritize held defense once, at the end of the pause. Repeating this
      // while draining would erase later release/repress parry edges.
      if (remaining === 0) for (const guard of actions) if (guard.endsWith(':guard')) {
        const at = buffered.findIndex(sample => sample.includes(guard));
        const prefix = guard.slice(0, -'guard'.length);
        for (let i = 0; i < at; i++) buffered[i] = [...buffered[i]!.filter(action => !action.startsWith(prefix)), guard];
      }
      // Retain full input samples, including direction/Drive, in chronological order.
      // Releases matter too: releasing then re-pressing guard opens a fresh parry.
      return true;
    },
    resume(actions: ReadonlySet<string>, direction?: CombatVector) { resumedDirection = copyDirection(buffered.length ? directions.shift() : direction);return buffered.length ? new Set(buffered.shift()!) : actions; },
    contact(events: readonly CombatEvent[], state?: CombatSnapshot) {
      for (const event of events) {
        const lethal = event.kind === 'hit' && event.damage > 0 && state?.fighters.some(fighter => fighter.id === event.targetId && fighter.health === 0);
        const ticks = lethal ? 19 : event.kind === 'parry' || event.kind === 'guard-break' ? 17
          : event.kind === 'block' ? 4 : event.kind === 'hit' ? event.counter || event.damage >= 18 || event.impulse.y > 3 ? 14 : 4 : 0;
        remaining = Math.max(remaining, Math.round(ticks * scale));
      }
      // Integrate the contact tick once so launch impulses survive save/restore and
      // characters remain at their actual contact pose before subsequent ticks freeze.
    },
  };
}
