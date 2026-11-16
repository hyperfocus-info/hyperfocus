import type { DurableMmoServices } from '@hyperfocus/engine/server';
import { selectQuickPlayPair, type QuickPlayTuning } from './policy.ts';
import type { QuickPlayRatings } from './ratings.ts';

/** One authenticated host owner. Latency comes from host measurements, never queue intent. */
export function createQuickPlayMatchmaker(options: {
  services: Pick<DurableMmoServices, 'matchmaking'>; ratings: QuickPlayRatings;
  region: string; contentId: string; queue?: string; tuning?: Partial<QuickPlayTuning>;
  now?: () => number;
  latency(userId: string): number | undefined;
}) {
  const queue = options.queue ?? 'tod-quick-play';
  let tail = Promise.resolve();
  function serialize<T>(run: () => Promise<T>) { const result = tail.then(run);tail = result.then(() => undefined, () => undefined);return result; }
  async function assignment(matchId: string) {
    const tickets = (await options.services.matchmaking.assignment({ roomId: matchId })).sort((a, b) => a.id.localeCompare(b.id));
    if (tickets.length !== 2 || tickets.some(ticket => ticket.queue !== queue || ticket.attributes.contentId !== options.contentId || ticket.attributes.region !== options.region)) throw new Error('Quick Play assignment is incomplete or incompatible.');
    const match = await options.ratings.reserve({ matchId, users: [tickets[0]!.playerId, tickets[1]!.playerId] });
    return { match, tickets };
  }
  async function release(matchId: string) {
    const tickets = await options.services.matchmaking.assignment({ roomId: matchId });
    if (tickets.length && !await options.services.matchmaking.release({ roomId: matchId, ticketIds: tickets.map(ticket => ticket.id), idempotencyKey: `finish:${matchId}` })) throw new Error('Quick Play finalization must retry.');
  }
  return {
    search(request: { userId: string; requestId: string }) {
      return serialize(async () => {
        const current = await options.services.matchmaking.ticketForPlayer(request.userId);
        if (current?.handoff) throw new Error('Resume or finish your assigned match before searching again.');
        if ((await options.ratings.pending()).some(match => match.users.includes(request.userId))) throw new Error('Resume or finish your assigned match before searching again.');
        const latency = options.latency(request.userId);
        if (latency === undefined || !Number.isFinite(latency) || latency < 0) throw new Error('Waiting for a host connection measurement.');
        const ticket = await options.services.matchmaking.enqueue(request.userId, queue, { idempotencyKey: request.requestId,
          attributes: { region: options.region, contentId: options.contentId, rating: await options.ratings.get({ userId: request.userId }) } });
        const active = await options.services.matchmaking.ticketForPlayer(request.userId);
        if (active?.id !== ticket.id || active.state !== 'waiting' || active.expiresAt <= (options.now ?? Date.now)()) throw new Error('That search request has finished. Start a new search.');
        return active;
      });
    },
    status({ userId }: { userId: string }) { return options.services.matchmaking.ticketForPlayer(userId); },
    cancel(request: { userId: string; requestId: string }) {
      return serialize(async () => {
        const ticket = await options.services.matchmaking.ticketForPlayer(request.userId);
        if (ticket?.handoff) return { cancelled: false, matchId: ticket.handoff.roomId };
        return { cancelled: await options.services.matchmaking.cancel(request.userId, request.requestId) };
      });
    },
    reserveNext() {
      return serialize(async () => {
        const matchId = `quick-${crypto.randomUUID()}`, pending = new Set((await options.ratings.pending()).flatMap(match => match.users));
        const tickets = await options.services.matchmaking.matchGroup({ queue, roomId: matchId, capacity: 2, select({ tickets, now }) {
          const candidates = tickets.flatMap(ticket => {
            const latency = options.latency(ticket.playerId);
            if (pending.has(ticket.playerId) || latency === undefined || ticket.attributes.region !== options.region || ticket.attributes.contentId !== options.contentId || typeof ticket.attributes.rating !== 'number') return [];
            return [{ userId: ticket.playerId, queuedAt: ticket.createdAt, rating: ticket.attributes.rating,
              region: options.region, contentId: options.contentId, latencyMs: latency }];
          });
          const pair = selectQuickPlayPair({ candidates, now, tuning: options.tuning });
          return pair ? pair.map(person => tickets.find(ticket => ticket.playerId === person.userId)!.id) : [];
        } });
        if (!tickets.length) return undefined;
        // If this second durable boundary fails, tickets still identify the pair:
        // resume reconstructs its immutable rating reservation after a restart.
        return assignment(matchId);
      });
    },
    resume({ userId }: { userId: string }) {
      return serialize(async () => {
        const ticket = await options.services.matchmaking.ticketForPlayer(userId);
        return ticket?.handoff ? assignment(ticket.handoff.roomId) : undefined;
      });
    },
    complete(request: { matchId: string; winner: 0 | 1 | null }) {
      return serialize(async () => { const receipt = await options.ratings.complete(request);await release(request.matchId);return receipt; });
    },
    abort(request: { matchId: string }) {
      return serialize(async () => { const receipt = await options.ratings.abort(request);await release(request.matchId);return receipt; });
    },
  };
}
