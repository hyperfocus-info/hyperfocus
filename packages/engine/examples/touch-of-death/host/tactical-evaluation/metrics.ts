export function freshMetrics() {
  const actions: Record<string, number> = {}, hitsByMove: Record<string, number> = {};
  const stages: Record<string, { calls: number; milliseconds: number }> = {};
  return { observations: 0, brainMilliseconds: 0, observeMilliseconds: 0, damageDealt: 0, damageTaken: 0, hits: 0, punishes: 0,
    actions, hitsByMove, stages };
}

export function sessionSetStatus(winner: string | undefined, ticks: number, cap: number) {
  return { capped: !winner && ticks >= cap, partial: !winner && ticks < cap };
}

/** Capped sets remain separate and never masquerade as wins or draws. */
export function summarize(trials: Array<{ winner?: string; partial?: boolean; candidateSeat: number; ticks: number; milliseconds: number; metrics: ReturnType<typeof freshMetrics>[] }>) {
  let wins = 0, losses = 0, draws = 0, capped = 0, partial = 0, ticks = 0, milliseconds = 0, allBrainMilliseconds = 0;
  const metrics = freshMetrics();
  for (const trial of trials) {
    ticks += trial.ticks;milliseconds += trial.milliseconds;
    allBrainMilliseconds += trial.metrics.reduce((sum, row) => sum + row.brainMilliseconds + row.observeMilliseconds, 0);
    if (!trial.winner) { if (trial.partial) partial++;else capped++; }
    else if (trial.winner === 'draw') draws++;
    else if (trial.winner === (trial.candidateSeat === 0 ? 'player' : 'opponent')) wins++;
    else losses++;
    const row = trial.metrics[trial.candidateSeat]!;
    for (const key of ['observations', 'brainMilliseconds', 'observeMilliseconds', 'damageDealt', 'damageTaken', 'hits', 'punishes'] as const) metrics[key] += row[key];
    for (const key of ['actions', 'hitsByMove'] as const) for (const [id, count] of Object.entries(row[key])) metrics[key][id] = (metrics[key][id] ?? 0) + count;
    for (const [id, stage] of Object.entries(row.stages)) {
      const total = metrics.stages[id] ??= { calls: 0, milliseconds: 0 };total.calls += stage.calls;total.milliseconds += stage.milliseconds;
    }
  }
  const completed = wins + losses + draws, winRate = completed ? wins / completed : null;
  let winRate95: [number, number] | null = null;
  if (winRate !== null) {
    const z = 1.96, divisor = 1 + z * z / completed, center = (winRate + z * z / (2 * completed)) / divisor;
    const half = z * Math.sqrt(winRate * (1 - winRate) / completed + z * z / (4 * completed * completed)) / divisor;
    winRate95 = [center - half, center + half];
  }
  const choices = Object.values(metrics.actions).reduce((sum, count) => sum + count, 0);
  const entropy = Object.values(metrics.actions).reduce((sum, count) => { const p = count / choices;return sum - p * Math.log2(p); }, 0);
  return { attempted: trials.length, completed, capped, partial, wins, losses, draws, winRate, winRate95,
    damageDifferential: metrics.damageDealt - metrics.damageTaken,
    damageDifferentialPerAttemptedSet: trials.length ? (metrics.damageDealt - metrics.damageTaken) / trials.length : null,
    punishRate: metrics.hits ? metrics.punishes / metrics.hits : null,
    distinctDamagingMoves: Object.keys(metrics.hitsByMove).length, requestedActionEntropy: entropy,
    simulatedSeconds: ticks / 60, wallMilliseconds: milliseconds, gamesPerMinute: milliseconds ? completed * 60000 / milliseconds : 0,
    simulatedTicksPerWallSecond: milliseconds ? ticks * 1000 / milliseconds : 0,
    allBrainMilliseconds, engineAndHostMilliseconds: Math.max(0, milliseconds - allBrainMilliseconds),
    observationCallsPerSimulatedSecond: ticks ? metrics.observations / (ticks / 60) : 0,
    fullScoresPerSimulatedSecond: ticks && metrics.stages.selection ? metrics.stages.selection.calls / (ticks / 60) : null,
    metrics };
}
