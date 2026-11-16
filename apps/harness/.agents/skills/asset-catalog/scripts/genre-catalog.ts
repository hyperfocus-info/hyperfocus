import type { AssetType, LicenseScope } from "./catalog";

export const GAME_GENRES = ["platformer", "rpg", "tower-defense", "racing", "3d-action", "music-video"] as const;
export type GameGenre = typeof GAME_GENRES[number];

export type GenreAssetPack = Readonly<{
  id: string;
  name: string;
  sourceId: "craftpix" | "kenney" | "kaykit";
  url: string;
  genres: readonly GameGenre[];
  types: readonly AssetType[];
  licenseScope: LicenseScope;
  cost: "free" | "free-tier";
  artStyles: readonly string[];
  contents: string;
  productId?: string;
  workflow?: "craftpix-download";
}>;

export type GameGenreRoute = Readonly<{
  id: GameGenre;
  name: string;
  summary: string;
  perspectives: readonly string[];
  requiredTypes: readonly AssetType[];
  recommendedSourceIds: readonly string[];
  gameIdeas: readonly string[];
  audioSearchTerms: readonly string[];
}>;

export const GENRE_ASSET_PACKS: readonly GenreAssetPack[] = [
  { id: "craftpix-simple-platformer", name: "Free Simple Platformer Game Kit Pixel Art", sourceId: "craftpix", url: "https://craftpix.net/freebies/free-simple-platformer-game-kit-pixel-art/", genres: ["platformer"], types: ["2d-sprites", "animations", "ui-icons", "vfx"], licenseScope: "custom", cost: "free", artStyles: ["pixel", "colorful"], contents: "Characters, enemies, 16x16 tiles, backgrounds, traps, animated objects, and UI.", productId: "64213", workflow: "craftpix-download" },
  { id: "kenney-new-platformer", name: "New Platformer Pack", sourceId: "kenney", url: "https://kenney.nl/assets/new-platformer-pack", genres: ["platformer"], types: ["2d-sprites", "animations"], licenseScope: "all-cc0", cost: "free", artStyles: ["vector", "colorful"], contents: "440 tiles, characters, and looping platformer assets." },
  { id: "kenney-pixel-platformer", name: "Pixel Platformer", sourceId: "kenney", url: "https://kenney.nl/assets/pixel-platformer", genres: ["platformer"], types: ["2d-sprites"], licenseScope: "all-cc0", cost: "free", artStyles: ["pixel", "18x18"], contents: "Compact tiles, props, and expansion-compatible pixel art." },
  { id: "kenney-platformer-kit", name: "Platformer Kit", sourceId: "kenney", url: "https://kenney.nl/assets/platformer-kit", genres: ["platformer", "3d-action"], types: ["3d-models", "animations"], licenseScope: "all-cc0", cost: "free", artStyles: ["low-poly", "colorful"], contents: "Animated characters and modular 3D platforming pieces." },
  { id: "kaykit-platformer", name: "KayKit Platformer Pack", sourceId: "kaykit", url: "https://kaylousberg.itch.io/kaykit-platformer", genres: ["platformer", "3d-action"], types: ["3d-models"], licenseScope: "all-cc0", cost: "free-tier", artStyles: ["low-poly", "modern-cartoon"], contents: "120+ unique 3D blocks, obstacles, traps, pickups, power-ups, and switches." },

  { id: "craftpix-topdown-roguelike", name: "Free Top-Down Roguelike Game Kit Pixel Art", sourceId: "craftpix", url: "https://craftpix.net/freebies/free-top-down-roguelike-game-kit-pixel-art/", genres: ["rpg"], types: ["2d-sprites", "animations", "ui-icons", "vfx"], licenseScope: "custom", cost: "free", artStyles: ["pixel", "fantasy"], contents: "Knight, wizard, archer, enemies, tiles, animated props, traps, menus, and icons.", productId: "76854", workflow: "craftpix-download" },
  { id: "craftpix-rpg-ui", name: "Free Basic Pixel Art UI for RPG", sourceId: "craftpix", url: "https://craftpix.net/freebies/free-basic-pixel-art-ui-for-rpg/", genres: ["rpg"], types: ["ui-icons"], licenseScope: "custom", cost: "free", artStyles: ["pixel", "fantasy"], contents: "Inventory, crafting, shop, equipment, HUD, status bars, dialogs, and icons.", productId: "91858", workflow: "craftpix-download" },
  { id: "kenney-roguelike-rpg", name: "Roguelike/RPG Pack", sourceId: "kenney", url: "https://kenney.nl/assets/roguelike-rpg-pack", genres: ["rpg"], types: ["2d-sprites", "ui-icons"], licenseScope: "all-cc0", cost: "free", artStyles: ["pixel", "16x16"], contents: "1,700 town, dungeon, furniture, character, panel, and button files." },
  { id: "kenney-one-bit", name: "1-Bit Pack", sourceId: "kenney", url: "https://kenney.nl/assets/1-bit-pack", genres: ["rpg"], types: ["2d-sprites", "ui-icons"], licenseScope: "all-cc0", cost: "free", artStyles: ["1-bit", "pixel"], contents: "1,078 high-contrast roguelike and RPG files for a radically different art direction." },
  { id: "kaykit-adventurers", name: "KayKit Adventurers", sourceId: "kaykit", url: "https://kaylousberg.itch.io/kaykit", genres: ["rpg", "3d-action"], types: ["3d-models", "animations"], licenseScope: "all-cc0", cost: "free-tier", artStyles: ["low-poly", "fantasy"], contents: "Five rigged heroes, animations, and 25+ weapons and accessories." },
  { id: "kaykit-dungeon", name: "KayKit Dungeon Pack", sourceId: "kaykit", url: "https://kaylousberg.itch.io/kaykit-dungeon-pack", genres: ["rpg", "3d-action"], types: ["3d-models"], licenseScope: "all-cc0", cost: "free-tier", artStyles: ["low-poly", "fantasy"], contents: "200+ modular dungeon pieces, furniture, traps, doors, stairs, chests, and props." },
  { id: "kaykit-skeletons", name: "KayKit Skeletons", sourceId: "kaykit", url: "https://kaylousberg.itch.io/kaykit-skeletons", genres: ["rpg", "3d-action"], types: ["3d-models", "animations"], licenseScope: "all-cc0", cost: "free-tier", artStyles: ["low-poly", "fantasy"], contents: "Four rigged enemy characters with animations, weapons, and accessories." },

  { id: "craftpix-tower-tiles", name: "Free Tower Defense 2D Vector Tileset", sourceId: "craftpix", url: "https://craftpix.net/freebies/free-tower-defense-2d-vector-tileset/", genres: ["tower-defense"], types: ["2d-sprites"], licenseScope: "custom", cost: "free", artStyles: ["vector", "fantasy"], contents: "Top-down paths, terrain, decoration, and level-building tiles.", productId: "94572", workflow: "craftpix-download" },
  { id: "craftpix-cat-defense", name: "Free Cartoon Cat Defense Game Asset Kit", sourceId: "craftpix", url: "https://craftpix.net/freebies/free-cartoon-cat-defense-game-asset-kit/", genres: ["tower-defense"], types: ["2d-sprites", "animations", "ui-icons", "vfx"], licenseScope: "custom", cost: "free", artStyles: ["vector", "modern-cartoon"], contents: "Defender upgrades, enemies, bosses, projectiles, effects, five backgrounds, and a complete UI loop.", productId: "108838", workflow: "craftpix-download" },
  { id: "kenney-tower-defense", name: "Tower Defense", sourceId: "kenney", url: "https://kenney.nl/assets/tower-defense", genres: ["tower-defense"], types: ["2d-sprites"], licenseScope: "all-cc0", cost: "free", artStyles: ["isometric", "vector"], contents: "230 isometric landscape and defense files." },
  { id: "kenney-tower-defense-topdown", name: "Tower Defense Top-Down", sourceId: "kenney", url: "https://kenney.nl/assets/tower-defense-top-down", genres: ["tower-defense"], types: ["2d-sprites"], licenseScope: "all-cc0", cost: "free", artStyles: ["top-down", "vector"], contents: "300 towers, weapons, enemies, paths, and top-down defense pieces." },
  { id: "kenney-tower-defense-kit", name: "Tower Defense Kit", sourceId: "kenney", url: "https://kenney.nl/assets/tower-defense-kit", genres: ["tower-defense", "3d-action"], types: ["3d-models"], licenseScope: "all-cc0", cost: "free", artStyles: ["low-poly", "medieval"], contents: "160 modular 3D medieval castle and defense models." },

  { id: "craftpix-racing", name: "Free Racing Game Kit", sourceId: "craftpix", url: "https://craftpix.net/freebies/free-racing-game-kit/", genres: ["racing"], types: ["2d-sprites", "ui-icons"], licenseScope: "custom", cost: "free", artStyles: ["vector", "side-view"], contents: "Three cars, track tiles, hazards, scenery, victory/defeat screens, and buttons.", productId: "5191", workflow: "craftpix-download" },
  { id: "kenney-racing-pack", name: "Racing Pack", sourceId: "kenney", url: "https://kenney.nl/assets/racing-pack", genres: ["racing"], types: ["2d-sprites"], licenseScope: "all-cc0", cost: "free", artStyles: ["top-down", "vector"], contents: "420 cars, road tiles, scenery, and racing props." },
  { id: "kenney-racing-kit", name: "Racing Kit", sourceId: "kenney", url: "https://kenney.nl/assets/racing-kit", genres: ["racing"], types: ["3d-models"], licenseScope: "all-cc0", cost: "free", artStyles: ["low-poly", "arcade"], contents: "110 modular 3D track, vehicle, and race environment files." },
  { id: "kenney-car-kit", name: "Car Kit", sourceId: "kenney", url: "https://kenney.nl/assets/car-kit", genres: ["racing", "3d-action"], types: ["3d-models"], licenseScope: "all-cc0", cost: "free", artStyles: ["low-poly", "arcade"], contents: "Cars, kart racers, debris, and transport variations." },
  { id: "kenney-toy-car", name: "Toy Car Kit", sourceId: "kenney", url: "https://kenney.nl/assets/toy-car-kit", genres: ["racing"], types: ["3d-models"], licenseScope: "all-cc0", cost: "free", artStyles: ["toy", "modern-cartoon"], contents: "100 toy vehicles, track pieces, and color variants." },

  { id: "kenney-blaster", name: "Blaster Kit", sourceId: "kenney", url: "https://kenney.nl/assets/blaster-kit", genres: ["3d-action"], types: ["3d-models", "animations"], licenseScope: "all-cc0", cost: "free", artStyles: ["low-poly", "sci-fi"], contents: "Animated blasters, targets, crates, throwables, silencers, and smoke props." },
  { id: "kenney-protagonists", name: "Animated Characters Protagonists", sourceId: "kenney", url: "https://kenney.nl/assets/animated-characters-protagonists", genres: ["3d-action"], types: ["3d-models", "animations"], licenseScope: "all-cc0", cost: "free", artStyles: ["early-3d", "stylized"], contents: "Eight animated skater, cyborg, and action-character models." },
  { id: "kenney-modular-space", name: "Modular Space Kit", sourceId: "kenney", url: "https://kenney.nl/assets/modular-space-kit", genres: ["3d-action"], types: ["3d-models", "animations"], licenseScope: "all-cc0", cost: "free", artStyles: ["low-poly", "sci-fi"], contents: "Animated modular station rooms, corridors, doors, and variations." },
  { id: "kenney-modular-dungeon", name: "Modular Dungeon Kit", sourceId: "kenney", url: "https://kenney.nl/assets/modular-dungeon-kit", genres: ["rpg", "3d-action"], types: ["3d-models", "animations"], licenseScope: "all-cc0", cost: "free", artStyles: ["low-poly", "fantasy"], contents: "Animated modular dungeon tiles with color and structure variations." },
] as const;

