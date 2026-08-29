import type { MmoUiInventoryItem } from "@hyperfocus/engine/ui";
import { abilityOptionsForSlot, bankQty, equippedWeaponForPlayer, hasInventoryItem, hasQuestFlag, itemQty, selectedAbilityForSlot } from "../shared-loadout.ts";
import { playerAbilityMetadata, weaponMetadata } from "../shared-ability-catalog.ts";
import { type MmoSkillDemoInput, type PlayerEntity } from "../shared-contracts.ts";
import { abilityTooltipTitle } from "./ability-tooltips.ts";
import { COMBAT_SLOTS, type CombatSlot } from "./combat-view.ts";
import {
  EQUIPMENT_SLOTS,
  KEY_ITEM_ORDER,
  abilityNameForSlot,
  fieldSlotReveal,
  itemLabel,
  itemMeta,
  labelize,
  mutablePlayerEquipment,
  playerAbilitySlots,
  playerEquipment
} from "./live-ui-model.ts";
import {
  gridPanel,
  itemIcon,
  namedBody,
  ownedItem,
  panelSection,
  panelStack,
  textRows
} from "./live-ui-elements.ts";
import { tooltipText } from "./live-ui-style.ts";

type LoadoutPanelInput = {
  invalidate: () => void;
  queueInput: (value: MmoSkillDemoInput) => void;
  refreshToolbar: () => void;
  render: () => void;
  journal: {
    rows: (player: PlayerEntity) => string[];
    title: (player: PlayerEntity) => string;
  };
};

