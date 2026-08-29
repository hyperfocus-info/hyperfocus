import { mmoSkillDemoRegionConfig, getMmoSkillDemoAnchorTile, TILE, type RegionQuestManifestEntry } from "../data/world.ts";
import { worldFactionQuestSteps, type WorldQuestObjective } from "../data/world-quests.ts";
import { bankQty, hasInventoryItem, hasQuestFlag, itemQty } from "../shared-loadout.ts";
import { type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity, type ZoneId } from "../shared-contracts.ts";
import { getGatherableMaterialById } from "../shared/materials.ts";
import { earlyLoopAction } from "./early-loop.ts";
import { contractInfo } from "./progression.ts";
import { labelize } from "./render/types.ts";

export type MainQuestDestination =
  | { kind: "point"; questId: string; label: string; x: number; y: number; zoneId: ZoneId }
  | { kind: "area"; questId: string; label: string; x: number; y: number; zoneId: ZoneId; radius: number };

export type MainQuestOption = {
  id: string;
  label: string;
  status: string;
  summary: string;
  selectable: boolean;
  active: boolean;
  value: number;
  max: number;
};

const PROVING_CONTRACT_ID = "first-arms-proving";
const STARTER_QUEST_IDS = ["first-cut", "second-cut", "wolf-culling", "final-cut", "heavy-lifting", "silent-sands"] as const;
const QUEST_LABELS: Record<string, string> = {
  "first-cut": "First Cut",
  "second-cut": "Second Cut",
  "wolf-culling": "Wolf Culling",
  "final-cut": "Final Cut",
  "lost-compass": "Lost Compass",
  "fast-travel-registered": "Route Registration",
  "heavy-lifting": "Heavy Lifting",
  "silent-sands": "Silent Sands",
  "first-arms-proving": "First Arms"
};

const SIDE_QUEST_NPCS: Record<string, string> = {
  "lost-compass": "captain-marrow",
  "fast-travel-registered": "captain-marrow",
  "wolf-pelt-quota": "miller-finn",
  "root-of-the-problem": "scout-elara",
  "great-starvation": "overseer-bale",
  "luminous-depths": "geologist-mira",
  "forbidden-scripts": "high-arcanist-vael",
  "seal-the-rift": "high-arcanist-vael",
  "silent-signal": "runner-kael",
  "coastal-draught": "navigator-kai",
  "void-resistance": "alchemist-zora",
  "feathered-pests": "master-kael",
  "ghostly-trade": "merchant-kaya",
  "cursed-statue": "cursed-statue"
};

