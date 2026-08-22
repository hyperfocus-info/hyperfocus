import { selectedAbilityForSlot, type MmoSkillDemoInput, type MmoSkillDemoState, type PlayerEntity } from "../shared.ts";
import { NPC_DEFAULT_SIZE, NPC_SIZE_BY_KIND, NPC_SIZE_BY_ROLE, PLAYER_SIZE, RESOURCE_SIZE_BY_KIND } from "../data/entity-sizes.ts";
import { MAP_HEIGHT, MAP_WIDTH, TILE } from "./world.ts";

const PLAYER_RADIUS = PLAYER_SIZE.radius;
const LOCAL_PREDICTION_MAX_STEP_MS = 34;
const LOCAL_PREDICTION_SNAP_DISTANCE_PX = 96;
const LOCAL_RUSH_SNAP_DISTANCE_PX = 180;
const LOCAL_PREDICTION_CORRECTION_HALF_LIFE_MS = 70;
const LOCAL_RUSH_CORRECTION_HALF_LIFE_MS = 140;
const RUSH_DURATION_MS = 5000;
const RUSH_WINDUP_MS = 500;
const RUSH_BRAKE_MS = 500;
const PLAYER_MOMENTUM_MAX_FACTOR = 1.25;
const PLAYER_MOMENTUM_DAMP_MS = 750;

export type LocalPredictionState = {
  id: string;
  x: number;
  y: number;
  zoneId: string;
  hp: number;
  lastTimeMs: number;
  rushActive: boolean;
  rushLocalMs: number;
  rushServerMs: number;
  rushVectorX: number;
  rushVectorY: number;
  rushDistance: number;
  momentumX: number;
  momentumY: number;
};

export function createLocalPredictionState(): LocalPredictionState {
  return {
    id: "",
    x: 0,
    y: 0,
    zoneId: "",
    hp: 0,
    lastTimeMs: Number.NaN,
    rushActive: false,
    rushLocalMs: 0,
    rushServerMs: 0,
    rushVectorX: 1,
    rushVectorY: 0,
    rushDistance: 0,
    momentumX: 0,
    momentumY: 0
  };
}

function resetLocalPredictionState(prediction: LocalPredictionState, player: PlayerEntity | undefined, timeMs: number) {
  prediction.id = player?.id ?? "";
  prediction.x = player?.x ?? 0;
  prediction.y = player?.y ?? 0;
  prediction.zoneId = player?.zoneId ?? "";
  prediction.hp = player?.hp ?? 0;
  prediction.lastTimeMs = timeMs;
  prediction.rushActive = player?.activeAbility === "space-rush";
  prediction.rushLocalMs = player?.activeMs ?? 0;
  prediction.rushServerMs = player?.activeMs ?? 0;
  prediction.rushVectorX = finiteOr(player?.abilityVectorX, 1);
  prediction.rushVectorY = finiteOr(player?.abilityVectorY, 0);
  prediction.rushDistance = player?.rushDistance ?? 0;
  prediction.momentumX = finiteOr(player?.momentumX, 0);
  prediction.momentumY = finiteOr(player?.momentumY, 0);
}

function finiteOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hasAbility(player: PlayerEntity, abilityId: string) {
  return Boolean(player.abilitySlots?.[abilityId]);
}

function hasGear(player: PlayerEntity, gearId: string) {
  const equipment = player.equipment ?? {};
  if (equipment[gearId]) return true;
  for (const slot in equipment) {
    if (equipment[slot] === gearId) return true;
  }
  return false;
}

function spaceSlotReady(player: PlayerEntity) {
  return (player.cooldowns?.Space ?? 0) <= 0;
}

function localPlayerSpeed(player: PlayerEntity, state: MmoSkillDemoState, input: MmoSkillDemoInput) {
  if (player.escortNpcId) return 0;
  const spaceRushInput = input.action === "space" && selectedAbilityForSlot(player, "Space") === "space-rush";
  const spaceReady = input.action === "space" && spaceSlotReady(player);
  const mobility =
    input.action === "space" && !spaceRushInput && spaceReady && hasAbility(player, "space-ghost-walk")
      ? 190
      : input.action === "space" && !spaceRushInput && spaceReady && hasAbility(player, "space-dash")
        ? 165
        : input.action === "space" && !spaceRushInput && spaceReady && hasAbility(player, "space-jump")
          ? 132
          : 0;
  const boots = hasGear(player, "leather-boots") || hasGear(player, "mining-boots") ? 18 : 0;
  const berserk = player.berserkMs > 0 ? 34 : 0;
  const mastery = Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
  const slowScale = (player.slowMs ?? 0) > 0 ? 0.5 : 1;
  const tethered = localPlayerTetheredBySentinel(player, state);
  return (118 + Math.min(38, player.combatLevel * 2) + mastery + boots + mobility + berserk) * (tethered ? 0.72 : 1) * slowScale;
}

