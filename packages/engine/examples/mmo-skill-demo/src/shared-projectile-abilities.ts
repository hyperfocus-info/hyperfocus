import { type CollisionKernel } from "@hyperfocus/engine";
import { type AbilitySlot, MOVEMENT_DASHES, PLAYER_ABILITY_DEFS, type PlayerAbilityDef, type PlayerDashSpec } from "./shared-ability-catalog.ts";
import { abilityCastMs, beginActiveAbility, bowDecentDamage, bowHighDamage, bowMildDamage, clearActiveAbility, directionFromAim, firstLineHit, healPlayer, lineHits, moveActiveLinearDash, nearestHostileNearPoint, spawnBowLine, spawnPlayerEffectHazard } from "./shared-combat-player.ts";
import { damageNpc } from "./shared-combat-resolution.ts";
import { addCombatFlag, addEnergy, addPlayerCombatFlag, addTimedNpcFlag, aimPoint, consumePlayerFlagStack, dashDistanceForPmsps, finiteSegmentDistance, hostileNpcs, isHostileNpcForPlayer, npcFlagStacks, playerFlagStacks, pointSegmentDistance, setNpcFlagStacks, setPlayerFlagStacks } from "./shared-combat-state.ts";
import { type HazardEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type RuntimeInput } from "./shared-contracts.ts";
import { acquireHazardEntity, acquireNpcEntity, entitiesOfType, entityTypeCount, pruneEntityTypeToMax, removeMmoEntityForReuse } from "./shared-entity-registry.ts";
import { setSlotCooldown } from "./shared-loadout.ts";
import { isPeaceNpc } from "./shared-progression.ts";
import { stableHash } from "./shared-quests.ts";
import { clamp, u16Ms } from "./shared-replication-projection.ts";
import { BOW_ARROW_STORM_RADIUS, BOW_BOLAS_LINK_RANGE, BOW_BOLAS_RANGE, BOW_DECOY_TAUNT_RANGE, BOW_FLURRY_RANGE, BOW_FLURRY_VISUAL_STRIDE, BOW_PRECISION_RANGE, BOW_QUICK_RANGE, BOW_VAULT_RADIUS, BOW_VOLLEY_RANGE, CALTROPS_FULL_MAX_RANGE, CALTROPS_MIN_MAX_RANGE, PLAYER_RADIUS } from "./shared-world-catalog.ts";
import { bodyRadius, canOccupy } from "./shared-world-physics.ts";
import { mmoSkillDemoMap } from "./shared-world-runtime.ts";

const PLAYER_PROJECTILE_EFFECTS = ["arcane-bolt", "frost", "missile", "hex", "mend", "focused-ray", "chaos", "dirk", "knife", "noxious-flask", "razor"] as const;

type PlayerProjectileEffectKind = (typeof PLAYER_PROJECTILE_EFFECTS)[number];

type PlayerProjectileDef = { maxRange: number; travelMs: number; homingDegPerSec: number; pierce?: boolean; noTargetCollision?: boolean };

const PLAYER_PROJECTILE_DEFS: Record<PlayerProjectileEffectKind, PlayerProjectileDef> = {
  "arcane-bolt": { maxRange: 450, travelMs: 500, homingDegPerSec: 0 },
  frost: { maxRange: 400, travelMs: 500, homingDegPerSec: 420 },
  missile: { maxRange: 540, travelMs: 320, homingDegPerSec: 912 },
  hex: { maxRange: 600, travelMs: 1600, homingDegPerSec: 0 },
  mend: { maxRange: 700, travelMs: 1334, homingDegPerSec: 420 },
  "focused-ray": { maxRange: 600, travelMs: 100, homingDegPerSec: 0, pierce: true },
  chaos: { maxRange: 500, travelMs: 450, homingDegPerSec: 180 },
  dirk: { maxRange: 280, travelMs: 300, homingDegPerSec: 0 },
  knife: { maxRange: 275, travelMs: 300, homingDegPerSec: 0 },
  "noxious-flask": { maxRange: 350, travelMs: 600, homingDegPerSec: 0, noTargetCollision: true },
  razor: { maxRange: 550, travelMs: 600, homingDegPerSec: 0, pierce: true }
};

