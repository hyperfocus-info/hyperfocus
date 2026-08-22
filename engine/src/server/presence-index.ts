import type { AuthoritativePlayer } from "./types.ts";

export type PresenceIndex = {
  add(player: AuthoritativePlayer): AuthoritativePlayer | undefined;
  remove(playerId: string): boolean;
  get(playerId: string): AuthoritativePlayer | undefined;
  byUser(userId: string): AuthoritativePlayer | undefined;
  list(): AuthoritativePlayer[];
  count(): number;
};

export function createPresenceIndex(): PresenceIndex {
  const byPlayer = new Map<string, AuthoritativePlayer>();
  const byUserId = new Map<string, AuthoritativePlayer>();
  return {
    add(player) {
      const previous = byUserId.get(player.userId);
      if (previous) byPlayer.delete(previous.id);
      byPlayer.set(player.id, player);
      byUserId.set(player.userId, player);
      return previous;
    },
    remove(playerId) {
      const player = byPlayer.get(playerId);
      if (!player) return false;
      byPlayer.delete(playerId);
      if (byUserId.get(player.userId)?.id === playerId) byUserId.delete(player.userId);
      return true;
    },
    get(playerId) {
      return byPlayer.get(playerId);
    },
    byUser(userId) {
      return byUserId.get(userId);
    },
    list() {
      return [...byPlayer.values()];
    },
    count() {
      return byPlayer.size;
    }
  };
}
