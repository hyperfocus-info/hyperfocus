import {
  buildMmoSkillDemoRegionTiles,
  mmoSkillDemoRegionConfig,
  mmoSkillDemoTileIds
} from "../data/world.ts";

export const TILE = mmoSkillDemoRegionConfig.tileSize;
export const MAP_WIDTH = mmoSkillDemoRegionConfig.chunkGrid.chunksWide * mmoSkillDemoRegionConfig.chunkGrid.chunkWidth;
export const MAP_HEIGHT = mmoSkillDemoRegionConfig.chunkGrid.chunksHigh * mmoSkillDemoRegionConfig.chunkGrid.chunkHeight;

export const TILE_GRASS = mmoSkillDemoTileIds.grass;
export const TILE_PATH = mmoSkillDemoTileIds.path;
export const TILE_WATER = mmoSkillDemoTileIds.water;
export const TILE_TREE = mmoSkillDemoTileIds.tree;
export const TILE_ORE = mmoSkillDemoTileIds.ore;
export const TILE_ROCK = mmoSkillDemoTileIds.rock;
export const TILE_BANK = mmoSkillDemoTileIds.bank;

export function buildTiles() {
  return buildMmoSkillDemoRegionTiles().map((tile) => tile ?? TILE_WATER);
}
