import type { Material3D, MaterialShading3D } from "../3d-scene.ts";

export const MATERIAL_STYLE_FAMILIES_3D = ["fantasy", "realistic", "retro", "toon", "photoreal", "effects"] as const;
export type MaterialStyleFamily3D = typeof MATERIAL_STYLE_FAMILIES_3D[number];
export type MaterialShaderPreset3D = "pbr" | "unlit" | "toon" | "retro" | "hologram";
export type MaterialTextureSlot3D = "baseColor" | "metallicRoughness" | "normal" | "occlusion" | "emissive";
export type MaterialUvTransform3D = Readonly<{ offset: readonly [number, number]; scale: readonly [number, number]; rotation: number }>;
export type MaterialToonLook3D = Readonly<{ bands: number; shadowColor: readonly [number, number, number]; rimColor: readonly [number, number, number]; rimStrength: number; outlineColor: readonly [number, number, number, number]; outlineWidth: number }>;
export type MaterialLook3D = Readonly<{
  baseColor: readonly [number, number, number, number];
  emissive: readonly [number, number, number];
  metallic: number;
  roughness: number;
  opacity: number;
  cutaway?: boolean;
  shading: MaterialShading3D;
  shader: MaterialShaderPreset3D;
  doubleSided: boolean;
  uv: MaterialUvTransform3D;
  textures: Readonly<Partial<Record<MaterialTextureSlot3D, string>>>;
  toon?: MaterialToonLook3D;
}>;
export type MaterialPreset3D = Readonly<{
  id: string;
  name: string;
  family: MaterialStyleFamily3D;
  tags: readonly string[];
  look: MaterialLook3D;
}>;

const DEFAULT_UV: MaterialUvTransform3D = Object.freeze({ offset: [0, 0] as const, scale: [1, 1] as const, rotation: 0 });
export const DEFAULT_TOON_LOOK_3D: MaterialToonLook3D = Object.freeze({ bands: 3, shadowColor: [0.22, 0.25, 0.38] as const, rimColor: [1, 1, 1] as const, rimStrength: 0.28, outlineColor: [0.025, 0.03, 0.055, 1] as const, outlineWidth: 0.004 });

function preset(id: string, name: string, family: MaterialStyleFamily3D, color: readonly [number, number, number, number], metallic: number, roughness: number, options: { emissive?: readonly [number, number, number]; shader?: MaterialShaderPreset3D; tags?: readonly string[]; opacity?: number; doubleSided?: boolean; toon?: Partial<MaterialToonLook3D> } = {}): MaterialPreset3D {
  const shader = options.shader ?? "pbr";
  const toon = shader === "toon" ? toonLook(options.toon) : undefined;
  return Object.freeze({ id, name, family, tags: Object.freeze(options.tags ?? []), look: Object.freeze({ baseColor: color, emissive: options.emissive ?? ([0, 0, 0] as const), metallic, roughness, opacity: options.opacity ?? color[3], shading: shader === "unlit" ? "unlit" : "lit", shader, doubleSided: options.doubleSided ?? false, uv: DEFAULT_UV, textures: Object.freeze({}), ...(toon ? { toon } : {}) }) });
}

function toonLook(value: Partial<MaterialToonLook3D> = {}): MaterialToonLook3D { return Object.freeze({ ...DEFAULT_TOON_LOOK_3D, ...value }); }

