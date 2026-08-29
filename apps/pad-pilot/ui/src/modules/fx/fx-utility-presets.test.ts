import { describe, expect, it } from "bun:test";
import { createDefaultFxChainState } from "./fx-chain-state";
import { generateFxRecipe } from "./fx-idea-generator";
import { findNodeControlDefinition } from "./node-registry/registry";
import { FX_UTILITY_PRESET_RECIPES } from "./fx-utility-presets";

describe("FX utility preset catalog", () => {
  it("covers 18 distinct production jobs with source and intensity metadata", () => {
    expect(FX_UTILITY_PRESET_RECIPES).toHaveLength(18);
    expect(new Set(FX_UTILITY_PRESET_RECIPES.map((recipe) => recipe.name)).size).toBe(18);

    for (const recipe of FX_UTILITY_PRESET_RECIPES) {
      expect(recipe.tags).toContain("utility");
      expect(recipe.jobs.length).toBeGreaterThan(0);
      expect(recipe.sources.length).toBeGreaterThan(0);
      expect(["light", "medium"]).toContain(recipe.intensity);
      expect(recipe.nodes.length).toBeGreaterThan(0);
    }
  });

  it("maps authored values to real in-range native-backed controls", () => {
    for (const recipe of FX_UTILITY_PRESET_RECIPES) {
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
          if (control.kind === "select") expect(control.options?.map((option) => option.value)).toContain(String(value));
          if (control.kind === "toggle") expect(typeof value).toBe("boolean");
        }
      }
    }
  });

  it("generates normalized ordered state for every utility preset", () => {
    for (const recipe of FX_UTILITY_PRESET_RECIPES) {
      const generated = generateFxRecipe(createDefaultFxChainState(), 1, recipe);
      const chain = generated.state.chains[0];
      expect(generated.name).toBe(recipe.name);
      expect(chain?.name).toBe(recipe.name);
      expect(chain?.nodes).toHaveLength(recipe.nodes.length);
      expect(chain?.nodes.map((node) => node.order)).toEqual(recipe.nodes.map((_, index) => index));
    }
  });
});
