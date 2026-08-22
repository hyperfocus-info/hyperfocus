import { itemQty, playerAbilityMetadata, selectedAbilityForSlot, type HazardEntity, type LootEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity } from "../../shared.ts";
import { activeAbility, chargeMs, energyMax, energyReady, energyValue, rushMs } from "../combat-view.ts";
import type { SfxEvent } from "../sfx.ts";
import { lootColor } from "./loot.ts";
import { isStrongEnemyVisual } from "./npcs.ts";
import { PLAYER_SIGNAL_ITEMS, type ImpactWeight, type LootSnapshot, type NpcSnapshot, type PlayerRenderSignals, type ResourceSnapshot, type SignalSyncContext } from "./types.ts";

export function capturePlayerRenderSignals(player: PlayerEntity): PlayerRenderSignals {
  const items: Record<string, number> = {};
  for (const [itemId] of PLAYER_SIGNAL_ITEMS) items[itemId] = itemQty(player, itemId);
  return {
    x: player.x,
    y: player.y,
    hp: player.hp,
    maxHp: player.maxHp,
    combatXp: player.combatXp,
    combatLevel: player.combatLevel,
    miningXp: player.miningXp,
    miningLevel: player.miningLevel,
    woodcuttingXp: player.woodcuttingXp,
    woodcuttingLevel: player.woodcuttingLevel,
    gold: player.gold,
    renown: player.renown,
    masteryRank: player.masteryRank,
    contractId: player.contractId,
    contractKills: player.contractKills,
    contractStreak: player.contractStreak,
    items,
    action: player.action,
    targetId: player.targetId,
    activeGatherNodeId: player.activeGatherNodeId,
    activeGatherMs: player.activeGatherMs,
    activeGatherTotalMs: player.activeGatherTotalMs,
    questFlags: { ...player.questFlags },
    aimX: player.aimX,
    aimY: player.aimY,
    guardMs: player.guardMs,
    berserkMs: player.berserkMs,
    cooldownMs: player.cooldownMs,
    knockbackMs: player.knockbackMs,
    stunMs: player.stunMs,
    iframeMs: player.iframeMs,
    castMs: player.castMs,
    zoneId: player.zoneId,
    energy: energyValue(player),
    chargeMs: chargeMs(player),
    rushMs: rushMs(player),
    activeAbility: activeAbility(player)
  };
}

function snapshotNpc(npc: NpcEntity): NpcSnapshot {
  return {
    x: npc.x,
    y: npc.y,
    hp: npc.hp,
    maxHp: npc.maxHp,
    zoneId: npc.zoneId,
    attackCooldownMs: npc.attackCooldownMs,
    projectileCooldownMs: npc.projectileCooldownMs,
    phaseMs: npc.phaseMs,
    knockbackMs: npc.knockbackMs,
    stunMs: npc.stunMs,
    iframeMs: npc.iframeMs,
    castMs: npc.castMs,
    impactType: npc.impactType,
    combatState: npc.combatState
  };
}

function snapshotLoot(loot: LootEntity): LootSnapshot {
  return { x: loot.x, y: loot.y, itemId: loot.itemId, amount: loot.amount, zoneId: loot.zoneId };
}

function snapshotResource(node: ResourceEntity): ResourceSnapshot {
  return { x: node.x, y: node.y, hp: node.hp, maxHp: node.maxHp, zoneId: node.zoneId, depleted: node.depleted };
}

function impactColor(kind: string | undefined) {
  if (kind === "sap") return "#9ed27f";
  if (kind === "spark") return "#f4d36b";
  if (kind === "void") return "#b99cff";
  if (kind === "spore") return "#ffb36b";
  if (kind === "dust") return "#c8b58b";
  return "#ef6f4f";
}

function signalUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function hazardColor(hazard: HazardEntity) {
  return impactColor(hazard.effectKind || (hazard.kind === "line" ? "dust" : undefined));
}

type CombatSlot = "LMB" | "RMB" | "Space" | "Q" | "E" | "R";
type AbilityWeaponKey = "mace" | "bow" | "staff" | "wand" | "twin" | "blade";
type AbilitySignalTheme = {
  weapon: AbilityWeaponKey;
  color: string;
  accent: string;
  cast: SfxEvent;
  projectile: SfxEvent;
  impact: SfxEvent;
};

const ACTION_TO_SLOT: Partial<Record<PlayerEntity["action"], CombatSlot>> = {
  attack: "LMB",
  lmb: "LMB",
  rmb: "RMB",
  space: "Space",
  q: "Q",
  e: "E",
  r: "R"
};

