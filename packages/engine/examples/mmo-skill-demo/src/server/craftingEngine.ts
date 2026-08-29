import {
  craftingRecipes,
  getCraftingRecipe,
  type CraftingRecipe,
  type CraftingRecipeInput
} from "../shared/recipes.ts";

export type CraftingInventory = Record<string, number>;

export type CraftingInventoryMutation = {
  itemId: string;
  before: number;
  after: number;
  quantity: number;
};

export type MissingCraftingInput = {
  itemId: string;
  required: number;
  available: number;
  input: CraftingRecipeInput;
};

export type CraftingFailureReason = "recipe-not-found" | "empty-inventory" | "invalid-input" | "missing-input";

export type CraftingSuccessResult = {
  ok: true;
  recipe: CraftingRecipe;
  inventory: CraftingInventory;
  consumed: readonly CraftingInventoryMutation[];
  produced: CraftingInventoryMutation;
};

export type CraftingFailureResult = {
  ok: false;
  reason: CraftingFailureReason;
  recipe?: CraftingRecipe;
  inventory: CraftingInventory;
  missingInputs?: readonly MissingCraftingInput[];
  message: string;
};

export type CraftingResult = CraftingSuccessResult | CraftingFailureResult;

export type CraftingCheckResult =
  | { ok: true; recipe: CraftingRecipe }
  | { ok: false; recipe: CraftingRecipe; missingInputs: readonly MissingCraftingInput[]; message: string };

export type CraftingEngineOptions = {
  mutate?: boolean;
  inputKey?: (input: CraftingRecipeInput, recipe: CraftingRecipe) => string;
  outputKey?: (recipe: CraftingRecipe) => string;
};

export function craftingInventoryKeyForInput(input: CraftingRecipeInput) {
  return input.materialId === undefined ? input.materialName : String(input.materialId);
}

export function craftingInventoryKeyForOutput(recipe: CraftingRecipe) {
  return recipe.outputId;
}

function positiveWhole(value: number) {
  return Number.isInteger(value) && value > 0;
}

function inventoryQuantity(inventory: CraftingInventory, itemId: string) {
  const value = inventory[itemId] ?? 0;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function writableInventory(inventory: CraftingInventory, mutate: boolean | undefined) {
  return mutate === false ? { ...inventory } : inventory;
}

export function canCraftRecipe(
  inventory: CraftingInventory,
  recipe: CraftingRecipe,
  options: Pick<CraftingEngineOptions, "inputKey"> = {}
): CraftingCheckResult {
  const inputKey = options.inputKey ?? craftingInventoryKeyForInput;
  const missingInputs: MissingCraftingInput[] = [];

  for (const input of recipe.inputs) {
    const itemId = inputKey(input, recipe);
    if (!itemId || !positiveWhole(input.quantity)) {
      missingInputs.push({ itemId, required: input.quantity, available: 0, input });
      continue;
    }
    const available = inventoryQuantity(inventory, itemId);
    if (available < input.quantity) missingInputs.push({ itemId, required: input.quantity, available, input });
  }

  if (missingInputs.length > 0) {
    return {
      ok: false,
      recipe,
      missingInputs,
      message: `Missing ${missingInputs.length} input stack(s) for ${recipe.outputName}.`
    };
  }

  return { ok: true, recipe };
}

export function craftRecipe(
  inventory: CraftingInventory | undefined,
  recipe: CraftingRecipe,
  options: CraftingEngineOptions = {}
): CraftingResult {
  if (!inventory) {
    return {
      ok: false,
      reason: "empty-inventory",
      recipe,
      inventory: {},
      message: "Player inventory is missing."
    };
  }

  if (recipe.inputs.length === 0 || recipe.inputs.some((input) => !positiveWhole(input.quantity))) {
    return {
      ok: false,
      reason: "invalid-input",
      recipe,
      inventory,
      message: `Recipe ${recipe.id} has invalid material inputs.`
    };
  }

  const check = canCraftRecipe(inventory, recipe, options);
  if (!check.ok) {
    return {
      ok: false,
      reason: "missing-input",
      recipe,
      inventory,
      missingInputs: check.missingInputs,
      message: check.message
    };
  }

  const nextInventory = writableInventory(inventory, options.mutate);
  const inputKey = options.inputKey ?? craftingInventoryKeyForInput;
  const outputKey = options.outputKey ?? craftingInventoryKeyForOutput;
  const consumed: CraftingInventoryMutation[] = [];

  for (const input of recipe.inputs) {
    const itemId = inputKey(input, recipe);
    const before = inventoryQuantity(nextInventory, itemId);
    const after = before - input.quantity;
    if (after <= 0) delete nextInventory[itemId];
    else nextInventory[itemId] = after;
    consumed.push({ itemId, before, after: Math.max(0, after), quantity: input.quantity });
  }

  const outputItemId = outputKey(recipe);
  const outputQuantity = recipe.outputQuantity ?? 1;
  const before = inventoryQuantity(nextInventory, outputItemId);
  const after = before + outputQuantity;
  nextInventory[outputItemId] = after;

  return {
    ok: true,
    recipe,
    inventory: nextInventory,
    consumed,
    produced: { itemId: outputItemId, before, after, quantity: outputQuantity }
  };
}

export function craftRecipeById(
  inventory: CraftingInventory | undefined,
  recipeId: string,
  options: CraftingEngineOptions = {}
): CraftingResult {
  const recipe = getCraftingRecipe(recipeId);
  if (!recipe) {
    return {
      ok: false,
      reason: "recipe-not-found",
      inventory: inventory ?? {},
      message: `Crafting recipe not found: ${recipeId}`
    };
  }
  return craftRecipe(inventory, recipe, options);
}

export function listCraftableRecipes(
  inventory: CraftingInventory | undefined,
  options: Pick<CraftingEngineOptions, "inputKey"> = {}
) {
  if (!inventory) return [];
  return craftingRecipes.filter((recipe) => canCraftRecipe(inventory, recipe, options).ok);
}
