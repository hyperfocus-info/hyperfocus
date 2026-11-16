import { readCombatConfig } from './read.ts';
import preset from './legacy-preset.json';

/** @deprecated Frozen 0.0 compatibility preset. Use the Touch of Death example's combat/preset export for current game rules. */
export function createTouchOfDeathPreset() { return readCombatConfig(preset); }
