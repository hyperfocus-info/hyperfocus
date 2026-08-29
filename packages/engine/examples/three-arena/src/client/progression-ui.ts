import { runtimeCallback } from "./runtime-ports.ts";
const addPassiveTeamworkEffect = runtimeCallback("progressionChoices", "addPassiveTeamworkEffect");
const buildLevelUpChoices = runtimeCallback("progressionChoices", "buildLevelUpChoices");
const closeLevelChoice = runtimeCallback("progressionChoices", "closeLevelChoice");
const levelChoiceCharge = runtimeCallback("progressionChoices", "levelChoiceCharge");
const levelChoiceCount = runtimeCallback("progressionChoices", "levelChoiceCount");
const levelChoiceKey = runtimeCallback("progressionChoices", "levelChoiceKey");
const openNextLevelChoice = runtimeCallback("progressionChoices", "openNextLevelChoice");
const renderLevelChoices = runtimeCallback("progressionChoices", "renderLevelChoices");
const applyProgressionStats = runtimeCallback("progressionData", "applyProgressionStats");
const classLevelFor = runtimeCallback("progressionData", "classLevelFor");
const classMaxUnlockLevel = runtimeCallback("progressionData", "classMaxUnlockLevel");
const classNextUnlocks = runtimeCallback("progressionData", "classNextUnlocks");
const configuredLoadoutForClass = runtimeCallback("progressionData", "configuredLoadoutForClass");
const resolveProgressionStats = runtimeCallback("progressionData", "resolveProgressionStats");
const selectedClass = runtimeCallback("progressionData", "selectedClass");
const selectedClassLevel = runtimeCallback("progressionData", "selectedClassLevel");
const setConfiguredLoadout = runtimeCallback("progressionData", "setConfiguredLoadout");
const addPassiveToLoadout = runtimeCallback("progressionRuntime", "addPassiveToLoadout");
const addWeaponToLoadout = runtimeCallback("progressionRuntime", "addWeaponToLoadout");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const classPassiveDeckPath = runtimeCallback("contentUi", "classPassiveDeckPath");
const classPassiveUnlocks = runtimeCallback("contentUi", "classPassiveUnlocks");
const classSigilPath = runtimeCallback("contentUi", "classSigilPath");
const classWeaponUnlocks = runtimeCallback("contentUi", "classWeaponUnlocks");
const displayNameForUnlock = runtimeCallback("contentUi", "displayNameForUnlock");
const passiveIconPath = runtimeCallback("contentUi", "passiveIconPath");
const weaponIconPath = runtimeCallback("contentUi", "weaponIconPath");
const clamp = runtimeCallback("hud", "clamp");
const clamp01 = runtimeCallback("hud", "clamp01");
const toast = runtimeCallback("hud", "toast");
const updateHud = runtimeCallback("hud", "updateHud");
const setMenuFocus = runtimeCallback("inputAndMenu", "setMenuFocus");
const focusPauseElement = runtimeCallback("lobbyAndSettings", "focusPauseElement");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const pulseOverlay = runtimeCallback("rewardFeedback", "pulseOverlay");
const showCenterBanner = runtimeCallback("rewardFeedback", "showCenterBanner");
const requestRunPointerLock = runtimeCallback("runLifecycle", "requestRunPointerLock");
import type { ClassUnlockKind } from "./progression-data.ts";
import { state } from "./arena-state.ts";
import { MAX_LOADOUT_PASSIVES, passiveItemsById, playerClasses, playerClassesById, weaponsById } from "./content-runtime.ts";
import { setLastPassiveHudKey, setLastWeaponHudKey } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";
import type { ClassUnlock, LevelChoice, PlayerClassDefinition } from "./content-types.ts";

export function choicePayoffLines(choice: LevelChoice): string[] {
  if (choice.kind === "weapon") {
    if (choice.owned) return [`Before L${Math.max(1, choice.targetLevel - 1)}`, `After L${choice.targetLevel}: ${choice.subtitle}`];
    return ["Before empty weapon slot", `After L${choice.targetLevel ?? 1}: ${choice.subtitle}`];
  }
  if (choice.kind === "passive") {
    if (choice.owned) return [`Before L${Math.max(1, choice.targetLevel - 1)}`, `After L${choice.targetLevel}: ${choice.subtitle}`];
    return ["Before empty passive slot", `After L${choice.targetLevel ?? 1}: ${choice.subtitle}`];
  }
  if (choice.kind === "evolution") return ["Before max weapon", `After: ${choice.subtitle}`];
  if (choice.kind === "heal") {
    const player = state.player;
    return player
      ? [`Before HP ${Math.ceil(player.hp)}`, `After HP ${Math.min(player.maxHp, Math.ceil(player.hp + 35))}`]
      : [choice.subtitle, choice.description];
  }
  if (choice.kind === "stat") return ["Before class baseline", `After: ${choice.description}`];
  return [];
}