function playerProjectileDefFor(effectKind: string) {
  return isPlayerProjectileEffectKind(effectKind) ? PLAYER_PROJECTILE_DEFS[effectKind] : undefined;
}

function isPlayerProjectileEffectKind(effectKind: string): effectKind is PlayerProjectileEffectKind {
  return PLAYER_PROJECTILE_EFFECTS.some((candidate) => candidate === effectKind);
}

function playerProjectileMaxRange(effectKind: PlayerProjectileEffectKind, radius: number) {
  if (effectKind !== "razor") return PLAYER_PROJECTILE_DEFS[effectKind].maxRange;
  const ratio = clamp((radius - 45) / 35, 0.2, 1);
  return 350 + 200 * ratio;
}

function playerProjectileSpeed(hazard: HazardEntity, def: PlayerProjectileDef, effectKind: PlayerProjectileEffectKind) {
  return playerProjectileMaxRange(effectKind, hazard.radius) / Math.max(0.001, def.travelMs / 1000);
}

function spawnPlayerProjectileTravelTrace(state: MmoSkillDemoState, player: PlayerEntity, effectKind: PlayerProjectileEffectKind, fromX: number, fromY: number, toX: number, toY: number, width: number, lifetimeMs: number) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  if (distance < 8) return;
  spawnPlayerEffectHazard(state, player, "line", fromX, fromY, toX, toY, Math.max(4, width), effectKind, lifetimeMs);
}

function normalizedDirection(dx: number, dy: number) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function rotateDirectionToward(current: { x: number; y: number }, target: { x: number; y: number }, maxRadians: number) {
  const currentAngle = Math.atan2(current.y, current.x);
  const targetAngle = Math.atan2(target.y, target.x);
  const delta = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle));
  const nextAngle = currentAngle + clamp(delta, -maxRadians, maxRadians);
  return { x: Math.cos(nextAngle), y: Math.sin(nextAngle) };
}

function projectileHasHit(hazard: HazardEntity, targetId: string) {
  return `|${hazard.combatFlags ?? ""}|`.includes(`|${targetId}|`);
}

function markProjectileHit(hazard: HazardEntity, targetId: string) {
  hazard.combatFlags = hazard.combatFlags ? `${hazard.combatFlags}|${targetId}` : targetId;
}

function projectileTarget(state: MmoSkillDemoState, owner: PlayerEntity, hazard: HazardEntity, def: PlayerProjectileDef) {
  const current = hazard.targetId ? state.npcs[hazard.targetId] : undefined;
  if (current && isHostileNpcForPlayer(current, owner)) return current;
  if (def.homingDegPerSec <= 0) return undefined;
  const next = hostileNpcs(state, owner)
    .filter((target) => Math.hypot(target.x - hazard.x, target.y - hazard.y) <= 240 + bodyRadius(target))
    .sort((a, b) => Math.hypot(a.x - hazard.x, a.y - hazard.y) - Math.hypot(b.x - hazard.x, b.y - hazard.y))[0];
  hazard.targetId = next?.id ?? "";
  return next;
}

