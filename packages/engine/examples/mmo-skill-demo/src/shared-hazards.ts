import { type CollisionKernel } from "@hyperfocus/engine";
import { bestiaryFor } from "./data/bestiary.ts";
import { hasMmoStatusBit, mmoStatusBitmask } from "@hyperfocus/engine/mmo";
import { HAZARD_SIZE } from "./data/entity-sizes.ts";
import { PLAYER_ABILITY_DEFS } from "./shared-ability-catalog.ts";
import { clearActiveAbility, healPlayer, healPlayersNear } from "./shared-combat-player.ts";
import { PLAYER_DAMAGE_SOURCE_BITS, PLAYER_DAMAGE_SOURCE_MASK, damageNpc } from "./shared-combat-resolution.ts";
import { addEnergy, addTimedNpcFlag, applyNpcPoison, berserkFactor, hasTimedPlayerFlag, hostileNpcs, knockbackSourceForHazard, pointSegmentDistance } from "./shared-combat-state.ts";
import { type HazardEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "./shared-contracts.ts";
import { hasFactionReward } from "./shared-economy.ts";
import { acquireHazardEntity, acquireNpcEntity, entitiesOfType, entityTypeCount, pruneEntityTypeToMax, removeMmoEntityForReuse, snapshotEntitiesOfType } from "./shared-entity-registry.ts";
import { ensurePlayerCombatLoadout } from "./shared-loadout.ts";
import { moveNpcToward } from "./shared-npc-movement.ts";
import { hasGear, isPeaceNpc } from "./shared-progression.ts";
import { advancePlayerProjectile, playerProjectileDefFor } from "./shared-projectile-abilities.ts";
import { stableHash } from "./shared-quests.ts";
import { extendU16Ms, u16Ms } from "./shared-replication-projection.ts";
import { updateHazardScratch } from "./shared-runtime-contracts.ts";
import { applyKnockback, bodyRadius } from "./shared-world-physics.ts";
import { roleForKind, scaledNpcHp } from "./shared-world-runtime.ts";

function damagePlayer(
  player: PlayerEntity,
  amount: number,
  options: { source?: { id?: string; kind?: string; x: number; y: number; hp?: number; combatFlags?: string; slowMs?: number; stunMs?: number; attackCooldownMs?: number; effectKind?: string }; knockbackModifier?: number; isHeavyImpact?: boolean; armorPierce?: boolean } = {}
) {
  ensurePlayerCombatLoadout(player);
  if (player.iframeMs > 0) return;
  const sourceMask = mmoStatusBitmask(options.source?.combatFlags, PLAYER_DAMAGE_SOURCE_MASK);
  if (hasMmoStatusBit(sourceMask, PLAYER_DAMAGE_SOURCE_BITS.BLIND) && stableHash(`${player.id}:${options.source?.id ?? ""}:${Math.floor(player.activeMs + player.cooldownMs)}`) % 2 === 0) return;
  if (player.activeAbility === "twin-blade-dance" && stableHash(`${player.id}:dance:${Math.floor(player.activeMs / 100)}`) % 5 < 3) return;
  if (player.activeAbility === "wand-mirror-shield") {
    if (options.source && typeof options.source.hp === "number") options.source.hp = Math.max(0, options.source.hp - 18);
    player.iframeMs = Math.max(player.iframeMs, 180);
    player.castMs = Math.max(player.castMs, 120);
    clearActiveAbility(player);
    return;
  }
  if (player.activeAbility === "blade-riposte" && player.guardMs > 0) {
    const def = PLAYER_ABILITY_DEFS["blade-riposte"];
    player.guardMs = 0;
    player.iframeMs = Math.max(player.iframeMs, 180);
    player.castMs = Math.max(player.castMs, 100);
    if (options.source && typeof options.source.hp === "number") {
      options.source.hp = Math.max(0, options.source.hp - 22);
      if (typeof options.source.stunMs === "number") options.source.stunMs = Math.max(options.source.stunMs, 1200);
      if (typeof options.source.attackCooldownMs === "number") options.source.attackCooldownMs = extendU16Ms(options.source.attackCooldownMs, 600);
    }
    healPlayer(player, Math.max(1, Math.floor(player.maxHp * 0.1)));
    player.cooldowns.Q = u16Ms(Math.max(0, (player.cooldowns.Q ?? 0) - Math.floor(def.cooldownMs * 0.5)));
    addEnergy(player, def.energyGain);
    clearActiveAbility(player);
    return;
  }
  if (player.guardMs > 0) {
    player.guardMs = 0;
    player.iframeMs = Math.max(player.iframeMs, 120);
    player.castMs = Math.max(player.castMs, 100);
    player.hp = Math.min(player.maxHp, player.hp + Math.max(1, Math.floor(player.maxHp * 0.1)));
    addEnergy(player, PLAYER_ABILITY_DEFS["q-berserk"].energyGain);
    player.berserkMs = 3000;
    clearActiveAbility(player);
    return;
  }
  const sourceWeakened = hasMmoStatusBit(sourceMask, PLAYER_DAMAGE_SOURCE_BITS.WEAKENED) || hasMmoStatusBit(sourceMask, PLAYER_DAMAGE_SOURCE_BITS.ENFEEBLED) && (options.source?.slowMs ?? 0) > 0;
  const voidSource = options.source?.effectKind === "void" || options.source?.kind?.includes("void") || options.source?.id?.includes("void");
  const radiantReduced = voidSource && hasFactionReward(player, "aetheria-radiant-ward") ? amount * 0.85 : amount;
  const sourceReduced = sourceWeakened ? radiantReduced * 0.7 : radiantReduced;
  const bubbleReduced = player.activeAbility === "staff-arcane-bubble" ? sourceReduced * 0.75 : sourceReduced;
  const gearReduced = !options.armorPierce && hasGear(player, "iron-chest") ? bubbleReduced * 0.72 : bubbleReduced;
  const whirlwindReduced = player.activeAbility === "mace-whirlwind" ? gearReduced * 0.75 : gearReduced;
  const ironWillReduced = hasTimedPlayerFlag(player, "ironwill") ? whirlwindReduced * 0.7 : whirlwindReduced;
  const berserkReduced = ironWillReduced * (1 - 0.5 * berserkFactor(player));
  const reduced = Math.max(1, Math.floor(berserkReduced));
  player.hp = Math.max(0, player.hp - reduced);
  if (player.hp > 0 && player.hp <= player.maxHp * 0.25 && hasFactionReward(player, "ashwood-glade-feral-rage")) player.berserkMs = Math.max(player.berserkMs, 1500);
  if (options.source && options.knockbackModifier) applyKnockback(player, options.source, options.knockbackModifier, reduced, options.isHeavyImpact);
}

function addSummonedNpc(state: MmoSkillDemoState, owner: NpcEntity, index: number, kind = "prowling-wolf") {
  const id = `${owner.id}-${kind === "prowling-wolf" ? "w" : "s"}${index}`;
  if (state.npcs[id]) return;
  const bestiary = bestiaryFor(kind);
  const elite = roleForKind(kind) === "elite";
  const hp = scaledNpcHp(kind, kind === "alpha-timberwolf" ? 78 : 18, elite);
  const npc = acquireNpcEntity();
  npc.id = id;
  npc.kind = kind;
  npc.role = roleForKind(kind);
  npc.zoneId = owner.zoneId;
  npc.elite = elite;
  npc.personality = bestiary.personality;
  npc.impactType = bestiary.combat.impactType;
  npc.knockbackModifier = bestiary.combat.knockbackModifier;
  npc.x = owner.x + (index === 1 ? -34 : 34);
  npc.y = owner.y + 20;
  npc.spawnX = owner.x;
  npc.spawnY = owner.y;
  npc.hp = hp;
  npc.maxHp = hp;
  npc.respawnMs = 0;
  npc.attackCooldownMs = 700;
  npc.projectileCooldownMs = 1200;
  npc.phaseMs = 0;
  npc.summonedBy = owner.id;
  npc.knockbackX = 0;
  npc.knockbackY = 0;
  npc.knockbackMs = 0;
  npc.knockbackHeavy = false;
  npc.stunMs = 0;
  npc.slowMs = 0;
  npc.iframeMs = 0;
  npc.castMs = 0;
  npc.damageAmpMs = 0;
  npc.combatState = "";
  npc.combatFlags = "";
  npc.lastAttackStyle = "";
  state.npcs[id] = npc;
}

function spawnHazard(
  state: MmoSkillDemoState,
  owner: NpcEntity,
  target: PlayerEntity,
  kind: HazardEntity["kind"],
  damage: number,
  options: Partial<Pick<HazardEntity, "knockbackModifier" | "isHeavyImpact" | "armorPierce" | "effectKind" | "windupMs" | "lifetimeMs" | "radius">> = {}
) {
  const id = `${kind}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const dx = target.x - owner.x;
  const dy = target.y - owner.y;
  const length = Math.hypot(dx, dy) || 1;
  const range = owner.role === "boss" ? 190 : 150;
  const x = kind === "aoe" ? target.x : owner.x;
  const y = kind === "aoe" ? target.y : owner.y;
  const toX = kind === "aoe" ? target.x : owner.x + (dx / length) * range;
  const toY = kind === "aoe" ? target.y : owner.y + (dy / length) * range;
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = kind;
  hazard.zoneId = owner.zoneId;
  hazard.ownerId = owner.id;
  hazard.x = x;
  hazard.y = y;
  hazard.toX = toX;
  hazard.toY = toY;
  hazard.radius = options.radius ?? (kind === "aoe" ? (owner.role === "boss" ? HAZARD_SIZE.bossAoeRadius : HAZARD_SIZE.aoeRadius) : HAZARD_SIZE.lineWidth);
  hazard.windupMs = u16Ms(options.windupMs ?? (kind === "aoe" ? 850 : 520));
  hazard.lifetimeMs = u16Ms(options.lifetimeMs ?? (kind === "aoe" ? 620 : 360));
  hazard.damage = u16Ms(damage);
  hazard.knockbackModifier = options.knockbackModifier ?? bestiaryFor(owner.kind).combat.knockbackModifier;
  hazard.isHeavyImpact = options.isHeavyImpact ?? Boolean(bestiaryFor(owner.kind).combat.heavyImpact);
  hazard.armorPierce = options.armorPierce ?? false;
  hazard.effectKind = options.effectKind ?? (kind === "line" ? "dust" : bestiaryFor(owner.kind).combat.impactType);
  hazard.text = "";
  hazard.pulse = 0;
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 96);
}

function playerHazardInterval(effectKind: string) {
  if (effectKind === "arrowstorm") return 300;
  if (effectKind === "caltrops" || effectKind === "gravity" || effectKind === "consecrate" || effectKind === "meteor-burn" || effectKind === "noxious" || effectKind === "smoke") return 500;
  if (effectKind === "maelstrom") return 400;
  if (effectKind === "meteor") return 1000;
  return 400;
}

function playerWallBlocksHazard(state: MmoSkillDemoState, hazard: HazardEntity) {
  for (const wall of entitiesOfType(state, "hazard")) {
    if (wall.id === hazard.id || wall.effectKind !== "icewall" || !state.players[wall.ownerId] || wall.windupMs > 0) continue;
    if (wall.zoneId !== hazard.zoneId) continue;
    const startDistance = pointSegmentDistance(hazard.x, hazard.y, wall.x, wall.y, wall.toX, wall.toY);
    const endDistance = hazard.kind === "line" ? pointSegmentDistance(hazard.toX, hazard.toY, wall.x, wall.y, wall.toX, wall.toY) : startDistance;
    if (Math.min(startDistance, endDistance) <= wall.radius + Math.max(12, hazard.radius)) return true;
  }
  return false;
}

function updateHazards(state: MmoSkillDemoState, kernel: CollisionKernel, dt: number) {
  for (const hazard of snapshotEntitiesOfType(state, "hazard", updateHazardScratch)) {
    if (state.entities[hazard.id] !== hazard) continue;
    const ownerPlayer = state.players[hazard.ownerId];
    const previousWindup = hazard.windupMs;
    const ms = Math.max(0, Math.floor(dt * 1000));
    hazard.windupMs = u16Ms(hazard.windupMs - ms);
    if (ownerPlayer) {
      if (playerProjectileDefFor(hazard.effectKind)) {
        if (previousWindup <= 0) advancePlayerProjectile(state, kernel, ownerPlayer, hazard, dt);
        continue;
      }
      if (hazard.windupMs <= 0 && hazard.effectKind === "icewall") {
        for (const target of hostileNpcs(state, ownerPlayer)) {
          if (pointSegmentDistance(target.x, target.y, hazard.x, hazard.y, hazard.toX, hazard.toY) > hazard.radius + bodyRadius(target)) continue;
          target.slowMs = Math.max(target.slowMs ?? 0, 350);
          applyKnockback(target, { x: (hazard.x + hazard.toX) * 0.5, y: (hazard.y + hazard.toY) * 0.5 }, 0.22, 2, false);
        }
      }
      if (hazard.windupMs <= 0 && hazard.effectKind === "smoke") {
        hazard.pulse = u16Ms((hazard.pulse || 0) - ms);
        if (hazard.pulse <= 0) {
          hazard.pulse = playerHazardInterval(hazard.effectKind);
          for (const target of hostileNpcs(state, ownerPlayer)) {
            if (Math.hypot(target.x - hazard.x, target.y - hazard.y) > hazard.radius + bodyRadius(target)) continue;
            addTimedNpcFlag(target, "blind", 700);
          }
        }
      }
      if (hazard.windupMs <= 0 && hazard.damage > 0) {
        hazard.pulse = u16Ms((hazard.pulse || 0) - ms);
        if (hazard.pulse <= 0) {
          const interval = playerHazardInterval(hazard.effectKind);
          hazard.pulse = interval;
          for (const target of entitiesOfType(state, "npc")) {
            if (target.hp <= 0 || target.zoneId !== hazard.zoneId || isPeaceNpc(target) || target.kind === "player-decoy") continue;
            const distance =
              hazard.kind === "line"
                ? pointSegmentDistance(target.x, target.y, hazard.x, hazard.y, hazard.toX, hazard.toY)
                : Math.hypot(target.x - hazard.x, target.y - hazard.y);
            if (distance > hazard.radius + bodyRadius(target)) continue;
            if (hazard.effectKind === "gravity") moveNpcToward(kernel, target, { ...ownerPlayer, x: hazard.x, y: hazard.y }, 150, dt, true);
            damageNpc(state, kernel, ownerPlayer, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, isHeavyImpact: hazard.isHeavyImpact, ultimate: true });
            if (hazard.effectKind === "caltrops") target.slowMs = Math.max(target.slowMs ?? 0, 1000);
            if (hazard.effectKind === "arrowstorm") target.slowMs = Math.max(target.slowMs ?? 0, 650);
            if (hazard.effectKind === "gravity") target.slowMs = Math.max(target.slowMs ?? 0, 450);
            if (hazard.effectKind === "noxious") applyNpcPoison(target, 1, 4000);
          }
          if (hazard.effectKind === "consecrate") healPlayersNear(state, ownerPlayer, hazard.x, hazard.y, hazard.radius, 6);
        }
      }
      if (hazard.windupMs <= 0) hazard.lifetimeMs = u16Ms(hazard.lifetimeMs - ms);
      if (hazard.lifetimeMs <= 0) removeMmoEntityForReuse(state, hazard.id);
      continue;
    }
    if (playerWallBlocksHazard(state, hazard)) {
      removeMmoEntityForReuse(state, hazard.id);
      continue;
    }
    if (previousWindup > 0 && hazard.windupMs === 0 && hazard.pulse === 0) {
      for (const player of entitiesOfType(state, "player")) {
        if (player.hp <= 0 || player.zoneId !== hazard.zoneId) continue;
        const distance =
          hazard.kind === "line"
            ? pointSegmentDistance(player.x, player.y, hazard.x, hazard.y, hazard.toX, hazard.toY)
            : Math.hypot(player.x - hazard.x, player.y - hazard.y);
        if (distance <= hazard.radius + 12) {
          damagePlayer(player, hazard.damage, {
            source: knockbackSourceForHazard(hazard, state.npcs[hazard.ownerId]),
            knockbackModifier: hazard.knockbackModifier,
            isHeavyImpact: hazard.isHeavyImpact,
            armorPierce: hazard.armorPierce
          });
        }
      }
      hazard.pulse = 1;
    }
    if (hazard.windupMs <= 0) hazard.lifetimeMs = u16Ms(hazard.lifetimeMs - ms);
  if (hazard.lifetimeMs <= 0) removeMmoEntityForReuse(state, hazard.id);
  }
}

export {
  addSummonedNpc,
  damagePlayer,
  playerHazardInterval,
  playerWallBlocksHazard,
  spawnHazard,
  updateHazards
};