function localPlayerTetheredBySentinel(player: PlayerEntity, state: MmoSkillDemoState) {
  const tetherRadiusSq = 150 * 150;
  for (const id in state.npcs) {
    const npc = state.npcs[id]!;
    if (npc.kind !== "void-sent-sentinel" || npc.hp <= 0 || npc.zoneId !== player.zoneId) continue;
    const dx = npc.x - player.x;
    const dy = npc.y - player.y;
    if (dx * dx + dy * dy < tetherRadiusSq) return true;
  }
  return false;
}

function baseRushSpeed(player: PlayerEntity) {
  return 118 + Math.min(38, player.combatLevel * 2) + Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function decayMomentum(prediction: LocalPredictionState, dtMs: number) {
  const decay = clamp01(dtMs / PLAYER_MOMENTUM_DAMP_MS);
  prediction.momentumX *= 1 - decay;
  prediction.momentumY *= 1 - decay;
  if (Math.hypot(prediction.momentumX, prediction.momentumY) < 0.01) {
    prediction.momentumX = 0;
    prediction.momentumY = 0;
  }
}

function updateMomentum(prediction: LocalPredictionState, dirX: number, dirY: number, speed: number, dtMs: number) {
  decayMomentum(prediction, dtMs);
  const maxMomentum = speed * PLAYER_MOMENTUM_MAX_FACTOR;
  const accel = clamp01(dtMs / PLAYER_MOMENTUM_DAMP_MS);
  prediction.momentumX += dirX * maxMomentum * accel;
  prediction.momentumY += dirY * maxMomentum * accel;
  const current = Math.hypot(prediction.momentumX, prediction.momentumY);
  if (current > maxMomentum && current > 0) {
    const scale = maxMomentum / current;
    prediction.momentumX *= scale;
    prediction.momentumY *= scale;
  }
}

function clampToMap(prediction: LocalPredictionState) {
  prediction.x = Math.max(PLAYER_RADIUS, Math.min(MAP_WIDTH * TILE - PLAYER_RADIUS, prediction.x));
  prediction.y = Math.max(PLAYER_RADIUS, Math.min(MAP_HEIGHT * TILE - PLAYER_RADIUS, prediction.y));
}

function directionToAim(prediction: LocalPredictionState, input: MmoSkillDemoInput, fallbackX: number, fallbackY: number) {
  const aimX = finiteOr(input.aimX, prediction.x + fallbackX);
  const aimY = finiteOr(input.aimY, prediction.y + fallbackY);
  const dx = aimX - prediction.x;
  const dy = aimY - prediction.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    const fallbackLength = Math.hypot(fallbackX, fallbackY) || 1;
    return { x: fallbackX / fallbackLength, y: fallbackY / fallbackLength };
  }
  return { x: dx / length, y: dy / length };
}

