import { PERF_FLAGS } from "./environment.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const advanceSelectedClassLevel = runtimeCallback("progressionData", "advanceSelectedClassLevel");
const classUnlockNoticeText = runtimeCallback("progressionData", "classUnlockNoticeText");
const resolveProgressionStats = runtimeCallback("progressionData", "resolveProgressionStats");
const selectedClass = runtimeCallback("progressionData", "selectedClass");
const selectedClassLevel = runtimeCallback("progressionData", "selectedClassLevel");
const xpForLevel = runtimeCallback("progressionData", "xpForLevel");
const getWeaponLevel = runtimeCallback("progressionRuntime", "getWeaponLevel");
const playActorAnimation = runtimeCallback("actorAnimation", "playActorAnimation");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const choiceVisual = runtimeCallback("contentUi", "choiceVisual");
const clamp = runtimeCallback("hud", "clamp");
const pulseShake = runtimeCallback("hud", "pulseShake");
const round = runtimeCallback("hud", "round");
const roundToStep = runtimeCallback("hud", "roundToStep");
const updateHud = runtimeCallback("hud", "updateHud");
const setMenuFocus = runtimeCallback("inputAndMenu", "setMenuFocus");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const applyLevelChoice = runtimeCallback("progressionUi", "applyLevelChoice");
const choicePayoffLines = runtimeCallback("progressionUi", "choicePayoffLines");
const renderClassPicker = runtimeCallback("progressionUi", "renderClassPicker");
const renderLoadoutConfig = runtimeCallback("progressionUi", "renderLoadoutConfig");
const selectLevelChoice = runtimeCallback("progressionUi", "selectLevelChoice");
const updateLevelChoiceControls = runtimeCallback("progressionUi", "updateLevelChoiceControls");
const actorFloatingTextHeight = runtimeCallback("rewardFeedback", "actorFloatingTextHeight");
const pulseOverlay = runtimeCallback("rewardFeedback", "pulseOverlay");
const spawnFloatingText = runtimeCallback("rewardFeedback", "spawnFloatingText");
import { state } from "./arena-state.ts";
import { PASSIVE_TEAMWORK_EFFECTS, RUN_STAT_DEFINITIONS, data, passiveItemsById, weaponsById } from "./content-runtime.ts";
import { ui } from "./user-interface.ts";
import type { RunStatDefinition } from "./content-runtime.ts";
import type { EvolutionLevelChoice, HealLevelChoice, LevelChoice, PassiveDefinition, PassiveLevelChoice, PassiveTeamworkEffect, ProgressionBonus, StatLevelChoice, WeaponLevelChoice } from "./content-types.ts";

export function grantXp(amount: number): void {
  const stats = state.progressionStats ?? resolveProgressionStats();
  state.xp += Math.max(1, Math.round(amount * (stats.xpMultiplier ?? 1)));
  let leveled = false;
  while (state.xp >= state.nextXp) {
    state.xp -= state.nextXp;
    state.level += 1;
    advanceSelectedClassLevel();
    state.nextXp = xpForLevel(state.level);
    state.pendingLevelChoices += 1;
    leveled = true;
  }
  if (leveled) {
    renderClassPicker();
    renderLoadoutConfig();
    updateHud(0, true);
    if (PERF_FLAGS.benchNoLevelChoices) {
      state.pendingLevelChoices = 0;
      state.levelChoice = null;
      state.resumeAfterLevelChoice = false;
      return;
    }
    openNextLevelChoice();
  }
}

