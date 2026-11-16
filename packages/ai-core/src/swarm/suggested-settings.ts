import { isRecord } from "@hyperfocus/utilities/records";
/** Scheduling suggestions only; the trusted planner still qualifies actual difficulty. */
export function suggestSwarmSettings(goal: string, difficulty = "auto") {
  const complex = difficulty === "complex" || difficulty !== "bounded" && /\b(compare|competition|tournament|candidates?|performance|optimi[sz]|benchmark|profil(?:e|ing)|multi[- ]repo|cross[- ](?:project|repo)|three independent|3 independent)/i.test(goal);
  return {
    strategy: complex ? "tournament" as const : "investigation" as const,
    maxWorkers: complex ? 3 : 1,
    budget: { maxDurationMs: complex ? 3_600_000 : 1_800_000, maxTotalTokens: complex ? 1_000_000 : 250_000, maxTokensPerAgent: complex ? 400_000 : 250_000 },
    reason: complex ? "Comparison or broad investigation: three workers and larger bounded limits." : "Bounded investigation: one worker and smaller limits.",
  };
}

/** Host form adapter. A changed goal never replaces an explicit user choice. */
export function applySwarmSuggestedFields(current: Record<string, string>, edited: ReadonlySet<string>) {
  const suggestion = suggestSwarmSettings(current.goal ?? "", current.difficulty);
  const fields: Record<string,string> = {strategy:suggestion.strategy,maxWorkers:String(suggestion.maxWorkers),minutes:String(suggestion.budget.maxDurationMs / 60_000),totalTokens:String(suggestion.budget.maxTotalTokens),tokens:String(suggestion.budget.maxTokensPerAgent)};
  return {...current,...Object.fromEntries(Object.entries(fields).filter(([field])=>!edited.has(field)))};
}

/** Shared API/CLI defaults. Explicit settings, including saved legacy requests, are preserved. */
export function normalizeSwarmRequestDefaults(value: unknown) {
  if (!isRecord(value)) return value;
  const request = value;
  if (typeof request.goal !== "string") return value;
  const difficulty = typeof request.difficulty === "string" ? request.difficulty : "auto";
  const comparison = request.strategy === "tournament" || Array.isArray(request.hypotheses) && request.hypotheses.length > 1;
  const suggestion = suggestSwarmSettings(request.goal, difficulty === "auto" && comparison ? "complex" : difficulty);
  const budget = request.budget === undefined ? {} : request.budget;
  const normalizedBudget = budget && typeof budget === "object" && !Array.isArray(budget)
    ? { ...suggestion.budget, ...Object.fromEntries(Object.entries(budget).filter(([, field]) => field !== undefined)) }
    : budget;
  return { ...request, strategy: request.strategy === undefined ? suggestion.strategy : request.strategy, maxWorkers: request.maxWorkers === undefined ? suggestion.maxWorkers : request.maxWorkers, budget: normalizedBudget };
}
