import { analyzeWorld, catalogFor, filterChunks, parseOption, primaryZone, topComponents, zoneTextFor, type ChunkScore } from "./world-analysis.ts";

const options = readOptions();
const analysis = analyzeWorld();
const chunks = filterChunks(analysis.chunks, options);
const packets = chunks.filter((chunk) => options.includeBalanced || chunk.band !== "balanced").map(packetFor);

if (options.format === "json") {
  console.log(JSON.stringify({ generatedAt: analysis.generatedAt, packets }, null, 2));
} else {
  printMarkdown();
}

function readOptions() {
  const format = parseOption(valueAfter("--format"), ["markdown", "json"], "markdown", "Use --format markdown or json.");
  const band = parseOption(valueAfter("--band"), ["all", "sparse", "balanced", "dense"], "all", "Use --band all, sparse, balanced, or dense.");
  const sort = parseOption(valueAfter("--sort"), ["chunk", "priority"], "priority", "Use --sort chunk or priority.");
  return {
    format,
    band,
    zone: valueAfter("--zone"),
    chunk: valueAfter("--chunk"),
    top: numberAfter("--top") ?? 4,
    sort,
    includeBalanced: process.argv.includes("--include-balanced")
  };
}

function packetFor(chunk: ChunkScore) {
  const zone = primaryZone(chunk);
  const catalog = catalogFor(zone);
  const id = `world-${chunk.band}-chunk-${chunk.index}-${zone}`;
  const objective =
    chunk.band === "dense"
      ? `Spread repeated ${zone} reads out of chunk ${chunk.index} without weakening the primary landmark.`
      : `Add one readable ${zone} cause to chunk ${chunk.index} and link it to lore plus quest potential.`;

  return {
    id,
    objective,
    band: chunk.band,
    zone,
    chunk: chunk.index,
    chunkId: chunk.id,
    evidence: {
      zones: zoneTextFor(chunk),
      components: topComponents(chunk),
      anchors: chunk.anchors,
      nearbyAnchors: chunk.nearbyAnchors,
      why: chunk.why,
      recommendation: chunk.recommendation
    },
    why: `WHY: ${chunk.why} ${chunk.recommendation}`,
    ownedPaths: ownedPathsFor(chunk),
    deterministicCommands: [
      `bun.cmd .\\.agents\\skills\\world-building\\scripts\\heat-map.ts --chunk ${chunk.index} --format markdown`,
      `bun.cmd .\\.agents\\skills\\world-building\\scripts\\asset-needs.ts --chunk ${chunk.index}`,
      `bun.cmd .\\.agents\\skills\\world-building\\scripts\\landmark-snippets.ts --chunk ${chunk.index} --format ts`,
      `bun.cmd .\\.agents\\skills\\world-building\\scripts\\quest-seed.ts --chunk ${chunk.index} --dry-run`
    ],
    candidateContent: {
      additions: catalog.additions,
      spread: catalog.spread,
      questHooks: chunk.questHooks,
      assets: catalog.assets,
      craftpixSearch: catalog.craftpixSearch
    },
    acceptance: ["clear WHY before edits", "future quest idea added or updated when quest potential exists", "bun.cmd run build", "bun.cmd test src\\tests", "screenshot:world if camera-readable surfaces change"]
  };
}

function ownedPathsFor(chunk: ChunkScore) {
  const paths = ["./docs/future-quest-ideas.md", "./docs/world-building.md"];
  if (chunk.band !== "balanced") paths.unshift("./src/data/world-landmarks.ts");
  if (primaryZone(chunk) === "void-rift" || primaryZone(chunk) === "canaan-desert") paths.push("./docs/world-travel.md");
  return paths;
}

function printMarkdown() {
  console.log("# World-Building Handoff Packets");
  console.log(`Generated: ${analysis.generatedAt}`);
  for (const packet of packets) {
    console.log("");
    console.log(`## ${packet.id}`);
    console.log(`Objective: ${packet.objective}`);
    console.log(packet.why);
    console.log(`Evidence: ${packet.evidence.zones}; ${packet.evidence.components}`);
    console.log(`Owned paths: ${packet.ownedPaths.join(", ")}`);
    console.log(`Commands:`);
    for (const command of packet.deterministicCommands) console.log(`- \`${command}\``);
    console.log(`Quest hooks: ${packet.candidateContent.questHooks.join(" / ") || "-"}`);
    console.log(`Existing assets: ${packet.candidateContent.assets.map((asset) => `${asset.image}:${asset.service}`).join(", ") || "-"}`);
    console.log(`Craftpix searches if needed: ${packet.candidateContent.craftpixSearch.join("; ")}`);
    console.log(`Acceptance: ${packet.acceptance.join("; ")}`);
  }
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
