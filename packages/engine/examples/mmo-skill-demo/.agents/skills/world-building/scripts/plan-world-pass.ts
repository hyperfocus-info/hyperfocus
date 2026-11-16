import { analyzeWorld, catalogFor, filterChunks, parseOption, primaryZone, topComponents, zoneTextFor, type ChunkScore } from "./world-analysis.ts";

type PassScope = "review" | "landmarks" | "quests";

if (import.meta.main) {
  const options = readOptions();
  const analysis = analyzeWorld();
  const packets = filterChunks(analysis.chunks, options)
    .filter((chunk) => options.includeBalanced || chunk.band !== "balanced")
    .map((chunk) => createWorldPassPacket({ chunk, scope: options.scope }));
  if (options.format === "json") console.log(JSON.stringify({ generatedAt: analysis.generatedAt, packets }, null, 2));
  else printMarkdown(analysis.generatedAt, packets);
}

export function createWorldPassPacket({ chunk, scope = "review" }: { chunk: ChunkScore; scope?: PassScope }) {
  const zone = primaryZone(chunk);
  const catalog = catalogFor(zone);
  const commands = [`bun.cmd .\\.agents\\skills\\world-building\\scripts\\heat-map.ts --chunk ${chunk.index} --format markdown`];
  if (scope === "landmarks") {
    commands.push(
      `bun.cmd .\\.agents\\skills\\world-building\\scripts\\asset-needs.ts --chunk ${chunk.index}`,
      `bun.cmd .\\.agents\\skills\\world-building\\scripts\\landmark-snippets.ts --chunk ${chunk.index} --format ts`
    );
  } else if (scope === "quests") {
    commands.push(`bun.cmd .\\.agents\\skills\\world-building\\scripts\\quest-seed.ts --chunk ${chunk.index} --dry-run`);
  }
  return {
    id: `world-${scope}-${chunk.band}-chunk-${chunk.index}-${zone}`,
    scope,
    objective: objectiveFor(chunk, zone, scope),
    band: chunk.band,
    zone,
    chunk: chunk.index,
    chunkId: chunk.id,
    evidence: {
      zones: zoneTextFor(chunk), components: topComponents(chunk), anchors: chunk.anchors,
      nearbyAnchors: chunk.nearbyAnchors, why: chunk.why, recommendation: chunk.recommendation
    },
    ownedPaths: scope === "review" ? [] : [
      scope === "quests" ? "./src/data/world-quests.ts" : "./src/data/world-landmarks.ts",
      "./docs/world-building.md"
    ],
    deterministicCommands: commands,
    candidateContent: {
      additions: catalog.additions, spread: catalog.spread, questHooks: chunk.questHooks,
      assets: catalog.assets, craftpixSearch: catalog.craftpixSearch
    },
    acceptance: acceptanceFor(scope),
    verification: verificationFor(scope)
  };
}

function objectiveFor(chunk: ChunkScore, zone: string, scope: PassScope) {
  if (scope === "review") return `Assess ${zone} chunk ${chunk.index}: preserve intentional space or identify one evidenced content change.`;
  if (scope === "quests") return `Connect the requested quest behavior to ${zone} chunk ${chunk.index} and its existing world constraints.`;
  return chunk.band === "dense"
    ? `Spread repeated ${zone} reads out of chunk ${chunk.index} without weakening the primary landmark.`
    : `Improve the requested landmark read in ${zone} chunk ${chunk.index} using nearby ecology and player goals.`;
}

function acceptanceFor(scope: PassScope) {
  if (scope === "review") return ["Report local evidence, intentional empty space and any bounded recommendation; no edits are assigned."];
  const acceptance = ["The requested change fits existing zone constraints and player goals; update affected world notes."];
  if (scope === "landmarks") acceptance.push("Inspect the changed area's landmark, service and danger reads in play; preserve unrelated content.");
  else acceptance.push(
    "Exercise affected quest triggers, gates and rewards through gameplay, including a relevant blocked or recovery path.",
    "Update future quest notes only when the change creates or revises a concrete future throughline."
  );
  return acceptance;
}

function verificationFor(scope: PassScope) {
  if (scope === "review") return [];
  return [
    {
      when: scope === "quests" ? "quest data or behavior changes" : "landmark data or rendering changes",
      command: scope === "quests"
        ? "bun.cmd test ./src/tests/shared-world-replication.test.ts"
        : "bun.cmd test ./src/tests/render-actors.test.ts ./src/tests/render.test.ts",
      purpose: "Start with this owning coverage, then add or run the specific regression for the changed behavior."
    },
    { when: "runtime source or content changes", command: "bun.cmd run build", purpose: "Verify the changed example still bundles." },
    {
      when: "camera-readable surfaces change",
      command: "bun.cmd run screenshot:world -- --only <area-id> --base-url <managed-client-url>",
      purpose: "Use the affected capture area and actual served URL; inspect the result, not just command success."
    }
  ];
}

function readOptions() {
  return {
    format: parseOption(valueAfter("--format"), ["markdown", "json"], "markdown", "Use --format markdown or json."),
    scope: parseOption(valueAfter("--scope"), ["review", "landmarks", "quests"], "review", "Use --scope review, landmarks, or quests."),
    band: parseOption(valueAfter("--band"), ["all", "sparse", "balanced", "dense"], "all", "Use --band all, sparse, balanced, or dense."),
    zone: valueAfter("--zone"), chunk: valueAfter("--chunk"), top: numberAfter("--top") ?? 4,
    sort: parseOption(valueAfter("--sort"), ["chunk", "priority"], "priority", "Use --sort chunk or priority."),
    includeBalanced: process.argv.includes("--include-balanced")
  };
}

function printMarkdown(generatedAt: string, packets: ReturnType<typeof createWorldPassPacket>[]) {
  console.log(`# World-Building Handoff Packets\nGenerated: ${generatedAt}`);
  for (const packet of packets) {
    console.log(`\n## ${packet.id}\nScope: ${packet.scope}\nObjective: ${packet.objective}`);
    console.log(`Evidence: ${packet.evidence.zones}; ${packet.evidence.components}\nContext: ${packet.evidence.why}`);
    console.log(`Owned paths: ${packet.ownedPaths.join(", ") || "none (review only)"}\nDiscovery commands:`);
    for (const command of packet.deterministicCommands) console.log(`- \`${command}\``);
    console.log(`Optional quest hooks: ${packet.candidateContent.questHooks.join(" / ") || "-"}`);
    console.log(`Existing assets: ${packet.candidateContent.assets.map((asset) => `${asset.image}:${asset.service}`).join(", ") || "-"}`);
    console.log(`Craftpix searches if needed: ${packet.candidateContent.craftpixSearch.join(";")}`);
    console.log(`Acceptance: ${packet.acceptance.join("; ")}`);
    for (const check of packet.verification) console.log(`- If ${check.when}: \`${check.command}\`. ${check.purpose}`);
  }
}

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function numberAfter(flag: string) {
  const raw = valueAfter(flag);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a number.`);
  return parsed;
}
