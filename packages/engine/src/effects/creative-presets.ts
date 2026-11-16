/** Reusable visual vocabulary for games, motion graphics, and music-video timelines. */
export const PARTICLE_PRESETS_2D = Object.freeze({
  sparks: particle("Sparks", "Fast impact streaks", "#ffd166", 28, "burst"),
  confetti: particle("Confetti", "Celebration paper shower", "#ff5d8f", 64, "shower"),
  snow: particle("Snow", "Soft full-frame snowfall", "#e8f7ff", 72, "ambient"),
  rain: particle("Rain", "Full-frame rain streaks", "#87bfff", 84, "ambient"),
  embers: particle("Embers", "Slow rising fire motes", "#ff7b32", 48, "ambient"),
  dust: particle("Dust", "Warm drifting atmosphere", "#e8c999", 42, "ambient"),
  bubbles: particle("Bubbles", "Buoyant translucent bubbles", "#74ddff", 36, "ambient"),
  fireflies: particle("Fireflies", "Organic glowing wander", "#dfff78", 28, "ambient"),
  hearts: particle("Hearts", "Playful heart burst", "#ff6fae", 24, "burst"),
  "music-notes": particle("Music notes", "Rhythmic rising notes", "#c6a7ff", 24, "burst"),
  smoke: particle("Smoke", "Soft expanding puffs", "#b8bac7", 30, "ambient"),
  "speed-lines": particle("Speed lines", "Graphic radial motion lines", "#ffffff", 40, "burst"),
} as const);

export const TRANSITION_PRESETS_2D = Object.freeze({
  dissolve: transition("Dissolve", "A soft opacity blend"),
  "fade-black": transition("Fade through black", "A cinematic dip through black", "#000000"),
  "fade-white": transition("Fade through white", "A luminous dip through white", "#ffffff"),
  flash: transition("Flash", "A quick beat-synced light flash", "#ffffff"),
  "impact-white": transition("One-frame white", "An exact one-frame white impact card", "#ffffff", 1),
  "impact-black": transition("One-frame black", "An exact one-frame black impact card", "#000000", 1),
  "impact-accent": transition("One-frame accent", "An exact one-frame graphic color card", "#ffd166", 1),
  "wipe-left": transition("Wipe left", "A graphic wipe traveling left"),
  "wipe-right": transition("Wipe right", "A graphic wipe traveling right"),
  "wipe-up": transition("Wipe up", "A graphic wipe traveling upward"),
  "wipe-down": transition("Wipe down", "A graphic wipe traveling downward"),
  iris: transition("Iris", "A circular close-and-open transition", "#000000"),
  "film-burn": transition("Film burn", "A warm organic exposure flare", "#ff6b22"),
} as const);

export type ParticlePresetId2D = keyof typeof PARTICLE_PRESETS_2D;
export type TransitionPresetId2D = keyof typeof TRANSITION_PRESETS_2D;
export type ParticlePreset2D = Readonly<{ label: string; description: string; color: string; count: number; placement: "burst" | "shower" | "ambient"; durationFrames: number }>;
export type TransitionPreset2D = Readonly<{ label: string; description: string; color?: string; durationFrames: number }>;

export function isParticlePresetId2D(value: unknown): value is ParticlePresetId2D {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PARTICLE_PRESETS_2D, value);
}

export function isTransitionPresetId2D(value: unknown): value is TransitionPresetId2D {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TRANSITION_PRESETS_2D, value);
}

function particle(label: string, description: string, color: string, count: number, placement: ParticlePreset2D["placement"]): ParticlePreset2D {
  return Object.freeze({ label, description, color, count, placement, durationFrames: placement === "ambient" ? 180 : placement === "shower" ? 75 : 45 });
}

function transition(label: string, description: string, color?: string, durationFrames = 16): TransitionPreset2D {
  return Object.freeze({ label, description, durationFrames, ...(color ? { color } : {}) });
}
