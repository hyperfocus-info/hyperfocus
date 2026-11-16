/** Only this audited work counter may differ; it never feeds CCD budgets or policy. */
export function physicsWorkCounters(argument: string): readonly string[] {
  const counters = argument.split(',').filter(Boolean);
  if (counters.some(counter => counter !== 'ccdAngularTests')) throw Error('Only ccdAngularTests is an approved work-counter exception.');
  return [...new Set(counters)];
}
export function comparablePhysics(checkpoint: any, counters: readonly string[]) {
  if (!counters.length) return checkpoint;
  const diagnostics = { ...checkpoint.diagnostics };
  for (const counter of counters) delete diagnostics[counter];
  return { ...checkpoint, diagnostics };
}
