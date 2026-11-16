import type { SwarmBudgetRejection } from "@hyperfocus/ai-core/swarm";

const budgetErrors = new WeakSet<Error>();

/** Internal admission identity; only an aggregate limit stops sibling tasks. */
export function createSwarmModelBudgetError(rejection: SwarmBudgetRejection) {
  const error = Object.assign(new Error(`MODEL_BUDGET_EXHAUSTED: ${rejection.scope} ${rejection.dimension}; requested ${rejection.requested}, used ${rejection.used}, limit ${rejection.limit}, remaining ${rejection.remaining} (${rejection.phase}).`), {
    name: "SwarmModelBudgetError",
  }, { rejection } as const);
  budgetErrors.add(error);
  return error;
}

export type SwarmModelBudgetError = ReturnType<typeof createSwarmModelBudgetError>;

export function isSwarmModelBudgetError(value: unknown): value is SwarmModelBudgetError {
  return value instanceof Error && budgetErrors.has(value);
}
