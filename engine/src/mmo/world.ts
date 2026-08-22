import type { MmoEntityData } from "./types.ts";
import type { RoomType } from "../server/types.ts";
import { createMmoGameplayKit, type MmoGameplayKit, type MmoGameplayKitConfig } from "./gameplay.ts";
import { createMmoRoomType, type GeneratedMmoRoomType, type MmoRoomTypeConfig } from "./room.ts";

type StoredMmoRoomType = RoomType<any, any, any>;

export type MmoWorldConfig<TWorldData = unknown> = {
  id?: string;
  data?: TWorldData;
  gameplay?: MmoGameplayKit | MmoGameplayKitConfig;
  rooms?: readonly StoredMmoRoomType[];
};

export type MmoWorld<TWorldData = unknown> = {
  id: string;
  data: TWorldData | undefined;
  gameplay: MmoGameplayKit;
  registerRoomType<TRoomType extends StoredMmoRoomType>(roomType: TRoomType): TRoomType;
  createRoomType<
    TRoomWorld = Record<string, never>,
    TInput = unknown,
    TProfile = unknown,
    TPublic extends MmoEntityData = MmoEntityData,
    TOwner extends MmoEntityData = MmoEntityData,
    TPrivate extends MmoEntityData = MmoEntityData,
    TEvent = unknown
  >(config: MmoRoomTypeConfig<TRoomWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent>): GeneratedMmoRoomType<TRoomWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent>;
  getRoomType(name: string): StoredMmoRoomType | undefined;
  roomTypes(): StoredMmoRoomType[];
};

function isGameplayKit(value: MmoGameplayKit | MmoGameplayKitConfig | undefined): value is MmoGameplayKit {
  return Boolean(value && "awardXp" in value && "rollLoot" in value);
}

export function createMmoWorld<TWorldData = unknown>(config: MmoWorldConfig<TWorldData> = {}): MmoWorld<TWorldData> {
  const roomTypes = new Map<string, StoredMmoRoomType>();
  const gameplay = isGameplayKit(config.gameplay) ? config.gameplay : createMmoGameplayKit(config.gameplay);

  const world: MmoWorld<TWorldData> = {
    id: config.id ?? "mmo-world",
    data: config.data,
    gameplay,
    registerRoomType(roomType) {
      roomTypes.set(roomType.name, roomType);
      return roomType;
    },
    createRoomType(roomConfig) {
      const roomType = createMmoRoomType(roomConfig);
      roomTypes.set(roomType.name, roomType);
      return roomType;
    },
    getRoomType(name) {
      return roomTypes.get(name);
    },
    roomTypes() {
      return [...roomTypes.values()];
    }
  };

  for (const room of config.rooms ?? []) world.registerRoomType(room);
  return world;
}
