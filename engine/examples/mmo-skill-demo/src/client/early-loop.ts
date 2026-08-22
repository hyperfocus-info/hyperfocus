import { bankQty, hasQuestFlag, itemQty, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity } from "../shared.ts";

export type EarlyLoopBand = "10s" | "10m";
export type EarlyLoopStateId =
  | "spawn"
  | "first-input"
  | "first-proof"
  | "first-reward"
  | "first-return"
  | "first-arms"
  | "first-cut"
  | "second-cut"
  | "wolf-culling"
  | "final-cut"
  | "route-registration";

export type EarlyLoopAction = {
  id: string;
  band: EarlyLoopBand;
  primaryLabel: string;
  fallbackLabel: string;
  hudText: string;
  journalText: string;
  rewardPreview: string;
  destinationKind: "resource" | "npc" | "enemy" | "panel" | "area";
  blocker: string;
};

const PROVING_CONTRACT_ID = "first-arms-proving";

function ashLogs(player: PlayerEntity) {
  return itemQty(player, "ash-logs") + bankQty(player, "ash-logs");
}

function provingSampleCount(player: PlayerEntity) {
  return ["mace", "bow", "staff", "wand", "twin-blades", "blade"].filter((weaponId) => hasQuestFlag(player, `${PROVING_CONTRACT_ID}-sampled-${weaponId}`)).length;
}

function action(
  id: EarlyLoopStateId,
  band: EarlyLoopBand,
  primaryLabel: string,
  fallbackLabel: string,
  hudText: string,
  journalText: string,
  rewardPreview: string,
  destinationKind: EarlyLoopAction["destinationKind"]
): EarlyLoopAction {
  return { id, band, primaryLabel, fallbackLabel, hudText, journalText, rewardPreview, destinationKind, blocker: "" };
}

