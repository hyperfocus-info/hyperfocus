import { type CollisionKernel } from "@hyperfocus/engine";
import { chargeMmoAbility, moveMmoCircle, tickMmoAbility } from "@hyperfocus/engine/mmo";
import { MOVEMENT_DASHES, PLAYER_ABILITY_DEFS } from "./shared-ability-catalog.ts";
import { abilityCastMs, activeHas, activeHitMs, activeMark, activeMarkHitMs, animationDurationScale, canInterruptActiveAbility, clearActiveAbility, combatSlotForAction, directionFromAim, endRushAbility, interruptActiveAbility, rotateVectorToward, rushProgress, rushSpeedMultiplier, spawnPlayerEffectHazard } from "./shared-combat-player.ts";
import { damageNpc } from "./shared-combat-resolution.ts";
import { hostileNpcs, setPlayerFlagStacks } from "./shared-combat-state.ts";
import { type MmoSkillDemoState, type PlayerEntity, type RuntimeInput } from "./shared-contracts.ts";
import { ensurePlayerCombatLoadout, setSlotCooldown } from "./shared-loadout.ts";
import { finishAssassinate, finishBladeBasic, finishBloodthirst, finishBrutalStrike, finishCrushingLeap, finishDeathsMark, finishExsanguinate, finishIntimidatingShout, finishNoxiousFlask, finishPummel, finishRazorWind, finishShadowLunge, finishSmokeBomb, finishThrust, finishToxicSlash, finishTwinStrike, finishVanish, fireFanOfKnives, fireRockSmash, fireThrowingDirk, tickBladeDance, tickCombatRoll, tickLeapAttack, tickOmnislash, tickRiposte, tickSwiftStep, tickWhirlwind } from "./shared-melee-abilities.ts";
import { finishBowVault, fireBolas, firePrecisionShot, fireQuickShot, fireVolley, moveBowDash, spawnArrowStorm, spawnPlayerDecoy, throwCaltrops, tickFlurry } from "./shared-projectile-abilities.ts";
import { clamp, extendU16Ms, u16Ms } from "./shared-replication-projection.ts";
import { finishApotheosis, finishAstralWalk, finishBlink, finishConsecration, finishDispelNova, finishEnfeeble, finishFlashHeal, finishFrostChain, finishGravityWell, finishHealingPulse, finishIceWall, finishMeteor, finishNightmare, finishPetrify, finishRewind, finishRupture, finishSoulBind, fireArcaneBolt, fireFocusedRay, fireHex, fireMagicMissile, fireMendingSpark, tickArcaneBubble, tickChaosVolley, tickMaelstrom, tickMirrorShield, tickPhaseShift, tickSiphonBeam, tickTranquility, tickZephyr } from "./shared-spell-abilities.ts";
import { CALTROPS_FULL_MAX_RANGE, CALTROPS_HALF_ANGLE, CALTROPS_MIN_MAX_RANGE, PLAYER_RADIUS, PUMMEL_MAX_CHARGE_MS } from "./shared-world-catalog.ts";
import { bodyRadius, canOccupy, moveRushSwept } from "./shared-world-physics.ts";

function updateActiveAbility(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  ensurePlayerCombatLoadout(player);
  if (!player.activeAbility) return false;
  const { previousMs } = tickMmoAbility(player, dt);
  const combatSlot = combatSlotForAction(input.action);
  if (combatSlot && combatSlot !== player.activeSlot && !(player.activeAbility === "mace-whirlwind" && combatSlot !== "Space")) {
    if (!canInterruptActiveAbility(player, combatSlot)) return true;
    interruptActiveAbility(player);
    return false;
  }
  if ((player.activeAbility === "mace-pummel" || player.activeAbility === "mace-rock-smash" || player.activeAbility === "bow-caltrops" || player.activeAbility === "wand-enfeeble" || player.activeAbility === "blade-razor-wind") && combatSlot !== player.activeSlot) {
    activeMark(player, "released");
  }
  const rangedResult = updateRangedActiveAbility(state, kernel, player, input, previousMs, dt);
  if (rangedResult !== undefined) return rangedResult;
  const meleeResult = updateMeleeActiveAbility(state, kernel, player, input, previousMs, dt);
  if (meleeResult !== undefined) return meleeResult;
  return updateCommonActiveAbility(state, kernel, player, input, previousMs, dt);
}