/** Renderer-neutral starting looks. Texture ids remain project-owned and can be replaced independently. */
export const MATERIAL_PRESETS_3D: readonly MaterialPreset3D[] = Object.freeze([
  preset("aged-iron", "Aged Iron", "fantasy", [0.18, 0.2, 0.21, 1], 0.9, 0.64, { tags: ["armor", "weapon", "gate"] }),
  preset("polished-steel", "Polished Steel", "fantasy", [0.62, 0.67, 0.7, 1], 1, 0.2, { tags: ["armor", "sword"] }),
  preset("royal-gold", "Royal Gold", "fantasy", [1, 0.58, 0.12, 1], 1, 0.18, { tags: ["treasure", "trim", "coin"] }),
  preset("ancient-bronze", "Ancient Bronze", "fantasy", [0.42, 0.22, 0.08, 1], 0.82, 0.58, { tags: ["statue", "artifact"] }),
  preset("worn-leather", "Worn Leather", "fantasy", [0.22, 0.075, 0.03, 1], 0, 0.82, { tags: ["armor", "book", "strap"] }),
  preset("parchment", "Parchment", "fantasy", [0.78, 0.62, 0.36, 1], 0, 0.92, { tags: ["map", "scroll"] }),
  preset("mossy-stone", "Mossy Stone", "fantasy", [0.22, 0.3, 0.17, 1], 0, 0.96, { tags: ["ruin", "dungeon"] }),
  preset("enchanted-crystal", "Enchanted Crystal", "fantasy", [0.1, 0.38, 0.72, 1], 0.15, 0.12, { emissive: [0.06, 0.32, 0.9], tags: ["magic", "gem"] }),
  preset("dragon-scale", "Dragon Scale", "fantasy", [0.08, 0.24, 0.12, 1], 0.38, 0.3, { tags: ["creature", "armor"] }),
  preset("lava-rock", "Lava Rock", "fantasy", [0.06, 0.025, 0.015, 1], 0, 0.94, { emissive: [1, 0.12, 0.01], tags: ["volcanic", "magic"] }),

  preset("gunmetal", "Gunmetal", "realistic", [0.13, 0.15, 0.17, 1], 0.96, 0.3, { tags: ["gun", "machine", "space"] }),
  preset("brushed-aluminum", "Brushed Aluminum", "realistic", [0.55, 0.58, 0.6, 1], 1, 0.42, { tags: ["vehicle", "appliance"] }),
  preset("automotive-paint", "Automotive Paint", "realistic", [0.4, 0.025, 0.035, 1], 0.72, 0.12, { tags: ["car", "vehicle"] }),
  preset("carbon-fiber", "Carbon Fiber", "realistic", [0.025, 0.03, 0.035, 1], 0.48, 0.24, { tags: ["car", "space", "equipment"] }),
  preset("industrial-rubber", "Industrial Rubber", "realistic", [0.025, 0.028, 0.03, 1], 0, 0.9, { tags: ["tire", "grip", "seal"] }),
  preset("military-polymer", "Military Polymer", "realistic", [0.16, 0.19, 0.13, 1], 0, 0.7, { tags: ["gun", "gear", "vehicle"] }),
  preset("spacecraft-ceramic", "Spacecraft Ceramic", "realistic", [0.72, 0.75, 0.76, 1], 0.1, 0.62, { tags: ["space", "heat shield"] }),
  preset("animal-fur", "Animal Fur", "realistic", [0.22, 0.14, 0.08, 1], 0, 1, { tags: ["animal", "creature"], doubleSided: true }),
  preset("weathered-wood", "Weathered Wood", "realistic", [0.27, 0.17, 0.1, 1], 0, 0.92, { tags: ["building", "prop"] }),
  preset("concrete", "Concrete", "realistic", [0.42, 0.43, 0.42, 1], 0, 0.98, { tags: ["urban", "architecture"] }),

  preset("ps1-matte", "PS1 Matte", "retro", [0.48, 0.52, 0.56, 1], 0, 0.92, { shader: "retro", tags: ["1990s", "early 3d", "dither"] }),
  preset("n64-plastic", "N64 Plastic", "retro", [0.1, 0.38, 0.76, 1], 0, 0.58, { shader: "retro", tags: ["1990s", "console", "colorful"] }),
  preset("dreamcast-chrome", "Dreamcast Chrome", "retro", [0.48, 0.7, 0.85, 1], 0.75, 0.28, { shader: "retro", tags: ["2000s", "arcade"] }),
  preset("early-3d-clay", "Early 3D Clay", "retro", [0.78, 0.42, 0.24, 1], 0, 0.76, { shader: "retro", tags: ["1990s", "character"] }),
  preset("pixel-unlit", "Pixel Unlit", "retro", [1, 1, 1, 1], 0, 1, { shader: "unlit", tags: ["pixel texture", "nearest"] }),
  preset("arcade-neon", "Arcade Neon", "retro", [0.04, 0.03, 0.12, 1], 0.3, 0.22, { emissive: [0.05, 0.9, 1], shader: "retro", tags: ["arcade", "neon"] }),

  preset("toon-flat", "Toon Flat", "toon", [0.18, 0.56, 0.9, 1], 0, 0.82, { shader: "toon", tags: ["cartoon", "cel"], toon: { bands: 2, rimStrength: 0.12, outlineWidth: 0.0025 } }),
  preset("toon-hero", "Toon Hero", "toon", [0.82, 0.15, 0.12, 1], 0.05, 0.5, { shader: "toon", tags: ["character", "hero", "anime"], toon: { shadowColor: [0.16, 0.2, 0.42], rimColor: [0.72, 0.9, 1], rimStrength: 0.42, outlineWidth: 0.0045 } }),
  preset("toon-monster", "Toon Monster", "toon", [0.26, 0.68, 0.18, 1], 0, 0.7, { shader: "toon", tags: ["creature", "enemy"], toon: { shadowColor: [0.2, 0.08, 0.3], rimColor: [0.66, 1, 0.35], rimStrength: 0.3, outlineWidth: 0.005 } }),
  preset("toy-plastic", "Toy Plastic", "toon", [0.95, 0.42, 0.06, 1], 0, 0.22, { shader: "toon", tags: ["toy", "cartoon"], toon: { bands: 4, rimStrength: 0.2, outlineWidth: 0.002 } }),
  preset("soft-clay", "Soft Clay", "toon", [0.72, 0.42, 0.34, 1], 0, 0.88, { shader: "toon", tags: ["stop motion", "character"], toon: { bands: 5, shadowColor: [0.42, 0.28, 0.25], rimStrength: 0.08, outlineWidth: 0 } }),
  preset("ink-shadow", "Ink Shadow", "toon", [0.03, 0.035, 0.045, 1], 0, 0.8, { shader: "toon", tags: ["outline", "graphic", "manga"], toon: { bands: 2, shadowColor: [0.02, 0.02, 0.03], rimColor: [1, 0.18, 0.12], rimStrength: 0.55, outlineColor: [0.005, 0.005, 0.008, 1], outlineWidth: 0.007 } }),
  preset("anime-daylight", "Anime Daylight", "toon", [0.96, 0.62, 0.22, 1], 0, 0.62, { shader: "toon", tags: ["anime", "hero", "daylight"], toon: { bands: 3, shadowColor: [0.32, 0.42, 0.68], rimColor: [1, 0.94, 0.72], rimStrength: 0.34, outlineWidth: 0.004 } }),
  preset("anime-night-battle", "Anime Night Battle", "toon", [0.16, 0.34, 0.82, 1], 0.04, 0.48, { shader: "toon", tags: ["anime", "fight", "night", "energy"], toon: { bands: 3, shadowColor: [0.06, 0.025, 0.2], rimColor: [0.2, 0.88, 1], rimStrength: 0.68, outlineColor: [0.01, 0.008, 0.04, 1], outlineWidth: 0.0055 } }),
  preset("graphic-manga", "Graphic Manga", "toon", [0.92, 0.92, 0.88, 1], 0, 0.92, { shader: "toon", tags: ["manga", "ink", "graphic", "monochrome"], toon: { bands: 2, shadowColor: [0.03, 0.03, 0.035], rimColor: [1, 1, 1], rimStrength: 0.12, outlineColor: [0.005, 0.005, 0.005, 1], outlineWidth: 0.008 } }),

  preset("clean-glass", "Clean Glass", "photoreal", [0.72, 0.88, 0.95, 0.3], 0, 0.05, { opacity: 0.3, tags: ["window", "bottle"] }),
  preset("wet-asphalt", "Wet Asphalt", "photoreal", [0.035, 0.04, 0.045, 1], 0.05, 0.16, { tags: ["road", "rain"] }),
  preset("polished-marble", "Polished Marble", "photoreal", [0.72, 0.7, 0.66, 1], 0, 0.18, { tags: ["architecture", "stone"] }),
  preset("rusted-steel", "Rusted Steel", "photoreal", [0.34, 0.105, 0.035, 1], 0.58, 0.84, { tags: ["industrial", "decay"] }),
  preset("porcelain", "Porcelain", "photoreal", [0.92, 0.9, 0.84, 1], 0, 0.14, { tags: ["ceramic", "prop"] }),
  preset("velvet", "Velvet", "photoreal", [0.23, 0.01, 0.025, 1], 0, 0.98, { tags: ["fabric", "luxury"] }),
  preset("snow", "Snow", "photoreal", [0.82, 0.9, 0.96, 1], 0, 0.86, { tags: ["terrain", "winter"] }),
  preset("desert-sand", "Desert Sand", "photoreal", [0.62, 0.42, 0.2, 1], 0, 0.96, { tags: ["terrain", "desert"] }),

  preset("hologram-blue", "Hologram Blue", "effects", [0.02, 0.3, 0.48, 0.72], 0.15, 0.2, { emissive: [0.02, 0.72, 1], shader: "hologram", opacity: 0.72, doubleSided: true, tags: ["sci-fi", "projection"] }),
  preset("hologram-red", "Hologram Red", "effects", [0.48, 0.025, 0.02, 0.72], 0.15, 0.2, { emissive: [1, 0.08, 0.03], shader: "hologram", opacity: 0.72, doubleSided: true, tags: ["sci-fi", "warning"] }),
  preset("magic-rune", "Magic Rune", "effects", [0.12, 0.02, 0.3, 1], 0.1, 0.25, { emissive: [0.58, 0.08, 1], tags: ["fantasy", "spell"] }),
  preset("toxic-glow", "Toxic Glow", "effects", [0.03, 0.18, 0.025, 1], 0, 0.35, { emissive: [0.16, 1, 0.04], tags: ["hazard", "liquid"] }),
]);