export function openNextLevelChoice(): void {
  if (!state.pendingLevelChoices || state.levelChoice || !ui.levelChoiceOverlay || !ui.levelChoiceGrid) return;
  const player = state.player;
  if (!player) return;
  state.resumeAfterLevelChoice = state.resumeAfterLevelChoice || state.running;
  state.running = false;
  document.exitPointerLock?.();
  const choices = buildLevelUpChoices();
  state.levelChoice = { choices, selectedIndex: 0 };
  renderLevelChoices(choices);
  document.body.classList.add("level-choice-open");
  ui.levelChoiceOverlay.classList.remove("hidden");
  const unlockText = classUnlockNoticeText(state.classLevelNotice);
  ui.levelChoiceSubtitle.textContent = unlockText
    ? `${selectedClass()?.name ?? "Class"} L${selectedClassLevel()}: new kit unlocked, ${unlockText}.`
    : `${selectedClass()?.name ?? "Class"} L${selectedClassLevel()}. Choose one edge before the graves move again.`;
  updateLevelChoiceControls();
  player.animLock = 0.55;
  playActorAnimation(player, "celebrate", 0.04);
  pulseOverlay("level");
  playSynthCue("level");
  spawnPulseRing(player.x, player.z, selectedClass()?.color ?? "#9fe8ff", 0.64, 1.2, 6);
  spawnFloatingText("LEVEL UP", player.x, player.z, "#bff7ff", 1.28, { targetHeight: actorFloatingTextHeight(player, 0.55) });
  pulseShake(0.45, 0.35);
  setMenuFocus(0);
}

export function closeLevelChoice(): void {
  state.levelChoice = null;
  document.body.classList.remove("level-choice-open");
  ui.levelChoiceOverlay?.classList.add("hidden");
  ui.levelChoiceGrid?.replaceChildren();
  updateLevelChoiceControls();
}

export function levelChoiceCount(): number {
  return Math.max(1, Math.floor(data.progression?.levelChoiceCount ?? 3));
}

