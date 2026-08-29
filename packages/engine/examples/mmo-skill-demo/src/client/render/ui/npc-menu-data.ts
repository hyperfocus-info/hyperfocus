import { MARKET_TRADE_ITEMS, type MarketTradeItem } from "../../../shared-content-catalog.ts";
import { bankQty, hasInventoryItem, hasQuestFlag, itemQty } from "../../../shared-loadout.ts";
import { type MmoSkillDemoInput, type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "../../../shared-contracts.ts";
import { itemIcons, itemLabels, uiAssetBase } from "../../../data/assets.ts";
import { contractInfo } from "../../progression.ts";
import { dialogTextForNpc } from "../hud.ts";

export type MenuInputDevice = "keyboard" | "controller";
export type MenuMode = "closed" | "dialog" | "marketplace";
export type TopicActionKind = "rpc" | "open-market" | "close";

export type DialogTopic = {
  id: string;
  label: string;
  description: string;
  body: string;
  kind: TopicActionKind;
  input?: MmoSkillDemoInput;
  disabled?: boolean;
};

export type DialogViewModel = {
  npcId: string;
  name: string;
  subtitle: string;
  portraitSrc: string;
  accent: string;
  body: string;
  topics: DialogTopic[];
};

export type MarketRarity = "common" | "uncommon" | "rare" | "epic";
export type MarketItem = {
  itemId: string;
  name: string;
  description: string;
  rarity: MarketRarity;
  iconSrc: string;
  quantity: number;
  price: number;
  sellPrice: number;
  disabled?: boolean;
  reason?: string;
};

export type MarketplaceViewModel = {
  npcId: string;
  title: string;
  subtitle: string;
  gold: number;
  buyItems: MarketItem[];
  sellItems: MarketItem[];
};

type MarketPresentationItem = {
  rarity: MarketRarity;
  description: string;
};

const MARKET_PRESENTATION: Record<string, MarketPresentationItem> = {
  "glade-berries": { rarity: "common", description: "Quick field heal for rough roads." },
  "cinder-ale": { rarity: "common", description: "Restores mana without leaving the fight." },
  "speed-potion": { rarity: "uncommon", description: "Short burst of travel and combat speed." },
  pickaxe: { rarity: "uncommon", description: "Mining tool for Ironcrag ore work." },
  "iron-ore": { rarity: "common", description: "Heavy ore used by guild forges." },
  "ash-logs": { rarity: "common", description: "Clean Ashwood cut for quest stockpiles." },
  "silk-thread": { rarity: "rare", description: "Fine thread used by alchemists and charmers." },
  "ring-focus": { rarity: "epic", description: "Cooldown trinket for focused fighters." },
  "iron-chest": { rarity: "rare", description: "Reliable chest armor for heavy contact." },
  "void-resistant-cloak": { rarity: "epic", description: "Route prep for hostile Void weather." }
};

const BASE_SELLABLE_IDS = [
  "ash-logs",
  "iron-ore",
  "silk-thread",
  "glade-berries",
  "cinder-ale",
  "speed-potion",
  "pickaxe",
  "iron-chest",
  "ring-focus",
  "void-resistant-cloak"
] as const;

const ITEM_HIGHLIGHTS = new Set([
  "Ash Logs",
  "Iron Ore",
  "Silk Thread",
  "Pickaxe",
  "Gold",
  "Renown",
  "Glade Berries",
  "Cinder Ale",
  "Speed Potion",
  "Ring Of Focus",
  "Void Resistant Cloak",
  "Mining Boots"
]);

const PLACE_HIGHLIGHTS = new Set([
  "Ashwood",
  "Ironcrag",
  "Crags",
  "Oakhaven",
  "Port Marrow",
  "Bazaar",
  "Sunken Bazaar",
  "Void Rift",
  "Aetheria",
  "Overgrown Thicket",
  "Deep Fissure"
]);

export function labelize(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function itemLabel(id: string) {
  return itemLabels[id] ?? labelize(id);
}

export function itemIconSrc(id: string) {
  return `${uiAssetBase}${itemIcons[id] ?? itemIcons.empty}`;
}

export function highlightKindForWord(word: string) {
  const normalized = word.replace(/\s+/g, " ").trim();
  if (ITEM_HIGHLIGHTS.has(normalized)) return "item";
  if (PLACE_HIGHLIGHTS.has(normalized)) return "place";
  if (/quest|contract|proof|guild|route|danger|ready|complete/i.test(normalized)) return "quest";
  return "";
}

export function canUseMarketplace(npc: NpcEntity) {
  return npc.role === "merchant" || npc.role === "crafting" || npc.kind === "foreman-iron-will";
}

export function activeNpcFromReplicatedState(state: MmoSkillDemoState, player: PlayerEntity | undefined) {
  if (!player?.targetId) return undefined;
  if (player.action !== "interact" && player.action !== "travel" && player.action !== "bank" && player.action !== "trade") return undefined;
  const npc = state.npcs?.[player.targetId];
  if (!npc || npc.hp <= 0) return undefined;
  return npc.role === "quest" ||
    npc.role === "trainer" ||
    npc.role === "bank" ||
    npc.role === "merchant" ||
    npc.role === "travel" ||
    npc.role === "contract" ||
    npc.role === "crafting" ||
    npc.role === "home" ||
    npc.role === "hidden"
    ? npc
    : undefined;
}

export function playerCanReachNpc(player: PlayerEntity | undefined, npc: NpcEntity | undefined, maxDistance = 132) {
  if (!player || !npc || npc.hp <= 0) return false;
  return Math.hypot(npc.x - player.x, npc.y - player.y) <= maxDistance && (npc.zoneId === player.zoneId || npc.kind === "captain-marrow");
}

function npcSubtitle(npc: NpcEntity) {
  switch (npc.kind) {
    case "foreman-iron-will":
      return "Mining Guild Foreman";
    case "merchant-kaya":
      return "General Goods Trader";
    case "apprentice-jinn":
      return "Oakhaven Provisioner";
    case "alchemist-zora":
      return "Void Route Alchemist";
    case "banker-valerius":
      return "Vault Ledger Keeper";
    case "captain-marrow":
      return "Route Captain";
    case "contract-board":
      return "Public Work Writs";
    default:
      return labelize(npc.role || "local contact");
  }
}

function npcAccent(npc: NpcEntity) {
  if (npc.role === "merchant") return "#73e2ff";
  if (npc.role === "bank") return "#a6d97b";
  if (npc.kind.includes("foreman") || npc.zoneId === "crags") return "#ffb36b";
  if (npc.zoneId === "void-rift") return "#d49be7";
  return "#f4d36b";
}

function portraitForNpc(npc: NpcEntity) {
  if (npc.kind.includes("blacksmith") || npc.kind === "foreman-iron-will") return "./assets/npc-blacksmith-idle.png";
  if (npc.role === "merchant" || npc.kind === "banker-valerius") return "./assets/merchant-jeweler-idle.png";
  if (npc.role === "trainer" || npc.kind.includes("kael") || npc.kind.includes("rowan")) return "./assets/trainer-sage-idle.png";
  if (npc.kind === "captain-marrow") return "./assets/boss-warlord-idle.png";
  return "./assets/trainer-sage-idle.png";
}

function questTopicLabel(npc: NpcEntity, player: PlayerEntity) {
  if (npc.kind === "foreman-iron-will") return hasInventoryItem(player, "pickaxe") ? "Discuss Heavy Lifting" : "Ask About Pickaxe";
  if (npc.kind === "merchant-kaya") return "Ask About Market Work";
  if (npc.kind === "elder-rowan") return hasQuestFlag(player, "first-cut") ? "Ask About The Road" : "Ask About First Cut";
  if (npc.kind === "contract-board") return "Read Current Contract";
  if (npc.role === "bank") return "Review Storage";
  if (npc.role === "travel") return "Plan Route";
  return `Ask About ${labelize(player.zoneId)}`;
}

function questTopicBody(npc: NpcEntity, player: PlayerEntity, state: MmoSkillDemoState) {
  if (npc.kind === "contract-board") {
    const contract = contractInfo(player.contractId);
    return `${contract.name}: ${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills} in ${contract.area}. Reward work pays gold, renown, and route trust.`;
  }
  if (npc.role === "bank") return `Storage ledger: ${bankQty(player, "ash-logs")} Ash Logs, ${bankQty(player, "iron-ore")} Iron Ore. Banked resources count for safer quest turn-ins.`;
  if (npc.role === "merchant") return `${dialogTextForNpc(npc, player)} Your purse holds ${player.gold} Gold, and nearby trade stock changes as routes open.`;
  if (npc.kind === "foreman-iron-will") return `${dialogTextForNpc(npc, player)} Mining level ${player.miningLevel}; banked Iron Ore ${bankQty(player, "iron-ore")}/50.`;
  return `${dialogTextForNpc(npc, player)} ${state.worldEventName ? `World pressure: ${state.worldEventName}.` : ""}`.trim();
}

function marketTopic(npc: NpcEntity): DialogTopic | undefined {
  if (!canUseMarketplace(npc)) return undefined;
  return {
    id: "marketplace",
    label: "Open Marketplace",
    description: "Buy and sell with focused grid controls.",
    body: "Trade without taking eyes off the field. Buy stock from the left pane, sell carried goods from the right pane.",
    kind: "open-market"
  };
}

export function buildDialogViewModel(state: MmoSkillDemoState, player: PlayerEntity, npc: NpcEntity): DialogViewModel {
  const topics: DialogTopic[] = [
    {
      id: "work",
      label: questTopicLabel(npc, player),
      description: "Progress local quest, service, or route state.",
      body: questTopicBody(npc, player, state),
      kind: "rpc",
      input: { action: npc.role === "bank" ? "bank" : npc.role === "travel" ? "travel" : "interact", targetId: npc.id }
    }
  ];
  const marketplace = marketTopic(npc);
  if (marketplace) topics.push(marketplace);
  if (npc.role === "merchant" || npc.kind === "foreman-iron-will") {
    topics.push({
      id: "stock",
      label: "Ask About Stock",
      description: "Preview goods and current buying power.",
      body: marketSummaryText(player, npc),
      kind: "rpc",
      input: { action: "trade", targetId: npc.id, devField: "market", devText: "inspect" }
    });
  }
  topics.push({
    id: "leave",
    label: "Leave",
    description: "Close conversation and return to movement.",
    body: "Step back from the conversation. Nearby prompts remain available.",
    kind: "close"
  });
  return {
    npcId: npc.id,
    name: labelize(npc.kind),
    subtitle: npcSubtitle(npc),
    portraitSrc: portraitForNpc(npc),
    accent: npcAccent(npc),
    body: dialogTextForNpc(npc, player),
    topics
  };
}

function stockIdsForNpc(npc: NpcEntity, player: PlayerEntity) {
  if (npc.kind === "foreman-iron-will" || npc.kind === "blacksmith-silas" || npc.kind === "blacksmith") return ["pickaxe", "iron-ore", "iron-chest", "ring-focus"];
  if (npc.kind === "alchemist-zora") return ["speed-potion", "cinder-ale", "silk-thread", "void-resistant-cloak"];
  if (npc.kind === "apprentice-jinn") return ["glade-berries", "cinder-ale", "speed-potion"];
  if (npc.zoneId === "canaan-desert" || player.zoneId === "bazaar") return ["glade-berries", "speed-potion", "silk-thread", "ring-focus"];
  return ["glade-berries", "cinder-ale", "speed-potion", "pickaxe", "iron-ore"];
}

function catalogItem(id: string): MarketTradeItem & MarketPresentationItem {
  const trade = MARKET_TRADE_ITEMS[id] ?? { itemId: id, price: 10, sellPrice: 3 };
  const presentation = MARKET_PRESENTATION[id] ?? { rarity: "common" as const, description: itemLabel(id) };
  return { ...trade, ...presentation };
}

function buyItemFor(player: PlayerEntity, id: string): MarketItem {
  const item = catalogItem(id);
  const uniqueOwned = ["pickaxe", "iron-chest", "ring-focus", "void-resistant-cloak"].includes(id) && hasInventoryItem(player, id);
  return {
    itemId: id,
    name: itemLabel(id),
    description: item.description,
    rarity: item.rarity,
    iconSrc: itemIconSrc(id),
    quantity: itemQty(player, id),
    price: item.price,
    sellPrice: item.sellPrice,
    disabled: player.gold < item.price || uniqueOwned,
    reason: uniqueOwned ? "Owned" : player.gold < item.price ? "Need more gold" : undefined
  };
}

function sellItemFor(player: PlayerEntity, id: string): MarketItem | undefined {
  const quantity = itemQty(player, id);
  if (quantity <= 0) return undefined;
  const item = catalogItem(id);
  return {
    itemId: id,
    name: itemLabel(id),
    description: item.description,
    rarity: item.rarity,
    iconSrc: itemIconSrc(id),
    quantity,
    price: item.price,
    sellPrice: item.sellPrice,
    disabled: item.sellPrice <= 0,
    reason: item.sellPrice <= 0 ? "Cannot sell" : undefined
  };
}

export function buildMarketplaceViewModel(player: PlayerEntity, npc: NpcEntity): MarketplaceViewModel {
  const buyItems = stockIdsForNpc(npc, player).map((id) => buyItemFor(player, id));
  const sellIds = new Set<string>([...BASE_SELLABLE_IDS, ...Object.keys(player.inventory ?? {})]);
  const sellItems = [...sellIds].map((id) => sellItemFor(player, id)).filter((item): item is MarketItem => Boolean(item));
  return {
    npcId: npc.id,
    title: `${labelize(npc.kind)} Market`,
    subtitle: `${npcSubtitle(npc)} | ${labelize(player.zoneId)}`,
    gold: player.gold,
    buyItems,
    sellItems
  };
}

export function marketActionInput(mode: "buy" | "sell" | "inspect", npcId: string, itemId = ""): MmoSkillDemoInput {
  return {
    action: "trade",
    targetId: npcId,
    itemId,
    devField: "market",
    devText: mode
  };
}

function marketSummaryText(player: PlayerEntity, npc: NpcEntity) {
  const stock = stockIdsForNpc(npc, player).map(itemLabel).join(", ");
  return `Current stock: ${stock}. You have ${player.gold} Gold. Sell panes only list items carried in your replicated inventory.`;
}
