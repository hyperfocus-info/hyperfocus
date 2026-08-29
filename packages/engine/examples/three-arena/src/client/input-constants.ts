import { createGamepadSession } from "@hyperfocus/engine";

export const GAMEPAD_BUTTON = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  create: 8,
  options: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15
};
export const MOVE_DEADZONE = 0.16;
export const AIM_DEADZONE = 0.22;
export const gamepadSession = createGamepadSession({
  mapperConfig: {
    defaultMovementDeadzone: MOVE_DEADZONE,
    defaultAimDeadzone: AIM_DEADZONE,
    buttonPressThreshold: 0.45,
  },
});
export const MANUAL_AIM_PRIORITY_SECONDS = 1.2;
export const CONTROL_HINTS = {
  controller: "PS5: left stick moves, D-pad moves menus, Cross selects, Start pauses.",
  keyboard: "Keyboard: WASD move, mouse aim, Space jumps, Escape pauses."
};

export const WAVE_BANNER_SUBTITLES: Record<string, string> = {
  "graveyard-wake": "First hands are slow. Take shards early.",
  "crawl-from-crypts": "Crawlers are low. Keep your back out of the grass.",
  "ghoul-sprint": "Runners cut circles. Break one lane before looting.",
  "rotting-barrage": "Archers draw pale lines. Cross after the shot.",
  "open-graves": "Fresh dirt bites. Step wide before it opens.",
  "witching-hour": "Purple circles mean move now.",
  "bone-tide": "The brute raises a club. Leave the ring.",
  "blood-moon": "The red cape locks before the dash.",
  "catacomb-collapse": "Dust shadows show where stone will land.",
  "lich-procession": "The fence is lost. Keep one escape lane."
};
