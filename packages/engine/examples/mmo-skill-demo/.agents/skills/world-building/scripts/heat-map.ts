import { escapeCell } from "./world-analysis.ts";
import {
  analyzeWorld,
  filterChunks,
  parseOption,
  topComponents,
  withChunks,
  zoneTextFor,
  type WorldAnalysis
} from "./world-analysis.ts";

type OutputFormat = "markdown" | "json" | "actions";

const options = readOptions();
const full = analyzeWorld({ sparseZ: options.sparseZ, denseZ: options.denseZ });
const selected = filterChunks(full.chunks, options);
const result = withChunks(full, selected);

printResult(options.format, result);

if (options.failOnExtreme) {
  const extreme = full.chunks.filter((chunk) => chunk.normalized <= -1.5 || chunk.normalized >= 1.5);
  if (extreme.length > 0) process.exitCode = 1;
}

function readOptions() {
  const format = parseOption(valueAfter("--format"), ["markdown", "json", "actions"], "markdown", "Use --format markdown, json, or actions.");
  const band = parseOption(valueAfter("--band"), ["all", "sparse", "balanced", "dense"], "all", "Use --band all, sparse, balanced, or dense.");
  const sort = parseOption(valueAfter("--sort"), ["chunk", "priority"], "chunk", "Use --sort chunk or priority.");

  return {
    format,
    band,
    zone: valueAfter("--zone"),
    chunk: valueAfter("--chunk"),
    top: numberAfter("--top"),
    sort,
    sparseZ: numberAfter("--sparse-z") ?? -0.75,
    denseZ: numberAfter("--dense-z") ?? 0.9,
    failOnExtreme: process.argv.includes("--fail-on-extreme")
  };
}

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function numberAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  const raw = process.argv[index + 1];
  if (raw === undefined || raw.startsWith("--")) throw new Error(`${flag} requires a number.`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a number.`);
  return parsed;
}

function printResult(outputFormat: OutputFormat, data: WorldAnalysis) {
  if (outputFormat === "json") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (outputFormat === "actions") {
    printActions(data);
    return;
  }

  console.log("# MMO World Density Heat Map");
  console.log(`Revision: ${data.map.revision}`);
  console.log(`Average score: ${data.averageScore}; stdev: ${data.standardDeviation}; sparse ${data.totals.sparse}; dense ${data.totals.dense}`);
  console.log("");
  console.log("| Chunk | Tiles | Band | Score | Zones | Anchors | NPCs | Landmarks | Services | WHY | Recommendation | Quest hooks |");
  console.log("| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- |");
  for (const chunk of data.chunks) {
    console.log(
      `| ${chunk.index} (${chunk.id}) | ${chunk.xRange} x ${chunk.yRange} | ${chunk.band} | ${chunk.score} | ${escapeCell(zoneTextFor(chunk))} | ${
        escapeCell(chunk.anchors.join(", ") || "-")
      } | ${chunk.npcCount} | ${chunk.landmarkCount} | ${chunk.serviceCount} | ${escapeCell(chunk.why)} | ${escapeCell(chunk.recommendation)} | ${escapeCell(
        chunk.questHooks.join("; ") || "-"
      )} |`
    );
  }
}

function printActions(data: WorldAnalysis) {
  console.log(`# MMO World Density Actions`);
  console.log(`Revision: ${data.map.revision}`);
  console.log(`Sparse: ${data.totals.sparse}; dense: ${data.totals.dense}; shown: ${data.chunks.length}`);
  for (const chunk of data.chunks) {
    if (chunk.band === "balanced") continue;
    console.log("");
    console.log(`## Chunk ${chunk.index} (${chunk.id}) - ${chunk.band}`);
    console.log(`Zones: ${zoneTextFor(chunk)}`);
    console.log(`Signals: ${topComponents(chunk)}`);
    console.log(`WHY: ${chunk.why}`);
    console.log(`Action: ${chunk.recommendation}`);
    if (chunk.questHooks.length > 0) console.log(`Quest: ${chunk.questHooks.join(" / ")}`);
  }
}
