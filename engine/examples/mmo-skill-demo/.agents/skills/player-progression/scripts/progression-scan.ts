import { existsSync, readFileSync } from "node:fs";
import { analyzeWorld, filterChunks, primaryZone, topComponents, zoneTextFor } from "../../world-building/scripts/world-analysis.ts";
import { worldCreatureDefinitions } from "../../../../src/data/world-creatures.ts";
import { worldFactions } from "../../../../src/data/world-factions.ts";
import { worldLandmarkPlacements } from "../../../../src/data/world-landmarks.ts";
import { worldCraftingMaterials } from "../../../../src/data/world-materials.ts";
import { worldFactionQuestlines, type WorldQuestPace } from "../../../../src/data/world-quests.ts";
import { worldCraftingRecipes } from "../../../../src/data/world-recipes.ts";
import { worldReputationRewards } from "../../../../src/data/world-reputation.ts";

type OutputFormat = "markdown" | "json";
type ProgressionBandId = "10s" | "10m" | "10h" | "100h";

type BandRow = {
  band: ProgressionBandId;
  keySystems: string;
  activeGoal: string;
  friction: string;
  reward: string;
  evidence: string;
};

const options = readOptions();
const scan = buildScan();

if (options.format === "json") {
  console.log(JSON.stringify(scan, null, 2));
} else {
  printMarkdown(scan);
}

function readOptions() {
  const format = (valueAfter("--format") ?? "markdown") as OutputFormat;
  if (!["markdown", "json"].includes(format)) throw new Error("Use --format markdown or json.");
  return {
    format,
    top: numberAfter("--top") ?? 4
  };
}

