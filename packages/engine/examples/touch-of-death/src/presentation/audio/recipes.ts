import type { SfxPresetName } from '@hyperfocus/engine/audio';
import type { CombatAudioCue3D } from '@hyperfocus/engine/project/runtime-3d';

export type CombatSoundRecipe = {
  layers: readonly (readonly [SfxPresetName, number, number, number])[];
  body?: number; ring?: number; grit?: number; peak: number; seconds: number;
  shape?: 'air' | 'fire' | 'water' | 'bed' | 'roll' | 'spray';
  decay?: number; reflections?: boolean;
  ringDecay?: number;
  pitchEndRatio?: number;
  notes?: readonly (readonly [number, number, number, number])[];
};

const impact = (heavy: boolean): CombatSoundRecipe => ({ layers: [['hit', .62, heavy ? .75 : 1.3, 0], ['land', .3, heavy ? .8 : 1.4, .008]], body: heavy ? 78 : 125, grit: .12, peak: heavy ? .7 : .55, seconds: heavy ? .42 : .25 });
const foot = (rate: number, heavy = false): CombatSoundRecipe => ({ layers: [['footstep', .65, rate, 0], ['land', .2, rate, .007]], body: heavy ? 95 : 150, grit: .06, peak: heavy ? .32 : .22, seconds: .22 });
const wood = (heavy = false): CombatSoundRecipe => ({ layers: [['footstep', .25, 1.15, 0]], body: heavy ? 290 : 410, grit: .12, peak: heavy ? .34 : .23, seconds: .24 });
const metal = (heavy = false): CombatSoundRecipe => ({ layers: [['footstep', .18, 1.45, 0]], ring: heavy ? 660 : 980, grit: .06, peak: heavy ? .34 : .23, seconds: .24 });
const wet = (heavy = false): CombatSoundRecipe => ({ layers: [['footstep', .15, 1.2, 0]], body: 195, grit: .35, shape: 'water', peak: heavy ? .32 : .22, seconds: .22 });
const brittle = (glass: boolean, breaking = false): CombatSoundRecipe => ({ layers: [['hit', breaking ? .3 : .15, glass ? 2.9 : 2.15, 0]],
  ring: glass ? 2850 : 1450, body: glass ? 620 : 780, grit: breaking ? .38 : .17, decay: glass ? 24 : 35, peak: breaking ? .46 : .3, seconds: breaking ? .3 : .17 });
const soft = (): CombatSoundRecipe => ({ layers: [['land', .12, 1.6, 0]], body: 120, grit: .06, decay: 32, peak: .23, seconds: .16 });
const scatter = (): CombatSoundRecipe => ({ layers: [['footstep', .12, 2.2, 0], ['footstep', .08, 1.8, .035], ['footstep', .06, 2.5, .075]], ring: 960, grit: .12, decay: 24, peak: .28, seconds: .25 });
const sting = (win: boolean, match: boolean): CombatSoundRecipe => ({ layers: [], peak: match ? .48 : .34, seconds: match ? .85 : .5, reflections: false,
  notes: win ? [[392, 0, .15, .22], [493.88, .10, .15, .20], [587.33, .20, match ? .50 : .20, .25]] : [[392, 0, .16, .18], [349.23, .12, .18, .20], [293.66, .24, match ? .44 : .20, .22]] });