function updateRangedActiveAbility(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, previousMs: number, dt: number) {
  if (player.activeAbility === "bow-quick-shot") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-quick-shot"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-quick-shot"].castMs)) fireQuickShot(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-precision") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-precision"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-precision"].castMs)) firePrecisionShot(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-volley") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-volley"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-volley"].castMs)) fireVolley(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-bolas") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-bolas"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-bolas"].castMs)) fireBolas(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-decoy") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-decoy"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-decoy"].castMs)) {
      spawnPlayerDecoy(state, player);
      setSlotCooldown(player, "Q", PLAYER_ABILITY_DEFS["bow-decoy"].cooldownMs);
      clearActiveAbility(player);
    }
    return false;
  }
  if (player.activeAbility === "bow-caltrops") {
    chargeMmoAbility(player, 1000);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-caltrops"].castMs));
    if (state.tick % 4 === 0) {
      const ratio = clamp(player.chargeMs / 1000, 0, 1);
      const range = CALTROPS_MIN_MAX_RANGE + ratio * (CALTROPS_FULL_MAX_RANGE - CALTROPS_MIN_MAX_RANGE);
      spawnPlayerEffectHazard(state, player, "line", player.x, player.y, player.x + player.abilityVectorX * range, player.y + player.abilityVectorY * range, range, "cone", 180, Math.round((CALTROPS_HALF_ANGLE * 180) / Math.PI));
    }
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-caltrops"].castMs)) || player.chargeMs >= 1000) throwCaltrops(state, player);
    return false;
  }
  if (player.activeAbility === "bow-reposition") {
    const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-reposition"].castMs);
    moveBowDash(state, kernel, player, previousMs, dt, castMs, MOVEMENT_DASHES["bow-reposition"]);
    if (player.activeMs >= player.activeDurationMs) {
      setPlayerFlagStacks(player, "bow-empower", 3);
      clearActiveAbility(player);
    }
    return true;
  }
  if (player.activeAbility === "bow-vault") {
    const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-vault"].castMs);
    moveBowDash(state, kernel, player, previousMs, dt, castMs, MOVEMENT_DASHES["bow-vault"]);
    if (player.activeMs >= player.activeDurationMs) finishBowVault(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "bow-flurry") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    tickFlurry(state, kernel, player, dt);
    if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
    return false;
  }
  if (player.activeAbility === "bow-arrowstorm") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-arrowstorm"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-arrowstorm"].castMs)) spawnArrowStorm(state, player, input);
    return false;
  }
  return updateSpellActiveAbility(state, kernel, player, input, dt);
}

function updateSpellActiveAbility(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  if (player.activeAbility === "staff-arcane-bolt") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-arcane-bolt"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-arcane-bolt"].castMs)) fireArcaneBolt(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "staff-siphon-beam") {
    tickSiphonBeam(state, kernel, player, input, dt);
    return false;
  }
  if (player.activeAbility === "staff-meteor") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-meteor"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-meteor"].castMs)) finishMeteor(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-healing-pulse") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-healing-pulse"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-healing-pulse"].castMs)) finishHealingPulse(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-frost-chain") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-frost-chain"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-frost-chain"].castMs)) finishFrostChain(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "staff-astral-walk") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-astral-walk"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-astral-walk"].castMs)) finishAstralWalk(state, kernel, player, input);
    return true;
  }
  if (player.activeAbility === "staff-zephyr") {
    tickZephyr(state, kernel, player, dt);
    return true;
  }
  if (player.activeAbility === "staff-ice-wall") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-ice-wall"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-ice-wall"].castMs)) finishIceWall(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-arcane-bubble") {
    tickArcaneBubble(state, player, dt);
    return false;
  }
  if (player.activeAbility === "staff-petrify") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-petrify"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-petrify"].castMs)) finishPetrify(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "staff-gravity-well") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-gravity-well"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-gravity-well"].castMs)) finishGravityWell(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-consecration") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-consecration"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-consecration"].castMs)) finishConsecration(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-dispel-nova") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-dispel-nova"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-dispel-nova"].castMs)) finishDispelNova(state, player);
    return false;
  }
  if (player.activeAbility === "staff-maelstrom") {
    tickMaelstrom(state, kernel, player, input, dt);
    return false;
  }
  if (player.activeAbility === "staff-tranquility") {
    tickTranquility(state, player, dt);
    return false;
  }
  if (player.activeAbility === "wand-magic-missile") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-magic-missile"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-magic-missile"].castMs)) fireMagicMissile(state, kernel, player, input);
    return false;
  }
  if (player.activeAbility === "wand-hex") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-hex"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-hex"].castMs)) fireHex(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-mending-spark") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-mending-spark"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-mending-spark"].castMs)) fireMendingSpark(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-focused-ray") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-focused-ray"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-focused-ray"].castMs)) fireFocusedRay(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-soul-bind") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-soul-bind"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-soul-bind"].castMs)) finishSoulBind(state, player, input);
    return false;
  }
  if (player.activeAbility === "wand-flash-heal") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-flash-heal"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-flash-heal"].castMs)) finishFlashHeal(state, player, input);
    return false;
  }
  if (player.activeAbility === "wand-blink") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-blink"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-blink"].castMs)) finishBlink(state, kernel, player, input);
    return true;
  }
  if (player.activeAbility === "wand-phase-shift") {
    tickPhaseShift(state, player, dt);
    return true;
  }
  if (player.activeAbility === "wand-rewind") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rewind"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rewind"].castMs)) finishRewind(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "wand-mirror-shield") {
    tickMirrorShield(state, player, dt);
    return false;
  }
  if (player.activeAbility === "wand-nightmare") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-nightmare"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-nightmare"].castMs)) finishNightmare(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-rupture") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rupture"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rupture"].castMs)) finishRupture(state, kernel, player, input);
    return false;
  }
  if (player.activeAbility === "wand-enfeeble") {
    chargeMmoAbility(player, 1000);
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-enfeeble"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-enfeeble"].castMs)) || player.chargeMs >= 1000) finishEnfeeble(state, player, input);
    return false;
  }
  if (player.activeAbility === "wand-chaos-volley") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    tickChaosVolley(state, kernel, player, dt);
    return false;
  }
  if (player.activeAbility === "wand-apotheosis") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-apotheosis"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-apotheosis"].castMs)) finishApotheosis(state, player, input);
    return false;
  }
  return undefined;
}