function buildScan() {
  const analysis = analyzeWorld();
  const priorityChunks = filterChunks(analysis.chunks, { band: "all", sort: "priority", top: options.top }).map((chunk) => ({
    chunk: chunk.index,
    band: chunk.band,
    zone: primaryZone(chunk),
    zones: zoneTextFor(chunk),
    components: topComponents(chunk),
    why: chunk.why,
    recommendation: chunk.recommendation
  }));

  const questSteps = worldFactionQuestlines.flatMap((questline) => questline.steps);
  const paceCounts = countBy(questSteps.map((step) => step.pace));
  const gatedQuestSteps = questSteps.filter((step) => "masteryGate" in step && step.masteryGate && "progressionPayoff" in step && step.progressionPayoff);
  const gateBandCounts = countBy(gatedQuestSteps.map((step) => ("progressionBand" in step && step.progressionBand ? step.progressionBand : "unbanded")));
  const factionQuestCoverage = worldFactions.map((faction) => {
    const questlines = worldFactionQuestlines.filter((questline) => questline.factionId === faction.id);
    const steps = questlines.flatMap((questline) => questline.steps);
    return {
      factionId: faction.id,
      townName: faction.townName,
      questlines: questlines.length,
      steps: steps.length,
      paces: countBy(steps.map((step) => step.pace))
    };
  });

  const recipeCounts = countBy(worldCraftingRecipes.map((recipe) => recipe.factionId));
  const materialCategories = countBy(worldCraftingMaterials.map((material) => material.category));
  const missingFactionQuestlines = factionQuestCoverage.filter((entry) => entry.questlines === 0).map((entry) => entry.factionId);
  const missingFactionRecipes = worldFactions.filter((faction) => !recipeCounts[faction.id]).map((faction) => faction.id);
  const progressionDoc = "./docs/world-player-progression.md";
  const progressionDocText = existsSync(progressionDoc) ? readFileSync(progressionDoc, "utf8") : "";

  const matrix: BandRow[] = [
    {
      band: "10s",
      keySystems: "Movement, aiming, skill use, hit feedback, gathering taps, interaction prompts, nearby creature and landmark reads.",
      activeGoal: "Make the next input obvious and satisfying: move, strike, gather, dodge, talk, or inspect.",
      friction: "Input certainty, focal clutter, danger cue timing, and whether the player understands what changed after an action.",
      reward: "Clean impact readback, item pickup, material gain, damage response, visible route or ecology clue.",
      evidence: `${worldCreatureDefinitions.length} creature definitions and ${worldLandmarkPlacements.length} landmark placements can feed immediate reads.`
    },
    {
      band: "10m",
      keySystems: "Starter quest steps, contracts, local harvesting, basic combat pockets, vendors, stations, recipe picker, short route markers.",
      activeGoal: "Complete one local errand or route task, bank a useful reward, and see the next reachable goal.",
      friction: "Session pacing, menu time, travel ambiguity, local threat sequencing, and readable quest handoff.",
      reward: "Quest step completion, faction reputation, materials, crafted item access, route confidence.",
      evidence: `${questSteps.length} authored faction quest steps across ${worldFactionQuestlines.length} questlines; ${gatedQuestSteps.length} have gate/payoff readback; pace counts ${paceSummary(paceCounts)}.`
    },
    {
      band: "10h",
      keySystems: "Faction questlines, reputation tiers, zone ecology, travel gates, rare materials, recipe families, dungeon preparation.",
      activeGoal: "Choose which faction values and survival loops to strengthen, then build enough mastery to cross harder regions.",
      friction: "Build planning, faction tradeoffs, route costs, creature ecology pressure, material scarcity, capstone checks.",
      reward: "Trusted/respected faction status, durable gear paths, route unlocks, capstone quest completion, visible world change.",
      evidence: `${worldFactions.length} factions, ${worldCraftingRecipes.length} recipes, ${worldCraftingMaterials.length} materials, ${worldReputationRewards.length} reputation rewards.`
    },
    {
      band: "100h",
      keySystems: "Cross-faction optimization, elite routes, dungeon mastery, rare economy loops, optional party roles, world-event and seasonal bridge hooks.",
      activeGoal: "Master a build and social role while choosing how the wider faction network changes under repeated pressure.",
      friction: "High-skill execution, long-term economy pressure, faction consequences, endgame route risk, boredom from solved loops.",
      reward: "Exalted identity, optimized loadouts, hard-route clears, prestigious cosmetics or titles, social proof, lasting world consequences.",
      evidence: `${analysis.totals.sparse} sparse and ${analysis.totals.dense} dense world chunks show where long-term mastery routes can gain contrast.`
    }
  ];

  const gaps = [
    missingFactionQuestlines.length > 0
      ? `Add or document faction questline coverage for ${missingFactionQuestlines.join(", ")}.`
      : gatedQuestSteps.length > 0
        ? `Faction questline coverage exists; ${gatedQuestSteps.length}/${questSteps.length} source steps now have authored gate/payoff readback, so next gap is extending coverage without overloading early play.`
        : "Faction questline coverage exists for every major faction; next gap is stronger gate/payoff contrast between intro, field, and capstone steps.",
    missingFactionRecipes.length > 0
      ? `Add recipe identity or clear inspect-only placeholders for ${missingFactionRecipes.join(", ")}.`
      : "Recipe identity exists across factions; next gap is clearer player-facing unlock timing.",
    progressionDocText.length === 0
      ? "Create ./docs/world-player-progression.md as the primary loop record."
      : docHas100Hour(progressionDocText)
        ? "Keep ./docs/world-player-progression.md current with each major loop, faction, route, or quest bridge change."
        : "Expand ./docs/world-player-progression.md with an explicit 100-hour mastery section.",
    analysis.totals.sparse > 0
      ? "Use sparse chunks as intentional mastery routes, danger gaps, or future quest bridges instead of random decoration."
      : "World density has no sparse chunks by current scan; preserve breathing room and avoid adding noise."
  ];

  return {
    generatedAt: new Date().toISOString(),
    inferredInputs: {
      targetGenreCoreHook: "Browser-playable MMO action sandbox where faction ideology, local ecology, skills, gathering, crafting, and travel routes make progression readable.",
      targetAudience: "Mid-core players who can learn layered systems but need one reachable goal and clean in-play feedback.",
      centeredMechanic: "Faction-bound world progression through skill use, local quest proof, material mastery, and route unlocks."
    },
    counts: {
      factions: worldFactions.length,
      questlines: worldFactionQuestlines.length,
      questSteps: questSteps.length,
      questPaces: paceCounts,
      authoredProgressionGates: gatedQuestSteps.length,
      authoredProgressionGateBands: gateBandCounts,
      creatures: worldCreatureDefinitions.length,
      landmarks: worldLandmarkPlacements.length,
      recipes: worldCraftingRecipes.length,
      materials: worldCraftingMaterials.length,
      materialCategories,
      reputationRewards: worldReputationRewards.length,
      worldDensity: analysis.totals
    },
    matrix,
    gates: [
      "10s to 10m: First Field Proof - player can move, hit or gather, read danger, talk/inspect, and receive a reward without opening complex planning surfaces.",
      "10m to 10h: Faction Trust Proof - player completes local intro/field work, sees faction motive, earns a useful unlock, and understands one route or crafting dependency.",
      "10h to 100h: World Pressure Proof - player clears a capstone, survives a harder route or dungeon prep loop, and chooses a faction/build consequence before meta optimization opens."
    ],
    hiddenEarly: [
      "Detailed reputation math",
      "Multi-faction consequence trees",
      "Advanced recipes and rare material chains",
      "Premium travel optimization",
      "Dungeon role optimization",
      "Long-term economy or social comparison"
    ],
    redFlags: redFlags(),
    prompts: [
      "Which 10-minute session should be the default satisfying loop when a player has only one short play window?",
      "What single mastery proof should unlock the first real cross-faction tradeoff without overwhelming the player?",
      "What should a 100-hour player still be practicing: execution, route planning, economy mastery, faction politics, or social role leadership?"
    ],
    gaps,
    authoredGateReadbacks: gatedQuestSteps.map((step) => ({
      id: step.id,
      title: step.title,
      band: "progressionBand" in step && step.progressionBand ? step.progressionBand : "unbanded",
      gate: "masteryGate" in step ? step.masteryGate : "",
      payoff: "progressionPayoff" in step ? step.progressionPayoff : ""
    })),
    priorityWorldPasses: priorityChunks
  };
}

