export type ReprioritizeLifecycleState = { timer?: ReturnType<typeof setTimeout> };

export function createAssistantShutdownBarrier() {
  let complete: () => void = () => undefined;
  const completion = new Promise<void>((resolve) => { complete = resolve; });
  return { completion, complete };
}

export function createAssistantChatFlight(token: symbol) {
  const barrier = createAssistantShutdownBarrier();
  return { controller: new AbortController(), token, ...barrier };
}

export function trackAssistantManagerFlight(flights: Set<Promise<void>>, flight: Promise<void>) {
  flights.add(flight);
  void flight.finally(() => flights.delete(flight));
}

export type AssistantManagerShutdownWork = {
  reprioritizeStates: Map<string, ReprioritizeLifecycleState>;
  reprioritizeFlights: Set<Promise<void>>;
  bootstrapFlights: Iterable<Promise<void>>;
  jobBootstrapTimers: Map<string, ReturnType<typeof setTimeout>>;
  invalidatedAssistants: Set<string>;
  chatFlights: Iterable<{ controller: AbortController }>;
  chatCompletions: Iterable<Promise<void>>;
};

export function beginAssistantManagerShutdownWork(input: AssistantManagerShutdownWork) {
  for (const state of input.reprioritizeStates.values()) if (state.timer) clearTimeout(state.timer);
  for (const timer of input.jobBootstrapTimers.values()) clearTimeout(timer);
  input.jobBootstrapTimers.clear();
  for (const assistantId of input.reprioritizeStates.keys()) input.invalidatedAssistants.add(assistantId);
  input.reprioritizeStates.clear();
  for (const flight of input.chatFlights) flight.controller.abort();
}

export async function settleAssistantManagerShutdownWork(input: AssistantManagerShutdownWork) {
  await Promise.allSettled([...input.reprioritizeFlights, ...input.bootstrapFlights, ...input.chatCompletions]);
}
