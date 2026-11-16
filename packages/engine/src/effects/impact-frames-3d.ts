export const IMPACT_FRAME_PRESET_IDS_3D = [
  "blank-white",
  "blank-black",
  "whiteout-slash",
  "black-silhouette",
  "ink-eruption",
  "red-contact-burst",
  "energy-overexposure",
  "radial-brush",
  "edge-anatomy",
  "chromatic-shock",
  "custom-still",
] as const;

export type ImpactFramePresetId3D = (typeof IMPACT_FRAME_PRESET_IDS_3D)[number];
export type ImpactFrameSource3D = "solid" | "scene-threshold" | "scene-edges" | "scene-color" | "texture";

export type ImpactFramePreset3D = Readonly<{
  label: string;
  description: string;
  source: ImpactFrameSource3D;
  durationFrames: number;
  background: string;
  foreground: string;
  accent: string;
  threshold: number;
  edgeStrength: number;
  lineDensity: number;
  slashAngle: number;
  chromaticOffset: number;
}>;

/**
 * Renderer-neutral impact vocabulary distilled from hand-authored anime timing:
 * complete frame replacement, hard silhouettes, ink rays, and brief exposure spikes.
 */
export const IMPACT_FRAME_PRESETS_3D: Readonly<Record<ImpactFramePresetId3D, ImpactFramePreset3D>> = Object.freeze({
  "blank-white": preset("Blank white", "An exact white frame for a hard contact or editorial beat.", "solid", "#ffffff", "#ffffff", "#ffffff"),
  "blank-black": preset("Blank black", "An exact black frame for a void beat or cut punctuation.", "solid", "#000000", "#000000", "#000000"),
  "whiteout-slash": preset("Whiteout slash", "Overexposed subjects cut by a sharp directional graphic slash.", "scene-threshold", "#fffef1", "#11131c", "#fff04f", { threshold: 0.58, edgeStrength: 0.35, lineDensity: 0.22, slashAngle: -0.72 }),
  "black-silhouette": preset("Black silhouette", "A white subject silhouette isolated against a dense black field.", "scene-threshold", "#050509", "#ffffff", "#ff334f", { threshold: 0.42, edgeStrength: 0.2, lineDensity: 0.08 }),
  "ink-eruption": preset("Ink eruption", "Black brush masses and irregular speed rays exploding across white.", "scene-threshold", "#fffef7", "#050505", "#050505", { threshold: 0.52, edgeStrength: 0.68, lineDensity: 0.9, slashAngle: 0.18 }),
  "red-contact-burst": preset("Red contact burst", "A black-and-white collision card with a concentrated red contact accent.", "scene-threshold", "#050507", "#fffdf5", "#ff2436", { threshold: 0.5, edgeStrength: 0.72, lineDensity: 0.78, slashAngle: -0.2 }),
  "energy-overexposure": preset("Energy overexposure", "A hot white-and-gold energy strike that keeps only decisive contour information.", "scene-threshold", "#fffceb", "#15110b", "#ffb000", { threshold: 0.65, edgeStrength: 0.42, lineDensity: 0.32, chromaticOffset: 0.0015 }),
  "radial-brush": preset("Radial brush", "Dense hand-inked rays converging on the authored contact point.", "scene-edges", "#fffef8", "#080808", "#080808", { threshold: 0.36, edgeStrength: 0.88, lineDensity: 1 }),
  "edge-anatomy": preset("Edge-lit anatomy", "White contour anatomy and energy edges isolated in a black field.", "scene-edges", "#020205", "#ffffff", "#ffe13b", { threshold: 0.28, edgeStrength: 1, lineDensity: 0.2 }),
  "chromatic-shock": preset("Chromatic shock", "High-contrast scene color with red/cyan channel separation and a violent exposure lift.", "scene-color", "#07070d", "#ffffff", "#ff2748", { threshold: 0.45, edgeStrength: 0.44, lineDensity: 0.36, chromaticOffset: 0.006 }),
  "custom-still": preset("Custom still", "Replace the exact frame with a cooked project texture for hand-drawn art.", "texture", "#000000", "#ffffff", "#ffffff"),
});

export function impactFramePreset3D(id: string): ImpactFramePreset3D {
  if (!isImpactFramePresetId3D(id)) throw new Error(`Unknown 3D impact-frame preset: ${id}`);
  return IMPACT_FRAME_PRESETS_3D[id];
}

export function isImpactFramePresetId3D(value: unknown): value is ImpactFramePresetId3D {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(IMPACT_FRAME_PRESETS_3D, value);
}

function preset(
  label: string,
  description: string,
  source: ImpactFrameSource3D,
  background: string,
  foreground: string,
  accent: string,
  options: Partial<Pick<ImpactFramePreset3D, "threshold" | "edgeStrength" | "lineDensity" | "slashAngle" | "chromaticOffset">> = {},
): ImpactFramePreset3D {
  return Object.freeze({ label, description, source, durationFrames: 1, background, foreground, accent, threshold: options.threshold ?? 0.5, edgeStrength: options.edgeStrength ?? 0, lineDensity: options.lineDensity ?? 0, slashAngle: options.slashAngle ?? 0, chromaticOffset: options.chromaticOffset ?? 0 });
}