const ABILITY_THEMES: Record<AbilityWeaponKey, AbilitySignalTheme> = {
  mace: { weapon: "mace", color: "#f4d36b", accent: "#ffb36b", cast: "mace-cast", projectile: "mace-projectile", impact: "mace-impact" },
  bow: { weapon: "bow", color: "#9bd6ff", accent: "#b6f0a4", cast: "bow-cast", projectile: "bow-projectile", impact: "bow-impact" },
  staff: { weapon: "staff", color: "#b99cff", accent: "#6de2ff", cast: "staff-cast", projectile: "staff-projectile", impact: "staff-impact" },
  wand: { weapon: "wand", color: "#ffb1e0", accent: "#fff3b8", cast: "wand-cast", projectile: "wand-projectile", impact: "wand-impact" },
  twin: { weapon: "twin", color: "#a9d88f", accent: "#f5f3e8", cast: "twin-cast", projectile: "twin-projectile", impact: "twin-impact" },
  blade: { weapon: "blade", color: "#f7f0d6", accent: "#ff8b7a", cast: "blade-cast", projectile: "blade-projectile", impact: "blade-impact" }
};

export type ImpactFeedbackProfile = {
  weight: ImpactWeight;
  hitstopMs: number;
  targetHoldMs: number;
  attackerHoldMs: number;
  shakeMs: number;
  shakePx: number;
  effectScale: number;
  soundIntensity: number;
};

const IMPACT_BASE: Record<ImpactWeight, ImpactFeedbackProfile> = {
  light: { weight: "light", hitstopMs: 38, targetHoldMs: 42, attackerHoldMs: 14, shakeMs: 48, shakePx: 0.35, effectScale: 0.9, soundIntensity: 0.8 },
  medium: { weight: "medium", hitstopMs: 58, targetHoldMs: 64, attackerHoldMs: 26, shakeMs: 68, shakePx: 0.75, effectScale: 1.08, soundIntensity: 1 },
  heavy: { weight: "heavy", hitstopMs: 84, targetHoldMs: 92, attackerHoldMs: 40, shakeMs: 88, shakePx: 1.3, effectScale: 1.35, soundIntensity: 1.22 },
  ultimate: { weight: "ultimate", hitstopMs: 112, targetHoldMs: 122, attackerHoldMs: 54, shakeMs: 116, shakePx: 2.05, effectScale: 1.68, soundIntensity: 1.45 }
};

const WEAPON_IMPACT_ADJUST: Record<AbilityWeaponKey, { holdMs: number; shakePx: number; effectScale: number; soundIntensity: number }> = {
  mace: { holdMs: 8, shakePx: 0.2, effectScale: 0.16, soundIntensity: 0.12 },
  bow: { holdMs: -10, shakePx: -0.22, effectScale: -0.08, soundIntensity: -0.05 },
  staff: { holdMs: 0, shakePx: -0.06, effectScale: 0.08, soundIntensity: 0.04 },
  wand: { holdMs: -5, shakePx: -0.1, effectScale: 0, soundIntensity: 0 },
  twin: { holdMs: -12, shakePx: -0.24, effectScale: -0.1, soundIntensity: -0.04 },
  blade: { holdMs: 4, shakePx: 0.1, effectScale: 0.08, soundIntensity: 0.08 }
};

const HEAVY_IMPACT_ABILITIES = new Set([
  "mace-crushing-leap",
  "mace-rock-smash",
  "space-rush",
  "bow-precision",
  "bow-vault",
  "staff-meteor",
  "staff-petrify",
  "staff-gravity-well",
  "wand-focused-ray",
  "wand-rupture",
  "twin-shadow-lunge",
  "twin-exsanguinate",
  "twin-assassinate",
  "blade-brutal-strike",
  "blade-thrust",
  "blade-leap-attack",
  "blade-omnislash"
]);

const PROJECTILE_LIKE_ABILITIES = new Set([
  "bow-quick-shot",
  "bow-precision",
  "bow-volley",
  "bow-bolas",
  "staff-arcane-bolt",
  "staff-frost-chain",
  "wand-magic-missile",
  "wand-hex",
  "wand-mending-spark",
  "wand-focused-ray",
  "twin-throwing-dirk",
  "twin-fan-of-knives",
  "blade-razor-wind"
]);

const PROJECTILE_SFX_BY_EFFECT_KIND: Record<string, SfxEvent> = {
  arrow: "bow-projectile",
  piercearrow: "bow-projectile",
  root: "bow-projectile",
  boulder: "mace-projectile",
  boulders: "mace-projectile",
  "arcane-bolt": "staff-projectile",
  frost: "staff-projectile",
  missile: "wand-projectile",
  hex: "wand-projectile",
  mend: "wand-projectile",
  "focused-ray": "wand-projectile",
  chaos: "wand-projectile",
  dirk: "twin-projectile",
  knife: "twin-projectile",
  "noxious-flask": "twin-projectile",
  razor: "blade-projectile",
  pierceblade: "blade-projectile"
};

function slotForAction(action: PlayerEntity["action"]) {
  return ACTION_TO_SLOT[action];
}

function weaponKeyForAbility(abilityId: string, equippedWeaponId = ""): AbilityWeaponKey | undefined {
  const weaponId = playerAbilityMetadata[abilityId]?.weaponId || equippedWeaponId;
  if (weaponId === "twin-blades") return "twin";
  if (weaponId === "mace" || abilityId.startsWith("mace-") || abilityId === "space-rush" || abilityId === "q-berserk") return "mace";
  if (weaponId === "bow" || abilityId.startsWith("bow-")) return "bow";
  if (weaponId === "staff" || abilityId.startsWith("staff-")) return "staff";
  if (weaponId === "wand" || abilityId.startsWith("wand-")) return "wand";
  if (weaponId === "blade" || abilityId.startsWith("blade-")) return "blade";
  if (abilityId.startsWith("twin-")) return "twin";
  return undefined;
}

