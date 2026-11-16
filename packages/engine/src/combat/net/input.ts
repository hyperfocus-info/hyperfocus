import { hypot } from '../../math/simulation.ts';
import { isObject } from '@hyperfocus/utilities/records';

const textEncoder = new TextEncoder();

export type CombatRoomInput = { matchId: string; frame: number; actions: string[]; direction: { x: number; y: number; z: number } };

export function readCombatRoomInput(value: unknown): CombatRoomInput {
  const input = isObject(value) ? value : undefined;
  if (!input || typeof input.matchId !== 'string' || !input.matchId || textEncoder.encode(input.matchId).length > 96) throw new Error('Invalid combat input match.');
  if (typeof input.frame !== 'number' || !Number.isSafeInteger(input.frame) || input.frame < 0 || input.frame > 0x7ffffffe) throw new Error('Invalid combat input frame.');
  if (!Array.isArray(input.actions) || input.actions.length > 24) throw new Error('Invalid combat input actions.');
  const actions = input.actions.map(action => {
    if (typeof action !== 'string' || !action || textEncoder.encode(action).length > 32) throw new Error('Invalid combat input actions.');
    return action;
  });
  if (new Set(actions).size !== actions.length) throw new Error('Invalid combat input actions.');
  const direction = input.direction;
  if (!isObject(direction) || direction.y !== 0 || typeof direction.x !== 'number' || typeof direction.z !== 'number' || ![direction.x, direction.z].every(Number.isFinite) || hypot(direction.x, direction.z) > 1.000001) throw new Error('Invalid combat input planar direction.');
  return { matchId: input.matchId, frame: input.frame, actions: actions.sort(), direction: { x: direction.x || 0, y: 0, z: direction.z || 0 } };
}
