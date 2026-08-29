import { bankQty, hasQuestFlag, itemQty } from "../shared-loadout.ts";
import { type MmoSkillDemoInput, type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { weaponMetadata } from "../shared-ability-catalog.ts";
import { currentUtcDateString, dailyQuestArcForDate } from "../data/daily-quests.ts";
import { earlyLoopReturnBriefing } from "./early-loop.ts";
import {
  PROVING_CONTRACT_ID,
  PROVING_LESSONS,
  PROVING_WEAPONS,
  labelize,
  nextGoal,
  playerQuestFlags,
  provingLessonFlag,
  provingRewardFlag,
  provingSampleCount,
  provingSampleFlag,
  worldEventLine
} from "./live-ui-model.ts";
import { panelSection, panelStack, progressPill, textRows } from "./live-ui-elements.ts";
import { contractInfo } from "./progression.ts";
import { mainQuestOptions } from "./quest-guide.ts";

export function createQuestPanel(input: {
  invalidate: () => void;
  queueInput: (value: MmoSkillDemoInput) => void;
  readState: () => MmoSkillDemoState | undefined;
  render: () => void;
}) {
  function questRows(player: PlayerEntity) {
    const contract = contractInfo(player.contractId);
    const state = input.readState();
    const accepted = Object.keys(playerQuestFlags(player))
      .filter((flag) => flag.endsWith("-accepted") && !hasQuestFlag(player, flag.slice(0, -"accepted".length - 1)))
      .map((flag) => labelize(flag.slice(0, -"accepted".length - 1)))
      .join(", ");
    return [
      `Next: ${nextGoal(player)}`,
      ...(state && !hasQuestFlag(player, "heavy-lifting") ? [`Return: ${earlyLoopReturnBriefing(state, player)}`] : []),
      `Accepted: ${accepted || labelize(player.activeQuestId || "first-cut")}`,
      `Contract: ${contract.name} ${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills} (${contract.area})${player.contractCooldownMs > 0 ? ` cooldown ${Math.ceil(player.contractCooldownMs / 1000)}s` : ""}`,
      `First Cut: ${Math.min(5, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/5 ${hasQuestFlag(player, "first-cut-ready") ? "ready" : ""}`,
      `Second Cut: ${Math.min(12, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/12 ${hasQuestFlag(player, "second-cut-ready") ? "ready" : ""}`,
      `Wolf Culling: ${Math.min(10, player.wolfKills)}/10 ${hasQuestFlag(player, "wolf-culling-ready") ? "ready" : ""}`,
      `Final Cut: ${hasQuestFlag(player, "final-cut") ? "done" : hasQuestFlag(player, "final-cut-ready") ? "ready" : "locked"}`,
      `Heavy Lifting: ${Math.min(50, bankQty(player, "iron-ore"))}/50 ${hasQuestFlag(player, "heavy-lifting-ready") ? "ready" : ""}`,
      `Silent Sands: ${Math.min(120, Math.floor(player.bazaarSurvivalMs / 1000))}/120s ${hasQuestFlag(player, "silent-sands-ready") ? "ready" : ""}`
    ];
  }

  function mainQuestContent(player: PlayerEntity) {
    const grid = document.createElement("div");
    grid.className = "mmo-card-grid";
    for (const option of mainQuestOptions(player)) {
      const button = document.createElement("button");
      button.className = `mmo-choice-card${option.active ? " is-active" : ""}`;
      button.type = "button";
      button.disabled = !option.selectable || option.active;
      button.title = option.active ? option.summary : `Track ${option.label}`;
      const name = document.createElement("span");
      name.className = "mmo-item-name";
      name.textContent = option.label;
      const meta = document.createElement("span");
      meta.className = "mmo-item-meta";
      meta.textContent = `${option.status} ${Math.min(option.value, option.max)}/${Math.max(1, option.max)}`;
      button.replaceChildren(name, meta);
      button.addEventListener("click", () => {
        if (button.disabled) return;
        player.activeQuestId = option.id;
        input.queueInput({ action: "config", devField: "mainQuest", devText: option.id });
        input.invalidate();
        input.render();
      });
      grid.append(button);
    }
    return panelSection("Main Quest", grid);
  }

  function dailyQuestContent(player: PlayerEntity) {
    const arc = dailyQuestArcForDate(player.dailyQuestDate || currentUtcDateString());
    const step = arc.steps[player.dailyQuestStep || 0];
    const progress = step ? Math.min(step.targetCount, player.dailyQuestProgress || 0) : 0;
    const ready = Boolean(step && progress >= step.targetCount);
    const rows = [`Factions: ${labelize(arc.primaryFaction)} / ${labelize(arc.rivalFaction)}`];
    if (step && !player.dailyQuestCompleted) rows.push(step.instructions);
    if (step?.masteryGate && !player.dailyQuestCompleted) rows.push(`Gate: ${step.masteryGate}`);
    if (step?.progressionPayoff && !player.dailyQuestCompleted) rows.push(`Payoff: ${step.progressionPayoff}`);
    if (player.dailyQuestResult) rows.push(player.dailyQuestResult);

    const dailyProgress = player.dailyQuestCompleted || !step
      ? progressPill(arc.title, 1, 1, "complete")
      : progressPill(step.title, progress, step.targetCount);
    const wrap = panelSection("Daily", dailyProgress, textRows(rows));
    if (step && !player.dailyQuestCompleted) {
      const choices = document.createElement("div");
      choices.className = "mmo-card-grid";
      for (const choice of step.choices) {
        const button = document.createElement("button");
        button.className = "mmo-choice-card";
        button.type = "button";
        button.disabled = !ready;
        button.textContent = choice.text;
        button.title = ready ? choice.resultingText : "Finish the active daily objective first.";
        button.addEventListener("click", () => {
          if (button.disabled) return;
          input.queueInput({ action: "config", devField: "dailyChoice", devText: choice.id });
          input.invalidate();
          input.render();
        });
        choices.append(button);
      }
      wrap.append(choices);
    }
    return wrap;
  }

  function provingButton(label: string, command: string, disabled: boolean, title: string) {
    const button = document.createElement("button");
    button.className = "mmo-choice-card";
    button.type = "button";
    button.disabled = disabled;
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", () => {
      if (button.disabled) return;
      input.queueInput({ action: "config", devField: "proving", devText: command });
      input.invalidate();
      input.render();
    });
    return button;
  }

  function provingContractContent(player: PlayerEntity) {
    const accepted = hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`);
    const complete = hasQuestFlag(player, PROVING_CONTRACT_ID);
    const sampleCount = provingSampleCount(player);
    const rows = complete
      ? [`First Arms paid out. Chosen weapon, starter purse, next action: ${nextGoal(player)}`]
      : accepted
        ? [`Loaner trials: ${sampleCount}/3. Choose one reward weapon after three trials. Fallback: cut Ash tree.`]
        : ["Optional paid contract: try loaner weapons, keep one, and take a starter purse."];
    const section = panelSection("First Arms", textRows(rows));

    if (!accepted && !complete) {
      section.append(provingButton("Accept Paid Trial", "accept", false, "Open the optional proving contract."));
      return section;
    }

    const samples = document.createElement("div");
    samples.className = "mmo-card-grid";
    for (const weaponId of PROVING_WEAPONS) {
      const name = weaponMetadata[weaponId]?.name ?? labelize(weaponId);
      const sampled = hasQuestFlag(player, provingSampleFlag(weaponId));
      const chosen = hasQuestFlag(player, provingRewardFlag(weaponId));
      if (!complete) {
        samples.append(provingButton(sampled ? `${name} Tried` : `Try ${name}`, `sample:${weaponId}`, false, sampled ? "Try this loaner again." : "Equip this loaner for the proving yard."));
        samples.append(provingButton(chosen ? `${name} Kept` : `Keep ${name}`, `choose:${weaponId}`, sampleCount < 3, sampleCount < 3 ? "Try three loaners first." : "Keep this weapon and claim the starter purse."));
      } else if (chosen) {
        samples.append(provingButton(`${name} Kept`, `choose:${weaponId}`, true, "Chosen First Arms reward."));
      }
    }
    if (samples.childElementCount) section.append(samples);
    return section;
  }

  function provingLessonsContent(player: PlayerEntity) {
    if (!hasQuestFlag(player, PROVING_CONTRACT_ID)) {
      return panelSection("Lesson Contracts", textRows(["Finish First Arms to open paid lessons for statuses, crafting, buffs, gathering, cities, and travel."]));
    }
    const grid = document.createElement("div");
    grid.className = "mmo-card-grid";
    for (const lesson of PROVING_LESSONS) {
      const complete = hasQuestFlag(player, provingLessonFlag(lesson.id));
      const button = provingButton(complete ? `${lesson.title} Paid` : lesson.title, `lesson:${lesson.id}`, complete, complete ? lesson.reward : `${lesson.note} Reward: ${lesson.reward}.`);
      grid.append(button);
    }
    return panelSection("Lesson Contracts", grid);
  }

  function questContent(player: PlayerEntity) {
    const contract = contractInfo(player.contractId);
    return panelStack(
      mainQuestContent(player),
      provingContractContent(player),
      provingLessonsContent(player),
      dailyQuestContent(player),
      panelSection("Next", textRows([nextGoal(player)])),
      panelSection("Contract", progressPill(contract.name, Math.min(contract.targetKills, player.contractKills), contract.targetKills, `${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills}`)),
      panelSection("Quest Log", textRows(questRows(player).slice(3)))
    );
  }

  function eventContent(state: MmoSkillDemoState) {
    return panelStack(
      panelSection("World Event", progressPill(state.worldEventName, Math.min(state.worldEventGoal, state.worldEventProgress), Math.max(1, state.worldEventGoal), `${Math.min(state.worldEventGoal, state.worldEventProgress)}/${state.worldEventGoal}`)),
      panelSection("Objective", textRows([state.worldEventObjective, worldEventLine(state), state.worldEventReward]))
    );
  }

  return {
    event: eventContent,
    quest: questContent
  };
}
