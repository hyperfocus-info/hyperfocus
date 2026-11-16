export const ASSET_TYPES = [
  "2d-sprites",
  "3d-models",
  "animations",
  "audio-sfx",
  "backgrounds",
  "fonts",
  "hdri",
  "music",
  "soundfonts",
  "stock-video",
  "textures-materials",
  "ui-icons",
  "vfx",
  "video-overlays",
] as const;

export type AssetType = typeof ASSET_TYPES[number];
export type LicenseScope = "all-cc0" | "cc0-filter" | "attribution" | "mixed" | "custom";
export type RawRedistribution = "allowed" | "check-item" | "forbidden";

export type AssetSource = Readonly<{
  id: string;
  name: string;
  url: string;
  licenseUrl: string;
  licenseScope: LicenseScope;
  licenseNote: string;
  rawRedistribution: RawRedistribution;
  access: "direct" | "account" | "paid-or-free" | "api-or-account";
  types: readonly AssetType[];
  formats: readonly string[];
  strengths: string;
  tags: readonly string[];
  workflow?: "craftpix-download";
}>;

export const ASSET_SOURCES: readonly AssetSource[] = [
  {
    id: "pexels", name: "Pexels photos and video", url: "https://www.pexels.com/videos/", licenseUrl: "https://www.pexels.com/license/",
    licenseScope: "custom", licenseNote: "The Pexels license allows free commercial use and modification without required attribution, but forbids raw stock redistribution and implied endorsement.", rawRedistribution: "forbidden", access: "api-or-account",
    types: ["backgrounds", "stock-video"], formats: ["JPG", "MP4"],
    strengths: "Large photo and stock-video library for locations, performance plates, nature, abstract light, texture, and B-roll backgrounds.", tags: ["music video", "background", "b-roll", "cinematic", "portrait", "landscape"],
  },
  {
    id: "coverr", name: "Coverr", url: "https://coverr.co/stock-video-footage", licenseUrl: "https://coverr.co/license/",
    licenseScope: "custom", licenseNote: "Coverr permits commercial synchronization under its current terms; free downloads may require attribution and raw redistribution, competing libraries, and AI datasets are forbidden.", rawRedistribution: "forbidden", access: "paid-or-free",
    types: ["stock-video", "video-overlays", "music"], formats: ["MP4", "4K", "HD"],
    strengths: "Looping cinematic footage, abstract visual backgrounds, natural plates, lifestyle B-roll, and music suited to video projects.", tags: ["music video", "loops", "background", "b-roll", "cinematic", "abstract"],
  },
  {
    id: "unsplash", name: "Unsplash", url: "https://unsplash.com/", licenseUrl: "https://unsplash.com/license",
    licenseScope: "custom", licenseNote: "The Unsplash license allows commercial image use and modification without required attribution, but not an unmodified competing image library.", rawRedistribution: "forbidden", access: "api-or-account",
    types: ["backgrounds", "textures-materials"], formats: ["JPG"],
    strengths: "Millions of high-resolution photographic environments, portraits, textures, architecture, skies, and abstract backgrounds.", tags: ["photography", "background", "realistic", "environment", "album art"],
  },
  {
    id: "kenney", name: "Kenney", url: "https://kenney.nl/assets", licenseUrl: "https://kenney.nl/support",
    licenseScope: "all-cc0", licenseNote: "Kenney states that assets on its asset pages are CC0.", rawRedistribution: "allowed", access: "direct",
    types: ["2d-sprites", "3d-models", "audio-sfx", "music", "ui-icons", "vfx"], formats: ["PNG", "SVG", "WAV", "OGG", "GLB", "FBX"],
    strengths: "Broad coherent game packs, UI, input prompts, audio, platformer, racing, puzzle, and low-poly 3D.", tags: ["baseline", "coherent packs", "prototype", "commercial"],
  },
  {
    id: "quaternius", name: "Quaternius", url: "https://quaternius.com/", licenseUrl: "https://quaternius.com/faq.html",
    licenseScope: "all-cc0", licenseNote: "The provider states all models are CC0.", rawRedistribution: "allowed", access: "direct",
    types: ["3d-models", "animations"], formats: ["FBX", "OBJ", "GLTF", "BLEND"],
    strengths: "Large stylized low-poly worlds, modular characters, vehicles, creatures, props, and animation libraries.", tags: ["low poly", "characters", "environment", "vehicles"],
  },
  {
    id: "kaykit", name: "KayKit", url: "https://kaylousberg.com/game-assets", licenseUrl: "https://kaylousberg.itch.io/kaykit-complete",
    licenseScope: "all-cc0", licenseNote: "KayKit pack pages identify the assets as CC0; some bundles are paid while individual packs may be free.", rawRedistribution: "allowed", access: "paid-or-free",
    types: ["3d-models", "animations"], formats: ["GLTF", "FBX", "OBJ", "BLEND"],
    strengths: "Consistent low-poly characters, dungeons, cities, nature, weapons, platformer, RTS, and animation packs.", tags: ["low poly", "modular", "characters", "rpg"],
  },
  {
    id: "poly-haven", name: "Poly Haven", url: "https://polyhaven.com/all", licenseUrl: "https://polyhaven.com/license",
    licenseScope: "all-cc0", licenseNote: "Poly Haven publishes its asset library under CC0.", rawRedistribution: "allowed", access: "direct",
    types: ["3d-models", "hdri", "textures-materials"], formats: ["GLTF", "FBX", "BLEND", "EXR", "HDR", "PNG", "JPG"],
    strengths: "Curated realistic PBR models, environment lighting, and high-resolution materials with an official API.", tags: ["pbr", "realistic", "environment", "lighting"],
  },
  {
    id: "ambientcg", name: "ambientCG", url: "https://ambientcg.com/list", licenseUrl: "https://docs.ambientcg.com/license/",
    licenseScope: "all-cc0", licenseNote: "ambientCG publishes its materials and asset files under CC0.", rawRedistribution: "allowed", access: "direct",
    types: ["3d-models", "hdri", "textures-materials"], formats: ["PNG", "JPG", "EXR", "SBSAR", "GLTF"],
    strengths: "Large searchable PBR material library plus decals, HDRIs, atlases, and some models.", tags: ["pbr", "materials", "decals", "photoreal"],
  },
  {
    id: "freesound-cc0", name: "Freesound CC0 search", url: "https://freesound.org/search/?f=license:%22Creative+Commons+0%22", licenseUrl: "https://freesound.org/help/faq/#licenses",
    licenseScope: "cc0-filter", licenseNote: "Freesound hosts several Creative Commons licenses; keep the search on Creative Commons 0 and verify each sound.", rawRedistribution: "check-item", access: "api-or-account",
    types: ["audio-sfx", "music"], formats: ["WAV", "FLAC", "OGG", "MP3", "AIFF"],
    strengths: "Very large searchable field recordings, foley, ambience, UI, impacts, voices, machines, and designed sounds.", tags: ["cc0 audio", "foley", "ambience", "field recording"],
  },
  {
    id: "opengameart-cc0", name: "OpenGameArt CC0", url: "https://opengameart.org/art-search-advanced?keys=&field_art_type_tid%5B%5D=9&sort_by=count&sort_order=DESC&items_per_page=24&Collection=&field_art_licenses_tid%5B%5D=4", licenseUrl: "https://opengameart.org/content/faq",
    licenseScope: "cc0-filter", licenseNote: "OpenGameArt hosts multiple licenses; retain the CC0 filter and verify the item download, not only its preview.", rawRedistribution: "check-item", access: "direct",
    types: ["2d-sprites", "3d-models", "audio-sfx", "fonts", "music", "textures-materials", "ui-icons", "vfx"], formats: ["PNG", "SVG", "OGG", "WAV", "TGA", "BLEND", "OBJ"],
    strengths: "Game-specific sprites, tiles, music, SFX, fonts, UI, effects, and community collections across many genres.", tags: ["pixel art", "tilesets", "rpg", "retro", "community"],
  },
  {
    id: "itch-cc0", name: "itch.io CC0 assets", url: "https://itch.io/game-assets/assets-cc0", licenseUrl: "https://itch.io/docs/creators/faq#what-licenses-are-supported",
    licenseScope: "cc0-filter", licenseNote: "The CC0 tag is uploader-provided; confirm the asset license shown on every pack page and in the archive.", rawRedistribution: "check-item", access: "paid-or-free",
    types: ["2d-sprites", "3d-models", "animations", "audio-sfx", "fonts", "music", "textures-materials", "ui-icons", "vfx"], formats: ["PNG", "PSD", "ASEPRITE", "WAV", "OGG", "GLTF", "FBX"],
    strengths: "Huge indie catalog covering pixel art, genre kits, UI, music, audio, 3D, shaders, and unusual niches.", tags: ["indie", "pixel art", "genre packs", "game jam"],
  },
  {
    id: "craftpix", name: "Craftpix", url: "https://craftpix.net/freebies/", licenseUrl: "https://craftpix.net/file-licenses/",
    licenseScope: "custom", licenseNote: "Craftpix uses its own file licenses; free does not mean CC0. Preserve the product URL and included license.", rawRedistribution: "forbidden", access: "account",
    types: ["2d-sprites", "animations", "fonts", "ui-icons", "vfx"], formats: ["PNG", "PSD", "AI", "EPS", "Spine"],
    strengths: "Large polished 2D catalog for RPG, platformer, tower defense, characters, monsters, UI, icons, and effects.", tags: ["2d", "characters", "tilesets", "premium", "freebies"], workflow: "craftpix-download",
  },
  {
    id: "game-icons", name: "Game-icons.net", url: "https://game-icons.net/", licenseUrl: "https://game-icons.net/about.html",
    licenseScope: "attribution", licenseNote: "Most icons are CC BY 3.0 and require author credit; some individual icons are public domain.", rawRedistribution: "allowed", access: "direct",
    types: ["ui-icons"], formats: ["SVG", "PNG"],
    strengths: "Thousands of editable monochrome game-mechanic, inventory, status, action, creature, and interface icons.", tags: ["svg", "inventory", "status", "skills", "tabletop"],
  },
  {
    id: "google-fonts", name: "Google Fonts", url: "https://fonts.google.com/", licenseUrl: "https://developers.google.com/fonts/faq",
    licenseScope: "mixed", licenseNote: "Families use open licenses such as OFL or Apache; preserve the exact selected family's license files.", rawRedistribution: "check-item", access: "direct",
    types: ["fonts"], formats: ["TTF", "OTF", "WOFF2"],
    strengths: "Large multilingual variable and static font catalog with family-level license metadata.", tags: ["typography", "localization", "variable fonts", "webfont"],
  },
  {
    id: "material-symbols", name: "Material Symbols", url: "https://fonts.google.com/icons", licenseUrl: "https://github.com/google/material-design-icons/blob/master/LICENSE",
    licenseScope: "attribution", licenseNote: "The icon repository is Apache-2.0; retain notices when redistributing source assets.", rawRedistribution: "allowed", access: "direct",
    types: ["ui-icons"], formats: ["SVG", "PNG", "WOFF2"],
    strengths: "Broad consistent interface and platform icon vocabulary with variable weight, fill, grade, and optical size.", tags: ["ui", "system icons", "accessibility", "svg"],
  },
  {
    id: "font-awesome-free", name: "Font Awesome Free", url: "https://fontawesome.com/search?o=r&m=free", licenseUrl: "https://fontawesome.com/license/free",
    licenseScope: "attribution", licenseNote: "Free icons use CC BY 4.0 while fonts and code use separate open licenses; follow the current license page.", rawRedistribution: "allowed", access: "direct",
    types: ["ui-icons"], formats: ["SVG", "WOFF2"],
    strengths: "Consistent general-purpose UI and brand icon set with web-ready packaging.", tags: ["ui", "brands", "svg", "webfont"],
  },
  {
    id: "sketchfab-cc0", name: "Sketchfab CC0 filter", url: "https://sketchfab.com/search?features=downloadable&licenses=7c23a1ba438d4306920229c12afcb5f9&type=models", licenseUrl: "https://sketchfab.com/licenses",
    licenseScope: "cc0-filter", licenseNote: "Licenses are model-specific; retain the CC0 filter and verify the model page and archive metadata.", rawRedistribution: "check-item", access: "account",
    types: ["3d-models", "animations"], formats: ["GLTF", "GLB", "FBX", "OBJ"],
    strengths: "Very broad downloadable 3D catalog including scanned objects, characters, environments, and animated models.", tags: ["3d", "scans", "characters", "downloadable"],
  },
  {
    id: "smithsonian-open-access", name: "Smithsonian 3D Open Access", url: "https://3d.si.edu/collections/openaccesshighlights", licenseUrl: "https://3d.si.edu/collections/openaccesshighlights",
    licenseScope: "cc0-filter", licenseNote: "Smithsonian Open Access models marked CC0 may be downloaded, transformed, shared, and used commercially; verify the CC0 mark on the selected object.", rawRedistribution: "check-item", access: "direct",
    types: ["3d-models", "textures-materials"], formats: ["GLB", "GLTF", "OBJ"],
    strengths: "High-fidelity cultural, historic, natural-history, animal, fossil, aircraft, and spacecraft scans.", tags: ["photogrammetry", "scan", "animals", "history", "aircraft", "space", "photoreal"],
  },
  {
    id: "nasa-3d", name: "NASA 3D Resources", url: "https://nasa3d.arc.nasa.gov/", licenseUrl: "https://nasa3d.arc.nasa.gov/usage-guidelines/",
    licenseScope: "custom", licenseNote: "NASA provides the collection free and generally without copyright, but its identifiers, logos, people, and third-party contributions remain subject to the usage guidelines; inspect each item.", rawRedistribution: "check-item", access: "direct",
    types: ["3d-models", "textures-materials", "backgrounds"], formats: ["OBJ", "FBX", "3DS", "STL", "JPG", "PNG"],
    strengths: "Hundreds of authoritative spacecraft, satellites, rovers, planets, terrain, scientific visualizations, images, and textures.", tags: ["space", "spacecraft", "satellite", "rover", "planet", "science", "realistic"],
  },
  {
    id: "khronos-gltf-samples", name: "Khronos glTF Sample Assets", url: "https://github.com/KhronosGroup/glTF-Sample-Assets", licenseUrl: "https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/REUSE.toml",
    licenseScope: "mixed", licenseNote: "Licenses are model-specific and include CC0, CC BY, noncommercial, trademark, and testing-only terms; use each model's SPDX metadata and LICENSE file.", rawRedistribution: "check-item", access: "direct",
    types: ["3d-models", "animations", "textures-materials"], formats: ["GLTF", "GLB", "KTX2", "PNG", "JPG"],
    strengths: "Reference-quality models for PBR, UV transforms, skinning, morphs, animation, clearcoat, transmission, and renderer compatibility testing.", tags: ["gltf", "pbr", "shader", "uv", "materials", "reference", "animation"],
  },
  {
    id: "blenderkit", name: "BlenderKit", url: "https://www.blenderkit.com/asset-gallery", licenseUrl: "https://www.blenderkit.com/docs/licenses/",
    licenseScope: "mixed", licenseNote: "Assets use BlenderKit's Royalty Free or CC0 terms and availability varies by plan; preserve the exact asset license and do not redistribute a raw library.", rawRedistribution: "check-item", access: "paid-or-free",
    types: ["3d-models", "textures-materials", "hdri"], formats: ["BLEND", "FBX", "OBJ", "GLTF", "PNG", "JPG", "EXR"],
    strengths: "Large production-oriented catalog of realistic and stylized models, materials, brushes, scenes, and HDRIs integrated with Blender.", tags: ["photoreal", "architecture", "furniture", "vehicles", "characters", "materials"],
  },
  {
    id: "poly-pizza", name: "Poly Pizza", url: "https://poly.pizza/", licenseUrl: "https://poly.pizza/",
    licenseScope: "mixed", licenseNote: "Models are individually marked with licenses such as CC0 or CC BY; verify the item and retain author attribution where required.", rawRedistribution: "check-item", access: "direct",
    types: ["3d-models"], formats: ["GLB", "GLTF", "OBJ"],
    strengths: "Fast-searchable low-poly models spanning fantasy, animals, vehicles, weapons, food, nature, buildings, and everyday props.", tags: ["low poly", "toon", "animals", "cars", "weapons", "fantasy", "props"],
  },
  {
    id: "sonniss-gdc", name: "Sonniss GameAudioGDC", url: "https://gdc.sonniss.com/", licenseUrl: "https://sonniss.com/gdc-bundle-license/",
    licenseScope: "custom", licenseNote: "Commercial game synchronization is allowed under the current bundle license; raw-library redistribution and AI use are restricted.", rawRedistribution: "forbidden", access: "direct",
    types: ["audio-sfx"], formats: ["WAV"],
    strengths: "Large professional yearly SFX bundles and archive covering cinematic, weapons, vehicles, creatures, foley, ambience, and UI.", tags: ["professional audio", "foley", "cinematic", "large download"],
  },
  {
    id: "mixkit", name: "Mixkit", url: "https://mixkit.co/free-sound-effects/", licenseUrl: "https://mixkit.co/license/",
    licenseScope: "custom", licenseNote: "Free assets use the Mixkit license, not CC0; check the asset type and current restrictions.", rawRedistribution: "forbidden", access: "direct",
    types: ["audio-sfx", "music", "vfx"], formats: ["WAV", "MP3", "MP4"],
    strengths: "Quickly browsable UI, game, transition, nature, ambience, cinematic SFX, music, and stock video effects.", tags: ["audio", "transitions", "ui", "stock"],
  },
  {
    id: "pixabay", name: "Pixabay", url: "https://pixabay.com/sound-effects/", licenseUrl: "https://pixabay.com/service/license-summary/",
    licenseScope: "custom", licenseNote: "Pixabay content uses the Pixabay Content License, not CC0; standalone resale and redistribution are restricted.", rawRedistribution: "forbidden", access: "account",
    types: ["audio-sfx", "music", "textures-materials"], formats: ["MP3", "WAV", "JPG", "PNG"],
    strengths: "Large searchable stock audio, music, photos, illustrations, and textures for prototypes and synchronized releases.", tags: ["stock", "audio", "photos", "music"],
  },
  {
    id: "fluidr3-gm", name: "FluidR3 GM", url: "https://member.keymusician.com/Member/FluidR3_GM/", licenseUrl: "https://member.keymusician.com/Member/FluidR3_GM/README.html",
    licenseScope: "custom", licenseNote: "A redistributable General MIDI SF2 with required copyright and README files; it is not CC0.", rawRedistribution: "check-item", access: "direct",
    types: ["soundfonts"], formats: ["SF2"],
    strengths: "General MIDI instrument bank for offline composition or a dedicated SoundFont player.", tags: ["midi", "gm", "instruments", "sf2"],
  },
  {
    id: "generaluser-gs", name: "GeneralUser GS", url: "https://schristiancollins.com/generaluser.php", licenseUrl: "https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/README.md",
    licenseScope: "custom", licenseNote: "Permissive music-production and software-project terms, with explicit sample-origin caveats; review before commercial embedding.", rawRedistribution: "check-item", access: "direct",
    types: ["soundfonts"], formats: ["SF2"],
    strengths: "Compact General MIDI/GS bank suited to composition and MIDI playback through a separate SF2 player.", tags: ["midi", "gm", "gs", "sf2"],
  },
  {
    id: "sfz-instruments", name: "SFZ Instruments directory", url: "https://sfzinstruments.github.io/", licenseUrl: "https://sfzinstruments.github.io/",
    licenseScope: "mixed", licenseNote: "This is a directory of independently licensed instruments; verify every library and its sample redistribution terms.", rawRedistribution: "check-item", access: "paid-or-free",
    types: ["soundfonts"], formats: ["SFZ", "WAV", "FLAC"],
    strengths: "Wide range of multisampled acoustic, orchestral, percussion, and experimental instruments for SFZ players.", tags: ["instruments", "sampler", "sfz", "music production"],
  },
] as const;

export type CatalogQuery = Readonly<{
  query?: string;
  types?: readonly AssetType[];
  cc0Only?: boolean;
  limit?: number;
}>;

export function searchAssetCatalog(options: CatalogQuery = {}) {
  const terms = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const requestedTypes = new Set(options.types ?? []);
  const matches = ASSET_SOURCES.filter((source) => {
    if (options.cc0Only && source.licenseScope !== "all-cc0" && source.licenseScope !== "cc0-filter") return false;
    if (requestedTypes.size && !source.types.some((type) => requestedTypes.has(type))) return false;
    if (!terms.length) return true;
    const haystack = [source.id, source.name, source.strengths, source.licenseNote, ...source.formats, ...source.tags, ...source.types].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new RangeError("Catalog result limit must be a positive safe integer.");
  }
  const limit = options.limit ?? matches.length;
  return matches.slice(0, limit);
}