export const GAME_GENRE_ROUTES: readonly GameGenreRoute[] = [
  { id: "music-video", name: "Music Video", summary: "Performance, lyric, animated, abstract, narrative, and visualizer projects with replaceable plates, performers, overlays, typography, transitions, particles, music, and atmosphere.", perspectives: ["2D performance stage", "animated collage", "lyric video", "abstract visualizer", "3D virtual production", "live-action composite"], requiredTypes: ["backgrounds", "stock-video", "2d-sprites", "3d-models", "animations", "music", "fonts", "vfx", "video-overlays"], recommendedSourceIds: ["pexels", "coverr", "unsplash", "poly-haven", "ambientcg", "opengameart-cc0", "itch-cc0", "google-fonts"], gameIdeas: ["performance video", "lyric video", "audio-reactive visualizer", "animated collage", "virtual band", "narrative short", "dance loop", "album teaser", "projection backdrop", "concert visuals"], audioSearchTerms: ["full mix", "stems", "instrumental", "room tone", "crowd", "riser", "whoosh", "impact", "film projector"] },
  { id: "platformer", name: "Platformer", summary: "Side-view or 3D traversal games with enough characters, terrain, hazards, pickups, UI, and audio to support a full campaign.", perspectives: ["2D side-view", "pixel side-view", "2.5D", "3D obstacle course"], requiredTypes: ["2d-sprites", "3d-models", "animations", "audio-sfx", "music", "ui-icons", "vfx"], recommendedSourceIds: ["craftpix", "kenney", "kaykit", "opengameart-cc0", "freesound-cc0", "game-icons"], gameIdeas: ["precision platformer", "endless runner", "metroidvania", "puzzle platformer", "co-op obstacle course", "vertical climber", "combat platformer", "speedrun challenge", "collectathon", "physics platformer"], audioSearchTerms: ["jump", "land", "footstep", "pickup", "checkpoint", "moving platform", "wind", "impact"] },
  { id: "rpg", name: "RPG", summary: "Top-down, roguelike, party, or 3D action-RPG routes with worlds, characters, enemies, equipment, effects, menus, and progression art.", perspectives: ["2D top-down", "pixel roguelike", "side-view RPG", "3D dungeon", "third-person action RPG"], requiredTypes: ["2d-sprites", "3d-models", "animations", "audio-sfx", "fonts", "music", "ui-icons", "vfx"], recommendedSourceIds: ["craftpix", "kenney", "kaykit", "quaternius", "opengameart-cc0", "freesound-cc0", "game-icons", "google-fonts"], gameIdeas: ["turn-based party RPG", "action RPG", "roguelike", "dungeon crawler", "monster collector", "tactical RPG", "crafting adventure", "cozy village RPG", "survival RPG", "narrative quest game"], audioSearchTerms: ["sword", "spell", "potion", "inventory", "quest", "door", "chest", "monster", "fanfare", "ambience"] },
  { id: "tower-defense", name: "Tower Defense", summary: "Top-down, isometric, idle, or 3D defense games with buildable routes, towers, enemies, projectiles, effects, upgrades, and complete HUD loops.", perspectives: ["2D top-down", "2D isometric", "idle side-view", "3D strategy"], requiredTypes: ["2d-sprites", "3d-models", "animations", "audio-sfx", "music", "ui-icons", "vfx"], recommendedSourceIds: ["craftpix", "kenney", "kaykit", "opengameart-cc0", "freesound-cc0", "game-icons"], gameIdeas: ["classic lane defense", "maze-building defense", "hero tower defense", "idle defense", "reverse tower defense", "co-op base defense", "deckbuilding defense", "survival waves", "mobile upgrade defense", "3D castle defense"], audioSearchTerms: ["tower place", "upgrade", "projectile", "enemy death", "wave start", "warning", "explosion", "magic impact"] },
  { id: "racing", name: "Racing", summary: "Top-down, side-view, kart, toy, or conventional 3D racing routes with vehicles, modular tracks, scenery, hazards, UI, and mechanical audio.", perspectives: ["2D top-down", "2D side-view", "3D kart", "3D toy racing", "arcade circuit"], requiredTypes: ["2d-sprites", "3d-models", "audio-sfx", "music", "textures-materials", "ui-icons", "vfx"], recommendedSourceIds: ["craftpix", "kenney", "quaternius", "poly-haven", "ambientcg", "freesound-cc0", "game-icons"], gameIdeas: ["top-down racer", "kart racer", "time trial", "stunt racer", "combat racing", "toy-car racer", "endless traffic dodger", "rally racer", "drift challenge", "track builder"], audioSearchTerms: ["engine loop", "tire skid", "gear shift", "collision", "countdown", "checkpoint", "crowd", "wind", "boost"] },
  { id: "3d-action", name: "3D Action", summary: "First- or third-person action games with animated characters, modular arenas, weapons, enemies, props, materials, environmental lighting, UI, and combat feedback.", perspectives: ["first-person", "third-person", "arena", "dungeon", "survival"], requiredTypes: ["3d-models", "animations", "audio-sfx", "hdri", "music", "textures-materials", "ui-icons", "vfx"], recommendedSourceIds: ["kenney", "kaykit", "quaternius", "poly-haven", "ambientcg", "freesound-cc0", "sonniss-gdc", "game-icons"], gameIdeas: ["arena shooter", "third-person brawler", "dungeon action game", "survival shooter", "stealth action", "sci-fi corridor shooter", "boss rush", "co-op horde mode", "vehicle action", "physics sandbox"], audioSearchTerms: ["weapon", "impact", "ricochet", "footstep", "cloth", "enemy vocal", "explosion", "room tone", "cinematic hit"] },
] as const;

export function gameGenreRoute(genre: GameGenre) {
  const route = GAME_GENRE_ROUTES.find((candidate) => candidate.id === genre);
  if (!route) throw new Error(`Unknown game genre: ${String(genre)}`);
  return route;
}

export function searchGenreAssetPacks(options: { genre: GameGenre; query?: string; types?: readonly AssetType[]; cc0Only?: boolean; limit?: number }) {
  const terms = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const types = new Set(options.types ?? []);
  const packs = GENRE_ASSET_PACKS.filter((pack) => {
    if (!pack.genres.includes(options.genre)) return false;
    if (options.cc0Only && pack.licenseScope !== "all-cc0") return false;
    if (types.size && !pack.types.some((type) => types.has(type))) return false;
    const haystack = [pack.id, pack.name, pack.contents, ...pack.artStyles, ...pack.types].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) throw new RangeError("Genre pack limit must be a positive safe integer.");
  return packs.slice(0, options.limit ?? packs.length);
}
