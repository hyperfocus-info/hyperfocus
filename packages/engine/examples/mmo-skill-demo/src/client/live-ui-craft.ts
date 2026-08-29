import { hasInventoryItem, itemQty } from "../shared-loadout.ts";
import { type MmoSkillDemoInput, type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { worldCraftingRecipes, type WorldCraftingRecipe } from "../data/world-recipes.ts";
import {
  RUNTIME_CRAFT_ROUTES_BY_OUTPUT,
  itemLabel,
  labelize,
  primaryRecipeOutput,
  type CraftRuntimeRoute
} from "./live-ui-model.ts";
import { itemIcon, namedBody, panelSection, panelStack, textRows } from "./live-ui-elements.ts";

export function createCraftPanel(input: {
  invalidate: () => void;
  render: () => void;
  queueInput: (value: MmoSkillDemoInput) => void;
}) {
  let selectedRecipeId: string = worldCraftingRecipes[0]?.id ?? "";

  function recipeTitle(recipe: WorldCraftingRecipe) {
    const output = primaryRecipeOutput(recipe);
    return output ? itemLabel(output) : labelize(recipe.id);
  }

  function selectedRecipe() {
    return worldCraftingRecipes.find((recipe) => recipe.id === selectedRecipeId) ?? worldCraftingRecipes[0];
  }

  function recipeRuntimeRoute(recipe: WorldCraftingRecipe) {
    return RUNTIME_CRAFT_ROUTES_BY_OUTPUT[primaryRecipeOutput(recipe)];
  }

  function nearestCraftTarget(player: PlayerEntity, state: MmoSkillDemoState, route: CraftRuntimeRoute | undefined) {
    if (!route) return undefined;
    return Object.values(state.npcs)
      .filter((npc) => npc.hp > 0 && npc.zoneId === player.zoneId && route.npcKinds.includes(npc.kind))
      .map((npc) => ({ npc, distance: Math.hypot(npc.x - player.x, npc.y - player.y) }))
      .sort((left, right) => left.distance - right.distance)[0];
  }

  function stackRows(player: PlayerEntity, stacks: WorldCraftingRecipe["inputs"], kind: "input" | "output") {
    const rows = document.createElement("div");
    rows.className = "mmo-card-grid";
    for (const stack of stacks) {
      const owned = itemQty(player, stack.itemId);
      const ready = kind === "output" || owned >= stack.amount;
      const row = document.createElement("div");
      row.className = `mmo-item-card${ready ? " is-active" : ""}`;
      const count = document.createElement("span");
      count.textContent = kind === "input" ? `bag ${owned}` : hasInventoryItem(player, stack.itemId) ? "owned" : "";
      count.className = "mmo-item-count";
      row.append(itemIcon(stack.itemId), namedBody(`${stack.amount}x ${itemLabel(stack.itemId)}`, ready ? "Ready" : "Needed"), count);
      rows.append(row);
    }
    return rows;
  }

  function recipeActionStatus(player: PlayerEntity, state: MmoSkillDemoState, recipe: WorldCraftingRecipe) {
    const route = recipeRuntimeRoute(recipe);
    const target = nearestCraftTarget(player, state, route);
    if (!route) return { route, target, ready: false, text: "Inspect only: no runtime station action for this output yet." };
    if (!target) return { route, target, ready: false, text: `${route.label} absent in ${labelize(player.zoneId)}.` };
    if (target.distance > 96) return { route, target, ready: false, text: `${route.label} too far: ${Math.round(target.distance)}px.` };
    return { route, target, ready: true, text: `${route.label} ready: ${labelize(target.npc.kind)}.` };
  }

  function craftContent(player: PlayerEntity, state: MmoSkillDemoState) {
    const recipe = selectedRecipe();
    if (!recipe) {
      return panelSection("Recipes", textRows(["No world recipes loaded."]));
    }

    const picker = document.createElement("select");
    picker.value = recipe.id;
    picker.title = "Recipe";
    picker.style.minHeight = "32px";
    picker.style.width = "100%";
    picker.style.minWidth = "0";
    picker.style.color = "#f5f3e8";
    picker.style.background = "#151c12";
    picker.style.border = "1px solid rgba(185, 169, 142, 0.48)";
    picker.style.borderRadius = "5px";
    picker.style.padding = "6px 8px";
    picker.style.font = "700 12px Inter, ui-sans-serif, system-ui, sans-serif";
    for (const optionRecipe of worldCraftingRecipes) {
      const option = document.createElement("option");
      option.value = optionRecipe.id;
      option.textContent = `${recipeTitle(optionRecipe)} - ${labelize(optionRecipe.factionId)}`;
      picker.append(option);
    }
    picker.addEventListener("change", () => {
      selectedRecipeId = picker.value;
      input.invalidate();
      input.render();
    });

    const actionStatus = recipeActionStatus(player, state, recipe);

    const button = document.createElement("button");
    button.className = "mmo-compact-button";
    button.type = "button";
    button.disabled = !actionStatus.ready || !actionStatus.route || !actionStatus.target;
    button.textContent = actionStatus.ready && actionStatus.route ? `${labelize(actionStatus.route.action)} station` : "Inspect";
    button.title = button.disabled ? actionStatus.text : `Send ${actionStatus.route?.action ?? "interact"} to ${labelize(actionStatus.target?.npc.kind ?? "station")}`;
    button.addEventListener("click", () => {
      if (!actionStatus.ready || !actionStatus.route || !actionStatus.target) return;
      input.queueInput({
        action: actionStatus.route.action,
        targetId: actionStatus.target.npc.id,
        devField: "recipe",
        devText: recipe.id
      });
    });

    return panelStack(
      picker,
      panelSection("Recipe", textRows([
        recipeTitle(recipe),
        `${labelize(recipe.station)} | ${labelize(recipe.factionId)}`,
        recipe.summary
      ])),
      panelSection("Inputs", stackRows(player, recipe.inputs, "input")),
      panelSection("Outputs", stackRows(player, recipe.outputs, "output")),
      panelSection("Station", textRows([
        actionStatus.text,
        actionStatus.route?.note ?? "Recipe remains visible for planning until runtime adds station support."
      ]), button)
    );
  }

  return {
    content: craftContent,
    key() {
      return selectedRecipeId;
    }
  };
}
