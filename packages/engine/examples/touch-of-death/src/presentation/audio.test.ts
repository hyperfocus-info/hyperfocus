import { expect, test } from 'bun:test';
import { combatAudioCues3D } from '@hyperfocus/engine/project/runtime-3d';
import { cookTouchOfDeathAudio, cookTouchOfDeathAudioVariants } from './audio.ts';

test('layered combat cues are deterministic bounded PCM with clean edges and audible bodies', () => {
  const first = cookTouchOfDeathAudio(), second = cookTouchOfDeathAudio();
  expect(new Set(first.map(cue => cue.cue))).toEqual(new Set(combatAudioCues3D.filter(cue => !['countdown', 'fight', 'environmentWarning', 'environmentBreak'].includes(cue))));
  for (const [index, cue] of first.entries()) {
    expect(cue.bytes).toEqual(second[index]!.bytes);
    let peak = 0, energy = 0;
    expect(cue.samples.every(Number.isFinite)).toBe(true);
    for (const value of cue.samples) { peak = Math.max(peak, Math.abs(value));energy += value * value; }
    expect(peak).toBeLessThan(.73);
    expect(peak).toBeGreaterThan(.05);
    expect(Math.sqrt(energy / cue.samples.length)).toBeGreaterThan(.008);
    expect(Math.abs(cue.samples[0]!)).toBe(0);
    expect(Math.abs(cue.samples.at(-1)!)).toBe(0);
    expect(new TextDecoder().decode(cue.bytes.slice(0, 4))).toBe('RIFF');
  }
  const cues = new Map(first.map(cue => [cue.cue, cue]));
  expect(cues.get('weaponWood')!.bytes).not.toEqual(cues.get('weaponMetal')!.bytes);
  expect(cues.get('hitHeavy')!.samples.length).toBeGreaterThan(cues.get('hit')!.samples.length);
  expect(cues.get('step')!.bytes).not.toEqual(cues.get('stepAlternate')!.bytes);
});

function correlation(left: Float32Array, right: Float32Array) {
  let dot = 0, a = 0, b = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const x = left[index] ?? 0, y = right[index] ?? 0;
    dot += x * y;a += x * x;b += y * y;
  }
  return Math.abs(dot / Math.sqrt(a * b));
}

test('body impacts, floor slams and wall bounces have different constructions; quiet city grains leave headroom', () => {
  const sounds = new Map(cookTouchOfDeathAudio().map(sound => [sound.cue, sound]));
  for (const [left, right] of [['hitHeavy', 'landHeavy'], ['hitHeavy', 'bounce'], ['landHeavy', 'bounce']] as const) {
    expect(correlation(sounds.get(left)!.samples, sounds.get(right)!.samples)).toBeLessThan(.65);
  }
  for (const cue of ['cityBed', 'machinery'] as const) {
    const sound = sounds.get(cue)!;
    expect(Math.max(...sound.samples.map(Math.abs))).toBeLessThan(.11);
    expect(sound.samples.length / sound.sampleRate).toBeLessThanOrEqual(1.2);
  }
});

test('frequent sounds have four repeatable distinct takes including their base without altering the event identity', () => {
  const base = cookTouchOfDeathAudio(), takes = cookTouchOfDeathAudioVariants(), repeat = cookTouchOfDeathAudioVariants();
  expect(takes.map(take => take.bytes)).toEqual(repeat.map(take => take.bytes));
  for (const cue of new Set(takes.map(take => take.cue))) {
    const bank = [base.find(sound => sound.cue === cue)!, ...takes.filter(sound => sound.cue === cue)];
    expect(bank).toHaveLength(4);
    expect(new Set(bank.map(sound => new Bun.CryptoHasher('sha256').update(sound.bytes).digest('hex'))).size).toBe(4);
    for (const sound of bank) {
      expect(sound.samples.every(Number.isFinite)).toBe(true);
      expect(Math.abs(sound.samples[0]!)).toBe(0);
      expect(Math.abs(sound.samples.at(-1)!)).toBe(0);
    }
  }
  expect(() => cookTouchOfDeathAudio({ sampleRate: 1 })).toThrow('sample rate');
});

test('recurring machinery retains its low motor without sustained ringing carriers', () => {
  const sound = cookTouchOfDeathAudio().find(sound => sound.cue === 'machinery')!;
  function toneAmplitude(hz: number) {
    let real = 0, imaginary = 0, windowSum = 0;
    for (let index = 0; index < sound.samples.length; index++) {
      const window = Math.sin(Math.PI * index / (sound.samples.length - 1)) ** 2;
      const phase = 2 * Math.PI * hz * index / sound.sampleRate;
      real += sound.samples[index]! * window * Math.cos(phase);
      imaginary += sound.samples[index]! * window * Math.sin(phase);windowSum += window;
    }
    return 2 * Math.hypot(real, imaginary) / windowSum;
  }
  expect(toneAmplitude(72)).toBeGreaterThan(.015);
  for (const hz of [290, 426.3, 617.7]) expect(toneAmplitude(hz)).toBeLessThan(.001);
});

test('bounce contact retains its transient but its metallic accent ends before a recurring tail', () => {
  const sound = cookTouchOfDeathAudio().find(sound => sound.cue === 'bounce')!;
  expect(Math.max(...sound.samples.slice(0, Math.round(sound.sampleRate * .04)).map(Math.abs))).toBeGreaterThan(.4);
  const start = Math.round(.06 * sound.sampleRate), length = sound.samples.length - start;
  for (const hz of [540, 793.8, 1150.2]) {
    let real = 0, imaginary = 0, weight = 0;
    for (let index = 0; index < length; index++) {
      const window = Math.sin(Math.PI * index / (length - 1)) ** 2, phase = 2 * Math.PI * hz * index / sound.sampleRate;
      real += sound.samples[start + index]! * window * Math.cos(phase);imaginary += sound.samples[start + index]! * window * Math.sin(phase);weight += window;
    }
    expect(2 * Math.hypot(real, imaginary) / weight).toBeLessThan(.001);
  }
});