export function levelChoiceCharge(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function levelChoiceKey(choice: LevelChoice): string {
  return `${choice.kind}:${choice.id}:${choice.targetLevel ?? 0}:${choice.effect?.id ?? ""}`;
}

export function rollStatAmount(definition: RunStatDefinition): number {
  const min = Number(definition.min);
  const max = Number(definition.max);
  const step = Number(definition.step ?? 0);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 1;
  if (!Number.isFinite(step) || step <= 0) return round(min + Math.random() * (max - min));
  const steps = Math.max(0, Math.round((max - min) / step));
  return roundToStep(min + Math.floor(Math.random() * (steps + 1)) * step, step);
}

export function createRolledStatChoice(
  definition: RunStatDefinition,
  options: { badge?: string; subtitle?: string } = {}
): StatLevelChoice {
  const amount = rollStatAmount(definition);
  return createStatChoice(
    definition.id,
    definition.title,
    definition.description(amount),
    definition.bonus(amount),
    definition.color,
    definition.category,
    options.badge ?? definition.badge,
    options.subtitle ?? "Weapon property",
    amount
  );
}

export function rollChestStatReward(): StatLevelChoice {
  const definition = RUN_STAT_DEFINITIONS[Math.floor(Math.random() * RUN_STAT_DEFINITIONS.length)];
  if (!definition) throw new Error("Run stat definitions are empty.");
  return createRolledStatChoice(definition, { badge: "Cache", subtitle: "Chest stat" });
}

export function passiveTeamworkEffectIds(passiveId: string): string[] {
  return state.passiveTeamworkEffects.get(passiveId) ?? [];
}

export function addPassiveTeamworkEffect(passiveId: string, effectId: string): boolean {
  if (!passiveItemsById.has(passiveId)) return false;
  const current = passiveTeamworkEffectIds(passiveId);
  if (current.includes(effectId)) return false;
  state.passiveTeamworkEffects.set(passiveId, [...current, effectId]);
  return true;
}

export function rollPassiveTeamworkEffect(
  passiveId: string,
  excludedEffectIds: ReadonlySet<string> = new Set<string>()
): PassiveTeamworkEffect | null {
  const owned = new Set(passiveTeamworkEffectIds(passiveId));
  const pool = PASSIVE_TEAMWORK_EFFECTS.filter((effect) => !owned.has(effect.id) && !excludedEffectIds.has(effect.id));
  const candidates = pool.length ? pool : PASSIVE_TEAMWORK_EFFECTS.filter((effect) => !owned.has(effect.id));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

export function buildLevelUpChoices(excludedKeys: ReadonlySet<string> | null = null): LevelChoice[] {
  const candidates: LevelChoice[] = RUN_STAT_DEFINITIONS.map((definition) => createRolledStatChoice(definition));
  for (const id of state.passiveSlots) {
    if (!state.startingPassiveIds.has(id)) continue;
    const passive = passiveItemsById.get(id);
    const current = state.passiveLevels.get(id) ?? 0;
    if (passive && current < (passive.maxLevel ?? 1)) {
      const excludedEffectIds = new Set<string>();
      for (const key of excludedKeys ?? []) {
        const [, passiveId, , effectId] = String(key).split(":");
        if (passiveId === id && effectId) excludedEffectIds.add(effectId);
      }
      candidates.push(createPassiveTeamworkChoice(id, current + 1, excludedEffectIds));
    }
  }
  const unique: LevelChoice[] = [];
  const seen = new Set<string>();
  for (const choice of candidates) {
    const key = `${choice.kind}:${choice.id}:${choice.targetLevel ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(choice);
  }
  const count = levelChoiceCount();
  const draftPool = unique.filter((choice) => !state.banishedLevelChoices.has(levelChoiceKey(choice)));
  const freshPool = excludedKeys?.size
    ? draftPool.filter((choice) => !excludedKeys.has(levelChoiceKey(choice)))
    : draftPool;
  const available = freshPool.length >= Math.min(count, draftPool.length)
    ? freshPool
    : [
      ...freshPool,
      ...draftPool.filter((choice) => excludedKeys?.has(levelChoiceKey(choice)))
    ];
  const bias = new Set(selectedClass()?.passiveBias ?? []);
  available.sort((a, b) => choiceScore(b, bias) - choiceScore(a, bias));
  const selected = available.slice(0, count);
  const passiveCandidate = available.find((choice) => choice.kind === "passive");
  if (passiveCandidate && !selected.some((choice) => choice.kind === "passive")) {
    selected[Math.max(0, selected.length - 1)] = passiveCandidate;
  }
  return selected;
}

export function choiceScore(choice: LevelChoice, bias: ReadonlySet<string>): number {
  let score = Math.random();
  if (choice.kind === "evolution") score += 5;
  if (choice.kind === "weapon" && choice.owned) score += 1.6;
  if (choice.kind === "passive" && choice.owned) score += 1.35;
  if (bias.has(choice.category)) score += 1.2;
  if (choice.kind === "heal" && state.player && state.player.hp < state.player.maxHp * 0.45) score += 2.2;
  return score;
}

export function createWeaponChoice(id: string, targetLevel: number): WeaponLevelChoice {
  const weapon = weaponsById.get(id);
  if (!weapon) throw new Error(`Unknown weapon choice: ${id}`);
  const bonus = (weapon?.levels ?? []).find((entry) => entry.level === targetLevel);
  const owned = state.weaponSlots.includes(id);
  return {
    kind: "weapon",
    id,
    targetLevel,
    owned,
    title: owned ? `${weapon.name} ${formatLevel(targetLevel)}` : weapon.name,
    badge: owned ? `L${targetLevel}` : "New",
    subtitle: owned ? (bonus?.stateLabel ?? weapon.stateLabel ?? "Weapon upgrade") : "New weapon",
    description: owned ? describeWeaponBonus(bonus) : (weapon.fantasy ?? weapon.stateLabel ?? "Adds another auto-fire line."),
    color: weapon.color ?? "#d7ff8d",
    category: bonus?.category ?? weapon.categories?.utility ?? "damage"
  };
}

export function createPassiveChoice(id: string, targetLevel: number): PassiveLevelChoice {
  const passive = passiveItemsById.get(id);
  if (!passive) throw new Error(`Unknown passive choice: ${id}`);
  const bonus = (passive?.bonuses ?? []).find((entry) => entry.level === targetLevel);
  const owned = state.passiveSlots.includes(id);
  return {
    kind: "passive",
    id,
    targetLevel,
    owned,
    title: owned ? `${passive.name} ${formatLevel(targetLevel)}` : passive.name,
    badge: owned ? `L${targetLevel}` : "New",
    subtitle: bonus?.stateLabel ?? passive.stateLabel ?? "Passive",
    description: describePassiveBonus(bonus, passive),
    color: passive.visual?.color ?? "#d7ff8d",
    category: bonus?.category ?? "utility"
  };
}

export function createPassiveTeamworkChoice(
  id: string,
  targetLevel: number,
  excludedEffectIds: ReadonlySet<string> = new Set<string>()
): PassiveLevelChoice {
  const passive = passiveItemsById.get(id);
  if (!passive) throw new Error(`Unknown passive teamwork choice: ${id}`);
  const effect = rollPassiveTeamworkEffect(id, excludedEffectIds);
  const fallbackBonus = (passive?.bonuses ?? []).find((entry) => entry.level === targetLevel);
  const description = effect
    ? `${effect.description}: ${describeGenericBonus(effect.bonus)}`
    : describePassiveBonus(fallbackBonus, passive);
  return {
    kind: "passive",
    id,
    targetLevel,
    owned: true,
    effect,
    title: `${passive.name} ${formatLevel(targetLevel)}`,
    badge: effect?.badge ?? `L${targetLevel}`,
    subtitle: effect ? effect.title : (fallbackBonus?.stateLabel ?? passive.stateLabel ?? "Passive"),
    description,
    color: effect?.color ?? passive.visual?.color ?? "#d7ff8d",
    category: effect?.category ?? fallbackBonus?.category ?? "utility"
  };
}

export function createEvolutionChoice(id: string): EvolutionLevelChoice {
  const weapon = weaponsById.get(id);
  if (!weapon) throw new Error(`Unknown evolution choice: ${id}`);
  return {
    kind: "evolution",
    id,
    title: weapon.evolution?.name ?? `${weapon.name}+`,
    badge: "Evo",
    subtitle: weapon.evolution?.stateLabel ?? "Evolved weapon",
    description: weapon.evolution?.change ?? "Transforms maxed weapon into a stronger pattern.",
    color: weapon.evolution?.color ?? weapon.color ?? "#fff4a6",
    category: "evolution"
  };
}

export function createStatChoice(
  id: string,
  title: string,
  description: string,
  bonus: ProgressionBonus,
  color: string,
  category: string,
  badge = "Core",
  subtitle = "Weapon property",
  amount: number | null = null
): StatLevelChoice {
  return { kind: "stat", id, title, badge, subtitle, description, bonus, color, category, amount };
}

export function createHealChoice(): HealLevelChoice {
  return { kind: "heal", id: "fieldVial", title: "Field Vial", badge: "Heal", subtitle: "Recover now", description: "Patch 35 HP before the next pack closes.", color: "#85ff9a", category: "survival" };
}

export function canEvolveWeapon(id: string): boolean {
  const weapon = weaponsById.get(id);
  if (!weapon?.evolution || state.evolvedWeapons.has(id)) return false;
  if (getWeaponLevel(id) < (weapon.maxLevel ?? data.progression?.evolutionLevel ?? 8)) return false;
  const required = weapon.evolution.requires;
  if (!required) return true;
  return (state.passiveLevels.get(required) ?? 0) >= (passiveItemsById.get(required)?.maxLevel ?? data.progression?.passiveEvolutionLevel ?? 5);
}

export function describeWeaponBonus(bonus: ProgressionBonus | null | undefined): string {
  if (!bonus) return "Unlocks base attack pattern.";
  const parts: string[] = [];
  if (bonus.damage) parts.push(`damage +${bonus.damage}`);
  if (bonus.projectiles || bonus.orbitals || bonus.summons || bonus.pulseCount) parts.push("extra shot");
  if (bonus.pierce) parts.push(`pierce +${bonus.pierce}`);
  if (bonus.cooldownMultiplier) parts.push("faster cooldown");
  if (bonus.knockback) parts.push("more shove");
  return parts.length ? parts.join(", ") : (bonus.stateLabel ?? "Better weapon rhythm.");
}

export function describePassiveBonus(
  bonus: ProgressionBonus | null | undefined,
  passive: PassiveDefinition | null | undefined
): string {
  if (!bonus) return passive?.stateLabel ?? "Passive upgrade.";
  const parts: string[] = [];
  if (bonus.auraRadiusMultiplier) parts.push(`radius +${percentDelta(bonus.auraRadiusMultiplier)}`);
  if (bonus.auraDamageMultiplier) parts.push(`aura damage +${percentDelta(bonus.auraDamageMultiplier)}`);
  if (bonus.cooldownMultiplier) parts.push(`cooldown -${percentDelta(1 / bonus.cooldownMultiplier)}`);
  if (bonus.damageMultiplier) parts.push(`damage +${percentDelta(bonus.damageMultiplier)}`);
  if (bonus.silverDamageMultiplier) parts.push(`silver damage +${percentDelta(bonus.silverDamageMultiplier)}`);
  if (bonus.eliteDamageMultiplier) parts.push(`elite damage +${percentDelta(bonus.eliteDamageMultiplier)}`);
  if (bonus.moveSpeedMultiplier) parts.push(`move speed +${percentDelta(bonus.moveSpeedMultiplier)}`);
  if (bonus.pickupRadiusFlat) parts.push(`pickup +${round(bonus.pickupRadiusFlat)}`);
  if (bonus.armorFlat) parts.push(`armor +${bonus.armorFlat}`);
  if (bonus.contactThornsDamage) parts.push(`contact punish +${bonus.contactThornsDamage}`);
  if (bonus.knockbackResistFlat) parts.push(`knockback resist +${Math.round(bonus.knockbackResistFlat * 100)}%`);
  if (bonus.effectDurationMultiplier) parts.push(`duration +${percentDelta(bonus.effectDurationMultiplier)}`);
  if (bonus.bleedDamageMultiplier) parts.push(`bleed damage +${percentDelta(bonus.bleedDamageMultiplier)}`);
  if (bonus.healMultiplier) parts.push(`healing +${percentDelta(bonus.healMultiplier)}`);
  if (bonus.maxHpFlat) parts.push(`max HP +${bonus.maxHpFlat}`);
  return parts.length ? parts.join(", ") : (bonus.stateLabel ?? bonus.badge ?? "Passive upgrade.");
}

export function describeGenericBonus(bonus: ProgressionBonus = {}): string {
  const parts: string[] = [];
  if (bonus.damageMultiplier) parts.push(`damage +${percentDelta(bonus.damageMultiplier)}`);
  if (bonus.cooldownMultiplier) parts.push(`attack speed +${percentDelta(1 / bonus.cooldownMultiplier)}`);
  if (bonus.critChanceFlat) parts.push(`crit +${formatPercentPoints(bonus.critChanceFlat)}`);
  if (bonus.critMultiplier) parts.push(`crit damage +${percentDelta(bonus.critMultiplier)}`);
  if (bonus.projectileCountFlat) parts.push(`projectiles +${bonus.projectileCountFlat}`);
  if (bonus.projectileSpeedMultiplier) parts.push(`shot speed +${percentDelta(bonus.projectileSpeedMultiplier)}`);
  if (bonus.projectileSizeMultiplier) parts.push(`shot size +${percentDelta(bonus.projectileSizeMultiplier)}`);
  if (bonus.splashDamageFlat) parts.push(`splash +${formatPercentPoints(bonus.splashDamageFlat)}`);
  if (bonus.moveSpeedMultiplier) parts.push(`move +${percentDelta(bonus.moveSpeedMultiplier)}`);
  if (bonus.jumpHeightMultiplier) parts.push(`jump +${percentDelta(bonus.jumpHeightMultiplier)}`);
  if (bonus.gravityMultiplier) parts.push(`gravity -${percentDelta(1 / bonus.gravityMultiplier)}`);
  if (bonus.maxJumpsFlat) parts.push(`jumps +${bonus.maxJumpsFlat}`);
  if (bonus.xpMultiplier) parts.push(`XP +${percentDelta(bonus.xpMultiplier)}`);
  if (bonus.luckMultiplier) parts.push(`luck +${percentDelta(bonus.luckMultiplier)}`);
  if (bonus.pickupRadiusFlat) parts.push(`pickup +${round(bonus.pickupRadiusFlat)}`);
  if (bonus.regenFlat) parts.push(`regen +${round(bonus.regenFlat)}`);
  if (bonus.healMultiplier) parts.push(`healing +${percentDelta(bonus.healMultiplier)}`);
  if (bonus.armorFlat) parts.push(`armor +${bonus.armorFlat}`);
  if (bonus.maxHpFlat) parts.push(`max HP +${bonus.maxHpFlat}`);
  if (bonus.knockbackForceMultiplier) parts.push(`shove +${percentDelta(bonus.knockbackForceMultiplier)}`);
  if (bonus.knockbackResistFlat) parts.push(`resist +${formatPercentPoints(bonus.knockbackResistFlat)}`);
  if (bonus.contactGraceSecondsFlat) parts.push("contact grace");
  if (bonus.auraRadiusMultiplier) parts.push(`aura +${percentDelta(bonus.auraRadiusMultiplier)}`);
  if (bonus.eliteDamageMultiplier) parts.push(`elite +${percentDelta(bonus.eliteDamageMultiplier)}`);
  if (bonus.silverDamageMultiplier) parts.push(`silver +${percentDelta(bonus.silverDamageMultiplier)}`);
  if (bonus.fireDamageMultiplier) parts.push(`fire +${percentDelta(bonus.fireDamageMultiplier)}`);
  if (bonus.plagueDamageMultiplier) parts.push(`plague +${percentDelta(bonus.plagueDamageMultiplier)}`);
  if (bonus.bleedDamageMultiplier) parts.push(`bleed +${percentDelta(bonus.bleedDamageMultiplier)}`);
  return parts.join(", ") || "team effect";
}

export function percentDelta(multiplier: number): string {
  return `${Math.max(1, Math.round((multiplier - 1) * 100))}%`;
}

export function formatPercentPoints(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatLevel(level: number): string {
  const numerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  return numerals[level] ?? String(level);
}

export function renderLevelChoices(choices: LevelChoice[]): void {
  if (!ui.levelChoiceGrid) return;
  const selectedIndex = choices.length ? clamp(state.levelChoice?.selectedIndex ?? 0, 0, choices.length - 1) : 0;
  if (state.levelChoice) state.levelChoice.selectedIndex = selectedIndex;
  ui.levelChoiceGrid.replaceChildren(...choices.map((choice, index) => {
    const visual = choiceVisual(choice);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `level-choice-card choice-${choice.kind}`;
    if (index === selectedIndex) button.classList.add("selected-choice");
    button.style.setProperty("--choice-color", choice.color ?? "#d7ff8d");
    button.setAttribute("aria-label", `Choice ${index + 1}: ${choice.title}`);
    const frame = document.createElement("span");
    frame.className = "choice-frame";
    frame.setAttribute("aria-hidden", "true");
    const icon = document.createElement("span");
    icon.className = "choice-icon";
    if (visual.icon) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = visual.icon;
      icon.append(image);
    }
    const kind = document.createElement("span");
    kind.className = "choice-kind";
    kind.textContent = visual.kind;
    frame.append(icon, kind);
    const copy = document.createElement("span");
    copy.className = "choice-copy";
    const badge = document.createElement("span");
    badge.className = "choice-badge";
    badge.textContent = choice.badge;
    const title = document.createElement("strong");
    title.textContent = choice.title;
    const subtitle = document.createElement("em");
    subtitle.textContent = choice.subtitle;
    const description = document.createElement("span");
    description.className = "choice-description";
    description.textContent = choice.description;
    const payoff = document.createElement("span");
    payoff.className = "choice-payoff";
    for (const line of choicePayoffLines(choice)) {
      const item = document.createElement("span");
      item.textContent = line;
      payoff.append(item);
    }
    copy.append(badge, title, subtitle, description, payoff);
    button.append(frame, copy);
    button.addEventListener("focus", () => selectLevelChoice(index));
    button.addEventListener("pointerenter", () => selectLevelChoice(index));
    button.addEventListener("click", () => applyLevelChoice(index));
    return button;
  }));
  updateLevelChoiceControls();
}
