import { analyzeWorld, catalogFor, filterChunks, primaryZone, zoneTextFor, type BandFilter } from "./world-analysis.ts";

type OutputFormat = "markdown" | "json";

const options = readOptions();
const analysis = analyzeWorld();
const chunks = filterChunks(analysis.chunks, options);
const needs = chunks.map((chunk) => {
  const zone = primaryZone(chunk);
  const catalog = catalogFor(zone);
  return {
    chunk: chunk.index,
    chunkId: chunk.id,
    band: chunk.band,
    zones: zoneTextFor(chunk),
    recommendation: chunk.recommendation,
    existingAssets: catalog.assets,
    craftpixSearch: catalog.craftpixSearch,
    assetDecision:
      catalog.assets.length > 0
        ? "Use existing registered world assets first; download only if the visual read cannot be expressed by these keys."
        : "No cataloged local asset match; download or register a local asset before runtime edits."
  };
});

if (options.format === "json") {
  console.log(JSON.stringify({ generatedAt: analysis.generatedAt, needs }, null, 2));
} else {
  console.log("# World Asset Needs");
  for (const need of needs) {
    console.log("");
    console.log(`## Chunk ${need.chunk} (${need.chunkId}) - ${need.band}`);
    console.log(`Zones: ${need.zones}`);
    console.log(`Action: ${need.recommendation}`);
    console.log(`Decision: ${need.assetDecision}`);
    console.log(`Existing: ${need.existingAssets.map((asset) => `${asset.image} (${asset.service})`).join(", ") || "-"}`);
    console.log(`Search if needed: ${need.craftpixSearch.join("; ")}`);
  }
}

function readOptions() {
  const format = (valueAfter("--format") ?? "markdown") as OutputFormat;
  if (!["markdown", "json"].includes(format)) throw new Error("Use --format markdown or json.");
  const band = (valueAfter("--band") ?? "all") as BandFilter;
  if (!["all", "sparse", "balanced", "dense"].includes(band)) throw new Error("Use --band all, sparse, balanced, or dense.");
  return {
    format,
    band,
    zone: valueAfter("--zone"),
    chunk: valueAfter("--chunk"),
    top: numberAfter("--top") ?? 4,
    sort: (valueAfter("--sort") ?? "priority") as "chunk" | "priority"
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
