import { defineSchema } from "@hyperfocus/engine/protocol";

export type FieldPlayer = { id: string; x: number; y: number; hp: number; name: string };
export type FieldState = { players: Record<string, FieldPlayer>; tick: number };
export type FieldInput = { dx?: number; dy?: number };

export const fieldSchema = defineSchema<FieldState>({
  players: {
    type: "map",
    key: "string",
    value: {
      type: "entity",
      fields: { id: "string:32", x: "f32", y: "f32", hp: "u16", name: "string:32" },
    },
  },
  tick: "u32",
});
