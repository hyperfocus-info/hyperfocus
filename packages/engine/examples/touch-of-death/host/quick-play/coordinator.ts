import type { createQuickPlayMatchmaker } from './matchmaker.ts';
import type { QuickPlayRatings, RatingMatch } from './ratings.ts';
import { quickPlayInitialRating } from './policy.ts';
import { communityId, communityTime } from '../community/validation.ts';
import { concedesPlayedMatch } from '../community/departure.ts';

type Identity = { userId: string; connectionId: string };
type Match = { receipt: RatingMatch; phase: 'ready' | 'playing' | 'saving' | 'result'; ready: [boolean, boolean]; deadline: number;
  final?: { winner: 0 | 1 | null; abort: boolean }; message: string };
type Person = { phase: 'idle' | 'searching'; matchId: string; lastReceipt: RatingMatch | null; message: string; lastSearch: string; rating: number };
export type QuickPlayView = { phase: 'idle' | 'searching' | 'ready' | 'playing' | 'saving' | 'result'; matchId: string; users: string[];
  ready: boolean[]; deadline: number; rating: number; lastReceipt: RatingMatch | null; message: string };

/** Authenticated host lifecycle only. Terminal fighter departures concede a playing set.
 * Keeps 128 departed-user views and trims unreferenced terminal matches above 128.
 * Durable result idempotency remains owned by the ratings ledger after cache eviction.
 */