export function createLoadoutPanel(input: LoadoutPanelInput) {
  let noviceUiBypass = new URLSearchParams(location.search).get("novice") === "0";

  function noviceRevealActive(player: PlayerEntity) {
    return !noviceUiBypass && !hasQuestFlag(player, "heavy-lifting");
  }

  function weaponStoryStatus(player: PlayerEntity, weaponId: string, owned: boolean) {
    if (owned) return "Owned";
    switch (weaponId) {
      case "bow":
        return hasQuestFlag(player, "wolf-culling") ? "Scout Elara" : "Road rumor";
      case "staff":
      case "wand":
        return hasQuestFlag(player, "final-cut") ? "Aetheria rumor" : "Dock rumor";
      case "twin-blades":
        return hasQuestFlag(player, "fast-travel-registered") ? "Port Marrow" : "Captain rumor";
      case "blade":
        return hasQuestFlag(player, "first-cut") ? "Ironcrag rumor" : "Forge rumor";
      default:
        return "Rumor";
    }
  }

  function noviceCombatSlots(player: PlayerEntity): CombatSlot[] {
    const slots: CombatSlot[] = ["LMB", "RMB"];
    if (hasQuestFlag(player, "first-cut") || hasQuestFlag(player, "wolf-culling")) slots.push("Space");
    if (hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || player.zoneId === "bazaar") slots.push("Q");
    if (hasQuestFlag(player, "silent-sands") || hasQuestFlag(player, "root-of-the-problem") || player.dungeonBossKills > 0) slots.push("E");
    if (player.masteryRank >= 2 || hasQuestFlag(player, "breaking-golem") || hasQuestFlag(player, "kings-foil")) slots.push("R");
    return slots;
  }

  function noviceAbilityContent(player: PlayerEntity) {
    const weaponId = equippedWeaponForPlayer(player);
    const weaponRow = document.createElement("div");
    weaponRow.className = "mmo-card-grid";
    for (const weapon of Object.values(weaponMetadata)) {
      const owned = weapon.id === "mace" || hasInventoryItem(player, weapon.id) || Boolean(playerEquipment(player)[weapon.id]);
      const selectable = owned || weapon.id === weaponId;
      const button = document.createElement("button");
      button.className = `mmo-item-card${weapon.id === weaponId ? " is-active" : ""}${selectable ? "" : " is-locked"}`;
      button.type = "button";
      button.disabled = !selectable;
      button.title = selectable ? `Use ${weapon.name}` : weaponStoryStatus(player, weapon.id, owned);
      button.setAttribute("aria-label", selectable ? `Use ${weapon.name}` : `${weapon.name} ${weaponStoryStatus(player, weapon.id, owned)}`);
      button.replaceChildren(
        itemIcon(weapon.id),
        namedBody(weapon.name, selectable ? (weapon.id === weaponId ? "Equipped" : "Owned") : weaponStoryStatus(player, weapon.id, owned)),
        document.createElement("span")
      );
      button.addEventListener("click", () => {
        if (!button.disabled) {
          mutablePlayerEquipment(player).weapon = weapon.id;
          player.equippedWeaponId = weapon.id;
          input.queueInput({ action: "config", devField: "weapon", devText: weapon.id });
          input.invalidate();
          input.render();
        }
      });
      weaponRow.append(button);
    }

    const slotRow = document.createElement("div");
    slotRow.className = "mmo-card-grid";
    for (const slot of noviceCombatSlots(player)) {
      const reveal = fieldSlotReveal(player, slot);
      const button = document.createElement("button");
      button.className = `mmo-skill-card${reveal.unlocked ? " is-active" : " is-locked"}`;
      button.type = "button";
      button.disabled = !reveal.unlocked;
      const name = document.createElement("span");
      name.className = "mmo-skill-name";
      name.textContent = `${slot} ${abilityNameForSlot(player, slot)}`;
      const meta = document.createElement("span");
      meta.className = "mmo-skill-meta";
      meta.textContent = reveal.unlocked ? reveal.status : reveal.hint;
      button.replaceChildren(name, meta);
      button.title = reveal.unlocked ? abilityTooltipTitle(player, slot, selectedAbilityForSlot(player, slot), false) : reveal.hint;
      slotRow.append(button);
    }

    const fullLoadoutButton = document.createElement("button");
    fullLoadoutButton.className = "mmo-compact-button";
    fullLoadoutButton.type = "button";
    fullLoadoutButton.textContent = "Full Loadout";
    fullLoadoutButton.title = "Show every owned and locked combat slot.";
    fullLoadoutButton.addEventListener("click", () => {
      noviceUiBypass = true;
      const nextParams = new URLSearchParams(location.search);
      nextParams.set("novice", "0");
      history.replaceState(null, "", `${location.pathname}?${nextParams.toString()}${location.hash}`);
      input.invalidate();
      input.refreshToolbar();
      input.render();
    });

    return panelStack(
      panelSection(input.journal.title(player), textRows(input.journal.rows(player)), fullLoadoutButton),
      panelSection("Weapon", weaponRow),
      panelSection("Lessons", slotRow)
    );
  }

  function abilityContent(player: PlayerEntity) {
    if (noviceRevealActive(player)) return noviceAbilityContent(player);
    const weaponId = equippedWeaponForPlayer(player);
    const rows: HTMLElement[] = [];
    const weaponRow = document.createElement("div");
    weaponRow.className = "mmo-card-grid";
    for (const weapon of Object.values(weaponMetadata)) {
      const button = document.createElement("button");
      const owned = weapon.id === "mace" || hasInventoryItem(player, weapon.id) || Boolean(playerEquipment(player)[weapon.id]);
      button.className = `mmo-item-card${weapon.id === weaponId ? " is-active" : ""}`;
      button.type = "button";
      button.disabled = !owned;
      button.title = owned ? `Use ${weapon.name}` : "Not owned";
      button.setAttribute("aria-label", owned ? `Use ${weapon.name}` : `${weapon.name} locked`);
      button.replaceChildren(
        itemIcon(weapon.id),
        namedBody(weapon.name, owned ? (weapon.id === weaponId ? "Equipped" : "Owned") : "Locked"),
        document.createElement("span")
      );
      button.addEventListener("click", () => {
        if (!button.disabled) {
          mutablePlayerEquipment(player).weapon = weapon.id;
          player.equippedWeaponId = weapon.id;
          input.queueInput({ action: "config", devField: "weapon", devText: weapon.id });
          input.invalidate();
          input.render();
        }
      });
      weaponRow.append(button);
    }
    rows.push(panelSection("Weapon", weaponRow));
    for (const slot of COMBAT_SLOTS) {
      const wrap = document.createElement("div");
      wrap.className = "mmo-panel-section";
      const title = document.createElement("div");
      title.className = "mmo-section-head";
      title.textContent = slot;
      const options = document.createElement("div");
      options.className = "mmo-card-grid";
      const selected = selectedAbilityForSlot(player, slot);
      const reveal = fieldSlotReveal(player, slot);
      for (const abilityId of abilityOptionsForSlot(weaponId, slot)) {
        const ability = playerAbilityMetadata[abilityId];
        const knowsAbility = Boolean(playerAbilitySlots(player)[abilityId]);
        const known = knowsAbility && reveal.unlocked;
        const button = document.createElement("button");
        button.className = `mmo-skill-card${abilityId === selected && known ? " is-active" : ""}${known ? "" : " is-locked"}`;
        button.type = "button";
        button.disabled = !known;
        const abilityName = ability?.name ?? labelize(abilityId);
        const name = document.createElement("span");
        name.className = "mmo-skill-name";
        name.textContent = abilityName;
        const meta = document.createElement("span");
        meta.className = "mmo-skill-meta";
        meta.textContent = known ? (abilityId === selected ? "Slotted" : "Known") : (knowsAbility ? reveal.status : "Locked");
        button.replaceChildren(name, meta);
        button.title = known ? abilityTooltipTitle(player, slot, abilityId, false) : `${abilityName}\n${knowsAbility ? reveal.hint : "Find the matching trainer or route proof."}`;
        button.setAttribute("aria-label", `${slot} ${abilityName}`);
        button.addEventListener("click", () => {
          if (!button.disabled) {
            mutablePlayerEquipment(player)[`ability:${slot}`] = abilityId;
            input.queueInput({ action: "config", devField: slot, devText: abilityId });
            input.invalidate();
            input.render();
          }
        });
        options.append(button);
      }
      wrap.append(title, options);
      rows.push(wrap);
    }
    return panelStack(...rows);
  }

  return {
    abilities: abilityContent,
    gear: gearContent,
    inventory: (player: PlayerEntity) => inventoryContent(input, player),
    isNovice: noviceRevealActive
  };
}

