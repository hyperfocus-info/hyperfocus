import { combatAudioCues3D } from '@hyperfocus/engine/project/runtime-3d';
import { combatSoundRecipes, recurringCombatSounds } from './audio/recipes.ts';
import { cookCombatSound } from './audio/render.ts';

/** Original portable PCM assets; playback and selection belong to the combat runtime. */
export function cookTouchOfDeathAudio({ sampleRate = 24000 }: { sampleRate?: number } = {}) {
  return combatAudioCues3D.flatMap(cue => {
    const recipe = combatSoundRecipes[cue];
    return recipe ? [cookCombatSound(cue, recipe, sampleRate, 0)] : [];
  });
}

/** Three additional curated takes join each base sound in a four-take bank. */
export function cookTouchOfDeathAudioVariants({ sampleRate = 24000 }: { sampleRate?: number } = {}) {
  return recurringCombatSounds.flatMap(cue => {
    const recipe = combatSoundRecipes[cue];
    if (!recipe) throw new Error(`Missing Touch of Death recipe: ${cue}.`);
    return [1, 2, 3].map(take => cookCombatSound(cue, recipe, sampleRate, take));
  });
}
