import { runtimeCallback } from "./runtime-ports.ts";
const isFocusElementAvailable = runtimeCallback("inputAndMenu", "isFocusElementAvailable");
const menuTargets = runtimeCallback("inputAndMenu", "menuTargets");
const selectLevelChoice = runtimeCallback("progressionUi", "selectLevelChoice");
import { ui } from "./user-interface.ts";
import { createRovingFocusController } from "@hyperfocus/engine/ui";
import { state } from "./arena-state.ts";

export type ArenaGamepadState = {
  connected: boolean;
  index: number | null;
  id: string;
  inputMode: "keyboard" | "controller";
  moveX: number;
  moveZ: number;
  moveActive: boolean;
  aimX: number;
  aimZ: number;
  lookX: number;
  lookY: number;
  menuIndex: number;
  stickNavX: boolean;
  stickNavY: boolean;
};
export const gamepadState: ArenaGamepadState = {
  connected: false,
  index: null,
  id: "",
  inputMode: "keyboard",
  moveX: 0,
  moveZ: 0,
  moveActive: false,
  aimX: 0,
  aimZ: -1,
  lookX: 0,
  lookY: 0,
  menuIndex: 0,
  stickNavX: false,
  stickNavY: false
};

export type FocusItem = {
  element: HTMLElement;
  zone: "actions" | "classes" | "loadoutWeapons" | "loadoutPassives" | "lobby" | "pause" | "settings" | "confirm" | "levelChoice";
  row: number;
  col: number;
  disabled?: boolean;
};
export type MenuDirection = "up" | "down" | "left" | "right";
export type MenuMove = { x: number; y: number; active: boolean };

export const menuFocus = createRovingFocusController({
  getTargets: menuTargets,
  document,
  root: document,
  shouldFocus: () => gamepadState.inputMode === "controller",
  isAvailable: (element) => isFocusElementAvailable(element),
  onFocus(target, index) {
    gamepadState.menuIndex = index;
    if (state.levelChoice) {
      const choiceButtons = [...(ui.levelChoiceGrid?.querySelectorAll(".level-choice-card") ?? [])];
      const choiceIndex = choiceButtons.indexOf(target);
      if (choiceIndex >= 0) selectLevelChoice(choiceIndex);
    }
  }
});
