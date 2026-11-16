import type { PersistenceAdapter } from '@hyperfocus/engine/server';
import { advanceCommunity, completeCommunity, initialCommunity, interruptCommunityBattle, type CommunityConnections, type CommunityResult, type CommunityState, type CommunityTuning } from './policy.ts';
import { communityId, communityRoomId, communityTime, communityTuning, readCommunityState } from './validation.ts';
import { concedesPlayedMatch } from './departure.ts';

type Identity = { userId: string; connectionId: string };

/** One owner per durable room. The host authenticates userId; browser-provided identities are not trusted. */
export function createCommunityCoordinator(options: {
  roomId: string; persistence: Pick<PersistenceAdapter, 'loadRoom' | 'saveRoom'>; now?: () => number;
  onResult?(result: { matchId: string; userIds: readonly string[]; winnerId?: string }): Promise<unknown>;
} & Partial<CommunityTuning>) {
  communityRoomId(options.roomId);const roomId = options.roomId, tuning = communityTuning(options), storageId = `tod-community:${roomId}`;
  const now = () => { const value = (options.now ?? Date.now)();communityTime(value);return value; };
  let state: CommunityState | undefined, connections: CommunityConnections = new Map();
  let pendingConcession: CommunityResult | undefined;
  const rewarded = new Set<string>();
  function concede(next: CommunityState, userId: string, reason: string) {
    const battle = next.battle, seat = battle?.fighters.indexOf(userId) ?? -1;
    if (!battle || battle.phase !== 'playing' || seat < 0 || !concedesPlayedMatch(reason)) return;
    if (pendingConcession?.battleId !== battle.id) pendingConcession = { battleId: battle.id, fighters: [...battle.fighters], winner: seat === 0 ? 1 : 0 };
    completeCommunity(next, pendingConcession, tuning);
  }
  function snapshot() {
    if (!state) throw new Error('Community coordinator is not initialized.');
    const { results, ...value } = structuredClone(state);
    return { ...value, members: value.members.map(member => ({ ...member, online: connections.has(member.userId) })), lastResult: results.at(-1) ?? null };
  }
  const initialization = (async () => {
    const stored = await options.persistence.loadRoom(storageId), time = now();
    const recovered = stored === null ? initialCommunity(roomId) : readCommunityState(stored, roomId, tuning);
    if (stored !== null) {
      interruptCommunityBattle(recovered);
      for (const member of recovered.members) member.disconnectedUntil = time + tuning.disconnectGraceMs;
      recovered.revision++;
    }
    const validated = readCommunityState(recovered, roomId, tuning);await options.persistence.saveRoom(storageId, validated);state = validated;
  })();
  let tail = initialization;
  function mutate(operation: (next: CommunityState, live: CommunityConnections, time: number) => void) {
    const result = tail.then(async () => {
      await initialization;
      const next = structuredClone(state!), live = new Map(connections), time = now();
      operation(next, live, time);advanceCommunity(next, live, time, tuning);
      if (JSON.stringify(next) !== JSON.stringify(state) || JSON.stringify([...live]) !== JSON.stringify([...connections])) {
        next.revision++;
        const validated = readCommunityState(next, roomId, tuning);
        await options.persistence.saveRoom(storageId, validated);state = validated;connections = live;
      }
      for (const result of state!.results) if (!rewarded.has(result.battleId)) {
        await options.onResult?.({ matchId: result.battleId, userIds: result.fighters, winnerId: result.winner === null ? undefined : result.fighters[result.winner] });
        rewarded.add(result.battleId);
      }
      for (const id of rewarded) if (!state!.results.some(result => result.battleId === id)) rewarded.delete(id);
      return snapshot();
    });
    tail = result.then(() => undefined, () => undefined);return result;
  }
  function identity(request: Identity) { communityId(request.userId);communityId(request.connectionId);return { ...request }; }
  function requireConnection(request: Identity, live: CommunityConnections) {
    if (live.get(request.userId) !== request.connectionId) throw new Error('Community connection is stale or absent.');
  }
  return {
    initialization, snapshot,
    join(request: Identity & { wantsQueue: boolean }) {
      const value = identity(request);if (typeof request.wantsQueue !== 'boolean') throw new Error('Invalid community queue preference.');const wantsQueue = request.wantsQueue;
      return mutate((next, live, time) => {
        advanceCommunity(next, live, time, tuning);
        if (live.has(value.userId) && live.get(value.userId) !== value.connectionId) concede(next, value.userId, 'duplicate-login');
        let member = next.members.find(item => item.userId === value.userId);
        if (!member) {
          if (next.members.length >= tuning.maxMembers) throw new Error('Community room is full.');
          member = { userId: value.userId, joinedOrder: next.nextMember++, wantsQueue, disconnectedUntil: null };next.members.push(member);
        }
        live.set(value.userId, value.connectionId);member.disconnectedUntil = null;
        if (member.wantsQueue && !next.queue.includes(value.userId) && !next.battle?.fighters.includes(value.userId)) next.queue.push(value.userId);
      });
    },
    disconnect(request: Identity & { reason?: string }) {
      const value = identity(request), reason = request.reason ?? 'disconnect';return mutate((next, live, time) => {
        if (live.get(value.userId) !== value.connectionId) return;
        concede(next, value.userId, reason);
        live.delete(value.userId);const member = next.members.find(item => item.userId === value.userId)!;member.disconnectedUntil = time + tuning.disconnectGraceMs;
        if (next.battle?.fighters.includes(value.userId)) interruptCommunityBattle(next);
      });
    },
    queue(request: Identity & { enabled: boolean }) {
      const value = identity(request);if (typeof request.enabled !== 'boolean') throw new Error('Invalid community queue preference.');const enabled = request.enabled;
      return mutate((next, live) => {
        requireConnection(value, live);next.members.find(item => item.userId === value.userId)!.wantsQueue = enabled;
        if (!enabled) {
          next.queue = next.queue.filter(id => id !== value.userId);
          if (next.battle?.phase === 'ready' && next.battle.fighters.includes(value.userId)) interruptCommunityBattle(next);
        } else if (!next.queue.includes(value.userId) && !next.battle?.fighters.includes(value.userId)) next.queue.push(value.userId);
      });
    },
    ready(request: Identity & { battleId: string }) {
      const value = identity(request), battleId = request.battleId;
      if (typeof battleId !== 'string' || battleId.length > 160) throw new Error('Invalid community battle ID.');
      return mutate((next, live, time) => {
        requireConnection(value, live);const battle = next.battle, seat = battle?.fighters.indexOf(value.userId) ?? -1;
        if (!battle || battle.id !== battleId || seat < 0 || (battle.phase === 'ready' && battle.deadline <= time)) throw new Error('Community ready request is stale.');
        battle.ready[seat] = true;if (battle.ready.every(Boolean)) battle.phase = 'playing';
      });
    },
    tick() { return mutate(() => {}); },
    abort({ battleId }: { battleId: string }) {
      return mutate(next => { if (next.battle?.id === battleId) interruptCommunityBattle(next); });
    },
    shutdown() { return mutate((next, live, time) => {
      if (pendingConcession && next.battle?.id === pendingConcession.battleId) completeCommunity(next, pendingConcession, tuning);
      interruptCommunityBattle(next);live.clear();for (const member of next.members) member.disconnectedUntil = time + tuning.disconnectGraceMs;
    }); },
    complete(request: CommunityResult) {
      if (!request || typeof request.battleId !== 'string' || request.battleId.length > 160 || !Array.isArray(request.fighters) || request.fighters.length !== 2 || (request.winner !== 0 && request.winner !== 1 && request.winner !== null)) throw new Error('Invalid community result.');
      request.fighters.forEach(communityId);const result: CommunityResult = { battleId: request.battleId, fighters: [...request.fighters], winner: request.winner };
      return mutate(next => completeCommunity(next, result, tuning));
    },
  };
}
