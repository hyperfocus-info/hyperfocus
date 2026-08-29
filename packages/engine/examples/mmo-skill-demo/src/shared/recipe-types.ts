import type { GatheringSkillId, MaterialTier } from "./skills.ts";

export type { GatheringSkillId, MaterialTier } from "./skills.ts";

export type CraftingRecipeTier = 3 | 4 | 5;

export type CraftingRecipeCategory =
  | "armor"
  | "weapon"
  | "tool"
  | "consumable"
  | "trinket"
  | "structure"
  | "vessel"
  | "ritual";

export type CraftingStation =
  | "alchemist-lab"
  | "apiary-press"
  | "archaeology-table"
  | "arbor-loom"
  | "dredge-kiln"
  | "field-kitchen"
  | "forge"
  | "gemcutters-bench"
  | "harbor-still"
  | "hunter-camp"
  | "siege-yard"
  | "spore-lab"
  | "tannery"
  | "void-crucible";

export type CraftingRecipeInput = {
  materialId?: string | number;
  materialName: string;
  skillId: GatheringSkillId;
  tier: MaterialTier;
  quantity: number;
};

export type CraftingRecipeEffect = {
  id: string;
  description: string;
};

export type CraftingRecipe = {
  id: string;
  outputId: string;
  outputName: string;
  outputCategory: CraftingRecipeCategory;
  outputTier: CraftingRecipeTier;
  outputQuantity?: number;
  inputs: readonly CraftingRecipeInput[];
  station: CraftingStation;
  whySynergy: string;
  lore: string;
  effects?: readonly CraftingRecipeEffect[];
};

export type MaterialCatalogEntry = {
  id?: string | number;
  name: string;
};

export type MaterialResolver = {
  hasMaterialId?: (id: string | number) => boolean;
  hasMaterialName?: (name: string) => boolean;
};

export type RecipeValidationIssue = {
  recipeId: string;
  code: "duplicate-id" | "empty-inputs" | "invalid-quantity" | "single-skill-inputs" | "unresolved-material";
  message: string;
};

export type RecipeValidationResult = {
  valid: boolean;
  issues: readonly RecipeValidationIssue[];
};
