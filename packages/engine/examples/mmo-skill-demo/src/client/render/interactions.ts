import { hasQuestFlag } from "../../shared-loadout.ts";
import { type MmoSkillDemoState, type PlayerEntity } from "../../shared-contracts.ts";
import { getMmoSkillDemoAnchorTile } from "../../data/world.ts";
import { worldLandmarkId, worldLandmarkPlacements } from "../../data/world-landmarks.ts";
import { getGatherableMaterialById } from "../../shared/materials.ts";
import { TILE } from "../world.ts";
import { isSupportNpc } from "./npcs.ts";
import { labelize, type InteractableTarget } from "./types.ts";

export function landmarkInteractionInfo(id: string) {
  for (const landmark of worldLandmarkPlacements) {
    if (worldLandmarkId(landmark) !== id) continue;
    const service = landmark.service ?? labelize(landmark.kind ?? "landmark");
    const kind = landmark.kind ?? "civic";
    const title = labelize(service);
    const body = landmarkDialogText(landmark.anchorId, kind, service, landmark.glyph);
    return { title, body, service, kind };
  }
  return undefined;
}

function landmarkDialogText(anchorId: string, kind: string, service: string, glyph: string | undefined) {
  const place = labelize(anchorId);
  const mark = glyph ? ` Painted mark: ${glyph}.` : "";
  const owner = landmarkOwner(anchorId);
  if (kind === "travel") {
    if (serviceHas(service, "warning")) return signDialog(anchorId, service, owner, mark);
    if (serviceHas(service, "gate")) return `${owner} keep this ${service} oiled on the town side and scarred on the road side. Leave by the marked path, return before lamps change.${mark}`;
    if (serviceHas(service, "waymark", "marker", "sign")) return `${owner} carved this ${service} for travelers who cannot stop to read maps. Scrapes point away from ${place}; fresh cuts mark the return side.${mark}`;
    if (serviceHas(service, "hut")) return `${owner} left dry cord and route pegs inside the ${service}. It is a rest point, not a safe house.${mark}`;
    return `${owner} maintain this ${service}. It names the next road by wear: boot ruts out, dragged cargo back.${mark}`;
  }
  if (kind === "camp") return `${owner} stopped writing warnings and started leaving proof. The ${service} has fresh tracks, broken gear, and room for enemies to regroup.${mark}`;
  if (kind === "danger") {
    if (serviceHas(service, "warning", "sign", "post", "board")) return signDialog(anchorId, service, owner, mark);
    if (serviceHas(service, "fence", "wall", "barrier", "gate")) return `${owner} built this ${service} to slow bodies, not decorate borders. Cross past it and town rules stop helping.${mark}`;
    return `${service} carries gouges, ash, or bent stakes. Someone paid to make the danger visible before it reaches ${place}.${mark}`;
  }
  if (kind === "trade") return `${owner} count goods at this ${service}. Empty crates sit on the road side; sealed bundles face the town ledger.${mark}`;
  if (kind === "craft") return `${service} smells of heat, resin, or oil. Local workers use it when raw material needs a faction stamp before it becomes gear.${mark}`;
  if (kind === "resource") {
    if (serviceHas(service, "well", "water")) return `Rope burns and chipped buckets ring this ${service}. Drink, fill, or read where travelers stop before leaving ${place}.${mark}`;
    if (serviceHas(service, "sample", "gatherable", "forage", "pocket")) return `Cut marks around the ${service} show what can be taken without stripping the ground bare.${mark}`;
    return `${service} has old tool marks and fresh foot scuffs. It is useful material, not scenery.${mark}`;
  }
  if (kind === "shrine") return `${owner} keep the ${service} swept clean. Offerings here say what this faction fears losing.${mark}`;
  if (kind === "archive") {
    if (serviceHas(service, "board", "notice", "code", "quota", "debt")) return `${owner} posted this ${service} where travelers cannot miss it. The names are old; the penalties are not.${mark}`;
    return `${service} stores claims, routes, or law marks. Read it before arguing with anyone paid to enforce it.${mark}`;
  }
  if (kind === "wild") return `${service} shows where living territory pushes back: claw marks, bent growth, and paths animals use before people notice.${mark}`;
  if (kind === "dock") return `${service} creaks with tide work. Wet boards point to loading routes; dry boards mean someone already paid for shelter.${mark}`;
  return `${owner} built this ${service} to make control visible from the road. It tells you whose rules start in ${place}.${mark}`;
}

