import { expect, test } from "bun:test";
import {
  craftingRecipeById,
  craftingRecipeValidation,
  craftingRecipes,
  findCraftingRecipesByInput,
  getCraftingRecipe
} from "../shared/recipes.ts";

test("the authored recipe catalog remains valid after indexing", () => {
  expect(craftingRecipes).toHaveLength(69);
  expect(craftingRecipeValidation).toEqual({ valid: true, issues: [] });
  expect(Object.keys(craftingRecipeById)).toHaveLength(craftingRecipes.length);
});

test("the stable recipe facade resolves ids and material searches", () => {
  const recipe = getCraftingRecipe("moonlit-ranger-hood");
  expect(recipe?.outputName).toBe("Moonlit Ranger Hood");
  expect(findCraftingRecipesByInput("Moonlily")).toContain(recipe);
  expect(getCraftingRecipe("missing-recipe")).toBeUndefined();
});