function updateMeleeActiveAbility(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, previousMs: number, dt: number) {
  if (player.activeAbility === "twin-strike") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-strike"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-strike"].castMs)) finishTwinStrike(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-toxic-slash") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-toxic-slash"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-toxic-slash"].castMs)) finishToxicSlash(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-throwing-dirk") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-throwing-dirk"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-throwing-dirk"].castMs)) fireThrowingDirk(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-shadow-lunge") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-shadow-lunge"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-shadow-lunge"].castMs)) finishShadowLunge(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "twin-exsanguinate") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-exsanguinate"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-exsanguinate"].castMs)) finishExsanguinate(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-fan-of-knives") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-fan-of-knives"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-fan-of-knives"].castMs)) fireFanOfKnives(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-swift-step") {
    tickSwiftStep(state, kernel, player, previousMs, dt);
    return true;
  }
  if (player.activeAbility === "twin-smoke-bomb") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-smoke-bomb"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-smoke-bomb"].castMs)) finishSmokeBomb(state, player);
    return false;
  }
  if (player.activeAbility === "twin-vanish") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-vanish"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-vanish"].castMs)) finishVanish(state, player);
    return false;
  }
  if (player.activeAbility === "twin-noxious-flask") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-noxious-flask"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-noxious-flask"].castMs)) finishNoxiousFlask(state, player, input);
    return false;
  }
  if (player.activeAbility === "twin-deaths-mark") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-deaths-mark"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-deaths-mark"].castMs)) finishDeathsMark(state, kernel, player, input);
    return false;
  }
  if (player.activeAbility === "twin-blade-dance") {
    tickBladeDance(state, kernel, player, dt);
    return false;
  }
  if (player.activeAbility === "twin-assassinate") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-assassinate"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-assassinate"].castMs)) finishAssassinate(state, kernel, player, input);
    return true;
  }
  const abilityId = player.activeAbility;
  if (abilityId === "blade-cleave" || abilityId === "blade-sever" || abilityId === "blade-sunder") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS[abilityId].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS[abilityId].castMs)) finishBladeBasic(state, kernel, player, abilityId);
    return false;
  }
  if (player.activeAbility === "blade-brutal-strike") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-brutal-strike"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-brutal-strike"].castMs)) finishBrutalStrike(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "blade-thrust") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-thrust"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-thrust"].castMs)) finishThrust(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "blade-bloodthirst") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-bloodthirst"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-bloodthirst"].castMs)) finishBloodthirst(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "blade-combat-roll") {
    tickCombatRoll(state, kernel, player, previousMs, dt);
    return true;
  }
  if (player.activeAbility === "blade-leap-attack") {
    tickLeapAttack(state, kernel, player, previousMs, dt);
    return true;
  }
  if (player.activeAbility === "blade-riposte") {
    tickRiposte(player);
    return false;
  }
  if (player.activeAbility === "blade-intimidating-shout") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-intimidating-shout"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-intimidating-shout"].castMs)) finishIntimidatingShout(state, player);
    return false;
  }
  if (player.activeAbility === "blade-razor-wind") {
    chargeMmoAbility(player, 1000);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-razor-wind"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-razor-wind"].castMs)) || player.chargeMs >= 1000) finishRazorWind(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "blade-omnislash") {
    tickOmnislash(state, kernel, player, dt);
    return true;
  }
  if (player.activeAbility === "mace-pummel") {
    chargeMmoAbility(player, PUMMEL_MAX_CHARGE_MS);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-pummel"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-pummel"].castMs)) || player.chargeMs >= PUMMEL_MAX_CHARGE_MS) finishPummel(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "mace-rock-smash") {
    chargeMmoAbility(player, 1000);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-rock-smash"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-rock-smash"].castMs)) || player.chargeMs >= 1000) fireRockSmash(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "mace-crushing-leap") {
    player.iframeMs = Math.max(player.iframeMs, Math.max(0, 500 - player.activeMs));
    const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-crushing-leap"].castMs);
    if (player.activeMs > castMs && previousMs < player.activeDurationMs) {
      if (previousMs <= castMs) {
        const direction = directionFromAim(player, input);
        player.abilityVectorX = direction.x;
        player.abilityVectorY = direction.y;
        const distance = Math.hypot(direction.aim.x - player.x, direction.aim.y - player.y);
        player.activeDurationMs = u16Ms(Math.max(castMs + 90, castMs + Math.max(80, Math.min(500, (distance / 330) * 1000)) * animationDurationScale(player)));
      }
      const travelMs = Math.max(1, player.activeDurationMs - castMs);
      const previousTravelMs = clamp(previousMs - castMs, 0, travelMs);
      const currentTravelMs = clamp(player.activeMs - castMs, 0, travelMs);
      const move = (330 / animationDurationScale(player)) * ((currentTravelMs - previousTravelMs) / 1000);
      moveMmoCircle(
        player,
        player.abilityVectorX * move,
        player.abilityVectorY * move,
        { rectBlocked: () => false, circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius), blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius) },
        { radius: PLAYER_RADIUS }
      );
    }
    if (player.activeMs >= player.activeDurationMs) finishCrushingLeap(state, kernel, player);
    return true;
  }
  return undefined;
}

