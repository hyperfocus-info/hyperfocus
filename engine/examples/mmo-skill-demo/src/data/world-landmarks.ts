import { factionZoneVisuals, type ClientImageKey } from "./assets.ts";

export type FactionVisualId = keyof typeof factionZoneVisuals;
export type WorldLandmarkKind = "civic" | "craft" | "trade" | "travel" | "shrine" | "danger" | "wild" | "resource" | "dock" | "archive" | "camp";

export type WorldLandmarkPlacement = {
  anchorId: string;
  image: ClientImageKey;
  visualId: FactionVisualId;
  dx: number;
  dy: number;
  width: number;
  height: number;
  alpha?: number;
  shadow?: string;
  kind?: WorldLandmarkKind;
  service?: string;
  glyph?: string;
  platform?: "ellipse" | "rect" | "none";
  tint?: string;
  tintAlpha?: number;
};

export type ResolvedWorldLandmark = WorldLandmarkPlacement & {
  id: string;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
};

export type BiomeProp = {
  image: ClientImageKey;
  width: number;
  height: number;
  y: number;
  every: number;
  alpha?: number;
};

export type WorldAreaCaptureAnchor = {
  id: string;
  label: string;
  visualId: FactionVisualId;
};

export const worldAreaCaptureAnchors = [
  { id: "oakhaven", label: "Oakhaven", visualId: "oakhaven" },
  { id: "overgrown-thicket", label: "Overgrown Thicket", visualId: "oakhaven" },
  { id: "ashwood-glade", label: "Ashwood Glade", visualId: "ashwood-glade" },
  { id: "ironcrag", label: "Ironcrag", visualId: "ironcrag" },
  { id: "deep-fissure", label: "Deep Fissure", visualId: "ironcrag" },
  { id: "aetheria", label: "Aetheria", visualId: "aetheria" },
  { id: "high-reach-peaks", label: "High-Reach Peaks", visualId: "high-reach-peaks" },
  { id: "port-marrow", label: "Port Marrow", visualId: "port-marrow" },
  { id: "sunken-bazaar", label: "Sunken Bazaar", visualId: "sunken-bazaar" },
  { id: "sunken-spire", label: "Sunken Spire", visualId: "sunken-bazaar" },
  { id: "void-rift", label: "Void Rift", visualId: "obsidian-sanctum" },
  { id: "obsidian-sanctum", label: "Obsidian Sanctum", visualId: "obsidian-sanctum" }
] as const satisfies readonly WorldAreaCaptureAnchor[];

