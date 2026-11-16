#!/usr/bin/env bun

import { ASSET_TYPES, searchAssetCatalog, type AssetSource, type AssetType } from "./catalog";
import { GAME_GENRES, gameGenreRoute, searchGenreAssetPacks, type GameGenre, type GenreAssetPack } from "./genre-catalog";
import { MODEL_3D_ROUTES, model3DRoute, searchModel3DCollections, type Model3DRouteId } from "./3d-catalog";

type OutputFormat = "markdown" | "json";
type CliOptions = { query?: string; types: AssetType[]; genre?: GameGenre; model3DRoute?: Model3DRouteId; cc0Only: boolean; format: OutputFormat; limit?: number; listTypes: boolean; listGenres: boolean; list3DRoutes: boolean };

export function parseCatalogArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { types: [], cc0Only: false, format: "markdown", listTypes: false, listGenres: false, list3DRoutes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--cc0-only") { options.cc0Only = true; continue; }
    if (argument === "--list-types") { options.listTypes = true; continue; }
    if (argument === "--list-genres") { options.listGenres = true; continue; }
    if (argument === "--list-3d-routes") { options.list3DRoutes = true; continue; }
    if (argument === "--query") { if (!next) throw new Error("--query requires a value."); options.query = next; index += 1; continue; }
    if (argument === "--genre") {
      const value = GAME_GENRES.find(value => value === next);
      if (!value) throw new Error(`--genre must be one of: ${GAME_GENRES.join(", ")}`);
      options.genre = value; index += 1; continue;
    }
    if (argument === "--3d-route") {
      const value = MODEL_3D_ROUTES.find(value => value === next);
      if (!value) throw new Error(`--3d-route must be one of: ${MODEL_3D_ROUTES.join(", ")}`);
      options.model3DRoute = value; index += 1; continue;
    }
    if (argument === "--type") {
      const value = ASSET_TYPES.find(value => value === next);
      if (!value) throw new Error(`--type must be one of: ${ASSET_TYPES.join(", ")}`);
      options.types.push(value); index += 1; continue;
    }
    if (argument === "--format") {
      if (next !== "markdown" && next !== "json") throw new Error("--format must be markdown or json.");
      options.format = next; index += 1; continue;
    }
    if (argument === "--limit") {
      const limit = Number(next);
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
      options.limit = limit; index += 1; continue;
    }
    if (argument === "-h" || argument === "--help") {
      console.log("Usage: search-catalog.ts [--query text] [--type type] [--genre genre] [--3d-route route] [--cc0-only] [--format markdown|json] [--limit count] [--list-types] [--list-genres] [--list-3d-routes]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function cell(value: string) { return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim(); }

export function formatCatalogMarkdown(sources: readonly AssetSource[]) {
  const lines = [
    "| Source | Types | License | Access | Best for |",
    "| --- | --- | --- | --- | --- |",
    ...sources.map((source) => `| [${cell(source.name)}](${source.url}) | ${source.types.join(", ")} | [${source.licenseScope}](${source.licenseUrl}) | ${source.access}; raw ${source.rawRedistribution} | ${cell(source.strengths)} |`),
  ];
  if (!sources.length) lines.push("| No matching sources | - | - | - | Broaden the query or remove a filter. |");
  return `${lines.join("\n")}\n`;
}

export function formatGenreMarkdown(route: ReturnType<typeof gameGenreRoute>, packs: readonly GenreAssetPack[], sources: readonly AssetSource[]) {
  const packRows = packs.length
    ? packs.map((pack) => `| [${cell(pack.name)}](${pack.url}) | ${pack.types.join(", ")} | ${pack.licenseScope} | ${pack.cost} | ${pack.artStyles.join(", ")} | ${cell(pack.contents)} |`)
    : ["| No matching packs | - | - | - | - | Broaden the query or remove a filter. |"];
  return `${[
    `# ${route.name} asset route`, "", route.summary, "",
    `**Perspectives:** ${route.perspectives.join(", ")}`, "",
    `**Game directions:** ${route.gameIdeas.join(", ")}`, "",
    `**SFX searches:** ${route.audioSearchTerms.join(", ")}`, "",
    "## Coherent starter packs", "",
    "| Pack | Types | License | Cost | Style | Contents |",
    "| --- | --- | --- | --- | --- | --- |", ...packRows, "",
    "## Expansion sources", "", formatCatalogMarkdown(sources).trimEnd(),
  ].join("\n")}\n`;
}

export function runCatalogSearch(options: CliOptions) {
  if (options.listTypes) return `${ASSET_TYPES.join("\n")}\n`;
  if (options.listGenres) return `${GAME_GENRES.join("\n")}\n`;
  if (options.list3DRoutes) return `${MODEL_3D_ROUTES.join("\n")}\n`;
  if (options.model3DRoute) {
    const route = model3DRoute(options.model3DRoute);
    const collections = searchModel3DCollections({ route: options.model3DRoute, query: options.query, cc0Only: options.cc0Only, limit: options.limit });
    if (options.format === "json") return `${JSON.stringify({ route, collections }, null, 2)}\n`;
    const rows = collections.length ? collections.map((item) => `| [${cell(item.name)}](${item.url}) | ${item.sourceId} | ${item.licenseScope} | ${item.formats.join(", ")} | ${cell(item.contents)} |`) : ["| No matching collections | - | - | - | Broaden the query or remove a filter. |"];
    return `${[`# ${route.name} 3D route`, "", route.summary, "", `**Coverage target:** ${route.coverage.join(", ")}`, "", `**Useful searches:** ${route.searchTerms.join(", ")}`, "", "| Collection | Source | License | Formats | Contents |", "| --- | --- | --- | --- | --- |", ...rows].join("\n")}\n`;
  }
  if (options.genre) {
    const route = gameGenreRoute(options.genre);
    const packs = searchGenreAssetPacks({ genre: options.genre, query: options.query, types: options.types, cc0Only: options.cc0Only, limit: options.limit });
    const recommended = new Set(route.recommendedSourceIds);
    const sources = searchAssetCatalog({ query: options.query, types: options.types, cc0Only: options.cc0Only }).filter((source) => recommended.has(source.id)).slice(0, options.limit);
    return options.format === "json" ? `${JSON.stringify({ route, packs, sources }, null, 2)}\n` : formatGenreMarkdown(route, packs, sources);
  }
  const sources = searchAssetCatalog({ query: options.query, types: options.types, cc0Only: options.cc0Only, limit: options.limit });
  return options.format === "json" ? `${JSON.stringify(sources, null, 2)}\n` : formatCatalogMarkdown(sources);
}

if (import.meta.main) {
  try {
    process.stdout.write(runCatalogSearch(parseCatalogArgs(process.argv.slice(2))));
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
