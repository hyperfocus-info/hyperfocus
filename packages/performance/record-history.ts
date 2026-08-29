import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { appendPerformanceHistory, type PerformanceEvidenceHistory } from "./performance-history.ts";
import type { PerformanceEvidenceReport } from "./benchmark-report.ts";

const args = process.argv.slice(2);
const outArgument = args.find((argument) => argument.startsWith("--out="));
const outputPath = resolve(outArgument?.slice("--out=".length) ?? ".local/performance-history/history.json");
const inputPaths = args.filter((argument) => !argument.startsWith("--out=")).map((inputPath) => resolve(inputPath));
if (!inputPaths.length) throw new Error("record-history requires at least one performance evidence report path.");

const priorFile = Bun.file(outputPath);
const history = await priorFile.exists() ? await priorFile.json() as PerformanceEvidenceHistory : undefined;
const reports = await Promise.all(inputPaths.map(async (inputPath) => {
  const report = await Bun.file(inputPath).json() as PerformanceEvidenceReport<unknown, unknown, unknown>;
  if (report.schema !== "hyperfocus-performance-evidence-v1") throw new Error(`Unsupported performance report: ${inputPath}`);
  return report;
}));
const next = appendPerformanceHistory({ history, reports });
await mkdir(dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Recorded ${reports.length} report(s); retained ${next.entries.length} longitudinal entries at ${outputPath}`);