export function selectedLevelChoiceIndex(): number {
  const choices = state.levelChoice?.choices ?? [];
  if (!choices.length) return -1;
  return clamp(state.levelChoice?.selectedIndex ?? 0, 0, choices.length - 1);
}

export function selectedLevelChoice(): LevelChoice | null {
  const index = selectedLevelChoiceIndex();
  return index >= 0 ? state.levelChoice?.choices?.[index] ?? null : null;
}

export function selectLevelChoice(index: number): void {
  const levelChoice = state.levelChoice;
  const choices = levelChoice?.choices ?? [];
  if (!choices.length) {
    updateLevelChoiceControls();
    return;
  }
  if (!levelChoice) return;
  levelChoice.selectedIndex = clamp(index, 0, choices.length - 1);
  ui.levelChoiceGrid?.querySelectorAll(".level-choice-card").forEach((button, buttonIndex) => {
    button.classList.toggle("selected-choice", buttonIndex === levelChoice.selectedIndex);
  });
  updateLevelChoiceControls();
}

export function setLevelChoiceActionButton(
  button: HTMLButtonElement | null | undefined,
  label: string,
  count: number,
  disabled: boolean,
  ariaLabel: string
): void {
  if (!button) return;
  const title = button.querySelector("strong");
  const counter = button.querySelector("span");
  if (title) title.textContent = label;
  if (counter) counter.textContent = String(count);
  button.disabled = disabled;
  button.setAttribute("aria-label", ariaLabel);
}

export function updateLevelChoiceControls(): void {
  const hasChoices = Boolean(state.levelChoice?.choices?.length);
  const selected = selectedLevelChoice();
  const rerolls = levelChoiceCharge(state.levelChoiceRerolls);
  const banishes = levelChoiceCharge(state.levelChoiceBanishes);
  setLevelChoiceActionButton(
    ui.levelChoiceRerollButton,
    "Reroll",
    rerolls,
    !hasChoices || rerolls <= 0,
    `Reroll current level choices. ${rerolls} remaining.`
  );
  setLevelChoiceActionButton(
    ui.levelChoiceBanishButton,
    "Banish",
    banishes,
    !hasChoices || !selected || banishes <= 0,
    selected ? `Banish ${selected.title} from future drafts. ${banishes} remaining.` : `Banish selected upgrade. ${banishes} remaining.`
  );
}

export function rerollLevelChoices(): void {
  if (!state.levelChoice || state.levelChoiceRerolls <= 0) return;
  const previousKeys = new Set((state.levelChoice.choices ?? []).map(levelChoiceKey));
  state.levelChoiceRerolls = levelChoiceCharge(state.levelChoiceRerolls - 1);
  state.levelChoice.choices = buildLevelUpChoices(previousKeys);
  state.levelChoice.selectedIndex = 0;
  renderLevelChoices(state.levelChoice.choices);
  setMenuFocus(0);
  toast("Choices redrawn from the cache.");
  playSynthCue("level");
}

export function banishSelectedLevelChoice(): void {
  if (!state.levelChoice || state.levelChoiceBanishes <= 0) return;
  const selectedIndex = selectedLevelChoiceIndex();
  const choice = selectedLevelChoice();
  if (!choice) return;
  const targetKey = levelChoiceKey(choice);
  state.banishedLevelChoices.add(targetKey);
  state.levelChoiceBanishes = levelChoiceCharge(state.levelChoiceBanishes - 1);

  const count = levelChoiceCount();
  const currentChoices = state.levelChoice.choices ?? [];
  const kept = currentChoices.filter((candidate) => {
    const key = levelChoiceKey(candidate);
    return key !== targetKey && !state.banishedLevelChoices.has(key);
  });
  const keptKeys = new Set(kept.map(levelChoiceKey));
  const replacementKeys = new Set(currentChoices.map(levelChoiceKey));
  const replacements = buildLevelUpChoices(replacementKeys)
    .filter((candidate) => !keptKeys.has(levelChoiceKey(candidate)));
  state.levelChoice.choices = [...kept, ...replacements].slice(0, count);
  if (!state.levelChoice.choices.length) state.levelChoice.choices = buildLevelUpChoices();
  state.levelChoice.selectedIndex = state.levelChoice.choices.length
    ? clamp(selectedIndex, 0, state.levelChoice.choices.length - 1)
    : 0;
  renderLevelChoices(state.levelChoice.choices);
  setMenuFocus(state.levelChoice.selectedIndex);
  toast(`${choice.title} cut from future caches.`);
  playSynthCue("level");
}