const PRESETS_BY_ID = new Map(MATERIAL_PRESETS_3D.map((item) => [item.id, item]));

export function materialPreset3D(id: string): MaterialPreset3D {
  const result = PRESETS_BY_ID.get(id);
  if (!result) throw new Error(`Unknown 3D material preset: ${id}`);
  return result;
}

export function searchMaterialPresets3D(options: { query?: string; families?: readonly MaterialStyleFamily3D[]; limit?: number } = {}): readonly MaterialPreset3D[] {
  const terms = (options.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const families = new Set(options.families ?? []);
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) throw new RangeError("Material preset limit must be a positive safe integer.");
  return MATERIAL_PRESETS_3D.filter((item) => (!families.size || families.has(item.family)) && terms.every((term) => [item.id, item.name, item.family, ...item.tags].join(" ").toLowerCase().includes(term))).slice(0, options.limit);
}

export function applyMaterialPreset3D(material: Material3D, presetId: string): Material3D {
  const look = materialPreset3D(presetId).look;
  return { ...material, baseColor: [...look.baseColor], emissive: [...look.emissive], metallic: look.metallic, roughness: look.roughness, alphaMode: look.opacity < 1 ? "blend" : "opaque", shading: look.shading, ...(look.shader === "unlit" ? {} : { shader: look.shader }), doubleSided: look.doubleSided, uvOffset: [...look.uv.offset], uvScale: [...look.uv.scale], uvRotation: look.uv.rotation, ...(look.toon ? { toon: copyToon(look.toon) } : { toon: undefined }) };
}