export const worldLandmarkPlacements: readonly WorldLandmarkPlacement[] = [
  { anchorId: "oakhaven", image: "worldForestMegaTree", visualId: "oakhaven", dx: -78, dy: -148, width: 164, height: 164, kind: "civic", glyph: "O" },
  { anchorId: "oakhaven", image: "worldForestLivingGazebo", visualId: "oakhaven", dx: 14, dy: -70, width: 90, height: 90, kind: "civic", service: "elder council", glyph: "E" },
  { anchorId: "oakhaven", image: "worldForestLuminousTree", visualId: "oakhaven", dx: -102, dy: -48, width: 82, height: 82, kind: "shrine", service: "nature core", glyph: "N" },
  { anchorId: "oakhaven", image: "worldForestSwirlingTree", visualId: "oakhaven", dx: 86, dy: -134, width: 76, height: 76, kind: "shrine", service: "root rite grove", glyph: "G" },
  { anchorId: "oakhaven", image: "worldForestDeerIdol", visualId: "oakhaven", dx: -176, dy: -50, width: 62, height: 62, kind: "shrine", service: "elder path oath", glyph: "P" },
  { anchorId: "oakhaven", image: "worldForestLivingGazebo", visualId: "oakhaven", dx: -150, dy: 18, width: 70, height: 70, kind: "trade", service: "miller provisions", glyph: "M" },
  { anchorId: "oakhaven", image: "worldForestRedMushroom", visualId: "oakhaven", dx: -102, dy: 78, width: 36, height: 36, kind: "trade", service: "forage stall", glyph: "$" },
  { anchorId: "oakhaven", image: "worldVillageFence", visualId: "oakhaven", dx: -220, dy: 72, width: 126, height: 94, alpha: 0.88, kind: "danger", service: "woven living fence", glyph: "!" },
  { anchorId: "oakhaven", image: "worldVillageGate", visualId: "oakhaven", dx: 178, dy: -38, width: 54, height: 82, alpha: 0.9, kind: "travel", service: "root gate watch", glyph: "T" },
  { anchorId: "oakhaven", image: "worldVillageWell", visualId: "oakhaven", dx: -34, dy: 96, width: 58, height: 58, alpha: 0.92, kind: "resource", service: "packed town well", glyph: "W" },
  { anchorId: "oakhaven", image: "worldVillageSignpost", visualId: "oakhaven", dx: 176, dy: 48, width: 56, height: 84, alpha: 0.9, kind: "travel", service: "border patrol sign", glyph: "T" },
  { anchorId: "oakhaven", image: "worldVillageGuardStall", visualId: "oakhaven", dx: 38, dy: 92, width: 112, height: 56, alpha: 0.9, kind: "trade", service: "scout provision cart", glyph: "$" },
  { anchorId: "oakhaven", image: "worldForestLuminousTree", visualId: "oakhaven", dx: 896, dy: -70, width: 58, height: 58, kind: "archive", service: "east rootway scout marker", glyph: "R" },
  { anchorId: "oakhaven", image: "worldForestLivingGazebo", visualId: "oakhaven", dx: 118, dy: 18, width: 58, height: 58, kind: "craft", service: "softwood loom", glyph: "C" },
  { anchorId: "oakhaven", image: "worldForestEntMan", visualId: "oakhaven", dx: 1120, dy: 48, width: 56, height: 56, alpha: 0.88, kind: "wild", service: "outer living ward", glyph: "W" },
  { anchorId: "oakhaven", image: "worldForestMossTree", visualId: "oakhaven", dx: 1408, dy: 42, width: 64, height: 64, alpha: 0.88, kind: "wild", service: "east moss border", glyph: "W" },
  { anchorId: "oakhaven", image: "worldVillageSignpost", visualId: "oakhaven", dx: 1792, dy: 60, width: 44, height: 66, alpha: 0.82, kind: "travel", service: "safe-road warning post", glyph: "T" },
  { anchorId: "oakhaven", image: "worldForestBurnedTree", visualId: "oakhaven", dx: 2048, dy: -18, width: 68, height: 68, alpha: 0.82, kind: "danger", service: "old wolf-free burn line", glyph: "!" },

  { anchorId: "ashwood-glade", image: "worldForestMegaTree", visualId: "ashwood-glade", dx: -94, dy: -150, width: 180, height: 180, kind: "wild", glyph: "W" },
  { anchorId: "ashwood-glade", image: "worldForestDragonIdol", visualId: "ashwood-glade", dx: 18, dy: -76, width: 86, height: 86, kind: "shrine", service: "blood rites", glyph: "B" },
  { anchorId: "ashwood-glade", image: "worldForestWolfIdol", visualId: "ashwood-glade", dx: 72, dy: -22, width: 64, height: 64, kind: "danger", service: "pack law", glyph: "!" },
  { anchorId: "ashwood-glade", image: "worldForestRedMushroom", visualId: "ashwood-glade", dx: -34, dy: 22, width: 34, height: 34, kind: "resource", glyph: "F" },
  { anchorId: "ashwood-glade", image: "worldForestWolfIdol", visualId: "ashwood-glade", dx: -152, dy: -16, width: 60, height: 60, kind: "danger", service: "hunt boundary", glyph: "!" },
  { anchorId: "ashwood-glade", image: "worldForestLuminousTree", visualId: "ashwood-glade", dx: 110, dy: -122, width: 88, height: 88, kind: "shrine", service: "planet call", glyph: "S" },
  { anchorId: "ashwood-glade", image: "worldForestEntMan", visualId: "ashwood-glade", dx: -188, dy: 48, width: 74, height: 74, alpha: 0.9, kind: "wild", service: "timber goliath sign", glyph: "T" },
  { anchorId: "ashwood-glade", image: "worldForestSwirlingTree", visualId: "ashwood-glade", dx: 152, dy: 40, width: 74, height: 74, alpha: 0.9, kind: "wild", service: "thorn camp edge", glyph: "C" },
  { anchorId: "ashwood-glade", image: "worldForestRedMushroom", visualId: "ashwood-glade", dx: 96, dy: 58, width: 40, height: 40, kind: "trade", service: "hunter camp", glyph: "$" },
  { anchorId: "ashwood-glade", image: "worldForestBurnedTree", visualId: "ashwood-glade", dx: -232, dy: -92, width: 70, height: 70, alpha: 0.9, kind: "danger", service: "burned territory mark", glyph: "!" },
  { anchorId: "ashwood-glade", image: "worldVillageFence", visualId: "ashwood-glade", dx: -248, dy: 112, width: 132, height: 99, alpha: 0.82, kind: "danger", service: "bone-lashed thorn fence", glyph: "!" },
  { anchorId: "ashwood-glade", image: "worldVillageGate", visualId: "ashwood-glade", dx: 214, dy: -10, width: 52, height: 78, alpha: 0.86, kind: "travel", service: "hunter border gate", glyph: "T" },
  { anchorId: "ashwood-glade", image: "worldVillageGuardStall", visualId: "ashwood-glade", dx: -18, dy: 92, width: 108, height: 54, alpha: 0.84, kind: "trade", service: "packed meat cart", glyph: "$" },
  { anchorId: "ashwood-glade", image: "worldForestMossTree", visualId: "ashwood-glade", dx: 360, dy: 96, width: 72, height: 72, alpha: 0.86, kind: "wild", service: "gatherable moss hazard edge", glyph: "R" },
  { anchorId: "ashwood-glade", image: "worldForestWolfIdol", visualId: "ashwood-glade", dx: 560, dy: -62, width: 58, height: 58, alpha: 0.86, kind: "danger", service: "outer pack warning", glyph: "!" },

  { anchorId: "ironcrag", image: "worldGuildExterior", visualId: "ironcrag", dx: -118, dy: -82, width: 236, height: 76, kind: "civic", glyph: "I" },
  { anchorId: "ironcrag", image: "worldGuildCracks", visualId: "ironcrag", dx: -78, dy: -32, width: 156, height: 122, alpha: 0.58, kind: "resource", glyph: "H" },
  { anchorId: "ironcrag", image: "worldGuildFlags", visualId: "ironcrag", dx: -150, dy: -116, width: 26, height: 156, alpha: 0.92, kind: "civic", service: "foreman banners", glyph: "Q", platform: "none" },
  { anchorId: "ironcrag", image: "worldGuildWindowsDoors", visualId: "ironcrag", dx: 8, dy: -120, width: 96, height: 96, alpha: 0.86, kind: "civic", service: "blast gate", glyph: "G" },
  { anchorId: "ironcrag", image: "worldGuildFire", visualId: "ironcrag", dx: -66, dy: -98, width: 132, height: 16, alpha: 0.94, kind: "craft", service: "furnace row", glyph: "F", platform: "none" },
  { anchorId: "ironcrag", image: "worldCrystalYellow1", visualId: "ironcrag", dx: 62, dy: -18, width: 42, height: 42, kind: "resource", service: "prism seam", glyph: "G" },
  { anchorId: "ironcrag", image: "worldGuildInteriorObjects", visualId: "ironcrag", dx: 104, dy: 12, width: 96, height: 96, kind: "craft", service: "blacksmith yard", glyph: "F" },
  { anchorId: "ironcrag", image: "worldGuildExterior", visualId: "ironcrag", dx: -202, dy: 4, width: 124, height: 40, kind: "trade", service: "quota office", glyph: "$" },
  { anchorId: "ironcrag", image: "worldCrystalYellow1", visualId: "ironcrag", dx: -132, dy: -94, width: 48, height: 48, kind: "archive", service: "geologist claim", glyph: "M" },
  { anchorId: "ironcrag", image: "worldGuildCracks", visualId: "ironcrag", dx: 134, dy: -82, width: 92, height: 72, alpha: 0.44, kind: "danger", service: "heat vent", glyph: "!" },
  { anchorId: "ironcrag", image: "worldCragRockyCave", visualId: "ironcrag", dx: -262, dy: 66, width: 76, height: 76, alpha: 0.9, kind: "danger", service: "old mine mouth", glyph: "!" },
  { anchorId: "ironcrag", image: "worldVillageStoneBarrier", visualId: "ironcrag", dx: -286, dy: -38, width: 188, height: 54, alpha: 0.9, kind: "danger", service: "slag-stone blast wall", glyph: "!" },
  { anchorId: "ironcrag", image: "worldVillageGate", visualId: "ironcrag", dx: 214, dy: -24, width: 54, height: 82, alpha: 0.9, kind: "travel", service: "ore-yard guard gate", glyph: "T" },
  { anchorId: "ironcrag", image: "worldVillageSignpost", visualId: "ironcrag", dx: -34, dy: 88, width: 52, height: 78, alpha: 0.9, kind: "archive", service: "quota warning board", glyph: "Q" },
  { anchorId: "ironcrag", image: "worldVillageGuardStall", visualId: "ironcrag", dx: 22, dy: 94, width: 112, height: 56, alpha: 0.88, kind: "trade", service: "packed fuel cart", glyph: "$" },
  { anchorId: "deep-fissure", image: "worldVillageStoneBarrier", visualId: "ironcrag", dx: -280, dy: -88, width: 164, height: 47, alpha: 0.82, kind: "danger", service: "overflow camp barrier", glyph: "!" },

  { anchorId: "aetheria", image: "worldHolyChapelExterior", visualId: "aetheria", dx: -74, dy: -154, width: 150, height: 178, kind: "civic", glyph: "A" },
  { anchorId: "aetheria", image: "worldHolyStatues", visualId: "aetheria", dx: -86, dy: 14, width: 172, height: 41, kind: "shrine", glyph: "+" },
  { anchorId: "aetheria", image: "worldHolyAltar", visualId: "aetheria", dx: -96, dy: -72, width: 136, height: 24, alpha: 0.95, kind: "shrine", service: "radiant altar", glyph: "+", platform: "none" },
  { anchorId: "aetheria", image: "worldHolyCandelabra", visualId: "aetheria", dx: 74, dy: -72, width: 92, height: 31, alpha: 0.9, kind: "shrine", service: "purity lamps", glyph: "L", platform: "none" },
  { anchorId: "aetheria", image: "worldHolyDragonBody", visualId: "aetheria", dx: -172, dy: -78, width: 98, height: 65, alpha: 0.9, kind: "danger", service: "law monument", glyph: "!" },
  { anchorId: "aetheria", image: "worldHolyInteriorObjects", visualId: "aetheria", dx: 58, dy: -34, width: 84, height: 44, kind: "archive", service: "holy archive", glyph: "R" },
  { anchorId: "aetheria", image: "worldHolyInteriorObjects", visualId: "aetheria", dx: -158, dy: -18, width: 92, height: 48, kind: "trade", service: "tithe stall", glyph: "$" },
  { anchorId: "aetheria", image: "worldCrystalBlue1", visualId: "aetheria", dx: 126, dy: 22, width: 46, height: 46, kind: "shrine", service: "radiant ward", glyph: "W" },
  { anchorId: "aetheria", image: "worldRuinsWhite3", visualId: "aetheria", dx: 166, dy: -28, width: 58, height: 58, alpha: 0.9, kind: "archive", service: "law plinth", glyph: "R" },
  { anchorId: "aetheria", image: "worldHolyStatues", visualId: "aetheria", dx: 104, dy: -82, width: 138, height: 33, alpha: 0.84, kind: "danger", service: "purifier gate", glyph: "!" },
  { anchorId: "aetheria", image: "worldVillageStoneBarrier", visualId: "aetheria", dx: -244, dy: 54, width: 190, height: 54, alpha: 0.82, kind: "danger", service: "radiant toll wall", glyph: "!" },
  { anchorId: "aetheria", image: "worldVillageGate", visualId: "aetheria", dx: 218, dy: 34, width: 52, height: 78, alpha: 0.84, kind: "travel", service: "citadel inspection gate", glyph: "T" },
  { anchorId: "aetheria", image: "worldVillageSignpost", visualId: "aetheria", dx: -36, dy: 74, width: 52, height: 78, alpha: 0.86, kind: "archive", service: "code notice board", glyph: "R" },
  { anchorId: "aetheria", image: "worldVillageGuardStall", visualId: "aetheria", dx: 32, dy: 84, width: 112, height: 56, alpha: 0.82, kind: "trade", service: "tithe ledger cart", glyph: "$" },
  { anchorId: "aetheria", image: "worldVillageStoneBarrier", visualId: "aetheria", dx: -896, dy: 88, width: 160, height: 46, alpha: 0.78, kind: "danger", service: "port-road contraband check", glyph: "!" },

  { anchorId: "port-marrow", image: "worldPortBuildingLarge", visualId: "port-marrow", dx: -92, dy: -62, width: 184, height: 79, kind: "trade", service: "dock market", glyph: "$" },
  { anchorId: "port-marrow", image: "worldPortShipyardBuilding", visualId: "port-marrow", dx: 96, dy: -72, width: 152, height: 65, alpha: 0.92, kind: "dock", service: "salvaged hull house", glyph: "H" },
  { anchorId: "port-marrow", image: "worldPortTower", visualId: "port-marrow", dx: 44, dy: -18, width: 72, height: 36, kind: "travel", service: "harbor watch", glyph: "T" },
  { anchorId: "port-marrow", image: "worldPortCraneTower", visualId: "port-marrow", dx: -212, dy: -70, width: 88, height: 44, alpha: 0.94, kind: "travel", service: "cargo crane", glyph: "C" },
  { anchorId: "port-marrow", image: "worldPortWaterTiles", visualId: "port-marrow", dx: -112, dy: 16, width: 92, height: 136, alpha: 0.7, kind: "dock", glyph: "~" },
  { anchorId: "port-marrow", image: "worldPortWaterTiles", visualId: "port-marrow", dx: 24, dy: 36, width: 68, height: 106, alpha: 0.58, kind: "dock", service: "lower boardwalk", glyph: "~" },
  { anchorId: "port-marrow", image: "worldPortBuildingLarge", visualId: "port-marrow", dx: 104, dy: 20, width: 118, height: 50, kind: "craft", service: "black-market broker", glyph: "B" },
  { anchorId: "port-marrow", image: "worldPortTower", visualId: "port-marrow", dx: -164, dy: -28, width: 74, height: 37, kind: "travel", service: "navigator kiosk", glyph: "N" },
  { anchorId: "port-marrow", image: "worldDesertMarketDecor", visualId: "port-marrow", dx: -172, dy: 58, width: 118, height: 60, alpha: 0.88, kind: "trade", service: "smuggler table", glyph: "$" },
  { anchorId: "port-marrow", image: "worldPortCargoDetail", visualId: "port-marrow", dx: 226, dy: 4, width: 54, height: 45, alpha: 0.98, kind: "trade", service: "cargo pile", glyph: "$" },
  { anchorId: "port-marrow", image: "worldVillageFence", visualId: "port-marrow", dx: -252, dy: 84, width: 128, height: 96, alpha: 0.8, kind: "danger", service: "saltwood dock fence", glyph: "!" },
  { anchorId: "port-marrow", image: "worldVillageGate", visualId: "port-marrow", dx: 252, dy: 58, width: 50, height: 75, alpha: 0.82, kind: "travel", service: "oath gate", glyph: "T" },
  { anchorId: "port-marrow", image: "worldVillageSignpost", visualId: "port-marrow", dx: 8, dy: 104, width: 50, height: 75, alpha: 0.86, kind: "travel", service: "tide route sign", glyph: "T" },
  { anchorId: "port-marrow", image: "worldVillageGuardStall", visualId: "port-marrow", dx: 118, dy: 92, width: 112, height: 56, alpha: 0.86, kind: "trade", service: "packed salvage cart", glyph: "$" },
  { anchorId: "port-marrow", image: "worldPortCargoDetail", visualId: "port-marrow", dx: 1536, dy: 70, width: 48, height: 40, alpha: 0.86, kind: "trade", service: "bazaar-route cargo spill", glyph: "$" },

  { anchorId: "sunken-bazaar", image: "worldDesertBuilding1", visualId: "sunken-bazaar", dx: -94, dy: -112, width: 188, height: 185, kind: "civic", glyph: "$" },
  { anchorId: "sunken-bazaar", image: "worldDesertVaultBuilding", visualId: "sunken-bazaar", dx: 76, dy: -138, width: 126, height: 158, alpha: 0.94, kind: "trade", service: "subterranean vault", glyph: "V" },
  { anchorId: "sunken-bazaar", image: "worldDesertMarketDecor", visualId: "sunken-bazaar", dx: -100, dy: 36, width: 190, height: 96, kind: "trade", service: "market stalls", glyph: "$" },
  { anchorId: "sunken-bazaar", image: "worldRuinsSand1", visualId: "sunken-bazaar", dx: 68, dy: -34, width: 54, height: 54, kind: "archive", service: "appraiser table", glyph: "A" },
  { anchorId: "sunken-bazaar", image: "worldDesertPalm", visualId: "sunken-bazaar", dx: -116, dy: -72, width: 50, height: 92, kind: "resource", glyph: "W" },
  { anchorId: "sunken-bazaar", image: "worldDesertBuilding3", visualId: "sunken-bazaar", dx: 118, dy: -92, width: 74, height: 120, kind: "trade", service: "debt booth", glyph: "D" },
  { anchorId: "sunken-bazaar", image: "worldDesertScaleDecor", visualId: "sunken-bazaar", dx: -206, dy: -22, width: 72, height: 78, alpha: 0.94, kind: "trade", service: "golden scales", glyph: "=" },
  { anchorId: "sunken-bazaar", image: "worldDesertCactusCluster", visualId: "sunken-bazaar", dx: 194, dy: 46, width: 58, height: 54, alpha: 0.94, kind: "resource", service: "well edge", glyph: "W" },
  { anchorId: "sunken-bazaar", image: "worldCrystalYellow1", visualId: "sunken-bazaar", dx: -156, dy: 34, width: 42, height: 42, kind: "resource", service: "relic scale", glyph: "R" },
  { anchorId: "sunken-bazaar", image: "worldRuinsYellow2", visualId: "sunken-bazaar", dx: 104, dy: 62, width: 64, height: 64, kind: "danger", service: "blocked vault", glyph: "!" },
  { anchorId: "sunken-bazaar", image: "worldDesertNewPalm", visualId: "sunken-bazaar", dx: 2160, dy: -96, width: 62, height: 62, alpha: 0.88, kind: "resource", service: "void-road shade grove", glyph: "W" },
  { anchorId: "sunken-bazaar", image: "worldVillageWell", visualId: "sunken-bazaar", dx: -236, dy: 70, width: 58, height: 58, alpha: 0.92, kind: "resource", service: "packed market well", glyph: "W" },
  { anchorId: "sunken-bazaar", image: "worldVillageFence", visualId: "sunken-bazaar", dx: 206, dy: 84, width: 128, height: 96, alpha: 0.78, kind: "danger", service: "contract fence line", glyph: "!" },
  { anchorId: "sunken-bazaar", image: "worldVillageGate", visualId: "sunken-bazaar", dx: -16, dy: 110, width: 50, height: 75, alpha: 0.82, kind: "travel", service: "caravan toll gate", glyph: "T" },
  { anchorId: "sunken-bazaar", image: "worldVillageSignpost", visualId: "sunken-bazaar", dx: 44, dy: 116, width: 50, height: 75, alpha: 0.86, kind: "archive", service: "debt notice board", glyph: "D" },
  { anchorId: "sunken-bazaar", image: "worldVillageGuardStall", visualId: "sunken-bazaar", dx: -80, dy: 122, width: 112, height: 56, alpha: 0.84, kind: "trade", service: "appraisal overflow cart", glyph: "$" },
  { anchorId: "sunken-bazaar", image: "worldVillageRoadPatch", visualId: "sunken-bazaar", dx: 2560, dy: 70, width: 136, height: 113, alpha: 0.44, kind: "travel", service: "sand-skimmer rutted road", glyph: "T", platform: "none" },

  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianCaveEntrance", visualId: "obsidian-sanctum", dx: -108, dy: -108, width: 212, height: 186, kind: "civic", glyph: "V" },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianCell", visualId: "obsidian-sanctum", dx: -204, dy: -82, width: 118, height: 144, alpha: 0.94, kind: "civic", service: "obsidian cell", glyph: "C" },
  { anchorId: "obsidian-sanctum", image: "worldVoidWoodFloorHorizontal", visualId: "obsidian-sanctum", dx: -50, dy: 44, width: 132, height: 72, alpha: 0.76, kind: "civic", service: "ritual floor", glyph: "R", tint: "rgba(41, 18, 68, 0.58)", tintAlpha: 0.25 },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianTower", visualId: "obsidian-sanctum", dx: 36, dy: -136, width: 144, height: 126, kind: "shrine", service: "hive tower", glyph: "H" },
  { anchorId: "obsidian-sanctum", image: "worldVoidSkeleton", visualId: "obsidian-sanctum", dx: -126, dy: 28, width: 92, height: 69, kind: "danger", service: "cursed bargain", glyph: "!", tint: "rgba(63, 21, 88, 0.5)", tintAlpha: 0.16 },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 96, dy: 14, width: 48, height: 54, kind: "trade", service: "zora elixirs", glyph: "$" },
  { anchorId: "obsidian-sanctum", image: "worldCrystalViolet1", visualId: "obsidian-sanctum", dx: -22, dy: 64, width: 46, height: 46, kind: "resource", service: "void tear", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidRafflesia", visualId: "obsidian-sanctum", dx: 140, dy: 64, width: 68, height: 54, kind: "craft", service: "transmutation bed", glyph: "C" },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianBoulder", visualId: "obsidian-sanctum", dx: 164, dy: -6, width: 94, height: 68, alpha: 0.8, kind: "danger", service: "gravity stone", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidMagicCircle", visualId: "obsidian-sanctum", dx: -98, dy: 96, width: 66, height: 66, alpha: 0.88, kind: "shrine", service: "rift rite", glyph: "V" },
  { anchorId: "obsidian-sanctum", image: "worldVoidEyePlant", visualId: "obsidian-sanctum", dx: 218, dy: 62, width: 46, height: 46, alpha: 0.9, kind: "danger", service: "watching growth", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVillageStoneBarrier", visualId: "obsidian-sanctum", dx: -286, dy: 72, width: 182, height: 52, alpha: 0.74, kind: "danger", service: "obsidian pressure wall", glyph: "!", tint: "rgba(63, 21, 88, 0.62)", tintAlpha: 0.24 },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianBoulder", visualId: "obsidian-sanctum", dx: 284, dy: 34, width: 92, height: 66, alpha: 0.78, kind: "danger", service: "gravity perimeter stones", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidDangerSign", visualId: "obsidian-sanctum", dx: 18, dy: 132, width: 50, height: 50, alpha: 0.84, kind: "danger", service: "town edge warning", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: -18, dy: 142, width: 40, height: 45, alpha: 0.82, kind: "travel", service: "sanctum gate lantern", glyph: "T" },
  { anchorId: "obsidian-sanctum", image: "worldVoidRafflesia", visualId: "obsidian-sanctum", dx: 410, dy: 92, width: 66, height: 52, alpha: 0.78, kind: "danger", service: "rot moat bloom", glyph: "!" },

  { anchorId: "high-reach-peaks", image: "worldCrystalBlue1", visualId: "high-reach-peaks", dx: -66, dy: -44, width: 54, height: 54, kind: "resource", glyph: "^" },
  { anchorId: "high-reach-peaks", image: "worldRuinsBlueGray1", visualId: "high-reach-peaks", dx: -86, dy: -134, width: 102, height: 116, alpha: 0.9, kind: "civic", service: "upper temple", glyph: "^" },
  { anchorId: "high-reach-peaks", image: "worldRuinsWhite3", visualId: "high-reach-peaks", dx: 10, dy: -124, width: 74, height: 74, alpha: 0.9, kind: "civic", service: "wind gate", glyph: "T" },
  { anchorId: "high-reach-peaks", image: "worldForestWhiteTree", visualId: "high-reach-peaks", dx: -172, dy: -104, width: 72, height: 72, alpha: 0.86, kind: "shrine", service: "cloud moss grove", glyph: "M" },
  { anchorId: "high-reach-peaks", image: "worldHolyStatues", visualId: "high-reach-peaks", dx: -88, dy: 28, width: 176, height: 42, alpha: 0.82, kind: "shrine", service: "meditation court", glyph: "M" },
  { anchorId: "high-reach-peaks", image: "worldRuinsBlueGray1", visualId: "high-reach-peaks", dx: 48, dy: -28, width: 58, height: 66, kind: "archive", service: "sky archive", glyph: "A" },
  { anchorId: "high-reach-peaks", image: "worldRuinsBlueGray1", visualId: "high-reach-peaks", dx: 92, dy: -94, width: 72, height: 82, alpha: 0.82, kind: "archive", service: "wind library", glyph: "J" },
  { anchorId: "high-reach-peaks", image: "worldCrystalBlue1", visualId: "high-reach-peaks", dx: 126, dy: 28, width: 38, height: 38, kind: "travel", service: "wind leap", glyph: "T" },
  { anchorId: "high-reach-peaks", image: "worldRuinsBlueGray1", visualId: "high-reach-peaks", dx: -154, dy: -26, width: 46, height: 52, kind: "craft", service: "sage tea stall", glyph: "$" },
  { anchorId: "high-reach-peaks", image: "worldRuinsBlueGray5", visualId: "high-reach-peaks", dx: 3700, dy: -18, width: 46, height: 46, alpha: 0.92, kind: "travel", service: "eastern cliff step", glyph: "^" },
  { anchorId: "high-reach-peaks", image: "worldVillageStoneBarrier", visualId: "high-reach-peaks", dx: -230, dy: 74, width: 176, height: 50, alpha: 0.76, kind: "danger", service: "low-step stone barrier", glyph: "!" },
  { anchorId: "high-reach-peaks", image: "worldVillageGate", visualId: "high-reach-peaks", dx: 196, dy: 46, width: 50, height: 75, alpha: 0.78, kind: "travel", service: "wind trial gate", glyph: "T" },
  { anchorId: "high-reach-peaks", image: "worldVillageSignpost", visualId: "high-reach-peaks", dx: -16, dy: 92, width: 48, height: 72, alpha: 0.82, kind: "archive", service: "breath-form board", glyph: "R" },
  { anchorId: "high-reach-peaks", image: "worldVillageGuardStall", visualId: "high-reach-peaks", dx: 58, dy: 92, width: 108, height: 54, alpha: 0.78, kind: "trade", service: "packed tea cart", glyph: "$" },
  { anchorId: "high-reach-peaks", image: "worldCrystalBlue1", visualId: "high-reach-peaks", dx: 4096, dy: 76, width: 38, height: 38, alpha: 0.84, kind: "resource", service: "outer updraft crystal", glyph: "R" },
  { anchorId: "high-reach-peaks", image: "worldRuinsWhite3", visualId: "high-reach-peaks", dx: 7936, dy: -38, width: 70, height: 70, alpha: 0.78, kind: "travel", service: "glider aery edge", glyph: "T" },
  { anchorId: "high-reach-peaks", image: "worldCrystalBlue1", visualId: "high-reach-peaks", dx: 8192, dy: 82, width: 40, height: 40, alpha: 0.78, kind: "resource", service: "thermal proof crystal", glyph: "R" },
  { anchorId: "high-reach-peaks", image: "worldForestWhiteTree", visualId: "high-reach-peaks", dx: 8448, dy: 28, width: 60, height: 60, alpha: 0.72, kind: "shrine", service: "quiet landing grove", glyph: "M" },

  { anchorId: "sunken-spire", image: "worldRuinsBlueGray1", visualId: "sunken-bazaar", dx: -58, dy: -44, width: 76, height: 86, kind: "danger", glyph: "S" },
  { anchorId: "sunken-spire", image: "worldCrystalBlue1", visualId: "sunken-bazaar", dx: 24, dy: 2, width: 48, height: 48, kind: "resource", service: "mirror shard", glyph: "R" },
  { anchorId: "sunken-spire", image: "worldDesertMarketDecor", visualId: "sunken-bazaar", dx: -146, dy: 36, width: 116, height: 58, kind: "trade", service: "relic salvage", glyph: "$" },
  { anchorId: "sunken-spire", image: "worldRuinsYellow2", visualId: "sunken-bazaar", dx: 700, dy: -58, width: 62, height: 62, kind: "archive", service: "outer vault seal", glyph: "V" },
  { anchorId: "sunken-spire", image: "worldRuinsYellow5", visualId: "sunken-bazaar", dx: 8, dy: -76, width: 44, height: 44, alpha: 0.92, kind: "archive", service: "seal fragment", glyph: "V" },
  { anchorId: "sunken-spire", image: "worldDesertScaleDecor", visualId: "sunken-bazaar", dx: 784, dy: 24, width: 56, height: 61, alpha: 0.9, kind: "trade", service: "void-edge debt scale", glyph: "=" },

  { anchorId: "void-rift", image: "worldCrystalViolet1", visualId: "obsidian-sanctum", dx: -62, dy: -30, width: 64, height: 64, kind: "resource", glyph: "R" },
  { anchorId: "void-rift", image: "worldVoidRafflesia", visualId: "obsidian-sanctum", dx: 26, dy: -18, width: 70, height: 56, kind: "danger", service: "rift bloom", glyph: "!" },
  { anchorId: "void-rift", image: "worldVoidBrokenBoat", visualId: "obsidian-sanctum", dx: -12, dy: 34, width: 86, height: 103, kind: "danger", service: "failed crossing", glyph: "X", tint: "rgba(64, 19, 88, 0.44)", tintAlpha: 0.18 },
  { anchorId: "void-rift", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 108, dy: 24, width: 44, height: 50, kind: "travel", service: "portal waymark", glyph: "T" },
  { anchorId: "void-rift", image: "worldVoidDangerSign", visualId: "obsidian-sanctum", dx: -124, dy: 44, width: 54, height: 54, alpha: 0.9, kind: "danger", service: "void warning", glyph: "!" },
  { anchorId: "void-rift", image: "worldVoidBoulder3", visualId: "obsidian-sanctum", dx: 68, dy: -86, width: 86, height: 61, alpha: 0.78, kind: "danger", service: "rift debris", glyph: "!", tint: "rgba(58, 18, 86, 0.5)", tintAlpha: 0.18 },
  { anchorId: "void-rift", image: "worldVoidDragonBones", visualId: "obsidian-sanctum", dx: -202, dy: -96, width: 126, height: 126, alpha: 0.82, kind: "danger", service: "failed titan crossing", glyph: "X", tint: "rgba(64, 19, 88, 0.4)", tintAlpha: 0.14 },
  { anchorId: "void-rift", image: "worldVoidMagicCircle", visualId: "obsidian-sanctum", dx: 150, dy: -62, width: 56, height: 56, alpha: 0.78, kind: "travel", service: "unstable rite", glyph: "V" },
  { anchorId: "void-rift", image: "worldVillageStoneBarrier", visualId: "obsidian-sanctum", dx: -420, dy: 96, width: 150, height: 43, alpha: 0.66, kind: "danger", service: "failed shelter stones", glyph: "!", tint: "rgba(63, 21, 88, 0.62)", tintAlpha: 0.24 },
  { anchorId: "void-rift", image: "worldVoidEyePlant", visualId: "obsidian-sanctum", dx: 420, dy: 78, width: 44, height: 44, alpha: 0.78, kind: "resource", service: "volatile gatherable eye", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 768, dy: 74, width: 42, height: 48, alpha: 0.84, kind: "travel", service: "near rift waymark", glyph: "T" },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianBoulder", visualId: "obsidian-sanctum", dx: 1408, dy: 28, width: 78, height: 56, alpha: 0.72, kind: "danger", service: "first gravity cairn", glyph: "!", tint: "rgba(58, 18, 86, 0.5)", tintAlpha: 0.18 },
  { anchorId: "obsidian-sanctum", image: "worldVoidEyePlant", visualId: "obsidian-sanctum", dx: 2048, dy: 112, width: 42, height: 42, alpha: 0.74, kind: "resource", service: "first eye-grove sample", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidBrokenBoat", visualId: "obsidian-sanctum", dx: 3008, dy: 78, width: 82, height: 98, alpha: 0.74, kind: "danger", service: "near failed crossing", glyph: "X", tint: "rgba(64, 19, 88, 0.44)", tintAlpha: 0.18 },
  { anchorId: "obsidian-sanctum", image: "worldVoidDangerSign", visualId: "obsidian-sanctum", dx: 3840, dy: 40, width: 50, height: 50, alpha: 0.76, kind: "danger", service: "first pressure warning", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidSpikePlant", visualId: "obsidian-sanctum", dx: 4608, dy: 96, width: 58, height: 54, alpha: 0.76, kind: "danger", service: "near rot bloom", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 5888, dy: 72, width: 44, height: 50, alpha: 0.88, kind: "travel", service: "far rift waymark", glyph: "T" },
  { anchorId: "obsidian-sanctum", image: "worldVoidBrokenBoat", visualId: "obsidian-sanctum", dx: 6400, dy: 112, width: 86, height: 103, alpha: 0.82, kind: "danger", service: "failed far crossing", glyph: "X", tint: "rgba(64, 19, 88, 0.44)", tintAlpha: 0.18 },
  { anchorId: "obsidian-sanctum", image: "worldVoidJawsPlant", visualId: "obsidian-sanctum", dx: 6912, dy: 56, width: 64, height: 58, alpha: 0.82, kind: "danger", service: "far rift bloom", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidEyePlant", visualId: "obsidian-sanctum", dx: 7552, dy: 108, width: 42, height: 42, alpha: 0.72, kind: "resource", service: "far eye-growth sample", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVillageStoneBarrier", visualId: "obsidian-sanctum", dx: 7936, dy: 92, width: 128, height: 37, alpha: 0.58, kind: "danger", service: "rot-safe shelter rib", glyph: "!", tint: "rgba(63, 21, 88, 0.62)", tintAlpha: 0.22 },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 8064, dy: 42, width: 38, height: 43, alpha: 0.72, kind: "travel", service: "shelter recall lamp", glyph: "T" },
  { anchorId: "obsidian-sanctum", image: "worldVoidBoulder3", visualId: "obsidian-sanctum", dx: 8320, dy: 42, width: 82, height: 58, alpha: 0.7, kind: "danger", service: "rift shoulder debris", glyph: "!", tint: "rgba(58, 18, 86, 0.5)", tintAlpha: 0.18 },
  { anchorId: "obsidian-sanctum", image: "worldVoidMagicCircle", visualId: "obsidian-sanctum", dx: 9216, dy: 96, width: 54, height: 54, alpha: 0.72, kind: "travel", service: "broken portal scar", glyph: "V" },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 10240, dy: 64, width: 44, height: 50, alpha: 0.82, kind: "travel", service: "second rift waymark", glyph: "T" },
  { anchorId: "obsidian-sanctum", image: "worldVoidBrokenBoat", visualId: "obsidian-sanctum", dx: 10624, dy: 104, width: 86, height: 103, alpha: 0.72, kind: "danger", service: "second failed crossing", glyph: "X", tint: "rgba(64, 19, 88, 0.44)", tintAlpha: 0.18 },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianBoulder", visualId: "obsidian-sanctum", dx: 10880, dy: 22, width: 78, height: 56, alpha: 0.7, kind: "danger", service: "second gravity stone", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidEyePlant", visualId: "obsidian-sanctum", dx: 11776, dy: 106, width: 42, height: 42, alpha: 0.7, kind: "resource", service: "second eye-grove sample", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianBoulder", visualId: "obsidian-sanctum", dx: 12032, dy: 24, width: 80, height: 57, alpha: 0.68, kind: "danger", service: "route-pull gravity cairn", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidMagicCircle", visualId: "obsidian-sanctum", dx: 12672, dy: 88, width: 50, height: 50, alpha: 0.64, kind: "travel", service: "second relay scar", glyph: "V" },
  { anchorId: "obsidian-sanctum", image: "worldVoidDangerSign", visualId: "obsidian-sanctum", dx: 14336, dy: 60, width: 54, height: 54, alpha: 0.78, kind: "danger", service: "third rift warning", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 14592, dy: 112, width: 44, height: 50, alpha: 0.78, kind: "travel", service: "third rift waymark", glyph: "T" },
  { anchorId: "obsidian-sanctum", image: "worldVoidManyEyesPlant", visualId: "obsidian-sanctum", dx: 14848, dy: 50, width: 66, height: 58, alpha: 0.72, kind: "danger", service: "third rift bloom", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidBrokenBoat", visualId: "obsidian-sanctum", dx: 15616, dy: 98, width: 82, height: 98, alpha: 0.66, kind: "danger", service: "third failed crossing", glyph: "X", tint: "rgba(64, 19, 88, 0.44)", tintAlpha: 0.18 },
  { anchorId: "obsidian-sanctum", image: "worldVoidDangerSign", visualId: "obsidian-sanctum", dx: 16000, dy: 28, width: 52, height: 52, alpha: 0.7, kind: "danger", service: "bloom spread warning", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldCrystalViolet1", visualId: "obsidian-sanctum", dx: 16640, dy: 72, width: 52, height: 52, alpha: 0.64, kind: "resource", service: "unstable route sample", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidMagicCircle", visualId: "obsidian-sanctum", dx: 17152, dy: 52, width: 54, height: 54, alpha: 0.66, kind: "travel", service: "late portal scar", glyph: "V" },
  { anchorId: "obsidian-sanctum", image: "worldVoidEyePlant", visualId: "obsidian-sanctum", dx: 17664, dy: 116, width: 42, height: 42, alpha: 0.66, kind: "resource", service: "late eye-grove sample", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidDangerSign", visualId: "obsidian-sanctum", dx: 18432, dy: 62, width: 54, height: 54, alpha: 0.72, kind: "danger", service: "last rift warning", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidBoulder3", visualId: "obsidian-sanctum", dx: 18688, dy: 108, width: 86, height: 61, alpha: 0.66, kind: "danger", service: "last rift debris", glyph: "!", tint: "rgba(58, 18, 86, 0.5)", tintAlpha: 0.18 },
  { anchorId: "obsidian-sanctum", image: "worldCrystalViolet1", visualId: "obsidian-sanctum", dx: 18944, dy: 44, width: 56, height: 56, alpha: 0.68, kind: "resource", service: "last rift crystal", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidEyePlant", visualId: "obsidian-sanctum", dx: 12288, dy: 118, width: 44, height: 44, alpha: 0.7, kind: "resource", service: "mid-rift eye growth", glyph: "R" },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianBoulder", visualId: "obsidian-sanctum", dx: 16384, dy: 24, width: 76, height: 54, alpha: 0.66, kind: "danger", service: "late gravity cairn", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 19840, dy: 88, width: 42, height: 48, alpha: 0.62, kind: "travel", service: "last salvage waymark", glyph: "T" },
  { anchorId: "obsidian-sanctum", image: "worldVoidSpikePlant", visualId: "obsidian-sanctum", dx: 20224, dy: 40, width: 56, height: 52, alpha: 0.6, kind: "danger", service: "edge rot bloom", glyph: "!" },

  { anchorId: "deep-fissure", image: "worldCrystalYellow1", visualId: "ironcrag", dx: -44, dy: -28, width: 52, height: 52, kind: "resource", glyph: "G" },
  { anchorId: "deep-fissure", image: "worldGuildCracks", visualId: "ironcrag", dx: -82, dy: 4, width: 164, height: 129, alpha: 0.45, kind: "danger", service: "fissure mouth", glyph: "!" },
  { anchorId: "deep-fissure", image: "worldGuildInteriorObjects", visualId: "ironcrag", dx: 86, dy: -46, width: 82, height: 82, kind: "craft", service: "field forge", glyph: "F" },
  { anchorId: "deep-fissure", image: "worldCrystalYellow1", visualId: "ironcrag", dx: -132, dy: -54, width: 34, height: 34, kind: "archive", service: "geologist marker", glyph: "M" },
  { anchorId: "deep-fissure", image: "worldGuildFire", visualId: "ironcrag", dx: -44, dy: -70, width: 96, height: 12, alpha: 0.9, kind: "danger", service: "open heat seam", glyph: "!", platform: "none" },
  { anchorId: "deep-fissure", image: "worldGuildWindowsDoors", visualId: "ironcrag", dx: 126, dy: 34, width: 62, height: 62, alpha: 0.8, kind: "travel", service: "sealed shaft", glyph: "T" },
  { anchorId: "deep-fissure", image: "worldDungeonCaveGates", visualId: "ironcrag", dx: -186, dy: 38, width: 76, height: 76, alpha: 0.9, kind: "danger", service: "heated gate", glyph: "G" },

  { anchorId: "overgrown-thicket", image: "worldForestWolfIdol", visualId: "oakhaven", dx: -44, dy: -42, width: 70, height: 70, kind: "danger", glyph: "!" },
  { anchorId: "overgrown-thicket", image: "worldForestLuminousTree", visualId: "oakhaven", dx: 28, dy: -70, width: 82, height: 82, kind: "shrine", service: "corruption line", glyph: "N" },
  { anchorId: "overgrown-thicket", image: "worldForestRedMushroom", visualId: "oakhaven", dx: -120, dy: 36, width: 34, height: 34, kind: "resource", service: "spore edge", glyph: "S" },
  { anchorId: "overgrown-thicket", image: "worldForestLivingGazebo", visualId: "oakhaven", dx: 1680, dy: 28, width: 54, height: 54, kind: "travel", service: "east scout blind", glyph: "R" },
  { anchorId: "overgrown-thicket", image: "worldForestDragonIdol", visualId: "oakhaven", dx: -142, dy: -74, width: 66, height: 66, alpha: 0.88, kind: "danger", service: "predator idol", glyph: "!" },
  { anchorId: "overgrown-thicket", image: "worldForestSwirlingTree", visualId: "oakhaven", dx: 132, dy: -44, width: 58, height: 58, alpha: 0.9, kind: "wild", service: "thorn wall", glyph: "T" },
  { anchorId: "overgrown-thicket", image: "worldVillageFence", visualId: "oakhaven", dx: 1960, dy: 84, width: 116, height: 87, alpha: 0.74, kind: "danger", service: "east safe-road fence", glyph: "!" },
  { anchorId: "overgrown-thicket", image: "worldVillageWell", visualId: "oakhaven", dx: 2240, dy: 52, width: 48, height: 48, alpha: 0.78, kind: "resource", service: "rootway watering hole", glyph: "W" },
  { anchorId: "overgrown-thicket", image: "worldForestLivingGazebo", visualId: "oakhaven", dx: 5632, dy: 36, width: 54, height: 54, alpha: 0.72, kind: "travel", service: "rootway forager hut", glyph: "R" },
  { anchorId: "overgrown-thicket", image: "worldForestRedMushroom", visualId: "oakhaven", dx: 5888, dy: 82, width: 34, height: 34, alpha: 0.76, kind: "resource", service: "shared forage pocket", glyph: "F" },
  { anchorId: "overgrown-thicket", image: "worldForestWolfIdol", visualId: "oakhaven", dx: 6144, dy: -36, width: 54, height: 54, alpha: 0.74, kind: "danger", service: "wolf trail warning", glyph: "!" },

  { anchorId: "overgrown-thicket", image: "worldCampWolfDen", visualId: "oakhaven", dx: 2304, dy: 128, width: 92, height: 69, alpha: 0.9, kind: "camp", service: "wolf den camp", glyph: "!" },
  { anchorId: "ashwood-glade", image: "worldCampLogBarricade", visualId: "ashwood-glade", dx: 1792, dy: 128, width: 118, height: 79, alpha: 0.88, kind: "camp", service: "bramble ambush camp", glyph: "!" },
  { anchorId: "ironcrag", image: "worldCampCraterStones", visualId: "ironcrag", dx: 2432, dy: -256, width: 76, height: 76, alpha: 0.9, kind: "camp", service: "sapper crater camp", glyph: "!" },
  { anchorId: "port-marrow", image: "worldCampStumpCache", visualId: "port-marrow", dx: -1728, dy: -128, width: 96, height: 84, alpha: 0.88, kind: "camp", service: "cove rat cache", glyph: "!" },
  { anchorId: "aetheria", image: "worldCampGrayBoulder", visualId: "aetheria", dx: 2048, dy: 640, width: 74, height: 74, alpha: 0.86, kind: "camp", service: "sentinel drill camp", glyph: "!" },
  { anchorId: "port-marrow", image: "worldPortCargoDetail", visualId: "port-marrow", dx: 960, dy: -1600, width: 82, height: 68, alpha: 0.86, kind: "camp", service: "contraband wreck camp", glyph: "!" },
  { anchorId: "aetheria", image: "worldHolyDragonBody", visualId: "aetheria", dx: 1152, dy: -1152, width: 104, height: 69, alpha: 0.82, kind: "camp", service: "crusader relic camp", glyph: "!" },
  { anchorId: "high-reach-peaks", image: "worldCampScarecrowWatch", visualId: "high-reach-peaks", dx: 2048, dy: -320, width: 76, height: 115, alpha: 0.84, kind: "camp", service: "eagle roost watch", glyph: "!" },
  { anchorId: "sunken-bazaar", image: "worldVoidSkeleton", visualId: "sunken-bazaar", dx: 1728, dy: -640, width: 92, height: 69, alpha: 0.82, kind: "camp", service: "jackal bone camp", glyph: "!" },
  { anchorId: "void-rift", image: "worldVoidSwampHouse", visualId: "obsidian-sanctum", dx: -2048, dy: 128, width: 92, height: 92, alpha: 0.78, kind: "camp", service: "leech sink camp", glyph: "!" },
  { anchorId: "void-rift", image: "worldVoidDangerSign", visualId: "obsidian-sanctum", dx: -192, dy: 1600, width: 74, height: 74, alpha: 0.82, kind: "camp", service: "warning bivouac camp", glyph: "!" },
  { anchorId: "void-rift", image: "worldVoidLantern", visualId: "obsidian-sanctum", dx: 2176, dy: 1600, width: 56, height: 64, alpha: 0.8, kind: "camp", service: "rift lamp camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianCell", visualId: "obsidian-sanctum", dx: 2944, dy: 224, width: 88, height: 88, alpha: 0.78, kind: "camp", service: "gargoyle gate camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldCrystalViolet1", visualId: "obsidian-sanctum", dx: 4736, dy: 128, width: 74, height: 74, alpha: 0.78, kind: "camp", service: "violet crystal camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidObsidianBoulder", visualId: "obsidian-sanctum", dx: 6144, dy: 64, width: 92, height: 66, alpha: 0.76, kind: "camp", service: "gravity leech camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidRafflesia", visualId: "obsidian-sanctum", dx: 7936, dy: 96, width: 90, height: 72, alpha: 0.74, kind: "camp", service: "rot bloom camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidDragonBones", visualId: "obsidian-sanctum", dx: 9344, dy: 96, width: 118, height: 118, alpha: 0.74, kind: "camp", service: "failed bones camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidCaveEntrance", visualId: "obsidian-sanctum", dx: 12160, dy: 224, width: 94, height: 94, alpha: 0.78, kind: "camp", service: "crawler burrow camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidMagicCircle", visualId: "obsidian-sanctum", dx: 14848, dy: 128, width: 88, height: 88, alpha: 0.7, kind: "camp", service: "amalgam scar camp", glyph: "!" },
  { anchorId: "obsidian-sanctum", image: "worldVoidTreeTower", visualId: "obsidian-sanctum", dx: 16896, dy: -64, width: 104, height: 128, alpha: 0.72, kind: "camp", service: "oracle tower camp", glyph: "!" }
];

export const worldBiomeProps: Partial<Record<FactionVisualId, readonly BiomeProp[]>> = {
  oakhaven: [
    { image: "worldForestRedMushroom", width: 22, height: 22, y: 8, every: 29 },
    { image: "worldForestMossTree", width: 34, height: 34, y: -5, every: 53, alpha: 0.78 },
    { image: "worldForestLuminousTree", width: 44, height: 44, y: -8, every: 89 },
    { image: "worldForestSwirlingTree", width: 34, height: 34, y: -5, every: 113, alpha: 0.82 },
    { image: "worldForestDeerIdol", width: 28, height: 28, y: 1, every: 149, alpha: 0.78 }
  ],
  "ashwood-glade": [
    { image: "worldForestRedMushroom", width: 26, height: 26, y: 7, every: 31 },
    { image: "worldForestBurnedTree", width: 34, height: 34, y: -4, every: 67, alpha: 0.75 },
    { image: "worldForestWolfIdol", width: 34, height: 34, y: 0, every: 89 },
    { image: "worldForestDragonIdol", width: 38, height: 38, y: -2, every: 127, alpha: 0.78 },
    { image: "worldForestEntMan", width: 36, height: 36, y: -4, every: 151, alpha: 0.78 }
  ],
  ironcrag: [
    { image: "worldCrystalYellow1", width: 24, height: 24, y: 3, every: 31 },
    { image: "worldGuildCracks", width: 52, height: 42, y: -5, every: 67, alpha: 0.35 },
    { image: "worldGuildFire", width: 46, height: 6, y: 5, every: 107, alpha: 0.72 },
    { image: "worldCragRockyCave", width: 32, height: 32, y: -1, every: 139, alpha: 0.62 },
    { image: "worldGuildFlags", width: 12, height: 68, y: -24, every: 163, alpha: 0.64 }
  ],
  aetheria: [
    { image: "worldCrystalBlue1", width: 22, height: 22, y: 3, every: 47 },
    { image: "worldHolyStatues", width: 52, height: 12, y: 8, every: 73, alpha: 0.75 },
    { image: "worldHolyCandelabra", width: 34, height: 12, y: 5, every: 109, alpha: 0.72 },
    { image: "worldRuinsWhite3", width: 28, height: 28, y: -2, every: 127, alpha: 0.76 }
  ],
  "port-marrow": [
    { image: "worldPortCargoDetail", width: 26, height: 22, y: 5, every: 43, alpha: 0.88 },
    { image: "worldPortTower", width: 30, height: 15, y: 6, every: 61 },
    { image: "worldPortWaterTiles", width: 30, height: 56, y: -10, every: 83, alpha: 0.45 },
    { image: "worldPortCraneTower", width: 32, height: 16, y: 0, every: 137, alpha: 0.74 }
  ],
  "sunken-bazaar": [
    { image: "worldRuinsSand1", width: 28, height: 28, y: 1, every: 37 },
    { image: "worldDesertPalm", width: 24, height: 44, y: -9, every: 47 },
    { image: "worldDesertNewPalm", width: 24, height: 24, y: 0, every: 71, alpha: 0.75 },
    { image: "worldCrystalYellow1", width: 22, height: 22, y: 4, every: 73 },
    { image: "worldDesertCactusCluster", width: 26, height: 24, y: 2, every: 97, alpha: 0.82 },
    { image: "worldRuinsYellow5", width: 22, height: 22, y: 5, every: 131, alpha: 0.78 }
  ],
  "obsidian-sanctum": [
    { image: "worldCrystalViolet1", width: 20, height: 20, y: 4, every: 17, alpha: 0.76 },
    { image: "worldVoidEyePlant", width: 21, height: 21, y: 5, every: 23, alpha: 0.62 },
    { image: "worldVoidLantern", width: 18, height: 21, y: 3, every: 29, alpha: 0.66 },
    { image: "worldVoidSpikePlant", width: 24, height: 23, y: 5, every: 37, alpha: 0.64 },
    { image: "worldVoidJawsPlant", width: 25, height: 24, y: 4, every: 43, alpha: 0.62 },
    { image: "worldVoidManyEyesPlant", width: 24, height: 24, y: 4, every: 47, alpha: 0.6 },
    { image: "worldVoidMagicCircle", width: 30, height: 30, y: 0, every: 53, alpha: 0.42 },
    { image: "worldVoidDangerSign", width: 22, height: 22, y: 4, every: 61, alpha: 0.58 },
    { image: "worldVoidDragonBones", width: 34, height: 34, y: -2, every: 71, alpha: 0.36 },
    { image: "worldVoidBoulder3", width: 30, height: 21, y: 4, every: 79, alpha: 0.54 }
  ],
  "high-reach-peaks": [
    { image: "worldCrystalBlue1", width: 24, height: 24, y: 3, every: 31 },
    { image: "worldRuinsBlueGray1", width: 30, height: 34, y: -4, every: 61 },
    { image: "worldRuinsWhite3", width: 28, height: 28, y: -3, every: 97, alpha: 0.82 },
    { image: "worldForestWhiteTree", width: 30, height: 30, y: -4, every: 139, alpha: 0.7 }
  ]
};

export function worldLandmarkId(landmark: Pick<WorldLandmarkPlacement, "anchorId" | "image" | "dx" | "dy" | "service" | "glyph">) {
  return [
    landmark.anchorId,
    landmark.service ?? landmark.image,
    landmark.glyph ?? "mark",
    Math.round(landmark.dx),
    Math.round(landmark.dy)
  ].join(":");
}
