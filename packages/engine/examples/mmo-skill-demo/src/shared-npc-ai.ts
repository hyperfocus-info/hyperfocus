import { type CollisionKernel } from "@hyperfocus/engine";
import { bestiaryFor } from "./data/bestiary.ts";
import { attackStyleForAction, combatFlagValue, damagedHostileNear, findNearest, hasCombatFlag, hasPlayerCombatFlag, npcFlagStacks, removeCombatFlag, setNpcFlagStacks, shouldNpcIgnorePlayerForFaction } from "./shared-combat-state.ts";
import { type HazardEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "./shared-contracts.ts";
import { MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED, acquireNpcEntity, entitiesOfType, removeMmoEntityForReuse, snapshotEntitiesOfType } from "./shared-entity-registry.ts";
import { addSummonedNpc, spawnHazard } from "./shared-hazards.ts";
import { moveNpcBy, moveNpcToward, npcSpeedScale } from "./shared-npc-movement.ts";
import { spawnRadialHazards, updateBossMinigames } from "./shared-npc-boss-mechanics.ts";
import { isPeaceNpc } from "./shared-progression.ts";
import { explodePlayerDecoy } from "./shared-projectile-abilities.ts";
import { stableHash } from "./shared-quests.ts";
import { clamp, u16Ms, u32Ms } from "./shared-replication-projection.ts";
import { type ZoneRuntime, updateNpcScratch } from "./shared-runtime-contracts.ts";
import { BOW_DECOY_TAUNT_RANGE, PLAYER_RADIUS } from "./shared-world-catalog.ts";
import { applyKnockback, canOccupy, decayCombatTimers, rectAround, updateKnockback } from "./shared-world-physics.ts";
import { STRONG_PHASE_INVULN_END_MS, STRONG_PHASE_INVULN_START_MS, isNpcBuffed, isNpcInvulnerable, isStrongEnemy, mmoSkillDemoMap, npcAggroRadius, npcPhaseLength, roleForKind, scaledNpcHp } from "./shared-world-runtime.ts";

const PASSIVE_NPC_PATROLS: Record<string, { radiusX: number; radiusY: number; speed: number; phase: number }> = {
  "elder-rowan": { radiusX: 18, radiusY: 10, speed: 18, phase: 0.1 },
  "blacksmith-silas": { radiusX: 12, radiusY: 16, speed: 16, phase: 1.6 },
  "miller-finn": { radiusX: 24, radiusY: 8, speed: 22, phase: 2.1 },
  "scout-elara": { radiusX: 28, radiusY: 18, speed: 28, phase: 0.8 },
  "overseer-bale": { radiusX: 20, radiusY: 14, speed: 18, phase: 3.4 },
  "geologist-mira": { radiusX: 16, radiusY: 22, speed: 17, phase: 4.2 },
  "runner-kael": { radiusX: 30, radiusY: 12, speed: 31, phase: 0.4 },
  "high-arcanist-vael": { radiusX: 26, radiusY: 18, speed: 15, phase: 2.8 },
  "navigator-kai": { radiusX: 22, radiusY: 16, speed: 21, phase: 5.1 },
  "alchemist-zora": { radiusX: 14, radiusY: 18, speed: 15, phase: 1.2 },
  "foreman-iron-will": { radiusX: 18, radiusY: 10, speed: 17, phase: 3.1 },
  "banker-valerius": { radiusX: 12, radiusY: 10, speed: 14, phase: 4.8 },
  "merchant-kaya": { radiusX: 34, radiusY: 16, speed: 24, phase: 2.4 },
  "master-kael": { radiusX: 18, radiusY: 18, speed: 18, phase: 0.6 },
  "captain-marrow": { radiusX: 20, radiusY: 12, speed: 19, phase: 5.6 },
  blacksmith: { radiusX: 10, radiusY: 14, speed: 13, phase: 1.9 },
  "apprentice-jinn": { radiusX: 20, radiusY: 14, speed: 20, phase: 2.9 },
  "innkeeper-martha": { radiusX: 14, radiusY: 12, speed: 13, phase: 4.4 }
};

function updatePassiveNpc(state: MmoSkillDemoState, kernel: CollisionKernel, npc: NpcEntity, dt: number) {
  if (npc.kind === "contract-board" || npc.kind === "cursed-statue") return;
  for (const player of entitiesOfType(state, "player")) {
    if (player.escortNpcId === npc.id) return;
  }
  const patrol = PASSIVE_NPC_PATROLS[npc.kind];
  if (!patrol) return;
  const t = (npc.phaseMs / npcPhaseLength(npc)) * Math.PI * 2 + patrol.phase;
  const targetX = npc.spawnX + Math.cos(t) * patrol.radiusX;
  const targetY = npc.spawnY + Math.sin(t * 0.72) * patrol.radiusY;
  const dx = targetX - npc.x;
  const dy = targetY - npc.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const step = Math.min(distance, patrol.speed * dt);
  const nextX = npc.x + (dx / distance) * step;
  const nextY = npc.y + (dy / distance) * step;
  if (canOccupy(kernel, nextX, npc.y, 10)) npc.x = nextX;
  if (canOccupy(kernel, npc.x, nextY, 10)) npc.y = nextY;
}

function moveNpcAway(kernel: CollisionKernel, npc: NpcEntity, target: PlayerEntity, speed: number, dt: number, ignoreTerrain = false) {
  const move = kernel.vecNormalize(npc.x - target.x, npc.y - target.y);
  const beforeX = npc.x;
  const beforeY = npc.y;
  const scaled = speed * npcSpeedScale(npc);
  moveNpcBy(kernel, npc, move.x * scaled * dt, move.y * scaled * dt, ignoreTerrain);
  return Math.hypot(npc.x - beforeX, npc.y - beforeY) > 0.2;
}

function circleNpcAround(kernel: CollisionKernel, npc: NpcEntity, target: PlayerEntity, speed: number, dt: number) {
  const dx = target.x - npc.x;
  const dy = target.y - npc.y;
  const distance = Math.hypot(dx, dy) || 1;
  const toward = distance > 98 ? 0.35 : distance < 72 ? -0.35 : 0;
  const strafeSign = stableHash(npc.id) % 2 === 0 ? 1 : -1;
  const vx = (-dy / distance) * strafeSign + (dx / distance) * toward;
  const vy = (dx / distance) * strafeSign + (dy / distance) * toward;
  const length = Math.hypot(vx, vy) || 1;
  const scaled = speed * npcSpeedScale(npc);
  moveNpcBy(kernel, npc, (vx / length) * scaled * dt, (vy / length) * scaled * dt);
}

function npcProfile(npc: NpcEntity) {
  return bestiaryFor(npc.kind).combat;
}

function npcPersonality(npc: NpcEntity) {
  return bestiaryFor(npc.kind).personality;
}

function heavyKbm(npc: NpcEntity) {
  return npcProfile(npc).heavyKnockbackModifier ?? npcProfile(npc).knockbackModifier;
}

function npcMeleeReach(npc: NpcEntity) {
  const profile = npcProfile(npc);
  if (npc.role === "boss") return 58;
  if (npc.elite || npc.role === "elite") return 50;
  if (profile.class === "bruiser") return 48;
  if (profile.class === "nimble") return 44;
  return 42;
}

function npcMeleeDamage(npc: NpcEntity, buffed: boolean) {
  const profile = npcProfile(npc);
  const base =
    npc.role === "boss"
      ? 12
      : npc.elite || npc.role === "elite" || profile.class === "elite"
        ? 9
        : profile.class === "bruiser"
          ? 7
          : profile.class === "nimble"
            ? 5
            : 4;
  return base + (buffed ? 3 : 0);
}

function npcCastDurationMs(npc: NpcEntity, requestedMs?: number, heavy = false) {
  const profile = npcProfile(npc);
  const classBonus = profile.class === "boss" ? 520 : profile.class === "elite" ? 300 : profile.class === "bruiser" ? 220 : profile.class === "nimble" ? 80 : 0;
  const weightBonus = heavy || profile.heavyImpact || npc.elite || npc.role === "boss" ? 180 : 0;
  return clamp(Math.floor(requestedMs ?? profile.precastMs ?? 240) + classBonus + weightBonus, 200, 1400);
}

function leapNpcTowardTarget(kernel: CollisionKernel, npc: NpcEntity, target: PlayerEntity, maxDistance: number, stopDistance: number, ignoreTerrain = false) {
  const distance = Math.hypot(target.x - npc.x, target.y - npc.y);
  if (distance <= stopDistance) return distance;
  const move = kernel.vecNormalize(target.x - npc.x, target.y - npc.y);
  const travel = Math.min(maxDistance, Math.max(0, distance - stopDistance));
  moveNpcBy(kernel, npc, move.x * travel, move.y * travel, ignoreTerrain);
  return Math.hypot(target.x - npc.x, target.y - npc.y);
}

function spawnNpcDirectHitMarker(
  state: MmoSkillDemoState,
  npc: NpcEntity,
  target: PlayerEntity,
  damage: number,
  castMs = npcCastDurationMs(npc),
  options: Partial<Pick<HazardEntity, "knockbackModifier" | "isHeavyImpact" | "armorPierce" | "effectKind">> = {}
) {
  spawnHazard(state, npc, target, "aoe", damage, {
    knockbackModifier: options.knockbackModifier ?? heavyKbm(npc),
    isHeavyImpact: options.isHeavyImpact ?? (npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact)),
    armorPierce: options.armorPierce ?? false,
    effectKind: options.effectKind ?? npcProfile(npc).impactType,
    radius: npc.role === "boss" ? 46 : npc.elite ? 34 : 26,
    windupMs: castMs,
    lifetimeMs: castMs + 360
  });
}

