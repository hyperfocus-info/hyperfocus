import type { Renderable } from "@hyperfocus/engine/render";
import { hasInventoryItem } from "../../shared-loadout.ts";
import { type HazardEntity, type LootEntity, type NpcEntity, type PlayerEntity, type ResourceEntity } from "../../shared-contracts.ts";
import type { ClientImages } from "../assets.ts";
import type { SfxPlayer } from "../sfx.ts";

export type Camera = { x: number; y: number };
export type AimPoint = { x: number; y: number };
export type ScreenPoint = { x: number; y: number };
export type Viewport = { x: number; y: number; width: number; height: number };
export type ImpactWeight = "light" | "medium" | "heavy" | "ultimate";
export type ImpactActorVisual = {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  weight: ImpactWeight;
  progress: number;
};
export type ImpactSignal = {
  actorId: string;
  sourceId?: string;
  x: number;
  y: number;
  sourceX?: number;
  sourceY?: number;
  directionX?: number;
  directionY?: number;
  startedMs: number;
  targetHoldMs: number;
  attackerHoldMs: number;
  shakeMs: number;
  shakePx: number;
  weight: ImpactWeight;
};
export type ImpactSignalSink = {
  push(signal: ImpactSignal): void;
};
export type InteractableTarget = { id: string; type: "npc" | "resource" | "loot" | "landmark"; distance: number; score: number };
export type VisualEffectKind =
  | "float"
  | "burst"
  | "ring"
  | "beam"
  | "tether"
  | "slash"
  | "swipe"
  | "spark"
  | "particle"
  | "afterimpact";
export type VisualEffect = {
  id: number;
  kind: VisualEffectKind;
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  controlX?: number;
  controlY?: number;
  text?: string;
  color: string;
  coreColor?: string;
  accentColor?: string;
  startedMs: number;
  lifetimeMs: number;
  size: number;
  angle?: number;
  arc?: number;
  count?: number;
  seed?: number;
  spread?: number;
  length?: number;
  thickness?: number;
  ringCount?: number;
  driftX?: number;
  driftY?: number;
  velocityX?: number;
  velocityY?: number;
  gravity?: number;
  pulse?: number;
  rotation?: number;
  intensity?: number;
  ownerId?: string;
  abilityId?: string;
  slot?: string;
  cleanupOnAbilityEnd?: boolean;
};
export type PlayerRenderSignals = Pick<
  PlayerEntity,
  | "x"
  | "y"
  | "hp"
  | "maxHp"
  | "combatXp"
  | "combatLevel"
  | "miningXp"
  | "miningLevel"
  | "woodcuttingXp"
  | "woodcuttingLevel"
  | "gold"
  | "renown"
  | "masteryRank"
  | "contractId"
  | "contractKills"
  | "contractStreak"
  | "action"
  | "targetId"
  | "activeGatherNodeId"
  | "activeGatherMs"
  | "activeGatherTotalMs"
  | "aimX"
  | "aimY"
  | "guardMs"
  | "berserkMs"
  | "cooldownMs"
  | "knockbackMs"
  | "stunMs"
  | "iframeMs"
  | "castMs"
  | "zoneId"
> & {
  items: Record<string, number>;
  questFlags: Record<string, boolean>;
  energy: number;
  chargeMs: number;
  rushMs: number;
  activeAbility: string;
};
export type NpcSnapshot = Pick<NpcEntity, "x" | "y" | "hp" | "maxHp" | "zoneId" | "attackCooldownMs" | "projectileCooldownMs" | "phaseMs" | "knockbackMs" | "stunMs" | "iframeMs" | "castMs" | "impactType" | "combatState">;
export type LootSnapshot = Pick<LootEntity, "x" | "y" | "itemId" | "amount" | "zoneId">;
export type ResourceSnapshot = Pick<ResourceEntity, "x" | "y" | "hp" | "maxHp" | "zoneId" | "depleted">;
export type DialogState = { npcId: string; title: string; body: string; untilMs: number };
export type QuestMarker = { glyph: "!" | "?"; fill: string; stroke: string; text: string };
export type RenderContext = {
  images: ClientImages;
  timeMs: number;
  currentInteractable?: InteractableTarget;
  clientPlayerId?: string;
};
export type RenderableFactory<T> = (value: T, context: RenderContext) => Renderable[];
export type EntityRenderInput = ResourceEntity | LootEntity | NpcEntity | PlayerEntity | HazardEntity;
export type EffectSink = {
  push(effect: Omit<VisualEffect, "id">): void;
  pushFloat(text: string, x: number, y: number, color: string, timeMs: number, size?: number): void;
  pushBurst(x: number, y: number, color: string, timeMs: number, size?: number, text?: string): void;
  prune?(predicate: (effect: VisualEffect) => boolean): void;
};
export type SignalSyncContext = {
  sfx?: SfxPlayer;
  getClientPlayerId: () => string | undefined;
  effects: EffectSink;
  impact?: ImpactSignalSink;
};

export const ACTOR_LABEL_DISTANCE = 140;
export const STATUS_UPDATE_INTERVAL_MS = 250;
export const STRONG_PHASE_INVULN_START_MS = 3200;
export const STRONG_PHASE_INVULN_END_MS = 5200;
export const STRONG_ENEMY_KINDS = new Set(["stone-crawler", "alpha-timberwolf", "crag-gargoyle", "void-sent-sentinel", "dungeon-revenant"]);
export const HOTBAR_LABELS = ["LMB", "RMB", "Space", "Q", "E"] as const;
export const HOTBAR_NAMES = ["Pummel", "Slam", "Rush", "Berserk", "Boulder"] as const;
export const PLAYER_SIGNAL_ITEMS = [
  ["ash-logs", "logs", "#a9d88f"],
  ["iron-ore", "ore", "#c8d0d8"],
  ["silk-thread", "silk", "#dfb7ff"],
  ["glade-berries", "berries", "#ff8bb5"],
  ["cinder-ale", "ale", "#ffb36b"],
  ["speed-potion", "speed", "#9bd6ff"]
] as const;

const labelCache = new Map<string, string>();

export function labelize(value: string) {
  let label = labelCache.get(value);
  if (!label) {
    label = value.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    labelCache.set(value, label);
  }
  return label;
}

export function hasGearOrItem(player: PlayerEntity, flag: string) {
  const equipment = player.equipment ?? {};
  if (hasInventoryItem(player, flag) || equipment[flag]) return true;
  for (const slot of Object.keys(equipment)) {
    if (equipment[slot] === flag) return true;
  }
  return false;
}

export function sameZoneOrSupport(player: PlayerEntity | undefined, entity: { zoneId: string }, support = false) {
  return !player || entity.zoneId === player.zoneId || support;
}