function printMarkdown(scan: ReturnType<typeof buildScan>) {
  console.log("# Player Progression Scan");
  console.log(`Generated: ${scan.generatedAt}`);
  console.log("");
  console.log("## Inferred Inputs");
  console.log(`- Target genre / core hook: ${scan.inferredInputs.targetGenreCoreHook}`);
  console.log(`- Target audience: ${scan.inferredInputs.targetAudience}`);
  console.log(`- Centered mechanic: ${scan.inferredInputs.centeredMechanic}`);
  console.log("");
  console.log("## Progression Matrix");
  console.log(markdownTable(["Band", "Key Systems Introduced", "Active Player Goal", "Friction / Challenge", "Reward / Metric", "Evidence"], scan.matrix.map((row) => [
    row.band,
    row.keySystems,
    row.activeGoal,
    row.friction,
    row.reward,
    row.evidence
  ])));
  console.log("");
  console.log("## Gates");
  for (const gate of scan.gates) console.log(`- ${gate}`);
  console.log("");
  console.log("## Hide Or Simplify Early");
  for (const item of scan.hiddenEarly) console.log(`- ${item}`);
  console.log("");
  console.log("## Red Flags");
  for (const entry of scan.redFlags) console.log(`- ${entry.band}: ${entry.items.join(" / ")}`);
  console.log("");
  console.log("## Current Gaps");
  for (const gap of scan.gaps) console.log(`- ${gap}`);
  console.log("");
  console.log("## Authored Gate Readbacks");
  if (scan.authoredGateReadbacks.length === 0) {
    console.log("- None yet.");
  } else {
    for (const readback of scan.authoredGateReadbacks) {
      console.log(`- ${readback.band} ${readback.title}: ${readback.gate} Payoff: ${readback.payoff}`);
    }
  }
  console.log("");
  console.log("## Priority World Passes");
  for (const pass of scan.priorityWorldPasses) {
    console.log(`- Chunk ${pass.chunk} (${pass.band}, ${pass.zone}): ${pass.zones}; ${pass.components}. WHY: ${pass.why} ${pass.recommendation}`);
  }
  console.log("");
  console.log("## Refinement Prompts");
  for (const prompt of scan.prompts) console.log(`- ${prompt}`);
}

function redFlags() {
  return [
    {
      band: "10s" as const,
      items: [
        "The player presses a button and cannot tell whether it worked.",
        "Critical danger is only readable from tiny text or color.",
        "FX hides movement, hit timing, or interact prompts."
      ]
    },
    {
      band: "10m" as const,
      items: [
        "Menu or travel management takes more time than active play.",
        "The next goal disappears after a quest step completes.",
        "Local rewards are only bigger numbers with no new route, recipe, or world read."
      ]
    },
    {
      band: "10h" as const,
      items: [
        "Faction systems unlock before the player understands faction values.",
        "Crafting asks for rare inputs before the player knows where they come from.",
        "Capstones test grind volume instead of route, build, or ecology mastery."
      ]
    },
    {
      band: "100h" as const,
      items: [
        "Endgame is only repeated chores with no new mastery question.",
        "Social or meta pressure becomes mandatory before solo identity is stable.",
        "Optimization erases faction meaning because every path converges on the same answer."
      ]
    }
  ];
}

function countBy<T extends string>(values: readonly T[]) {
  const counts: Partial<Record<T, number>> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function paceSummary(counts: Partial<Record<WorldQuestPace, number>>) {
  const order: WorldQuestPace[] = ["intro", "field", "dungeon", "capstone"];
  return order.map((pace) => `${pace} ${counts[pace] ?? 0}`).join(", ");
}

function docHas100Hour(text: string) {
  return /100\s*-?\s*hour|100h/i.test(text);
}

function markdownTable(headers: string[], rows: string[][]) {
  const escape = (value: string) => value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const lines = [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`
  ];
  for (const row of rows) lines.push(`| ${row.map(escape).join(" | ")} |`);
  return lines.join("\n");
}

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function numberAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  const raw = process.argv[index + 1];
  if (raw === undefined || raw.startsWith("--")) throw new Error(`${flag} requires a positive integer.`);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}
