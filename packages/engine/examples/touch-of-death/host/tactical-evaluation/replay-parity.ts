import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const [leftPath, rightPath] = process.argv.slice(2);
if (!leftPath || !rightPath) throw Error('Supply two evaluation artifacts.');
const left = await Bun.file(resolve(leftPath)).json(), right = await Bun.file(resolve(rightPath)).json();
function outcomes(artifact: any) {
  return artifact.trials.map((trial: any) => ({ seed: trial.seed, candidateSeat: trial.candidateSeat, ticks: trial.ticks, winner: trial.winner,
    metrics: trial.metrics.map((row: any) => { const { brainMilliseconds, observeMilliseconds, stages, ...facts } = row;return { ...facts, stages: Object.fromEntries(Object.entries(stages).map(([stage, value]: [string, any]) => [stage, value.calls])) }; }) }));
}
assert.deepEqual(outcomes(left), outcomes(right), 'Seeded outcomes/actions/contacts/decision counts differ.');
console.log(JSON.stringify({ left: left.engineSha256, right: right.engineSha256, previousAdaptiveSha256: right.previousAdaptiveSha256, sets: left.trials.length,
  parity: 'Exact seeded winners, ticks, both-seat actions, observations, damage, contacts, punishes and decision counts; timings excluded. This does not compare every engine checkpoint.' }));
