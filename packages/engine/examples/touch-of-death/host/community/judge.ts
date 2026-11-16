import { combatInputActions3D } from '@hyperfocus/engine/project/runtime-3d';
import { readCombatRoomInput, type CombatRoomFrame } from '@hyperfocus/engine/combat/net';
import { readCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { createNetworkCombatSpectator } from '@hyperfocus/engine/project/runtime-3d';
import type { ConfirmedCombatFrames } from '@hyperfocus/engine/server';

export type CombatJudgedResult = { battleId: string; matchId: string; seats: string[]; winner: 0 | 1; confirmedFrame: number; score: [number, number] };

/** Trusted host observer only. Cross-runtime agreement remains a deployment prerequisite.
 * Keeps 120 pairs for exact duplicate validation; older duplicates are explicitly stale.
 * First set result freezes simulation. The host must stop old battle inputs and create
 * a fresh judge/runtime after rotation rather than reuse this observer for rematches.
 */
export function createCombatResultJudge(options: Omit<Parameters<typeof createNetworkCombatSpectator>[0], 'onCursor' | 'onConfirmedAudio' | 'contentId'> & { battleId: string; roomId: string }) {
  const identity = structuredClone(options.match);
  if (!options.battleId || !options.roomId || identity.seats.length !== 2 || new Set(identity.seats).size !== 2) throw new Error('Invalid judge identity.');
  const definition = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (!definition) throw new Error('Judge requires authored combat.');
  const allowed = new Set(combatInputActions3D({ definition: definition, rematch: true }));
  const runner = createNetworkCombatSpectator({ ...options, contentId: identity.contentId, onCursor() {} });
  const accepted = new Map<number, string>();
  let acceptedFrame = 0;
  let result: CombatJudgedResult | undefined;
  return {
    accept(batch: ConfirmedCombatFrames): CombatJudgedResult | undefined {
      if (batch.roomId !== options.roomId || batch.matchId !== identity.matchId || batch.contentId !== identity.contentId || batch.seed !== identity.seed
        || JSON.stringify(batch.seats) !== JSON.stringify(identity.seats)) throw new Error('Judge batch identity mismatch.');
      if (batch.frames.length === 0 || batch.frames.length % 2 !== 0 || batch.frames.length > 512) throw new Error('Judge requires bounded complete frame pairs.');
      const pairs: Array<[CombatRoomFrame, CombatRoomFrame]> = [];
      let next = acceptedFrame, previous = -1;
      for (let index = 0; index < batch.frames.length; index += 2) {
        const read = (raw: CombatRoomFrame, seat: number) => {
          const input = readCombatRoomInput(raw);
          if (raw.seat !== seat || input.matchId !== identity.matchId || input.actions.some(action => !allowed.has(action))) throw new Error('Invalid judge input seat, identity or authored action.');
          return { ...input, seat };
        };
        const pair: [CombatRoomFrame, CombatRoomFrame] = [read(batch.frames[index]!, 0), read(batch.frames[index + 1]!, 1)];
        const frame = pair[0].frame, encoded = JSON.stringify(pair);
        if (pair[1].frame !== frame || (previous >= 0 && frame !== previous + 1) || frame > next) throw new Error('Judge input gap or incomplete pair.');
        if (frame < next) { if (!accepted.has(frame)) throw new Error('Stale judge duplicate.');if (accepted.get(frame) !== encoded) throw new Error('Conflicting judge duplicate.'); }
        else { next++;pairs.push(pair); }
        previous = frame;
      }
      // No simulation owner changes until the entire incoming batch has passed validation.
      for (const pair of pairs) {
        const frame = pair[0].frame;
        if (!result) {
          runner.receive({ ...identity, status: 'ready', confirmedFrame: frame, frames: { [`0:${frame}`]: pair[0], [`1:${frame}`]: pair[1] } });
          if (!runner.tick()) throw new Error('Judge could not consume a complete confirmed pair.');
          const match = runner.confirmedMatch;
          if (match?.phase === 'match-result' && (match.winner === 'player' || match.winner === 'opponent')) result = {
            battleId: options.battleId, matchId: identity.matchId, seats: [...identity.seats], winner: match.winner === 'player' ? 0 : 1,
            confirmedFrame: frame, score: [match.playerWins, match.opponentWins],
          };
        }
        accepted.set(frame, JSON.stringify(pair));acceptedFrame = frame + 1;accepted.delete(frame - 120);
      }
      return result && structuredClone(result);
    },
  };
}