function itemButton(input: LoadoutPanelInput, item: MmoUiInventoryItem, player: PlayerEntity) {
  const button = document.createElement("button");
  button.className = `mmo-item-card ce-rarity-${item.rarity ?? "common"}`;
  button.type = "button";
  button.disabled = item.disabled ?? false;
  const equippable = ["mace", "bow", "staff", "wand", "twin-blades", "blade"].includes(item.id);
  const consumable = ["glade-berries", "cinder-ale", "speed-potion"].includes(item.id);
  const actionText = equippable ? "Equip" : consumable ? "Use" : "Inspect";
  button.title = tooltipText(item.name, item.description, actionText);
  button.setAttribute("aria-label", `${actionText} ${item.name}`);
  const count = document.createElement("span");
  count.className = "mmo-item-count";
  count.textContent = String(item.quantity ?? 1);
  button.replaceChildren(itemIcon(item.id), namedBody(item.name, item.description ?? ""), count);
  button.addEventListener("click", () => {
    if (!button.disabled && equippable) {
      mutablePlayerEquipment(player).weapon = item.id;
      player.equippedWeaponId = item.id;
      input.invalidate();
      input.render();
      input.queueInput({ action: "config", devField: "weapon", devText: item.id });
      return;
    }
    if (!button.disabled && consumable) input.queueInput({ action: "use-item", itemId: item.id });
  });
  return button;
}

function inventoryContent(input: LoadoutPanelInput, player: PlayerEntity) {
  const wallet: MmoUiInventoryItem[] = [
    { id: "gold", name: itemLabel("gold"), quantity: player.gold, description: "Spend at trainers" },
    { id: "renown", name: itemLabel("renown"), quantity: player.renown, description: `Mastery ${player.masteryRank}` }
  ];
  const resources: MmoUiInventoryItem[] = [
    { id: "ash-logs", name: itemLabel("ash-logs"), quantity: itemQty(player, "ash-logs"), description: `Bank ${bankQty(player, "ash-logs")}` },
    { id: "iron-ore", name: itemLabel("iron-ore"), quantity: itemQty(player, "iron-ore"), description: `Bank ${bankQty(player, "iron-ore")}` },
    { id: "silk-thread", name: itemLabel("silk-thread"), quantity: itemQty(player, "silk-thread"), description: "Bazaar drops" }
  ];
  const consumables: MmoUiInventoryItem[] = [
    { id: "glade-berries", name: itemLabel("glade-berries"), quantity: itemQty(player, "glade-berries"), description: "Use: heal", disabled: itemQty(player, "glade-berries") <= 0 },
    { id: "cinder-ale", name: itemLabel("cinder-ale"), quantity: itemQty(player, "cinder-ale"), description: "Use: mana", disabled: itemQty(player, "cinder-ale") <= 0 },
    { id: "speed-potion", name: itemLabel("speed-potion"), quantity: itemQty(player, "speed-potion"), description: "Use: speed", disabled: itemQty(player, "speed-potion") <= 0 }
  ];
  const owned = KEY_ITEM_ORDER.map((id) => ownedItem(player, id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const weapons = owned.filter((item) => ["bow", "staff", "wand", "twin-blades", "blade"].includes(item.id));
  const keyItems = owned.filter((item) => !weapons.includes(item));
  return panelStack(
    panelSection("Currencies", gridPanel(wallet.map((item) => itemButton(input, item, player)))),
    panelSection("Resources", gridPanel(resources.map((item) => itemButton(input, item, player)))),
    panelSection("Consumables", gridPanel(consumables.map((item) => itemButton(input, item, player)))),
    ...(weapons.length ? [panelSection("Weapons", gridPanel(weapons.map((item) => itemButton(input, item, player))))] : []),
    ...(keyItems.length ? [panelSection("Key Items", gridPanel(keyItems.map((item) => itemButton(input, item, player))))] : [])
  );
}

function gearContent(player: PlayerEntity) {
  return gridPanel(EQUIPMENT_SLOTS.map((slot) => {
    const equipment = playerEquipment(player);
    const equipped = slot.choices.find((id) => equipment[id] || Object.values(equipment).includes(id)) ?? slot.choices.find((id) => hasInventoryItem(player, id));
    const button = document.createElement("button");
    button.className = "mmo-item-card";
    button.type = "button";
    button.title = equipped ? itemMeta(equipped, player) : slot.empty;
    button.setAttribute("aria-label", `${slot.title}: ${equipped ? itemLabel(equipped) : "Empty"}`);
    button.replaceChildren(
      itemIcon(equipped ?? "empty"),
      namedBody(slot.title, equipped ? itemLabel(equipped) : slot.empty),
      document.createElement("span")
    );
    return button;
  }));
}
