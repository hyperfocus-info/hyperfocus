import type { PlayableBehaviorCommand2D, PlayableEntity2D } from "./runtime-2d-contracts.ts";

type TransformCommand2D = Extract<PlayableBehaviorCommand2D, { type: "set-transform" }>;
const FIELDS = ["x", "y", "rotation", "scale"] as const;

/** Validation runs for the whole behavior batch before any command mutates the world. */
export function validateTransformCommand2D(command: TransformCommand2D, target: PlayableEntity2D) {
  if (command.entityId !== undefined && (typeof command.entityId !== "string" || !command.entityId)) throw new Error("Playable 2D transform entityId is invalid.");
  for (const key of Object.keys(command)) {
    if (key !== "type" && key !== "entityId" && !FIELDS.some((field) => field === key)) {
      throw new Error(`Playable 2D transform has unsupported field ${key}.`);
    }
  }
  if (!FIELDS.some((field) => command[field] !== undefined)) throw new Error("Playable 2D transform needs a field.");
  for (const field of FIELDS) {
    const value = command[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e9 || (field === "scale" && value <= 0))) {
      throw new Error(`Playable 2D transform ${field} must be finite, within +/-1e9, and scale must be positive.`);
    }
  }
  if (command.scale !== undefined && (!Number.isFinite(target.width * command.scale) || !Number.isFinite(target.height * command.scale))) {
    throw new Error("Playable 2D transform scaled bounds overflow.");
  }
}
