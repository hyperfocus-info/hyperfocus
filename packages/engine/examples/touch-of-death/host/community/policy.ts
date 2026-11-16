export type CommunityMember = { userId: string; joinedOrder: number; wantsQueue: boolean; disconnectedUntil: number | null };
export type CommunityBattle = { id: string; phase: 'ready' | 'playing'; fighters: [string, string]; ready: [boolean, boolean]; deadline: number };
export type CommunityResult = { battleId: string; fighters: [string, string]; winner: 0 | 1 | null };
export type CommunityState = {
  version: 1; roomId: string; revision: number; nextMember: number; nextBattle: number;
  members: CommunityMember[]; queue: string[]; battle: CommunityBattle | null;
  streak: { userId: string; wins: number } | null; results: CommunityResult[];
};
export type CommunityTuning = { maxMembers: number; streakCap: number; readyTimeoutMs: number; disconnectGraceMs: number };
export type CommunityConnections = Map<string, string>;

export function initialCommunity(roomId: string): CommunityState {
  return { version: 1, roomId, revision: 0, nextMember: 1, nextBattle: 1, members: [], queue: [], battle: null, streak: null, results: [] };
}

/** Restores queue priority without inventing a result for the abandoned active fight. */
export function interruptCommunityBattle(state: CommunityState) {
  if (!state.battle) return;
  const fighters = state.battle.fighters.filter(id => state.members.some(member => member.userId === id && member.wantsQueue));
  state.queue = [...fighters, ...state.queue.filter(id => !fighters.includes(id))];state.battle = null;
}

export function advanceCommunity(state: CommunityState, connections: CommunityConnections, now: number, tuning: CommunityTuning) {
  const expired = new Set(state.members.filter(member => !connections.has(member.userId) && member.disconnectedUntil !== null && member.disconnectedUntil <= now).map(member => member.userId));
  if (state.battle?.fighters.some(id => expired.has(id))) interruptCommunityBattle(state);
  state.members = state.members.filter(member => !expired.has(member.userId));state.queue = state.queue.filter(id => !expired.has(id));
  if (state.streak && expired.has(state.streak.userId)) state.streak = null;
  if (state.battle?.phase === 'ready' && state.battle.deadline <= now) {
    const battle = state.battle;state.battle = null;
    const ready: string[] = [];
    for (const [index, id] of battle.fighters.entries()) {
      const member = state.members.find(item => item.userId === id)!;
      if (battle.ready[index] && connections.has(id) && member.wantsQueue) ready.push(id);
      else member.wantsQueue = false;
    }
    state.queue = [...ready, ...state.queue];
  }
  if (state.battle) return;
  const fighters = state.queue.filter(id => connections.has(id)).slice(0, 2);
  if (fighters.length < 2) return;
  state.queue = state.queue.filter(id => !fighters.includes(id));
  state.battle = { id: `${state.roomId}:${state.nextBattle++}`, phase: 'ready', fighters: [fighters[0]!, fighters[1]!], ready: [false, false], deadline: now + tuning.readyTimeoutMs };
}

/** Host-only trusted result. Receipt and rotation live in the same persisted record. */
export function completeCommunity(state: CommunityState, result: CommunityResult, tuning: CommunityTuning) {
  const previous = state.results.find(item => item.battleId === result.battleId);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(result)) throw new Error('Conflicting community result.');
    return;
  }
  if (!state.battle || state.battle.phase !== 'playing' || state.battle.id !== result.battleId || JSON.stringify(state.battle.fighters) !== JSON.stringify(result.fighters)) throw new Error('Community result is stale or does not match the active fight.');
  if (result.winner === null) {
    state.streak = null;state.battle = null;state.results.push(structuredClone(result));if (state.results.length > 64) state.results.shift();
    for (const fighter of result.fighters) if (state.members.find(member => member.userId === fighter)?.wantsQueue) state.queue.push(fighter);
    return;
  }
  const winner = result.fighters[result.winner], loser = result.fighters[1 - result.winner]!;
  const wins = state.streak?.userId === winner ? state.streak.wins + 1 : 1;
  state.streak = wins >= tuning.streakCap ? null : { userId: winner, wins };
  state.battle = null;state.results.push(structuredClone(result));if (state.results.length > 64) state.results.shift();
  if (state.members.find(member => member.userId === loser)?.wantsQueue) state.queue.push(loser);
  if (state.members.find(member => member.userId === winner)?.wantsQueue) {
    if (wins >= tuning.streakCap) state.queue.push(winner);else state.queue.unshift(winner);
  }
}
