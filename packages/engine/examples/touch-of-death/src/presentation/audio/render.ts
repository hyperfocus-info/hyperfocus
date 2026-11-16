import { renderSfxPreset } from '@hyperfocus/engine/audio';
import type { CombatAudioCue3D } from '@hyperfocus/engine/project/runtime-3d';
import { encodeMonoPcmWav } from '@hyperfocus/engine/audio';
import type { CombatSoundRecipe } from './recipes.ts';

function soundSeed(cue: string, take: number) {
  let seed = 711 + take * 107;
  for (const character of cue) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

function textureEnvelope(recipe: CombatSoundRecipe, time: number) {
  const phase = time / recipe.seconds, arc = Math.sin(Math.PI * phase);
  if (recipe.shape === 'fire') return arc ** .6 * (.65 + .35 * Math.sin(time * 97) ** 2);
  if (recipe.shape === 'water') return arc ** 2 * Math.exp(-time * 5);
  if (recipe.shape === 'air') return arc ** 2;
  if (recipe.shape === 'bed') return arc ** 2 * (.75 + .25 * Math.sin(time * 13) ** 2);
  if (recipe.shape === 'roll') return arc ** 1.5;
  if (recipe.shape === 'spray') return Math.min(1, time * 80) * Math.min(1, (recipe.seconds - time) * 18);
  return Math.exp(-time * (recipe.decay ?? 24));
}

function addLayers(samples: Float32Array, recipe: CombatSoundRecipe, sampleRate: number, seed: number, take: number) {
  const pitch = [1, .94, 1.045, .98][take] ?? 1;
  for (const [preset, gain, rate, delay] of recipe.layers) {
    const source = renderSfxPreset({ preset, style: 'realistic', sampleRate, seed }).samples;
    const offset = Math.round(delay * sampleRate);
    for (let index = offset; index < samples.length; index++) {
      const position = (index - offset) * rate * pitch, left = Math.floor(position), fraction = position - left;
      samples[index] += ((source[left] ?? 0) * (1 - fraction) + (source[left + 1] ?? 0) * fraction) * gain;
    }
  }
}

function addTexture(samples: Float32Array, recipe: CombatSoundRecipe, sampleRate: number, initialSeed: number, take: number) {
  let seed = initialSeed, low = 0;
  const pitch = [1, .94, 1.045, .98][take] ?? 1;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += (recipe.shape === 'bed' || recipe.shape === 'roll' ? .035 : .12) * (noise - low);
    const envelope = textureEnvelope(recipe, time);
    samples[index] += (recipe.shape === 'bed' || recipe.shape === 'roll' ? low : noise - low * .75) * (recipe.grit ?? 0) * envelope;
    const phaseTime = time + ((recipe.pitchEndRatio ?? 1) - 1) * time * time / (2 * recipe.seconds);
    if (recipe.body) samples[index] += .3 * Math.sin(2 * Math.PI * recipe.body * pitch * phaseTime) * (recipe.shape === 'bed' || recipe.shape === 'roll' ? envelope : Math.exp(-time * (recipe.decay ?? 22)));
    if (recipe.ring) for (const ratio of [1, 1.47, 2.13]) samples[index] += .12 * Math.sin(2 * Math.PI * recipe.ring * pitch * ratio * phaseTime) * (recipe.shape === 'bed' ? envelope : Math.exp(-time * (recipe.ringDecay ?? (10 + ratio * 3))));
    for (const [frequency, delay, duration, gain] of recipe.notes ?? []) {
      const elapsed = time - delay;
      if (elapsed < 0 || elapsed >= duration) continue;
      const fade = Math.min(1, elapsed * 250) * Math.exp(-elapsed / duration * 5) * Math.min(1, (duration - elapsed) * 80);
      samples[index] += (Math.sin(2 * Math.PI * frequency * elapsed) + .18 * Math.sin(4 * Math.PI * frequency * elapsed)) * fade * gain;
    }
  }
}

function finishSound(samples: Float32Array, recipe: CombatSoundRecipe, sampleRate: number) {
  if (recipe.reflections === true) {
    const dry = samples.slice();
    for (const [delay, gain] of [[.023, .1], [.047, .055]] as const) {
      const offset = Math.round(delay * sampleRate);
      for (let index = offset; index < samples.length; index++) samples[index] += dry[index - offset]! * gain;
    }
  }
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    samples[index] *= Math.min(1, index / (sampleRate * .0015), (samples.length - 1 - index) / (sampleRate * .018));
    peak = Math.max(peak, Math.abs(samples[index]!));
  }
  const gain = recipe.peak / Math.max(peak, .001);
  for (let index = 0; index < samples.length; index++) samples[index] *= gain;
}

export function cookCombatSound(cue: CombatAudioCue3D, recipe: CombatSoundRecipe, sampleRate: number, take: number) {
  if (!Number.isSafeInteger(sampleRate) || sampleRate < 16000 || sampleRate > 48000) throw new RangeError('Touch of Death sample rate must be from 16000 through 48000.');
  const samples = new Float32Array(Math.ceil(recipe.seconds * sampleRate)), seed = soundSeed(cue, take);
  addLayers(samples, recipe, sampleRate, seed, take);
  addTexture(samples, recipe, sampleRate, seed, take);
  finishSound(samples, recipe, sampleRate);
  return { cue, take, name: `TOD layered ${cue}${take ? ` take ${take + 1}` : ''}.wav`, samples, sampleRate, bytes: encodeMonoPcmWav({ samples, sampleRate }) };
}