function impactWeightForAbility(abilityId: string, amount: number, killed: boolean, boss: boolean): ImpactWeight {
  const slot = playerAbilityMetadata[abilityId]?.slot;
  if (boss && killed) return "ultimate";
  if (slot === "R") return "ultimate";
  if (HEAVY_IMPACT_ABILITIES.has(abilityId) || amount >= 22 || killed) return "heavy";
  if (slot && slot !== "LMB" || amount >= 10) return "medium";
  return "light";
}

export function impactFeedbackForAbility(
  abilityId: string,
  amount = 0,
  options: { equippedWeaponId?: string; targetRole?: string; killed?: boolean } = {}
): ImpactFeedbackProfile {
  const weapon = weaponKeyForAbility(abilityId, options.equippedWeaponId) ?? "mace";
  const boss = options.targetRole === "boss";
  const weight = impactWeightForAbility(abilityId, amount, Boolean(options.killed), boss);
  const base = IMPACT_BASE[weight];
  const adjust = WEAPON_IMPACT_ADJUST[weapon];
  const projectile = PROJECTILE_LIKE_ABILITIES.has(abilityId);
  const bossHold = boss ? 18 : 0;
  const bossShake = boss ? 0.35 : 0;
  const projectileHold = projectile ? -8 : 0;
  const projectileShake = projectile ? -0.12 : 0;
  return {
    weight,
    hitstopMs: Math.max(24, Math.round(base.hitstopMs + adjust.holdMs + bossHold + projectileHold)),
    targetHoldMs: Math.max(26, Math.round(base.targetHoldMs + adjust.holdMs + bossHold + projectileHold)),
    attackerHoldMs: projectile ? 0 : Math.max(0, Math.round(base.attackerHoldMs + adjust.holdMs * 0.35)),
    shakeMs: Math.max(32, Math.round(base.shakeMs + bossHold * 0.6)),
    shakePx: Math.max(0.18, Math.min(4, Number((base.shakePx + adjust.shakePx + bossShake + projectileShake).toFixed(2)))),
    effectScale: Math.max(0.78, Number((base.effectScale + adjust.effectScale + (boss ? 0.18 : 0)).toFixed(2))),
    soundIntensity: Math.max(0.65, Number((base.soundIntensity + adjust.soundIntensity + (boss ? 0.16 : 0)).toFixed(2)))
  };
}

export function abilityThemeFor(abilityId: string, equippedWeaponId = "") {
  const weapon = weaponKeyForAbility(abilityId, equippedWeaponId);
  return weapon ? ABILITY_THEMES[weapon] : undefined;
}

export function abilityCastSfx(abilityId: string, equippedWeaponId = ""): SfxEvent {
  return abilityThemeFor(abilityId, equippedWeaponId)?.cast ?? (abilityId ? "spell" : "attack");
}

export function abilityImpactSfx(abilityId: string, equippedWeaponId = ""): SfxEvent {
  return abilityThemeFor(abilityId, equippedWeaponId)?.impact ?? "hit";
}

export function abilityProjectileSfx(abilityIdOrEffectKind: string, equippedWeaponId = ""): SfxEvent {
  return PROJECTILE_SFX_BY_EFFECT_KIND[abilityIdOrEffectKind] ?? abilityThemeFor(abilityIdOrEffectKind, equippedWeaponId)?.projectile ?? "spell";
}

function selectedAbilityIdForPlayerAction(player: PlayerEntity) {
  const active = activeAbility(player);
  if (active) return active;
  const slot = slotForAction(player.action);
  return slot ? selectedAbilityForSlot(player, slot) : "";
}

function playerAbilityEffectOptions(player: PlayerEntity, abilityId: string) {
  return {
    ownerId: player.id,
    abilityId,
    slot: slotForAction(player.action) ?? player.activeSlot,
    cleanupOnAbilityEnd: true
  };
}

function prunePlayerAbilityEffects(context: SignalSyncContext, playerId: string, abilityId?: string) {
  context.effects.prune?.((effect) => {
    if (effect.ownerId !== playerId) return false;
    if (!abilityId) return true;
    return Boolean(effect.cleanupOnAbilityEnd && (!effect.abilityId || effect.abilityId === abilityId));
  });
}

function abilityImpactVisualKind(theme: AbilitySignalTheme | undefined): "ring" | "slash" {
  return theme?.weapon === "staff" || theme?.weapon === "wand" ? "ring" : "slash";
}

