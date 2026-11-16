import type { ParticlePresetId2D, TransitionPresetId2D } from "./creative-presets.ts";

export type VisualRecipeCue2D = Readonly<{
  kind: "camera-shake" | "hit-flash" | "particle-burst" | "screen-transition";
  offsetFrames: number;
  durationFrames: number;
  intensity: number;
  color?: string;
  particleCount?: number;
  preset?: ParticlePresetId2D | TransitionPresetId2D;
  target: "screen" | "subject";
}>;

export type VisualRecipe2D = Readonly<{
  label: string;
  description: string;
  family: "anime" | "painted-cel" | "graphic-ink" | "luminous-storybook";
  cues: readonly VisualRecipeCue2D[];
}>;

/**
 * Small, authored effect stacks that expand into ordinary timeline cues.
 * They intentionally contain no renderer or editor state, so games, videos,
 * agents, and future authoring hosts can share the same visual vocabulary.
 */
export const VISUAL_RECIPES_2D = Object.freeze({
  "anime-energy-duel": recipe(
    "Anime energy duel",
    "Hard contact flash, radial speed, sparks, subject bloom, and camera recoil.",
    "anime",
    [
      cue("particle-burst", -3, 14, 1.15, "screen", { preset: "speed-lines", color: "#eaf8ff", particleCount: 48 }),
      cue("screen-transition", 0, 1, 1, "screen", { preset: "impact-white", color: "#ffffff" }),
      cue("camera-shake", 0, 10, 8.5, "screen"),
      cue("hit-flash", 0, 6, 1, "subject", { color: "#bff7ff" }),
      cue("particle-burst", 0, 22, 1.25, "subject", { preset: "sparks", color: "#7ee8ff", particleCount: 42 }),
    ],
  ),
  "painted-cel-adventure": recipe(
    "Painted cel adventure",
    "Warm graphic contact with dust, directional lines, and restrained recoil.",
    "painted-cel",
    [
      cue("particle-burst", -2, 16, 0.72, "screen", { preset: "speed-lines", color: "#fff3c4", particleCount: 28 }),
      cue("screen-transition", 0, 1, 0.82, "screen", { preset: "impact-accent", color: "#ffd166" }),
      cue("camera-shake", 0, 8, 4.5, "screen"),
      cue("particle-burst", 1, 34, 0.7, "subject", { preset: "dust", color: "#e7bd78", particleCount: 34 }),
    ],
  ),
  "graphic-ink-strike": recipe(
    "Graphic ink strike",
    "Alternating black and white impact cards with stark radial linework.",
    "graphic-ink",
    [
      cue("screen-transition", 0, 1, 1, "screen", { preset: "impact-black", color: "#000000" }),
      cue("screen-transition", 1, 1, 1, "screen", { preset: "impact-white", color: "#ffffff" }),
      cue("particle-burst", 1, 12, 1.35, "subject", { preset: "speed-lines", color: "#111111", particleCount: 56 }),
      cue("camera-shake", 1, 7, 6.5, "screen"),
    ],
  ),
  "luminous-storybook-transform": recipe(
    "Luminous storybook transform",
    "Soft white exposure, floating lights, and a gentle magical subject flare.",
    "luminous-storybook",
    [
      cue("screen-transition", -4, 14, 0.5, "screen", { preset: "fade-white", color: "#fff8e8" }),
      cue("hit-flash", 0, 18, 0.72, "subject", { color: "#d8fff1" }),
      cue("particle-burst", 0, 72, 0.78, "subject", { preset: "fireflies", color: "#dfff9d", particleCount: 38 }),
      cue("camera-shake", 0, 8, 1.4, "screen"),
    ],
  ),
} as const);

export type VisualRecipeId2D = keyof typeof VISUAL_RECIPES_2D;

export function isVisualRecipeId2D(value: unknown): value is VisualRecipeId2D {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(VISUAL_RECIPES_2D, value);
}

function recipe(label: string, description: string, family: VisualRecipe2D["family"], cues: readonly VisualRecipeCue2D[]): VisualRecipe2D {
  return Object.freeze({ label, description, family, cues: Object.freeze(cues) });
}

function cue(
  kind: VisualRecipeCue2D["kind"],
  offsetFrames: number,
  durationFrames: number,
  intensity: number,
  target: VisualRecipeCue2D["target"],
  optional: Pick<VisualRecipeCue2D, "color" | "particleCount" | "preset"> = {},
): VisualRecipeCue2D {
  return Object.freeze({ kind, offsetFrames, durationFrames, intensity, target, ...optional });
}