export function applyLevelChoice(index: number): void {
  const choice = state.levelChoice?.choices?.[index];
  const player = state.player;
  if (!choice || !player) return;
  if (choice.kind === "weapon") {
    if (addWeaponToLoadout(choice.id, choice.targetLevel)) state.activeWeaponId = choice.id;
  } else if (choice.kind === "passive") {
    if (state.startingPassiveIds.has(choice.id) && addPassiveToLoadout(choice.id, choice.targetLevel) && choice.effect) {
      addPassiveTeamworkEffect(choice.id, choice.effect.id);
    }
  } else if (choice.kind === "evolution") {
    state.evolvedWeapons.add(choice.id);
    state.activeWeaponId = choice.id;
  } else if (choice.kind === "stat") {
    state.statBonuses.push(choice.bonus);
  } else if (choice.kind === "heal") {
    const heal = Math.round(35 * ((state.progressionStats ?? resolveProgressionStats()).healMultiplier ?? 1));
    player.hp = Math.min(player.maxHp, player.hp + heal);
  }
  applyProgressionStats();
  state.pendingLevelChoices = Math.max(0, state.pendingLevelChoices - 1);
  toast(choice.title);
  showCenterBanner(choice.title, choice.subtitle);
  spawnPulseRing(player.x, player.z, choice.color ?? "#d7ff8d", 0.54, 1.1, 5.4);
  pulseOverlay(choice.kind === "heal" ? "gold" : "level");
  playSynthCue(choice.kind === "weapon" || choice.kind === "evolution" ? "weapon" : "level");
  closeLevelChoice();
  setLastWeaponHudKey("");
  setLastPassiveHudKey("");
  updateHud(0, true);
  if (state.pendingLevelChoices > 0) {
    openNextLevelChoice();
    return;
  }
  state.running = state.resumeAfterLevelChoice && player.hp > 0;
  if (state.running) requestRunPointerLock();
}

