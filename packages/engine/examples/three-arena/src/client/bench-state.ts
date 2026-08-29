import { state } from "./arena-state.ts";
import type { Player } from "./runtime-types.ts";

export function requireActivePlayer(): Player {
  if (!state.player) throw new Error("The Three Arena player is not initialized.");
  return state.player;
}
