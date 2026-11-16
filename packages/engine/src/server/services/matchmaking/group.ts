import { matchmakingTicketCodec } from '../durable-service-codecs.ts';
import type { DurableJson, DurableServiceStore, DurableServiceTransaction, MatchmakingTicket } from '../durable-service-types.ts';

type WaitingTicket = MatchmakingTicket & { state: 'waiting' };

/** Host policy selects a complete group inside the reservation transaction. */
export function createMatchmakingGroup(options: {
  store: DurableServiceStore; time(): number; token(): string; maxHandoffTtl: number;
  audit(tx: DurableServiceTransaction, actor: string, operation: string, subject: string, details: DurableJson): void;
}) {
  return async (request: {
    queue: string; roomId: string; capacity: number; handoffTtlMs?: number;
    select(context: { tickets: readonly WaitingTicket[]; now: number }): readonly string[];
  }): Promise<MatchmakingTicket[]> => {
    for (const id of [request.queue, request.roomId]) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error('Invalid matchmaking group identity.');
    }
    const ttl = request.handoffTtlMs ?? 60000;
    if (!Number.isSafeInteger(request.capacity) || request.capacity < 1 || request.capacity > 10000
      || !Number.isSafeInteger(ttl) || ttl < 1000 || ttl > options.maxHandoffTtl || typeof request.select !== 'function') throw new Error('Invalid matchmaking group options.');
    return options.store.transaction(tx => {
      const now = options.time();
      const tickets = tx.scan('ticket', { limit: 100000 }).map(({ value }) => matchmakingTicketCodec.decode(value))
        .filter((ticket): ticket is WaitingTicket => ticket.queue === request.queue && ticket.state === 'waiting' && ticket.expiresAt > now)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      const ids: unknown = request.select({ tickets: structuredClone(tickets), now });
      if (ids instanceof Promise) { void ids.catch(() => undefined);throw new Error('Matchmaking selection must be synchronous.'); }
      if (!Array.isArray(ids) || ids.length !== 0 && ids.length !== request.capacity || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Select a complete unique matchmaking group or no group.');
      const byId = new Map(tickets.map(ticket => [ticket.id, ticket]));
      const selected = ids.map(id => {
        const ticket = byId.get(id);
        if (!ticket) throw new Error('Selected matchmaking ticket is not eligible.');
        return ticket;
      });
      return selected.map(candidate => {
        const ticket: MatchmakingTicket = { ...candidate, state: 'matched', handoff: { roomId: request.roomId, token: options.token(), expiresAt: now + ttl } };
        tx.put('ticket', ticket.id, matchmakingTicketCodec.encode(ticket));
        options.audit(tx, 'matchmaker', 'matchmaking.match', ticket.id, { roomId: request.roomId, queue: request.queue });
        return ticket;
      });
    });
  };
}