const TREE_GATHER_MATERIALS = new Set(["ash-logs", "oakhaven-softwood", "soft-pine-bark", "oak-sap-extract", "dry-bramble-branch", "bright-clover-flower", "wild-oats-bundle", "bitter-root-herb"]);
const ORE_GATHER_MATERIALS = new Set(["iron-ore", "dull-tin-flake", "copper-dust", "fine-coal-lump", "porous-sandstone", "ironcrag-slate", "deep-geode-cluster", "ironcrag-slate"]);
const ZONE_GATHER_MATERIAL_ZONE: Record<string, ZoneId> = {
  "washed-sea-shell": "port-marrow",
  "desert-cactus-pulp": "bazaar",
  "nihil-ash-sludge": "void-rift",
  "ascetic-jade-stone": "whisperwind-ascent",
  "monastic-sage-tea": "whisperwind-ascent",
  "anointed-candle-core": "holy-reach",
  "inquisition-sealing-wax": "holy-reach",
  "dungeon-lock-grate": "dungeon"
};
const MATERIAL_CREATURE_SOURCE: Record<string, string> = {
  "bramble-thorn-vine": "bramble-beast",
  "spore-dust-cloud": "spore-pod",
  "high-peak-feather": "high-peak-eagle",
  "soot-crab-carapace": "soot-crab",
  "tide-stalker-scale": "tide-stalker",
  "timber-goliath-sapwood": "timber-goliath",
  "void-crawler-mandible": "void-crawler",
  "void-seed-shell": "rift-leech",
  "pure-void-tear": "void-sent-sentinel",
  "ancient-script-scroll": "mirror-king",
  "mirror-shatter-shard": "mirror-king",
  "anointed-candle-core": "anointed-crusader",
  "gargoyle-heart-core": "void-gargoyle",
  "prism-crystal-shards": "prism-golem",
  "outcast-hunt-skull": "ashwood-alpha",
  "feral-blood-vial": "ashwood-alpha",
  "druidic-seed-pod": "great-ash-lord",
  "syndicate-debt-note": "bazaar-guard",
  "tallow-wraith-wax": "tallow-wraith",
  "washed-sea-shell": "tide-stalker",
  "desert-cactus-pulp": "mire-bomber"
};
const CREATURE_PROOF_ITEM: Record<string, string> = {
  "bramble-beast": "bramble-thorn-vine",
  "spore-pod": "spore-dust-cloud",
  "high-peak-eagle": "high-peak-feather",
  "soot-crab": "soot-crab-carapace",
  "tide-stalker": "tide-stalker-scale",
  "timber-goliath": "timber-goliath-sapwood",
  "void-crawler": "void-crawler-mandible",
  "rift-leech": "void-seed-shell",
  "void-sent-sentinel": "void-seed-shell",
  "void-gargoyle": "gargoyle-heart-core",
  "prism-golem": "prism-crystal-shards",
  "ashwood-alpha": "outcast-hunt-skull",
  "great-ash-lord": "druidic-seed-pod",
  "bazaar-guard": "syndicate-debt-note",
  "tallow-wraith": "tallow-wraith-wax",
  "mire-bomber": "desert-cactus-pulp",
  "mirror-king": "mirror-shatter-shard",
  "anointed-crusader": "anointed-candle-core"
};

function questManifest(id: string): RegionQuestManifestEntry | undefined {
  return mmoSkillDemoRegionConfig.quests.find((quest) => quest.id === id);
}

function worldQuestStep(id: string) {
  return worldFactionQuestSteps.find((step) => step.id === id);
}

function provingSampleCount(player: PlayerEntity) {
  return ["mace", "bow", "staff", "wand", "twin-blades", "blade"].filter((weaponId) => hasQuestFlag(player, `${PROVING_CONTRACT_ID}-sampled-${weaponId}`)).length;
}

export function coreQuestLabel(questId: string) {
  return QUEST_LABELS[questId] ?? worldQuestStep(questId)?.title ?? questManifest(questId)?.id.split("-").map((part) => labelize(part)).join(" ") ?? labelize(questId);
}

function acceptedQuestIds(player: PlayerEntity) {
  const ids = new Set<string>();
  for (const flag of Object.keys(player.questFlags ?? {})) {
    if (!flag.endsWith("-accepted")) continue;
    const id = flag.slice(0, -"accepted".length - 1);
    if (!hasQuestFlag(player, id)) ids.add(id);
  }
  return ids;
}

function starterQuestUnlocked(player: PlayerEntity, questId: string) {
  if (questId === "first-cut") return true;
  if (questId === "second-cut") return hasQuestFlag(player, "first-cut");
  if (questId === "wolf-culling") return hasQuestFlag(player, "second-cut");
  if (questId === "final-cut") return hasQuestFlag(player, "wolf-culling");
  if (questId === "heavy-lifting") return hasInventoryItem(player, "pickaxe") || player.equipment?.pickaxe || hasQuestFlag(player, "fast-travel-registered");
  if (questId === "silent-sands") return hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || player.zoneId === "bazaar" || player.zoneId === "void-rift";
  return false;
}

