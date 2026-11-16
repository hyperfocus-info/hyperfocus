import { resolve } from 'node:path';
import { summarize } from './metrics.ts';

/** Recompute derived metrics from preserved raw trials without rerunning fights. */
const args = process.argv.slice(2), firstIndex = args.indexOf('--first');
const first = firstIndex < 0 ? 0 : Number(args.splice(firstIndex, 2)[1]);
if (!Number.isSafeInteger(first) || first < 0) throw Error('Invalid --first.');
for (const path of args) {
  const file = Bun.file(resolve(path)), report = await file.json();
  if (!Array.isArray(report.trials)) throw Error(`No raw trials in ${path}`);
  report.summary = summarize(first ? report.trials.slice(0, first) : report.trials);
  if (!first) await Bun.write(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ path, digest: report.engineSha256, first: first || null, summary: report.summary }));
}
