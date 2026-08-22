import type { AuthoritativePlayer } from "../server/types.ts";
import type { MmoEntityData, MmoEntityRecord } from "./types.ts";
import type { MmoEntityRegistry } from "./entity-registry.ts";

export type MmoPersistenceBridgeConfig<
  TProfile,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData,
  TContext = unknown
> = {
  key?: (player: AuthoritativePlayer) => string;
  loadProfile?: (key: string, player: AuthoritativePlayer, context: TContext) => TProfile | null | Promise<TProfile | null>;
  saveProfile?: (key: string, profile: TProfile, player: AuthoritativePlayer, context: TContext) => void | Promise<void>;
  createEntity?: (args: { key: string; player: AuthoritativePlayer; profile: TProfile | null; context: TContext }) => MmoEntityRecord<TPublic, TOwner, TPrivate>;
  serializeProfile?: (args: {
    key: string;
    player: AuthoritativePlayer;
    profile: TProfile | null;
    entity: MmoEntityRecord<TPublic, TOwner, TPrivate> | undefined;
    context: TContext;
  }) => TProfile | undefined;
  removeEntityOnLeave?: boolean;
};

export type MmoPersistenceBridge<
  TProfile,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData,
  TContext = unknown
> = {
  keyFor(player: AuthoritativePlayer): string;
  loadPlayerProfile(player: AuthoritativePlayer, context: TContext): Promise<TProfile | null>;
  savePlayerProfile(player: AuthoritativePlayer, profile: TProfile, context: TContext): Promise<void>;
  attachPlayer(
    registry: MmoEntityRegistry<TPublic, TOwner, TPrivate>,
    player: AuthoritativePlayer,
    context: TContext
  ): Promise<{ key: string; profile: TProfile | null; entity?: MmoEntityRecord<TPublic, TOwner, TPrivate> }>;
  detachPlayer(
    registry: MmoEntityRegistry<TPublic, TOwner, TPrivate>,
    player: AuthoritativePlayer,
    profile: TProfile | null,
    context: TContext
  ): Promise<{ key: string; profile?: TProfile; entity?: MmoEntityRecord<TPublic, TOwner, TPrivate> }>;
};

export function createMmoPersistenceBridge<
  TProfile,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData,
  TContext = unknown
>(
  config: MmoPersistenceBridgeConfig<TProfile, TPublic, TOwner, TPrivate, TContext> = {}
): MmoPersistenceBridge<TProfile, TPublic, TOwner, TPrivate, TContext> {
  const removeEntityOnLeave = config.removeEntityOnLeave ?? true;
  const attachedEntityIds = new WeakMap<AuthoritativePlayer, string>();

  function keyFor(player: AuthoritativePlayer) {
    return config.key?.(player) ?? player.userId ?? player.id;
  }

  return {
    keyFor(player) {
      return keyFor(player);
    },
    async loadPlayerProfile(player, context) {
      const key = keyFor(player);
      return (await config.loadProfile?.(key, player, context)) ?? null;
    },
    async savePlayerProfile(player, profile, context) {
      await config.saveProfile?.(keyFor(player), profile, player, context);
    },
    async attachPlayer(registry, player, context) {
      const key = keyFor(player);
      const profile = (await config.loadProfile?.(key, player, context)) ?? null;
      const entity = config.createEntity?.({ key, player, profile, context });
      if (entity) {
        registry.upsert(entity);
        attachedEntityIds.set(player, entity.id);
      }
      return { key, profile, entity };
    },
    async detachPlayer(registry, player, profile, context) {
      const key = keyFor(player);
      const entityId = attachedEntityIds.get(player) ?? player.id;
      const entity = registry.get(entityId);
      let serialized: TProfile | undefined;
      try {
        serialized = config.serializeProfile?.({ key, player, profile, entity, context });
        if (serialized !== undefined) await config.saveProfile?.(key, serialized, player, context);
      } finally {
        if (removeEntityOnLeave) registry.remove(entityId);
        attachedEntityIds.delete(player);
      }
      return { key, profile: serialized, entity };
    }
  };
}
