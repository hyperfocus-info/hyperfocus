export const SFX_PRESET_NAMES = [
  "click",
  "confirm",
  "cancel",
  "coin",
  "pickup",
  "jump",
  "land",
  "footstep",
  "hit",
  "explosion",
  "laser",
  "power-up",
  "notification",
  "error",
] as const;

export const SFX_PRESET_STYLES = [
  "retro-arcade",
  "realistic",
  "modern-cartoon",
  "early-3d-2000s",
  "fantasy-90s",
] as const;

export type SfxPresetName = typeof SFX_PRESET_NAMES[number];
export type SfxPresetStyle = typeof SFX_PRESET_STYLES[number];

export type SfxPresetDefinition = Readonly<{ duration: number; render: SampleRendererFactory }>;
type SampleRenderer = (time: number, progress: number) => number;
type SampleRendererFactory = (random: () => number) => SampleRenderer;
type WaveShape = "sine" | "triangle" | "square" | "saw";

const TAU = Math.PI * 2;

function wave(shape: WaveShape, phase: number) {
  if (shape === "sine") return Math.sin(phase);
  if (shape === "triangle") return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  if (shape === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  return 2 * (phase / TAU - Math.floor(phase / TAU + 0.5));
}

function oscillator(shape: WaveShape, frequency: (progress: number) => number): SampleRenderer {
  let phase = 0;
  let previousTime = 0;
  return (time, progress) => {
    const delta = Math.max(0, time - previousTime);
    previousTime = time;
    phase += TAU * frequency(progress) * delta;
    return wave(shape, phase);
  };
}

function envelope(progress: number, attack = 0.04, decay = 2) {
  const onset = Math.min(1, progress / attack);
  return onset * Math.pow(Math.max(0, 1 - progress), decay);
}

function noteEnvelope(progress: number, count: number, attack = 0.08, decay = 1.8) {
  const local = (progress * count) % 1;
  return envelope(local, attack, decay);
}

function noteFrequency(progress: number, notes: readonly number[]) {
  return notes[Math.min(notes.length - 1, Math.floor(progress * notes.length))] ?? notes[0] ?? 440;
}

function filteredNoise(random: () => number, response: number) {
  let state = 0;
  return () => {
    state += (random() * 2 - 1 - state) * response;
    return state;
  };
}

function loFi(renderer: SampleRenderer, hold = 2, levels = 48): SampleRenderer {
  let held = 0;
  let index = 0;
  return (time, progress) => {
    if (index % hold === 0) held = Math.round(renderer(time, progress) * levels) / levels;
    index += 1;
    return held;
  };
}

function chime(duration: number, notes: readonly number[], options: { amplitude?: number; shape?: WaveShape; harmonic?: number; attack?: number; decay?: number } = {}): SfxPresetDefinition {
  return { duration, render: () => {
    const frequency = (progress: number) => noteFrequency(progress, notes);
    const primary = oscillator(options.shape ?? "sine", frequency);
    const harmonic = oscillator("sine", (progress) => frequency(progress) * (options.harmonic ?? 2.01));
    return (time, progress) => (options.amplitude ?? 0.7) * noteEnvelope(progress, notes.length, options.attack ?? 0.05, options.decay ?? 1.7)
      * (0.78 * primary(time, progress) + 0.22 * harmonic(time, progress));
  } };
}

function glide(duration: number, start: number, end: number, options: { amplitude?: number; shape?: WaveShape; attack?: number; decay?: number; curve?: number; harmonic?: number } = {}): SfxPresetDefinition {
  return { duration, render: () => {
    const frequency = (progress: number) => start + (end - start) * Math.pow(progress, options.curve ?? 1);
    const primary = oscillator(options.shape ?? "triangle", frequency);
    const harmonic = oscillator("sine", (progress) => frequency(progress) * (options.harmonic ?? 2));
    return (time, progress) => (options.amplitude ?? 0.65) * envelope(progress, options.attack ?? 0.035, options.decay ?? 1.8)
      * (0.82 * primary(time, progress) + 0.18 * harmonic(time, progress));
  } };
}

function physicalImpact(duration: number, bodyFrequency: number, noiseResponse: number, options: { amplitude?: number; attack?: number; decay?: number; scrape?: boolean } = {}): SfxPresetDefinition {
  return { duration, render: (random) => {
    const body = oscillator("sine", (progress) => Math.max(28, bodyFrequency * (1 - 0.42 * progress)));
    const texture = filteredNoise(random, noiseResponse);
    return (time, progress) => {
      const base = envelope(progress, options.attack ?? 0.025, options.decay ?? 3.2);
      const secondary = options.scrape && progress > 0.18 ? envelope((progress - 0.18) / 0.82, 0.14, 4.5) : 0;
      return (options.amplitude ?? 0.72) * (base * (0.58 * body(time, progress) + 0.42 * texture()) + secondary * texture() * 0.18);
    };
  } };
}

function noiseBurst(duration: number, bodyFrequency: number, response: number, amplitude = 0.78): SfxPresetDefinition {
  return { duration, render: (random) => {
    const noise = filteredNoise(random, response);
    const body = oscillator("sine", (progress) => Math.max(24, bodyFrequency * (1 - 0.58 * progress)));
    return (time, progress) => amplitude * envelope(progress, 0.012, 2.2) * (0.72 * noise() + 0.28 * body(time, progress));
  } };
}

function retroArcade(preset: SfxPresetName): SfxPresetDefinition {
  switch (preset) {
    case "click": return glide(0.065, 1_250, 760, { amplitude: 0.52, shape: "triangle", decay: 4.5 });
    case "confirm": return chime(0.24, [659.25, 987.77], { shape: "triangle", amplitude: 0.66 });
    case "cancel": return glide(0.22, 470, 245, { amplitude: 0.46, shape: "triangle", attack: 0.055, decay: 2.8 });
    case "coin": return chime(0.4, [1_174.66, 1_567.98], { amplitude: 0.72, shape: "triangle", harmonic: 2.5, decay: 1.35 });
    case "pickup": return glide(0.24, 480, 1_360, { shape: "triangle", curve: 1.6, harmonic: 1.5 });
    case "jump": return glide(0.28, 185, 780, { shape: "square", amplitude: 0.54, curve: 1.8, decay: 1.5 });
    case "land": return physicalImpact(0.22, 82, 0.075, { amplitude: 0.65, attack: 0.045, decay: 4.2 });
    case "footstep": return physicalImpact(0.16, 105, 0.055, { amplitude: 0.48, attack: 0.06, decay: 5.2, scrape: true });
    case "hit": return physicalImpact(0.17, 145, 0.24, { decay: 4.4 });
    case "explosion": return noiseBurst(0.74, 76, 0.085, 0.86);
    case "laser": return glide(0.34, 860, 235, { amplitude: 0.58, shape: "triangle", attack: 0.045, decay: 2.2, curve: 0.78, harmonic: 1.52 });
    case "power-up": return chime(0.68, [329.63, 440, 659.25, 880], { shape: "triangle", amplitude: 0.7, decay: 1.2 });
    case "notification": return chime(0.54, [739.99, 1_109.99], { amplitude: 0.62, decay: 2 });
    case "error": return chime(0.46, [220, 164.81], { shape: "square", amplitude: 0.5, decay: 2.4 });
  }
}

function realistic(preset: SfxPresetName): SfxPresetDefinition {
  switch (preset) {
    case "click": return physicalImpact(0.075, 360, 0.3, { amplitude: 0.42, decay: 6 });
    case "confirm": return chime(0.28, [523.25, 783.99], { amplitude: 0.48, harmonic: 2.7, decay: 2.2 });
    case "cancel": return physicalImpact(0.13, 210, 0.18, { amplitude: 0.38, attack: 0.08, decay: 4.8 });
    case "coin": return { duration: 0.5, render: (random) => {
      const metal = oscillator("sine", (progress) => 1_720 - 190 * progress);
      const ring = oscillator("sine", (progress) => 2_840 - 330 * progress);
      const texture = filteredNoise(random, 0.32);
      return (time, progress) => 0.58 * envelope(progress, 0.018, 2.7) * (0.56 * metal(time, progress) + 0.34 * ring(time, progress) + 0.1 * texture());
    } };
    case "pickup": return chime(0.32, [440, 659.25], { amplitude: 0.46, harmonic: 2.8, decay: 2.3 });
    case "jump": return physicalImpact(0.2, 92, 0.08, { amplitude: 0.5, attack: 0.08, decay: 3.7, scrape: true });
    case "land": return physicalImpact(0.34, 58, 0.045, { amplitude: 0.82, attack: 0.055, decay: 3.7, scrape: true });
    case "footstep": return physicalImpact(0.21, 76, 0.035, { amplitude: 0.52, attack: 0.075, decay: 4.9, scrape: true });
    case "hit": return physicalImpact(0.19, 98, 0.12, { amplitude: 0.8, attack: 0.03, decay: 4.2 });
    case "explosion": return noiseBurst(0.92, 54, 0.055, 0.9);
    case "laser": return { duration: 0.5, render: (random) => {
      const charge = oscillator("sine", (progress) => 620 - 410 * progress);
      const air = filteredNoise(random, 0.11);
      return (time, progress) => 0.62 * envelope(progress, 0.045, 2.4) * (0.74 * charge(time, progress) + 0.26 * air());
    } };
    case "power-up": return chime(0.9, [261.63, 392, 523.25, 783.99], { amplitude: 0.5, harmonic: 2.4, decay: 1.4 });
    case "notification": return chime(0.48, [587.33, 880], { amplitude: 0.42, harmonic: 2.7, decay: 2.3 });
    case "error": return chime(0.5, [196, 146.83], { amplitude: 0.42, shape: "triangle", decay: 2.6 });
  }
}

function modernCartoon(preset: SfxPresetName): SfxPresetDefinition {
  switch (preset) {
    case "click": return glide(0.09, 520, 310, { amplitude: 0.52, shape: "sine", decay: 5.4 });
    case "confirm": return chime(0.3, [587.33, 880], { amplitude: 0.62, shape: "triangle", harmonic: 1.5 });
    case "cancel": return glide(0.3, 390, 155, { amplitude: 0.45, shape: "sine", attack: 0.07, curve: 1.7, decay: 2.2 });
    case "coin": return chime(0.46, [987.77, 1_318.51, 1_975.53], { amplitude: 0.66, shape: "sine", harmonic: 2.5, decay: 1.4 });
    case "pickup": return glide(0.3, 330, 1_120, { amplitude: 0.58, shape: "sine", curve: 2.2, harmonic: 1.5 });
    case "jump": return glide(0.36, 230, 920, { amplitude: 0.58, shape: "sine", curve: 2.5, decay: 1.45 });
    case "land": return physicalImpact(0.28, 68, 0.04, { amplitude: 0.67, attack: 0.09, decay: 4.1 });
    case "footstep": return physicalImpact(0.18, 128, 0.025, { amplitude: 0.42, attack: 0.12, decay: 5.5, scrape: true });
    case "hit": return glide(0.19, 240, 88, { amplitude: 0.78, shape: "triangle", attack: 0.025, decay: 4.5 });
    case "explosion": return noiseBurst(0.7, 64, 0.045, 0.78);
    case "laser": return glide(0.38, 740, 210, { amplitude: 0.54, shape: "sine", attack: 0.055, decay: 2, curve: 0.65, harmonic: 1.5 });
    case "power-up": return chime(0.78, [392, 523.25, 659.25, 1_046.5], { amplitude: 0.64, shape: "triangle", harmonic: 1.5, decay: 1.3 });
    case "notification": return chime(0.58, [659.25, 987.77], { amplitude: 0.57, shape: "sine", harmonic: 1.5, decay: 2 });
    case "error": return glide(0.44, 310, 130, { amplitude: 0.5, shape: "triangle", attack: 0.08, curve: 1.2, decay: 2.1 });
  }
}

function early3d(preset: SfxPresetName): SfxPresetDefinition {
  const base = (() => {
    switch (preset) {
      case "click": return glide(0.07, 980, 490, { amplitude: 0.55, shape: "square", decay: 4.8 });
      case "confirm": return chime(0.27, [523.25, 783.99], { amplitude: 0.64, shape: "triangle", harmonic: 2 });
      case "cancel": return glide(0.24, 410, 185, { amplitude: 0.48, shape: "saw", attack: 0.07, decay: 2.7 });
      case "coin": return chime(0.38, [880, 1_319], { amplitude: 0.68, shape: "triangle", harmonic: 2.01, decay: 1.5 });
      case "pickup": return glide(0.25, 380, 1_040, { amplitude: 0.62, shape: "saw", curve: 1.4, decay: 1.8 });
      case "jump": return glide(0.28, 160, 610, { amplitude: 0.58, shape: "square", curve: 1.7, decay: 1.6 });
      case "land": return physicalImpact(0.26, 72, 0.16, { amplitude: 0.72, attack: 0.045, decay: 4 });
      case "footstep": return physicalImpact(0.17, 96, 0.13, { amplitude: 0.5, attack: 0.07, decay: 5, scrape: true });
      case "hit": return physicalImpact(0.15, 128, 0.35, { amplitude: 0.82, decay: 5 });
      case "explosion": return noiseBurst(0.76, 66, 0.18, 0.88);
      case "laser": return glide(0.32, 760, 170, { amplitude: 0.6, shape: "saw", attack: 0.045, decay: 2.4, curve: 0.72 });
      case "power-up": return chime(0.72, [293.66, 392, 587.33, 783.99], { amplitude: 0.68, shape: "triangle", decay: 1.25 });
      case "notification": return chime(0.48, [622.25, 830.61], { amplitude: 0.58, shape: "triangle", decay: 2 });
      case "error": return chime(0.44, [207.65, 155.56], { amplitude: 0.56, shape: "saw", decay: 2.5 });
    }
  })();
  return { duration: base.duration, render: (random) => loFi(base.render(random), 2, 42) };
}

function fantasy90s(preset: SfxPresetName): SfxPresetDefinition {
  switch (preset) {
    case "click": return chime(0.12, [880], { amplitude: 0.42, harmonic: 2.5, decay: 5 });
    case "confirm": return chime(0.38, [523.25, 659.25, 783.99], { amplitude: 0.62, harmonic: 2.5, decay: 1.7 });
    case "cancel": return chime(0.34, [392, 293.66], { amplitude: 0.44, shape: "triangle", harmonic: 1.5, decay: 2.3 });
    case "coin": return chime(0.52, [1_174.66, 1_567.98, 2_349.32], { amplitude: 0.68, harmonic: 2.5, decay: 1.4 });
    case "pickup": return chime(0.42, [523.25, 783.99, 1_046.5], { amplitude: 0.6, harmonic: 1.5, decay: 1.6 });
    case "jump": return glide(0.32, 220, 660, { amplitude: 0.48, shape: "triangle", curve: 1.8, decay: 1.7 });
    case "land": return physicalImpact(0.3, 62, 0.045, { amplitude: 0.62, attack: 0.07, decay: 4, scrape: true });
    case "footstep": return physicalImpact(0.2, 82, 0.035, { amplitude: 0.42, attack: 0.09, decay: 5, scrape: true });
    case "hit": return { duration: 0.24, render: (random) => {
      const body = oscillator("triangle", (progress) => 185 - 80 * progress);
      const metal = oscillator("sine", () => 1_280);
      const texture = filteredNoise(random, 0.1);
      return (time, progress) => 0.74 * envelope(progress, 0.035, 3.7) * (0.55 * body(time, progress) + 0.28 * metal(time, progress) + 0.17 * texture());
    } };
    case "explosion": return noiseBurst(0.88, 58, 0.065, 0.82);
    case "laser": return glide(0.46, 690, 180, { amplitude: 0.5, shape: "triangle", attack: 0.06, decay: 2.1, curve: 0.7, harmonic: 1.5 });
    case "power-up": return chime(0.96, [261.63, 329.63, 392, 523.25, 659.25], { amplitude: 0.67, harmonic: 1.5, decay: 1.2 });
    case "notification": return chime(0.72, [783.99, 1_046.5, 1_319], { amplitude: 0.56, harmonic: 2.5, decay: 1.7 });
    case "error": return chime(0.54, [246.94, 196, 146.83], { amplitude: 0.45, shape: "triangle", harmonic: 1.5, decay: 2.2 });
  }
}

export function sfxPresetDefinition(style: SfxPresetStyle, preset: SfxPresetName) {
  if (style === "retro-arcade") return retroArcade(preset);
  if (style === "realistic") return realistic(preset);
  if (style === "modern-cartoon") return modernCartoon(preset);
  if (style === "early-3d-2000s") return early3d(preset);
  return fantasy90s(preset);
}
