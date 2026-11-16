import { matchmakingTicketCodec } from '../durable-service-codecs.ts';
import type { DurableJson, DurableServiceStore, DurableServiceTransaction } from '../durable-service-types.ts';

/** Host-only finalization. Call after persisting the game's result or abandonment. */
export function createMatchmakingRelease(options: {
  store: DurableServiceStore;
  once(tx: DurableServiceTransaction, key: string, fingerprint: string, run: () => boolean): boolean;
  audit(tx: DurableServiceTransaction, actor: string, operation: string, subject: string, details: DurableJson): void;
}) {
  return async (request: { ticketIds: readonly string[]; roomId: string; idempotencyKey: string }) => {
    const validId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id);
    if (!validId(request.roomId) || !validId(request.idempotencyKey) || !Array.isArray(request.ticketIds)
      || request.ticketIds.length < 1 || request.ticketIds.length > 10000 || !request.ticketIds.every(validId)
      || new Set(request.ticketIds).size !== request.ticketIds.length) throw new Error('Invalid matchmaking release.');
    const ids = [...request.ticketIds].sort();
    return options.store.transaction(tx => options.once(tx, request.idempotencyKey, JSON.stringify([request.roomId, ids]), () => {
      const tickets = ids.map(id => {
        const value = tx.get('ticket', id);
        return value === undefined ? undefined : matchmakingTicketCodec.decode(value);
      });
      // Cancellation can race readiness. Terminal cancelled tickets are safe to retire;
      // waiting tickets and assignments to another room must remain untouched.
      if (tickets.some(ticket => !ticket || ticket.state === 'waiting' || ticket.handoff && ticket.handoff.roomId !== request.roomId)) return false;
      for (const ticket of tickets) {
        if (!ticket) throw new Error('Missing validated ticket.');
        if (tx.get('ticket-owner', ticket.playerId) === ticket.id) tx.delete('ticket-owner', ticket.playerId);
        tx.delete('ticket', ticket.id);
        options.audit(tx, 'matchmaker', 'matchmaking.release', ticket.id, { roomId: request.roomId });
      }
      return true;
    }));
  };
}
