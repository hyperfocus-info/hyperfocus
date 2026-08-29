import { craftingRecipes } from "./recipe-catalog.data.ts";
import { groupByKey, indexUniqueBy } from "../data/indexing.ts";
import type {
  CraftingRecipe,
  CraftingRecipeTier,
  CraftingStation,
  GatheringSkillId,
  MaterialCatalogEntry,
  MaterialResolver,
  RecipeValidationIssue,
  RecipeValidationResult
} from "./recipe-types.ts";

export { craftingRecipes } from "./recipe-catalog.data.ts";
export type * from "./recipe-types.ts";

export type CraftingRecipeId = (typeof craftingRecipes)[number]["id"];

export const craftingRecipeById: Record<CraftingRecipeId, CraftingRecipe> = indexUniqueBy(craftingRecipes, (entry) => entry.id);

export const craftingRecipesByStation: Partial<Record<CraftingStation, readonly CraftingRecipe[]>> = groupByKey(craftingRecipes, (entry) => entry.station);

export const craftingRecipesByTier: Partial<Record<CraftingRecipeTier, readonly CraftingRecipe[]>> = groupByKey(craftingRecipes, (entry) => entry.outputTier);

const craftingRecipeLookup = new Map<string, CraftingRecipe>(craftingRecipes.map((entry) => [entry.id, entry]));

export function getCraftingRecipe(id: CraftingRecipeId): CraftingRecipe;
export function getCraftingRecipe(id: string): CraftingRecipe | undefined;
export function getCraftingRecipe(id: string) {
  return craftingRecipeLookup.get(id);
}

export function findCraftingRecipesByInput(materialNameOrId: string | number) {
  const target = String(materialNameOrId).toLowerCase();
  return craftingRecipes.filter((entry) =>
    entry.inputs.some((craftingInput) =>
      craftingInput.materialName.toLowerCase() === target ||
      (craftingInput.materialId !== undefined && String(craftingInput.materialId).toLowerCase() === target)
    )
  );
}

export function createMaterialResolver(catalog: readonly MaterialCatalogEntry[] | undefined): MaterialResolver | undefined {
  if (!catalog) return undefined;
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const material of catalog) {
    if (material.id !== undefined) ids.add(String(material.id).toLowerCase());
    names.add(material.name.toLowerCase());
  }
  return {
    hasMaterialId: (id) => ids.has(String(id).toLowerCase()),
    hasMaterialName: (name) => names.has(name.toLowerCase())
  };
}

export function validateCraftingRecipes(
  recipes: readonly CraftingRecipe[] = craftingRecipes,
  options: { materials?: readonly MaterialCatalogEntry[]; resolver?: MaterialResolver } = {}
): RecipeValidationResult {
  const issues: RecipeValidationIssue[] = [];
  const seenIds = new Set<string>();
  const resolver = options.resolver ?? createMaterialResolver(options.materials);

  for (const entry of recipes) {
    if (seenIds.has(entry.id)) {
      issues.push({ recipeId: entry.id, code: "duplicate-id", message: `Duplicate crafting recipe id: ${entry.id}` });
    }
    seenIds.add(entry.id);

    if (entry.inputs.length === 0) {
      issues.push({ recipeId: entry.id, code: "empty-inputs", message: "Recipe has no material inputs." });
    }

    const skillIds = new Set<GatheringSkillId>();
    for (const craftingInput of entry.inputs) {
      skillIds.add(craftingInput.skillId);
      if (!Number.isInteger(craftingInput.quantity) || craftingInput.quantity <= 0) {
        issues.push({
          recipeId: entry.id,
          code: "invalid-quantity",
          message: `${craftingInput.materialName} must have a positive integer quantity.`
        });
      }

      if (resolver) {
        const hasId = craftingInput.materialId !== undefined && resolver.hasMaterialId?.(craftingInput.materialId);
        const hasName = resolver.hasMaterialName?.(craftingInput.materialName);
        if (!hasId && !hasName) {
          issues.push({
            recipeId: entry.id,
            code: "unresolved-material",
            message: `${craftingInput.materialName} did not resolve in provided material catalog.`
          });
        }
      }
    }

    if (entry.inputs.length > 0 && skillIds.size < 2) {
      issues.push({ recipeId: entry.id, code: "single-skill-inputs", message: "Recipe must combine materials from at least two skills." });
    }
  }

  return { valid: issues.length === 0, issues };
}

export const craftingRecipeValidation = validateCraftingRecipes();
