import { arenaAudioRuntime, audio, state } from "./arena-state.ts";
import type { NoiseOptions, SynthCueKind, SynthCueOptions, ToneOptions } from "./runtime-types.ts";

export function ensureAudio(): boolean {
  const context = arenaAudioRuntime.ensure(currentAudioMix());
  if (!context) return false;
  if (!audio.noiseBuffer) {
    audio.noiseBuffer = createNoiseBuffer(context);
    audio.nextBeatAt = context.currentTime + 0.05;
    audio.beat = 0;
  }
  return true;
}

export function currentAudioMix() {
  return {
    master: state.settings.masterVolume,
    music: state.settings.musicVolume,
    sfx: state.settings.sfxVolume,
    muted: state.settings.muted,
  };
}

export function applyAudioSettings(): void {
  arenaAudioRuntime.apply(currentAudioMix());
}

export function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 1.2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    last = last * 0.72 + (Math.random() * 2 - 1) * 0.28;
    data[i] = last;
  }
  return buffer;
}

export function updateAudio(): void {
  const context = arenaAudioRuntime.graph.context;
  if (!context || context.state !== "running" || !arenaAudioRuntime.graph.music || !state.running) return;
  const now = context.currentTime;
  if (audio.nextBeatAt <= 0 || audio.nextBeatAt < now - 0.5) audio.nextBeatAt = now + 0.02;
  while (audio.nextBeatAt < now + 0.18) {
    scheduleMusicBeat(audio.nextBeatAt, audio.beat);
    audio.nextBeatAt += 0.3;
    audio.beat += 1;
  }
}

export function scheduleMusicBeat(time: number, beat: number): void {
  const roots = [55, 55, 65.41, 49, 58.27, 55, 73.42, 65.41];
  const root = roots[Math.floor(beat / 4) % roots.length] ?? 55;
  const pressure = Math.min(1, state.time / 420);
  if (beat % 4 === 0) {
    scheduleTone(time, root, 0.42, {
      type: "sawtooth",
      gain: 0.032 + pressure * 0.018,
      endFreq: root * 0.985,
      dest: arenaAudioRuntime.graph.music
    });
  }
  if (beat % 2 === 0) {
    const note = root * (beat % 8 === 6 ? 5.62 : 4);
    scheduleTone(time + 0.03, note, 0.09, {
      type: "triangle",
      gain: 0.018 + pressure * 0.012,
      endFreq: note * 1.01,
      dest: arenaAudioRuntime.graph.music
    });
  }
  if (beat % 4 === 2) {
    scheduleNoise(time + 0.01, 0.035, {
      gain: 0.016 + pressure * 0.012,
      frequency: 5200,
      type: "highpass",
      dest: arenaAudioRuntime.graph.music
    });
  }
  if (state.combo >= 6 && beat % 2 === 1) {
    scheduleTone(time + 0.11, root * 7.5, 0.055, {
      type: "square",
      gain: Math.min(0.026, 0.01 + state.combo * 0.0014),
      endFreq: root * 8.2,
      dest: arenaAudioRuntime.graph.music
    });
  }
}