export const combatSoundRecipes: Partial<Record<CombatAudioCue3D, CombatSoundRecipe>> = {
  hit: impact(false), hitHeavy: impact(true),
  armor: { layers: [['hit', .22, 1.6, 0]], body: 230, ring: 720, grit: .06, peak: .38, seconds: .16 },
  weaponGlass: brittle(true), weaponGlassBreak: brittle(true, true), weaponGlassDrop: brittle(true),
  weaponCeramic: brittle(false), weaponCeramicBreak: brittle(false, true), weaponCeramicDrop: brittle(false),
  weaponSoft: soft(), weaponSoftBreak: soft(), weaponSoftDrop: soft(),
  weaponLiquid: wet(), weaponLiquidBreak: wet(true), weaponLiquidDrop: wet(), weaponLiquidDeploy: wet(true),
  weaponScatter: scatter(), weaponScatterBreak: scatter(), weaponScatterDrop: scatter(), weaponScatterDeploy: scatter(),
  hazardIgnition: { layers: [['explosion', .14, 2, 0]], body: 62, grit: .3, decay: 15, peak: .38, seconds: .35 },
  motorShutdown: { layers: [], body: 72, ring: 290, grit: .12, shape: 'roll', peak: .25, seconds: .55, pitchEndRatio: .35 },
  environmentMasonryBreak: { layers: [['explosion', .22, 1.1, 0], ['land', .3, .75, .01]], body: 82, grit: .38, decay: 13, peak: .55, seconds: .4 },
  environmentWoodBreak: { layers: [['hit', .35, 1.3, 0]], body: 180, grit: .5, decay: 18, peak: .48, seconds: .3 },
  environmentMetalBreak: { layers: [['hit', .3, 1.1, 0]], ring: 760, grit: .3, decay: 17, peak: .48, seconds: .35 },
  environmentGlassBreak: brittle(true, true),
  uiFocus: { layers: [], peak: .12, seconds: .035, notes: [[840, 0, .035, .15]] },
  uiConfirm: { layers: [], peak: .24, seconds: .12, notes: [[660, 0, .06, .2], [990, .06, .06, .2]] },
  uiBack: { layers: [], peak: .2, seconds: .12, notes: [[660, 0, .06, .18], [440, .06, .06, .18]] },
  uiAdjust: { layers: [], peak: .12, seconds: .035, notes: [[760, 0, .035, .15]] },
  uiDenied: { layers: [], peak: .2, seconds: .12, notes: [[220, 0, .06, .18], [196, .06, .06, .18]] },
  block: { layers: [['hit', .45, 1.9, 0], ['land', .22, 1.4, .004]], body: 190, grit: .1, peak: .48, seconds: .19 },
  parry: { layers: [['hit', .25, 2.3, 0]], ring: 1850, body: 320, grit: .04, peak: .58, seconds: .32 },
  tech: { layers: [['hit', .2, 2, 0], ['jump', .16, 1.8, .014]], body: 230, grit: .08, peak: .46, seconds: .22 },
  guardBreak: { layers: [['hit', .55, .85, 0], ['explosion', .16, 2.2, .012]], body: 62, grit: .24, peak: .72, seconds: .52 },
  escape: { layers: [['land', .45, .75, 0], ['jump', .3, .8, .015]], body: 68, grit: .12, peak: .65, seconds: .45 },
  ko: { layers: [['land', .55, .65, 0], ['hit', .2, .8, .006]], body: 48, grit: .1, peak: .65, seconds: .6 },
  step: foot(1.15), stepAlternate: foot(1.02), sprint: foot(1.4, true), sprintAlternate: foot(1.24, true),
  land: foot(.8, true),
  landHeavy: { layers: [['land', .7, .56, 0], ['explosion', .12, 1.8, .016]], body: 44, grit: .28, decay: 12, peak: .6, seconds: .50 },
  bounce: { layers: [['hit', .24, 2.1, 0], ['land', .12, 1.5, .014]], ring: 540, ringDecay: 70, body: 210, grit: .22, decay: 17, peak: .6, seconds: .30 },
  jump: { layers: [['footstep', .22, 1.3, 0], ['jump', .22, 1.2, .008]], grit: .12, peak: .34, seconds: .22 },
  dash: { layers: [['footstep', .2, 1.6, 0]], grit: .42, shape: 'air', peak: .32, seconds: .23 },
  swing: { layers: [], grit: .44, shape: 'air', peak: .25, seconds: .14 },
  swingHeavy: { layers: [], grit: .48, body: 130, shape: 'air', peak: .32, seconds: .25 },
  blood: { layers: [], grit: .18, body: 240, peak: .18, seconds: .11 },
  weaponWood: { layers: [['hit', .3, 1.8, 0]], body: 410, grit: .28, peak: .4, seconds: .19 },
  weaponMetal: { layers: [['hit', .15, 2.1, 0]], ring: 1320, grit: .1, peak: .4, seconds: .36 },
  weaponWoodBreak: { layers: [['hit', .5, 1.4, 0]], body: 180, grit: .5, peak: .6, seconds: .4 },
  weaponMetalBreak: { layers: [['hit', .4, 1.1, 0]], ring: 760, grit: .3, peak: .6, seconds: .55 },
  hazardFire: { layers: [], grit: .32, body: 52, shape: 'fire', peak: .22, seconds: .46 },
  hazardWater: { layers: [], grit: .3, body: 165, shape: 'water', peak: .30, seconds: .3 },
  airJump: { layers: [['jump', .2, 1.65, 0]], grit: .26, shape: 'air', peak: .32, seconds: .18 },
  wallJump: { layers: [['footstep', .3, .9, 0], ['jump', .16, 1.45, .025]], body: 240, grit: .24, peak: .36, seconds: .25 },
  wallStep: { ...foot(1.25), grit: .17, peak: .22 },
  wallSlide: { layers: [], grit: .3, body: 190, shape: 'roll', peak: .18, seconds: .28 },
  airDashReady: { layers: [], notes: [[660, 0, .12, .2], [880, .045, .11, .14]], peak: .21, seconds: .18, reflections: false },
  airDashUnavailable: { layers: [], notes: [[220, 0, .08, .18], [165, .045, .08, .18]], peak: .20, seconds: .14, reflections: false },
  stepWood: wood(), sprintWood: wood(true), landWood: { ...wood(true), body: 220, peak: .40, seconds: .30 },
  stepMetal: metal(), sprintMetal: metal(true), landMetal: { ...metal(true), ring: 520, body: 170, peak: .40, seconds: .35 },
  stepWet: wet(), sprintWet: wet(true), landWet: { ...wet(true), grit: .5, peak: .40, seconds: .34 },
  counter: { layers: [['hit', .12, 2.4, 0]], body: 310, ring: 1260, peak: .38, seconds: .17 },
  grabConnect: { layers: [['hit', .15, 1.8, 0]], body: 180, grit: .10, peak: .32, seconds: .14 },
  grabMiss: { layers: [], grit: .28, shape: 'air', peak: .22, seconds: .17 },
  weaponPickup: { layers: [['footstep', .12, 2.1, 0]], body: 370, grit: .08, peak: .24, seconds: .12 },
  weaponThrow: { layers: [], grit: .38, shape: 'air', peak: .3, seconds: .23 },
  weaponWoodDrop: { layers: [['hit', .16, 1.7, 0], ['footstep', .08, 1.8, .08]], body: 320, grit: .2, peak: .30, seconds: .24 },
  weaponMetalDrop: { layers: [['hit', .12, 2.4, 0]], ring: 1130, grit: .12, peak: .30, seconds: .4 },
  weaponSpray: { layers: [], grit: .5, shape: 'spray', peak: .27, seconds: .36, reflections: false },
  weaponDeploy: { layers: [['footstep', .3, .85, 0]], body: 150, grit: .2, peak: .30, seconds: .22 },
  weaponConsume: { layers: [['hit', .10, 2.6, 0]], grit: .28, body: 270, peak: .24, seconds: .13 },
  trafficPass: { layers: [], body: 58, grit: .4, shape: 'roll', peak: .20, seconds: .65, reflections: false },
  trafficBrake: { layers: [], ring: 1430, grit: .3, shape: 'roll', peak: .28, seconds: .36, reflections: false },
  trafficCrash: { layers: [['explosion', .3, 1.6, 0], ['hit', .15, .6, .02]], ring: 480, body: 62, grit: .4, decay: 9, peak: .65, seconds: .65 },
  machinery: { layers: [], body: 72, grit: .12, shape: 'bed', peak: .052, seconds: .9, reflections: false },
  cityBed: { layers: [], body: 48, grit: .18, shape: 'bed', peak: .07, seconds: 1.2, reflections: false },
  roundWin: sting(true, false), roundLoss: sting(false, false), matchWin: sting(true, true), matchLoss: sting(false, true),
};

export const recurringCombatSounds: readonly CombatAudioCue3D[] = [
  'hit', 'hitHeavy', 'block', 'swing', 'swingHeavy', 'step', 'stepAlternate', 'sprint', 'sprintAlternate',
  'stepWood', 'sprintWood', 'stepMetal', 'sprintMetal', 'stepWet', 'sprintWet', 'wallStep',
  'weaponWood', 'weaponMetal', 'weaponWoodDrop', 'weaponMetalDrop', 'hazardFire', 'trafficPass',
];