function updateCommonActiveAbility(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, previousMs: number, dt: number) {
  if (player.activeAbility === "space-rush") {
    const storedWindupMs = activeHitMs(player, "windup", "rush");
    const rushWindupMs = Number.isFinite(storedWindupMs) ? storedWindupMs : abilityCastMs(player, PLAYER_ABILITY_DEFS["space-rush"].castMs);
    if (input.action !== "space" && player.activeMs > 500) {
      endRushAbility(player);
      return false;
    }
    if (player.activeMs < rushWindupMs) {
      player.castMs = Math.max(player.castMs, Math.floor(rushWindupMs - player.activeMs));
      return true;
    }
    if (player.activeMs >= player.activeDurationMs) {
      player.action = "idle";
      endRushAbility(player);
      return false;
    }
    if (previousMs <= rushWindupMs) {
      const startDirection = directionFromAim(player, input);
      player.abilityVectorX = startDirection.x;
      player.abilityVectorY = startDirection.y;
      player.abilityTickMs = 0;
    }
    const rushT = rushProgress(player.activeMs, rushWindupMs, player.activeDurationMs);
    const direction = directionFromAim(player, input);
    const maxTurnDeg = 3 - rushT * 2.7;
    const turned = rotateVectorToward(player.abilityVectorX, player.abilityVectorY, direction.x, direction.y, (maxTurnDeg * Math.PI) / 180);
    player.abilityVectorX = turned.x;
    player.abilityVectorY = turned.y;
    const beforeX = player.x;
    const beforeY = player.y;
    const baseSpeed = 118 + Math.min(38, player.combatLevel * 2) + Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
    const move = baseSpeed * rushSpeedMultiplier(player.activeMs, rushWindupMs, player.activeDurationMs) * dt;
    moveRushSwept(state, kernel, player, player.abilityVectorX * move, player.abilityVectorY * move);
    player.rushDistance = u16Ms(player.rushDistance + Math.hypot(player.x - beforeX, player.y - beforeY));
    const hitRadius = PLAYER_RADIUS * 1.2 * (1 + rushT * 1.5);
    for (const target of hostileNpcs(state, player)) {
      if (player.activeMs - activeHitMs(player, "rush", target.id) < 1000) continue;
      if (Math.hypot(target.x - player.x, target.y - player.y) > hitRadius + bodyRadius(target)) continue;
      activeMarkHitMs(player, "rush", target.id, player.activeMs);
      const scale = clamp(player.rushDistance / 240, 0, 1);
      if (damageNpc(state, kernel, player, target, Math.floor(8 + player.combatLevel * 1.5 + scale * 18), { knockbackModifier: 0.8 + scale * 2.2, isHeavyImpact: scale > 0.55, energyGain: PLAYER_ABILITY_DEFS["space-rush"].energyGain })) {
        target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 450);
      }
    }
    return true;
  }
  if (player.activeAbility === "q-berserk") {
    if (player.activeMs >= 750) clearActiveAbility(player);
    return false;
  }
  if (player.activeAbility === "mace-whirlwind") {
    tickWhirlwind(state, kernel, player, dt);
    if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
    return false;
  }
  return false;
}

export {
  updateActiveAbility
};
