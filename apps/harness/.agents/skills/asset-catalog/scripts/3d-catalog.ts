import type { AssetType, LicenseScope } from "./catalog";

export const MODEL_3D_ROUTES = ["fantasy", "realistic", "space-modern", "retro-toon", "photoreal"] as const;
export type Model3DRouteId = typeof MODEL_3D_ROUTES[number];

export type Model3DCollection = Readonly<{
  id: string;
  name: string;
  sourceId: string;
  url: string;
  routes: readonly Model3DRouteId[];
  types: readonly AssetType[];
  licenseScope: LicenseScope;
  formats: readonly string[];
  tags: readonly string[];
  contents: string;
}>;

export type Model3DRoute = Readonly<{
  id: Model3DRouteId;
  name: string;
  summary: string;
  searchTerms: readonly string[];
  recommendedSourceIds: readonly string[];
  coverage: readonly string[];
}>;

const collection = (id: string, name: string, sourceId: string, url: string, routes: readonly Model3DRouteId[], licenseScope: LicenseScope, tags: readonly string[], contents: string, formats: readonly string[] = ["GLTF", "GLB", "FBX", "OBJ"]): Model3DCollection => ({ id, name, sourceId, url, routes, types: ["3d-models"], licenseScope, formats, tags, contents });

/** Curated entry points, not mirrored files. Item-level licenses still govern every download. */
export const MODEL_3D_COLLECTIONS: readonly Model3DCollection[] = [
  collection("quaternius-medieval", "Ultimate Medieval", "quaternius", "https://quaternius.com/packs/ultimatemedieval.html", ["fantasy", "retro-toon"], "all-cc0", ["medieval", "castle", "village", "weapons"], "Modular castles, villages, siege props, furniture, tools, shields, and weapons."),
  collection("quaternius-monsters", "Ultimate Monsters", "quaternius", "https://quaternius.com/packs/ultimatemonsters.html", ["fantasy", "retro-toon"], "all-cc0", ["creatures", "monsters", "animated", "rpg"], "Rigged fantasy monsters and animation-ready enemies."),
  collection("quaternius-animals", "Ultimate Animals", "quaternius", "https://quaternius.com/packs/ultimateanimals.html", ["realistic", "retro-toon"], "all-cc0", ["animals", "wildlife", "animated"], "A coherent animated animal and wildlife roster."),
  collection("quaternius-vehicles", "Ultimate Vehicles", "quaternius", "https://quaternius.com/packs/ultimatevehicles.html", ["realistic", "retro-toon"], "all-cc0", ["cars", "trucks", "boats", "aircraft"], "Road, construction, emergency, water, and air vehicles."),
  collection("quaternius-spaceships", "Ultimate Spaceships", "quaternius", "https://quaternius.com/packs/ultimatespaceships.html", ["space-modern", "retro-toon"], "all-cc0", ["space", "ships", "modular", "sci-fi"], "Modular spacecraft, stations, weapons, and space props."),
  collection("quaternius-scifi", "Quaternius Sci-Fi Collections", "quaternius", "https://quaternius.com/packs.html", ["space-modern", "retro-toon"], "all-cc0", ["robots", "sci-fi", "weapons", "technology"], "CC0 robots, science-fiction characters, weapons, interiors, and technology props."),
  collection("kaykit-adventurers-3d", "KayKit Adventurers", "kaykit", "https://kaylousberg.itch.io/kaykit-adventurers", ["fantasy", "retro-toon"], "all-cc0", ["heroes", "rigged", "weapons", "rpg"], "Rigged player characters, equipment, and animation-ready fantasy weapons."),
  collection("kaykit-dungeon-3d", "KayKit Dungeon", "kaykit", "https://kaylousberg.itch.io/kaykit-dungeon", ["fantasy", "retro-toon"], "all-cc0", ["dungeon", "modular", "traps", "props"], "Modular rooms, doors, traps, treasure, furniture, and dungeon dressing."),
  collection("kaykit-medieval-hex", "KayKit Medieval Hexagon", "kaykit", "https://kaylousberg.itch.io/kaykit-medieval-builder-pack", ["fantasy", "retro-toon"], "all-cc0", ["medieval", "strategy", "village"], "Modular medieval terrain, buildings, walls, farms, and settlement props."),
  collection("kenney-castle", "Kenney Castle Kit", "kenney", "https://kenney.nl/assets/castle-kit", ["fantasy", "retro-toon"], "all-cc0", ["castle", "medieval", "modular"], "Walls, towers, gates, stairs, flags, and castle construction pieces."),
  collection("kenney-graveyard", "Kenney Graveyard Kit", "kenney", "https://kenney.nl/assets/graveyard-kit", ["fantasy", "retro-toon"], "all-cc0", ["graveyard", "horror", "props"], "Crypts, gravestones, fences, vegetation, and atmospheric props."),
  collection("kenney-blaster-3d", "Kenney Blaster Kit", "kenney", "https://kenney.nl/assets/blaster-kit", ["space-modern", "retro-toon"], "all-cc0", ["guns", "weapons", "animated", "sci-fi"], "Blasters, attachments, targets, crates, projectiles, and animated props."),
  collection("kenney-space-station", "Kenney Modular Space Kit", "kenney", "https://kenney.nl/assets/modular-space-kit", ["space-modern", "retro-toon"], "all-cc0", ["space", "station", "corridors", "animated"], "Modular station rooms, doors, corridors, furniture, and animated components."),
  collection("kenney-car", "Kenney Car Kit", "kenney", "https://kenney.nl/assets/car-kit", ["realistic", "retro-toon"], "all-cc0", ["cars", "traffic", "racing"], "Cars, utility vehicles, color variants, and vehicle debris."),
  collection("kenney-city", "Kenney City Kit Commercial", "kenney", "https://kenney.nl/assets/city-kit-commercial", ["realistic", "retro-toon"], "all-cc0", ["city", "buildings", "roads", "props"], "Modular streets, commercial buildings, signs, and urban props."),
  collection("polyhaven-models", "Poly Haven Models", "poly-haven", "https://polyhaven.com/models", ["realistic", "photoreal"], "all-cc0", ["scanned", "props", "nature", "architecture"], "Curated, textured PBR models with production-ready downloads."),
  collection("polyhaven-materials", "Poly Haven Materials", "poly-haven", "https://polyhaven.com/textures", ["realistic", "photoreal"], "all-cc0", ["pbr", "surface", "normal", "roughness"], "High-resolution tileable PBR surfaces for re-skinning any compatible mesh.", ["PNG", "JPG", "EXR", "SBSAR"]),
  collection("ambientcg-materials", "ambientCG Materials", "ambientcg", "https://ambientcg.com/list?type=Material", ["realistic", "photoreal"], "all-cc0", ["pbr", "surface", "decal", "atlas"], "A large CC0 bank of PBR maps, decals, atlases, and displacement surfaces.", ["PNG", "JPG", "EXR", "SBSAR"]),
  collection("ambientcg-models", "ambientCG Models", "ambientcg", "https://ambientcg.com/list?type=3DModel", ["realistic", "photoreal"], "all-cc0", ["scanned", "realistic", "pbr"], "Photoreal objects delivered with matching PBR textures."),
  collection("smithsonian-natural-history", "Smithsonian Natural History 3D", "smithsonian-open-access", "https://3d.si.edu/collections/openaccesshighlights", ["realistic", "photoreal"], "cc0-filter", ["animals", "fossils", "artifacts", "scan"], "Museum-grade animals, fossils, artifacts, vehicles, and historic-object scans."),
  collection("nasa-spacecraft", "NASA Spacecraft and Rovers", "nasa-3d", "https://nasa3d.arc.nasa.gov/models", ["space-modern", "realistic"], "custom", ["spacecraft", "rover", "satellite", "rocket"], "Authoritative spacecraft, station, rover, satellite, rocket, and planetary models."),
  collection("sketchfab-fantasy-cc0", "Sketchfab Fantasy CC0", "sketchfab-cc0", "https://sketchfab.com/search?features=downloadable&licenses=7c23a1ba438d4306920229c12afcb5f9&q=fantasy&type=models", ["fantasy", "photoreal"], "cc0-filter", ["fantasy", "creatures", "weapons", "environment"], "CC0-filtered long tail for creatures, armor, architecture, weapons, and scanned props."),
  collection("sketchfab-realistic-cc0", "Sketchfab Realistic CC0", "sketchfab-cc0", "https://sketchfab.com/search?features=downloadable&licenses=7c23a1ba438d4306920229c12afcb5f9&q=photogrammetry&type=models", ["realistic", "photoreal"], "cc0-filter", ["photogrammetry", "scans", "objects"], "CC0-filtered photogrammetry and realistic-object search."),
  collection("poly-pizza-animals", "Poly Pizza Animals", "poly-pizza", "https://poly.pizza/search/animals", ["realistic", "retro-toon"], "mixed", ["animals", "wildlife", "low-poly"], "Quickly searchable low-poly animals and creatures."),
  collection("poly-pizza-weapons", "Poly Pizza Weapons", "poly-pizza", "https://poly.pizza/search/weapons", ["fantasy", "space-modern", "retro-toon"], "mixed", ["guns", "swords", "weapons", "low-poly"], "A broad low-poly weapon search spanning swords, firearms, and science fiction."),
  collection("blenderkit-photoreal", "BlenderKit Photoreal Models", "blenderkit", "https://www.blenderkit.com/asset-gallery?query=category_subtree:model", ["realistic", "photoreal"], "mixed", ["photoreal", "furniture", "architecture", "vehicles"], "Production-oriented realistic models, scenes, furniture, vehicles, and architecture."),
  collection("khronos-material-showcase", "Khronos Material Showcase", "khronos-gltf-samples", "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models", ["realistic", "space-modern", "photoreal"], "mixed", ["pbr", "uv", "shader", "reference"], "Reference assets for checking PBR maps, UV transforms, animation, and advanced material behavior."),
];

