import { resolve } from 'node:path';

function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
export function benchmarkSummary(report: any) {
  const rows = (label: string) => report.results.filter((row: any) => row.label === label);
  const quantile = (label: string, key: string) => median(rows(label).map((row: any) => row[key]));
  const p95Control = quantile('control', 'p95'), p95Candidate = quantile('candidate', 'p95');
  const p99Control = quantile('control', 'p99'), p99Candidate = quantile('candidate', 'p99');
  const raw = rows('control')[0].rawPhysics;
  return { control: report.control.engineSha256, candidate: report.candidate.engineSha256, trials: report.results.length,
    controlWallMilliseconds: report.controlWallMilliseconds, candidateWallMilliseconds: report.candidateWallMilliseconds,
    wallReductionFraction: report.wallReductionFraction, reachesFivePercentWallThreshold: report.wallReductionFraction >= .05,
    p95: { control: p95Control, candidate: p95Candidate, reductionFraction: 1 - p95Candidate / p95Control },
    p99: { control: p99Control, candidate: p99Candidate, reductionFraction: 1 - p99Candidate / p99Control },
    rawPhysicsAllExact: report.results.every((row: any) => row.rawPhysics.every((physics: any, i: number) => physics.hash === raw[i].hash)),
    allowedWorkCounters: report.allowedWorkCounters, contention: report.contention,
    interpretation: 'Wall threshold is one metric; final qualification also requires tail and parity review. Four runs per variant do not establish deployment-wide tail guarantees.' };
}
if (import.meta.main) {
  const args = process.argv.slice(2), outputIndex = args.indexOf('--out');
  const output = outputIndex < 0 ? undefined : args.splice(outputIndex, 2)[1];
  const rows = [];
  for (const path of args) { const row = { path, ...benchmarkSummary(await Bun.file(resolve(path)).json()) };rows.push(row);console.log(JSON.stringify(row)); }
  if (output) await Bun.write(resolve(output), JSON.stringify(rows, null, 2));
}