function likelyAttackerForNpc(npc: NpcEntity, state: MmoSkillDemoState) {
  let best: PlayerEntity | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  const players = state.players ?? {};
  for (const id of Object.keys(players)) {
    const player = players[id];
    if (!player) continue;
    if (player.hp <= 0 || player.zoneId !== npc.zoneId) continue;
    const distance = Math.hypot(player.x - npc.x, player.y - npc.y);
    const targetBias = player.targetId === npc.id ? -2000 : 0;
    const activeBias = activeAbility(player) ? -300 : 0;
    const score = distance + targetBias + activeBias;
    if (score < bestScore) {
      best = player;
      bestScore = score;
    }
  }
  return best;
}

function pushAbilityCastEffect(player: PlayerEntity, abilityId: string, timeMs: number, context: SignalSyncContext) {
  const theme = abilityThemeFor(abilityId, player.equippedWeaponId);
  const color = theme?.color ?? (player.action === "q" ? "#b99cff" : player.action === "e" ? "#ff7eb6" : player.action === "space" ? "#9bd6ff" : "#f5f3e8");
  const ownerOptions = playerAbilityEffectOptions(player, abilityId);
  context.effects.push({ kind: "ring", x: player.x, y: player.y + 2, color, startedMs: timeMs, lifetimeMs: player.action === "space" ? 260 : 340, size: player.action === "r" ? 36 : 24, ...ownerOptions });
  if (theme) context.effects.push({ kind: "particle", x: player.x, y: player.y - 6, color: theme.accent, startedMs: timeMs, lifetimeMs: player.action === "space" ? 220 : 280, size: player.action === "r" ? 24 : 14, count: player.action === "space" ? 5 : undefined, ...ownerOptions });
  context.sfx?.play(theme?.cast ?? abilityCastSfx(abilityId, player.equippedWeaponId), player.action === "r" ? 1.35 : 1);
}

function pushNpcAbilityImpact(npc: NpcEntity, previous: NpcSnapshot, state: MmoSkillDemoState, timeMs: number, context: SignalSyncContext) {
  const amount = previous.hp - npc.hp;
  const attacker = likelyAttackerForNpc(npc, state);
  const abilityId = attacker ? selectedAbilityIdForPlayerAction(attacker) : "";
  const theme = attacker ? abilityThemeFor(abilityId, attacker.equippedWeaponId) : undefined;
  const profile = impactFeedbackForAbility(abilityId, amount, { equippedWeaponId: attacker?.equippedWeaponId, targetRole: npc.role, killed: previous.hp > 0 && npc.hp <= 0 });
  const color = theme?.color ?? impactColor(npc.impactType);
  const effectSize = (npc.role === "boss" ? 34 : 22) * profile.effectScale;
  context.effects.pushFloat(`-${amount}`, npc.x, npc.y - 34, color, timeMs, Math.round((npc.role === "boss" ? 18 : 14) * Math.min(1.22, profile.effectScale)));
  context.effects.push({ kind: abilityImpactVisualKind(theme), x: npc.x, y: npc.y, color: theme?.accent ?? "#f5f3e8", startedMs: timeMs, lifetimeMs: 300 + profile.hitstopMs, size: effectSize, thickness: profile.weight === "light" ? 2 : profile.weight === "medium" ? 2.6 : 3.2, ringCount: profile.weight === "ultimate" ? 3 : profile.weight === "heavy" ? 2 : undefined });
  context.effects.push({ kind: "particle", x: npc.x, y: npc.y, color, startedMs: timeMs, lifetimeMs: 420 + profile.hitstopMs, size: (npc.role === "boss" ? 28 : 18) * profile.effectScale, count: profile.weight === "light" ? 7 : profile.weight === "medium" ? 10 : 14, length: 18 + profile.effectScale * 18 });
  if (profile.weight === "heavy" || profile.weight === "ultimate") {
    context.effects.push({ kind: "afterimpact", x: npc.x, y: npc.y + 6, color, coreColor: "#fff7df", accentColor: theme?.accent, startedMs: timeMs, lifetimeMs: 420 + profile.hitstopMs, size: (npc.role === "boss" ? 30 : 20) * profile.effectScale, count: profile.weight === "ultimate" ? 10 : 7, intensity: Math.min(1.8, profile.effectScale) });
  }
  if (theme) context.effects.pushBurst(npc.x, npc.y - 4, color, timeMs, (npc.role === "boss" ? 24 : 16) * profile.effectScale);
  const directionLength = attacker ? Math.hypot(npc.x - attacker.x, npc.y - attacker.y) || 1 : 1;
  context.impact?.push({
    actorId: npc.id,
    sourceId: attacker && attacker.id === context.getClientPlayerId() ? attacker.id : undefined,
    x: npc.x,
    y: npc.y,
    sourceX: attacker?.x,
    sourceY: attacker?.y,
    directionX: attacker ? (npc.x - attacker.x) / directionLength : 1,
    directionY: attacker ? (npc.y - attacker.y) / directionLength : 0,
    startedMs: timeMs,
    targetHoldMs: profile.targetHoldMs,
    attackerHoldMs: profile.attackerHoldMs,
    shakeMs: profile.shakeMs,
    shakePx: profile.shakePx,
    weight: profile.weight
  });
  context.sfx?.play(theme ? theme.impact : "hit", Math.max(amount / 10, profile.soundIntensity));
}

