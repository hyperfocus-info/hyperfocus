import { createSaveProfileStore, type AtomicSaveStorage } from '@hyperfocus/engine/save';
import type { createCombatConnection } from './connection.ts';

type Entry = { key: string; pair: string; winner: string };
type Connection = ReturnType<typeof createCombatConnection>;
export type RivalryObservation = { state: Pick<Connection['state'], 'roomType' | 'role' | 'rivalryScope' | 'matchId' | 'playerId' | 'matchSeats' | 'profileBindings'>;
  match: NonNullable<Connection['session']>['confirmedMatch'] };
/** Player numbers can repeat after a host restart. Its public boot ID scopes the receipt. */
export async function readFriendRivalryScope(details: { endpoint: string; roomId: string }) {
  if (typeof location === 'undefined') return '';
  const endpoint = new URL(details.endpoint);endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  if (endpoint.origin !== location.origin) return '';
  try {
    const response = await fetch('/tod-demo.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const instance = response.headers.get('X-Tod-Host-Instance');
    return response.ok && instance && /^[a-f0-9-]{36}$/.test(instance) ? JSON.stringify([endpoint.origin, instance, details.roomId]) : '';
  } catch { return ''; }
}
/** A bounded device history, separate from rank, currency and verified server results. */
export function createFriendRivalry(options: { storage: AtomicSaveStorage; projectId: string }) {
  const store = createSaveProfileStore(options.storage, `${options.projectId}:rivalry`, { limits: { maxSlots: 1, maxBytes: 262144 } });
  let entries: Entry[] = [], ready = false, saving = false, failed = false, last = '';
  void store.loadSlot('local', 'sets').then(value => {
    const data = value?.data;
    if (data !== undefined) {
      if (!Array.isArray(data) || data.length > 128) throw Error('Invalid rivalry history.');
      entries = data.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.key !== 'string' || typeof item.pair !== 'string' || typeof item.winner !== 'string'
          || [item.key, item.pair, item.winner].some(value => value.length > 1024)) throw Error('Invalid rivalry history.');
        return { key: item.key, pair: item.pair, winner: item.winner };
      });
    }
    ready = true;
  }).catch(() => { failed = true; });
  return {
    observe({ state, match }: RivalryObservation) {
      if (state.roomType !== 'combat-relay' || state.role !== 'fighter' || !state.rivalryScope || !match) return '';
      const users = state.matchSeats.map(seat => state.profileBindings.find(binding => binding.playerId === seat)?.userId);
      const local = state.profileBindings.find(binding => binding.playerId === state.playerId)?.userId;
      if (users.length !== 2 || users.some(user => !user) || !local || users[0] === users[1]) return '';
      const pair = JSON.stringify([...users].sort());
      if (ready && !saving && match.phase === 'match-result') {
        const key = JSON.stringify([state.rivalryScope, pair, state.matchId, state.matchSeats, match.matchIndex ?? 0]);
        if (last !== key && !entries.some(entry => entry.key === key)) {
          last = key;saving = true;
          const winner = users[match.playerWins > match.opponentWins ? 0 : 1]!;
          const next = [...entries, { key, pair, winner }].slice(-128);
          void store.saveSlot('local', 'sets', next).then(() => { entries = next;failed = false; }).catch(() => { failed = true; }).finally(() => { saving = false; });
        }
      }
      if (failed) return 'Rivalry history could not be saved on this device.';
      const history = entries.filter(entry => entry.pair === pair);if (!history.length) return saving ? 'Saving your rivalry…' : '';
      const wins = history.filter(entry => entry.winner === local).length;
      return `Recent rivalry · You ${wins} – ${history.length - wins} Opponent\nSets saved on this device · last 128 across all rivals`;
    },
  };
}
