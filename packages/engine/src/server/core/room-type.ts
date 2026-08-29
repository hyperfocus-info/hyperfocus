import type { RoomType, RoomTypeDefinition } from "./types.ts";

export function createRoomType<TState, TInput = unknown, TEvent = unknown>(
  definition: RoomTypeDefinition<TState, TInput, TEvent>
): RoomType<TState, TInput, TEvent> {
  return {
    ...definition,
    getSnapshot: definition.getSnapshot ?? ((ctx) => ctx.state),
  };
}

export const createZoneType = createRoomType;

export function createProjectedRoomType<TState, TSnapshot, TInput = unknown, TEvent = unknown>(
  definition: RoomType<TState, TInput, TEvent, TSnapshot>
): RoomType<TState, TInput, TEvent, TSnapshot> {
  return definition;
}