function spawnPlayerProjectile(
  state: MmoSkillDemoState,
  player: PlayerEntity,
  effectKind: PlayerProjectileEffectKind,
  options: {
    dx: number;
    dy: number;
    width: number;
    damage: number;
    knockbackModifier: number;
    targetId?: string;
    travelDistance?: number;
    charged?: boolean;
    isHeavyImpact?: boolean;
    armorPierce?: boolean;
  }
) {
  const def = PLAYER_PROJECTILE_DEFS[effectKind];
  const direction = normalizedDirection(options.dx, options.dy);
  const maxRange = playerProjectileMaxRange(effectKind, options.width);
  const travelDistance = clamp(options.travelDistance ?? maxRange, 1, maxRange);
  const previewDistance = Math.min(travelDistance, clamp(maxRange * 0.35, 90, 180));
  const startX = player.x + direction.x * 10;
  const startY = player.y + direction.y * 10;
  spawnPlayerProjectileTravelTrace(
    state,
    player,
    effectKind,
    startX,
    startY,
    startX + direction.x * previewDistance,
    startY + direction.y * previewDistance,
    options.width,
    clamp(def.travelMs * 0.72, 260, 420)
  );
  const id = `${effectKind}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = "line";
  hazard.zoneId = player.zoneId;
  hazard.ownerId = player.id;
  hazard.targetId = options.targetId ?? "";
  hazard.x = startX;
  hazard.y = startY;
  hazard.aimX = direction.x;
  hazard.aimY = direction.y;
  hazard.toX = startX;
  hazard.toY = startY;
  hazard.radius = u16Ms(options.width);
  hazard.windupMs = 1;
  hazard.lifetimeMs = u16Ms(Math.ceil((travelDistance / maxRange) * def.travelMs));
  hazard.damage = u16Ms(options.damage);
  hazard.knockbackModifier = options.knockbackModifier;
  hazard.isHeavyImpact = options.isHeavyImpact ?? false;
  hazard.armorPierce = options.armorPierce ?? false;
  hazard.effectKind = effectKind;
  hazard.text = "";
  hazard.combatState = "player-projectile";
  hazard.combatFlags = "";
  hazard.pulse = options.charged ? 1 : 0;
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 180);
}

function healMendingSparkAlly(state: MmoSkillDemoState, player: PlayerEntity) {
  const ally = Array.from(entitiesOfType(state, "player"))
    .filter((candidate) => candidate.zoneId === player.zoneId && candidate.hp > 0 && candidate.hp < candidate.maxHp && Math.hypot(candidate.x - player.x, candidate.y - player.y) <= 200)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? player;
  healPlayer(ally, 5);
}

function applyFrostChainImpact(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, hazard: HazardEntity, first: NpcEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-frost-chain"];
  const visited = new Set<string>();
  let current: NpcEntity | undefined = first;
  let fromX = hazard.x;
  let fromY = hazard.y;
  for (let bounce = 0; current && bounce < 4; bounce += 1) {
    visited.add(current.id);
    spawnPlayerEffectHazard(state, player, "line", fromX, fromY, current.x, current.y, 8, "frost", 420);
    damageNpc(state, kernel, player, current, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: bounce === 0 ? def.energyGain : 0 });
    current.slowMs = Math.max(current.slowMs ?? 0, 1500);
    fromX = current.x;
    fromY = current.y;
    current = nearestHostileNearPoint(state, player, fromX, fromY, 180, visited);
  }
}

function applyPlayerProjectileImpact(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, hazard: HazardEntity, target: NpcEntity) {
  if (!isPlayerProjectileEffectKind(hazard.effectKind)) return true;
  switch (hazard.effectKind) {
    case "arcane-bolt":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["staff-arcane-bolt"].energyGain });
      return true;
    case "frost":
      applyFrostChainImpact(state, kernel, player, hazard, target);
      return true;
    case "missile":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-magic-missile"].energyGain });
      return true;
    case "hex":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-hex"].energyGain })) {
        setNpcFlagStacks(target, "hex", Math.min(3, npcFlagStacks(target, "hex") + 1));
        target.damageAmpMs = Math.max(target.damageAmpMs, 3000);
      }
      return true;
    case "mend":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-mending-spark"].energyGain });
      healMendingSparkAlly(state, player);
      return true;
    case "focused-ray":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-focused-ray"].energyGain });
      return false;
    case "chaos":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, ultimate: true });
      return true;
    case "dirk":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["twin-throwing-dirk"].energyGain })) {
        target.slowMs = Math.max(target.slowMs ?? 0, 2000);
      }
      return true;
    case "knife":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["twin-fan-of-knives"].energyGain })) {
        addTimedNpcFlag(target, "antiheal", 2500);
      }
      return true;
    case "razor":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["blade-razor-wind"].energyGain }) && hazard.pulse > 0) {
        target.slowMs = Math.max(target.slowMs ?? 0, 2000);
      }
      return false;
    default:
      return true;
  }
}

function expirePlayerProjectile(state: MmoSkillDemoState, player: PlayerEntity, hazard: HazardEntity) {
  if (hazard.effectKind === "noxious-flask") {
    spawnPlayerPersistentHazard(state, player, "noxious", hazard.x, hazard.y, 100, hazard.damage, 4000, "noxious", 0);
    spawnPlayerEffectHazard(state, player, "aoe", hazard.x, hazard.y, hazard.x, hazard.y, 100, "noxious", 760);
  } else if (hazard.effectKind === "mend") {
    healMendingSparkAlly(state, player);
  }
  removeMmoEntityForReuse(state, hazard.id);
}

function advancePlayerProjectile(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, hazard: HazardEntity, dt: number) {
  const effectKind = hazard.effectKind;
  if (!isPlayerProjectileEffectKind(effectKind)) return false;
  const def = PLAYER_PROJECTILE_DEFS[effectKind];
  const ms = Math.min(hazard.lifetimeMs, Math.max(0, Math.floor(dt * 1000)));
  if (ms <= 0) return true;
  let direction = normalizedDirection(hazard.aimX ?? hazard.toX - hazard.x, hazard.aimY ?? hazard.toY - hazard.y);
  const target = projectileTarget(state, player, hazard, def);
  if (target && def.homingDegPerSec > 0) {
    direction = rotateDirectionToward(direction, normalizedDirection(target.x - hazard.x, target.y - hazard.y), (def.homingDegPerSec * Math.PI / 180) * (ms / 1000));
  }
  const fromX = hazard.x;
  const fromY = hazard.y;
  const step = playerProjectileSpeed(hazard, def, effectKind) * (ms / 1000);
  hazard.x = clamp(hazard.x + direction.x * step, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
  hazard.y = clamp(hazard.y + direction.y * step, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
  hazard.toX = fromX;
  hazard.toY = fromY;
  hazard.aimX = direction.x;
  hazard.aimY = direction.y;
  hazard.lifetimeMs = u16Ms(hazard.lifetimeMs - ms);

  if (!def.noTargetCollision) {
    const hits = hostileNpcs(state, player)
      .map((candidate) => ({ target: candidate, segment: finiteSegmentDistance(candidate.x, candidate.y, fromX, fromY, hazard.x, hazard.y) }))
      .filter((entry) => !projectileHasHit(hazard, entry.target.id) && entry.segment.distance <= hazard.radius + bodyRadius(entry.target))
      .sort((a, b) => a.segment.along - b.segment.along);
    for (const hit of hits) {
      markProjectileHit(hazard, hit.target.id);
      if (applyPlayerProjectileImpact(state, kernel, player, hazard, hit.target)) {
        spawnPlayerProjectileTravelTrace(state, player, effectKind, fromX, fromY, hit.target.x, hit.target.y, hazard.radius, 360);
        removeMmoEntityForReuse(state, hazard.id);
        return true;
      }
      if (!def.pierce) break;
    }
  }

  if (hazard.lifetimeMs <= 0) expirePlayerProjectile(state, player, hazard);
  return true;
}

function quickShotDamage(player: PlayerEntity) {
  const base = Math.max(1, Math.floor(bowMildDamage(player) * 0.8));
  if (!consumePlayerFlagStack(player, "bow-empower")) return base;
  return Math.floor(base * 2);
}

function fireQuickShot(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-quick-shot"];
  const hit = firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, BOW_QUICK_RANGE, 10);
  player.action = "lmb";
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, BOW_QUICK_RANGE, 9, "arrow", 1000);
  if (hit) damageNpc(state, kernel, player, hit.target, quickShotDamage(player), { knockbackModifier: 0.35, energyGain: def.energyGain });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function firePrecisionShot(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-precision"];
  const hits = lineHits(state, player, player.abilityVectorX, player.abilityVectorY, BOW_PRECISION_RANGE, 14);
  player.action = "rmb";
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, BOW_PRECISION_RANGE, 13, "piercearrow", 250);
  for (const hit of hits) {
    damageNpc(state, kernel, player, hit.target, Math.floor(bowHighDamage(player) * 1.1), { knockbackModifier: 2.64, isHeavyImpact: true, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireVolley(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-volley"];
  const baseAngle = Math.atan2(player.abilityVectorY, player.abilityVectorX);
  const damageByTarget = new Map<string, number>();
  player.action = "rmb";
  for (let i = 0; i < 7; i += 1) {
    const angle = baseAngle - (35 * Math.PI) / 180 + ((70 * Math.PI) / 180) * (i / 6);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    spawnBowLine(state, player, dx, dy, BOW_VOLLEY_RANGE, 8, "arrow", 1000);
    const hit = firstLineHit(state, player, dx, dy, BOW_VOLLEY_RANGE, 9);
    if (!hit) continue;
    const previous = damageByTarget.get(hit.target.id) ?? 0;
    const scale = previous === 0 ? 1 : 0.25;
    damageByTarget.set(hit.target.id, previous + 1);
    damageNpc(state, kernel, player, hit.target, Math.floor(bowMildDamage(player) * 1.4 * scale), { knockbackModifier: 0.5, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function dashDirectionFromMovementOrAim(player: PlayerEntity, input: RuntimeInput) {
  const moveLength = Math.hypot(input.dx, input.dy);
  if (moveLength > 0.05) return { x: input.dx / moveLength, y: input.dy / moveLength };
  const direction = directionFromAim(player, input);
  return { x: direction.x, y: direction.y };
}

function beginBowReposition(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  const dash = MOVEMENT_DASHES["bow-reposition"];
  beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + dash.durationMs);
  const direction = dashDirectionFromMovementOrAim(player, input);
  player.abilityVectorX = direction.x;
  player.abilityVectorY = direction.y;
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  player.iframeMs = Math.max(player.iframeMs, abilityCastMs(player, def.castMs) + dash.durationMs);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
}

function beginBowVault(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  const dash = MOVEMENT_DASHES["bow-vault"];
  beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + dash.durationMs);
  const direction = directionFromAim(player, input);
  player.abilityVectorX = -direction.x;
  player.abilityVectorY = -direction.y;
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  player.iframeMs = Math.max(player.iframeMs, 480);
  setSlotCooldown(player, slot, def.cooldownMs);
}

function moveBowDash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number, castMs: number, spec: PlayerDashSpec) {
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, spec.durationMs, dashDistanceForPmsps(player, spec), spec.effectKind ?? "rushdust");
}

function finishBowVault(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  player.action = "space";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, BOW_VAULT_RADIUS, "dust", 420);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > BOW_VAULT_RADIUS + bodyRadius(target)) continue;
    damageNpc(state, kernel, player, target, bowMildDamage(player), { knockbackModifier: 0.8, energyGain: PLAYER_ABILITY_DEFS["bow-vault"].energyGain });
  }
  clearActiveAbility(player);
}

function applyBowStealth(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  addPlayerCombatFlag(player, "stealth");
  player.damageAmpMs = Math.max(player.damageAmpMs, 3000);
  player.iframeMs = Math.max(player.iframeMs, 120);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function spawnPlayerDecoy(state: MmoSkillDemoState, player: PlayerEntity) {
  const id = `${player.id}-decoy-${state.tick}`.slice(0, 32);
  const existing = Array.from(entitiesOfType(state, "npc")).find((npc) => npc.kind === "player-decoy" && npc.summonedBy === player.id && npc.hp > 0);
  if (existing) existing.hp = 0;
  const decoy = acquireNpcEntity();
  decoy.id = id;
  decoy.kind = "player-decoy";
  decoy.role = "decoy";
  decoy.zoneId = player.zoneId;
  decoy.elite = false;
  decoy.personality = "passive";
  decoy.impactType = "dust";
  decoy.knockbackModifier = 0;
  decoy.x = player.x;
  decoy.y = player.y;
  decoy.spawnX = player.x;
  decoy.spawnY = player.y;
  decoy.hp = 24;
  decoy.maxHp = 24;
  decoy.respawnMs = 3500;
  decoy.attackCooldownMs = 0;
  decoy.projectileCooldownMs = 0;
  decoy.phaseMs = 0;
  decoy.summonedBy = player.id;
  decoy.knockbackX = 0;
  decoy.knockbackY = 0;
  decoy.knockbackMs = 0;
  decoy.knockbackHeavy = false;
  decoy.stunMs = 0;
  decoy.iframeMs = 0;
  decoy.castMs = 0;
  decoy.damageAmpMs = 0;
  decoy.combatState = "";
  decoy.combatFlags = "";
  decoy.lastAttackStyle = "";
  state.npcs[id] = decoy;
  addEnergy(player, PLAYER_ABILITY_DEFS["bow-decoy"].energyGain);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, BOW_DECOY_TAUNT_RANGE, "dust", 420);
}

function explodePlayerDecoy(state: MmoSkillDemoState, kernel: CollisionKernel, owner: PlayerEntity, decoy: NpcEntity) {
  spawnPlayerEffectHazard(state, owner, "aoe", decoy.x, decoy.y, decoy.x, decoy.y, 150, "spark", 520);
  for (const target of entitiesOfType(state, "npc")) {
    if (target.hp <= 0 || target.zoneId !== decoy.zoneId || isPeaceNpc(target) || target.kind === "player-decoy") continue;
    if (Math.hypot(target.x - decoy.x, target.y - decoy.y) > 150 + bodyRadius(target)) continue;
    damageNpc(state, kernel, owner, target, bowDecentDamage(owner), { knockbackModifier: 1.1, energyGain: PLAYER_ABILITY_DEFS["bow-decoy"].energyGain });
  }
}

function fireBolas(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-bolas"];
  const primary = firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, BOW_BOLAS_RANGE, 48);
  player.action = "e";
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, BOW_BOLAS_RANGE, 48, "root", 1500);
  if (primary) {
    damageNpc(state, kernel, player, primary.target, bowMildDamage(player), { knockbackModifier: 0.4, energyGain: def.energyGain });
    const startX = primary.target.x;
    const startY = primary.target.y;
    const endX = startX + player.abilityVectorX * BOW_BOLAS_LINK_RANGE;
    const endY = startY + player.abilityVectorY * BOW_BOLAS_LINK_RANGE;
    const secondary = hostileNpcs(state, player).filter((target) => target.id !== primary.target.id && pointSegmentDistance(target.x, target.y, startX, startY, endX, endY) <= 52 + bodyRadius(target));
    const hitTerrain = !canOccupy(kernel, endX, endY, PLAYER_RADIUS);
    const linked = secondary.length > 0 || hitTerrain;
    if (linked) {
      primary.target.stunMs = Math.max(primary.target.stunMs, 1500);
      primary.target.damageAmpMs = Math.max(primary.target.damageAmpMs, 1500);
      addCombatFlag(primary.target, "bow-vulnerable");
      for (const target of secondary) {
        damageNpc(state, kernel, player, target, Math.floor(bowMildDamage(player) * 0.7), { knockbackModifier: 0.2, energyGain: 0 });
        target.stunMs = Math.max(target.stunMs, 1500);
        target.damageAmpMs = Math.max(target.damageAmpMs, 1500);
        addCombatFlag(target, "bow-vulnerable");
      }
    } else {
      primary.target.slowMs = Math.max(primary.target.slowMs ?? 0, 1000);
    }
  }
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function spawnPlayerPersistentHazard(state: MmoSkillDemoState, player: PlayerEntity, idPrefix: string, x: number, y: number, radius: number, damage: number, lifetimeMs: number, effectKind: string, pulse = 0) {
  const id = `${idPrefix}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = "aoe";
  hazard.zoneId = player.zoneId;
  hazard.ownerId = player.id;
  hazard.x = x;
  hazard.y = y;
  hazard.toX = x;
  hazard.toY = y;
  hazard.radius = u16Ms(radius);
  hazard.windupMs = 0;
  hazard.lifetimeMs = u16Ms(lifetimeMs);
  hazard.damage = u16Ms(damage);
  hazard.knockbackModifier = 0;
  hazard.isHeavyImpact = false;
  hazard.armorPierce = false;
  hazard.effectKind = effectKind.slice(0, 16);
  hazard.text = "";
  hazard.pulse = u16Ms(pulse);
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 180);
}