function serviceHas(service: string, ...terms: string[]) {
  const lower = service.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function landmarkOwner(anchorId: string) {
  if (anchorId === "oakhaven" || anchorId === "overgrown-thicket") return "Oakhaven scouts";
  if (anchorId === "ashwood-glade") return "Outcast hunters";
  if (anchorId === "ironcrag" || anchorId === "deep-fissure") return "Guild foremen";
  if (anchorId === "aetheria") return "Aetherian clerks";
  if (anchorId === "port-marrow") return "dock hands";
  if (anchorId === "sunken-bazaar" || anchorId === "sunken-spire") return "Bazaar clerks";
  if (anchorId === "void-rift" || anchorId === "obsidian-sanctum") return "rift crews";
  if (anchorId === "high-reach-peaks") return "High-Reach novices";
  return "locals";
}

function signDialog(anchorId: string, service: string, owner: string, mark: string) {
  if (anchorId === "void-rift" || anchorId === "obsidian-sanctum") {
    return `${owner} scratched the ${service} deep: tie a rope before violet dust, count breaths, turn back when lamps bend inward.${mark}`;
  }
  if (serviceHas(service, "wolf", "safe-road")) return `Moss covers half the ${service}: patrol ends here, wolves answer next, return by root marks before dark.${mark}`;
  if (serviceHas(service, "quota")) return `Guild ink on the ${service}: no cart enters without counted ore; broken axles dock wages.${mark}`;
  if (serviceHas(service, "code")) return `Clean script on the ${service}: contraband kneels, pilgrims queue, silence counts as consent to inspection.${mark}`;
  if (serviceHas(service, "debt")) return `Bazaar ink on the ${service}: debts travel faster than feet; settle before crossing the scale line.${mark}`;
  return `${owner} posted this ${service} where haste gets expensive. The message is short because the danger is close.${mark}`;
}

export function chooseInteractable(state: MmoSkillDemoState, player: PlayerEntity | undefined, currentInteractable?: InteractableTarget): InteractableTarget | undefined {
  if (!player) return undefined;
  let bestId = "";
  let bestType: InteractableTarget["type"] = "loot";
  let bestDistance = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let pinnedId = "";
  let pinnedType: InteractableTarget["type"] = "loot";
  let pinnedDistance = 0;
  let pinnedScore = Number.POSITIVE_INFINITY;

  function consider(id: string, type: InteractableTarget["type"], distance: number, score: number) {
    if (score < bestScore) {
      bestId = id;
      bestType = type;
      bestDistance = distance;
      bestScore = score;
    }
    if (currentInteractable?.id === id && currentInteractable.type === type) {
      pinnedId = id;
      pinnedType = type;
      pinnedDistance = distance;
      pinnedScore = score;
    }
  }

  for (const id of Object.keys(state.loots ?? {})) {
    const loot = state.loots[id];
    if (loot.zoneId !== player.zoneId || (loot.ownerId && loot.ownerId !== player.id)) continue;
    const distance = Math.hypot(loot.x - player.x, loot.y - player.y);
    if (distance <= 96) consider(loot.id, "loot", distance, distance - 16 + (loot.id === player.targetId ? -28 : 0));
  }
  for (const id of Object.keys(state.npcs ?? {})) {
    const npc = state.npcs[id];
    if (npc.hp <= 0 || !isSupportNpc(npc)) continue;
    const distance = Math.hypot(npc.x - player.x, npc.y - player.y);
    if (distance <= 96) consider(npc.id, "npc", distance, distance - 8 + (npc.id === player.targetId ? -28 : 0));
  }
  for (const id of Object.keys(state.resources ?? {})) {
    const node = state.resources[id];
    if (node.depleted || node.zoneId !== player.zoneId) continue;
    const distance = Math.hypot(node.x - player.x, node.y - player.y);
    if (distance <= 86) consider(node.id, "resource", distance, distance + (node.id === player.targetId ? -28 : 0));
  }
  for (const landmark of worldLandmarkPlacements) {
    const tile = getMmoSkillDemoAnchorTile(landmark.anchorId);
    const centerX = tile.x * TILE + landmark.dx + landmark.width * 0.5;
    const centerY = tile.y * TILE + landmark.dy + landmark.height * 0.5;
    const distance = Math.hypot(centerX - player.x, centerY - player.y);
    const reach = Math.max(84, Math.min(132, Math.max(landmark.width, landmark.height) * 0.7));
    if (distance <= reach) {
      const id = worldLandmarkId(landmark);
      consider(id, "landmark", distance, distance + 10 + (id === player.targetId ? -28 : 0));
    }
  }
  if (!bestId) return undefined;
  const usePinned = Boolean(pinnedId) && pinnedScore <= bestScore + 16;
  return {
    id: usePinned ? pinnedId : bestId,
    type: usePinned ? pinnedType : bestType,
    distance: usePinned ? pinnedDistance : bestDistance,
    score: usePinned ? pinnedScore : bestScore
  };
}

export function interactionLabel(state: MmoSkillDemoState, player: PlayerEntity | undefined, currentInteractable?: InteractableTarget) {
  if (!player || !currentInteractable) return "Z no target";
  if (currentInteractable.type === "loot") {
    const loot = state.loots?.[currentInteractable.id];
    if (!loot) return "Z no target";
    return `Z pick up ${loot.amount > 1 ? `${loot.amount} ` : ""}${labelize(loot.itemId)}`;
  }
  if (currentInteractable.type === "resource") {
    const node = state.resources?.[currentInteractable.id];
    if (!node) return "Z no target";
    const material = node.materialId ? getGatherableMaterialById(node.materialId) : undefined;
    const label = material?.name ?? (node.kind === "ore" ? "Copper Dust" : node.kind === "tree" ? "Pine Wood" : labelize(node.skillId ?? node.kind));
    const skillId = node.skillId ?? (node.kind === "ore" ? "mining" : node.kind === "tree" ? "lumberjacking" : node.kind);
    const verb = skillId === "mining" ? "mine" : skillId === "lumberjacking" ? "cut" : skillId === "fishing" ? "fish" : "gather";
    if (!hasQuestFlag(player, "first-cut") && node.kind === "tree") return "Z cut Ash tree; counts First Cut proof";
    return `Z ${verb} ${label}`;
  }
  if (currentInteractable.type === "landmark") {
    const info = landmarkInteractionInfo(currentInteractable.id);
    return info ? `Z inspect ${info.title}` : "Z inspect landmark";
  }
  const npc = state.npcs?.[currentInteractable.id];
  if (!npc) return "Z no target";
  if (npc.kind === "blacksmith" || npc.kind === "blacksmith-silas") return "Z talk to Blacksmith";
  if (npc.kind === "banker-valerius") return "Z bank with Valerius";
  if (npc.kind === "merchant-kaya" || npc.kind === "apprentice-jinn") return `Z trade with ${labelize(npc.kind)}`;
  if (npc.kind === "captain-marrow") return "Z travel with Captain";
  if (npc.kind === "contract-board") return "Z check Contract Board";
  if (npc.kind === "innkeeper-martha") return "Z set home";
  return `Z talk to ${labelize(npc.kind)}`;
}
