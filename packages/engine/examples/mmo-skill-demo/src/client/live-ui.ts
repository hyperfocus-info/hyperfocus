import { createMmoUiShell, type MmoUiShell, type MmoUiToolbarAction } from "@hyperfocus/engine/ui";
import { equippedWeaponForPlayer } from "../shared-loadout.ts";
import { type MmoSkillDemoInput, type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { weaponMetadata } from "../shared-ability-catalog.ts";
import { COMBAT_SLOTS, energyMax, energyValue } from "./combat-view.ts";
import { abilityNameForSlot, labelize, panelRenderKey, worldEventLine } from "./live-ui-model.ts";
import { ensureLiveUiStyle, toolbarIcons } from "./live-ui-style.ts";
import { panelSection, panelStack, statChip, statGrid, textRows } from "./live-ui-elements.ts";
import { createCatalogPanel } from "./live-ui-catalog.ts";
import { createCraftPanel } from "./live-ui-craft.ts";
import { createJournalPanel } from "./live-ui-journal.ts";
import { createLoadoutPanel } from "./live-ui-loadout.ts";
import { createQuestPanel } from "./live-ui-quest.ts";
import { createCompactPanelState, isCompactPanelName } from "./ui-shell.ts";

function prepareLiveUiRoot(root: HTMLElement) {
  root.replaceChildren();
  ensureLiveUiStyle(root.ownerDocument);
  root.style.pointerEvents = "none";
  root.style.width = "auto";
  root.style.maxHeight = "calc(100vh - 36px)";
  root.style.overflow = "visible";
  root.style.justifyItems = "end";
}

function configureLiveUiShell(root: HTMLElement, shell: MmoUiShell) {
  shell.root.classList.add("mmo-live-shell");
  shell.elements.toolbar.setAttribute("aria-label", "Utility panels");
  root.querySelector<HTMLElement>(".ce-mmo-body")?.style.setProperty("grid-template-columns", "1fr");
  for (const selector of [".ce-mmo-topbar", ".ce-mmo-sidebar", ".ce-mmo-hotbar"]) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.style.display = "none";
  }
}

function setPanelWindowVisible(panelBody: HTMLElement | null, panelWrap: HTMLElement | null, visible: boolean) {
  if (panelBody) panelBody.style.display = visible ? "grid" : "none";
  if (panelWrap) panelWrap.style.display = visible ? "grid" : "none";
}

function controllerSettingsContent(
  doc: Document,
  readControllerDeadzone: () => number,
  setControllerDeadzone: (value: number) => void
) {
  const wrap = doc.createElement("label");
  wrap.className = "mmo-slider-row";
  const title = doc.createElement("span");
  title.textContent = "Controller deadzone";
  const value = doc.createElement("span");
  value.textContent = `${Math.round(readControllerDeadzone() * 100)}%`;
  const slider = doc.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "50";
  slider.step = "1";
  slider.value = String(Math.round(readControllerDeadzone() * 100));
  slider.title = "Controller deadzone";
  slider.style.width = "100%";
  slider.addEventListener("input", () => {
    setControllerDeadzone(Number(slider.value) / 100);
    slider.value = String(Math.round(readControllerDeadzone() * 100));
    value.textContent = `${Math.round(readControllerDeadzone() * 100)}%`;
  });
  wrap.append(title, value, slider);
  return wrap;
}

function equippedWeaponName(player: PlayerEntity) {
  const weaponId = equippedWeaponForPlayer(player);
  return Object.entries(weaponMetadata).find(([id]) => id === weaponId)?.[1].name ?? weaponId;
}

function statsContent(
  doc: Document,
  player: PlayerEntity,
  state: MmoSkillDemoState,
  readControllerDeadzone: () => number,
  setControllerDeadzone: (value: number) => void
) {
  const selected = COMBAT_SLOTS.map((slot) => `${slot}:${abilityNameForSlot(player, slot)}`).join(" ");
  return panelStack(
    panelSection("Vitals", statGrid([
      statChip("HP", `${player.hp}/${player.maxHp}`),
      statChip("Mana", `${player.mana}/${player.maxMana}`),
      statChip("Energy", `${Math.floor(energyValue(player))}/${Math.floor(energyMax(player))}`),
      statChip("Online", state.activePlayers)
    ])),
    panelSection("Progress", statGrid([
      statChip("Combat", `${player.combatLevel} (${player.combatXp} XP)`),
      statChip("Mining", `${player.miningLevel} (${player.miningXp} XP)`),
      statChip("Woodcut", `${player.woodcuttingLevel} (${player.woodcuttingXp} XP)`),
      statChip("Mastery", `${player.masteryRank} (${player.renown})`)
    ])),
    panelSection("Loadout", textRows([`Weapon: ${equippedWeaponName(player)}`, `Slots: ${selected}`, `Entities: ${Object.keys(state.entities).length}`])),
    panelSection("Controls", controllerSettingsContent(doc, readControllerDeadzone, setControllerDeadzone))
  );
}