export function playSynthCue(kind: SynthCueKind, intensity = 1, options: SynthCueOptions = {}): void {
  const context = arenaAudioRuntime.graph.context;
  if (!context || !arenaAudioRuntime.graph.sfx) return;
  context.resume?.().catch(() => undefined);
  const now = context.currentTime;
  const gain = Math.max(0.05, intensity);
  if (kind === "shot") {
    if (now < audio.shotGateAt) return;
    audio.shotGateAt = now + 0.035;
    const weaponId = String(options.weaponId ?? "");
    const base = weaponId.includes("Stake") || weaponId.includes("rifle") ? 290 : weaponId.includes("Lantern") || weaponId.includes("flame") ? 170 : 235;
    scheduleNoise(now, 0.028, { gain: 0.034 * gain, frequency: 1900, type: "highpass" });
    scheduleTone(now, base, 0.055, { type: "square", gain: 0.04 * gain, endFreq: base * 0.56 });
    return;
  }
  if (kind === "hit") {
    if (now < audio.hitGateAt) return;
    audio.hitGateAt = now + 0.024;
    scheduleTone(now, 620 + Math.random() * 140, 0.045, { type: "triangle", gain: 0.022 * gain, endFreq: 420 });
    scheduleNoise(now, 0.025, { gain: 0.02 * gain, frequency: 2800, type: "bandpass" });
    return;
  }
  if (kind === "pickup") {
    if (now < audio.pickupGateAt) return;
    audio.pickupGateAt = now + 0.045;
    const base = options.kind === "heal" ? 520 : 880;
    scheduleTone(now, base, 0.07, { type: "sine", gain: 0.035 * gain, endFreq: base * 1.55 });
    scheduleTone(now + 0.045, base * 1.5, 0.08, { type: "triangle", gain: 0.026 * gain, endFreq: base * 1.9 });
    return;
  }
  if (kind === "kill") {
    scheduleTone(now, 190 + Math.random() * 30, 0.12, { type: "sawtooth", gain: 0.05 * gain, endFreq: 84 });
    scheduleNoise(now, 0.07, { gain: 0.04 * gain, frequency: 680, type: "lowpass" });
    return;
  }
  if (kind === "bossKill") {
    scheduleTone(now, 98, 0.32, { type: "sawtooth", gain: 0.08 * gain, endFreq: 52 });
    scheduleTone(now + 0.08, 392, 0.28, { type: "triangle", gain: 0.055 * gain, endFreq: 784 });
    scheduleNoise(now, 0.22, { gain: 0.07 * gain, frequency: 900, type: "lowpass" });
    return;
  }
  if (kind === "level" || kind === "weapon") {
    const notes = kind === "weapon" ? [392, 587.33, 783.99] : [329.63, 493.88, 659.25, 987.77];
    notes.forEach((note, index) => {
      scheduleTone(now + index * 0.055, note, 0.16, { type: "triangle", gain: 0.045 * gain, endFreq: note * 1.02 });
    });
    return;
  }
  if (kind === "start" || kind === "wave") {
    scheduleTone(now, 146.83, 0.24, { type: "sine", gain: 0.055 * gain, endFreq: 220 });
    scheduleTone(now + 0.08, 440, 0.18, { type: "triangle", gain: 0.038 * gain, endFreq: 660 });
    scheduleNoise(now, 0.16, { gain: 0.026 * gain, frequency: 1400, type: "bandpass" });
    return;
  }
  if (kind === "boss") {
    scheduleTone(now, 73.42, 0.52, { type: "sawtooth", gain: 0.08 * gain, endFreq: 49 });
    scheduleNoise(now, 0.36, { gain: 0.055 * gain, frequency: 520, type: "lowpass" });
    return;
  }
  if (kind === "telegraph") {
    scheduleTone(now, 220, 0.12, { type: "sine", gain: 0.028 * gain, endFreq: 196 });
    return;
  }
  if (kind === "jump") {
    scheduleTone(now, 330, 0.09, { type: "triangle", gain: 0.026 * gain, endFreq: 520 });
    scheduleTone(now + 0.035, 520, 0.08, { type: "sine", gain: 0.018 * gain, endFreq: 760 });
    return;
  }
  if (kind === "slam") {
    scheduleTone(now, 82.41, 0.18, { type: "sawtooth", gain: 0.07 * gain, endFreq: 45 });
    scheduleNoise(now, 0.12, { gain: 0.058 * gain, frequency: 430, type: "lowpass" });
    return;
  }
  if (kind === "damage") {
    scheduleTone(now, 110, 0.16, { type: "square", gain: 0.055 * gain, endFreq: 72 });
    scheduleNoise(now, 0.08, { gain: 0.05 * gain, frequency: 620, type: "bandpass" });
    return;
  }
  if (kind === "death") {
    scheduleTone(now, 146.83, 0.54, { type: "sawtooth", gain: 0.075 * gain, endFreq: 46.25 });
    scheduleNoise(now, 0.5, { gain: 0.045 * gain, frequency: 360, type: "lowpass" });
  }
}

export function scheduleTone(time: number, frequency: number, duration: number, options: ToneOptions = {}): void {
  const context = arenaAudioRuntime.graph.context;
  const destination = options.dest ?? arenaAudioRuntime.graph.sfx;
  if (!context || !destination) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attack = Math.max(0.002, options.attack ?? 0.006);
  const release = Math.max(0.01, options.release ?? 0.045);
  const peak = Math.max(0.0001, options.gain ?? 0.04);
  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), time);
  if (options.endFreq) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(time);
  oscillator.stop(time + duration + release + 0.03);
}

export function scheduleNoise(time: number, duration: number, options: NoiseOptions = {}): void {
  const context = arenaAudioRuntime.graph.context;
  const destination = options.dest ?? arenaAudioRuntime.graph.sfx;
  if (!context || !audio.noiseBuffer || !destination) return;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const attack = Math.max(0.002, options.attack ?? 0.004);
  const release = Math.max(0.01, options.release ?? 0.035);
  source.buffer = audio.noiseBuffer;
  source.loop = true;
  filter.type = options.type ?? "bandpass";
  filter.frequency.setValueAtTime(options.frequency ?? 1200, time);
  filter.Q.value = options.q ?? 0.8;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain ?? 0.03), time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(time);
  source.stop(time + duration + release + 0.03);
}
