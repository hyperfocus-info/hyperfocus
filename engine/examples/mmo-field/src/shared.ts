import { createRoomType } from "@hyperfocus/engine/server";
import { truncateUtf8 } from "../../text-utils.ts";
import { fieldSchema, type FieldInput, type FieldState } from "./schema.ts";

export { fieldSchema, type FieldInput, type FieldPlayer, type FieldState } from "./schema.ts";
export const FIELD_INTEREST_RADIUS = 320;

const inputByState = new WeakMap<FieldState, Map<string, { dx: number; dy: number }>>();

function inputsFor(state: FieldState) {
  let inputs = inputByState.get(state);
  if (!inputs) {
    inputs = new Map();
    inputByState.set(state, inputs);
  }
  return inputs;
}

function normalizeAxis(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

export const fieldRoom = createRoomType<FieldState, FieldInput>({
  name: "field",
  schema: fieldSchema,
  maxPlayers: 100,
  createState: () => ({ players: Object.create(null) as FieldState["players"], tick: 0 }),
  onJoin(ctx, player) {
    ctx.state.players[player.id] = { id: player.id, x: 0, y: 0, hp: 100, name: truncateUtf8(player.userId.trim(), 32) };
    inputsFor(ctx.state).set(player.id, { dx: 0, dy: 0 });
  },
  onLeave(ctx, player) {
    delete ctx.state.players[player.id];
    inputsFor(ctx.state).delete(player.id);
  },
  onInput(ctx, player, input) {
    if (!ctx.state.players[player.id]) return;
    const dx = normalizeAxis(input?.dx);
    const dy = normalizeAxis(input?.dy);
    const length = Math.hypot(dx, dy);
    inputsFor(ctx.state).set(player.id, length > 1 ? { dx: dx / length, dy: dy / length } : { dx, dy });
  },
  update(ctx, dt) {
    const distance = (Number.isFinite(dt) && dt > 0 ? dt : 0) * 80;
    for (const [playerId, input] of inputsFor(ctx.state)) {
      const actor = ctx.state.players[playerId];
      if (!actor) continue;
      actor.x += input.dx * distance;
      actor.y += input.dy * distance;
    }
    ctx.state.tick = (ctx.state.tick + 1) >>> 0;
  },
  getInterestTarget(ctx, player) {
    const actor = ctx.state.players[player.id] ?? { x: 0, y: 0 };
    return { x: actor.x, y: actor.y, radius: FIELD_INTEREST_RADIUS };
  },
  getSnapshot(ctx, player) {
    const observer = ctx.state.players[player.id];
    if (!observer) return { players: Object.create(null) as FieldState["players"], tick: ctx.state.tick };
    const players = Object.create(null) as FieldState["players"];
    const radiusSquared = FIELD_INTEREST_RADIUS * FIELD_INTEREST_RADIUS;
    for (const candidate of Object.values(ctx.state.players)) {
      const dx = candidate.x - observer.x;
      const dy = candidate.y - observer.y;
      if (candidate.id === observer.id || dx * dx + dy * dy <= radiusSquared) players[candidate.id] = candidate;
    }
    return { players, tick: ctx.state.tick };
  }
});
