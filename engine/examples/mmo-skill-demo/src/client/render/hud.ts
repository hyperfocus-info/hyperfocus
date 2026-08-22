import { renderRecord, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import { bankQty, hasInventoryItem, hasQuestFlag, hasSlot, itemQty, playerAbilityMetadata, selectedAbilityForSlot, type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "../../shared.ts";
import { currentUtcDateString, dailyQuestArcForDate } from "../../data/daily-quests.ts";
import { abilityTooltip, type AbilityTooltip } from "../ability-tooltips.ts";
import { COMBAT_SLOTS, energyMax, energyReady, energyValue, slotCooldownMs, slotUnlocked, type CombatSlot } from "../combat-view.ts";
import { earlyLoopReturnBriefing } from "../early-loop.ts";
import { contractInfo } from "../progression.ts";
import { mainQuestGoalText } from "../quest-guide.ts";
import { interactionLabel, landmarkInteractionInfo } from "./interactions.ts";
import { isSupportNpc } from "./npcs.ts";
import { hasGearOrItem, labelize, type DialogState, type InteractableTarget, type ScreenPoint } from "./types.ts";

export function eventProgressLine(state: MmoSkillDemoState) {
  const seconds = Math.max(0, Math.ceil(state.worldEventTimerMs / 1000));
  if (state.worldEventPhase === "active") {
    return `${state.worldEventName} ${Math.min(state.worldEventGoal, state.worldEventProgress)}/${state.worldEventGoal}  ${seconds}s`;
  }
  return `${labelize(state.worldEventPhase)}  ${seconds}s`;
}

export function nextGoalText(player: PlayerEntity) {
  return mainQuestGoalText(player);
}

function dailyQuestHudText(player: PlayerEntity) {
  const arc = dailyQuestArcForDate(player.dailyQuestDate || currentUtcDateString());
  if (player.dailyQuestCompleted) return `${arc.title}: complete`;
  const step = arc.steps[player.dailyQuestStep || 0];
  if (!step) return `${arc.title}: complete`;
  const progress = Math.min(step.targetCount, player.dailyQuestProgress || 0);
  const ready = progress >= step.targetCount ? " choose" : "";
  return `${step.title} ${progress}/${step.targetCount}${ready}`;
}

type NpcDialogProfile = { tags: readonly string[]; fallback: string };

const NPC_DIALOG_PROFILES: Record<string, NpcDialogProfile> = {
  "elder-rowan": { tags: ["patient", "watchful", "mentor"], fallback: "Rowan watches your stance before he watches your words." },
  "blacksmith-silas": { tags: ["proud", "practical"], fallback: "Silas checks your edges and grunts when a tool is being wasted." },
  "miller-finn": { tags: ["worried", "helpful"], fallback: "Finn keeps one eye on the grain sacks and one on the treeline." },
  "scout-elara": { tags: ["alert", "blunt"], fallback: "Elara marks fresh tracks, then points you toward the next danger." },
  "overseer-bale": { tags: ["impatient", "protective"], fallback: "Bale counts stores like every missing crate has a name on it." },
  "geologist-mira": { tags: ["curious", "precise"], fallback: "Mira taps the rock twice, then decides whether you brought a sample or a story." },
  "runner-kael": { tags: ["restless", "encouraging"], fallback: "Kael bounces on his heels, ready to drag you down the pass if you lag." },
  "high-arcanist-vael": { tags: ["excited", "obsessive"], fallback: "Vael has three theories open and only one of them is currently smoking." },
  "navigator-kai": { tags: ["calm", "dry"], fallback: "Kai reads tide marks, then your boots, then decides which is less reliable." },
  "alchemist-zora": { tags: ["sleepy", "brilliant"], fallback: "Zora blinks slowly, but her hands sort reagents faster than most people think." },
  "foreman-iron-will": { tags: ["gruff", "fair"], fallback: "Iron-Will respects paid tools, banked ore, and workers who come back standing." },
  "banker-valerius": { tags: ["formal", "watchful"], fallback: "Valerius records every deposit and somehow remembers every withdrawal." },
  "merchant-kaya": { tags: ["excited", "sharp"], fallback: "Kaya smiles like every bargain is a race she already won." },
  "master-kael": { tags: ["quiet", "demanding"], fallback: "Master Kael waits for proof, not promises." },
  "captain-marrow": { tags: ["booming", "practical"], fallback: "Marrow trusts maps, paid routes, and crews who ask before vanishing." },
  blacksmith: { tags: ["focused", "terse"], fallback: "The blacksmith weighs ore, coin, and whether you will survive wearing the result." },
  "apprentice-jinn": { tags: ["eager", "chatty"], fallback: "Jinn lines up berry bundles and tries not to oversell the cheap ones." },
  "cursed-statue": { tags: ["grumpy", "hungry"], fallback: "The statue offers power with the warmth of a locked door." },
  "innkeeper-martha": { tags: ["sleepy", "kind"], fallback: "Martha has tea ready and a ledger open to your last safe bed." },
  "contract-board": { tags: ["official", "cold"], fallback: "The board has no mood, only posted risks and promised pay." }
};

function ready(player: PlayerEntity, questId: string) {
  return hasQuestFlag(player, `${questId}-ready`) && !hasQuestFlag(player, questId);
}

export function dialogTextForNpc(npc: NpcEntity, player: PlayerEntity) {
  const profile = NPC_DIALOG_PROFILES[npc.kind];
  switch (npc.kind) {
    case "elder-rowan":
      if (ready(player, "first-cut")) return "Fresh Ash, clean ends. Good. Take the iron hatchet; heavier work starts when your hands stay this careful.";
      if (!hasQuestFlag(player, "first-cut")) return `First Cut: ${Math.min(5, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/5 Ash Logs. Cut marked Ash only; ragged bark sends you back empty-handed.`;
      if (ready(player, "second-cut")) return "This stockpile will feed cold nights. Now make the road quiet enough for runners.";
      if (!hasQuestFlag(player, "second-cut")) return `Second Cut: ${Math.min(12, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/12 Ash Logs. Oakhaven needs stores, not proof of one lucky swing.`;
      if (ready(player, "wolf-culling")) return "Fewer howls on the south road. I can teach Rush now; use it to leave danger, not chase pride.";
      if (!hasQuestFlag(player, "wolf-culling")) return `Wolf Culling: ${Math.min(10, player.wolfKills)}/10. The road still speaks in teeth. Quiet it before children carry grain.`;
      if (!hasQuestFlag(player, "final-cut")) return "Ashwood breathes easier. Take my route pledge to Captain Marrow; he will not mark a noisy road on his slate.";
      return "No new lesson. Keep the route clean; a marked road is a promise, not a trophy.";
    case "blacksmith-silas":
      return hasInventoryItem(player, "iron-hatchet")
        ? "That iron hatchet sits right in your hand. Bring ore later; I can make better than lesson metal."
        : "Finish Rowan's first cut. Until then, that training hatchet is a spoon with a handle.";
    case "miller-finn":
      if (hasQuestFlag(player, "wolf-pelt-quota")) return "The grain sacks can breathe for a week. Fewer wolves means fewer flour carts split open.";
      return `Wolf-Pelt Quota: ${Math.min(10, player.wolfKills)}/10. The mill road is paid in flour sacks; every wolf thinned keeps bread moving.`;
    case "scout-elara":
      if (hasQuestFlag(player, "root-of-the-problem")) return "Thicket Heart contained. Good. You found the root instead of trimming branches.";
      return player.dungeonBossKills > 0
        ? "Boss ash on your gear. Report it in and I will mark the thicket route safe."
        : "Tracks bend toward the Overgrown Thicket. I need the source stopped, not another belt of pelts.";
    case "overseer-bale":
      if (hasQuestFlag(player, "great-starvation")) return "The food ledger finally stopped bleeding. Miners eat, then they swing. I will shout about everything else.";
      return `Great Starvation: banked Ash Logs ${Math.min(5, bankQty(player, "ash-logs"))}/5. Cold miners miss swings; empty stores break crews.`;
    case "geologist-mira":
      if (hasQuestFlag(player, "luminous-depths")) return "These prism shards answer when the rock groans. The fissure can be braced now.";
      return "Luminous Depths: bring 5 Iron Ore in bag or bank. No deeper drill until the vein proves it will hold.";
    case "runner-kael":
      return player.escortNpcId === npc.id
        ? "I set the pace. Stay close; third loose stone breaks ankles."
        : "Short escorted run down the pass. Smile less than I do; I know where the bad stones are.";
    case "high-arcanist-vael":
      if (hasQuestFlag(player, "seal-the-rift")) return "Nature Core, Prism Shards, scripts: all three agree. The Rift can be sealed, which is excellent and deeply alarming.";
      if (hasInventoryItem(player, "nature-core") || hasInventoryItem(player, "prism-shards") || hasInventoryItem(player, "ancient-scripts")) {
        return "One relic helps. Three relics make a ritual I would trust near open sky. Let me catalog that again.";
      }
      return "Bring old scripts, living wood, and prism stone. Yes, the scorch marks are part of the list.";
    case "navigator-kai":
      if (player.escortNpcId === npc.id) return "Safe plank, cracked plank, gull mess. I do not repeat warnings; listen once.";
      if (hasQuestFlag(player, "fast-travel-registered")) return "Your route is in the tide book. Marrow's line is ugly, but it will float.";
      return "I can walk you through the dock lanes. Bring Marrow's registration for anything beyond the quay.";
    case "alchemist-zora":
      if (hasInventoryItem(player, "void-resistant-cloak")) return "Hold still. The cloak seam is chewing light again. Better it bites thread than you.";
      return `Void Resistance: Silk ${Math.min(3, itemQty(player, "silk-thread"))}/3 and Gold ${Math.min(20, player.gold)}/20. Sleepy is free; alchemy is not.`;
    case "foreman-iron-will":
      if (ready(player, "heavy-lifting")) return "Banked ore on the ledger. Good. Take the mining boots and stop proving you enjoy blisters.";
      return hasGearOrItem(player, "pickaxe") ? `Heavy Lifting: banked Iron Ore ${Math.min(50, bankQty(player, "iron-ore"))}/50. Deposit ore; do not wave it at me.` : "Pickaxe costs 12 gold. Buy it, swing it, bank what comes loose.";
    case "banker-valerius":
      return `Storage holds ${bankQty(player, "ash-logs")} logs and ${bankQty(player, "iron-ore")} ore. Loose risk becomes recorded risk. Much cleaner.`;
    case "merchant-kaya":
      return player.gold >= 10 ? "Berries, ale, clean count. Your purse can survive one smart purchase." : "I can sell you a smile today. Bring 10 gold for the useful bundle.";
    case "apprentice-jinn":
      return player.gold >= 6 ? "I packed the best berries. Buy early, walk home upright." : "The berries are excellent. Your purse is less excellent.";
    case "master-kael":
      return hasQuestFlag(player, "silent-sands") ? "Bazaar fear did not move you. Bring 35 gold if you want Q to move threats instead." : `Silent Sands: ${Math.min(120, Math.floor(player.bazaarSurvivalMs / 1000))}/120s survived. Fear is useful after it fails to steer you.`;
    case "captain-marrow":
      if (!hasQuestFlag(player, "lost-compass")) return "First route marked. Take the captain's map, and ask before any long haul.";
      if (hasQuestFlag(player, "final-cut") && !hasQuestFlag(player, "fast-travel-registered")) return "Rowan's pledge is good ink. Ashwood goes on the slate because you made the road quieter.";
      return "Wind is fair, gear is questionable. Long routes need confirmation; impatience loses passengers.";
    case "contract-board": {
      const contract = contractInfo(player.contractId);
      if (player.contractCooldownMs > 0) return `Writ desk cooling down: ${Math.ceil(player.contractCooldownMs / 1000)}s. Repeat work still needs witnesses.`;
      if (player.contractKills >= contract.targetKills) return `${contract.name} complete. Renown paid; next writ posted.`;
      return `${contract.name}: ${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills} in ${contract.area}. Sign, hunt, return.`;
    }
    case "blacksmith":
      return "Crafting: chest needs 8 ore + 25 gold; focus ring needs 3 silk + 35 gold. Materials first, intention after.";
    case "cursed-statue":
      return hasInventoryItem(player, "cursed-idol") ? "Paid, marked, breathing. Irritating." : "20 HP. 15 gold. Pain records contracts better than ink.";
    case "innkeeper-martha":
      return `Home set to ${labelize(player.zoneId)}. A known bed beats a dramatic last stand.`;
    default:
      return profile?.fallback ?? `${labelize(npc.kind)} has no posted work for you yet.`;
  }
}

export function updateDialogState(state: MmoSkillDemoState, player: PlayerEntity | undefined, timeMs: number, currentInteractable?: InteractableTarget, current?: DialogState): DialogState | undefined {
  if (!player) return current && timeMs <= current.untilMs ? current : undefined;
  const target = player.targetId ? state.npcs?.[player.targetId] : undefined;
  const talking = target && isSupportNpc(target) && (player.action === "interact" || player.action === "travel" || player.action === "bank" || player.action === "trade");
  if (target && talking) {
    return { npcId: target.id, title: labelize(target.kind), body: dialogTextForNpc(target, player), untilMs: timeMs + 2600 };
  }
  if (player.action === "interact" && currentInteractable?.type === "landmark") {
    const info = landmarkInteractionInfo(currentInteractable.id);
    if (info) return { npcId: currentInteractable.id, title: info.title, body: info.body, untilMs: timeMs + 3200 };
  }
  return current && timeMs <= current.untilMs ? current : undefined;
}

export function debugStatusText(state: MmoSkillDemoState, debug: Record<string, unknown>) {
  if (!debug.connected) return "";
  return `player ${String(debug.playerId ?? "joining")} snapshots ${String(debug.receivedSnapshots)} deltas ${String(debug.receivedDeltas)} tick ${state.tick ?? 0} interp ${String(debug.interpMode ?? "hold")} ${String(debug.interpDelayMs ?? 0)}ms/${String(debug.interpBufferedFrames ?? 0)}`;
}

function hotbarName(player: PlayerEntity | undefined, slot: CombatSlot) {
  const abilityId = selectedAbilityForSlot(player, slot);
  return playerAbilityMetadata[abilityId]?.name ?? slot;
}

function fullHotbarReveal() {
  if (typeof globalThis.location === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).get("novice") === "0";
}

function fieldSlotReveal(player: PlayerEntity | undefined, slot: CombatSlot) {
  if (!player) return { unlocked: true, status: "Ready", hint: "" };
  const fullReveal = fullHotbarReveal();
  switch (slot) {
    case "LMB":
      return { unlocked: true, status: "Cut", hint: "Cut glowing Ash tree now." };
    case "RMB":
      return hasQuestFlag(player, "first-cut")
        ? { unlocked: true, status: "First Cut", hint: "First Cut proof" }
        : { unlocked: false, status: "First Cut", hint: "Bring Rowan 5 Ash Logs." };
    case "Space":
      if (hasQuestFlag(player, "wolf-culling")) {
        return { unlocked: true, status: "Road", hint: "Wolf Culling proof" };
      }
      return hasQuestFlag(player, "first-cut") || fullReveal
        ? { unlocked: false, status: "Wolf Road", hint: "Secure the Ashwood road for Rowan." }
        : { unlocked: false, status: "First Cut", hint: "Finish First Cut before movement lessons." };
    case "Q":
      if (hasQuestFlag(player, "silent-sands")) {
        return { unlocked: true, status: "Kael", hint: "Silent Sands proof" };
      }
      return hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || player.zoneId === "bazaar" || fullReveal
        ? { unlocked: false, status: "Sands", hint: "Survive Master Kael's Bazaar trial." }
        : { unlocked: false, status: "Later", hint: "Ironcrag work points to this lesson later." };
    case "E":
      return hasQuestFlag(player, "root-of-the-problem") || player.dungeonBossKills > 0
        ? { unlocked: true, status: "Relic", hint: "Dungeon relic proof" }
        : hasQuestFlag(player, "silent-sands") || fullReveal
          ? { unlocked: false, status: "Relic", hint: "Return with a dungeon relic." }
          : { unlocked: false, status: "Later", hint: "Dungeon relic work stays hidden until route proof makes it useful." };
    case "R":
      return player.masteryRank >= 2 || hasQuestFlag(player, "breaking-golem") || hasQuestFlag(player, "kings-foil")
        ? { unlocked: true, status: "Mastery", hint: "Renown proof" }
        : player.renown > 0 || fullReveal
          ? { unlocked: false, status: "Mastery", hint: "Earn renown from quests and contracts." }
          : { unlocked: false, status: "Later", hint: "Mastery channels wait until local proof starts earning renown." };
  }
}

function containsPoint(rect: { x: number; y: number; width: number; height: number }, point: ScreenPoint | undefined) {
  return Boolean(point && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const HUD_PANEL_FILL = "rgba(8, 12, 11, 0.84)";
const HUD_PANEL_FILL_DENSE = "rgba(6, 9, 9, 0.92)";
const HUD_PANEL_EDGE = "rgba(244, 211, 107, 0.46)";
const HUD_PANEL_EDGE_SOFT = "rgba(156, 178, 142, 0.34)";
const HUD_TEXT = "#f5f3e8";
const HUD_MUTED = "#bfc8ad";
const HUD_GOLD = "#f4d36b";
const HUD_HP = "#d85f55";
const HUD_MANA = "#6ba6ff";
const HUD_ENERGY = "#78d6b4";
const HUD_SHADOW = "rgba(0,0,0,0.55)";

function pushRect(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, width: number, height: number) {
  const call = renderRecord(pool, "rect");
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  calls.push(call as Renderable);
  return call;
}

function pushLine(calls: Renderable[], pool: RenderFramePool | undefined, x1: number, y1: number, x2: number, y2: number) {
  const call = renderRecord(pool, "line");
  call.x1 = x1;
  call.y1 = y1;
  call.x2 = x2;
  call.y2 = y2;
  calls.push(call as Renderable);
  return call;
}

function pushText(calls: Renderable[], pool: RenderFramePool | undefined, text: string, x: number, y: number, font: string) {
  const call = renderRecord(pool, "text");
  call.text = text;
  call.x = x;
  call.y = y;
  call.font = font;
  calls.push(call as Renderable);
  return call;
}

function appendPanel(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, width: number, height: number, fill = HUD_PANEL_FILL, stroke = HUD_PANEL_EDGE_SOFT) {
  const panel = pushRect(calls, pool, x, y, width, height);
  panel.fill = fill;
  panel.stroke = stroke;
  panel.lineWidth = 1;
  panel.shadowColor = HUD_SHADOW;
  panel.shadowBlur = 10;
  return panel;
}

function appendDivider(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, width: number) {
  const line = pushLine(calls, pool, x, y, x + width, y);
  line.stroke = "rgba(244, 211, 107, 0.24)";
  line.lineWidth = 1;
}

function pushTextBlock(calls: Renderable[], pool: RenderFramePool | undefined, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number, font: string) {
  const call = renderRecord(pool, "text-block");
  call.text = text;
  call.x = x;
  call.y = y;
  call.maxWidth = maxWidth;
  call.lineHeight = lineHeight;
  call.maxLines = maxLines;
  call.font = font;
  calls.push(call as Renderable);
  return call;
}

function pushBar(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, width: number, height: number, value: number, max: number) {
  const call = renderRecord(pool, "bar");
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  call.value = value;
  call.max = max;
  calls.push(call as Renderable);
  return call;
}

function appendStatBar(
  calls: Renderable[],
  pool: RenderFramePool | undefined,
  label: string,
  value: number,
  max: number,
  x: number,
  y: number,
  width: number,
  fill: string
) {
  const name = pushText(calls, pool, label, x, y + 9, "800 9px system-ui");
  name.fill = HUD_MUTED;
  const bar = pushBar(calls, pool, x + 34, y, width - 34, 8, value, max);
  bar.background = "rgba(0,0,0,0.58)";
  bar.fill = fill;
  const valueText = pushText(calls, pool, `${Math.ceil(value)}/${Math.ceil(max)}`, x + width - 4, y + 8, "800 9px system-ui");
  valueText.align = "right";
  valueText.fill = HUD_TEXT;
}

function appendPlayerFrameCalls(state: MmoSkillDemoState, player: PlayerEntity | undefined, width: number, calls: Renderable[], pool?: RenderFramePool) {
  const compact = width < 760;
  const frameX = 12;
  const frameY = 10;
  const frameW = Math.min(compact ? width - 24 : 292, 292);
  const frameH = player ? 66 : 48;
  appendPanel(calls, pool, frameX, frameY, frameW, frameH, HUD_PANEL_FILL_DENSE, HUD_PANEL_EDGE);
  if (!player) {
    const title = pushText(calls, pool, state.roomLabel || "MMO Skill Demo", frameX + 12, frameY + 19, "800 13px system-ui");
    title.fill = HUD_TEXT;
    const joining = pushText(calls, pool, "Joining authoritative zone...", frameX + 12, frameY + 38, "11px system-ui");
    joining.fill = HUD_MUTED;
    return { x: frameX, y: frameY, width: frameW, height: frameH };
  }

  const crest = pushRect(calls, pool, frameX + 10, frameY + 10, 38, 38);
  crest.fill = "rgba(244, 211, 107, 0.15)";
  crest.stroke = "rgba(244, 211, 107, 0.66)";
  const initial = pushText(calls, pool, (player.name || "A").slice(0, 1).toUpperCase(), frameX + 29, frameY + 34, "900 22px Georgia, serif");
  initial.align = "center";
  initial.fill = HUD_GOLD;
  initial.stroke = "rgba(0,0,0,0.62)";
  initial.lineWidth = 2;

  const name = pushText(calls, pool, player.name || "Adventurer", frameX + 58, frameY + 17, "900 13px system-ui");
  name.fill = HUD_TEXT;
  name.maxWidth = frameW - 152;
  const rank = pushText(calls, pool, `MR ${player.masteryRank}  C${player.combatLevel} M${player.miningLevel} W${player.woodcuttingLevel}`, frameX + frameW - 12, frameY + 17, "800 10px system-ui");
  rank.align = "right";
  rank.fill = HUD_MUTED;
  rank.maxWidth = 104;

  appendStatBar(calls, pool, "HP", player.hp, player.maxHp, frameX + 58, frameY + 26, frameW - 70, HUD_HP);
  appendStatBar(calls, pool, "MP", player.mana, player.maxMana, frameX + 58, frameY + 42, frameW - 70, HUD_MANA);

  if (player.guardMs > 0 || player.berserkMs > 0) {
    const statusText = player.berserkMs > 0 ? "Berserk" : "Guard";
    const status = pushText(calls, pool, statusText, frameX + 16, frameY + 60, "800 9px system-ui");
    status.fill = player.berserkMs > 0 ? "#ffb36b" : "#9bd6ff";
  }

  return { x: frameX, y: frameY, width: frameW, height: frameH };
}

function appendChip(calls: Renderable[], pool: RenderFramePool | undefined, text: string, x: number, y: number, width: number, tone: "gold" | "blue" | "green" | "neutral") {
  const fill =
    tone === "gold" ? "rgba(92, 73, 28, 0.42)" :
    tone === "blue" ? "rgba(24, 57, 84, 0.42)" :
    tone === "green" ? "rgba(36, 74, 51, 0.42)" :
    "rgba(16, 21, 18, 0.70)";
  const stroke =
    tone === "gold" ? "rgba(244, 211, 107, 0.42)" :
    tone === "blue" ? "rgba(107, 166, 255, 0.38)" :
    tone === "green" ? "rgba(120, 214, 180, 0.38)" :
    HUD_PANEL_EDGE_SOFT;
  const chip = pushRect(calls, pool, x, y, width, 24);
  chip.fill = fill;
  chip.stroke = stroke;
  const label = pushText(calls, pool, text, x + width * 0.5, y + 16, "800 11px system-ui");
  label.align = "center";
  label.fill = tone === "gold" ? HUD_GOLD : HUD_TEXT;
  label.maxWidth = width - 12;
}

function appendTopObjectiveCalls(state: MmoSkillDemoState, player: PlayerEntity, width: number, playerFrame: { x: number; y: number; width: number; height: number }, calls: Renderable[], pool?: RenderFramePool) {
  const compact = width < 760;
  const centerW = compact ? Math.max(220, width - 24) : Math.min(520, Math.max(320, width - playerFrame.width - 56));
  const chipX = compact ? 12 : clamp(width * 0.5 - centerW * 0.5, playerFrame.x + playerFrame.width + 14, width - centerW - 12);
  const chipY = compact ? playerFrame.y + playerFrame.height + 8 : 12;
  const gap = 6;
  const onlineW = compact ? Math.max(54, centerW * 0.24) : Math.max(78, centerW * 0.18);
  const zoneW = compact ? Math.max(68, centerW * 0.28) : Math.max(92, centerW * 0.27);
  const currencyW = Math.max(64, centerW - zoneW - onlineW - gap * 2);
  appendChip(calls, pool, state.roomLabel || labelize(player.zoneId), chipX, chipY, zoneW, "blue");
  appendChip(calls, pool, `Gold ${player.gold}  Renown ${player.renown}`, chipX + zoneW + gap, chipY, currencyW, "gold");
  appendChip(calls, pool, `Online ${state.activePlayers}`, chipX + zoneW + currencyW + gap * 2, chipY, onlineW, "green");
  const objectiveW = centerW;
  const objectiveY = chipY + 30;
  appendPanel(calls, pool, chipX, objectiveY, objectiveW, 28, "rgba(8, 12, 11, 0.68)", "rgba(244, 211, 107, 0.30)");
  const objective = pushText(calls, pool, nextGoalText(player), chipX + 12, objectiveY + 18, "800 11px system-ui");
  objective.fill = HUD_TEXT;
  objective.maxWidth = objectiveW - 24;
}

function appendTooltipCalls(tooltip: AbilityTooltip, anchor: { x: number; y: number }, width: number, height: number, calls: Renderable[], pool?: RenderFramePool) {
  const boxWidth = Math.min(312, width - 24);
  const detailCount = Math.min(3, tooltip.details.length);
  const boxHeight = 62 + detailCount * 12;
  const x = clamp(anchor.x - boxWidth * 0.5, 12, Math.max(12, width - boxWidth - 12));
  const y = clamp(anchor.y - boxHeight - 10, 68, Math.max(68, height - boxHeight - 78));
  appendPanel(calls, pool, x, y, boxWidth, boxHeight, "rgba(6, 9, 9, 0.94)", "rgba(244, 211, 107, 0.68)");
  const header = pushText(calls, pool, tooltip.header, x + 12, y + 18, "900 12px system-ui");
  header.fill = HUD_GOLD;
  header.maxWidth = boxWidth - 24;
  const description = pushTextBlock(calls, pool, tooltip.description, x + 12, y + 32, boxWidth - 24, 13, 2, "10px system-ui");
  description.fill = HUD_TEXT;
  for (let i = 0; i < detailCount; i += 1) {
    const detail = pushText(calls, pool, tooltip.details[i] ?? "", x + 12, y + 58 + i * 12, "9px system-ui");
    detail.fill = HUD_MUTED;
    detail.maxWidth = boxWidth - 24;
  }
}

function appendCombatBarCalls(state: MmoSkillDemoState, player: PlayerEntity | undefined, width: number, height: number, currentInteractable: InteractableTarget | undefined, pointer: ScreenPoint | undefined, inputDevice: string | undefined, calls: Renderable[], pool?: RenderFramePool) {
  const gap = width < 700 ? 6 : 8;
  const slotWidth = width < 700 ? Math.max(46, Math.min(54, (width - 56 - gap * (COMBAT_SLOTS.length - 1)) / COMBAT_SLOTS.length)) : 60;
  const slotHeight = 46;
  const totalWidth = COMBAT_SLOTS.length * slotWidth + (COMBAT_SLOTS.length - 1) * gap;
  const start = width * 0.5 - totalWidth * 0.5;
  const panelY = height - 88;
  const y = panelY + 30;
  appendPanel(calls, pool, start - 12, panelY, totalWidth + 24, 76, "rgba(7, 10, 10, 0.82)", "rgba(244, 211, 107, 0.36)");
  if (player) {
    const energy = energyValue(player);
    const max = energyMax(player);
    const energyLabel = pushText(calls, pool, "Energy", start, panelY + 18, "900 10px system-ui");
    energyLabel.fill = energyReady(player) ? HUD_GOLD : HUD_ENERGY;
    const energyText = pushText(calls, pool, `${Math.floor(energy)}/${Math.floor(max)}`, start + totalWidth, panelY + 18, "900 10px system-ui");
    energyText.align = "right";
    energyText.fill = HUD_TEXT;
    const energyBar = pushBar(calls, pool, start + 50, panelY + 9, Math.max(24, totalWidth - 92), 8, energy, max);
    energyBar.background = "rgba(0,0,0,0.58)";
    energyBar.fill = energyReady(player) ? HUD_GOLD : HUD_ENERGY;
  }

  let hoveredTooltip: { tooltip: AbilityTooltip; x: number; y: number } | undefined;
  for (let i = 0; i < COMBAT_SLOTS.length; i += 1) {
    const x = start + i * (slotWidth + gap);
    const label = COMBAT_SLOTS[i];
    const reveal = fieldSlotReveal(player, label);
    const unlocked = slotUnlocked(player, label, (slot) => player ? hasSlot(player, slot) : true) && reveal.unlocked;
    const cooldownMs = slotCooldownMs(player, label);
    const cooldownText = unlocked && cooldownMs > 0 ? `${Math.ceil(cooldownMs / 1000)}s` : "";
    const rBlocked = label === "R" && player && !energyReady(player);
    const active = player?.action.toLowerCase() === label.toLowerCase();
    const fill = unlocked && !rBlocked ? "rgba(14, 19, 16, 0.94)" : "rgba(9, 12, 11, 0.58)";
    const stroke = active ? HUD_GOLD : rBlocked ? "rgba(105, 108, 101, 0.72)" : "rgba(137, 162, 128, 0.50)";
    const slotBox = pushRect(calls, pool, x, y, slotWidth, slotHeight);
    slotBox.fill = fill;
    slotBox.stroke = stroke;
    slotBox.lineWidth = active ? 2 : 1;
    if (cooldownMs > 0) {
      const overlayHeight = Math.max(4, Math.min(slotHeight, (cooldownMs / 3000) * slotHeight));
      const overlay = pushRect(calls, pool, x, y + slotHeight - overlayHeight, slotWidth, overlayHeight);
      overlay.fill = "rgba(0, 0, 0, 0.44)";
    }
    const labelCall = pushText(calls, pool, label, x + slotWidth * 0.5, y + 15, "900 12px system-ui");
    labelCall.align = "center";
    labelCall.fill = unlocked && !rBlocked ? HUD_GOLD : "#8b9085";
    const name = pushText(calls, pool, cooldownText || (unlocked ? hotbarName(player, label) : reveal.status), x + slotWidth * 0.5, y + 34, width < 700 ? "8px system-ui" : "9px system-ui");
    name.align = "center";
    name.fill = unlocked && !rBlocked ? HUD_TEXT : "#919789";
    name.maxWidth = slotWidth - 6;
    if (player && containsPoint({ x, y, width: slotWidth, height: slotHeight }, pointer)) {
      hoveredTooltip = {
        tooltip: unlocked
          ? abilityTooltip(player, label, selectedAbilityForSlot(player, label), false)
          : { header: `${label} ${reveal.status}`, description: reveal.hint, details: [nextGoalText(player)] },
        x: x + slotWidth * 0.5,
        y
      };
    }
  }

  const promptW = Math.min(280, Math.max(190, width - 36));
  const promptX = clamp(width * 0.5 - promptW * 0.5, 18, Math.max(18, width - promptW - 18));
  const promptY = panelY - 30;
  appendPanel(calls, pool, promptX, promptY, promptW, 24, "rgba(7, 10, 10, 0.72)", "rgba(120, 214, 180, 0.30)");
  const interactPrompt = inputDevice === "controller" ? "[L1] Interact" : "[Z] Interact";
  const interactTitle = pushText(calls, pool, interactPrompt, promptX + 10, promptY + 16, "800 10px system-ui");
  interactTitle.fill = HUD_ENERGY;
  const interact = pushText(calls, pool, interactionLabel(state, player, currentInteractable), promptX + promptW - 10, promptY + 16, "10px system-ui");
  interact.align = "right";
  interact.fill = HUD_TEXT;
  interact.maxWidth = promptW - (inputDevice === "controller" ? 116 : 104);
  if (hoveredTooltip) appendTooltipCalls(hoveredTooltip.tooltip, hoveredTooltip, width, height, calls, pool);
}

function appendQuestPanelCalls(state: MmoSkillDemoState, player: PlayerEntity | undefined, width: number, calls: Renderable[], pool: RenderFramePool | undefined, minimapOpen: boolean) {
  if (!player) return;
  const w = Math.min(width - 24, width < 700 ? 252 : 292);
  const x = Math.max(12, width - w - 12);
  const y = minimapOpen ? (width < 700 ? 248 : 250) : width < 700 ? 146 : 90;
  const showReturn = !hasQuestFlag(player, "heavy-lifting");
  const h = showReturn ? 136 : 108;
  appendPanel(calls, pool, x, y, w, h, "rgba(7, 10, 10, 0.74)", "rgba(244, 211, 107, 0.36)");
  const title = pushText(calls, pool, "QUESTS", x + 10, y + 16, "900 10px system-ui");
  title.fill = HUD_GOLD;
  const event = pushText(calls, pool, eventProgressLine(state), x + w - 10, y + 16, "800 10px system-ui");
  event.align = "right";
  event.fill = HUD_MUTED;
  event.maxWidth = w - 76;
  appendDivider(calls, pool, x + 10, y + 24, w - 20);
  const daily = pushText(calls, pool, "Daily", x + 10, y + 42, "800 10px system-ui");
  daily.fill = HUD_ENERGY;
  const dailyLine = pushTextBlock(calls, pool, dailyQuestHudText(player), x + 52, y + 32, w - 62, 13, 2, "700 11px system-ui");
  dailyLine.fill = HUD_TEXT;
  const next = pushText(calls, pool, "Next", x + 10, y + 72, "800 10px system-ui");
  next.fill = HUD_GOLD;
  const goal = pushTextBlock(calls, pool, nextGoalText(player), x + 52, y + 62, w - 62, 13, 2, "700 11px system-ui");
  goal.fill = HUD_TEXT;
  if (showReturn) {
    const ret = pushText(calls, pool, "Return", x + 10, y + 100, "800 10px system-ui");
    ret.fill = HUD_ENERGY;
    const retLine = pushTextBlock(calls, pool, earlyLoopReturnBriefing(state, player), x + 52, y + 90, w - 62, 12, 2, "700 10px system-ui");
    retLine.fill = HUD_TEXT;
  }
  const progress = pushBar(calls, pool, x + 10, y + h - 12, w - 20, 4, state.worldEventProgress, Math.max(1, state.worldEventGoal));
  progress.background = "rgba(0,0,0,0.5)";
  progress.fill = HUD_GOLD;
}

function appendDialogCalls(dialog: DialogState | undefined, timeMs: number, width: number, height: number, calls: Renderable[], pool?: RenderFramePool) {
  if (!dialog || timeMs > dialog.untilMs) return;
  const w = Math.min(388, width - 36);
  const h = 102;
  const x = width < 700 ? Math.max(18, width * 0.5 - w * 0.5) : 18;
  const y = Math.max(96, height - 210);
  appendPanel(calls, pool, x, y, w, h, "rgba(7, 10, 10, 0.90)", "rgba(245, 243, 232, 0.62)");
  const title = pushText(calls, pool, dialog.title, x + 12, y + 20, "900 13px system-ui");
  title.fill = HUD_TEXT;
  const body = pushTextBlock(calls, pool, dialog.body, x + 12, y + 40, w - 24, 14, 4, "11px system-ui");
  body.fill = "#dfe6ca";
}

export function createHudRenderCalls(
  state: MmoSkillDemoState,
  player: PlayerEntity | undefined,
  debug: Record<string, unknown>,
  width: number,
  height: number,
  timeMs: number,
  dialog: DialogState | undefined,
  currentInteractable?: InteractableTarget,
  pointer?: ScreenPoint,
  calls: Renderable[] = [],
  pool?: RenderFramePool
): Renderable[] {
  const topHeight = width < 760 ? 144 : 84;
  const top = pushRect(calls, pool, 0, 0, width, topHeight);
  top.fill = "rgba(6, 9, 9, 0.36)";
  const playerFrame = appendPlayerFrameCalls(state, player, width, calls, pool);
  if (player) {
    const contract = contractInfo(player.contractId);
    appendTopObjectiveCalls(state, player, width, playerFrame, calls, pool);
    if (width >= 920) {
      const contractText = pushText(calls, pool, `${contract.name} ${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills}`, width - 16, 24, "800 11px system-ui");
      contractText.align = "right";
      contractText.fill = HUD_TEXT;
      contractText.maxWidth = Math.max(100, width - (playerFrame.x + playerFrame.width) - 560);
    }
  }
  appendCombatBarCalls(state, player, width, height, currentInteractable, pointer, typeof debug.inputDevice === "string" ? debug.inputDevice : "keyboard", calls, pool);
  appendQuestPanelCalls(state, player, width, calls, pool, Boolean(debug.minimapOpen) && !debug.worldMapOpen);
  appendDialogCalls(dialog, timeMs, width, height, calls, pool);
  if (debug.connected === false) {
    const disconnected = pushText(calls, pool, "Disconnected", width - 18, 22, "700 12px system-ui");
    disconnected.align = "right";
    disconnected.fill = "#ff8b7a";
  }
  return calls;
}
