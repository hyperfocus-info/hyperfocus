import { type CollisionKernel } from "@hyperfocus/engine";
import { getMmoSkillDemoAnchorTile } from "./data/world.ts";
import { type AbilitySlot, MAX_ENERGY, MOVEMENT_DASHES, SLOT_ACTIONS } from "./shared-ability-catalog.ts";
import { abilityCastMs, activeMarkHitMs, animationDurationScale, applyDevCheat, beginActiveAbility, canInterruptActiveAbility, combatSlotForAction, devCheatsEnabled, interruptActiveAbility } from "./shared-combat-player.ts";
import { addEnergy, aimPoint, findNearest, nearestNpc, setCooldown, setPlayerFlagStacks, startEscort, useConsumable } from "./shared-combat-state.ts";
import { ALCHEMIST_CRAFT_RECIPES, MERCHANT_CRAFT_RECIPES } from "./shared-content-catalog.ts";
import { type MmoSkillDemoState, type PlayerEntity, type RuntimeInput } from "./shared-contracts.ts";
import { applyMarketTransaction, craftRequestedOrFirst, grantFactionRep, marketNpcForInput } from "./shared-economy.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { gatherResource } from "./shared-gathering.ts";
import { abilityDefForSlot, addItem, applyProvingCommand, configureAbilitySlot, configureWeapon, depositInventoryItem, ensurePlayerCombatLoadout, isAbilitySlot, isSlotReady, setSlotCooldown, utilityCooldownReady } from "./shared-loadout.ts";
import { applyBloodlust, applyBlur, applyDuelistsTrance, applyIronWill, applyJuggernaut } from "./shared-melee-abilities.ts";
import { chooseDailyQuestBranch, progressDailyQuest } from "./shared-progression.ts";
import { applyBowStealth, beginBowReposition, beginBowVault } from "./shared-projectile-abilities.ts";
import { interactWithNpc, nearestLoot, pickupLoot, refreshQuestProgress, selectMainQuest, travelWithCaptain } from "./shared-quests.ts";
import { u16Ms } from "./shared-replication-projection.ts";
import { PUMMEL_MAX_CHARGE_MS, RUSH_DURATION_MS } from "./shared-world-catalog.ts";

function startPlayerCombatAbility(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  ensurePlayerCombatLoadout(player);
  const slot = combatSlotForAction(input.action);
  if (!slot) return false;
  const def = abilityDefForSlot(player, slot);
  if (!def) return false;
  if (player.activeAbility && player.activeSlot === slot) return true;
  if (!isSlotReady(player, slot)) return false;
  if (player.activeAbility) {
    if (!canInterruptActiveAbility(player, slot)) return false;
    interruptActiveAbility(player);
  }
  player.action = SLOT_ACTIONS[slot];
  player.targetId = input.targetId.slice(0, 32);
  if (slot === "Space") progressDailyQuest(player, { kind: "space", amount: 1 });
  switch (def.id) {
    case "mace-pummel":
      beginActiveAbility(player, slot, def.id, input, PUMMEL_MAX_CHARGE_MS);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "mace-crushing-leap":
      beginActiveAbility(player, slot, def.id, input, 600);
      {
        const aim = aimPoint(player, input);
        const distance = Math.hypot(aim.x - player.x, aim.y - player.y);
        player.activeDurationMs = u16Ms(Math.max(90, (100 + Math.max(80, Math.min(500, (distance / 330) * 1000))) * animationDurationScale(player)));
      }
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.iframeMs = Math.max(player.iframeMs, 500);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "space-rush":
      beginActiveAbility(player, slot, def.id, input, RUSH_DURATION_MS);
      activeMarkHitMs(player, "windup", "rush", abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "q-berserk":
      beginActiveAbility(player, slot, def.id, input, 750);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.guardMs = 750;
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "mace-rock-smash":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "mace-whirlwind":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2750);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "bow-quick-shot":
    case "bow-precision":
    case "bow-volley":
    case "bow-bolas":
    case "bow-decoy":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "bow-reposition":
      beginBowReposition(player, slot, def, input);
      return true;
    case "bow-vault":
      beginBowVault(player, slot, def, input);
      return true;
    case "bow-stealth":
      applyBowStealth(player, slot, def, input);
      return true;
    case "bow-caltrops":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "bow-flurry":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 5000);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "flurry", 0);
      return true;
    case "bow-arrowstorm":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-arcane-bolt":
    case "staff-meteor":
    case "staff-healing-pulse":
    case "staff-frost-chain":
    case "staff-astral-walk":
    case "staff-ice-wall":
    case "staff-petrify":
    case "staff-gravity-well":
    case "staff-consecration":
    case "staff-dispel-nova":
    case "wand-magic-missile":
    case "wand-hex":
    case "wand-mending-spark":
    case "wand-focused-ray":
    case "wand-soul-bind":
    case "wand-flash-heal":
    case "wand-blink":
    case "wand-rewind":
    case "wand-nightmare":
    case "wand-rupture":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-siphon-beam":
      beginActiveAbility(player, slot, def.id, input, 65000);
      return true;
    case "staff-zephyr":
      beginActiveAbility(player, slot, def.id, input, 3000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "staff-arcane-bubble":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 3000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "wand-phase-shift":
      beginActiveAbility(player, slot, def.id, input, 1500);
      player.iframeMs = Math.max(player.iframeMs, 1500);
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "wand-mirror-shield":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "wand-enfeeble":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-maelstrom":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 4000);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-tranquility":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 4500);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "wand-chaos-volley":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 3000);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "chaos", 0);
      return true;
    case "wand-apotheosis":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    default:
      return startMeleeCombatAbility(state, player, slot, def, input);
  }
}