/** Blends numeric properties; shader, texture, and sidedness switch at the midpoint. */
export function sampleMaterialTransition3D(options: { from: MaterialLook3D; to: MaterialLook3D; progress: number }): MaterialLook3D {
  const progress = Math.min(1, Math.max(0, Number.isFinite(options.progress) ? options.progress : 0));
  const blend = (a: number, b: number) => a + (b - a) * progress;
  const midpoint = progress < 0.5 ? options.from : options.to;
  return {
    baseColor: blend4(options.from.baseColor, options.to.baseColor, blend),
    emissive: blend3(options.from.emissive, options.to.emissive, blend),
    metallic: blend(options.from.metallic, options.to.metallic), roughness: blend(options.from.roughness, options.to.roughness), opacity: blend(options.from.opacity, options.to.opacity),
    shading: midpoint.shading, shader: midpoint.shader, doubleSided: midpoint.doubleSided, ...(midpoint.cutaway ? { cutaway: true } : {}),
    uv: { offset: [blend(options.from.uv.offset[0], options.to.uv.offset[0]), blend(options.from.uv.offset[1], options.to.uv.offset[1])], scale: [blend(options.from.uv.scale[0], options.to.uv.scale[0]), blend(options.from.uv.scale[1], options.to.uv.scale[1])], rotation: blend(options.from.uv.rotation, options.to.uv.rotation) },
    textures: midpoint.textures,
    ...(midpoint.toon ? { toon: copyToon(midpoint.toon) } : {}),
  };
}

function copyToon(toon: MaterialToonLook3D): MaterialToonLook3D { return { bands: toon.bands, shadowColor: [toon.shadowColor[0], toon.shadowColor[1], toon.shadowColor[2]], rimColor: [toon.rimColor[0], toon.rimColor[1], toon.rimColor[2]], rimStrength: toon.rimStrength, outlineColor: [toon.outlineColor[0], toon.outlineColor[1], toon.outlineColor[2], toon.outlineColor[3]], outlineWidth: toon.outlineWidth }; }
function blend3(from: readonly [number, number, number], to: readonly [number, number, number], blend: (left: number, right: number) => number): [number, number, number] { return [blend(from[0], to[0]), blend(from[1], to[1]), blend(from[2], to[2])]; }
function blend4(from: readonly [number, number, number, number], to: readonly [number, number, number, number], blend: (left: number, right: number) => number): [number, number, number, number] { return [blend(from[0], to[0]), blend(from[1], to[1]), blend(from[2], to[2]), blend(from[3], to[3])]; }
