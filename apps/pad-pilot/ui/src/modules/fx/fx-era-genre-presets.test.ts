import { describe, expect, it } from "bun:test";
import { createDefaultFxChainState } from "./fx-chain-state";
import { FX_ERA_GENRE_RECIPES } from "./fx-era-genre-presets";
import { generateFxRecipe } from "./fx-idea-generator";
import { findNodeControlDefinition } from "./node-registry/registry";
import { FX_PRESET_RESEARCH_SOURCES } from "./fx-preset-research";

describe("FX era and genre preset catalog", () => {
  it("covers every decade from the 1950s through the 2020s", () => {
    expect(new Set(FX_ERA_GENRE_RECIPES.map((recipe) => recipe.era))).toEqual(new Set([
      "1950s",
      "1960s",
      "1970s",
      "1980s",
      "1990s",
      "2000s",
      "2010s",
      "2020s",
    ]));
    expect(FX_ERA_GENRE_RECIPES).toHaveLength(31);
  });

  it("ships unique names and complete discovery metadata", () => {
    const names = FX_ERA_GENRE_RECIPES.map((recipe) => recipe.name);
    expect(new Set(names).size).toBe(names.length);
    for (const recipe of FX_ERA_GENRE_RECIPES) {
      expect(recipe.name.startsWith(`${recipe.era} · `)).toBe(true);
      expect(recipe.genres.length).toBeGreaterThan(0);
      expect(recipe.useCases.length).toBeGreaterThan(0);
      expect(recipe.researchBasis.length).toBeGreaterThan(0);
      for (const sourceId of recipe.researchBasis) expect(sourceId in FX_PRESET_RESEARCH_SOURCES).toBe(true);
      expect(recipe.tags).toContain(recipe.era);
      expect(recipe.nodes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("maps every authored value to a real in-range native-backed control", () => {
    for (const recipe of FX_ERA_GENRE_RECIPES) {
      for (const node of recipe.nodes) {
        expect(node.mix ?? 1).toBeGreaterThanOrEqual(0);
        expect(node.mix ?? 1).toBeLessThanOrEqual(1);
        for (const [key, value] of Object.entries(node.values ?? {})) {
          const control = findNodeControlDefinition(node.type, key);
          if (!control) throw new Error(`${recipe.name}/${node.name}: missing control ${key}`);
          if (typeof value === "number") {
            expect(Number.isFinite(value)).toBe(true);
            if (control.min !== undefined) expect(value).toBeGreaterThanOrEqual(control.min);
            if (control.max !== undefined) expect(value).toBeLessThanOrEqual(control.max);
          }
          if (control.kind === "select") {
            expect(control.options?.map((option) => option.value)).toContain(String(value));
          }
          if (control.kind === "toggle") expect(typeof value).toBe("boolean");
        }
      }
    }
  });

  it("generates normalized ordered chain state for every catalog entry", () => {
    for (const recipe of FX_ERA_GENRE_RECIPES) {
      const generated = generateFxRecipe(createDefaultFxChainState(), 1, recipe);
      const chain = generated.state.chains[0];
      expect(generated.name).toBe(recipe.name);
      expect(chain?.name).toBe(recipe.name);
      expect(chain?.nodes).toHaveLength(recipe.nodes.length);
      expect(chain?.nodes.map((node) => node.order)).toEqual(recipe.nodes.map((_, index) => index));
    }
  });
});
