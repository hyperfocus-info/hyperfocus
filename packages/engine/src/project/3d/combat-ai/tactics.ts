import type { CombatSnapshot } from '../../../combat/state.ts';
import { isRecord } from '@hyperfocus/utilities/records';

export type CombatAiTactics = { random: number; seeded: boolean; until: number; choice: number; distance: number; stalled: number; quiet: number; serial: number; move: string; contact: boolean; failedMove: string; failures: number; probeAt: number };
export const initialTactics = (): CombatAiTactics => ({ random: 1, seeded: false, until: 0, choice: 0, distance: 0, stalled: 0, quiet: 0, serial: 0, move: '', contact: false, failedMove: '', failures: 0, probeAt: 0 });

/** Read committed movement and completed attacks; never pending opponent input. */
export function observeTactics(memory: CombatAiTactics, state: CombatSnapshot, fighterId: string, distance: number, tick: number, seed = 0) {
  const self = state.fighters.find(fighter => fighter.id === fighterId);
  if (!self) return;
  if (!memory.seeded) {
    let hash = seed >>> 0;
    for (let i = 0; i < fighterId.length; i++) hash = Math.imul(hash ^ fighterId.charCodeAt(i), 16777619) >>> 0;
    memory.random = hash || 1;memory.seeded = true;
  }
  if (tick >= memory.until) {
    let next = memory.random;next ^= next << 13;next ^= next >>> 17;next ^= next << 5;
    memory.random = next >>> 0;memory.choice = memory.random % 4;memory.until = tick + 45 + memory.random % 16;
  }
  memory.stalled = distance > 2 && distance >= memory.distance - .025 && !self.stunFrames && !self.moveId ? Math.min(600, memory.stalled + 1) : Math.max(0, memory.stalled - 2);
  memory.distance = distance;
  memory.quiet = self.attackSerial !== memory.serial ? 0 : Math.min(3600, memory.quiet + 1);
  if (memory.move && (self.attackSerial !== memory.serial || !self.moveId)) {
    if (memory.contact) { memory.failures = 0;memory.failedMove = ''; }
    else { memory.failures = memory.failedMove === memory.move ? Math.min(8, memory.failures + 1) : 1;memory.failedMove = memory.move; }
    memory.move = '';memory.contact = false;
  }
  if (self.attackSerial !== memory.serial && self.moveId) { memory.move = self.moveId;memory.contact = false; }
  memory.serial = self.attackSerial;memory.contact ||= self.hitTargets.length > 0;
}

export function readTactics(value: unknown): CombatAiTactics {
  if (value === undefined) return initialTactics();
  if (!isRecord(value)) throw Error('Invalid AI tactics');
  const data = value, defaults = initialTactics();
  if (Object.keys(data).some(key => !(key in defaults))) throw Error('Unknown AI tactics field');
  const flag = (value: unknown) => { if (typeof value !== 'boolean') throw Error('Invalid AI tactics flag');return value; };
  const move = (value: unknown) => { if (typeof value !== 'string' || value.length > 128) throw Error('Invalid AI tactics move');return value; };
  const counter = (value: unknown) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Invalid AI tactics counter');return value; };
  const seeded = flag(data.seeded), contact = flag(data.contact);
  const currentMove = move(data.move), failedMove = move(data.failedMove);
  const random = counter(data.random), until = counter(data.until), choice = counter(data.choice), stalled = counter(data.stalled), quiet = counter(data.quiet), serial = counter(data.serial), failures = counter(data.failures), probeAt = counter(data.probeAt);
  if (typeof data.distance !== 'number' || !Number.isFinite(data.distance) || data.distance < 0 || choice > 3 || random > 0xffffffff || stalled > 600 || quiet > 3600 || failures > 8) throw Error('Invalid AI tactics bounds');
  return { ...data, random, seeded, until, choice, distance: data.distance, stalled, quiet, serial, move: currentMove, contact, failedMove, failures, probeAt };
}