export function renderClassPicker() {
  if (!ui.classGrid) return;
  ui.classGrid.replaceChildren(...playerClasses.map((klass) => {
    const classLevel = classLevelFor(klass.id);
    const configured = configuredLoadoutForClass(klass);
    const weapon = weaponsById.get(configured.weaponId ?? klass.starterWeapon);
    const passiveIds = configured.passiveIds ?? [];
    const passiveNames = passiveIds.map((id) => passiveItemsById.get(id)?.name).filter(Boolean);
    const nextUnlocks = classNextUnlocks(klass, classLevel);
    const nextUnlockLevel = nextUnlocks[0]?.level;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `class-card${klass.id === state.selectedClassId ? " selected" : ""}`;
    button.style.setProperty("--class-color", klass.color ?? "#d7ff8d");
    button.dataset.classId = klass.id;
    button.dataset.weaponId = configured.weaponId ?? "";
    button.dataset.passiveIds = passiveIds.join(",");
    button.setAttribute("aria-label", `${klass.name} class level ${classLevel}`);
    const header = document.createElement("span");
    header.className = "class-card-header";
    const sigil = document.createElement("span");
    sigil.className = "class-sigil";
    sigil.setAttribute("aria-hidden", "true");
    const sigilImage = document.createElement("img");
    sigilImage.alt = "";
    sigilImage.src = classSigilPath(klass);
    sigil.append(sigilImage);
    const titleBlock = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = klass.name;
    const role = document.createElement("em");
    role.textContent = klass.role;
    titleBlock.append(title, role);
    const levelBadge = document.createElement("span");
    levelBadge.className = "class-level-badge";
    levelBadge.textContent = `L${classLevel}`;
    header.append(sigil, titleBlock, levelBadge);

    const loadout = document.createElement("span");
    loadout.className = "class-loadout";
    const loadoutIcon = document.createElement("span");
    loadoutIcon.className = "class-loadout-icon";
    loadoutIcon.setAttribute("aria-hidden", "true");
    const weaponImage = document.createElement("img");
    weaponImage.alt = "";
    weaponImage.src = weaponIconPath(configured.weaponId ?? klass.starterWeapon);
    loadoutIcon.append(weaponImage);
    const loadoutCopy = document.createElement("span");
    loadoutCopy.className = "class-loadout-copy";
    const loadoutLabel = document.createElement("span");
    loadoutLabel.className = "class-loadout-label";
    loadoutLabel.textContent = "Starter";
    const loadoutName = document.createElement("span");
    loadoutName.className = "class-loadout-name";
    loadoutName.textContent = weapon?.name ?? "Starter weapon";
    loadoutCopy.append(loadoutLabel, loadoutName);
    loadout.append(loadoutIcon, loadoutCopy);

    const passiveLine = document.createElement("small");
    passiveLine.className = "class-passive-line";
    const passiveImage = document.createElement("img");
    passiveImage.alt = "";
    passiveImage.src = passiveIds[0] ? passiveIconPath(passiveIds[0]) : classPassiveDeckPath(klass);
    passiveLine.append(passiveImage, document.createTextNode(passiveNames.join(" + ") || "Open passive slots"));

    const perk = document.createElement("small");
    perk.className = "class-perk";
    perk.textContent = klass.perk ?? "";

    const tags = document.createElement("span");
    tags.className = "class-tags";
    for (const tag of (klass.passiveBias ?? []).slice(0, 3)) {
      const chip = document.createElement("span");
      chip.className = "bias-chip";
      chip.textContent = tag;
      tags.append(chip);
    }
    const nextUnlock = document.createElement("span");
    nextUnlock.className = "class-next-unlock";
    if (nextUnlocks.length) {
      const lock = document.createElement("span");
      lock.className = "lock-icon";
      lock.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.textContent = `L${nextUnlockLevel} ${nextUnlocks.map((unlock) => displayNameForUnlock(unlock.id)).join(" + ")}`;
      nextUnlock.append(lock, copy);
    } else {
      const copy = document.createElement("span");
      copy.textContent = "All unlocks ready";
      nextUnlock.append(copy);
    }
    button.append(header, loadout, passiveLine, perk, tags, nextUnlock);
    button.title = klass.perk ?? "";
    button.addEventListener("click", () => selectPlayerClass(klass.id));
    return button;
  }));
  renderLoadoutConfig();
}

export function renderLoadoutConfig() {
  const klass = selectedClass();
  if (!klass) return;
  const level = selectedClassLevel();
  const maxUnlockLevel = classMaxUnlockLevel(klass);
  const loadout = configuredLoadoutForClass(klass);
  const weapon = loadout.weaponId ? weaponsById.get(loadout.weaponId) : undefined;
  const passiveNames = (loadout.passiveIds ?? []).map((id) => passiveItemsById.get(id)?.name).filter(Boolean);
  const color = klass.color ?? "#d7ff8d";
  for (const element of [ui.loadoutPanel, ui.classProgressText, ui.loadoutSummary, ui.classProgressFill, ui.loadoutWeaponStatus, ui.loadoutPassiveStatus]) {
    element?.style?.setProperty("--class-color", color);
  }
  ui.classProgressFill?.style?.setProperty("transform", `scaleX(${clamp01(level / Math.max(1, maxUnlockLevel))})`);
  if (ui.classProgressText) ui.classProgressText.textContent = `${klass.name} L${level}`;
  if (ui.loadoutSummary) ui.loadoutSummary.textContent = `${weapon?.name ?? "Weapon"} + ${passiveNames.join(" + ") || "Passives"}`;
  ui.loadoutPanel?.classList.toggle("hidden", !state.loadoutPanelOpen);
  ui.loadoutConfigButton?.classList.toggle("active", state.loadoutPanelOpen);
  ui.loadoutConfigButton?.setAttribute("aria-expanded", state.loadoutPanelOpen ? "true" : "false");

  const weaponUnlocks = classWeaponUnlocks(klass);
  const passiveUnlocks = classPassiveUnlocks(klass);
  if (ui.loadoutWeaponStatus) ui.loadoutWeaponStatus.textContent = `${weaponUnlocks.filter((unlock) => unlock.level <= level).length}/${weaponUnlocks.length}`;
  if (ui.loadoutPassiveStatus) ui.loadoutPassiveStatus.textContent = `${(loadout.passiveIds ?? []).length}/${MAX_LOADOUT_PASSIVES}`;
  renderLoadoutOptionGrid(ui.loadoutWeaponGrid, weaponUnlocks, loadout.weaponId, "weapon", klass, level);
  renderLoadoutOptionGrid(ui.loadoutPassiveGrid, passiveUnlocks, loadout.passiveIds ?? [], "passive", klass, level);
}