function startMeleeCombatAbility(
  state: MmoSkillDemoState,
  player: PlayerEntity,
  slot: AbilitySlot,
  def: NonNullable<ReturnType<typeof abilityDefForSlot>>,
  input: RuntimeInput
) {
  switch (def.id) {
    case "twin-strike":
    case "twin-toxic-slash":
    case "twin-throwing-dirk":
    case "twin-shadow-lunge":
    case "twin-exsanguinate":
    case "twin-fan-of-knives":
    case "twin-smoke-bomb":
    case "twin-vanish":
    case "twin-noxious-flask":
    case "twin-deaths-mark":
    case "blade-cleave":
    case "blade-sever":
    case "blade-sunder":
    case "blade-brutal-strike":
    case "blade-thrust":
    case "blade-bloodthirst":
    case "blade-intimidating-shout":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "twin-swift-step":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 200);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "twin-bloodlust":
      applyBloodlust(state, player, slot, def, input);
      return true;
    case "twin-blur":
      applyBlur(player, slot, def, input);
      return true;
    case "twin-blade-dance":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2500);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "blade", 0);
      return true;
    case "twin-assassinate":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "blade-combat-roll":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + MOVEMENT_DASHES["blade-combat-roll"].durationMs);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.iframeMs = Math.max(player.iframeMs, abilityCastMs(player, def.castMs) + MOVEMENT_DASHES["blade-combat-roll"].durationMs);
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "blade-leap-attack":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + MOVEMENT_DASHES["blade-leap-attack"].durationMs);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "blade-juggernaut":
      applyJuggernaut(state, player, slot, def, input);
      return true;
    case "blade-riposte":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.guardMs = 1000;
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "blade-iron-will":
      applyIronWill(state, player, slot, def, input);
      return true;
    case "blade-razor-wind":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "blade-omnislash":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2500);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "omni", 0);
      return true;
    case "blade-duelists-trance":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      applyDuelistsTrance(state, player, slot, def, input);
      return true;
    default:
      return false;
  }
}

