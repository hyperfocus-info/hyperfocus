import { initialDashState, readDashState } from './dash-state.ts';
import { object } from '../gameplay-contracts.ts';
import { requireText } from '@hyperfocus/utilities/text';
import { requireBoolean, requireNumber } from '@hyperfocus/utilities/validation';

export function initialMotion(id: string) { return { ...initialDashState(), id, airDash: false, airJumpUsed: false, wallSliding: false, wallRunning: false, wallRunTicks: 0, wallId: '', dashCue: 0, dashCueKind: 0, locked: true, dash: 0, recovery: 0, dx: 0, dz: 0, hold: 0, jumpHold: 0, crossConsumed: false, sprintExhausted: false, coasting: false, stepBuffer: 0, jumpBuffer: 0, jumpQueued: false, jumpIntent: 0, coyote: 0, queuedX: 0, queuedZ: 0 }; }

export type CombatMotionState = ReturnType<typeof initialMotion>;

/** Complete current state, without the legacy restore defaults below. */
export function readCombatMotionState(value: unknown): CombatMotionState {
  const row = object(value), result = initialMotion(requireText(row.id));
  for (const key of ['airDash', 'airJumpUsed', 'wallSliding', 'wallRunning', 'locked', 'crossConsumed', 'sprintExhausted', 'coasting', 'jumpQueued', 'dashAirborne'] as const) result[key] = requireBoolean(row[key]);
  for (const key of ['wallRunTicks', 'dashCue', 'dashCueKind', 'dash', 'recovery', 'dx', 'dz', 'hold', 'jumpHold', 'stepBuffer', 'jumpBuffer', 'jumpIntent', 'coyote', 'queuedX', 'queuedZ', 'dashFollowupFrames', 'stepSlowFrames', 'dashAge', 'dashDuration', 'dashCancelX', 'dashCancelZ', 'dashCancelFrames', 'dashCancelDuration'] as const) result[key] = requireNumber(row[key]);
  result.wallId = requireText(row.wallId);
  return structuredClone({ ...row, ...result });
}

export function validateCombatMotion(value: unknown, states: readonly CombatMotionState[]) {
      if (!Array.isArray(value) || value.length !== states.length) throw new Error('Invalid combat movement save.');
      return value.map((raw, index) => {
        const v = object(raw);
        if (v.id !== states[index]?.id || typeof v.airDash !== 'boolean' || typeof v.locked !== 'boolean' || typeof v.coasting !== 'boolean') throw new Error('Invalid combat movement fighter.');
        if (v.airJumpUsed !== undefined && typeof v.airJumpUsed !== 'boolean' || v.wallSliding !== undefined && typeof v.wallSliding !== 'boolean') throw new Error('Invalid air movement state.');
        if (v.sprintExhausted !== undefined && typeof v.sprintExhausted !== 'boolean') throw new Error('Invalid exhausted sprint state.');
        if (v.jumpQueued !== undefined && typeof v.jumpQueued !== 'boolean' || v.crossConsumed !== undefined && typeof v.crossConsumed !== 'boolean') throw new Error('Invalid queued jump.');
        const number = (key: string, timer = false) => { const n = v[key]; if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1200 || (timer && (!Number.isInteger(n) || n < 0))) throw new Error('Invalid combat movement value.'); return n; };
        if (v.dashCue !== undefined && number('dashCue', true) > 120 || v.dashCueKind !== undefined && number('dashCueKind', true) > 5) throw new Error('Invalid combat dash cue.');
        if (v.jumpHold !== undefined && number('jumpHold', true) > 30) throw new Error('Invalid jump hold timer.');
        if (v.wallId !== undefined && (typeof v.wallId !== 'string' || v.wallId.length > 160) || v.wallRunning !== undefined && typeof v.wallRunning !== 'boolean') throw new Error('Invalid wall movement state.');
        return { ...readDashState(v), wallId: typeof v.wallId === 'string' ? v.wallId : '', wallRunTicks: v.wallRunTicks === undefined ? 0 : number('wallRunTicks', true), wallRunning: v.wallRunning === true, jumpHold: v.jumpHold === undefined ? 0 : number('jumpHold', true), id: states[index]!.id, airDash: v.airDash, airJumpUsed: v.airJumpUsed === true, wallSliding: v.wallSliding === true, dashCue: v.dashCue === undefined ? 0 : number('dashCue', true), dashCueKind: v.dashCueKind === undefined ? 0 : number('dashCueKind', true), locked: v.locked, sprintExhausted: v.sprintExhausted === true, coasting: v.coasting, stepBuffer: v.stepBuffer === undefined ? 0 : number('stepBuffer', true), jumpBuffer: v.jumpBuffer === undefined ? 0 : number('jumpBuffer', true), jumpQueued: v.jumpQueued === true, jumpIntent: v.jumpIntent === undefined ? 0 : number('jumpIntent', true), coyote: v.coyote === undefined ? 0 : number('coyote', true), crossConsumed: v.crossConsumed === true, queuedX: v.queuedX === undefined ? 0 : number('queuedX'), queuedZ: v.queuedZ === undefined ? 0 : number('queuedZ'), hold: number('hold', true), dash: number('dash', true), recovery: number('recovery', true), dx: number('dx'), dz: number('dz') };
      }).map(readCombatMotionState);
    }
