import { formatPercent as pct } from "@hyperfocus/utilities/text";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { worldFactionQuestSteps } from "../src/data/world-quests.ts";
import { worldFactions } from "../src/data/world-factions.ts";
import { worldCraftingRecipes } from "../src/data/world-recipes.ts";
import { worldReputationRewards } from "../src/data/world-reputation.ts";
import { worldCraftingMaterials } from "../src/data/world-materials.ts";

type Format = "markdown" | "json";
type Band = "10s" | "10m" | "10h" | "100h";
type LoopScore = {
  band: Band;
  authoredSteps: number;
  playableOutputs: number;
  futureOutputs: number;
  unlockRewards: number;
  routeOrSurvivalSteps: number;
  risk: "low" | "medium" | "high";
  gap: string;
};

const DEFAULT_OUT = resolve(import.meta.dir, "..", ".local", "gameplay-loop-audit.md");
const EXISTING_OUTPUT_IDS = [
  "ash-logs",
  "cinder-ale",
  "glade-berries",
  "iron-chest",
  "iron-ore",
  "leather-boots",
  "pickaxe",
  "ring-focus",
  "silk-thread",
  "speed-potion",
  "void-resistant-cloak"
] as const;
const FUTURE_OUTPUT_IDS = [
  "aether-brass-sigil",
  "brambleguard-bulwark",
  "coin-scent-charm",
  "feral-blood-salve",
  "gale-feather-wraps"
] as const;
const EXISTING_OUTPUTS: ReadonlySet<string> = new Set(EXISTING_OUTPUT_IDS);
const FUTURE_OUTPUTS: ReadonlySet<string> = new Set(FUTURE_OUTPUT_IDS);
const BANDS: Band[] = ["10s", "10m", "10h", "100h"];

function stringArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return Bun.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function formatArg(): Format {
  const value = stringArg("format", "markdown");
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Unknown format: ${value}`);
}



function byBand<T extends { progressionBand?: string }>(band: Band, rows: readonly T[]) {
  return rows.filter((row) => row.progressionBand === band);
}

function recipesByOutputKind() {
  let playable = 0;
  let future = 0;
  for (const recipe of worldCraftingRecipes) {
    if (recipe.outputs.some((output) => EXISTING_OUTPUTS.has(output.itemId))) playable += 1;
    if (recipe.outputs.some((output) => FUTURE_OUTPUTS.has(output.itemId))) future += 1;
  }
  return { playable, future };
}

function loopScores(): LoopScore[] {
  const recipes = recipesByOutputKind();
  return BANDS.map((band) => {
    const steps = byBand(band, worldFactionQuestSteps);
    const routeOrSurvivalSteps = steps.filter((step) =>
      step.objectives.some((objective) => objective.kind === "scout" || objective.kind === "survive" || objective.kind === "attune")
    ).length;
    const unlockRewards = steps.flatMap((step) => step.rewards).filter((reward) => reward.kind === "unlock").length;
    const playableOutputs = band === "10m" ? recipes.playable : band === "10h" ? Math.floor(recipes.playable / 2) : 0;
    const futureOutputs = band === "10h" || band === "100h" ? recipes.future : 0;
    const risk =
      band === "100h" && steps.length < 4 ? "high" :
      band === "10h" && futureOutputs >= playableOutputs ? "medium" :
      "low";
    const gap =
      band === "10s"
        ? "Zero-risk first-frame proof covers the shared starter route; other factions still begin at 10m or later."
        : band === "10m"
          ? "Strong authored errand coverage; biggest risk is route recovery after quest completion."
          : band === "10h"
            ? "Many gates point at recipes/travel, but several rewards are still future-facing or inspect-only."
            : "Endgame exists as capstone intent, but not enough repeatable mastery evidence or bench coverage.";
    return {
      band,
      authoredSteps: steps.length,
      playableOutputs,
      futureOutputs,
      unlockRewards,
      routeOrSurvivalSteps,
      risk,
      gap
    };
  });
}

function materialUseAudit() {
  const materialIds: ReadonlySet<string> = new Set(worldCraftingMaterials.map((material) => material.id));
  const usedByQuest = new Set<string>();
  const usedByRecipe = new Set<string>();
  for (const step of worldFactionQuestSteps) {
    for (const objective of step.objectives) {
      if ("materialId" in objective && objective.materialId) usedByQuest.add(objective.materialId);
    }
    for (const reward of step.rewards) {
      if (reward.kind === "material") usedByQuest.add(reward.materialId);
    }
  }
  for (const recipe of worldCraftingRecipes) {
    for (const stack of [...recipe.inputs, ...recipe.outputs]) {
      if (materialIds.has(stack.itemId)) usedByRecipe.add(stack.itemId);
    }
  }
  const unusedMaterials = [...materialIds].filter((id) => !usedByQuest.has(id) && !usedByRecipe.has(id));
  const questOnlyMaterials = [...usedByQuest].filter((id) => materialIds.has(id) && !usedByRecipe.has(id));
  const recipeOnlyMaterials = [...usedByRecipe].filter((id) => materialIds.has(id) && !usedByQuest.has(id));
  return { unusedMaterials, questOnlyMaterials, recipeOnlyMaterials };
}

function factionAudit() {
  return worldFactions.map((faction) => {
    const steps = worldFactionQuestSteps.filter((step) => step.factionId === faction.id);
    const recipes = worldCraftingRecipes.filter((recipe) => recipe.factionId === faction.id);
    const rewards = worldReputationRewards.filter((reward) => reward.factionId === faction.id);
    const futureRecipes = recipes.filter((recipe) => recipe.outputs.some((output) => FUTURE_OUTPUTS.has(output.itemId)));
    return {
      faction: faction.townName,
      steps: steps.length,
      recipes: recipes.length,
      futureRecipes: futureRecipes.length,
      rewards: rewards.length,
      firstBand: steps[0]?.progressionBand ?? "none",
      capstoneBand: steps.at(-1)?.progressionBand ?? "none"
    };
  });
}

function recommendations(scores: LoopScore[]) {
  const hundred = scores.find((score) => score.band === "100h");
  const tenHour = scores.find((score) => score.band === "10h");
  if (!hundred || !tenHour) throw new Error("Missing required gameplay audit bands.");
  return [
    "Build the next bench around loop proof, not render cost: simulate first-hour return, quest handoff, recipe unlock, route gate, and capstone retry states.",
    `Convert at least two future recipe outputs into supported runtime rewards before adding new materials; current future recipe count is ${tenHour.futureOutputs}.`,
    `Add repeatable 100h evidence before more lore: current 100h authored steps are ${hundred.authoredSteps}, and they need retry/mastery metrics.`,
    "Keep market lesson tight: modern MMO onboarding wins by recoverable guidance, visible next action, and optional breadth; forced systems tours remain the distraction."
  ];
}

function report() {
  const scores = loopScores();
  const materials = materialUseAudit();
  const factions = factionAudit();
  return {
    createdAt: new Date().toISOString(),
    totals: {
      factions: worldFactions.length,
      questSteps: worldFactionQuestSteps.length,
      recipes: worldCraftingRecipes.length,
      reputationRewards: worldReputationRewards.length,
      materials: worldCraftingMaterials.length,
      supportedRecipeOutputs: recipesByOutputKind().playable,
      futureRecipeOutputs: recipesByOutputKind().future
    },
    scores,
    factions,
    materials: {
      unusedCount: materials.unusedMaterials.length,
      questOnlyCount: materials.questOnlyMaterials.length,
      recipeOnlyCount: materials.recipeOnlyMaterials.length,
      unusedExamples: materialNames(materials.unusedMaterials),
      questOnlyExamples: materialNames(materials.questOnlyMaterials),
      recipeOnlyExamples: materialNames(materials.recipeOnlyMaterials)
    },
    recommendations: recommendations(scores)
  };
}

function materialNames(ids: readonly string[]) {
  const names = new Map<string, string>(worldCraftingMaterials.map((material) => [material.id, material.name]));
  return ids.slice(0, 12).map((id) => names.get(id) ?? id);
}

function markdown(data: ReturnType<typeof report>) {
  return [
    "# Gameplay Loop Audit",
    `Generated: ${data.createdAt}`,
    "",
    "## Totals",
    `- Factions: ${data.totals.factions}`,
    `- Quest steps: ${data.totals.questSteps}`,
    `- Recipes: ${data.totals.recipes} (${data.totals.supportedRecipeOutputs} supported outputs, ${data.totals.futureRecipeOutputs} future outputs)`,
    `- Reputation rewards: ${data.totals.reputationRewards}`,
    `- Materials: ${data.totals.materials}`,
    "",
    "## Loop Scores",
    "| Band | Risk | Quest Steps | Playable Outputs | Future Outputs | Unlocks | Route/Survival Steps | Gap |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...data.scores.map((score) =>
      `| ${score.band} | ${score.risk} | ${score.authoredSteps} | ${score.playableOutputs} | ${score.futureOutputs} | ${score.unlockRewards} | ${score.routeOrSurvivalSteps} | ${score.gap} |`
    ),
    "",
    "## Faction Coverage",
    "| Faction | Steps | Recipes | Future Recipes | Rewards | First Band | Capstone Band |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...data.factions.map((faction) =>
      `| ${faction.faction} | ${faction.steps} | ${faction.recipes} | ${faction.futureRecipes} | ${faction.rewards} | ${faction.firstBand} | ${faction.capstoneBand} |`
    ),
    "",
    "## Material Pressure",
    `- Unused material ids: ${data.materials.unusedCount} (${pct(data.materials.unusedCount / data.totals.materials)})`,
    `- Quest-only material ids: ${data.materials.questOnlyCount}`,
    `- Recipe-only material ids: ${data.materials.recipeOnlyCount}`,
    `- Unused examples: ${data.materials.unusedExamples.join(", ") || "none"}`,
    "",
    "## Recommendations",
    ...data.recommendations.map((item) => `- ${item}`)
  ].join("\n");
}

async function main() {
  const data = report();
  const format = formatArg();
  const out = stringArg("out", format === "json" ? DEFAULT_OUT.replace(/\.md$/, ".json") : DEFAULT_OUT);
  const output = format === "json" ? `${JSON.stringify(data, null, 2)}\n` : `${markdown(data)}\n`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, output);
  console.info(`gameplay loop audit: ${out}`);
  if (format !== "json") console.info(`highest risk: ${data.scores.filter((score) => score.risk !== "low").map((score) => `${score.band}=${score.risk}`).join(", ") || "none"}`);
}

await main();