function spawnPlayerTimedHazard(
  state: MmoSkillDemoState,
  player: PlayerEntity,
  idPrefix: string,
  x: number,
  y: number,
  radius: number,
  damage: number,
  lifetimeMs: number,
  effectKind: string,
  windupMs = 0,
  pulse = 0,
  toX = x,
  toY = y,
  kind: HazardEntity["kind"] = "aoe"
) {
  const id = `${idPrefix}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = kind;
  hazard.zoneId = player.zoneId;
  hazard.ownerId = player.id;
  hazard.x = x;
  hazard.y = y;
  hazard.toX = toX;
  hazard.toY = toY;
  hazard.radius = u16Ms(radius);
  hazard.windupMs = u16Ms(windupMs);
  hazard.lifetimeMs = u16Ms(lifetimeMs);
  hazard.damage = u16Ms(damage);
  hazard.knockbackModifier = 0;
  hazard.isHeavyImpact = false;
  hazard.armorPierce = false;
  hazard.effectKind = effectKind.slice(0, 16);
  hazard.text = "";
  hazard.pulse = u16Ms(pulse);
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 180);
}

function throwCaltrops(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-caltrops"];
  const ratio = clamp(player.chargeMs / 1000, 0, 1);
  const maxRange = CALTROPS_MIN_MAX_RANGE + ratio * (CALTROPS_FULL_MAX_RANGE - CALTROPS_MIN_MAX_RANGE);
  const centerRange = Math.max(36, maxRange * 0.54);
  const x = clamp(player.x + player.abilityVectorX * centerRange, 16, mmoSkillDemoMap.pixelWidth - 16);
  const y = clamp(player.y + player.abilityVectorY * centerRange, 16, mmoSkillDemoMap.pixelHeight - 16);
  const radius = Math.max(42, maxRange * 0.36);
  player.action = "e";
  spawnPlayerPersistentHazard(state, player, "caltrops", x, y, radius, Math.max(1, Math.floor(bowMildDamage(player) * 0.32)), 5200, "caltrops", 0);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function spawnArrowStorm(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["bow-arrowstorm"];
  const aim = aimPoint(player, input);
  spawnPlayerPersistentHazard(state, player, "arrowstorm", aim.x, aim.y, BOW_ARROW_STORM_RADIUS, bowMildDamage(player), 3000, "arrowstorm", 0);
  setSlotCooldown(player, "R", def.cooldownMs);
  clearActiveAbility(player);
}

function tickFlurry(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["bow-flurry"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 166 && player.activeMs < player.activeDurationMs) {
    player.abilityTickMs -= 166;
    const index = playerFlagStacks(player, "flurry");
    setPlayerFlagStacks(player, "flurry", index + 1);
    const spread = ((((stableHash(`${player.id}:${player.activeMs}:${index}`) % 1000) / 1000) - 0.5) * Math.PI) / 14;
    const angle = Math.atan2(player.abilityVectorY, player.abilityVectorX) + spread;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    if (index % BOW_FLURRY_VISUAL_STRIDE === 0) spawnBowLine(state, player, dx, dy, BOW_FLURRY_RANGE, 7, "arrow", 420);
    const hit = firstLineHit(state, player, dx, dy, BOW_FLURRY_RANGE, 8);
    if (hit) damageNpc(state, kernel, player, hit.target, bowMildDamage(player), { knockbackModifier: 0.01, energyGain: 0, ultimate: true });
  }
}

export {
  PLAYER_PROJECTILE_DEFS,
  PLAYER_PROJECTILE_EFFECTS,
  advancePlayerProjectile,
  applyBowStealth,
  applyFrostChainImpact,
  applyPlayerProjectileImpact,
  beginBowReposition,
  beginBowVault,
  dashDirectionFromMovementOrAim,
  expirePlayerProjectile,
  explodePlayerDecoy,
  finishBowVault,
  fireBolas,
  firePrecisionShot,
  fireQuickShot,
  fireVolley,
  healMendingSparkAlly,
  markProjectileHit,
  moveBowDash,
  normalizedDirection,
  playerProjectileDefFor,
  playerProjectileMaxRange,
  playerProjectileSpeed,
  projectileHasHit,
  projectileTarget,
  quickShotDamage,
  rotateDirectionToward,
  spawnArrowStorm,
  spawnPlayerDecoy,
  spawnPlayerPersistentHazard,
  spawnPlayerProjectile,
  spawnPlayerProjectileTravelTrace,
  spawnPlayerTimedHazard,
  throwCaltrops,
  tickFlurry
};

export type {
  PlayerProjectileDef,
  PlayerProjectileEffectKind
};
