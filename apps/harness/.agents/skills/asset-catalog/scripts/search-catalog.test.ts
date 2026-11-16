import { describe, expect, test } from "bun:test";
import { ASSET_SOURCES, ASSET_TYPES, searchAssetCatalog } from "./catalog";
import { GAME_GENRES, GAME_GENRE_ROUTES, GENRE_ASSET_PACKS, searchGenreAssetPacks } from "./genre-catalog";
import { MODEL_3D_COLLECTIONS, MODEL_3D_ROUTE_GUIDES, MODEL_3D_ROUTES, searchModel3DCollections } from "./3d-catalog";
import { formatCatalogMarkdown, parseCatalogArgs, runCatalogSearch } from "./search-catalog";

describe("asset catalog", () => {
  test("covers every declared asset type and keeps a broad audio baseline", () => {
    for (const type of ASSET_TYPES) expect(ASSET_SOURCES.some((source) => source.types.includes(type))).toBe(true);
    expect(searchAssetCatalog({ types: ["audio-sfx"] }).length).toBeGreaterThanOrEqual(6);
    expect(searchAssetCatalog({ types: ["audio-sfx"], cc0Only: true }).map((source) => source.id)).toEqual(expect.arrayContaining(["kenney", "freesound-cc0", "opengameart-cc0"]));
  });

  test("combines query, type, license, and limit filters", () => {
    expect(searchAssetCatalog({ query: "low poly characters", types: ["3d-models"], cc0Only: true }).map((source) => source.id)).toEqual(["quaternius", "kaykit"]);
    expect(searchAssetCatalog({ query: "midi", types: ["soundfonts"], limit: 1 })).toHaveLength(1);
    expect(() => searchAssetCatalog({ limit: 0 })).toThrow("positive safe integer");
  });

  test("parses repeatable type filters and emits usable Markdown or JSON", () => {
    const options = parseCatalogArgs(["--type", "audio-sfx", "--type", "music", "--cc0-only", "--format", "json"]);
    expect(options).toEqual({ types: ["audio-sfx", "music"], cc0Only: true, format: "json", listTypes: false, listGenres: false, list3DRoutes: false });
    expect(JSON.parse(runCatalogSearch(options)).every((source: { licenseScope: string }) => source.licenseScope.includes("cc0"))).toBe(true);
    expect(formatCatalogMarkdown(searchAssetCatalog({ query: "does-not-exist" }))).toContain("No matching sources");
  });

  test("provides five deep 3D routes with model and material coverage", () => {
    expect(MODEL_3D_ROUTES).toEqual(["fantasy", "realistic", "space-modern", "retro-toon", "photoreal"]);
    expect(MODEL_3D_COLLECTIONS.length).toBeGreaterThanOrEqual(25);
    for (const route of MODEL_3D_ROUTE_GUIDES) {
      const collections = searchModel3DCollections({ route: route.id });
      expect(collections.length).toBeGreaterThanOrEqual(7);
      expect(route.coverage.length).toBeGreaterThanOrEqual(8);
      expect(route.searchTerms.length).toBeGreaterThanOrEqual(8);
      expect(route.recommendedSourceIds.every((id) => ASSET_SOURCES.some((source) => source.id === id))).toBe(true);
    }
    expect(searchModel3DCollections({ route: "fantasy", cc0Only: true }).map((item) => item.id)).toContain("quaternius-medieval");
    expect(runCatalogSearch(parseCatalogArgs(["--3d-route", "photoreal"]))).toContain("# Photoreal & Scanned 3D route");
  });

  test("provides deep, mixed-perspective routes for high-value genres", () => {
    expect(GAME_GENRES).toEqual(["platformer", "rpg", "tower-defense", "racing", "3d-action", "music-video"]);
    for (const route of GAME_GENRE_ROUTES) {
      const packs = searchGenreAssetPacks({ genre: route.id });
      expect(packs.length).toBeGreaterThanOrEqual(route.id === "music-video" ? 0 : 5);
      expect(packs.filter((pack) => pack.licenseScope === "all-cc0").length).toBeGreaterThanOrEqual(route.id === "music-video" ? 0 : 3);
      expect(route.gameIdeas.length).toBeGreaterThanOrEqual(10);
      expect(route.audioSearchTerms.length).toBeGreaterThanOrEqual(8);
      expect(route.recommendedSourceIds.every((id) => ASSET_SOURCES.some((source) => source.id === id))).toBe(true);
    }
    expect(new Set(GENRE_ASSET_PACKS.map((pack) => pack.id)).size).toBe(GENRE_ASSET_PACKS.length);
    expect(GENRE_ASSET_PACKS.filter((pack) => pack.sourceId === "craftpix").every((pack) => pack.workflow === "craftpix-download" && /^\d+$/.test(pack.productId ?? ""))).toBe(true);
  });

  test("filters genre packs and emits complete genre guides", () => {
    const markdown = runCatalogSearch(parseCatalogArgs(["--genre", "racing", "--type", "3d-models", "--cc0-only"]));
    expect(markdown).toContain("# Racing asset route");
    expect(markdown).toContain("Racing Kit");
    expect(markdown).not.toContain("Free Racing Game Kit");
    const json: unknown = JSON.parse(runCatalogSearch(parseCatalogArgs(["--genre", "platformer", "--format", "json"])));
    expect(json).toMatchObject({ route: { id: "platformer" } });
    if (!json || typeof json !== "object" || !("packs" in json) || !Array.isArray(json.packs)) throw new Error("Catalog JSON must contain packs");
    expect(json.packs.length).toBeGreaterThanOrEqual(5);
    expect(runCatalogSearch(parseCatalogArgs(["--list-genres"]))).toContain("3d-action");
  });
});
