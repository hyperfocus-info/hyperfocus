import { analyzeWorld, catalogFor, filterChunks, primaryZone, type BandFilter, type ChunkScore } from "./world-analysis.ts";
import { mmoSkillDemoRegionConfig } from "../../../../src/data/world.ts";

type OutputFormat = "ts" | "json";

const options = readOptions();
const analysis = analyzeWorld();
const chunks = filterChunks(analysis.chunks, options).filter((chunk) => chunk.band !== "balanced");
const snippets = chunks.map(snippetFor);

if (options.format === "json") {
  console.log(JSON.stringify({ generatedAt: analysis.generatedAt, snippets }, null, 2));
} else {
  console.log("// Candidate worldLandmarkPlacements entries. Review WHY and screenshot before committing.");
  for (const snippet of snippets) {
    console.log("");
    console.log(`// ${snippet.id}`);
    console.log(`// WHY: ${snippet.why}`);
    console.log(snippet.ts);
  }
}

function snippetFor(chunk: ChunkScore) {
  const zone = primaryZone(chunk);
  const catalog = catalogFor(zone);
  const asset = catalog.assets[0];
  const anchor = chunk.band === "dense" ? chunk.nearbyAnchors[0] : chunk.nearbyAnchors[0];
  const target = targetTileFor(chunk);
  const anchorConfig = mmoSkillDemoRegionConfig.anchors.find((candidate) => candidate.id === anchor.id);
  if (!anchorConfig || !asset) {
    return {
      id: `chunk-${chunk.index}-${zone}-manual`,
      why: chunk.why,
      ts: `// No deterministic local asset mapping for ${zone}; run asset-needs.ts and choose an asset first.`
    };
  }

  const dx = Math.round((target.x - anchorConfig.tileX) * mmoSkillDemoRegionConfig.tileSize);
  const dy = Math.round((target.y - anchorConfig.tileY) * mmoSkillDemoRegionConfig.tileSize);
  const why = `${chunk.why} ${chunk.recommendation}`;
  const ts = `{ anchorId: "${anchor.id}", image: "${asset.image}", visualId: "${asset.visualId}", dx: ${dx}, dy: ${dy}, width: ${asset.width}, height: ${asset.height}, kind: "${asset.kind}", service: "${asset.service}", glyph: "${asset.glyph}" },`;

  return {
    id: `chunk-${chunk.index}-${zone}-${asset.service.replace(/[^a-z0-9]+/g, "-")}`,
    chunk: chunk.index,
    zone,
    anchorId: anchor.id,
    target,
    asset,
    why,
    ts
  };
}

function targetTileFor(chunk: ChunkScore) {
  const [startX, endX] = chunk.xRange.split("-").map(Number);
  const [startY, endY] = chunk.yRange.split("-").map(Number);
  return {
    x: Math.round((startX + endX) / 2),
    y: Math.round((startY + endY) / 2)
  };
}

function readOptions() {
  const format = (valueAfter("--format") ?? "ts") as OutputFormat;
  if (!["ts", "json"].includes(format)) throw new Error("Use --format ts or json.");
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
