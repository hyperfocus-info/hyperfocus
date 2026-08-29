import { bankQty, hasInventoryItem, hasQuestFlag } from "../shared-loadout.ts";
import { type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { earlyLoopAction, earlyLoopReturnBriefing } from "./early-loop.ts";
import {
  FIELD_JOURNAL_ENTRIES,
  PROVING_CONTRACT_ID,
  labelize,
  nextGoal,
  type FieldJournalEntry
} from "./live-ui-model.ts";
import { gridPanel, panelSection, panelStack, textRows } from "./live-ui-elements.ts";

export function createJournalPanel(readState: () => MmoSkillDemoState | undefined) {
  function journalEntryCard(player: PlayerEntity, entry: FieldJournalEntry) {
    const done = entry.complete(player);
    const row = document.createElement("div");
    row.className = `mmo-skill-card${done ? " is-complete" : ""}`;
    row.style.cursor = "default";

    const top = document.createElement("div");
    top.style.display = "grid";
    top.style.gridTemplateColumns = "minmax(0, 1fr) auto";
    top.style.gap = "8px";
    top.style.alignItems = "baseline";

    const name = document.createElement("span");
    name.className = "mmo-skill-name";
    name.textContent = entry.title;

    const badge = document.createElement("span");
    badge.className = "mmo-status-badge";
    badge.textContent = done ? "Marked" : labelize(entry.kind);

    const summary = document.createElement("span");
    summary.className = "mmo-skill-meta";
    summary.textContent = entry.summary(player);

    const unlock = document.createElement("span");
    unlock.className = "mmo-skill-meta";
    unlock.textContent = `Opens: ${entry.unlock}`;

    const clue = document.createElement("span");
    clue.className = "mmo-skill-meta";
    clue.textContent = `${labelize(entry.zoneId)} | ${entry.clue}`;

    top.append(name, badge);
    row.append(top, summary, unlock, clue);
    return row;
  }

  function fieldAdviceTitle(player: PlayerEntity) {
    if (hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`) && !hasQuestFlag(player, PROVING_CONTRACT_ID)) return "First Arms";
    if (!hasQuestFlag(player, "first-cut")) return "Rowan's Margin";
    if (!hasQuestFlag(player, "wolf-culling")) return "Road Note";
    if (!hasQuestFlag(player, "final-cut")) return "Rowan's Pledge";
    if (!hasQuestFlag(player, "fast-travel-registered")) return "Dock Note";
    if (!hasInventoryItem(player, "pickaxe") && !Boolean(player.equipment?.pickaxe)) return "Forge Note";
    if (!hasQuestFlag(player, "heavy-lifting")) return "Ore Ledger";
    if (!hasQuestFlag(player, "silent-sands")) return "Bazaar Note";
    return "Field Note";
  }

  function fieldAdviceRows(player: PlayerEntity) {
    const current = nextGoal(player);
    const state = readState();
    const early = state ? earlyLoopAction(state, player) : undefined;
    const returnRow = state ? earlyLoopReturnBriefing(state, player) : current;
    if (hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`) && !hasQuestFlag(player, PROVING_CONTRACT_ID)) {
      return [
        early?.hudText ?? current,
        returnRow,
        "The board pays after three loaner trials. Normal First Cut stays available."
      ];
    }
    if (!hasQuestFlag(player, "first-cut")) {
      return [
        early?.hudText ?? current,
        returnRow,
        "Rowan only names heavier lessons after five clean Ash cuts."
      ];
    }
    if (!hasQuestFlag(player, "wolf-culling")) {
      return [
        current,
        returnRow,
        "The road drill waits until the pack stops owning the path."
      ];
    }
    if (!hasQuestFlag(player, "final-cut")) {
      return [
        current,
        returnRow,
        "One last Ashwood pledge makes Marrow's route worth opening."
      ];
    }
    if (!hasQuestFlag(player, "fast-travel-registered")) {
      return [
        current,
        returnRow,
        "Captain Marrow is the next route source; register Ashwood before chasing dock rumors."
      ];
    }
    if (!hasInventoryItem(player, "pickaxe") && !Boolean(player.equipment?.pickaxe)) {
      return [
        current,
        "Ironcrag comes before desert trials. Foreman Iron-Will sells the pick that makes ore work real."
      ];
    }
    if (!hasQuestFlag(player, "heavy-lifting")) {
      return [
        current,
        returnRow,
        `Ore banked: ${Math.min(50, bankQty(player, "iron-ore"))}/50. Kael's desert stance stays a rumor until the foreman marks your work.`
      ];
    }
    if (!hasQuestFlag(player, "silent-sands")) {
      return [
        current,
        returnRow,
        "Master Kael's Q lesson is worth knowing about now; enter the Bazaar when you want pressure."
      ];
    }
    return [
      current,
      returnRow,
      "Marked proofs stay here so a returning route still has a trail."
    ];
  }

  function journalContent(player: PlayerEntity) {
    const entries = FIELD_JOURNAL_ENTRIES.filter((entry) => entry.visible(player));
    const active = entries.filter((entry) => !entry.complete(player));
    const marked = entries.filter((entry) => entry.complete(player));
    return panelStack(
      panelSection(fieldAdviceTitle(player), textRows(fieldAdviceRows(player))),
      ...(active.length ? [panelSection("Field Rumors", gridPanel(active.map((entry) => journalEntryCard(player, entry))))] : []),
      ...(marked.length ? [panelSection("Marked Proof", gridPanel(marked.map((entry) => journalEntryCard(player, entry))))] : [])
    );
  }

  return { content: journalContent, rows: fieldAdviceRows, title: fieldAdviceTitle };
}