function npcDirectHit(state: MmoSkillDemoState, npc: NpcEntity, target: PlayerEntity, damage: number, options: { castMs?: number; cooldownMs?: number; knockbackModifier?: number; isHeavyImpact?: boolean; armorPierce?: boolean; effectKind?: string } = {}) {
  const castMs = npcCastDurationMs(npc, options.castMs, options.isHeavyImpact);
  const isHeavyImpact = options.isHeavyImpact ?? (npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact));
  beginNpcCast(npc, castMs);
  spawnNpcDirectHitMarker(state, npc, target, damage, castMs, { knockbackModifier: options.knockbackModifier ?? npcProfile(npc).knockbackModifier, isHeavyImpact, armorPierce: options.armorPierce, effectKind: options.effectKind });
  if (options.cooldownMs !== undefined) npc.attackCooldownMs = options.cooldownMs;
}

function npcMeleeHit(state: MmoSkillDemoState, npc: NpcEntity, target: PlayerEntity, buffed: boolean, cooldownMs: number, damage = npcMeleeDamage(npc, buffed)) {
  npcDirectHit(state, npc, target, damage, { castMs: npcProfile(npc).precastMs, cooldownMs, knockbackModifier: heavyKbm(npc), isHeavyImpact: npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact) });
}

function spawnNpcLungeTell(state: MmoSkillDemoState, npc: NpcEntity, target: PlayerEntity, damage: number, effectKind = npcProfile(npc).impactType) {
  const castMs = npcCastDurationMs(npc, Math.max(240, npcProfile(npc).precastMs ?? 180), true);
  beginNpcCast(npc, castMs);
  spawnHazard(state, npc, target, "line", damage, { knockbackModifier: heavyKbm(npc), isHeavyImpact: npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact), effectKind, windupMs: castMs });
}