export function earlyLoopAction(_state: unknown, player: PlayerEntity): EarlyLoopAction {
  const logs = ashLogs(player);
  const firstArmsActive = hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`) && !hasQuestFlag(player, PROVING_CONTRACT_ID);
  if (firstArmsActive) {
    const samples = provingSampleCount(player);
    return action(
      "first-arms",
      "10m",
      "Try next loaner",
      "Cut Ash tree",
      `Try loaner ${samples}/3; First Cut fallback stays Ash tree.`,
      `Return: First Arms ${samples}/3, fallback First Cut ${Math.min(5, logs)}/5, last proof ${logs > 0 ? "clean cut" : "none yet"}, next payoff starter purse.`,
      "Keep chosen weapon, starter purse, then cut Ash tree.",
      "npc"
    );
  }
  if (!hasQuestFlag(player, "first-cut")) {
    if (hasQuestFlag(player, "first-cut-ready")) {
      return action(
        "first-reward",
        "10s",
        "Return to Rowan",
        "Open Journal note",
        "Return to Rowan. Proof marked: clean cut.",
        "Return: First Cut ready, nearest target Rowan, last proof clean cut, next payoff iron hatchet.",
        "Iron hatchet, RMB lesson, Second Cut.",
        "npc"
      );
    }
    const proof = logs > 0 ? "Proof marked: clean cut. " : "";
    return action(
      logs > 0 ? "first-proof" : "spawn",
      "10s",
      "Cut glowing Ash tree",
      "Talk to Rowan",
      `${proof}Cut glowing Ash tree ${Math.min(5, logs)}/5`,
      `Return: First Cut ${Math.min(5, logs)}/5, nearest target Ash tree, last proof ${logs > 0 ? "clean cut" : "none yet"}, next payoff iron hatchet.`,
      "Proof marked: clean cut.",
      "resource"
    );
  }
  if (!hasQuestFlag(player, "second-cut")) {
    if (hasQuestFlag(player, "second-cut-ready")) {
      return action(
        "second-cut",
        "10m",
        "Return to Rowan",
        "Track nearest Ash tree",
        "Return to Rowan. Second Cut 12/12.",
        "Return: Second Cut ready, nearest target Rowan, last proof stockpile full, next payoff wolf road.",
        "Renown paid, Wolf Culling opens.",
        "npc"
      );
    }
    return action(
      "first-cut",
      "10m",
      "Stockpile Ash logs",
      "Track nearest Ash tree",
      `Stockpile Ash logs ${Math.min(12, logs)}/12`,
      `Return: Second Cut ${Math.min(12, logs)}/12, nearest target Ash tree, last proof clean cut, next payoff road safety.`,
      "Stockpile count rises immediately.",
      "resource"
    );
  }
  if (!hasQuestFlag(player, "wolf-culling")) {
    if (hasQuestFlag(player, "wolf-culling-ready")) {
      return action(
        "wolf-culling",
        "10m",
        "Return to Rowan",
        "Follow quest trail",
        "Return to Rowan. Wolf Culling 10/10.",
        "Return: Wolf Culling ready, nearest target Rowan, last proof quiet road, next payoff Space movement.",
        "Space movement lesson unlocks.",
        "npc"
      );
    }
    return action(
      "second-cut",
      "10m",
      "Cull marked wolves",
      "Return to Rowan",
      `Cull marked wolves ${Math.min(10, player.wolfKills)}/10`,
      `Return: Wolf Culling ${Math.min(10, player.wolfKills)}/10, nearest target marked wolf, last proof stocked logs, next payoff route safety.`,
      "Wolf count updates on each kill.",
      "enemy"
    );
  }
  if (!hasQuestFlag(player, "final-cut")) {
    return action(
      "final-cut",
      "10m",
      "Get Rowan pledge",
      "Open Dock Note",
      "Return to Rowan for route pledge.",
      "Return: Final Cut handoff, nearest target Rowan, last proof quiet road, next payoff Captain route registration.",
      "Captain route registration opens.",
      "npc"
    );
  }
  if (!hasQuestFlag(player, "fast-travel-registered")) {
    return action(
      "route-registration",
      "10m",
      "Register route with Captain Marrow",
      "Track captain",
      "Register Rowan pledge with Captain Marrow.",
      "Return: Route Registration, nearest target Captain Marrow, last proof Rowan pledge, next payoff fast travel.",
      "Fast travel route marked.",
      "npc"
    );
  }
  return action(
    "route-registration",
    "10m",
    "Follow Lost Compass",
    "Open Journal note",
    "Follow Lost Compass route.",
    "Return: Ashwood route registered, nearest target journal route, last proof captain map, next payoff Ironcrag work.",
    "Ironcrag work opens.",
    "panel"
  );
}

function liveResource(state: MmoSkillDemoState, player: PlayerEntity, predicate: (resource: ResourceEntity) => boolean) {
  return Object.values(state.resources ?? {}).some((resource) => resource && !resource.depleted && resource.zoneId === player.zoneId && predicate(resource));
}

function liveNpc(state: MmoSkillDemoState, kind: string) {
  return Object.values(state.npcs ?? {}).some((npc: NpcEntity) => npc && npc.hp > 0 && npc.kind === kind);
}

function liveWolf(state: MmoSkillDemoState, player: PlayerEntity) {
  const kinds = new Set(["prowling-wolf", "alpha-timberwolf", "ashwood-alpha"]);
  return Object.values(state.npcs ?? {}).some((npc) => npc && npc.hp > 0 && npc.zoneId === player.zoneId && kinds.has(npc.kind));
}

export function earlyLoopBlockers(state: MmoSkillDemoState, player: PlayerEntity): string[] {
  const current = earlyLoopAction(state, player);
  const blockers: string[] = [];
  if (!current.primaryLabel.trim()) blockers.push("missing primary action");
  if (!current.fallbackLabel.trim()) blockers.push("missing fallback action");
  if (!current.hudText.trim()) blockers.push("missing HUD objective");
  if (!current.rewardPreview.trim()) blockers.push("missing visible reward readback");
  if (!current.journalText.trim()) blockers.push("missing recovery prompt");
  if (current.destinationKind === "panel" && current.primaryLabel.toLowerCase().includes("open")) blockers.push("forced panel/tutorial blocker");
  if (!hasQuestFlag(player, "first-cut") && !hasQuestFlag(player, "first-cut-accepted")) blockers.push("first-cut not accepted");
  if (current.id === "first-arms") {
    if (!current.fallbackLabel.toLowerCase().includes("cut ash")) blockers.push("first-arms missing normal-world fallback");
    if (!liveResource(state, player, (resource) => resource.kind === "tree")) blockers.push("first-arms fallback unavailable");
  }
  if (current.destinationKind === "resource" && !liveResource(state, player, (resource) => resource.kind === "tree")) blockers.push("missing tracked destination");
  if (current.destinationKind === "enemy" && !liveWolf(state, player)) blockers.push("missing tracked destination");
  if (current.destinationKind === "npc") {
    const kind =
      current.id === "first-arms" ? "contract-board" :
      current.primaryLabel.includes("Captain") || current.fallbackLabel.includes("captain") ? "captain-marrow" :
      "elder-rowan";
    if (!liveNpc(state, kind)) blockers.push("missing tracked destination");
  }
  return blockers;
}

export function earlyLoopReturnBriefing(state: MmoSkillDemoState, player: PlayerEntity) {
  return earlyLoopAction(state, player).journalText;
}
