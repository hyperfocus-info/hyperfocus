import type { CombatAiLearning } from './model.ts';

/** Keep durable evidence and exact continuation state; completed audit history stays in the live controller. */
export function compactLearning(memory: CombatAiLearning): CombatAiLearning {
  const traces: CombatAiLearning['traces'] = [];
  for (const attempt of [memory.pending, memory.next]) {
    if (!attempt) continue;
    const trace = memory.traces.find(row => row.status === 'pending' && row.frame === attempt.frame && row.chosen === attempt.action);
    if (trace && !traces.includes(trace)) traces.push(trace);
  }
  // Filter before cloning so completed alternatives never enter the serializer.
  return structuredClone({ ...memory, traces });
}