export function setupUi(
  root: HTMLElement,
  showDevCheats: boolean,
  queueUiInput: (input: MmoSkillDemoInput) => void,
  confirmRouteChange: (label: string, apply: () => void) => void | Promise<void>,
  openWorldMap: () => void,
  readControllerDeadzone: () => number,
  setControllerDeadzone: (value: number) => void,
  closeExternalMenus: () => void = () => {}
) {
  prepareLiveUiRoot(root);

  const panelState = createCompactPanelState();
  let lastHidden: boolean | undefined;
  let lastStatus = "";
  let lastPanelKey = "";
  let lastUiKey = "";
  let latestPlayer: PlayerEntity | undefined;
  let latestState: MmoSkillDemoState | undefined;

  function invalidateUi() {
    lastPanelKey = "";
    lastUiKey = "";
  }
  const catalogPanel = createCatalogPanel({ invalidate: invalidateUi, render: () => renderPanel() });
  const craftPanel = createCraftPanel({ invalidate: invalidateUi, render: () => renderPanel(), queueInput: queueUiInput });
  const journalPanel = createJournalPanel(() => latestState);
  const loadoutPanel = createLoadoutPanel({
    invalidate: invalidateUi,
    queueInput: queueUiInput,
    refreshToolbar: () => shell.setToolbarActions(toolbarActions()),
    render: () => renderPanel(),
    journal: journalPanel
  });
  const questPanel = createQuestPanel({
    invalidate: invalidateUi,
    queueInput: queueUiInput,
    readState: () => latestState,
    render: () => renderPanel()
  });

  const shell = createMmoUiShell({
    root,
    login: false,
    title: "MMO Skill Demo",
    status: "Disconnected",
    toolbar: toolbarActions(),
    onToolbarAction(payload) {
      if (payload.id === "dev-heal") {
        queueUiInput({ action: "dev", devField: "hp", devValue: 100 });
        return;
      }
      if (payload.id === "map") {
        closeExternalMenus();
        openWorldMap();
        return;
      }
      if (isCompactPanelName(payload.id)) {
        panelState.toggle(payload.id);
        if (panelState.activePanel) closeExternalMenus();
        invalidateUi();
        shell.setToolbarActions(toolbarActions());
        renderPanel();
        return;
      }
      closeExternalMenus();
      const params = new URLSearchParams(location.search);
      let label = "Shared World";
      if (payload.id === "dungeon") {
        params.set("room", "dungeon-party-1");
        params.set("type", "mmo-skill-demo-dungeon");
        label = "Party Dungeon";
      } else if (payload.id === "cottage") {
        params.set("room", "cottage-demo");
        params.set("type", "mmo-skill-demo-cottage");
        label = "Player Cottage";
      } else {
        params.delete("room");
        params.set("type", "mmo-skill-demo");
      }
      void confirmRouteChange(label, () => {
        location.search = params.toString();
      });
    }
  });
  configureLiveUiShell(root, shell);

  const panelBody = root.querySelector<HTMLElement>(".ce-mmo-body");
  const panelWrap = root.querySelector<HTMLElement>(".ce-mmo-panels");
  setPanelWindowVisible(panelBody, panelWrap, false);

  function toolbarActions(): MmoUiToolbarAction[] {
    const activePanel = panelState.activePanel;
    const icons = toolbarIcons();
    const actions: MmoUiToolbarAction[] = [
      { id: "quest", label: "Quest", icon: icons.quest, title: "Quest", active: activePanel === "quest" },
      { id: "event", label: "Event", icon: icons.event, title: "World Event", active: activePanel === "event" },
      { id: "bag", label: "Bag", icon: icons.bag, title: "Bag", active: activePanel === "bag" },
      { id: "gear", label: "Gear", icon: icons.gear, title: "Gear", active: activePanel === "gear" },
      { id: "skills", label: "Skills", icon: icons.skills, title: "Skills", active: activePanel === "skills" },
      { id: "stats", label: "Stats", icon: icons.stats, title: "Stats", active: activePanel === "stats" },
      { id: "catalog", label: "Codex", icon: icons.catalog, title: "Codex", active: activePanel === "catalog" },
      { id: "journal", label: "Journal", icon: icons.journal, title: "Field Journal", active: activePanel === "journal" },
      { id: "craft", label: "Craft", icon: icons.craft, title: "Craft", active: activePanel === "craft" },
      { id: "map", label: "Map", icon: icons.map, title: "World Map (M)" },
      { id: "world", label: "World", icon: icons.world, title: "Shared World" },
      { id: "dungeon", label: "Dungeon", icon: icons.dungeon, title: "Dungeon" },
      { id: "cottage", label: "Cottage", icon: icons.cottage, title: "Cottage" },
      ...(showDevCheats ? [{ id: "dev-heal", label: "Heal", icon: icons.heal, title: "Heal" }] : [])
    ];
    if (!latestPlayer || !loadoutPanel.isNovice(latestPlayer)) return actions;
    const noviceIds = new Set(["quest", "bag", "skills", "catalog", "journal", "map", "dev-heal"]);
    return actions.filter((action) => noviceIds.has(action.id));
  }

  function renderPanel() {
    const player = latestPlayer;
    const state = latestState;
    const activePanel = panelState.activePanel;
    if (!player || !state || !activePanel) {
      shell.setPanels([]);
      setPanelWindowVisible(panelBody, panelWrap, false);
      lastPanelKey = "";
      return;
    }

    const key = `${player.id}:${panelRenderKey(activePanel, player, state)}:${activePanel === "catalog" ? catalogPanel.key() : activePanel === "craft" ? craftPanel.key() : ""}`;
    if (key === lastPanelKey) return;

    const panel =
      activePanel === "quest"
        ? { id: "quest", title: "Quest", open: true, content: questPanel.quest(player) }
        : activePanel === "event"
          ? { id: "event", title: "Event", open: true, content: questPanel.event(state) }
          : activePanel === "bag"
            ? { id: "bag", title: "Bag", open: true, content: loadoutPanel.inventory(player) }
            : activePanel === "gear"
              ? { id: "gear", title: "Gear", open: true, content: loadoutPanel.gear(player) }
              : activePanel === "skills"
                ? { id: "skills", title: "Skills", open: true, content: loadoutPanel.abilities(player) }
                : activePanel === "catalog"
                  ? { id: "catalog", title: "Codex", open: true, content: catalogPanel.content(player) }
                  : activePanel === "journal"
                    ? { id: "journal", title: "Field Journal", open: true, content: journalPanel.content(player) }
                    : activePanel === "craft"
                      ? { id: "craft", title: "Craft", open: true, content: craftPanel.content(player, state) }
                      : { id: "stats", title: "Stats", open: true, content: statsContent(root.ownerDocument, player, state, readControllerDeadzone, setControllerDeadzone) };
    shell.setPanels([panel]);
    setPanelWindowVisible(panelBody, panelWrap, true);
    lastPanelKey = key;
  }

  function updateKey(player: PlayerEntity | undefined, state: MmoSkillDemoState) {
    if (!player) return "hidden";
    const activePanel = panelState.activePanel;
    const statusKey = `${labelize(player.zoneId)} | ${worldEventLine(state)}`;
    const panelKey = activePanel ? `${panelRenderKey(activePanel, player, state)}:${activePanel === "catalog" ? catalogPanel.key() : activePanel === "craft" ? craftPanel.key() : ""}` : "";
    return `visible:${player.id}:${statusKey}:${activePanel}:${panelKey}`;
  }

  return {
    open(name: string) {
      panelState.open(name);
      shell.setToolbarActions(toolbarActions());
      invalidateUi();
      renderPanel();
    },
    needsUpdate(player: PlayerEntity | undefined, state: MmoSkillDemoState) {
      return updateKey(player, state) !== lastUiKey;
    },
    update(player: PlayerEntity | undefined, state: MmoSkillDemoState) {
      const nextKey = updateKey(player, state);
      if (nextKey === lastUiKey) return;
      latestPlayer = player;
      latestState = state;
      const hidden = !player;
      if (hidden !== lastHidden) {
        root.hidden = hidden;
        lastHidden = hidden;
      }
      if (!player) {
        renderPanel();
        lastUiKey = nextKey;
        return;
      }
      const nextStatus = `${labelize(player.zoneId)} | ${worldEventLine(state)}`;
      if (nextStatus !== lastStatus) {
        shell.setStatus(nextStatus);
        lastStatus = nextStatus;
      }
      shell.setToolbarActions(toolbarActions());
      renderPanel();
      lastUiKey = nextKey;
    }
  };
}
