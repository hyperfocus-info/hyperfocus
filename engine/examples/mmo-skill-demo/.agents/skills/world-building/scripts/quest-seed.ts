import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { analyzeWorld, catalogFor, filterChunks, primaryZone, zoneTextFor, type BandFilter, type ChunkScore } from "./world-analysis.ts";

const options = readOptions();
const analysis = analyzeWorld();
const chunks = filterChunks(analysis.chunks, options).filter((chunk) => chunk.questHooks.length > 0);
const sections = chunks.map(sectionFor);

if (options.write) {
  const outputPath = resolve(options.out);
  const existing = readFileSafe(outputPath);
  const additions = sections.filter((section) => !existing.includes(`### ${section.title}`));
  if (additions.length > 0) {
    mkdirSync(dirname(outputPath), { recursive: true });
    const prefix = existing.trimEnd() || defaultHeader();
    writeFileSync(outputPath, `${prefix}\n\n${additions.map((section) => section.body).join("\n\n")}\n`);
  }
  console.log(`Wrote ${additions.length} quest seed(s) to ${options.out}`);
} else {
  console.log(`# Quest Seed Preview`);
  console.log(`Use --write to append non-duplicate sections to ${options.out}.`);
  for (const section of sections) {
    console.log("");
    console.log(section.body);
  }
}

function sectionFor(chunk: ChunkScore) {
  const zone = primaryZone(chunk);
  const catalog = catalogFor(zone);
  const title = titleFor(chunk, zone);
  const location = `Chunk ${chunk.index} (${chunk.id}), ${zoneTextFor(chunk)}, nearest known anchor: ${anchorText(chunk)}.`;
  const playerAction = chunk.questHooks[0] ?? "Investigate the local pressure and decide how to resolve it.";
  const payoff = chunk.questHooks[1] ?? chunk.recommendation;
  const body = `### ${title}

Location: ${location}

Factions: ${catalog.factions.join(", ") || "Local zone forces"}.

Player action: ${playerAction}

Payoff: ${payoff}

WHY: ${chunk.why} ${chunk.recommendation}`;

  return { title, body };
}

function anchorText(chunk: ChunkScore) {
  const anchor = chunk.nearbyAnchors[0];
  if (!anchor) return "unanchored space";
  return `${anchor.label} (${anchor.distanceTiles} tiles ${anchor.direction})`;
}

function titleFor(chunk: ChunkScore, zone: string) {
  const titleBase =
    zone === "void-rift"
      ? "Failed Rift Crossing"
      : zone === "crags"
        ? "Quarry Overflow Route"
        : zone === "whisperwind-ascent"
          ? "Wind Library Path"
          : zone === "canaan-desert"
            ? "Debt Marker Camp"
            : zone === "port-marrow"
              ? "Smuggler Dock Edge"
              : zone === "ashwood" || zone === "ashwood-wilderness"
                ? "Rootway Border Sign"
                : "World Pressure Marker";
  return `${titleBase} - Chunk ${chunk.index}`;
}

function defaultHeader() {
  return `# Future Quest Ideas

This file holds quest throughlines created during world-building passes. Keep entries high-level: location, faction motive, player action, payoff, and why the idea belongs.

Related context: ./docs/world-building.md and ./docs/world-travel.md.

## Active Seeds`;
}

function readOptions() {
  const band = (valueAfter("--band") ?? "all") as BandFilter;
  if (!["all", "sparse", "balanced", "dense"].includes(band)) throw new Error("Use --band all, sparse, balanced, or dense.");
  return {
    band,
    zone: valueAfter("--zone"),
    chunk: valueAfter("--chunk"),
    top: numberAfter("--top") ?? 3,
    sort: (valueAfter("--sort") ?? "priority") as "chunk" | "priority",
    out: valueAfter("--out") ?? "./docs/future-quest-ideas.md",
    write: process.argv.includes("--write") && !process.argv.includes("--dry-run")
  };
}

function readFileSafe(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
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