export function renderLoadoutOptionGrid(
  grid: HTMLElement | null | undefined,
  unlocks: ClassUnlock[],
  selectedId: string | string[] | undefined,
  kind: ClassUnlockKind,
  klass: PlayerClassDefinition,
  level: number
): void {
  if (!grid) return;
  grid.replaceChildren(...unlocks.map((unlock) => {
    const unlocked = unlock.level <= level;
    const selected = Array.isArray(selectedId) ? selectedId.includes(unlock.id) : selectedId === unlock.id;
    const name = displayNameForUnlock(unlock.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `loadout-option ${unlocked ? "is-unlocked" : "is-locked"}${selected ? " is-selected" : ""}`;
    button.dataset.loadoutKind = kind;
    button.dataset.loadoutId = unlock.id;
    button.dataset.locked = unlocked ? "false" : "true";
    button.dataset.requiredLevel = String(unlock.level);
    button.style.setProperty("--class-color", klass.color ?? "#d7ff8d");
    button.setAttribute("aria-disabled", unlocked ? "false" : "true");
    button.setAttribute("aria-label", unlocked ? `${name} unlocked` : `${name} locked until class level ${unlock.level}`);
    button.title = unlocked ? `${name} L${unlock.level}` : `Locked until class level ${unlock.level}`;

    const icon = document.createElement("span");
    icon.className = "loadout-option-icon";
    const image = document.createElement("img");
    image.alt = "";
    image.src = kind === "weapon" ? weaponIconPath(unlock.id) : passiveIconPath(unlock.id);
    icon.append(image);

    const title = document.createElement("strong");
    title.textContent = name;
    const badge = document.createElement("span");
    badge.textContent = unlocked ? (selected ? "Equipped" : `L${unlock.level}`) : `L${unlock.level}`;
    button.append(icon, title, badge);
    if (!unlocked) {
      const lock = document.createElement("span");
      lock.className = "loadout-lock";
      lock.setAttribute("aria-hidden", "true");
      const glyph = document.createElement("span");
      glyph.className = "lock-icon";
      lock.append(glyph);
      button.append(lock);
    }
    button.addEventListener("click", () => setConfiguredLoadout(kind, unlock.id));
    return button;
  }));
}

export function toggleLoadoutPanel(): void {
  state.loadoutPanelOpen = !state.loadoutPanelOpen;
  renderLoadoutConfig();
  if (state.loadoutPanelOpen && !focusSelectedLoadoutOption("weapon")) focusPauseElement(ui.loadoutConfigButton);
  else if (!state.loadoutPanelOpen) focusPauseElement(ui.loadoutConfigButton);
}

export function focusLoadoutOption(kind: ClassUnlockKind, id: string): boolean {
  const element = document.querySelector<HTMLElement>(`.loadout-option[data-loadout-kind="${kind}"][data-loadout-id="${id}"]`);
  if (!element) return false;
  focusPauseElement(element);
  return true;
}

export function focusSelectedLoadoutOption(kind: ClassUnlockKind): boolean {
  const klass = selectedClass();
  const loadout = configuredLoadoutForClass(klass);
  const id = kind === "weapon" ? loadout.weaponId : loadout.passiveIds?.[0];
  return id ? focusLoadoutOption(kind, id) : false;
}

export function selectPlayerClass(id: string): void {
  if (!playerClassesById.has(id)) return;
  state.selectedClassId = id;
  renderClassPicker();
  renderLoadoutConfig();
  updateHud(0, true);
  if (!state.running) toast(`${selectedClass()?.name ?? "Class"} ready`);
}