function nextStarterQuest(player: PlayerEntity) {
  if (!hasQuestFlag(player, "first-cut")) return "first-cut";
  if (!hasQuestFlag(player, "second-cut")) return "second-cut";
  if (!hasQuestFlag(player, "wolf-culling")) return "wolf-culling";
  if (!hasQuestFlag(player, "final-cut")) return "final-cut";
  if (!hasQuestFlag(player, "heavy-lifting") && starterQuestUnlocked(player, "heavy-lifting")) return "heavy-lifting";
  if (!hasQuestFlag(player, "silent-sands") && starterQuestUnlocked(player, "silent-sands")) return "silent-sands";
  return "";
}

export function trackedMainQuestId(player: PlayerEntity | undefined) {
  if (!player) return "";
  const selected = player.activeQuestId || "";
  if (selected && !hasQuestFlag(player, selected)) return selected;
  return nextStarterQuest(player) || [...acceptedQuestIds(player)][0] || (!hasQuestFlag(player, "first-cut") ? "first-cut" : "");
}

function starterQuestProgress(player: PlayerEntity, questId: string) {
  const ashLogs = itemQty(player, "ash-logs") + bankQty(player, "ash-logs");
  if (questId === "first-cut") return { value: Math.min(5, ashLogs), max: 5, ready: hasQuestFlag(player, "first-cut-ready") };
  if (questId === "second-cut") return { value: Math.min(12, ashLogs), max: 12, ready: hasQuestFlag(player, "second-cut-ready") };
  if (questId === "wolf-culling") return { value: Math.min(10, player.wolfKills), max: 10, ready: hasQuestFlag(player, "wolf-culling-ready") };
  if (questId === "final-cut") return { value: hasQuestFlag(player, "final-cut-ready") ? 1 : 0, max: 1, ready: hasQuestFlag(player, "final-cut-ready") };
  if (questId === "heavy-lifting") return { value: Math.min(50, bankQty(player, "iron-ore")), max: 50, ready: hasQuestFlag(player, "heavy-lifting-ready") };
  if (questId === "silent-sands") return { value: Math.min(120, Math.floor(player.bazaarSurvivalMs / 1000)), max: 120, ready: hasQuestFlag(player, "silent-sands-ready") };
  if (questId === PROVING_CONTRACT_ID) return { value: provingSampleCount(player), max: 3, ready: provingSampleCount(player) >= 3 };
  return { value: hasQuestFlag(player, `${questId}-ready`) ? 1 : 0, max: 1, ready: hasQuestFlag(player, `${questId}-ready`) };
}

function materialItemIdForResource(resource: ResourceEntity) {
  const material = typeof resource.materialId === "number" ? getGatherableMaterialById(resource.materialId) : undefined;
  return material?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
}

