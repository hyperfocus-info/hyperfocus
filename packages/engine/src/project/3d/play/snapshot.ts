import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireBoolean, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import { readParticleSnapshot3D } from '../../../effects/particles3d/snapshot.ts';
import { PLAY_PHASES, playVector } from './contracts.ts';
import type { PlayState3D } from './state.ts';
import type { createProjectPlay3D } from './session.ts';

/** Current structural state only. Authored content lengths and phase availability
 * remain checked by readPlayState during restore. Missing fields are not defaulted. */
export function readPlayStateStructure3D(value: unknown): PlayState3D {
  const row = requireRecord(value);
  return { ...row, tick: requireNumber(row.tick), position: playVector(row.position), velocity: playVector(row.velocity),
    facing: requireNumber(row.facing), yaw: requireNumber(row.yaw), pitch: requireNumber(row.pitch), grounded: requireBoolean(row.grounded),
    coyote: requireNumber(row.coyote), buffer: requireNumber(row.buffer), anticipation: requireNumber(row.anticipation),
    phase: requireOneOf(row.phase, PLAY_PHASES), phaseAge: requireNumber(row.phaseAge), previousPhase: requireOneOf(row.previousPhase, PLAY_PHASES), previousAge: requireNumber(row.previousAge), distance: requireNumber(row.distance),
    cooldown: requireNumber(row.cooldown), reload: requireNumber(row.reload), ammo: requireNumber(row.ammo), reserve: requireNumber(row.reserve),
    health: requireArray(row.health).map(value => requireNumber(value)), collected: requireArray(row.collected).map(value => requireBoolean(value)),
    checkpoint: requireBoolean(row.checkpoint), finished: requireBoolean(row.finished), cells: requireArray(row.cells).map(value => requireBoolean(value)), edits: requireNumber(row.edits) };
}

export function readPlaySnapshot3D(value: unknown): ReturnType<NonNullable<ReturnType<typeof createProjectPlay3D>>['capture']> {
  const row = requireRecord(value);
  return structuredClone({ ...row, version: requireOneOf(row.version, [1]), signature: requireText(row.signature), state: readPlayStateStructure3D(row.state), particles: requireArray(row.particles).map(readParticleSnapshot3D) });
}