export const MODEL_3D_ROUTE_GUIDES: readonly Model3DRoute[] = [
  { id: "fantasy", name: "Fantasy & Medieval", summary: "A full RPG construction route from heroes and creatures to castles, dungeons, treasure, weapons, villages, and magical surfaces.", searchTerms: ["medieval", "fantasy creature", "dragon", "armor", "sword", "dungeon", "castle", "village", "magic prop"], recommendedSourceIds: ["quaternius", "kaykit", "kenney", "sketchfab-cc0", "poly-pizza", "ambientcg"], coverage: ["heroes", "NPCs", "creatures", "weapons", "armor", "architecture", "dungeons", "terrain", "props", "materials"] },
  { id: "realistic", name: "Realistic Worlds", summary: "Contemporary and grounded games covering people, wildlife, firearms, road vehicles, tools, buildings, infrastructure, and natural terrain.", searchTerms: ["realistic animal", "car", "truck", "firearm", "urban building", "industrial prop", "forest", "terrain"], recommendedSourceIds: ["poly-haven", "ambientcg", "smithsonian-open-access", "sketchfab-cc0", "blenderkit", "nasa-3d"], coverage: ["animals", "cars", "weapons", "buildings", "roads", "nature", "industrial props", "PBR surfaces", "lighting"] },
  { id: "space-modern", name: "Space, Weapons & Modern Tech", summary: "A science-fiction and modern-action route for spacecraft, stations, firearms, military gear, vehicles, robots, laboratories, and emissive technology.", searchTerms: ["spacecraft", "station", "sci-fi weapon", "gun", "robot", "satellite", "rover", "laboratory", "hologram"], recommendedSourceIds: ["nasa-3d", "kenney", "quaternius", "sketchfab-cc0", "poly-pizza", "khronos-gltf-samples"], coverage: ["spacecraft", "stations", "firearms", "robots", "vehicles", "technology props", "modular interiors", "emissive materials"] },
  { id: "retro-toon", name: "Retro, Low-poly & Toon", summary: "A cohesive path from 1990s/early-2000s 3D through playful low-poly and modern cel-shaded worlds.", searchTerms: ["low poly", "PS1", "N64", "early 3D", "toon", "cartoon", "stylized", "toy"], recommendedSourceIds: ["quaternius", "kaykit", "kenney", "poly-pizza", "opengameart-cc0", "itch-cc0"], coverage: ["characters", "creatures", "vehicles", "architecture", "props", "nearest textures", "toon looks", "retro looks"] },
  { id: "photoreal", name: "Photoreal & Scanned", summary: "High-fidelity objects and surfaces for cinematic shots, virtual production, grounded gameplay, product scenes, and documentary work.", searchTerms: ["photogrammetry", "PBR", "scan", "8K material", "surface", "HDRI", "historic object", "furniture"], recommendedSourceIds: ["poly-haven", "ambientcg", "smithsonian-open-access", "sketchfab-cc0", "blenderkit", "khronos-gltf-samples"], coverage: ["scanned objects", "PBR models", "tileable materials", "decals", "HDRIs", "architecture", "furniture", "natural history"] },
];

export function model3DRoute(id: Model3DRouteId): Model3DRoute {
  const route = MODEL_3D_ROUTE_GUIDES.find((item) => item.id === id);
  if (!route) throw new Error(`Unknown 3D model route: ${String(id)}`);
  return route;
}

export function searchModel3DCollections(options: { route: Model3DRouteId; query?: string; cc0Only?: boolean; limit?: number }): readonly Model3DCollection[] {
  const terms = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) throw new RangeError("3D collection limit must be a positive safe integer.");
  return MODEL_3D_COLLECTIONS.filter((item) => item.routes.includes(options.route) && (!options.cc0Only || item.licenseScope === "all-cc0" || item.licenseScope === "cc0-filter") && terms.every((term) => [item.id, item.name, item.contents, ...item.tags].join(" ").toLowerCase().includes(term))).slice(0, options.limit ?? MODEL_3D_COLLECTIONS.length);
}