export function mainQuestGoalText(player: PlayerEntity) {
  const questId = trackedMainQuestId(player);
  if (questId === PROVING_CONTRACT_ID && hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`) && !hasQuestFlag(player, PROVING_CONTRACT_ID)) {
    return `Try loaner weapons ${provingSampleCount(player)}/3; fallback: cut Ash tree.`;
  }
  if (questId === "first-cut") {
    return earlyLoopAction(undefined, player).hudText;
  }
  if (questId === "second-cut") {
    if (hasQuestFlag(player, "second-cut-ready")) return "Return to Rowan. Second Cut 12/12.";
    return `Stockpile Ash logs ${Math.min(12, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/12`;
  }
  if (questId === "wolf-culling") {
    if (hasQuestFlag(player, "wolf-culling-ready")) return "Return to Rowan. Wolf Culling 10/10.";
    return `Cull marked wolves ${Math.min(10, player.wolfKills)}/10`;
  }
  if (questId === "final-cut") return "Return to Rowan for route pledge.";
  if (questId === "lost-compass" || questId === "fast-travel-registered") return "Register the Ashwood route with Captain Marrow.";
  if (questId === "heavy-lifting") {
    if (!hasInventoryItem(player, "pickaxe") && !player.equipment?.pickaxe) return "Buy a Pickaxe from Foreman Iron-Will.";
    if (hasQuestFlag(player, "heavy-lifting-ready")) return "Turn in Heavy Lifting at Foreman Iron-Will.";
    return `Bank Iron Ore ${Math.min(50, bankQty(player, "iron-ore"))}/50 with Valerius.`;
  }
  if (questId === "silent-sands") {
    if (hasQuestFlag(player, "silent-sands-ready")) return "Turn in Silent Sands at Master Kael.";
    return `Survive Bazaar pressure ${Math.min(120, Math.floor(player.bazaarSurvivalMs / 1000))}/120s.`;
  }
  const worldStep = worldQuestStep(questId);
  if (worldStep) return `${worldStep.title}: ${worldStep.masteryGate ?? worldStep.summary}`;
  const contract = contractInfo(player.contractId);
  if (player.contractCooldownMs > 0) return `Guild contract cooldown ${Math.ceil(player.contractCooldownMs / 1000)}s.`;
  if (!questId) return `${contract.name}: ${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills} in ${contract.area}.`;
  return `${coreQuestLabel(questId)}: return to ${labelize(SIDE_QUEST_NPCS[questId] ?? "quest giver")}.`;
}

export function mainQuestOptions(player: PlayerEntity): MainQuestOption[] {
  const activeId = trackedMainQuestId(player);
  const ids = new Set<string>();
  for (const questId of STARTER_QUEST_IDS) {
    if (!hasQuestFlag(player, questId) && starterQuestUnlocked(player, questId)) ids.add(questId);
  }
  for (const id of acceptedQuestIds(player)) ids.add(id);
  if (!ids.size && !hasQuestFlag(player, "first-cut")) ids.add("first-cut");
  return [...ids].map((id) => {
    const progress = starterQuestProgress(player, id);
    const manifest = questManifest(id);
    const worldStep = worldQuestStep(id);
    const active = id === activeId;
    return {
      id,
      label: coreQuestLabel(id),
      status: active ? "Main" : progress.ready ? "Ready" : "Track",
      summary: worldStep?.summary ?? manifest?.summary ?? mainQuestGoalText({ ...player, activeQuestId: id }),
      selectable: !hasQuestFlag(player, id),
      active,
      value: progress.value,
      max: progress.max
    };
  });
}

function nearestNpcByKind(state: MmoSkillDemoState, kind: string, preferredZone?: string): NpcEntity | undefined {
  const npcs = Object.values(state.npcs ?? {}).filter((npc) => npc.hp > 0 && npc.kind === kind);
  if (preferredZone) return npcs.find((npc) => npc.zoneId === preferredZone) ?? npcs[0];
  return npcs[0];
}

function nearestByPlayer<T extends { x: number; y: number; zoneId?: string }>(player: PlayerEntity, items: readonly T[]) {
  let best: T | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const distance = Math.hypot(item.x - player.x, item.y - player.y);
    const score = distance + (item.zoneId === player.zoneId ? 0 : 1_000_000);
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function resourcePoint(state: MmoSkillDemoState, player: PlayerEntity, questId: string, label: string, predicate: (resource: ResourceEntity) => boolean): MainQuestDestination | undefined {
  const resources = Object.values(state.resources ?? {}).filter((resource) => resource && !resource.depleted && predicate(resource));
  const resource = nearestByPlayer(player, resources);
  return resource ? { kind: "point", questId, label, x: resource.x, y: resource.y, zoneId: resource.zoneId } : undefined;
}

function enemyPoint(state: MmoSkillDemoState, player: PlayerEntity, questId: string, label: string, kinds: readonly string[]): MainQuestDestination | undefined {
  const wanted = new Set(kinds);
  const npcs = Object.values(state.npcs ?? {}).filter((npc) => npc && npc.hp > 0 && wanted.has(npc.kind));
  const npc = nearestByPlayer(player, npcs);
  return npc ? { kind: "point", questId, label, x: npc.x, y: npc.y, zoneId: npc.zoneId } : undefined;
}

function npcPoint(state: MmoSkillDemoState, questId: string, label: string, kind: string, preferredZone?: string): MainQuestDestination | undefined {
  const npc = nearestNpcByKind(state, kind, preferredZone);
  return npc ? { kind: "point", questId, label, x: npc.x, y: npc.y, zoneId: npc.zoneId } : undefined;
}

function anchorArea(questId: string, label: string, anchorId: string, zoneId: ZoneId, radius = TILE * 4): MainQuestDestination {
  const tile = getMmoSkillDemoAnchorTile(anchorId);
  return { kind: "area", questId, label, x: tile.x * TILE + TILE * 0.5, y: tile.y * TILE + TILE * 0.5, zoneId, radius };
}

function materialSourceDestination(state: MmoSkillDemoState, player: PlayerEntity, questId: string, materialId: string): MainQuestDestination | undefined {
  const label = `Gather ${labelize(materialId)}`;
  const exactNode = resourcePoint(state, player, questId, label, (resource) => materialItemIdForResource(resource) === materialId);
  if (exactNode) return exactNode;
  const creatureKind = MATERIAL_CREATURE_SOURCE[materialId];
  if (creatureKind) {
    const enemy = enemyPoint(state, player, questId, `Hunt ${labelize(creatureKind)}`, [creatureKind]);
    if (enemy) return enemy;
  }
  if (TREE_GATHER_MATERIALS.has(materialId)) return resourcePoint(state, player, questId, label, (resource) => resource.kind === "tree");
  if (ORE_GATHER_MATERIALS.has(materialId)) return resourcePoint(state, player, questId, label, (resource) => resource.kind === "ore");
  const zoneId = ZONE_GATHER_MATERIAL_ZONE[materialId];
  if (zoneId) {
    const zoneResource = resourcePoint(state, player, questId, label, (resource) => resource.zoneId === zoneId);
    if (zoneResource) return zoneResource;
  }
  return undefined;
}

function creatureProofCount(player: PlayerEntity, creatureId: string) {
  if (creatureId === "prowling-wolf" || creatureId === "ashwood-alpha") return player.wolfKills;
  if (creatureId === "iron-eye-bat" || creatureId === "calamity-bat") return player.batKills;
  const proofItem = CREATURE_PROOF_ITEM[creatureId];
  return proofItem ? itemQty(player, proofItem) + bankQty(player, proofItem) : 0;
}

function worldObjectiveDestination(state: MmoSkillDemoState, player: PlayerEntity, questId: string, objective: WorldQuestObjective): MainQuestDestination | undefined {
  if (objective.kind === "gather" || objective.kind === "craft") {
    if (itemQty(player, objective.materialId) + bankQty(player, objective.materialId) < objective.amount) return materialSourceDestination(state, player, questId, objective.materialId);
    return undefined;
  }
  if (objective.kind === "deliver") {
    if (itemQty(player, objective.materialId) + bankQty(player, objective.materialId) < objective.amount) return materialSourceDestination(state, player, questId, objective.materialId);
    return npcPoint(state, questId, `Deliver ${labelize(objective.materialId)}`, objective.recipientNpcId.split(".").pop() || objective.recipientNpcId);
  }
  if (objective.kind === "defeat" && creatureProofCount(player, objective.creatureId) < objective.amount) {
    return enemyPoint(state, player, questId, `Defeat ${labelize(objective.creatureId)}`, [objective.creatureId]);
  }
  if (objective.kind === "talk") return npcPoint(state, questId, "Talk", objective.npcId.split(".").pop() || objective.npcId);
  if (objective.kind === "scout" || objective.kind === "survive") return anchorArea(questId, labelize(objective.kind), objective.kind === "scout" ? objective.anchorId : objective.zoneId, objective.zoneId, TILE * 5);
  if (objective.kind === "attune") {
    if (objective.materialId && itemQty(player, objective.materialId) + bankQty(player, objective.materialId) <= 0) return materialSourceDestination(state, player, questId, objective.materialId);
    return anchorArea(questId, "Attune", objective.anchorId, player.zoneId, TILE * 4);
  }
  return undefined;
}

export function mainQuestDestination(state: MmoSkillDemoState, player: PlayerEntity | undefined): MainQuestDestination | undefined {
  if (!player) return undefined;
  const questId = trackedMainQuestId(player);
  if (!questId || hasQuestFlag(player, questId)) return undefined;
  const label = coreQuestLabel(questId);
  if (questId === PROVING_CONTRACT_ID) return npcPoint(state, questId, label, "contract-board", "ashwood") ?? npcPoint(state, questId, label, "elder-rowan", "ashwood");
  if (["first-cut", "second-cut"].includes(questId) && !hasQuestFlag(player, `${questId}-ready`)) {
    return resourcePoint(state, player, questId, "Cut Ash Tree", (resource) => resource.kind === "tree") ?? anchorArea(questId, label, "oakhaven", "ashwood", TILE * 5);
  }
  if (questId === "wolf-culling" && !hasQuestFlag(player, "wolf-culling-ready")) {
    return enemyPoint(state, player, questId, "Cull Wolf", ["prowling-wolf", "alpha-timberwolf", "ashwood-alpha"]) ?? anchorArea(questId, label, "overgrown-thicket", "ashwood", TILE * 5.5);
  }
  if (questId === "heavy-lifting" && (!hasInventoryItem(player, "pickaxe") && !player.equipment?.pickaxe)) return npcPoint(state, questId, label, "foreman-iron-will", "crags");
  if (questId === "heavy-lifting" && !hasQuestFlag(player, "heavy-lifting-ready")) {
    if (itemQty(player, "iron-ore") + bankQty(player, "iron-ore") >= 50 && bankQty(player, "iron-ore") < 50) {
      return npcPoint(state, questId, "Bank Iron Ore", "banker-valerius", "crags") ?? npcPoint(state, questId, "Bank Iron Ore", "banker-valerius");
    }
    return resourcePoint(state, player, questId, "Mine Iron Ore", (resource) => resource.kind === "ore") ?? anchorArea(questId, label, "ironcrag", "crags", TILE * 5);
  }
  if (questId === "silent-sands" && !hasQuestFlag(player, "silent-sands-ready")) return anchorArea(questId, label, "void-rift", "void-rift", TILE * 6);
  if (["first-cut", "second-cut", "wolf-culling", "final-cut"].includes(questId)) return npcPoint(state, questId, label, "elder-rowan", "ashwood");
  if (questId === "lost-compass" || questId === "fast-travel-registered") return npcPoint(state, questId, label, "captain-marrow", "port-marrow");
  if (questId === "heavy-lifting") return npcPoint(state, questId, label, "foreman-iron-will", "crags");
  if (questId === "silent-sands") return npcPoint(state, questId, label, "master-kael", "crags");
  const sideNpc = SIDE_QUEST_NPCS[questId];
  if (sideNpc) return npcPoint(state, questId, label, sideNpc);
  const worldStep = worldQuestStep(questId);
  if (worldStep) {
    for (const objective of worldStep.objectives) {
      const destination = worldObjectiveDestination(state, player, questId, objective);
      if (destination) return destination;
    }
    return anchorArea(questId, worldStep.title, worldStep.anchorId, worldStep.zoneId, worldStep.pace === "intro" ? TILE * 4 : TILE * 6);
  }
  const manifest = questManifest(questId);
  if (manifest) return anchorArea(questId, label, manifest.anchorId, manifest.zoneId, TILE * 5);
  return undefined;
}
