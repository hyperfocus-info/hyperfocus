import { createMmoInventoryOps, type MmoInventoryMap } from "./inventory.ts";

export type MmoConsumableUseArgs<TActor, TContext, TDefinition> = {
  actor: TActor;
  inventory: MmoInventoryMap;
  itemId: string;
  definition: TDefinition;
  context: TContext | undefined;
};

export type MmoConsumableDefinition<TActor, TContext = unknown, TResult = unknown> = {
  consume?: number;
  canUse?: (args: MmoConsumableUseArgs<TActor, TContext, MmoConsumableDefinition<TActor, TContext, TResult>>) => boolean;
  apply?: (args: MmoConsumableUseArgs<TActor, TContext, MmoConsumableDefinition<TActor, TContext, TResult>>) => TResult | false | void;
};

export type MmoConsumableUseResult<TResult = unknown> =
  | {
      ok: true;
      itemId: string;
      consumed: number;
      result: TResult | void;
    }
  | {
      ok: false;
      itemId: string;
      consumed: 0;
      reason: "missing-definition" | "missing-item" | "blocked" | "apply-failed";
    };

function positiveInteger(value: number | undefined, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(Number(value)));
}

export function useMmoConsumable<TActor, TContext = unknown, TResult = unknown>(
  actor: TActor,
  inventory: MmoInventoryMap,
  itemId: string,
  definitions: Record<string, MmoConsumableDefinition<TActor, TContext, TResult>>,
  context?: TContext
): MmoConsumableUseResult<TResult> {
  const definition = definitions[itemId];
  if (!definition) return { ok: false, itemId, consumed: 0, reason: "missing-definition" };
  const consume = positiveInteger(definition.consume ?? 1);
  const inventoryOps = createMmoInventoryOps();
  if (consume > 0 && !inventoryOps.has(inventory, itemId, consume)) return { ok: false, itemId, consumed: 0, reason: "missing-item" };
  const args = { actor, inventory, itemId, definition, context };
  if (definition.canUse && !definition.canUse(args)) return { ok: false, itemId, consumed: 0, reason: "blocked" };
  const result = definition.apply?.(args);
  if (result === false) return { ok: false, itemId, consumed: 0, reason: "apply-failed" };
  if (consume > 0 && !inventoryOps.remove(inventory, itemId, consume)) return { ok: false, itemId, consumed: 0, reason: "missing-item" };
  return { ok: true, itemId, consumed: consume, result };
}
