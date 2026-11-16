export { createCombatPreset, validateCombatConfig } from "./config.ts";
export type { CombatConfig, CombatDirection, CombatMove, CombatVector } from "./config.ts";
export { readCombatConfig } from "./read.ts";
export { createCombatSimulation } from "./simulation.ts";
export { combatRecoveryFrames, combatMoveDuration } from './combo/timing.ts';
export { configureTouchOfDeathCombos } from './combo/preset.ts';
export { inspectCombatInput } from './combo/input.ts';
export type { CombatContact, CombatEvent, CombatFighter, CombatFighterState, CombatInput, CombatSnapshot } from "./state.ts";

export { createTouchOfDeathPreset } from "./touch-of-death.ts";
export type { CombatCollision } from "./state.ts";