export function createQuickPlayCoordinator(options: {
  matchmaker: ReturnType<typeof createQuickPlayMatchmaker>; ratings: QuickPlayRatings;
  now?: () => number; readyTimeoutMs?: number;
  onResult?(result: { matchId: string; userIds: readonly string[]; winnerId?: string }): Promise<unknown>;
}) {
  const timeout = options.readyTimeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000) throw new Error('Invalid Quick Play ready deadline.');
  const connections = new Map<string, string>(), people = new Map<string, Person>(), matches = new Map<string, Match>();
  const departing = new Map<string, string>();
  let tail = Promise.resolve();
  const now = () => { const value = (options.now ?? Date.now)();communityTime(value);return value; };
  function serialize<T>(run: () => Promise<T>) { const result = tail.then(run);tail = result.then(() => undefined, () => undefined);return result; }
  function identity(request: Identity) { communityId(request.userId);communityId(request.connectionId);return { ...request }; }
  function current(request: Identity) { if (connections.get(request.userId) !== request.connectionId) throw new Error('Quick Play connection is stale or absent.'); }
  function person(userId: string) {
    let value = people.get(userId);
    if (!value) { value = { phase: 'idle', matchId: '', lastReceipt: null, message: '', lastSearch: '', rating: quickPlayInitialRating };people.set(userId, value); }
    return value;
  }
  function view({ userId }: { userId: string }): QuickPlayView {
    communityId(userId);const value = people.get(userId);
    if (!value) throw new Error('Join Quick Play before requesting its state.');
    const match = matches.get(value.matchId);
    return structuredClone({ phase: match?.phase ?? value.phase, matchId: match?.receipt.matchId ?? '', users: match?.receipt.users ?? [],
      ready: match?.ready ?? [], deadline: match?.phase === 'ready' ? match.deadline : 0, rating: value.rating,
      lastReceipt: match?.phase === 'result' ? value.lastReceipt : null, message: match?.message || value.message });
  }
  function install(receipt: RatingMatch, recovering: boolean) {
    const match: Match = { receipt, phase: recovering ? 'saving' : 'ready', ready: [false, false], deadline: now() + timeout, message: '' };
    if (recovering) match.final = { winner: receipt.winner, abort: receipt.status !== 'complete' };
    matches.set(receipt.matchId, match);for (const user of receipt.users) { const state = person(user);state.matchId = receipt.matchId;state.phase = 'idle';state.lastReceipt = null; }
    return match;
  }
  async function finalize(match: Match) {
    if (!match.final) return;
    match.phase = 'saving';match.message = 'Saving the result. Please wait.';
    const receipt = match.final.abort ? await options.matchmaker.abort({ matchId: match.receipt.matchId })
      : await options.matchmaker.complete({ matchId: match.receipt.matchId, winner: match.final.winner });
    if (receipt.status === 'complete') await options.onResult?.({ matchId: receipt.matchId, userIds: receipt.users, winnerId: receipt.winner === null ? undefined : receipt.users[receipt.winner] });
    match.receipt = receipt;match.final = undefined;match.phase = 'result';
    match.message = receipt.status === 'aborted' ? 'Match interrupted. Ratings unchanged. Search again when ready.' : 'Set complete. Search again when ready.';
    for (const [seat, user] of receipt.users.entries()) { person(user).lastReceipt = structuredClone(receipt);person(user).rating = receipt.after[seat]!; }
  }
  async function interrupt(match: Match) {
    if (match.receipt.status === 'pending' && !match.final) match.final = { winner: null, abort: true };
    await finalize(match);
  }
  async function depart(match: Match, userId: string, reason: string) {
    if (match.phase === 'playing' && !match.final && concedesPlayedMatch(reason)) {
      const seat = match.receipt.users.indexOf(userId);if (seat < 0) throw new Error('Departing fighter does not own this match.');
      match.final = { winner: seat === 0 ? 1 : 0, abort: false };
    }
    await interrupt(match);
  }
  async function finishDeparture(userId: string) {
    const requestId = departing.get(userId);if (!requestId) return;
    await options.matchmaker.cancel({ userId, requestId });departing.delete(userId);person(userId).phase = 'idle';
  }
  function trimHistory() {
    const departed = [...people].filter(([user, state]) => !connections.has(user) && !departing.has(user)
      && (!state.matchId || matches.get(state.matchId)?.receipt.status !== 'pending'));
    for (const [user] of departed.slice(0, Math.max(0, departed.length - 128))) people.delete(user);
    const referenced = new Set([...people.values()].map(state => state.matchId));
    for (const [id, match] of matches) if (matches.size > 128 && !referenced.has(id) && !match.final && match.receipt.status !== 'pending') matches.delete(id);
  }
  return {
    view,
    join(request: Identity) {
      const value = identity(request);
      return serialize(async () => {
        const old = connections.get(value.userId), existing = people.get(value.userId);
        if (old === value.connectionId) return view(value);
        await finishDeparture(value.userId);person(value.userId).rating = await options.ratings.get({ userId: value.userId });
        const active = existing && matches.get(existing.matchId);
        if (active) { if (old) await depart(active, value.userId, 'duplicate-login');else if (active.final) await finalize(active);connections.set(value.userId, value.connectionId);return view(value); }
        const resumed = await options.matchmaker.resume({ userId: value.userId });
        if (resumed) await finalize(matches.get(resumed.match.matchId) ?? install(resumed.match, true));
        else {
          const pending = (await options.ratings.pending()).find(match => match.users.includes(value.userId));
          if (pending) await finalize(install(pending, true));
          else { await options.matchmaker.cancel({ userId: value.userId, requestId: `join-${crypto.randomUUID()}` });person(value.userId).phase = 'idle'; }
        }
        connections.set(value.userId, value.connectionId);return view(value);
      });
    },
    leave(request: Identity & { reason?: string }) {
      const value = identity(request), reason = request.reason ?? 'disconnect';
      return serialize(async () => {
        if (connections.get(value.userId) !== value.connectionId) return;
        connections.delete(value.userId);const state = person(value.userId), match = matches.get(state.matchId);
        if (match) await depart(match, value.userId, reason);
        else { departing.set(value.userId, `leave-${crypto.randomUUID()}`);await finishDeparture(value.userId); }
      });
    },
    search(request: Identity & { requestId: string }) {
      const value = identity(request);communityId(request.requestId);const requestId = request.requestId;
      return serialize(async () => {
        current(value);const state = person(value.userId), match = matches.get(state.matchId);
        if (match && (match.phase !== 'result' || match.final)) throw new Error('Finish your assigned match before searching again.');
        if (state.phase !== 'searching' && state.lastSearch === requestId) throw new Error('That search request has finished. Start a new search.');
        const ticket = await options.matchmaker.search({ userId: value.userId, requestId });
        if (ticket.state !== 'waiting') throw new Error('That search request has finished. Start a new search.');
        state.phase = 'searching';state.matchId = '';state.message = 'Searching for an opponent.';state.lastSearch = requestId;
        return view(value);
      });
    },
    cancel(request: Identity & { requestId: string }) {
      const value = identity(request);communityId(request.requestId);const requestId = request.requestId;
      return serialize(async () => {
        current(value);const state = person(value.userId), match = matches.get(state.matchId);
        if (match) {
          if (match.phase === 'playing') throw new Error('A playing match cannot be cancelled.');
          await interrupt(match);
        } else {
          const result = await options.matchmaker.cancel({ userId: value.userId, requestId });
          if (result.matchId) { const resumed = await options.matchmaker.resume({ userId: value.userId });if (resumed) await interrupt(install(resumed.match, true)); }
          state.phase = 'idle';state.message = 'Search cancelled.';
        }
        return view(value);
      });
    },
    accept(request: Identity & { matchId: string }) {
      const value = identity(request);communityId(request.matchId);const matchId = request.matchId;
      return serialize(async () => {
        current(value);const match = matches.get(person(value.userId).matchId);
        if (!match || match.receipt.matchId !== matchId || match.phase !== 'ready') throw new Error('This Quick Play ready request is stale.');
        if (now() >= match.deadline) { await interrupt(match);throw new Error('This Quick Play ready request expired.'); }
        const seat = match.receipt.users.indexOf(value.userId);match.ready[seat] = true;
        if (match.ready.every(Boolean)) match.phase = 'playing';return view(value);
      });
    },
    tick() {
      return serialize(async () => {
        for (const userId of departing.keys()) await finishDeparture(userId);
        for (const match of matches.values()) {
          if (match.final) await finalize(match);
          else if (match.phase === 'ready' && now() >= match.deadline) await interrupt(match);
        }
        // Reconstruct a pair whose ticket transaction committed before its rating reservation failed.
        for (const [user, state] of people) if (state.phase === 'searching' && !state.matchId && connections.has(user)) {
          const ticket = await options.matchmaker.status({ userId: user });
          if (!ticket?.handoff && (!ticket || ticket.state !== 'waiting' || ticket.expiresAt <= now())) {
            await options.matchmaker.cancel({ userId: user, requestId: `expired-${crypto.randomUUID()}` });
            state.phase = 'idle';state.message = 'Your search expired. Search again when ready.';continue;
          }
          const resumed = await options.matchmaker.resume({ userId: user });
          if (resumed && !matches.has(resumed.match.matchId)) {
            const live = resumed.match.users.every(id => connections.has(id) && person(id).phase === 'searching' && !person(id).matchId);
            const match = install(resumed.match, !live || resumed.match.status !== 'pending');if (match.final) await finalize(match);
          }
        }
        for (let count = 0; count < connections.size / 2; count++) {
          const assigned = await options.matchmaker.reserveNext();if (!assigned) break;
          const live = assigned.match.users.every(user => connections.has(user) && person(user).phase === 'searching' && !person(user).matchId);
          const match = install(assigned.match, !live);if (match.final) await finalize(match);
        }
        trimHistory();
      });
    },
    complete({ matchId, winner }: { matchId: string; winner: 0 | 1 | null }) {
      communityId(matchId);if (winner !== 0 && winner !== 1 && winner !== null) throw new Error('Invalid trusted result.');
      return serialize(async () => {
        const match = matches.get(matchId);
        if (!match || match.phase !== 'playing' && !match.final && match.receipt.status !== 'complete') throw new Error('No playing Quick Play match owns that result.');
        if (match.final && (match.final.abort || match.final.winner !== winner) || match.receipt.status === 'complete' && match.receipt.winner !== winner) throw new Error('Conflicting Quick Play result.');
        if (match.receipt.status !== 'complete') match.final = { winner, abort: false };
        await finalize(match);return structuredClone(match.receipt);
      });
    },
    abort({ matchId }: { matchId: string }) {
      communityId(matchId);
      return serialize(async () => {
        const match = matches.get(matchId);if (!match) throw new Error('Unknown Quick Play match.');
        await interrupt(match);return structuredClone(match.receipt);
      });
    },
    shutdown() {
      return serialize(async () => {
        for (const match of matches.values()) await interrupt(match);
        for (const [userId, state] of people) if (state.phase === 'searching') await options.matchmaker.cancel({ userId, requestId: `shutdown-${crypto.randomUUID()}` });
        connections.clear();
      });
    },
  };
}