function pushPlayerHazardSignal(hazard: HazardEntity, state: MmoSkillDemoState, timeMs: number, context: SignalSyncContext) {
  const owner = state.players?.[hazard.ownerId];
  if (!owner) return;
  const abilityId = selectedAbilityIdForPlayerAction(owner);
  const theme = abilityThemeFor(abilityId, owner.equippedWeaponId);
  const projectileSfx = PROJECTILE_SFX_BY_EFFECT_KIND[hazard.effectKind];
  if (hazard.combatState === "player-projectile" || projectileSfx) {
    context.sfx?.play(projectileSfx ?? abilityProjectileSfx(abilityId, owner.equippedWeaponId), Math.max(0.55, hazard.radius / 10));
    return;
  }
  if (!theme || (hazard.damage <= 0 && hazard.kind !== "aoe")) return;
  context.effects.pushBurst(hazard.x, hazard.y, theme.color, timeMs, hazard.kind === "aoe" ? Math.max(18, Math.min(40, hazard.radius * 0.24)) : 14);
  context.sfx?.play(theme.impact, Math.max(0.6, hazard.radius / 90));
}

function pushTransientProjectileSignal(effect: MmoSkillDemoState["effects"][number], context: SignalSyncContext) {
  const sfx = PROJECTILE_SFX_BY_EFFECT_KIND[effect.effectKind];
  if (sfx) context.sfx?.play(sfx, Math.max(0.55, effect.radius / 10));
}

export function npcAttackSfx(npc: Pick<NpcEntity, "impactType" | "role">, projectile: boolean): SfxEvent {
  if (npc.impactType === "void") return "npc-void";
  if (npc.impactType === "spark") return "npc-spark";
  if (npc.impactType === "sap" || npc.impactType === "spore") return "npc-sap";
  if (projectile || npc.role === "boss") return "npc-cast";
  return "npc-claw";
}

const CLIENT_OWNED_HAZARD_EFFECTS = new Set(["conewave", "boulder", "boulders", "rushdust", "crater", "whirlwind", "dust", "whitehot"]);

function emitGain(player: PlayerEntity, amount: number, label: string, color: string, timeMs: number, context: SignalSyncContext) {
  if (amount > 0) context.effects.pushFloat(`+${amount} ${label}`, player.x, player.y - 38, color, timeMs, 13);
}

function isGatheringAction(action: string | undefined) {
  return action === "mine" || action === "woodcut";
}

function gatheringEffectColor(resource: ResourceEntity) {
  if (resource.kind === "ore") return "#aeb7c2";
  if (resource.kind === "tree") return "#9ed27f";
  if (resource.kind === "fishing" || resource.kind === "dredging") return "#6de2ff";
  if (resource.kind === "crop-harvesting" || resource.kind === "apiculture") return "#f4d36b";
  return "#7ed66d";
}