function rotateVectorToward(x: number, y: number, targetX: number, targetY: number, maxRadians: number) {
  const fromAngle = Math.atan2(y, x);
  const toAngle = Math.atan2(targetY, targetX);
  let delta = ((toAngle - fromAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  delta = Math.max(-maxRadians, Math.min(maxRadians, delta));
  const angle = fromAngle + delta;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function rushWindupMs(player: PlayerEntity) {
  const entry = (player.abilityHits || "").split("|").find((part) => part.startsWith("windup:rush:"));
  const parsed = entry ? Number(entry.split(":")[2]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : RUSH_WINDUP_MS;
}

function rushProgress(activeMs: number, windupMs: number, durationMs: number) {
  return clamp01((activeMs - windupMs) / Math.max(1, durationMs - windupMs));
}

function rushSpeedMultiplier(activeMs: number, windupMs: number, durationMs: number) {
  const progress = rushProgress(activeMs, windupMs, durationMs);
  const ramp = 1.2 + progress * 3.8;
  const remainingMs = Math.max(0, durationMs - activeMs);
  if (remainingMs >= RUSH_BRAKE_MS) return ramp;
  const brake = clamp01(1 - remainingMs / RUSH_BRAKE_MS);
  return ramp + (1 - ramp) * brake;
}

function localRushEntityRadius(entity: { entityType: string; kind?: string; role?: string; elite?: boolean }) {
  if (entity.entityType === "resource") return (RESOURCE_SIZE_BY_KIND[entity.kind ?? "ore"] ?? RESOURCE_SIZE_BY_KIND.ore)!.collisionRadius;
  return (NPC_SIZE_BY_KIND[entity.kind ?? ""] ?? NPC_SIZE_BY_ROLE[entity.role ?? "mob"] ?? (entity.elite ? NPC_SIZE_BY_ROLE.elite : NPC_DEFAULT_SIZE)).radius;
}

type LocalRushBlocker = {
  x: number;
  y: number;
  radius: number;
};

function collectLocalRushBlockers(state: MmoSkillDemoState, player: PlayerEntity) {
  const blockers: LocalRushBlocker[] = [];
  for (const id in state.resources) {
    const resource = state.resources[id]!;
    if (resource.zoneId !== player.zoneId || resource.depleted) continue;
    blockers.push({ x: resource.x, y: resource.y, radius: localRushEntityRadius(resource) });
  }
  for (const id in state.npcs) {
    const npc = state.npcs[id]!;
    if (npc.zoneId !== player.zoneId || npc.hp <= 0) continue;
    blockers.push({ x: npc.x, y: npc.y, radius: localRushEntityRadius(npc) });
  }
  return blockers;
}

function localRushBlockedAt(blockers: LocalRushBlocker[], x: number, y: number, radius = PLAYER_RADIUS) {
  for (const blocker of blockers) {
    const blockedRadius = radius + blocker.radius;
    const dx = blocker.x - x;
    const dy = blocker.y - y;
    if (dx * dx + dy * dy < blockedRadius * blockedRadius) return true;
  }
  return false;
}

function moveRushSweptLocal(prediction: LocalPredictionState, player: PlayerEntity, state: MmoSkillDemoState, dx: number, dy: number) {
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return;
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, PLAYER_RADIUS * 0.45)));
  const stepX = dx / steps;
  const stepY = dy / steps;
  const blockers = collectLocalRushBlockers(state, player);
  for (let i = 0; i < steps; i += 1) {
    const nextX = prediction.x + stepX;
    const nextY = prediction.y + stepY;
    if (localRushBlockedAt(blockers, nextX, nextY, PLAYER_RADIUS)) break;
    prediction.x = nextX;
    prediction.y = nextY;
  }
}

function syncRushPrediction(prediction: LocalPredictionState, player: PlayerEntity) {
  if (player.activeAbility !== "space-rush") {
    prediction.rushActive = false;
    prediction.rushLocalMs = 0;
    prediction.rushServerMs = 0;
    prediction.rushDistance = 0;
    prediction.rushVectorX = finiteOr(player.abilityVectorX, prediction.rushVectorX || 1);
    prediction.rushVectorY = finiteOr(player.abilityVectorY, prediction.rushVectorY || 0);
    return;
  }
  const serverMs = finiteOr(player.activeMs, 0);
  if (!prediction.rushActive || serverMs + 120 < prediction.rushServerMs) {
    prediction.rushActive = true;
    prediction.rushLocalMs = serverMs;
    prediction.rushDistance = player.rushDistance || 0;
  } else {
    prediction.rushLocalMs = Math.max(prediction.rushLocalMs, serverMs);
    prediction.rushDistance = Math.max(prediction.rushDistance, player.rushDistance || 0);
  }
  prediction.rushServerMs = serverMs;
  prediction.rushVectorX = finiteOr(player.abilityVectorX, prediction.rushVectorX || 1);
  prediction.rushVectorY = finiteOr(player.abilityVectorY, prediction.rushVectorY || 0);
}

function applyRushPrediction(prediction: LocalPredictionState, player: PlayerEntity, input: MmoSkillDemoInput, state: MmoSkillDemoState, dtMs: number) {
  if (player.activeAbility !== "space-rush" || dtMs <= 0) return;
  const durationMs = Math.max(1, player.activeDurationMs || RUSH_DURATION_MS);
  const windupMs = rushWindupMs(player);
  const previousMs = prediction.rushLocalMs;
  prediction.rushLocalMs = Math.min(durationMs, prediction.rushLocalMs + dtMs);
  if (prediction.rushLocalMs < windupMs) return;
  if (previousMs <= windupMs) {
    prediction.rushVectorX = finiteOr(player.abilityVectorX, prediction.rushVectorX || 1);
    prediction.rushVectorY = finiteOr(player.abilityVectorY, prediction.rushVectorY || 0);
  }
  const rushT = rushProgress(prediction.rushLocalMs, windupMs, durationMs);
  const aimDirection = input.action === "space"
    ? directionToAim(prediction, input, prediction.rushVectorX, prediction.rushVectorY)
    : { x: prediction.rushVectorX, y: prediction.rushVectorY };
  const maxTurnDeg = 3 - rushT * 2.7;
  const turnScale = Math.max(0.25, dtMs / (1000 / 60));
  const turned = rotateVectorToward(prediction.rushVectorX, prediction.rushVectorY, aimDirection.x, aimDirection.y, ((maxTurnDeg * Math.PI) / 180) * turnScale);
  prediction.rushVectorX = turned.x;
  prediction.rushVectorY = turned.y;
  const move = baseRushSpeed(player) * rushSpeedMultiplier(prediction.rushLocalMs, windupMs, durationMs) * (dtMs / 1000);
  const beforeX = prediction.x;
  const beforeY = prediction.y;
  moveRushSweptLocal(prediction, player, state, prediction.rushVectorX * move, prediction.rushVectorY * move);
  clampToMap(prediction);
  prediction.rushDistance += Math.hypot(prediction.x - beforeX, prediction.y - beforeY);
}

export function applyLocalPrediction(
  prediction: LocalPredictionState,
  visualPlayer: PlayerEntity | undefined,
  rawPlayer: PlayerEntity | undefined,
  input: MmoSkillDemoInput,
  state: MmoSkillDemoState,
  timeMs: number
) {
  if (!visualPlayer || !rawPlayer) {
    resetLocalPredictionState(prediction, undefined, timeMs);
    return visualPlayer;
  }
  syncRushPrediction(prediction, rawPlayer);
  const activeRush = rawPlayer.activeAbility === "space-rush";
  const authoritativeGap = Math.hypot(prediction.x - rawPlayer.x, prediction.y - rawPlayer.y);
  if (
    prediction.id !== rawPlayer.id ||
    prediction.zoneId !== rawPlayer.zoneId ||
    (prediction.hp <= 0 && rawPlayer.hp > 0) ||
    authoritativeGap > (activeRush ? LOCAL_RUSH_SNAP_DISTANCE_PX : LOCAL_PREDICTION_SNAP_DISTANCE_PX) ||
    !Number.isFinite(prediction.lastTimeMs)
  ) {
    resetLocalPredictionState(prediction, rawPlayer, timeMs);
  }

  const dtMs = Math.max(0, Math.min(LOCAL_PREDICTION_MAX_STEP_MS, timeMs - prediction.lastTimeMs));
  prediction.lastTimeMs = timeMs;
  prediction.zoneId = rawPlayer.zoneId;
  prediction.hp = rawPlayer.hp;
  syncRushPrediction(prediction, rawPlayer);

  const halfLife = activeRush ? LOCAL_RUSH_CORRECTION_HALF_LIFE_MS : LOCAL_PREDICTION_CORRECTION_HALF_LIFE_MS;
  const correctionAlpha = dtMs > 0 ? 1 - 2 ** (-dtMs / halfLife) : 0;
  prediction.x += (rawPlayer.x - prediction.x) * correctionAlpha;
  prediction.y += (rawPlayer.y - prediction.y) * correctionAlpha;

  const spaceRushInput = input.action === "space" && selectedAbilityForSlot(rawPlayer, "Space") === "space-rush";
  const spaceVector = input.action === "space" && !spaceRushInput && spaceSlotReady(rawPlayer) ? { dx: finiteOr(input.aimX, rawPlayer.aimX) - prediction.x, dy: finiteOr(input.aimY, rawPlayer.aimY) - prediction.y } : undefined;
  const rawDx = activeRush ? 0 : spaceVector ? spaceVector.dx : input.dx ?? 0;
  const rawDy = activeRush ? 0 : spaceVector ? spaceVector.dy : input.dy ?? 0;
  const length = Math.hypot(rawDx, rawDy);
  if (dtMs > 0 && !activeRush) {
    const speed = localPlayerSpeed(rawPlayer, state, input);
    const gatheringLocked = Boolean(rawPlayer.activeGatherNodeId);
    if (gatheringLocked) {
      prediction.momentumX = 0;
      prediction.momentumY = 0;
    }
    const moving = !gatheringLocked && length > 0.05;
    const dirX = moving ? rawDx / length : 0;
    const dirY = moving ? rawDy / length : 0;
    if (moving) updateMomentum(prediction, dirX, dirY, speed, dtMs);
    else if (!gatheringLocked) decayMomentum(prediction, dtMs);
    prediction.x += (dirX * speed + prediction.momentumX) * (dtMs / 1000);
    prediction.y += (dirY * speed + prediction.momentumY) * (dtMs / 1000);
    clampToMap(prediction);
  }
  applyRushPrediction(prediction, rawPlayer, input, state, dtMs);

  visualPlayer.x = prediction.x;
  visualPlayer.y = prediction.y;
  visualPlayer.momentumX = prediction.momentumX;
  visualPlayer.momentumY = prediction.momentumY;
  if (activeRush) {
    visualPlayer.activeMs = Math.max(visualPlayer.activeMs ?? 0, prediction.rushLocalMs);
    visualPlayer.rushDistance = Math.max(visualPlayer.rushDistance ?? 0, prediction.rushDistance);
    visualPlayer.abilityVectorX = prediction.rushVectorX;
    visualPlayer.abilityVectorY = prediction.rushVectorY;
  }
  return visualPlayer;
}
