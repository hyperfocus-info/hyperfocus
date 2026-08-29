import type { PersistenceAdapter } from "../core/types.ts";

function cloneRecord<T>(record: T): T {
  if (typeof structuredClone !== "function") throw new Error("persistence requires structuredClone");
  return structuredClone(record);
}

export function createPersistenceAdapter(adapter?: Partial<PersistenceAdapter>): PersistenceAdapter {
  const players = new Map<string, unknown>();
  const rooms = new Map<string, unknown>();
  const events: unknown[] = [];
  const persistence: PersistenceAdapter = {
    async loadPlayer(playerId) {
      if (adapter?.loadPlayer) {
        const record = await adapter.loadPlayer(playerId);
        return record == null ? null : cloneRecord(record);
      }
      const record = players.get(playerId);
      return record === undefined ? null : cloneRecord(record);
    },
    async savePlayer(playerId, record) {
      if (adapter?.savePlayer) return adapter.savePlayer(playerId, cloneRecord(record));
      players.set(playerId, cloneRecord(record));
    },
    async loadRoom(roomId) {
      if (adapter?.loadRoom) {
        const snapshot = await adapter.loadRoom(roomId);
        return snapshot == null ? null : cloneRecord(snapshot);
      }
      const snapshot = rooms.get(roomId);
      return snapshot === undefined ? null : cloneRecord(snapshot);
    },
    async saveRoom(roomId, snapshot) {
      if (adapter?.saveRoom) return adapter.saveRoom(roomId, cloneRecord(snapshot));
      rooms.set(roomId, cloneRecord(snapshot));
    },
    async appendEvent(event) {
      if (adapter?.appendEvent) return adapter.appendEvent(cloneRecord(event));
      events.push(cloneRecord(event));
    }
  };
  const appendEvents = adapter?.appendEvents;
  if (appendEvents) {
    persistence.appendEvents = (nextEvents) => appendEvents(nextEvents.map(cloneRecord));
  } else if (!adapter?.appendEvent) {
    persistence.appendEvents = async (nextEvents) => { events.push(...nextEvents.map(cloneRecord)); };
  }
  return persistence;
}