function beginNpcCast(npc: NpcEntity, ms?: number) {
  npc.castMs = Math.max(npc.castMs || 0, npcCastDurationMs(npc, ms));
}

function applySentinelAura(state: MmoSkillDemoState, sentinel: NpcEntity) {
  for (const player of entitiesOfType(state, "player")) {
    if (player.hp <= 0 || player.zoneId !== sentinel.zoneId) continue;
    const distance = Math.hypot(player.x - sentinel.x, player.y - sentinel.y);
    if (distance > 170 || distance < 1) continue;
    applyKnockback(player, sentinel, -0.18, 3, false);
  }
}

function nearestPlayerForNpc(state: MmoSkillDemoState, runtime: ZoneRuntime, npc: NpcEntity, radius: number) {
  const focusedAggroId = combatFlagValue(npc, "aggro");
  if (focusedAggroId) {
    const focused = state.players[focusedAggroId];
    if (focused && focused.hp > 0 && focused.zoneId === npc.zoneId && Math.hypot(focused.x - npc.x, focused.y - npc.y) <= radius) return focused;
  }
  const candidates = runtime.logicHash.queryNearby({ x: npc.x, y: npc.y, radius }, runtime.logicScratch);
  let best: PlayerEntity | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let sawPlayerCandidate = false;
  for (const candidate of candidates) {
    if (candidate.type !== "player") continue;
    sawPlayerCandidate = true;
    const player = state.players[candidate.id];
    if (!player || player.hp <= 0 || player.zoneId !== npc.zoneId) continue;
    if (hasPlayerCombatFlag(player, "stealth") && player.damageAmpMs > 0) continue;
    if (shouldNpcIgnorePlayerForFaction(npc, player)) continue;
    const distance = Math.hypot(player.x - npc.x, player.y - npc.y);
    if (distance <= radius && distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }
  if (best || sawPlayerCandidate) return best;
  return findNearest(
    npc,
    entitiesOfType(state, "player"),
    (player) => player.hp > 0 && player.zoneId === npc.zoneId && (!hasPlayerCombatFlag(player, "stealth") || player.damageAmpMs <= 0) && !shouldNpcIgnorePlayerForFaction(npc, player),
    radius
  );
}

function spawnGatheringThreatMinion(state: MmoSkillDemoState, anchor: NpcEntity) {
  const summonKind = combatFlagValue(anchor, "summon");
  const focusedAggroId = combatFlagValue(anchor, "aggro") || anchor.summonedBy;
  if (!summonKind || !focusedAggroId) return;
  const activeSummons = Array.from(entitiesOfType(state, "npc")).filter((npc) => npc.summonedBy === anchor.id && npc.hp > 0).length;
  if (activeSummons >= 4) return;
  const id = `${anchor.id}-${summonKind}-${state.tick}-${activeSummons}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 32);
  if (state.npcs[id]) return;
  const bestiary = bestiaryFor(summonKind);
  const angle = state.tick * 0.77 + activeSummons * ((Math.PI * 2) / 4);
  const npc = acquireNpcEntity();
  npc.id = id;
  npc.kind = summonKind;
  npc.role = roleForKind(summonKind);
  npc.zoneId = anchor.zoneId;
  npc.elite = false;
  npc.personality = bestiary.personality;
  npc.impactType = bestiary.combat.impactType;
  npc.knockbackModifier = bestiary.combat.knockbackModifier;
  npc.x = anchor.x + Math.cos(angle) * 42;
  npc.y = anchor.y + Math.sin(angle) * 42;
  npc.spawnX = npc.x;
  npc.spawnY = npc.y;
  npc.hp = scaledNpcHp(summonKind, Math.max(18, Math.floor(anchor.maxHp * 0.18)), false);
  npc.maxHp = npc.hp;
  npc.respawnMs = 0;
  npc.attackCooldownMs = 120;
  npc.projectileCooldownMs = 400;
  npc.phaseMs = 0;
  npc.summonedBy = anchor.id;
  npc.knockbackX = 0;
  npc.knockbackY = 0;
  npc.knockbackMs = 0;
  npc.knockbackHeavy = false;
  npc.stunMs = 0;
  npc.slowMs = 0;
  npc.iframeMs = 0;
  npc.castMs = 0;
  npc.damageAmpMs = 0;
  npc.combatState = "gather-threat-minion";
  npc.combatFlags = `gather-hazard|aggro:${focusedAggroId}`.slice(0, 96);
  npc.lastAttackStyle = "";
  state.npcs[id] = npc;
  state.entities[id] = npc;
}

function prepareNpcForUpdate(state: MmoSkillDemoState, kernel: CollisionKernel, npc: NpcEntity, dt: number, ms: number) {
  const previousPhase = npc.phaseMs;
    npc.phaseMs = u16Ms((npc.phaseMs + ms) % npcPhaseLength(npc));
    npc.slowMs = u16Ms((npc.slowMs ?? 0) - ms);
    decayCombatTimers(npc, dt);
    const poisonStacks = npcFlagStacks(npc, "poison");
    if (poisonStacks > 0 && npc.damageAmpMs > 0) {
      const previousPoisonTick = Math.floor(previousPhase / 500);
      const currentPoisonTick = Math.floor(npc.phaseMs / 500);
      if (currentPoisonTick !== previousPoisonTick || npc.phaseMs < previousPhase) npc.hp = Math.max(0, npc.hp - poisonStacks);
    }
    if (npc.damageAmpMs <= 0) {
      setNpcFlagStacks(npc, "hex", 0);
      setNpcFlagStacks(npc, "poison", 0);
      removeCombatFlag(npc, "soulbound");
      removeCombatFlag(npc, "bow-vulnerable");
      removeCombatFlag(npc, "antiheal");
      removeCombatFlag(npc, "deathmark");
      removeCombatFlag(npc, "mortal");
      removeCombatFlag(npc, "fractured");
      removeCombatFlag(npc, "blind");
      removeCombatFlag(npc, "weakened");
    }
    if ((npc.slowMs ?? 0) <= 0) removeCombatFlag(npc, "enfeebled");
    if (updateKnockback(kernel, npc, dt)) return undefined;
    if (npc.hp <= 0) {
      if (npc.role === "boss-node") return undefined;
      npc.respawnMs = u32Ms(npc.respawnMs - ms);
      if (npc.respawnMs === 0) {
        if (npc.summonedBy) {
          removeMmoEntityForReuse(state, npc.id);
          return undefined;
        }
        npc.hp = npc.maxHp;
        npc.x = npc.spawnX;
        npc.y = npc.spawnY;
        npc.iframeMs = 0;
        npc.stunMs = 0;
        npc.slowMs = 0;
        npc.castMs = 0;
        npc.damageAmpMs = 0;
        npc.combatState = "";
        npc.combatFlags = "";
      }
      return undefined;
    }
    updateBossMinigames(state, npc, dt);
    if (isPeaceNpc(npc) || npc.role === "boss-node") {
      if (isPeaceNpc(npc)) updatePassiveNpc(state, kernel, npc, dt);
      return undefined;
    }
    if (npc.kind === "player-decoy") {
      npc.respawnMs = u32Ms(npc.respawnMs - ms);
      npc.phaseMs = u16Ms(npc.phaseMs + ms);
      for (const other of entitiesOfType(state, "npc")) {
        if (other.id === npc.id || other.hp <= 0 || other.zoneId !== npc.zoneId || isPeaceNpc(other) || other.kind === "player-decoy") continue;
        const distance = Math.hypot(other.x - npc.x, other.y - npc.y);
        if (distance > BOW_DECOY_TAUNT_RANGE) continue;
        other.projectileCooldownMs = Math.max(other.projectileCooldownMs, 220);
        if (distance > 34) moveNpcToward(kernel, other, npc, 42, dt);
      }
      if (npc.respawnMs <= 0 || npc.hp <= 0) {
        const owner = Array.from(entitiesOfType(state, "player")).find((player) => player.id === npc.summonedBy);
        if (owner) explodePlayerDecoy(state, kernel, owner, npc);
        removeMmoEntityForReuse(state, npc.id);
      }
      return undefined;
    }
    if (npc.combatState === "gather-threat-anchor") {
      npc.projectileCooldownMs = u16Ms(npc.projectileCooldownMs - ms);
      if (npc.projectileCooldownMs <= 0) {
        spawnGatheringThreatMinion(state, npc);
        npc.projectileCooldownMs = npc.kind === "infinite-magical-hornet-nest" ? 1400 : 2400;
      }
      return undefined;
    }
    if (npc.stunMs > 0) {
      npc.castMs = 0;
      for (const hazard of entitiesOfType(state, "hazard")) {
        if (hazard.ownerId === npc.id && hazard.windupMs > 0) removeMmoEntityForReuse(state, hazard.id);
      }
      return undefined;
    }
  return previousPhase;
}

function updateNpcs(state: MmoSkillDemoState, runtime: ZoneRuntime, kernel: CollisionKernel, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const npc of snapshotEntitiesOfType(state, "npc", updateNpcScratch)) {
    if (state.entities[npc.id] !== npc) continue;
    const previousPhase = prepareNpcForUpdate(state, kernel, npc, dt, ms);
    if (previousPhase === undefined) continue;
    npc.attackCooldownMs = u16Ms(npc.attackCooldownMs - ms);
    npc.projectileCooldownMs = u16Ms(npc.projectileCooldownMs - ms);
    const buffed = isNpcBuffed(npc);
    const invulnEnd = STRONG_PHASE_INVULN_START_MS + (npcProfile(npc).iframePhaseMs ?? STRONG_PHASE_INVULN_END_MS - STRONG_PHASE_INVULN_START_MS);
    if (isStrongEnemy(npc) && previousPhase < invulnEnd && npc.phaseMs >= invulnEnd) {
      npc.attackCooldownMs = 0;
      npc.projectileCooldownMs = 0;
    }
    if (isStrongEnemy(npc) && previousPhase < STRONG_PHASE_INVULN_START_MS && npc.phaseMs >= STRONG_PHASE_INVULN_START_MS) {
      beginNpcCast(npc, npc.kind === "stone-crawler" ? 500 : 320);
      if (npc.kind === "alpha-timberwolf") {
        const activeSummons = Array.from(entitiesOfType(state, "npc")).filter((other) => other.summonedBy === npc.id && other.hp > 0).length;
        if (activeSummons < 2) {
          addSummonedNpc(state, npc, 1);
          addSummonedNpc(state, npc, 2);
        }
      }
    }
    if (npc.kind === "crag-gargoyle" && isNpcInvulnerable(npc) && state.tick % 15 === 0 && !hasCombatFlag(npc, "antiheal") && !hasCombatFlag(npc, "mortal")) {
      npc.hp = Math.min(npc.maxHp, npc.hp + 2);
    }
    if (isNpcInvulnerable(npc)) continue;
    if (npc.kind === "void-sent-sentinel") applySentinelAura(state, npc);
    if ((npc.kind === "rune-priest" || npc.kind === "ember-acolyte" || npc.kind === "veil-oracle") && npc.projectileCooldownMs <= 0) {
      const ally = damagedHostileNear(state, npc, npc.kind === "ember-acolyte" ? 150 : 130);
      if (ally) {
        ally.hp = Math.min(ally.maxHp, ally.hp + (npc.kind === "veil-oracle" ? 16 : npc.kind === "ember-acolyte" ? 14 : 10));
        if (npc.kind === "veil-oracle" && isStrongEnemy(ally)) {
          ally.phaseMs = Math.max(ally.phaseMs, STRONG_PHASE_INVULN_END_MS + 220);
          ally.attackCooldownMs = 0;
          ally.projectileCooldownMs = 0;
        }
        npc.projectileCooldownMs = npc.kind === "veil-oracle" ? 1450 : npc.kind === "ember-acolyte" ? 1550 : 1850;
        continue;
      }
    }
    const target = nearestPlayerForNpc(state, runtime, npc, npcAggroRadius(npc));
    if (!target) continue;
    const distance = Math.hypot(target.x - npc.x, target.y - npc.y);
    const personality = npcPersonality(npc);
    const profile = npcProfile(npc);

    const context = { state, kernel, npc, target, dt, distance, buffed, previousPhase, profile };
    if (updateMobileNpcPersonality(personality, context)) continue;
    if (updateAdvancedNpcPersonality(personality, context)) continue;
    updateNpcKindFallback(context);
  }
}

type NpcBehaviorContext = {
  state: MmoSkillDemoState;
  kernel: CollisionKernel;
  npc: NpcEntity;
  target: PlayerEntity;
  dt: number;
  distance: number;
  buffed: boolean;
  previousPhase: number;
  profile: ReturnType<typeof npcProfile>;
};

function updateMobileNpcPersonality(
  personality: ReturnType<typeof npcPersonality>,
  context: NpcBehaviorContext
) {
  const { state, kernel, npc, target, dt, distance, buffed, profile } = context;
  if (personality === "aggressive-pack-hunter") {
    const reach = npcMeleeReach(npc);
    if (distance > reach && distance < 148 && npc.projectileCooldownMs <= 0) {
      spawnNpcLungeTell(state, npc, target, npcMeleeDamage(npc, buffed), "dust");
      npc.projectileCooldownMs = buffed ? 900 : 1250;
    } else if (distance <= reach && npc.attackCooldownMs <= 0) {
      npcMeleeHit(state, npc, target, buffed, buffed ? 720 : 980);
    }
    if (Math.hypot(target.x - npc.x, target.y - npc.y) > reach) circleNpcAround(kernel, npc, target, profile.moveSpeed * (buffed ? 1.2 : 1), dt);
    return true;
  }

  if (personality === "berserk-high-aggro") {
    const reach = npcMeleeReach(npc);
    if (distance > reach && distance < 176 && npc.projectileCooldownMs <= 0) {
      spawnNpcLungeTell(state, npc, target, npcMeleeDamage(npc, buffed) + 1, "dust");
      npc.projectileCooldownMs = buffed ? 980 : 1380;
    } else if (distance <= reach && npc.attackCooldownMs <= 0) {
      npcMeleeHit(state, npc, target, buffed, buffed ? 760 : 1050, npcMeleeDamage(npc, buffed) + 1);
    }
    if (Math.hypot(target.x - npc.x, target.y - npc.y) > reach) moveNpcToward(kernel, npc, target, profile.moveSpeed * (buffed ? 1.25 : 1), dt);
    return true;
  }

  if (personality === "territorial-rooted") {
    if (npc.hp >= npc.maxHp) return true;
    if (npc.projectileCooldownMs <= 0 && distance > 78) {
      beginNpcCast(npc, 260);
      spawnHazard(state, npc, target, "line", 8, { knockbackModifier: profile.heavyKnockbackModifier ?? -2.2, isHeavyImpact: true, effectKind: "root" });
      npc.projectileCooldownMs = 1500;
    } else if (npc.attackCooldownMs <= 0 && distance <= 82) {
      beginNpcCast(npc, 220);
      spawnHazard(state, npc, target, "aoe", 9, { knockbackModifier: profile.knockbackModifier, isHeavyImpact: true, effectKind: "sap" });
      npc.attackCooldownMs = 1500;
    }
    return true;
  }

  if (personality === "cowardly-opportunistic") {
    if (npc.projectileCooldownMs <= 0 && distance < 156) {
      beginNpcCast(npc, 120);
      spawnHazard(state, npc, target, "aoe", buffed ? 10 : 7, { knockbackModifier: 0.8, effectKind: "spore" });
      npc.projectileCooldownMs = buffed ? 820 : 1180;
    }
    if (distance < 132) {
      const escaped = moveNpcAway(kernel, npc, target, profile.moveSpeed * (buffed ? 1.22 : 1), dt);
      if (!escaped && distance < 72 && npc.attackCooldownMs <= 0) npcDirectHit(state, npc, target, buffed ? 8 : 5, { castMs: 120, cooldownMs: 980, knockbackModifier: profile.heavyKnockbackModifier ?? -1.5 });
    }
    return true;
  }

  if (personality === "erratic-harasser") {
    const reach = npcMeleeReach(npc);
    if (npc.projectileCooldownMs <= 0 && distance > reach && distance < 170) {
      spawnNpcLungeTell(state, npc, target, npcMeleeDamage(npc, buffed), profile.impactType);
      npc.projectileCooldownMs = 1020;
    } else if (distance <= reach && npc.attackCooldownMs <= 0) {
      npcMeleeHit(state, npc, target, buffed, 1020);
    }
    if (distance < 96) moveNpcAway(kernel, npc, target, profile.moveSpeed, dt, true);
    else moveNpcToward(kernel, npc, target, profile.moveSpeed, dt, true);
    return true;
  }

  if (personality === "stoic-bruiser") {
    if (distance <= 70 && npc.attackCooldownMs <= 0) {
      beginNpcCast(npc, 500);
      spawnHazard(state, npc, target, "aoe", buffed ? 10 : 8, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "spark" });
      npc.attackCooldownMs = 1800;
    } else if (distance > 48) {
      moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
    }
    return true;
  }

  if (personality === "stubborn-lane-defender") {
    if (distance < 170 && npc.projectileCooldownMs <= 0) {
      beginNpcCast(npc, 220);
      spawnHazard(state, npc, target, "line", 8, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "dust" });
      npc.projectileCooldownMs = 1900;
    }
    if (distance > 46) moveNpcToward(kernel, npc, target, npc.phaseMs > 1900 && npc.phaseMs < 2900 ? 112 : profile.moveSpeed, dt);
    return true;
  }

  if (personality === "intelligent-skittish") {
    if (distance < 82) {
      moveNpcAway(kernel, npc, target, 126, dt);
      npc.iframeMs = Math.max(npc.iframeMs, profile.iframeMs ?? 300);
      npc.castMs = Math.max(npc.castMs, 160);
    } else if (distance > 122) {
      moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
    }
    if (npc.projectileCooldownMs <= 0 && distance < 180) {
      beginNpcCast(npc, 160);
      spawnHazard(state, npc, target, "aoe", buffed ? 10 : 7, { knockbackModifier: profile.knockbackModifier, effectKind: "spark" });
      npc.projectileCooldownMs = 1240;
    }
    return true;
  }

  return false;
}

function updateAdvancedNpcPersonality(
  personality: ReturnType<typeof npcPersonality>,
  context: NpcBehaviorContext
) {
  const { state, kernel, npc, target, dt, distance, buffed, previousPhase, profile } = context;
  if (personality === "defensive-guardian") {
    if (previousPhase < 6200 && npc.phaseMs >= 6200) {
      beginNpcCast(npc, 260);
      spawnRadialHazards(state, npc, 8, 9, 160, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "spark" });
    }
    if (distance > 54) moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
    return true;
  }

  if (personality === "predatory-ambush") {
    if (distance > 54 && npc.phaseMs > 2800 && npc.phaseMs < 3300) {
      npc.iframeMs = Math.max(npc.iframeMs, profile.iframeMs ?? 240);
      npc.x = clamp(target.x - 34, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
      npc.y = clamp(target.y + 18, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
      return true;
    }
    if (npc.attackCooldownMs <= 0 && distance < 86) {
      npcDirectHit(state, npc, target, buffed ? 9 : 6, { castMs: 180, cooldownMs: 1150, knockbackModifier: profile.heavyKnockbackModifier ?? -2.2 });
    } else if (distance > 48) {
      moveNpcToward(kernel, npc, target, profile.moveSpeed, dt, true);
    }
    return true;
  }

  if (personality === "intelligent-spacer") {
    if (distance < 78) {
      moveNpcAway(kernel, npc, target, 134, dt);
      npc.iframeMs = Math.max(npc.iframeMs, profile.iframeMs ?? 400);
      npc.castMs = Math.max(npc.castMs, 160);
    } else if (distance < 182 && npc.projectileCooldownMs <= 0) {
      beginNpcCast(npc, 420);
      spawnHazard(state, npc, target, "line", buffed ? 10 : 8, { knockbackModifier: profile.knockbackModifier, armorPierce: true, effectKind: "void" });
      npc.projectileCooldownMs = buffed ? 920 : 1200;
    } else if (distance < 128) {
      moveNpcAway(kernel, npc, target, profile.moveSpeed, dt);
    }
    return true;
  }

  if (personality === "support-caster") {
    if (distance < 96) {
      moveNpcAway(kernel, npc, target, profile.moveSpeed, dt);
    } else if (distance > profile.preferredRange + 24) {
      moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
    }
    if (npc.projectileCooldownMs <= 0 && distance < 178) {
      beginNpcCast(npc, profile.precastMs ?? 180);
      spawnHazard(state, npc, target, "line", buffed ? 9 : 7, { knockbackModifier: profile.knockbackModifier, effectKind: profile.impactType });
      npc.projectileCooldownMs = buffed ? 860 : 1180;
    }
    return true;
  }

  if (personality === "evasive-zoner") {
    if (distance < 150) moveNpcAway(kernel, npc, target, profile.moveSpeed, dt);
    if (npc.projectileCooldownMs <= 0 && distance < 190) {
      beginNpcCast(npc, 120);
      spawnHazard(state, npc, target, "aoe", buffed ? 11 : 8, { knockbackModifier: 0.9, effectKind: "spore" });
      npc.projectileCooldownMs = buffed ? 820 : 1120;
    }
    return true;
  }

  if (personality === "inexorable-dread") {
    if (distance > 52) moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
    else if (npc.attackCooldownMs <= 0) npcDirectHit(state, npc, target, buffed ? 13 : 10, { castMs: 360, cooldownMs: buffed ? 980 : 1350, knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "void" });
    if (npc.projectileCooldownMs <= 0 && distance < 180) {
      spawnHazard(state, npc, target, "line", buffed ? 11 : 8, { knockbackModifier: -1.4, effectKind: "void" });
      npc.projectileCooldownMs = 1500;
    }
    return true;
  }

  if (personality === "mechanical-boss") {
    if (npc.kind === "great-ash-lord" && distance < 140 && npc.attackCooldownMs <= 0) {
      beginNpcCast(npc, 520);
      spawnHazard(state, npc, target, "aoe", 14, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "sap" });
      npc.attackCooldownMs = 1650;
    } else if (npc.kind === "iron-core-golem" && npc.projectileCooldownMs <= 0 && distance < 190) {
      beginNpcCast(npc, 500);
      spawnHazard(state, npc, target, "line", 13, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "spark" });
      npc.projectileCooldownMs = 1320;
    } else if (npc.kind === "mirror-king" && target.action !== "idle" && distance < 126 && npc.attackCooldownMs <= 0) {
      beginNpcCast(npc, 240);
      const style = attackStyleForAction(target.action, target);
      npc.lastAttackStyle = style || npc.lastAttackStyle;
      if (style === "spell") spawnHazard(state, npc, target, "line", 10, { knockbackModifier: -1.5, effectKind: "void" });
      else npcDirectHit(state, npc, target, target.action === "e" ? 14 : target.action === "q" ? 10 : 7, { castMs: 240, knockbackModifier: profile.knockbackModifier, effectKind: "void" });
      npc.attackCooldownMs = 1200;
    }
    if (distance > profile.preferredRange) moveNpcToward(kernel, npc, target, profile.moveSpeed * (buffed ? 1.12 : 1), dt);
    return true;
  }

  return false;
}

function updateNpcKindFallback(context: NpcBehaviorContext) {
  const { state, kernel, npc, target, dt, distance, buffed } = context;
  if (npc.kind === "ash-bramble-stalker" && distance < 135 && npc.projectileCooldownMs <= 0) {
    spawnHazard(state, npc, target, "aoe", buffed ? 10 : 6);
    npc.projectileCooldownMs = buffed ? 880 : 1350;
    if (distance > 58) return;
  }

  if (npc.kind === "crag-sapper" && distance < 170 && npc.projectileCooldownMs <= 0) {
    spawnHazard(state, npc, target, buffed ? "line" : "aoe", buffed ? 11 : 7);
    npc.projectileCooldownMs = buffed ? 940 : 1280;
    if (distance > 72) return;
  }

  if (npc.kind === "mire-bomber" && distance < 185 && npc.projectileCooldownMs <= 0) {
    spawnHazard(state, npc, target, "aoe", buffed ? 11 : 8);
    npc.projectileCooldownMs = buffed ? 820 : 1120;
    if (distance > 92) return;
  }

  if (npc.kind === "mire-bomber" && distance < 92) {
    const move = kernel.vecNormalize(npc.x - target.x, npc.y - target.y);
    const nextX = npc.x + move.x * 58 * dt;
    const nextY = npc.y + move.y * 58 * dt;
    if (canOccupy(kernel, nextX, npc.y)) npc.x = nextX;
    if (canOccupy(kernel, npc.x, nextY)) npc.y = nextY;
    return;
  }

  if (npc.kind === "sand-wraith" && distance > 54 && npc.phaseMs > 2800 && npc.phaseMs < 3300) {
    npc.x = clamp(target.x - 34, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    npc.y = clamp(target.y + 18, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
    return;
  }

  if (npc.kind === "crystal-beetle" && distance < 170 && npc.phaseMs > 1300 && npc.phaseMs < 1900 && npc.projectileCooldownMs <= 0) {
    spawnHazard(state, npc, target, "line", 8);
    npc.projectileCooldownMs = 1900;
    return;
  }

  if ((npc.kind === "cursed-archer" || npc.kind === "ember-acolyte" || npc.kind === "veil-oracle") && distance < 165 && npc.projectileCooldownMs <= 0) {
    spawnHazard(state, npc, target, "line", 7 + (buffed ? 2 : 0));
    npc.projectileCooldownMs = buffed ? 780 : 1050;
    return;
  }

  if ((npc.elite || npc.role === "boss") && distance < 190 && npc.projectileCooldownMs <= 0) {
    const linePhase = buffed || npc.kind === "bazaar-guard" || npc.kind === "void-sent-sentinel" || npc.kind === "mirror-king" || npc.kind === "dungeon-revenant";
    spawnHazard(state, npc, target, linePhase ? "line" : "aoe", (npc.role === "boss" ? 13 : 9) + (buffed ? 3 : 0));
    npc.projectileCooldownMs = buffed ? (npc.role === "boss" ? 920 : 1050) : npc.role === "boss" ? 1350 : 1650;
    if (linePhase) return;
  }

  if (npc.kind === "aggro-tree") {
    if (distance < 68 && npc.attackCooldownMs <= 0) {
      npcDirectHit(state, npc, target, 7, { castMs: 420, cooldownMs: 1700, knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "sap" });
    }
    return;
  }

  if (npc.kind === "great-ash-lord" && npc.phaseMs > 3600 && distance < 125 && npc.attackCooldownMs <= 0) {
    spawnHazard(state, npc, target, "aoe", 14);
    npc.attackCooldownMs = 1600;
    return;
  }

  if (npc.kind === "mirror-king" && target.action !== "idle" && distance < 115 && npc.attackCooldownMs <= 0) {
    npcDirectHit(state, npc, target, target.action === "e" ? 14 : target.action === "q" ? 10 : 7, { castMs: 240, cooldownMs: 1200, knockbackModifier: npcProfile(npc).knockbackModifier, effectKind: "void" });
    return;
  }

  if (distance > (npc.role === "boss" ? 58 : 42)) {
    const speed =
      npc.kind === "iron-eye-bat"
        ? 82
        : npc.kind === "stone-crawler"
          ? 34
          : npc.kind === "crystal-beetle"
            ? npc.phaseMs > 1900 && npc.phaseMs < 2900
              ? 112
              : 46
          : npc.kind === "sand-wraith"
            ? 74
            : npc.kind === "mire-bomber" || npc.kind === "crag-sapper"
              ? 49
              : npc.kind === "rune-priest" || npc.kind === "ember-acolyte" || npc.kind === "veil-oracle"
                ? 42
            : npc.kind === "ash-bramble-stalker"
              ? 58
              : npc.kind === "dungeon-revenant"
                ? 50
            : npc.kind === "iron-core-golem"
              ? 38
              : npc.role === "boss"
                ? 44
                : 52;
    const scaled = speed * npcSpeedScale(npc) * (buffed ? 1.28 : 1);
    const ignoreTerrain = npc.kind === "iron-eye-bat" || npc.kind === "sand-wraith";
    if (MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
      const npcX = npc.x;
      const npcY = npc.y;
      const targetX = target.x;
      const targetY = target.y;
      const move = kernel.vecNormalize(targetX - npcX, targetY - npcY);
      const nextX = npcX + move.x * scaled * dt;
      const nextY = npcY + move.y * scaled * dt;
      const finalX = ignoreTerrain || canOccupy(kernel, nextX, npcY) ? nextX : npcX;
      const finalY = ignoreTerrain || canOccupy(kernel, finalX, nextY) ? nextY : npcY;
      if (finalX !== npcX) npc.x = finalX;
      if (finalY !== npcY) npc.y = finalY;
    } else {
      const move = kernel.vecNormalize(target.x - npc.x, target.y - npc.y);
      const nextX = npc.x + move.x * scaled * dt;
      const nextY = npc.y + move.y * scaled * dt;
      if (ignoreTerrain || canOccupy(kernel, nextX, npc.y)) npc.x = nextX;
      if (ignoreTerrain || canOccupy(kernel, npc.x, nextY)) npc.y = nextY;
    }
  } else if (npc.attackCooldownMs <= 0) {
    const playerRect = rectAround(target, 22, 24);
    const npcX = npc.x;
    const npcY = npc.y;
    const role = npc.role;
    if (kernel.testCircleRectOverlap(npcX, npcY, role === "boss" ? 54 : 38, playerRect.x, playerRect.y, playerRect.w, playerRect.h)) {
      const elite = npc.elite;
      const kind = npc.kind;
      const hit = (role === "boss" ? 11 : elite ? 8 : kind.includes("crawler") ? 5 : 3) + (buffed ? 3 : 0);
      npcDirectHit(state, npc, target, hit, { cooldownMs: buffed ? (role === "boss" ? 900 : 820) : role === "boss" ? 1400 : 1200, knockbackModifier: npcProfile(npc).knockbackModifier, isHeavyImpact: elite || role === "boss" });
    }
  }
}

export {
  PASSIVE_NPC_PATROLS,
  applySentinelAura,
  beginNpcCast,
  circleNpcAround,
  heavyKbm,
  leapNpcTowardTarget,
  moveNpcAway,
  moveNpcBy,
  moveNpcToward,
  nearestPlayerForNpc,
  npcCastDurationMs,
  npcDirectHit,
  npcMeleeDamage,
  npcMeleeHit,
  npcMeleeReach,
  npcPersonality,
  npcProfile,
  npcSpeedScale,
  spawnGatheringThreatMinion,
  spawnNpcDirectHitMarker,
  spawnNpcLungeTell,
  updateNpcs,
  updatePassiveNpc
};
