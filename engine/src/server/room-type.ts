import type { RoomType } from "./types.ts";

export function createRoomType<TState, TInput = unknown, TEvent = unknown>(
  definition: RoomType<TState, TInput, TEvent>
): RoomType<TState, TInput, TEvent> {
  return definition;
}

export const createZoneType = createRoomType;