function applyPlayerAction(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  ensurePlayerCombatLoadout(player);
  player.action = input.action;
  const nextTargetId = input.targetId.slice(0, 32);
  if (nextTargetId || !combatSlotForAction(input.action)) player.targetId = nextTargetId;
  if (input.action === "idle") {
    if (isAbilitySlot(player.activeSlot)) player.action = SLOT_ACTIONS[player.activeSlot];
    return;
  }

  if (input.action === "dev") {
    if (devCheatsEnabled()) applyDevCheat(player, input);
    return;
  }

  if (input.action === "use-item") {
    if (utilityCooldownReady(player, "use-item") && useConsumable(player, input.itemId)) setCooldown(player, "use-item");
    return;
  }

  if (input.action === "config") {
    if (input.devField === "dailyChoice") chooseDailyQuestBranch(player, input.devText);
    else if (input.devField === "proving") applyProvingCommand(player, input.devText);
    else if (input.devField === "mainQuest") selectMainQuest(player, input.devText);
    else if (input.devField === "weapon") configureWeapon(player, input.devText);
    else configureAbilitySlot(player, input.devField, input.devText);
    return;
  }

  if ((input.action === "interact" || input.action === "travel" || input.action === "bank" || input.action === "trade") && utilityCooldownReady(player, input.action)) {
    if (input.action === "travel") {
      const captain = nearestNpc(player, state, "travel", 84);
      if (captain) {
        player.targetId = captain.id;
        if (captain.kind === "runner-kael") {
          if (input.devText) travelWithCaptain(player, input.devText);
          else {
            const deepFissure = getMmoSkillDemoAnchorTile(player.zoneId === "ashwood-wilderness" ? "oakhaven" : "deep-fissure");
            startEscort(player, captain, deepFissure.x, deepFissure.y, player.zoneId === "ashwood-wilderness" ? "ashwood" : "crags", 12000);
          }
        } else if (captain.kind === "navigator-kai") {
          if (input.devText) travelWithCaptain(player, input.devText);
          else {
            const route = player.zoneId === "whisperwind-ascent" ? getMmoSkillDemoAnchorTile("aetheria") : getMmoSkillDemoAnchorTile("port-marrow");
            startEscort(player, captain, route.x + 2, route.y + 1, player.zoneId === "whisperwind-ascent" ? "holy-reach" : "port-marrow", 7000);
          }
        } else {
          travelWithCaptain(player, input.devText);
        }
        setCooldown(player, "travel");
      }
      return;
    }
    if (input.action === "bank") {
      const banker = nearestNpc(player, state, "bank", 84);
      if (banker) {
        player.targetId = banker.id;
        depositInventoryItem(player, "ash-logs");
        depositInventoryItem(player, "iron-ore");
        refreshQuestProgress(player);
        setCooldown(player, "bank");
      }
      return;
    }
    if (input.action === "trade") {
      const merchant = marketNpcForInput(state, player, input);
      if (merchant) {
        player.targetId = merchant.id;
        if (input.devField === "market") {
          applyMarketTransaction(player, merchant, input.devText, input.itemId);
          setCooldown(player, "trade");
          return;
        }
        const crafted = merchant.kind === "alchemist-zora"
          ? craftRequestedOrFirst(player, ALCHEMIST_CRAFT_RECIPES, input.devText)
          : merchant.kind === "merchant-kaya" || merchant.kind === "broker-rex" || merchant.kind === "merchant-lynd" || merchant.kind === "appraiser-chloe"
            ? craftRequestedOrFirst(player, MERCHANT_CRAFT_RECIPES, input.devText)
            : false;
        if (!crafted && merchant.role === "merchant" && player.gold >= 8) {
          player.gold -= 8;
          addItem(player, "speed-potion", 1);
          addItem(player, "cinder-ale", 1);
          grantFactionRep(player, merchant.zoneId === "canaan-desert" ? "sunken-bazaar" : "port-marrow", 1);
        }
        setCooldown(player, "trade");
      }
      return;
    }
    const loot = input.targetId ? state.loots[input.targetId] : nearestLoot(player, state);
    if (loot && pickupLoot(state, player, loot)) {
      setCooldown(player, "interact");
      return;
    }
    if (interactWithNpc(state, player, input)) return;
    const node = input.targetId ? state.resources[input.targetId] : findNearest(player, entitiesOfType(state, "resource"), (resource) => !resource.depleted, 58);
    if (node) {
      gatherResource(state, kernel, player, node.kind === "ore" ? "mine" : node.kind === "tree" ? "woodcut" : "interact", node.id, "interact");
      return;
    }
  }

  const canBreakControl = input.action === "q" && abilityDefForSlot(player, "Q")?.id === "blade-iron-will" && isSlotReady(player, "Q");
  if (player.stunMs > 0 && !canBreakControl) {
    player.action = "idle";
    return;
  }

  const combatAction = input.action === "attack" || input.action === "lmb" || input.action === "rmb" || input.action === "space" || input.action === "q" || input.action === "e" || input.action === "r";
  if (combatAction) {
    const started = startPlayerCombatAbility(state, kernel, player, input.action === "attack" ? { ...input, action: "lmb" } : input);
    if (!started && !player.activeAbility) player.action = "idle";
    return;
  }

  if (input.action === "mine" || input.action === "woodcut") gatherResource(state, kernel, player, input.action, input.targetId);
}

export {
  applyPlayerAction,
  startPlayerCombatAbility
};