function nearestPlayerToNpc(npc: NpcEntity, state: MmoSkillDemoState, maxDistance: number) {
  let best: PlayerEntity | undefined;
  let bestDistance = maxDistance;
  const players = state.players ?? {};
  for (const id of Object.keys(players)) {
    const player = players[id];
    if (!player) continue;
    if (player.hp <= 0 || player.zoneId !== npc.zoneId) continue;
    const distance = Math.hypot(player.x - npc.x, player.y - npc.y);
    if (distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }
  return best;
}

function pushPlayerActionEffect(player: PlayerEntity, state: MmoSkillDemoState, timeMs: number, context: SignalSyncContext) {
  const targetNpc = player.targetId ? state.npcs?.[player.targetId] : undefined;
  const targetResource = (player.activeGatherNodeId ? state.resources?.[player.activeGatherNodeId] : undefined) ?? (player.targetId ? state.resources?.[player.targetId] : undefined);
  const abilityId = selectedAbilityIdForPlayerAction(player);
  const theme = abilityThemeFor(abilityId, player.equippedWeaponId);
  if (slotForAction(player.action) && targetNpc) {
    const color = theme?.color ?? (player.action === "q" ? "#b99cff" : player.action === "e" ? "#ff7eb6" : player.action === "space" ? "#9bd6ff" : "#f5f3e8");
    const ownerOptions = playerAbilityEffectOptions(player, abilityId);
    context.effects.push({ kind: "beam", x: player.x, y: player.y - 8, toX: targetNpc.x, toY: targetNpc.y - 12, color, startedMs: timeMs, lifetimeMs: 190, size: 3, ...ownerOptions });
    context.effects.push({ kind: abilityImpactVisualKind(theme), x: targetNpc.x, y: targetNpc.y, color: theme?.accent ?? color, startedMs: timeMs, lifetimeMs: 300, size: targetNpc.role === "boss" ? 34 : 22, ...ownerOptions });
    context.sfx?.play(abilityCastSfx(abilityId, player.equippedWeaponId));
  } else if ((player.action === "mine" || player.action === "woodcut") && targetResource) {
    const color = gatheringEffectColor(targetResource);
    context.effects.push({ kind: "beam", x: player.x, y: player.y - 6, toX: targetResource.x, toY: targetResource.y - 8, color, startedMs: timeMs, lifetimeMs: 220, size: 2 });
    context.effects.pushBurst(targetResource.x, targetResource.y - 4, color, timeMs, 18);
    context.effects.push({
      kind: "particle",
      x: targetResource.x,
      y: targetResource.y - 8,
      color,
      startedMs: timeMs,
      lifetimeMs: 277,
      size: 18,
      count: 13,
      spread: Math.PI * 2,
      length: 26,
      gravity: 18
    });
    context.sfx?.play("gather");
  } else if ((player.action === "interact" || player.action === "travel" || player.action === "bank" || player.action === "trade") && targetNpc) {
    context.effects.push({ kind: "ring", x: targetNpc.x, y: targetNpc.y, color: "#ffffff", startedMs: timeMs, lifetimeMs: 520, size: 24 });
    context.sfx?.play("interact");
  } else if (slotForAction(player.action)) {
    pushAbilityCastEffect(player, abilityId, timeMs, context);
  }
}

function pushNpcAttackEffect(npc: NpcEntity, state: MmoSkillDemoState, timeMs: number, projectile: boolean, context: SignalSyncContext) {
  const target = nearestPlayerToNpc(npc, state, projectile ? 170 : npc.role === "boss" ? 190 : 150);
  if (target) {
    context.effects.push({
      kind: "beam",
      x: npc.x,
      y: npc.y - 10,
      toX: target.x,
      toY: target.y - 8,
      color: projectile ? "#ffb36b" : "#ef6f4f",
      startedMs: timeMs,
      lifetimeMs: projectile ? 340 : 240,
      size: projectile ? 3 : 2
    });
  }
  context.effects.push({ kind: "ring", x: npc.x, y: npc.y, color: projectile ? "#ffb36b" : "#ef6f4f", startedMs: timeMs, lifetimeMs: 480, size: npc.role === "boss" ? 40 : 24 });
  context.sfx?.play(npcAttackSfx(npc, projectile), projectile ? 1.1 : 1);
}

export function createRenderSignalTracker(context: SignalSyncContext) {
  const previousPlayers = new Map<string, PlayerRenderSignals>();
  const previousNpcs = new Map<string, NpcSnapshot>();
  const previousResources = new Map<string, ResourceSnapshot>();
  const previousLoot = new Map<string, LootSnapshot>();
  const previousHazards = new Set<string>();
  const previousEffects = new Set<string>();
  const liveEffects = new Set<string>();

  function sync(state: MmoSkillDemoState, timeMs: number) {
    const localPlayerId = context.getClientPlayerId();
    const players = state.players ?? {};
    for (const id of Object.keys(players)) {
      const player = players[id];
      if (!player) continue;
      const previous = previousPlayers.get(player.id);
      if (previous) {
        if (previous.activeAbility && previous.activeAbility !== player.activeAbility) {
          prunePlayerAbilityEffects(context, player.id, previous.activeAbility);
        }
        if (player.hp < previous.hp) {
          context.effects.pushFloat(`-${previous.hp - player.hp}`, player.x, player.y - 32, "#ff8b7a", timeMs, 15);
          context.effects.push({ kind: "ring", x: player.x, y: player.y, color: "#ff8b7a", startedMs: timeMs, lifetimeMs: 420, size: 22 });
          context.effects.push({ kind: "particle", x: player.x, y: player.y, color: "#ef6f4f", startedMs: timeMs, lifetimeMs: 520, size: 18 });
          context.sfx?.play(player.id === localPlayerId ? "hurt" : "hit", (previous.hp - player.hp) / 8);
        }
        if (previous.hp > 0 && player.hp <= 0) {
          prunePlayerAbilityEffects(context, player.id);
          context.effects.pushBurst(previous.x, previous.y, "#ef6f4f", timeMs, 34, "Down");
          context.sfx?.play(player.id === localPlayerId ? "death" : "kill");
        }
        emitGain(player, player.combatXp - previous.combatXp, "combat XP", "#9bd6ff", timeMs, context);
        emitGain(player, player.miningXp - previous.miningXp, "mining XP", "#c8d0d8", timeMs, context);
        emitGain(player, player.woodcuttingXp - previous.woodcuttingXp, "wood XP", "#a9d88f", timeMs, context);
        if (player.combatLevel > previous.combatLevel || player.miningLevel > previous.miningLevel || player.woodcuttingLevel > previous.woodcuttingLevel || player.masteryRank > previous.masteryRank) {
          context.sfx?.play("level", Math.max(player.combatLevel - previous.combatLevel, player.masteryRank - previous.masteryRank, 1));
          context.effects.pushBurst(player.x, player.y - 16, "#f4d36b", timeMs, 46, "Rank");
        }
        if (player.contractKills > previous.contractKills) context.sfx?.play("hit");
        if (player.renown > previous.renown || player.contractStreak > previous.contractStreak) context.sfx?.play("quest");
        emitGain(player, player.gold - previous.gold, "gold", "#f4d36b", timeMs, context);
        let gainedLoot = player.gold > previous.gold;
        for (const [itemId, label, color] of PLAYER_SIGNAL_ITEMS) {
          const quantity = itemQty(player, itemId);
          emitGain(player, quantity - (previous.items[itemId] ?? 0), label, color, timeMs, context);
          gainedLoot ||= quantity > (previous.items[itemId] ?? 0);
        }
        if (gainedLoot) context.sfx?.play("loot");
        for (const bit of Object.keys(player.questFlags ?? {})) {
          if (!previous.questFlags[bit] && !bit.endsWith("-ready")) {
            context.sfx?.play("quest");
            context.effects.pushBurst(player.x, player.y - 12, "#f4d36b", timeMs, 42, "Quest");
            for (let i = 0; i < 10; i += 1) {
              const angle = (Math.PI * 2 * i) / 10;
              context.effects.push({ kind: "beam", x: player.x, y: player.y - 18, toX: player.x + Math.cos(angle) * 52, toY: player.y - 18 + Math.sin(angle) * 52, color: "#f4d36b", startedMs: timeMs, lifetimeMs: 520, size: 2 });
            }
          }
        }
        const abilityStarted = Boolean(player.activeAbility && player.activeAbility !== previous.activeAbility);
        const gatheringStarted =
          Boolean(player.activeGatherNodeId) &&
          (player.activeGatherNodeId !== previous.activeGatherNodeId || (player.activeGatherMs ?? 0) > 0 && (previous.activeGatherMs ?? 0) <= 0);
        if (abilityStarted) pushAbilityCastEffect(player, player.activeAbility, timeMs, context);
        if (gatheringStarted) pushPlayerActionEffect(player, state, timeMs, context);
        if (!abilityStarted && !gatheringStarted && player.cooldownMs > previous.cooldownMs + 80 && player.action !== "idle") pushPlayerActionEffect(player, state, timeMs, context);
        if (previous.energy < energyMax(player) - 0.001 && energyReady(player)) {
          context.effects.pushBurst(player.x, player.y - 10, "#f4d36b", timeMs, 32, "Ult");
          context.sfx?.play("quest");
        }
        if (chargeMs(player) > previous.chargeMs + 120) {
          const activeAbilityId = activeAbility(player);
          const color = activeAbilityId.includes("e") ? "#ff7eb6" : "#f4d36b";
          const seed = Math.floor(timeMs + player.x * 7 + player.y * 13 + chargeMs(player));
          context.effects.push({
            kind: "particle",
            x: player.x,
            y: player.y + 2,
            color,
            startedMs: timeMs,
            lifetimeMs: 260,
            size: 4.8,
            length: 24,
            count: 5,
            spread: Math.PI * 2,
            seed,
            velocityX: -5 + signalUnit(seed + 17) * 10,
            velocityY: -5 + signalUnit(seed + 29) * 10,
            ...playerAbilityEffectOptions(player, activeAbilityId)
          });
        }
        if (rushMs(player) > previous.rushMs + 80) {
          context.effects.push({ kind: "beam", x: previous.x, y: previous.y + 8, toX: player.x, toY: player.y + 8, color: "#9bd6ff", startedMs: timeMs, lifetimeMs: 180, size: 4, ...playerAbilityEffectOptions(player, activeAbility(player) || previous.activeAbility || "space-rush") });
        }
      }
      previousPlayers.set(player.id, capturePlayerRenderSignals(player));
    }
    for (const id of previousPlayers.keys()) {
      if (!players[id]) {
        prunePlayerAbilityEffects(context, id);
        previousPlayers.delete(id);
      }
    }

    const npcs = state.npcs ?? {};
    for (const id of Object.keys(npcs)) {
      const npc = npcs[id];
      if (!npc) continue;
      const previous = previousNpcs.get(npc.id);
      if (previous) {
        if (npc.hp < previous.hp) {
          pushNpcAbilityImpact(npc, previous, state, timeMs, context);
        }
        if (npc.hp > previous.hp) {
          context.effects.pushFloat(`+${npc.hp - previous.hp}`, npc.x, npc.y - 34, "#9bd6ff", timeMs, 13);
          context.effects.push({ kind: "ring", x: npc.x, y: npc.y, color: "#9bd6ff", startedMs: timeMs, lifetimeMs: 460, size: npc.role === "boss" ? 34 : 22 });
          context.sfx?.play("npc-heal", (npc.hp - previous.hp) / 10);
        }
        if (isStrongEnemyVisual(npc) && previous.phaseMs < 3200 && npc.phaseMs >= 3200) {
          context.effects.pushBurst(npc.x, npc.y - 8, "#6de2ff", timeMs, npc.role === "boss" ? 52 : 34, "Immune");
          context.sfx?.play("npc-phase");
        }
        if (isStrongEnemyVisual(npc) && previous.phaseMs < 5200 && npc.phaseMs >= 5200) {
          context.effects.pushBurst(npc.x, npc.y - 8, "#ffb36b", timeMs, npc.role === "boss" ? 56 : 36, "Buff");
          context.sfx?.play("npc-cast");
        }
        if (previous.hp > 0 && npc.hp <= 0) {
          context.effects.pushBurst(previous.x, previous.y, npc.role === "boss" ? "#ff7eb6" : "#ef6f4f", timeMs, npc.role === "boss" ? 48 : 30, "KO");
          context.sfx?.play(npc.role === "boss" ? "boss" : "kill");
        }
        if (npc.stunMs > previous.stunMs + 200) {
          context.effects.pushBurst(npc.x, npc.y - 12, "#fff3b8", timeMs, npc.role === "boss" ? 72 : 26, npc.role === "boss" ? "STAGGER" : "Stun");
          if (npc.role === "boss") {
            context.effects.push({ kind: "afterimpact", x: npc.x, y: npc.y + 8, color: "#fff3b8", coreColor: "#ffffff", accentColor: "#ffb36b", startedMs: timeMs, lifetimeMs: 900, size: 58, count: 12, ringCount: 4, intensity: 1.65 });
            context.impact?.push({
              actorId: npc.id,
              x: npc.x,
              y: npc.y,
              startedMs: timeMs,
              targetHoldMs: 125,
              attackerHoldMs: 0,
              shakeMs: 130,
              shakePx: 2.4,
              weight: "ultimate"
            });
          }
          context.sfx?.play("hit");
        }
        if (npc.castMs > previous.castMs + 100) {
          context.effects.push({ kind: "particle", x: npc.x, y: npc.y, color: impactColor(npc.impactType), startedMs: timeMs, lifetimeMs: 420, size: npc.role === "boss" ? 32 : 20 });
        }
        if (npc.attackCooldownMs > previous.attackCooldownMs + 140) pushNpcAttackEffect(npc, state, timeMs, false, context);
        if (npc.projectileCooldownMs > previous.projectileCooldownMs + 140) pushNpcAttackEffect(npc, state, timeMs, true, context);
      }
      previousNpcs.set(npc.id, snapshotNpc(npc));
    }
    for (const id of previousNpcs.keys()) if (!npcs[id]) previousNpcs.delete(id);

    const resources = state.resources ?? {};
    for (const id of Object.keys(resources)) {
      const node = resources[id];
      if (!node) continue;
      const previous = previousResources.get(node.id);
      if (previous) {
        if (node.hp < previous.hp) {
          context.effects.pushFloat(`-${previous.hp - node.hp}`, node.x, node.y - 24, node.kind === "ore" ? "#c8d0d8" : "#a9d88f", timeMs, 12);
          context.sfx?.play("gather");
        }
        if (!previous.depleted && node.depleted) {
          context.effects.pushBurst(node.x, node.y, node.kind === "ore" ? "#c8d0d8" : "#a9d88f", timeMs, 24);
          context.sfx?.play("loot");
        }
      }
      previousResources.set(node.id, snapshotResource(node));
    }
    for (const id of previousResources.keys()) if (!resources[id]) previousResources.delete(id);

    const loots = state.loots ?? {};
    for (const id of Object.keys(loots)) {
      const loot = loots[id];
      if (!loot) continue;
      if (!previousLoot.has(loot.id)) context.effects.pushBurst(loot.x, loot.y - 6, lootColor(loot), timeMs, 20, loot.itemId === "gold" ? "Gold" : "Loot");
      previousLoot.set(loot.id, snapshotLoot(loot));
    }
    for (const id of previousLoot.keys()) if (!loots[id]) previousLoot.delete(id);

    const hazards = state.hazards ?? {};
    for (const id of Object.keys(hazards)) {
      const hazard = hazards[id];
      if (!hazard) continue;
      if (!previousHazards.has(hazard.id)) {
        pushPlayerHazardSignal(hazard, state, timeMs, context);
        if (!CLIENT_OWNED_HAZARD_EFFECTS.has(hazard.effectKind)) {
          const color = hazardColor(hazard);
          context.effects.push({ kind: "particle", x: hazard.x, y: hazard.y, toX: hazard.toX, toY: hazard.toY, color, startedMs: timeMs, lifetimeMs: hazard.kind === "line" ? 620 : 520, size: hazard.kind === "line" ? 20 : 24 });
          if (hazard.kind === "line") context.effects.push({ kind: "beam", x: hazard.x, y: hazard.y, toX: hazard.toX, toY: hazard.toY, color, startedMs: timeMs, lifetimeMs: 280, size: 2 });
        }
      }
      previousHazards.add(hazard.id);
    }
    for (const id of previousHazards) if (!hazards[id]) previousHazards.delete(id);

    liveEffects.clear();
    for (const effect of state.effects ?? []) {
      if (!previousEffects.has(effect.id)) pushTransientProjectileSignal(effect, context);
      previousEffects.add(effect.id);
      liveEffects.add(effect.id);
    }
    for (const id of previousEffects) if (!liveEffects.has(id)) previousEffects.delete(id);
  }

  return { sync };
}
