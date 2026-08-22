import { resolveSpriteSheetFrame } from "@hyperfocus/engine/render";

export type SpriteSheetMeta = {
  frameWidth: number;
  frameHeight: number;
  row: number;
  frames?: number;
  frameMs?: number;
  cropWidth?: number;
  cropHeight?: number;
  cropOffsetX?: number;
  cropOffsetY?: number;
};

export type SpriteSheetFrame = { sx: number; sy: number; sw: number; sh: number; frame: number; frames: number };

const FRONT_IDLE_SHEET: SpriteSheetMeta = { frameWidth: 480, frameHeight: 480, row: 0, frameMs: 150 };
const WIDE_BOSS_FRONT_IDLE_SHEET: SpriteSheetMeta = { frameWidth: 840, frameHeight: 480, row: 0, frameMs: 150, cropWidth: 480, cropHeight: 480 };

export function spriteSheetMetaForSize(width: number, height: number): SpriteSheetMeta | undefined {
  if (width === 3360 && height === 2880) return WIDE_BOSS_FRONT_IDLE_SHEET;
  if (width % FRONT_IDLE_SHEET.frameWidth === 0 && height % FRONT_IDLE_SHEET.frameHeight === 0) return FRONT_IDLE_SHEET;
  return undefined;
}

export function spriteSheetMeta(image: HTMLImageElement | null | undefined): SpriteSheetMeta | undefined {
  if (!image) return undefined;
  return spriteSheetMetaForSize(image.width, image.height);
}

export function spriteSheetFrame(image: HTMLImageElement | null | undefined, timeMs: number, meta = spriteSheetMeta(image)): SpriteSheetFrame | undefined {
  if (!image || !meta) return undefined;
  return resolveSpriteSheetFrame({
    width: image.width,
    height: image.height,
    timeMs,
    ...meta
  });
}
